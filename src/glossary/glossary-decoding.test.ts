import { readFile, writeFile, type FileHandle } from "node:fs/promises";

import { saveGlossaryChange } from "./save-glossary-change";
import { afterEach, describe, expect, test, vi } from "vitest";

import { GlossaryError, loadGlossary } from "./glossary";
import { glossaryReadFileSystem } from "./glossary-file";
import { removeTemporaryDirectories, writeGlossary } from "./glossary-test-utils";

afterEach(async () => {
  vi.restoreAllMocks();
  await removeTemporaryDirectories();
});

describe("loadGlossary cancellation", () => {
  test("stops before reading when its load is already cancelled", async () => {
    const path = await writeGlossary("terms: []\n");
    const controller = new AbortController();
    controller.abort();

    await expect(loadGlossary(path, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  test("closes a source after cancellation during a chunk read and before parsing it", async () => {
    const controller = new AbortController();
    const source = "unexpected: source\n";
    const close = vi.fn<() => Promise<void>>((): Promise<void> => Promise.resolve());
    let hasRead = false;
    const handle = {
      close,
      read: vi.fn<(chunk: Buffer) => Promise<{ buffer: Buffer; bytesRead: number }>>((chunk) => {
        if (hasRead) {
          return Promise.resolve({ buffer: chunk, bytesRead: 0 });
        }
        hasRead = true;
        chunk.write(source);
        controller.abort();
        return Promise.resolve({ buffer: chunk, bytesRead: Buffer.byteLength(source) });
      }),
      stat: vi.fn<() => Promise<{ isFile: () => boolean; size: number }>>(() =>
        Promise.resolve({ isFile: (): boolean => true, size: source.length }),
      ),
    } as unknown as FileHandle;
    vi.spyOn(glossaryReadFileSystem, "open").mockResolvedValue(handle);

    await expect(loadGlossary("/synthetic.yaml", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("loadGlossary decoding and size", () => {
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
});

test("retains BOM in selection identity and refuses BOM-only source changes", async () => {
  const source = "terms:\n  - term: API\n    definition: First\n  - term: API\n    definition: Second\n";
  const path = await writeGlossary(`\uFEFF${source}`);
  const selected = (await loadGlossary(path))[1];
  await writeFile(path, source);
  await expect(saveGlossaryChange(path, { original: selected, type: "delete" })).rejects.toEqual(
    expect.objectContaining({ code: "stale-term" }),
  );
  await expect(readFile(path, "utf8")).resolves.toBe(source);
});
