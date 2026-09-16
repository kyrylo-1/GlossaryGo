import { describe, expect, test } from "vitest";

import { MAXIMUM_GLOSSARY_BYTES } from "../constants";
import { applyGlossaryChange } from "./apply-glossary-change";
import { parseGlossarySource, type GlossaryError } from "./glossary";

const expectGlossaryError = (action: () => unknown, code: GlossaryError["code"]): void => {
  expect(action).toThrowError(expect.objectContaining({ code }));
};

// This group covers independent add mutations in one source-validation flow.
// eslint-disable-next-line max-lines-per-function
describe("applyGlossaryChange additions", () => {
  test("appends to an empty glossary without changing definition text", () => {
    const term = { definition: "  first line\nsecond line\n", term: "API" };
    const next = applyGlossaryChange("# My glossary\nterms: []\n", { term, type: "add" });
    expect(parseGlossarySource(next)).toEqual([term]);
    expect(next).toContain("# My glossary");
  });

  test.each([
    [
      "a block sequence",
      "terms:\n  - term: API\n    definition: Interface\n",
      [{ definition: "Interface", term: "API" }],
    ],
    [
      "a flow sequence",
      'terms: [{ term: "API", definition: "Interface" }]\n',
      [{ definition: "Interface", term: "API" }],
    ],
    [
      "quoted punctuation resembling YAML",
      'terms:\n  - term: "A: # []"\n    definition: "value: # []"\n',
      [{ definition: "value: # []", term: "A: # []" }],
    ],
    [
      "literal and folded definitions",
      "terms:\n  - term: Literal\n    definition: |\n      first line\n      second line\n  - term: Folded\n    definition: >\n      folded line\n      continues\n",
      [
        { definition: "first line\nsecond line\n", term: "Literal" },
        { definition: "folded line continues\n", term: "Folded" },
      ],
    ],
    ["a document end marker", "terms: []\n...\n", []],
    ["CRLF source", "terms: []\r\n", []],
    ["a source without a final newline", "terms: []", []],
  ])("adds while preserving decoded entries from %s", (_label, source, existingTerms) => {
    const next = applyGlossaryChange(source, { term: { definition: "New definition", term: "New" }, type: "add" });
    expect(parseGlossarySource(next)).toEqual([...existingTerms, { definition: "New definition", term: "New" }]);
  });

  test("retains root and sequence comments when appending", () => {
    const source =
      "# Root note\nterms: # Sequence note\n  # Existing entry note\n  - term: API # Term note\n    definition: Interface # Definition note\n";
    const next = applyGlossaryChange(source, { term: { definition: "Hypertext", term: "HTML" }, type: "add" });

    expect(parseGlossarySource(next)).toEqual([
      { definition: "Interface", term: "API" },
      { definition: "Hypertext", term: "HTML" },
    ]);
    expect(next).toContain("# Root note");
    expect(next).toContain("# Sequence note");
    expect(next).toContain("# Existing entry note");
    expect(next).toContain("# Term note");
    expect(next).toContain("# Definition note");
  });

  test("normalizes surrounding submitted term whitespace before appending", () => {
    const next = applyGlossaryChange("terms: []\n", {
      term: { definition: "Interface", term: "  API  " },
      type: "add",
    });

    expect(parseGlossarySource(next)).toEqual([{ definition: "Interface", term: "API" }]);
  });

  // eslint-disable-next-line vitest/expect-expect
  test.each([
    ["an empty submitted term", { definition: "Interface", term: "   " }],
    ["an empty submitted definition", { definition: " \n\t ", term: "API" }],
  ])("rejects %s before adding", (_label, term) => {
    expectGlossaryError(() => applyGlossaryChange("terms: []\n", { term, type: "add" }), "invalid-schema");
  });

  test("does not tighten existing whitespace-only definition validation while appending", () => {
    const source = 'terms:\n  - term: Existing\n    definition: "   "\n';
    const next = applyGlossaryChange(source, { term: { definition: "New definition", term: "New" }, type: "add" });

    expect(parseGlossarySource(next)).toEqual([
      { definition: "   ", term: "Existing" },
      { definition: "New definition", term: "New" },
    ]);
  });

  // eslint-disable-next-line vitest/expect-expect
  test.each([
    ["case-insensitive duplicate", "API", "api"],
    ["canonically equivalent Unicode duplicate", "café", "cafe\u0301"],
  ])("rejects a %s after appending", (_label, existing, submitted) => {
    const source = `terms:\n  - term: ${existing}\n    definition: Existing\n`;
    expectGlossaryError(
      () => applyGlossaryChange(source, { term: { definition: "Replacement", term: submitted }, type: "add" }),
      "duplicate-term",
    );
  });

  test("allows accent-distinct terms when appending", () => {
    const source = "terms:\n  - term: cafe\n    definition: Plain\n";
    const next = applyGlossaryChange(source, { term: { definition: "Accented", term: "café" }, type: "add" });
    expect(parseGlossarySource(next)).toEqual([
      { definition: "Plain", term: "cafe" },
      { definition: "Accented", term: "café" },
    ]);
  });

  test("rejects an empty source term before the add mutation", () => {
    const source = 'terms:\n  - term: ""\n    definition: Present definition\n';

    expect(() =>
      applyGlossaryChange(source, { term: { definition: "New definition", term: "New" }, type: "add" }),
    ).toThrowError(expect.objectContaining({ code: "invalid-schema" }));
  });

  test("rejects an empty source definition before the add mutation", () => {
    const source = 'terms:\n  - term: Present\n    definition: ""\n';

    expect(() =>
      applyGlossaryChange(source, { term: { definition: "New definition", term: "New" }, type: "add" }),
    ).toThrowError(expect.objectContaining({ code: "invalid-schema" }));
  });

  // eslint-disable-next-line vitest/expect-expect
  test.each([
    ["malformed YAML", "terms: [}\n", "invalid-yaml"],
    ["an unsupported anchor", "terms: &terms []\n", "unsupported-yaml"],
  ])("validates %s before attempting an add", (_label, source, code) => {
    expectGlossaryError(
      () => applyGlossaryChange(source, { term: { definition: "Interface", term: "API" }, type: "add" }),
      code as GlossaryError["code"],
    );
  });
});

