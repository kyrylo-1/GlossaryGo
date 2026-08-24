import { afterEach, describe, expect, test } from "vitest";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GlossaryError, loadGlossary } from "./glossary";

const temporaryDirectories: string[] = [];

const createTemporaryPath = async (filename: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "glossarygo-"));
  temporaryDirectories.push(directory);
  return join(directory, filename);
};

const writeGlossary = async (contents: string | Uint8Array, filename = "glossary.yaml"): Promise<string> => {
  const path = await createTemporaryPath(filename);
  await writeFile(path, contents);
  return path;
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("loadGlossary file selection", () => {
  test("loads a valid glossary without changing definition content", async () => {
    const path = await writeGlossary(`
# Product language
terms:
  - term: API
    definition: "Application Programming Interface"
  - term: ADR
    definition: |
      A short record of an architectural decision
      and the reasons behind it.
`);

    await expect(loadGlossary(path)).resolves.toEqual([
      { definition: "Application Programming Interface", term: "API" },
      {
        definition: "A short record of an architectural decision\nand the reasons behind it.\n",
        term: "ADR",
      },
    ]);
  });

  test("rejects files that do not use the .yaml extension", async () => {
    const path = await writeGlossary("terms: []\n", "glossary.yml");

    await expect(loadGlossary(path)).rejects.toEqual(
      new GlossaryError("invalid-extension", "Choose a file with the .yaml extension."),
    );
  });
});

describe("loadGlossary file access", () => {
  test("reports a safe error when the glossary file is missing", async () => {
    const path = await createTemporaryPath("missing.yaml");

    await expect(loadGlossary(path)).rejects.toEqual(
      new GlossaryError(
        "unreadable",
        "The glossary file could not be read. Check that it still exists and is accessible.",
      ),
    );
  });

  test("reports a safe error when the selected path is not a readable file", async () => {
    const path = await createTemporaryPath("directory.yaml");
    await mkdir(path);

    await expect(loadGlossary(path)).rejects.toEqual(
      new GlossaryError(
        "unreadable",
        "The glossary file could not be read. Check that it still exists and is accessible.",
      ),
    );
  });

  test.skipIf(process.platform === "win32")("reports a safe error for an unreadable regular file", async () => {
    const path = await writeGlossary("terms: []\n");
    await chmod(path, 0o000);

    await expect(loadGlossary(path)).rejects.toEqual(
      new GlossaryError(
        "unreadable",
        "The glossary file could not be read. Check that it still exists and is accessible.",
      ),
    );
  });
});

describe("loadGlossary decoding and parsing", () => {
  test("rejects bytes that are not valid UTF-8", async () => {
    const path = await writeGlossary(new Uint8Array([0x74, 0x65, 0x72, 0x6d, 0x73, 0x3a, 0x20, 0xff]));

    await expect(loadGlossary(path)).rejects.toEqual(
      new GlossaryError("invalid-encoding", "The glossary file must use valid UTF-8."),
    );
  });

  test("accepts a 5 MiB file and rejects a larger file", async () => {
    const maximumBytes = 5 * 1024 * 1024;
    const prefix = "terms: []\n#";
    const exactPath = await writeGlossary(prefix + "x".repeat(maximumBytes - Buffer.byteLength(prefix)), "exact.yaml");
    const tooLargePath = await writeGlossary(
      prefix + "x".repeat(maximumBytes - Buffer.byteLength(prefix) + 1),
      "large.yaml",
    );

    await expect(loadGlossary(exactPath)).resolves.toEqual([]);
    await expect(loadGlossary(tooLargePath)).rejects.toEqual(
      new GlossaryError("too-large", "The glossary file is larger than 5 MiB."),
    );
  });

  test("reports malformed YAML safely with a source line", async () => {
    const path = await writeGlossary("terms: [}\n");

    await expect(loadGlossary(path)).rejects.toEqual(
      new GlossaryError("invalid-yaml", "The glossary contains invalid YAML near line 1.", 1),
    );
  });

  test("rejects streams with more than one YAML document", async () => {
    const path = await writeGlossary("terms: []\n---\nterms: []\n");

    await expect(loadGlossary(path)).rejects.toEqual(
      new GlossaryError("multiple-documents", "The glossary must contain exactly one YAML document near line 2.", 2),
    );
  });
});

describe("loadGlossary unsupported YAML", () => {
  test.each([
    ["an explicit YAML directive", "%YAML 1.2\n---\nterms: []\n"],
    ["a tag directive", "%TAG !e! tag:example.com,2026:\n---\nterms: []\n"],
    ["an unknown directive", "%FOO bar\n---\nterms: []\n"],
  ])("rejects %s", async (_label, source) => {
    const path = await writeGlossary(source);

    await expect(loadGlossary(path)).rejects.toEqual(
      new GlossaryError("unsupported-yaml", "The glossary uses an unsupported YAML construct near line 1.", 1),
    );
  });

  test.each([
    ["an anchor", "terms: &terms []\n", 1],
    ["an alias", "terms: *missing\n", 1],
    ["an anchor with an alias", "terms:\n  - &shared { term: API, definition: Interface }\n  - *shared\n", 2],
    ["a merge key", "terms:\n  - <<: { term: API }\n    definition: Interface\n", 2],
    ["an explicit tag", "terms: !!seq []\n", 1],
    ["a custom tag", "terms: !glossary []\n", 1],
  ])("rejects %s as an unsupported YAML construct", async (_label, source, line) => {
    const path = await writeGlossary(source);

    await expect(loadGlossary(path)).rejects.toEqual(
      new GlossaryError("unsupported-yaml", `The glossary uses an unsupported YAML construct near line ${line}.`, line),
    );
  });
});

describe("loadGlossary root schema", () => {
  test("reports an unknown root field even when it precedes terms", async () => {
    const path = await writeGlossary("version: 1\nterms: []\n");

    await expect(loadGlossary(path)).rejects.toEqual(
      new GlossaryError("invalid-schema", "The glossary root must contain exactly one terms sequence near line 1.", 1),
    );
  });

  test.each([
    ["a sequence root", "- API\n", 1],
    ["a missing terms field", "version: 1\n", 1],
    ["an extra root field", "terms: []\nversion: 1\n", 2],
    ["a non-sequence terms value", "terms: {}\n", 1],
  ])("rejects %s", async (_label, source, line) => {
    const path = await writeGlossary(source);

    await expect(loadGlossary(path)).rejects.toEqual(
      new GlossaryError(
        "invalid-schema",
        `The glossary root must contain exactly one terms sequence near line ${line}.`,
        line,
      ),
    );
  });
});

describe("loadGlossary entry fields", () => {
  test("reports an unknown entry field even when it precedes required fields", async () => {
    const path = await writeGlossary("terms:\n  - category: Technical\n    term: API\n    definition: Interface\n");

    await expect(loadGlossary(path)).rejects.toEqual(
      new GlossaryError(
        "invalid-schema",
        "Entry 1 must contain exactly the term and definition fields near line 2.",
        2,
      ),
    );
  });

  test.each([
    ["a non-mapping entry", "terms:\n  - API\n", 1, 2],
    ["a missing entry field", "terms:\n  - term: API\n", 1, 2],
    ["an extra entry field", "terms:\n  - term: API\n    definition: Interface\n    category: Technical\n", 1, 4],
  ])("rejects %s", async (_label, source, entryNumber, line) => {
    const path = await writeGlossary(source);

    await expect(loadGlossary(path)).rejects.toEqual(
      new GlossaryError(
        "invalid-schema",
        `Entry ${entryNumber} must contain exactly the term and definition fields near line ${line}.`,
        line,
      ),
    );
  });
});

describe("loadGlossary entry values", () => {
  test.each([
    ["a numeric term", "42"],
    ["a null term", ""],
    ["an empty term", '""'],
    ["a whitespace-padded term", '" API "'],
  ])("rejects %s", async (_label, value) => {
    const path = await writeGlossary(`terms:\n  - term: ${value}\n    definition: Interface\n`);

    await expect(loadGlossary(path)).rejects.toEqual(
      new GlossaryError(
        "invalid-schema",
        "Entry 1 term must be a non-empty string without surrounding whitespace near line 2.",
        2,
      ),
    );
  });

  test.each([
    ["a numeric definition", "42"],
    ["a null definition", ""],
    ["an empty definition", '""'],
  ])("rejects %s", async (_label, value) => {
    const path = await writeGlossary(`terms:\n  - term: API\n    definition: ${value}\n`);

    await expect(loadGlossary(path)).rejects.toEqual(
      new GlossaryError("invalid-schema", "Entry 1 definition must be a non-empty string near line 3.", 3),
    );
  });
});

describe("loadGlossary valid terms", () => {
  test("accepts reordered fields and folded multiline definitions", async () => {
    const path = await writeGlossary(`
terms:
  - definition: >-
      Application Programming
      Interface
    term: API
`);

    await expect(loadGlossary(path)).resolves.toEqual([
      { definition: "Application Programming Interface", term: "API" },
    ]);
  });

  test("loads an empty glossary", async () => {
    const path = await writeGlossary("terms: []\n");

    await expect(loadGlossary(path)).resolves.toEqual([]);
  });

  test("loads a glossary with several thousand entries", async () => {
    const source = `terms:\n${Array.from(
      { length: 3_000 },
      (_, index) => `  - term: Term ${String(index).padStart(4, "0")}\n    definition: Definition ${index}\n`,
    ).join("")}`;
    const path = await writeGlossary(source);

    const terms = await loadGlossary(path);

    expect(terms).toHaveLength(3_000);
    expect(terms.at(-1)).toEqual({ definition: "Definition 2999", term: "Term 2999" });
  });
});

describe("loadGlossary duplicate and safe errors", () => {
  test.each([
    ["case-insensitive", "API", "api"],
    ["canonically equivalent", "éclair", "e\u0301clair"],
    ["Unicode case-equivalent", "ΟΣ", "οσ"],
  ])("rejects %s duplicate terms", async (_label, firstTerm, duplicateTerm) => {
    const path = await writeGlossary(`
terms:
  - term: ${firstTerm}
    definition: First
  - term: ${duplicateTerm}
    definition: Second
`);

    await expect(loadGlossary(path)).rejects.toEqual(
      new GlossaryError("duplicate-term", "Entry 2 duplicates another term near line 5.", 5),
    );
  });

  test("never exposes glossary values in a validation error", async () => {
    const secret = "DO_NOT_EXPOSE_THIS_VALUE";
    const path = await writeGlossary(`terms:\n  - term: API\n    definition: Interface\n    ${secret}: ${secret}\n`);

    const error = await loadGlossary(path).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GlossaryError);
    if (!(error instanceof GlossaryError)) {
      throw new TypeError("Expected loadGlossary to reject with GlossaryError");
    }
    expect(error.message).not.toContain(secret);
  });
});
