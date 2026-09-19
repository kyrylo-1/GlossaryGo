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
  test("adds to an empty glossary without changing definition text", () => {
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
      'terms: [{ definition: "Interface", term: "API" }]\n',
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
        { definition: "folded line continues\n", term: "Folded" },
        { definition: "first line\nsecond line\n", term: "Literal" },
      ],
    ],
    ["a document end marker", "terms: []\n...\n", []],
    ["CRLF source", "terms: []\r\n", []],
    ["a source without a final newline", "terms: []", []],
  ])("adds while preserving decoded entries from %s", (_label, source, existingTerms) => {
    const next = applyGlossaryChange(source, { term: { definition: "New definition", term: "New" }, type: "add" });
    expect(parseGlossarySource(next)).toEqual([...existingTerms, { definition: "New definition", term: "New" }]);
  });

  test("sorts the complete previously unsorted sequence with case-insensitive normalized ordinal names", () => {
    const names = ["Ωmega", "Zulu", "cafe\u0301", "Éclair", "beta", "Ångström", "cafe"];
    const source = `terms:\n${names.map((name) => `  - term: ${name}\n    definition: ${name} definition\n`).join("")}`;
    const next = applyGlossaryChange(source, {
      term: { definition: "Alpha definition", term: " Alpha " },
      type: "add",
    });

    expect(parseGlossarySource(next).map(({ term }) => term)).toEqual([
      "Alpha",
      "beta",
      "cafe",
      "cafe\u0301",
      "Zulu",
      "Ångström",
      "Éclair",
      "Ωmega",
    ]);
  });

  test("separates adjacent entries with an empty line after adding", () => {
    const source = "terms:\n  - term: Zulu\n    definition: Last\n  - term: Alpha\n    definition: First\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "Middle", term: "Beta" },
      type: "add",
    });

    expect(next).toBe(
      "terms:\n  - term: Alpha\n    definition: First\n\n  - definition: Middle\n    term: Beta\n\n  - term: Zulu\n    definition: Last\n",
    );
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Middle", term: "Beta" },
      { definition: "Last", term: "Zulu" },
    ]);
  });

  test("preserves a larger entry gap when addition sorting moves it to the first entry", () => {
    const source = "terms:\n  - term: Zulu\n    definition: Last\n\n\n  - term: Alpha\n    definition: First\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "Middle", term: "Beta" },
      type: "add",
    });

    expect(next).toBe(
      "terms:\n  - term: Alpha\n    definition: First\n\n\n  - definition: Middle\n    term: Beta\n\n  - term: Zulu\n    definition: Last\n",
    );
  });

  test("does not accumulate entry gaps across successive mutations", () => {
    const added = applyGlossaryChange("terms:\n  - term: Alpha\n    definition: First\n", {
      term: { definition: "Last", term: "Zulu" },
      type: "add",
    });
    const edited = applyGlossaryChange(added, {
      original: { definition: "Last", term: "Zulu" },
      term: { definition: "Updated last", term: "Zulu" },
      type: "edit",
    });

    expect(edited).toBe(
      "terms:\n  - term: Alpha\n    definition: First\n\n  - definition: Updated last\n    term: Zulu\n",
    );
  });

  test("produces identical saved bytes from different entry orders", () => {
    const firstSource = "terms:\n  - term: Zulu\n    definition: Last\n  - term: Alpha\n    definition: First\n";
    const secondSource = "terms:\n  - term: Alpha\n    definition: First\n  - term: Zulu\n    definition: Last\n";
    const change = { term: { definition: "Middle", term: "beta" }, type: "add" } as const;

    expect(applyGlossaryChange(firstSource, change)).toBe(applyGlossaryChange(secondSource, change));
  });

  test("moves commented and styled YAML entries while preserving exact decoded definitions", () => {
    const source =
      "# Root note\nterms: # Sequence note\n  # Sequence leading note\n  - term: \"Zulu\" # Zulu term\n    definition: |+ # Zulu definition\n      last line\n\n  # Alpha entry\n  - term: 'Alpha' # Alpha term\n    definition: '  first: # []  ' # Alpha definition\n  # Folded entry\n  - term: Folded\n    definition: >-\n      folded line\n      continues\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "  middle\nline\n", term: "beta" },
      type: "add",
    });

    expect(parseGlossarySource(next)).toEqual([
      { definition: "  first: # []  ", term: "Alpha" },
      { definition: "  middle\nline\n", term: "beta" },
      { definition: "folded line continues", term: "Folded" },
      { definition: "last line\n\n", term: "Zulu" },
    ]);
    expect(next).toContain("# Root note");
    expect(next).toContain("# Sequence note");
    expect(next).toContain("# Sequence leading note");
    expect(next).toContain("# Alpha entry\n  - term: 'Alpha' # Alpha term");
    expect(next).toContain("definition: '  first: # []  ' # Alpha definition");
    expect(next).toContain("# Folded entry\n  - term: Folded\n    definition: >-");
    expect(next).toContain('term: "Zulu" # Zulu term\n    definition: |+ # Zulu definition');
  });

  test("retains root and sequence comments when adding", () => {
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

  test("normalizes surrounding submitted term whitespace before adding", () => {
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

  test("does not tighten existing whitespace-only definition validation while adding", () => {
    const source = 'terms:\n  - term: Existing\n    definition: "   "\n';
    const next = applyGlossaryChange(source, { term: { definition: "New definition", term: "New" }, type: "add" });

    expect(parseGlossarySource(next)).toEqual([
      { definition: "   ", term: "Existing" },
      { definition: "New definition", term: "New" },
    ]);
  });

  test.each([
    ["API", "api"],
    ["café", "cafe\u0301"],
    ["API", "API"],
  ])("allows independent additions named %s and %s", (existing, submitted) => {
    const source = `terms:\n  - term: ${existing}\n    definition: Existing\n`;
    const next = applyGlossaryChange(source, { term: { definition: "Existing", term: submitted }, type: "add" });
    expect(parseGlossarySource(next)).toHaveLength(2);
  });

  test("allows accent-distinct terms when adding", () => {
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
  test("separates adjacent entries with an empty line after editing", () => {
    const source = "terms:\n  - term: API\n    definition: Old\n  - term: HTTP\n    definition: Protocol\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Old", term: "API" },
      term: { definition: "Updated", term: "API" },
      type: "edit",
    });

    expect(next).toBe("terms:\n  - term: API\n    definition: Updated\n\n  - term: HTTP\n    definition: Protocol\n");
    expect(parseGlossarySource(next)).toEqual([
      { definition: "Updated", term: "API" },
      { definition: "Protocol", term: "HTTP" },
    ]);
  });

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

  test("preserves larger entry spacing, comments, and blank lines inside multiline definitions", () => {
    const source =
      "# Root note\nterms:\n  - term: API\n    definition: |-\n      first line\n\n      third line\n\n\n  # HTTP entry\n  - term: HTTP\n    definition: Protocol\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "first line\n\nthird line", term: "API" },
      term: { definition: "first line\n\nthird line", term: "Application API" },
      type: "edit",
    });

    expect(next).toBe(source.replace("term: API", "term: Application API"));
    expect(parseGlossarySource(next)).toEqual([
      { definition: "first line\n\nthird line", term: "Application API" },
      { definition: "Protocol", term: "HTTP" },
    ]);
  });

  test("allows renaming an entry to another entry's equivalent name", () => {
    const source = "terms:\n  - term: API\n    definition: Interface\n  - term: HTTP\n    definition: Protocol\n";
    const next = applyGlossaryChange(source, {
      original: parseGlossarySource(source)[0],
      term: { definition: "Updated", term: "http" },
      type: "edit",
    });
    expect(parseGlossarySource(next)).toEqual([
      { definition: "Updated", term: "http" },
      { definition: "Protocol", term: "HTTP" },
    ]);
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

  test("deleting from an unsorted sequence preserves the surviving order", () => {
    const source =
      "terms:\n  - term: Zulu\n    definition: Last\n  - term: Remove\n    definition: Removed\n  - term: Alpha\n    definition: First\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });

    expect(parseGlossarySource(next)).toEqual([
      { definition: "Last", term: "Zulu" },
      { definition: "First", term: "Alpha" },
    ]);
  });

  test("separates adjacent surviving entries with an empty line after deleting", () => {
    const source =
      "terms:\n  - term: Alpha\n    definition: First\n  - term: Remove\n    definition: Removed\n  - term: Zulu\n    definition: Last\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });

    expect(next).toBe("terms:\n  - term: Alpha\n    definition: First\n\n  - term: Zulu\n    definition: Last\n");
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Last", term: "Zulu" },
    ]);
  });

  test("preserves a larger entry gap when deleting the entry after it", () => {
    const source =
      "terms:\n  - term: Alpha\n    definition: First\n\n\n  - term: Remove\n    definition: Removed\n  - term: Zulu\n    definition: Last\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });

    expect(next).toBe("terms:\n  - term: Alpha\n    definition: First\n\n\n  - term: Zulu\n    definition: Last\n");
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

const duplicateSource =
  "terms:\n  - term: API # first\n    definition: Same\n  - term: API # second\n    definition: Same\n";

describe("captured duplicate entry identity", () => {
  test("edits and deletes only the selected identical sibling", () => {
    const selected = parseGlossarySource(duplicateSource)[1];
    const edited = applyGlossaryChange(duplicateSource, {
      original: selected,
      term: { definition: "Second updated", term: "API" },
      type: "edit",
    });
    expect(parseGlossarySource(edited)).toEqual([
      { definition: "Same", term: "API" },
      { definition: "Second updated", term: "API" },
    ]);
    expect(edited).toContain("# first");
    expect(edited).toContain("# second");
    const deleted = applyGlossaryChange(duplicateSource, { original: selected, type: "delete" });
    expect(parseGlossarySource(deleted)).toEqual([{ definition: "Same", term: "API" }]);
    expect(deleted).toContain("# first");
    expect(deleted).not.toContain("# second");
  });

  test.each(["# external comment\n", "terms: []\n"])(
    "refuses a captured duplicate after a source change: %s",
    (replacement) => {
      const selected = parseGlossarySource(duplicateSource)[1];
      const changed = replacement.startsWith("#") ? replacement + duplicateSource : replacement;
      expect(() => applyGlossaryChange(changed, { original: selected, type: "delete" })).toThrowError(
        expect.objectContaining({ code: "stale-term" }),
      );
    },
  );

  test("refuses ambiguous selection without captured source identity", () => {
    expect(() =>
      applyGlossaryChange(duplicateSource, { original: { definition: "Same", term: "API" }, type: "delete" }),
    ).toThrowError(expect.objectContaining({ code: "stale-term" }));
  });
});

test("refuses captured selection after insertion, reordering, or add sorting changes positions", () => {
  const source =
    "terms:\n  - term: Zulu\n    definition: Last\n  - term: API # first\n    definition: Same\n  - term: API # second\n    definition: Same\n";
  const selected = parseGlossarySource(source)[2];
  const shifted = source.replace("terms:\n", "terms:\n  - term: AAA\n    definition: Inserted\n");
  const reordered = source
    .replace("# first", "# placeholder")
    .replace("# second", "# first")
    .replace("# placeholder", "# second");
  const sorted = applyGlossaryChange(source, { term: { definition: "New", term: "BBB" }, type: "add" });
  for (const changed of [shifted, reordered, sorted]) {
    expect(() => applyGlossaryChange(changed, { original: selected, type: "delete" })).toThrowError(
      expect.objectContaining({ code: "stale-term" }),
    );
    expect(() =>
      applyGlossaryChange(changed, { original: selected, term: { definition: "Updated", term: "API" }, type: "edit" }),
    ).toThrowError(expect.objectContaining({ code: "stale-term" }));
  }
});

test("keeps same-name ties in their original order during deterministic add sorting", () => {
  const source =
    "terms:\n  - term: Zulu\n    definition: Last\n  - term: API # first\n    definition: First\n  - term: API # second\n    definition: Second\n";
  const next = applyGlossaryChange(source, { term: { definition: "Third", term: "API" }, type: "add" });
  expect(parseGlossarySource(next).map(({ definition }) => definition)).toEqual(["First", "Second", "Third", "Last"]);
  expect(next.indexOf("# first")).toBeLessThan(next.indexOf("# second"));
});