// This group covers edit and delete mutations against stable parsed entries.
// eslint-disable-next-line max-lines-per-function
describe("applyGlossaryChange edits and deletions", () => {
  test("renames the selected term without treating it as a duplicate of itself", () => {
    const original = { definition: "Old definition", term: "API" };
    const source = "terms:\n  - term: API\n    definition: Old definition\n";
    const term = { definition: "New definition\n", term: "api" };
    expect(parseGlossarySource(applyGlossaryChange(source, { original, term, type: "edit" }))).toEqual([term]);
  });

  test("updates the file-sequence entry rather than a sorted search-result position", () => {
    const source =
      "terms:\n  - term: Zulu\n    definition: First in file\n  - term: Alpha\n    definition: Second in file\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Second in file", term: "Alpha" },
      term: { definition: "Updated second", term: "Alpha" },
      type: "edit",
    });

    expect(parseGlossarySource(next)).toEqual([
      { definition: "First in file", term: "Zulu" },
      { definition: "Updated second", term: "Alpha" },
    ]);
  });

  test("preserves scalar comments and meaningful whitespace while editing scalar values", () => {
    const source =
      "# Root\nterms:\n  - term: API # Term comment\n    definition: Old # Definition comment\n  - term: Keep\n    definition: |\n      trailing newline stays\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Old", term: "API" },
      term: { definition: "  New value\nwith newline\n", term: "HTTP" },
      type: "edit",
    });

    expect(parseGlossarySource(next)).toEqual([
      { definition: "  New value\nwith newline\n", term: "HTTP" },
      { definition: "trailing newline stays\n", term: "Keep" },
    ]);
    expect(next).toContain("# Root");
    expect(next).toContain("# Term comment");
    expect(next).toContain("# Definition comment");
  });

  // eslint-disable-next-line vitest/expect-expect
  test("rejects an edit that renames to another entry's equivalent term", () => {
    const source = "terms:\n  - term: API\n    definition: Interface\n  - term: HTTP\n    definition: Protocol\n";
    expectGlossaryError(
      () =>
        applyGlossaryChange(source, {
          original: { definition: "Interface", term: "API" },
          term: { definition: "Updated", term: "http" },
          type: "edit",
        }),
      "duplicate-term",
    );
  });

  // eslint-disable-next-line vitest/expect-expect
  test.each([
    ["a changed definition", { definition: "Changed elsewhere", term: "API" }],
    ["a changed exact name", { definition: "Interface", term: "api" }],
  ])("rejects an edit from a stale snapshot with %s", (_label, original) => {
    const source = "terms:\n  - term: API\n    definition: Interface\n";
    expectGlossaryError(
      () => applyGlossaryChange(source, { original, term: { definition: "Updated", term: "API" }, type: "edit" }),
      "stale-term",
    );
  });

  // eslint-disable-next-line vitest/expect-expect
  test("rejects an edit when the selected entry was already removed", () => {
    expectGlossaryError(
      () =>
        applyGlossaryChange("terms: []\n", {
          original: { definition: "Interface", term: "API" },
          term: { definition: "Updated", term: "API" },
          type: "edit",
        }),
      "stale-term",
    );
  });

  test("deleting the last term retains an empty glossary and glossary comments", () => {
    const original = { definition: "Example", term: "API" };
    const source = "# Glossary notes\nterms:\n  - term: API\n    definition: Example\n";
    const next = applyGlossaryChange(source, { original, type: "delete" });
    expect(parseGlossarySource(next)).toEqual([]);
    expect(next).toContain("terms: []");
    expect(next).toContain("# Glossary notes");
  });

  test("deleting the last term retains its sequence-owned leading comment", () => {
    const original = { definition: "Example", term: "API" };
    const source = "terms:\n  # Sequence-owned note above only entry\n  - term: API\n    definition: Example\n";
    const next = applyGlossaryChange(source, { original, type: "delete" });

    expect(parseGlossarySource(next)).toEqual([]);
    expect(next).toContain("# Sequence-owned note above only entry");
  });

  test("removes deleted entry comments while retaining root, sequence, and surviving comments", () => {
    const source =
      "# Root\nterms: # Sequence\n  # Sequence-owned note above first entry\n  - term: API # Remove term\n    definition: Interface # Remove definition\n  # Keep this entry\n  - term: HTTP # Keep term\n    definition: Protocol # Keep definition\n";
    const next = applyGlossaryChange(source, { original: { definition: "Interface", term: "API" }, type: "delete" });

    expect(parseGlossarySource(next)).toEqual([{ definition: "Protocol", term: "HTTP" }]);
    expect(next).toContain("# Root");
    expect(next).toContain("# Sequence");
    expect(next).toContain("# Sequence-owned note above first entry");
    expect(next).toContain("# Keep this entry");
    expect(next).toContain("# Keep term");
    expect(next).toContain("# Keep definition");
    expect(next).not.toContain("# Remove term");
    expect(next).not.toContain("# Remove definition");
  });

  // eslint-disable-next-line vitest/expect-expect
  test.each([
    ["a changed definition", { definition: "Changed elsewhere", term: "API" }],
    ["a changed exact name", { definition: "Interface", term: "api" }],
  ])("rejects a delete from a stale snapshot with %s", (_label, original) => {
    const source = "terms:\n  - term: API\n    definition: Interface\n";
    expectGlossaryError(() => applyGlossaryChange(source, { original, type: "delete" }), "stale-term");
  });

  // eslint-disable-next-line vitest/expect-expect
  test("rejects a delete when the selected entry was already removed", () => {
    expectGlossaryError(
      () => applyGlossaryChange("terms: []\n", { original: { definition: "Interface", term: "API" }, type: "delete" }),
      "stale-term",
    );
  });
});

