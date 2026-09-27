import { join } from "node:path";

import type { Term } from "../utils/types";
import { applyGlossaryChange } from "./apply-glossary-change";
import { createMissingParentError, createUnwritableError, GlossaryError } from "./glossary-error";
import { glossarySaveFileSystem } from "./glossary-file";
import { hasFileSystemCode } from "./has-file-system-code";

const createSource = (terms: readonly Term[]): string => {
  return terms.reduce((source, term) => applyGlossaryChange(source, { term, type: "add" }), "terms: []\n");
};

export const createGlossaryFile = async (directory: string, terms: readonly Term[]): Promise<string> => {
  const source = createSource(terms);
  const path = join(directory, "glossary.yaml");
  let created = false;
  let handle: Awaited<ReturnType<typeof glossarySaveFileSystem.createExclusive>> | null = null;
  try {
    handle = await glossarySaveFileSystem.createExclusive(path);
    created = true;
    await glossarySaveFileSystem.write(handle, source);
    await glossarySaveFileSystem.flush(handle);
    await glossarySaveFileSystem.close(handle);
    handle = null;
    return path;
  } catch (error: unknown) {
    if (handle !== null) {
      await glossarySaveFileSystem.close(handle).catch(() => null);
    }
    if (created) {
      await glossarySaveFileSystem.remove(path).catch(() => null);
    }
    if (hasFileSystemCode(error, "EEXIST")) {
      throw new GlossaryError(
        "already-exists",
        "A glossary.yaml already exists in that folder. Choose another folder.",
      );
    }
    if (hasFileSystemCode(error, "ENOENT") || hasFileSystemCode(error, "ENOTDIR")) {
      throw createMissingParentError();
    }
    throw createUnwritableError();
  }
};
