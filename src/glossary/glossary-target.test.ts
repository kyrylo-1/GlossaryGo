import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { createTemporaryPath, removeTemporaryDirectories, writeGlossary } from "./glossary-test-utils";
import { resolveGlossaryTarget } from "./glossary-target";

afterEach(removeTemporaryDirectories);

describe("resolveGlossaryTarget", () => {
  test("preserves a missing legacy .yaml preference", () => {
    expect(resolveGlossaryTarget("/Users/test/support", "/Users/test/custom.yaml")).toEqual({
      createParent: false,
      path: "/Users/test/custom.yaml",
    });
  });

  test("preserves an existing legacy glossary file preference", async () => {
    const legacyGlossary = await writeGlossary("terms: []\n", "legacy.yaml");

    expect(resolveGlossaryTarget("/Users/test/support", legacyGlossary)).toEqual({
      createParent: false,
      path: legacyGlossary,
    });
  });

  test("uses the extension support directory when no glossary is selected", () => {
    expect(resolveGlossaryTarget("/Users/test/support")).toEqual({
      createParent: true,
      path: "/Users/test/support/glossary.yaml",
    });
  });
});

describe("resolveGlossaryTarget folder locations", () => {
  test("uses glossary.yaml inside the selected glossary folder without creating the file", async () => {
    const glossaryFolder = dirname(await createTemporaryPath("placeholder"));

    expect(resolveGlossaryTarget("/Users/test/support", glossaryFolder)).toEqual({
      createParent: false,
      path: join(glossaryFolder, "glossary.yaml"),
    });
    await expect(stat(join(glossaryFolder, "glossary.yaml"))).rejects.toEqual(
      expect.objectContaining({ code: "ENOENT" }),
    );
  });

  test("uses glossary.yaml inside an existing selected folder whose name ends in .yaml", async () => {
    const glossaryFolder = await createTemporaryPath("archive.yaml");
    await mkdir(glossaryFolder);

    expect(resolveGlossaryTarget("/Users/test/support", glossaryFolder)).toEqual({
      createParent: false,
      path: join(glossaryFolder, "glossary.yaml"),
    });
  });

  test("treats another missing configured path as a glossary folder without creating it", async () => {
    const glossaryFolder = await createTemporaryPath("missing-folder");

    expect(resolveGlossaryTarget("/Users/test/support", glossaryFolder)).toEqual({
      createParent: false,
      path: join(glossaryFolder, "glossary.yaml"),
    });
    await expect(stat(glossaryFolder)).rejects.toEqual(expect.objectContaining({ code: "ENOENT" }));
  });

  test("defers recovery when the configured location is beneath a regular file", async () => {
    const blockingFile = await writeGlossary("blocking bytes", "blocking-file");
    const glossaryFolder = join(blockingFile, "configured-location");

    expect(resolveGlossaryTarget("/Users/test/support", glossaryFolder)).toEqual({
      createParent: false,
      path: join(glossaryFolder, "glossary.yaml"),
    });
    expect(await readFile(blockingFile, "utf8")).toBe("blocking bytes");
  });
});
