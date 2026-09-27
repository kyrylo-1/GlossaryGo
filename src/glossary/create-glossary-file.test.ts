import { lstat, mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createGlossaryFile } from "./create-glossary-file";
import { GlossaryError } from "./glossary-error";
import { glossarySaveFileSystem } from "./glossary-file";
import { createTemporaryPath, removeTemporaryDirectories } from "./glossary-test-utils";
import { loadGlossary } from "./glossary";

afterEach(async () => {
  vi.restoreAllMocks();
  await removeTemporaryDirectories();
});

describe("createGlossaryFile", () => {
  test("creates a valid empty glossary in an existing folder with private permissions", async () => {
    const directory = dirname(await createTemporaryPath("glossary.yaml"));

    const path = await createGlossaryFile(directory, []);

    expect(path).toBe(join(directory, "glossary.yaml"));
    await expect(readFile(path, "utf8")).resolves.toBe("terms: []\n");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  test("creates one or multiple terms in deterministic name order in one write", async () => {
    const directory = dirname(await createTemporaryPath("glossary.yaml"));
    const write = vi.spyOn(glossarySaveFileSystem, "write");

    const path = await createGlossaryFile(directory, [
      { definition: "Last", term: "Zulu" },
      { definition: "First", term: " Alpha " },
      { definition: "Interface", term: "API" },
    ]);

    await expect(loadGlossary(path)).resolves.toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Interface", term: "API" },
      { definition: "Last", term: "Zulu" },
    ]);
    expect(write).toHaveBeenCalledOnce();
  });

  test("rejects an invalid term before any file is created", async () => {
    const path = await createTemporaryPath("glossary.yaml");

    await expect(createGlossaryFile(dirname(path), [{ definition: "  ", term: "API" }])).rejects.toEqual(
      expect.objectContaining({ code: "invalid-schema" }),
    );
    await expect(lstat(path)).rejects.toEqual(expect.objectContaining({ code: "ENOENT" }));
  });
});

describe("createGlossaryFile target safety", () => {
  test("refuses an existing file without replacing it", async () => {
    const path = await createTemporaryPath("glossary.yaml");
    await writeFile(path, "original");

    await expect(createGlossaryFile(dirname(path), [])).rejects.toEqual(
      expect.objectContaining({ code: "already-exists" }),
    );
    await expect(readFile(path, "utf8")).resolves.toBe("original");
  });

  test("refuses an existing directory", async () => {
    const path = await createTemporaryPath("glossary.yaml");
    await mkdir(path);

    await expect(createGlossaryFile(dirname(path), [])).rejects.toEqual(
      expect.objectContaining({ code: "already-exists" }),
    );
    expect((await lstat(path)).isDirectory()).toBe(true);
  });

  test("refuses a symbolic link without following it", async () => {
    const path = await createTemporaryPath("glossary.yaml");
    await symlink(join(dirname(path), "missing.yaml"), path);

    await expect(createGlossaryFile(dirname(path), [])).rejects.toEqual(
      expect.objectContaining({ code: "already-exists" }),
    );
    expect((await lstat(path)).isSymbolicLink()).toBe(true);
  });

  test("refuses a missing directory and leaves it absent", async () => {
    const path = await createTemporaryPath("missing/glossary.yaml");

    await expect(createGlossaryFile(dirname(path), [])).rejects.toEqual(
      expect.objectContaining({ code: "missing-parent" }),
    );
    await expect(lstat(dirname(path))).rejects.toEqual(expect.objectContaining({ code: "ENOENT" }));
  });

  test("reports write failure without claiming success or leaving a partial file", async () => {
    const path = await createTemporaryPath("glossary.yaml");
    vi.spyOn(glossarySaveFileSystem, "write").mockRejectedValueOnce(new Error("EIO: hidden private data"));

    await expect(createGlossaryFile(dirname(path), [])).rejects.toEqual(
      new GlossaryError("unwritable", "The glossary file could not be saved. Check its permissions and try again."),
    );
    await expect(lstat(path)).rejects.toEqual(expect.objectContaining({ code: "ENOENT" }));
  });
});
