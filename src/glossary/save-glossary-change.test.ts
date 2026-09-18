import { afterEach, describe, expect, test, vi } from "vitest";
import { chmod, link, mkdir, readFile, readdir, rename, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { loadGlossary } from "./glossary";
import { GlossaryError } from "./glossary-error";
import { glossarySaveFileSystem, glossaryWriteTargetFileSystem } from "./glossary-file";
import { createTemporaryPath, removeTemporaryDirectories, writeGlossary } from "./glossary-test-utils";
import { saveGlossaryChange } from "./save-glossary-change";

afterEach(async () => {
  vi.restoreAllMocks();
  await removeTemporaryDirectories();
});

describe("saveGlossaryChange validation", () => {
  test("sorts added and existing terms and leaves no temporary file", async () => {
    const path = await writeGlossary("terms:\n  - term: API\n    definition: Application Programming Interface\n");

    await saveGlossaryChange(path, {
      term: { definition: "Architectural Decision Record", term: "ADR" },
      type: "add",
    });

    await expect(loadGlossary(path)).resolves.toEqual([
      { definition: "Architectural Decision Record", term: "ADR" },
      { definition: "Application Programming Interface", term: "API" },
    ]);
    await expect(readdir(dirname(path))).resolves.toEqual(["glossary.yaml"]);
  });

  test("rejects a wrong extension before changing the selected file", async () => {
    const path = await writeGlossary("terms: []\n", "glossary.yml");
    const original = await readFile(path);

    await expect(
      saveGlossaryChange(path, { term: { definition: "Application Programming Interface", term: "API" }, type: "add" }),
    ).rejects.toEqual(new GlossaryError("invalid-extension", "Choose a file with the .yaml extension."));
    await expect(readFile(path)).resolves.toEqual(original);
  });

  test("rejects a symbolic-link target without changing its source file", async () => {
    const sourcePath = await writeGlossary("terms: []\n", "source.yaml");
    const path = await createTemporaryPath("glossary.yaml");
    await symlink(sourcePath, path);
    const original = await readFile(sourcePath);

    await expect(
      saveGlossaryChange(path, { term: { definition: "Application Programming Interface", term: "API" }, type: "add" }),
    ).rejects.toEqual(
      new GlossaryError(
        "unsupported-write-target",
        "The selected glossary cannot be safely replaced. Choose a regular file with one link.",
      ),
    );
    await expect(readFile(sourcePath)).resolves.toEqual(original);
  });
});

describe("saveGlossaryChange link safety", () => {
  test("rejects a multiply linked target without changing either link", async () => {
    const path = await writeGlossary("terms: []\n");
    const linkedPath = join(dirname(path), "linked.yaml");
    await link(path, linkedPath);
    const original = await readFile(path);

    await expect(
      saveGlossaryChange(path, { term: { definition: "Application Programming Interface", term: "API" }, type: "add" }),
    ).rejects.toEqual(
      new GlossaryError(
        "unsupported-write-target",
        "The selected glossary cannot be safely replaced. Choose a regular file with one link.",
      ),
    );
    await expect(readFile(path)).resolves.toEqual(original);
    await expect(readFile(linkedPath)).resolves.toEqual(original);
  });
});

describe("saveGlossaryChange invalid sources", () => {
  test.each([
    ["invalid YAML", Buffer.from("terms: [}\n"), "invalid-yaml"],
    ["invalid UTF-8", Buffer.from([0x74, 0x65, 0x72, 0x6d, 0x73, 0x3a, 0x20, 0xff]), "invalid-encoding"],
    ["an oversized file", Buffer.alloc(5 * 1024 * 1024 + 1, 0x20), "too-large"],
  ])("rejects %s without changing the source bytes", async (_label, source, code) => {
    const path = await writeGlossary(source);
    const original = await readFile(path);

    await expect(
      saveGlossaryChange(path, { term: { definition: "Application Programming Interface", term: "API" }, type: "add" }),
    ).rejects.toEqual(expect.objectContaining({ code }));
    expect((await readFile(path)).equals(original)).toBe(true);
    await expect(readdir(dirname(path))).resolves.toEqual(["glossary.yaml"]);
  });

  test("rejects a candidate beyond the size limit before creating a temporary file", async () => {
    const fixedCandidate = "# \nterms:\n  - term: API\n    definition: Interface\n\n";
    const comment = "x".repeat(5 * 1024 * 1024 - Buffer.byteLength(fixedCandidate, "utf8") + 1);
    const path = await writeGlossary(`# ${comment}\nterms: []\n`);
    const original = await readFile(path);

    await expect(
      saveGlossaryChange(path, { term: { definition: "Interface", term: "API" }, type: "add" }),
    ).rejects.toEqual(expect.objectContaining({ code: "too-large" }));
    expect((await readFile(path)).equals(original)).toBe(true);
    await expect(readdir(dirname(path))).resolves.toEqual(["glossary.yaml"]);
  });
});

describe("saveGlossaryChange first glossary creation", () => {
  test("creates a missing glossary for the first added term with private permissions", async () => {
    const path = await createTemporaryPath("missing.yaml");

    await saveGlossaryChange(path, { term: { definition: "Interface", term: "API" }, type: "add" });

    await expect(loadGlossary(path)).resolves.toEqual([{ definition: "Interface", term: "API" }]);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  test("creates the default support directory with private permissions", async () => {
    const path = await createTemporaryPath("support/glossary.yaml");

    await saveGlossaryChange(
      path,
      { term: { definition: "Interface", term: "API" }, type: "add" },
      { createParent: true },
    );

    await expect(loadGlossary(path)).resolves.toEqual([{ definition: "Interface", term: "API" }]);
    expect((await stat(dirname(path))).mode & 0o777).toBe(0o700);
  });
});

describe("saveGlossaryChange missing targets", () => {
  test("does not create a missing custom parent directory", async () => {
    const path = await createTemporaryPath("custom/glossary.yaml");

    await expect(
      saveGlossaryChange(path, { term: { definition: "Interface", term: "API" }, type: "add" }),
    ).rejects.toEqual(
      new GlossaryError(
        "missing-parent",
        "The glossary file could not be created because its parent folder is unavailable.",
      ),
    );
    await expect(stat(path)).rejects.toEqual(expect.objectContaining({ code: "ENOENT" }));
  });

  test("does not create a missing glossary for edit or delete", async () => {
    const path = await createTemporaryPath("missing.yaml");
    const original = { definition: "Interface", term: "API" };

    await expect(
      saveGlossaryChange(path, {
        original,
        term: { definition: "Updated interface", term: "API" },
        type: "edit",
      }),
    ).rejects.toEqual(new GlossaryError("missing", "No glossary file exists at this path. Add a term to create it."));
    await expect(saveGlossaryChange(path, { original, type: "delete" })).rejects.toEqual(
      new GlossaryError("missing", "No glossary file exists at this path. Add a term to create it."),
    );
    await expect(stat(path)).rejects.toEqual(expect.objectContaining({ code: "ENOENT" }));
  });
});

describe("saveGlossaryChange first write failure", () => {
  test("removes a new glossary when its first write fails", async () => {
    const path = await createTemporaryPath("missing.yaml");
    vi.spyOn(glossarySaveFileSystem, "write").mockRejectedValueOnce(new Error("ENOSPC: private term data"));

    await expect(
      saveGlossaryChange(path, { term: { definition: "Secret Definition", term: "Secret Term" }, type: "add" }),
    ).rejects.toEqual(
      new GlossaryError("unwritable", "The glossary file could not be saved. Check its permissions and try again."),
    );
    await expect(stat(path)).rejects.toEqual(expect.objectContaining({ code: "ENOENT" }));
  });
});

describe("saveGlossaryChange target access", () => {
  test("rejects a directory as an unsupported replacement target", async () => {
    const path = await createTemporaryPath("directory.yaml");
    await mkdir(path);

    await expect(
      saveGlossaryChange(path, { term: { definition: "Interface", term: "API" }, type: "add" }),
    ).rejects.toEqual(
      new GlossaryError(
        "unsupported-write-target",
        "The selected glossary cannot be safely replaced. Choose a regular file with one link.",
      ),
    );
  });

  test.skipIf(process.platform === "win32")("rejects a target without write permission", async () => {
    const path = await writeGlossary("terms: []\n");
    await chmod(path, 0o444);

    await expect(
      saveGlossaryChange(path, { term: { definition: "Interface", term: "API" }, type: "add" }),
    ).rejects.toEqual(
      new GlossaryError("unwritable", "The glossary file could not be saved. Check its permissions and try again."),
    );
  });
});

describe("saveGlossaryChange effective write access", () => {
  test.skipIf(process.platform === "win32")(
    "rejects an owner-read-only target even when its group write bit is set",
    async () => {
      const path = await writeGlossary("terms: []\n");
      const original = await readFile(path);
      await chmod(path, 0o460);
      vi.spyOn(glossaryWriteTargetFileSystem, "checkWriteAccess").mockRejectedValue(
        Object.assign(new Error("EACCES: effective access denied"), { code: "EACCES" }),
      );

      await expect(
        saveGlossaryChange(path, { term: { definition: "Interface", term: "API" }, type: "add" }),
      ).rejects.toEqual(
        new GlossaryError("unwritable", "The glossary file could not be saved. Check its permissions and try again."),
      );
      await expect(readFile(path)).resolves.toEqual(original);
    },
  );
});

describe("saveGlossaryChange replacement", () => {
  test("hides raw read failures at the writer boundary", async () => {
    const path = await writeGlossary("terms: []\n");
    vi.spyOn(glossarySaveFileSystem, "readSnapshot").mockRejectedValueOnce(
      new Error("EIO: hidden filesystem detail and Secret Term"),
    );

    const save = saveGlossaryChange(path, {
      term: { definition: "Secret Definition", term: "Secret Term" },
      type: "add",
    });

    await expect(save).rejects.toEqual(
      new GlossaryError(
        "unreadable",
        "The glossary file could not be read. Check that it still exists and is accessible.",
      ),
    );
  });

  test("keeps unsorted source bytes and hides raw details when replacement fails", async () => {
    const path = await writeGlossary(
      "terms:\n  - term: Zulu\n    definition: Last\n  - term: Alpha\n    definition: First\n",
    );
    const original = await readFile(path);
    vi.spyOn(glossarySaveFileSystem, "rename").mockRejectedValue(
      new Error("EACCES: hidden filesystem detail and Secret Term"),
    );

    const save = saveGlossaryChange(path, {
      term: { definition: "Secret Definition", term: "Secret Term" },
      type: "add",
    });

    await expect(save).rejects.toEqual(
      new GlossaryError("unwritable", "The glossary file could not be saved. Check its permissions and try again."),
    );
    await expect(readFile(path)).resolves.toEqual(original);
    await expect(readdir(dirname(path))).resolves.toEqual(["glossary.yaml"]);
  });
});

describe("saveGlossaryChange temporary file failures", () => {
  test("cleans only its temporary file when writing fails", async () => {
    const path = await writeGlossary("terms: []\n");
    const original = await readFile(path);
    await writeFile(join(dirname(path), "keep.txt"), "keep");
    vi.spyOn(glossarySaveFileSystem, "write").mockRejectedValue(
      new Error("ENOSPC: hidden filesystem detail and Secret Definition"),
    );

    const save = saveGlossaryChange(path, {
      term: { definition: "Secret Definition", term: "Secret Term" },
      type: "add",
    });

    await expect(save).rejects.toEqual(
      new GlossaryError("unwritable", "The glossary file could not be saved. Check its permissions and try again."),
    );
    await expect(readFile(path)).resolves.toEqual(original);
    await expect(readdir(dirname(path))).resolves.toEqual(["glossary.yaml", "keep.txt"]);
  });

  test.each(["flush", "close"] as const)("keeps the original file when temporary-file %s fails", async (operation) => {
    const path = await writeGlossary("terms: []\n");
    const original = await readFile(path);
    vi.spyOn(glossarySaveFileSystem, operation).mockRejectedValueOnce(
      new Error("EIO: hidden filesystem detail and Secret Definition"),
    );

    await expect(
      saveGlossaryChange(path, {
        term: { definition: "Secret Definition", term: "Secret Term" },
        type: "add",
      }),
    ).rejects.toEqual(
      new GlossaryError("unwritable", "The glossary file could not be saved. Check its permissions and try again."),
    );
    await expect(readFile(path)).resolves.toEqual(original);
    await expect(readdir(dirname(path))).resolves.toEqual(["glossary.yaml"]);
  });
});

describe("saveGlossaryChange exclusive temporary creation", () => {
  test("does not remove a pre-existing path when exclusive creation reports EEXIST", async () => {
    const path = await writeGlossary("terms: []\n");
    const preExistingBytes = Buffer.from("unrelated file bytes");
    let attemptedPath = "";
    vi.spyOn(glossarySaveFileSystem, "createExclusive").mockImplementation(async (temporaryPath) => {
      attemptedPath = temporaryPath;
      await writeFile(temporaryPath, preExistingBytes);
      throw Object.assign(new Error("EEXIST: temporary path already exists"), { code: "EEXIST" });
    });

    await expect(
      saveGlossaryChange(path, { term: { definition: "Interface", term: "API" }, type: "add" }),
    ).rejects.toEqual(
      new GlossaryError("unwritable", "The glossary file could not be saved. Check its permissions and try again."),
    );
    await expect(readFile(attemptedPath)).resolves.toEqual(preExistingBytes);
  });
});

describe("saveGlossaryChange cleanup failure", () => {
  test("does not obscure a write failure when temporary cleanup also fails", async () => {
    const path = await writeGlossary("terms: []\n");
    vi.spyOn(glossarySaveFileSystem, "write").mockRejectedValueOnce(new Error("ENOSPC: original failure"));
    vi.spyOn(glossarySaveFileSystem, "remove").mockRejectedValueOnce(new Error("EACCES: cleanup failure"));

    await expect(
      saveGlossaryChange(path, { term: { definition: "Secret Definition", term: "Secret Term" }, type: "add" }),
    ).rejects.toEqual(
      new GlossaryError("unwritable", "The glossary file could not be saved. Check its permissions and try again."),
    );
  });
});

describe("saveGlossaryChange conflict detection", () => {
  test("compares exact source bytes including a UTF-8 byte-order mark", async () => {
    const source = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("terms: []\n")]);
    const path = await writeGlossary(source);
    const original = await readFile(path);
    const readSnapshot = glossarySaveFileSystem.readSnapshot;
    vi.spyOn(glossarySaveFileSystem, "readSnapshot")
      .mockImplementationOnce(readSnapshot)
      .mockImplementationOnce(async (targetPath) => {
        const snapshot = await readSnapshot(targetPath);
        return { ...snapshot, bytes: snapshot.bytes.subarray(3) };
      });

    await expect(
      saveGlossaryChange(path, { term: { definition: "Interface", term: "API" }, type: "add" }),
    ).rejects.toEqual(new GlossaryError("file-changed", "The glossary changed while saving. Try again."));
    await expect(readFile(path)).resolves.toEqual(original);
    await expect(readdir(dirname(path))).resolves.toEqual(["glossary.yaml"]);
  });

  test("rejects changed identity metadata even when the bytes match", async () => {
    const path = await writeGlossary("terms: []\n");
    const original = await readFile(path);
    const readSnapshot = glossarySaveFileSystem.readSnapshot;
    vi.spyOn(glossarySaveFileSystem, "readSnapshot")
      .mockImplementationOnce(readSnapshot)
      .mockImplementationOnce(async (targetPath) => {
        const snapshot = await readSnapshot(targetPath);
        return { ...snapshot, metadata: { ...snapshot.metadata, inode: snapshot.metadata.inode + 1n } };
      });

    await expect(
      saveGlossaryChange(path, { term: { definition: "Interface", term: "API" }, type: "add" }),
    ).rejects.toEqual(new GlossaryError("file-changed", "The glossary changed while saving. Try again."));
    await expect(readFile(path)).resolves.toEqual(original);
    await expect(readdir(dirname(path))).resolves.toEqual(["glossary.yaml"]);
  });
});

describe("saveGlossaryChange external replacement", () => {
  test("does not overwrite a file replaced by an external writer", async () => {
    const path = await writeGlossary("terms: []\n");
    const externalSource = "terms:\n  - term: External\n    definition: External change\n";
    const readSnapshot = glossarySaveFileSystem.readSnapshot;
    vi.spyOn(glossarySaveFileSystem, "readSnapshot")
      .mockImplementationOnce(readSnapshot)
      .mockImplementationOnce(async (targetPath) => {
        const replacementPath = join(dirname(targetPath), "external.yaml");
        await writeFile(replacementPath, externalSource);
        await rename(replacementPath, targetPath);
        return readSnapshot(targetPath);
      });

    await expect(
      saveGlossaryChange(path, { term: { definition: "Interface", term: "API" }, type: "add" }),
    ).rejects.toEqual(new GlossaryError("file-changed", "The glossary changed while saving. Try again."));
    await expect(readFile(path, "utf8")).resolves.toBe(externalSource);
    await expect(readdir(dirname(path))).resolves.toEqual(["glossary.yaml"]);
  });
});

describe("saveGlossaryChange edits and deletions", () => {
  test("safely edits a selected term and preserves ordinary permission bits", async () => {
    const path = await writeGlossary("terms:\n  - term: API\n    definition: Interface\n");
    await chmod(path, 0o640);

    await saveGlossaryChange(path, {
      original: { definition: "Interface", term: "API" },
      term: { definition: "Hypertext Transfer Protocol", term: "HTTP" },
      type: "edit",
    });

    await expect(loadGlossary(path)).resolves.toEqual([{ definition: "Hypertext Transfer Protocol", term: "HTTP" }]);
    expect((await stat(path)).mode & 0o777).toBe(0o640);
  });

  test("deletes the last term without unlinking the selected glossary file", async () => {
    const original = { definition: "Interface", term: "API" };
    const path = await writeGlossary("terms:\n  - term: API\n    definition: Interface\n");

    await saveGlossaryChange(path, { original, type: "delete" });

    await expect(loadGlossary(path)).resolves.toEqual([]);
    await expect(stat(path)).resolves.toEqual(expect.objectContaining({ nlink: 1 }));
    await expect(readdir(dirname(path))).resolves.toEqual(["glossary.yaml"]);
  });

  test("rejects a repeated deletion as stale while retaining the selected file", async () => {
    const original = { definition: "Interface", term: "API" };
    const path = await writeGlossary("terms:\n  - term: API\n    definition: Interface\n");

    await saveGlossaryChange(path, { original, type: "delete" });

    await expect(saveGlossaryChange(path, { original, type: "delete" })).rejects.toEqual(
      expect.objectContaining({ code: "stale-term" }),
    );
    await expect(loadGlossary(path)).resolves.toEqual([]);
  });
});

describe("saveGlossaryChange same-process serialization", () => {
  test("retains additions submitted concurrently for the same path", async () => {
    const path = await writeGlossary("terms: []\n");

    await Promise.all([
      saveGlossaryChange(path, { term: { definition: "Decision record", term: "ADR" }, type: "add" }),
      saveGlossaryChange(path, { term: { definition: "Transfer protocol", term: "HTTP" }, type: "add" }),
    ]);

    await expect(loadGlossary(path)).resolves.toEqual([
      { definition: "Decision record", term: "ADR" },
      { definition: "Transfer protocol", term: "HTTP" },
    ]);
  });

  test("rejects a queued delete whose selected snapshot became stale", async () => {
    const original = { definition: "Interface", term: "API" };
    const path = await writeGlossary("terms:\n  - term: API\n    definition: Interface\n");
    const edit = saveGlossaryChange(path, {
      original,
      term: { definition: "Updated interface", term: "API" },
      type: "edit",
    });
    const deletion = saveGlossaryChange(path, { original, type: "delete" });

    await expect(edit).resolves.toBeUndefined();
    await expect(deletion).rejects.toEqual(expect.objectContaining({ code: "stale-term" }));
    await expect(loadGlossary(path)).resolves.toEqual([{ definition: "Updated interface", term: "API" }]);
  });
});

describe("saveGlossaryChange queue recovery", () => {
  test("rejects a queued edit whose selected snapshot was deleted", async () => {
    const original = { definition: "Interface", term: "API" };
    const path = await writeGlossary("terms:\n  - term: API\n    definition: Interface\n");
    const deletion = saveGlossaryChange(path, { original, type: "delete" });
    const edit = saveGlossaryChange(path, {
      original,
      term: { definition: "Updated interface", term: "API" },
      type: "edit",
    });

    await expect(deletion).resolves.toBeUndefined();
    await expect(edit).rejects.toEqual(expect.objectContaining({ code: "stale-term" }));
    await expect(loadGlossary(path)).resolves.toEqual([]);
  });

  test("continues with the next queued save after a failed save", async () => {
    const path = await writeGlossary("terms: []\n");
    vi.spyOn(glossarySaveFileSystem, "write").mockRejectedValueOnce(new Error("ENOSPC: first save fails"));
    const first = saveGlossaryChange(path, { term: { definition: "Decision record", term: "ADR" }, type: "add" });
    const second = saveGlossaryChange(path, {
      term: { definition: "Transfer protocol", term: "HTTP" },
      type: "add",
    });

    await expect(first).rejects.toEqual(expect.objectContaining({ code: "unwritable" }));
    await expect(second).resolves.toBeUndefined();
    await expect(loadGlossary(path)).resolves.toEqual([{ definition: "Transfer protocol", term: "HTTP" }]);
  });

  test.each(["", "\uFEFF"])(
    "skips replacement when a loaded unchanged edit preserves source prefix %j",
    async (prefix) => {
      const source = `${prefix}terms:\n  - term: API\n    definition: Interface\n`;
      const path = await writeGlossary(source);
      const before = await stat(path);

      await saveGlossaryChange(path, {
        original: (await loadGlossary(path))[0],
        term: { definition: "Interface", term: "API" },
        type: "edit",
      });

      const after = await stat(path);
      expect(after.ino).toBe(before.ino);
      await expect(readFile(path, "utf8")).resolves.toBe(source);
    },
  );
});

test("retains a source BOM through additions, edits, and deletions", async () => {
  const path = await writeGlossary("\uFEFFterms:\n  - term: API\n    definition: Interface\n");
  await saveGlossaryChange(path, { term: { definition: "Protocol", term: "HTTP" }, type: "add" });
  expect((await readFile(path, "utf8")).startsWith("\uFEFF")).toBe(true);
  const entries = await loadGlossary(path);
  await saveGlossaryChange(path, { original: entries[1], term: { definition: "Updated", term: "HTTP" }, type: "edit" });
  expect((await readFile(path, "utf8")).startsWith("\uFEFF")).toBe(true);
  await saveGlossaryChange(path, { original: (await loadGlossary(path))[1], type: "delete" });
  expect((await readFile(path, "utf8")).startsWith("\uFEFF")).toBe(true);
  await expect(loadGlossary(path)).resolves.toEqual([{ definition: "Interface", term: "API" }]);
});
