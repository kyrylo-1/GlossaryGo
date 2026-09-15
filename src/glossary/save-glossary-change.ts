import { randomUUID } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { applyGlossaryChange, type GlossaryChange } from "./apply-glossary-change";
import { createFileChangedError, createUnreadableError, createUnwritableError, GlossaryError } from "./glossary-error";
import {
  glossarySaveFileSystem,
  inspectGlossaryWriteTarget,
  type GlossaryFileMetadata,
  type GlossaryFileSnapshot,
} from "./glossary-file";

const pendingSaves = new Map<string, Promise<void>>();

const metadataMatches = (left: GlossaryFileMetadata, right: GlossaryFileMetadata): boolean => {
  return (
    left.changedNanoseconds === right.changedNanoseconds &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.links === right.links &&
    left.mode === right.mode &&
    left.modifiedNanoseconds === right.modifiedNanoseconds &&
    left.size === right.size
  );
};

const snapshotMatches = (left: GlossaryFileSnapshot, right: GlossaryFileSnapshot): boolean => {
  return metadataMatches(left.metadata, right.metadata) && left.bytes.equals(right.bytes);
};

const createTemporaryPath = (path: string): string => {
  return join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
};

const closeAndRemoveTemporary = async (handle: FileHandle | null, temporaryPath: string | null): Promise<void> => {
  if (handle !== null) {
    await glossarySaveFileSystem.close(handle).catch(() => null);
  }
  if (temporaryPath !== null) {
    await glossarySaveFileSystem.remove(temporaryPath).catch(() => null);
  }
};

const saveOnce = async (path: string, change: GlossaryChange): Promise<void> => {
  let original: GlossaryFileSnapshot;
  try {
    original = await glossarySaveFileSystem.readSnapshot(path);
  } catch (error: unknown) {
    if (error instanceof GlossaryError) {
      throw error;
    }
    throw createUnreadableError();
  }
  const candidate = applyGlossaryChange(original.source, change);
  if (candidate === original.source) {
    return;
  }

  let handle: FileHandle | null = null;
  let temporaryPath: string | null = null;
  try {
    temporaryPath = createTemporaryPath(path);
    handle = await glossarySaveFileSystem.createExclusive(temporaryPath);
    await glossarySaveFileSystem.write(handle, candidate);
    await glossarySaveFileSystem.flush(handle);
    await glossarySaveFileSystem.close(handle);
    handle = null;
    await glossarySaveFileSystem.chmod(temporaryPath, Number(original.metadata.mode & 0o777n));

    let current: GlossaryFileSnapshot;
    try {
      current = await glossarySaveFileSystem.readSnapshot(path);
    } catch {
      throw createFileChangedError();
    }
    if (!snapshotMatches(original, current)) {
      throw createFileChangedError();
    }

    await glossarySaveFileSystem.rename(temporaryPath, path);
    temporaryPath = null;
  } catch (error: unknown) {
    await closeAndRemoveTemporary(handle, temporaryPath);
    if (error instanceof GlossaryError) {
      throw error;
    }
    throw createUnwritableError();
  }
};

const inspectForSave = async (path: string): Promise<GlossaryError | null> => {
  try {
    await inspectGlossaryWriteTarget(path);
    return null;
  } catch (error: unknown) {
    return error instanceof GlossaryError ? error : createUnreadableError();
  }
};

export const saveGlossaryChange = async (path: string, change: GlossaryChange): Promise<void> => {
  if (!path.endsWith(".yaml")) {
    throw new GlossaryError("invalid-extension", "Choose a file with the .yaml extension.");
  }
  const inspection = inspectForSave(path);
  const queueKey = resolve(path);
  const previous = pendingSaves.get(queueKey) ?? Promise.resolve();
  const result = previous
    .catch(() => null)
    .then(async () => {
      const inspectionError = await inspection;
      if (inspectionError !== null) {
        throw inspectionError;
      }
      return saveOnce(path, change);
    });
  const tracked = result.finally(() => {
    if (pendingSaves.get(queueKey) === tracked) {
      pendingSaves.delete(queueKey);
    }
  });
  pendingSaves.set(queueKey, tracked);
  return tracked;
};
