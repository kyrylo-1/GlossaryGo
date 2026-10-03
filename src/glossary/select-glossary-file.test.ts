import { chmod, readFile, readdir, stat, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AI, LocalStorage } from "@raycast/api";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { loadGlossary } from "./glossary";
import { createTemporaryPath, removeTemporaryDirectories, writeGlossary } from "./glossary-test-utils";
import { getGlossaryTarget } from "./get-glossary-target";
import { saveGlossaryChange } from "./save-glossary-change";
import { getSelectedGlossaryFile, selectGlossaryFile } from "./select-glossary-file";

beforeEach(async () => {
  vi.clearAllMocks();
  await LocalStorage.clear();
});
afterEach(removeTemporaryDirectories);

describe("Glossary File selection safety", () => {
  test.each(["team-notes.yaml", "vocabulary.yml"])(
    "leaves %s and its folder unchanged while selecting",
    async (filename) => {
      const source = "# Private synthetic comment\nterms:\n  - term: Alpha\n    definition: First\n";
      const path = await writeGlossary(source, filename);
      const original = await stat(path);
      const files = await readdir(dirname(path));
      await selectGlossaryFile(path);
      expect(await readFile(path, "utf8")).toBe(source);
      expect(await readdir(dirname(path))).toEqual(files);
      const selected = await stat(path);
      expect([selected.ino, selected.mtimeMs, selected.mode]).toEqual([original.ino, original.mtimeMs, original.mode]);
      expect(LocalStorage.setItem).toHaveBeenCalledExactlyOnceWith("selected-glossary-file", path);
      expect(AI.ask).not.toHaveBeenCalled();
    },
  );

  test("supports read-only selection without weakening write protections", async () => {
    const path = await writeGlossary("terms: []\n", "vocabulary.yml");
    await chmod(path, 0o400);
    await selectGlossaryFile(path);
    const target = await getGlossaryTarget();
    await expect(loadGlossary(target.path)).resolves.toEqual([]);
    await expect(
      saveGlossaryChange(target.path, { term: { definition: "First", term: "Alpha" }, type: "add" }),
    ).rejects.toMatchObject({ code: "unwritable" });
    expect(await readFile(path, "utf8")).toBe("terms: []\n");
  });

  test("supports reading a selected symlink while refusing replacement through it", async () => {
    const source = await writeGlossary("terms: []\n", "source.yml");
    const path = join(dirname(source), "vocabulary.yml");
    await symlink(source, path);
    await selectGlossaryFile(path);
    const target = await getGlossaryTarget();
    expect(target.path).toBe(path);
    await expect(
      saveGlossaryChange(target.path, { term: { definition: "First", term: "Alpha" }, type: "add" }),
    ).rejects.toMatchObject({ code: "unsupported-write-target" });
    expect(await readFile(source, "utf8")).toBe("terms: []\n");
  });
});

describe("Glossary File selection failures", () => {
  test.each([
    ["wrong extension", "notes.txt", "terms: []\n", "invalid-extension"],
    ["invalid YAML", "broken.yml", "terms: [bad\n", "invalid-yaml"],
    ["invalid schema", "other.yaml", "entries: []\n", "invalid-schema"],
  ])("retains the active glossary for %s", async (_name, filename, source, code) => {
    const active = await writeGlossary("terms: []\n", "active.yaml");
    await selectGlossaryFile(active);
    const candidate = await writeGlossary(source, filename);
    await expect(selectGlossaryFile(candidate)).rejects.toMatchObject({ code });
    expect(await getSelectedGlossaryFile()).toBe(active);
    expect(await readFile(candidate, "utf8")).toBe(source);
  });

  test("refuses missing or inaccessible files without changing the active glossary", async () => {
    const active = await writeGlossary("terms: []\n", "active.yaml");
    await selectGlossaryFile(active);
    const missing = await createTemporaryPath("missing.yml");
    await expect(selectGlossaryFile(missing)).rejects.toMatchObject({ code: "missing" });
    await expect(stat(missing)).rejects.toMatchObject({ code: "ENOENT" });
    const unreadable = await writeGlossary("terms: []\n", "unreadable.yml");
    await chmod(unreadable, 0o000);
    await expect(selectGlossaryFile(unreadable)).rejects.toMatchObject({ code: "unreadable" });
    expect(await getSelectedGlossaryFile()).toBe(active);
  });

  test("does not activate a cancelled request or a failed path-storage write", async () => {
    const active = await writeGlossary("terms: []\n", "active.yaml");
    await selectGlossaryFile(active);
    const candidate = await writeGlossary("terms: []\n", "candidate.yml");
    const controller = new AbortController();
    controller.abort();
    await expect(selectGlossaryFile(candidate, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    vi.mocked(LocalStorage.setItem).mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(selectGlossaryFile(candidate)).rejects.toThrow("Storage unavailable");
    expect(await getSelectedGlossaryFile()).toBe(active);
  });
});