describe("applyGlossaryChange serialized size", () => {
  test("accepts a serialized add exactly at the UTF-8 byte limit", () => {
    const serializedWithoutComment = "# \nterms:\n  - term: x\n    definition: y\n\n";
    const comment = "x".repeat(MAXIMUM_GLOSSARY_BYTES - Buffer.byteLength(serializedWithoutComment, "utf8"));
    const next = applyGlossaryChange(`# ${comment}\nterms: []\n`, {
      term: { definition: "y", term: "x" },
      type: "add",
    });

    expect(Buffer.byteLength(next, "utf8")).toBe(MAXIMUM_GLOSSARY_BYTES);
    expect(parseGlossarySource(next)).toEqual([{ definition: "y", term: "x" }]);
  });

  // eslint-disable-next-line vitest/expect-expect
  test("rejects a multibyte serialized add beyond the UTF-8 byte limit", () => {
    const serializedWithoutComment = "# \nterms:\n  - term: x\n    definition: y\n\n";
    const neededBytes = MAXIMUM_GLOSSARY_BYTES - Buffer.byteLength(serializedWithoutComment, "utf8") + 1;
    const comment = "é".repeat(Math.ceil(neededBytes / Buffer.byteLength("é", "utf8")));

    expectGlossaryError(
      () => applyGlossaryChange(`# ${comment}\nterms: []\n`, { term: { definition: "y", term: "x" }, type: "add" }),
      "too-large",
    );
  });
});
