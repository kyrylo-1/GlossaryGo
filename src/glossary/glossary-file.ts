import { constants, type BigIntStats } from "node:fs";
import { access, chmod, lstat, open, rename, unlink, type FileHandle } from "node:fs/promises";
import { TextDecoder } from "node:util";

import { MAXIMUM_GLOSSARY_BYTES } from "../constants";
import {
  createFileChangedError,
  createUnreadableError,
  createUnsupportedWriteTargetError,
  createUnwritableError,
  GlossaryError,
} from "./glossary-error";

const readChunkBytes = 64 * 1024;

export type GlossaryFileMetadata = Readonly<{
  changedNanoseconds: bigint;
  device: bigint;
  inode: bigint;
  links: bigint;
  mode: bigint;
  modifiedNanoseconds: bigint;
  size: bigint;
}>;

export type GlossaryFileSnapshot = Readonly<{
  bytes: Buffer;
  metadata: GlossaryFileMetadata;
  source: string;
}>;

const readGlossaryBytes = async (handle: FileHandle, size: bigint): Promise<Buffer> => {
  if (size > BigInt(MAXIMUM_GLOSSARY_BYTES)) {
    throw new GlossaryError("too-large", "The glossary file is larger than 5 MiB.");
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (totalBytes <= MAXIMUM_GLOSSARY_BYTES) {
    const bytesRemaining = MAXIMUM_GLOSSARY_BYTES + 1 - totalBytes;
    const chunk = Buffer.allocUnsafe(Math.min(readChunkBytes, bytesRemaining));
    const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, null);
    if (bytesRead === 0) {
      break;
    }
    chunks.push(chunk.subarray(0, bytesRead));
    totalBytes += bytesRead;
  }

  if (totalBytes > MAXIMUM_GLOSSARY_BYTES) {
    throw new GlossaryError("too-large", "The glossary file is larger than 5 MiB.");
  }

  return Buffer.concat(chunks, totalBytes);
};

const decodeGlossaryBytes = (bytes: Buffer): string => {
  try {
    return new TextDecoder("utf8", { fatal: true }).decode(bytes);
  } catch {
    throw new GlossaryError("invalid-encoding", "The glossary file must use valid UTF-8.");
  }
};

const toMetadata = (stats: BigIntStats): GlossaryFileMetadata => {
  return {
    changedNanoseconds: stats.ctimeNs,
    device: stats.dev,
    inode: stats.ino,
    links: stats.nlink,
    mode: stats.mode,
    modifiedNanoseconds: stats.mtimeNs,
    size: stats.size,
  };
};

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

export const glossaryWriteTargetFileSystem = {
  checkWriteAccess: async (path: string): Promise<void> => access(path, constants.W_OK),
};

export const inspectGlossaryWriteTarget = async (path: string): Promise<GlossaryFileMetadata> => {
  try {
    const stats = await lstat(path, { bigint: true });
    if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1n) {
      throw createUnsupportedWriteTargetError();
    }
    if ((stats.mode & 0o222n) === 0n) {
      throw createUnwritableError();
    }
    try {
      await glossaryWriteTargetFileSystem.checkWriteAccess(path);
    } catch {
      throw createUnwritableError();
    }
    return toMetadata(stats);
  } catch (error: unknown) {
    if (error instanceof GlossaryError) {
      throw error;
    }
    throw createUnreadableError();
  }
};

export const readGlossarySnapshot = async (path: string): Promise<GlossaryFileSnapshot> => {
  const inspectedMetadata = await inspectGlossaryWriteTarget(path);
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, "r");
    const beforeRead = toMetadata(await handle.stat({ bigint: true }));
    if (!metadataMatches(inspectedMetadata, beforeRead)) {
      throw createFileChangedError();
    }
    const bytes = await readGlossaryBytes(handle, beforeRead.size);
    const afterRead = toMetadata(await handle.stat({ bigint: true }));
    if (!metadataMatches(beforeRead, afterRead)) {
      throw createFileChangedError();
    }
    return { bytes, metadata: afterRead, source: decodeGlossaryBytes(bytes) };
  } catch (error: unknown) {
    if (error instanceof GlossaryError) {
      throw error;
    }
    throw createUnreadableError();
  } finally {
    await handle?.close().catch(() => null);
  }
};

const readGlossaryBytesFromPath = async (path: string): Promise<Buffer> => {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, "r");
    const fileStats = await handle.stat();
    if (!fileStats.isFile()) {
      throw createUnreadableError();
    }

    return await readGlossaryBytes(handle, BigInt(fileStats.size));
  } catch (error: unknown) {
    if (error instanceof GlossaryError) {
      throw error;
    }
    throw createUnreadableError();
  } finally {
    await handle?.close().catch(() => null);
  }
};

export const readGlossarySource = async (path: string): Promise<string> => {
  return decodeGlossaryBytes(await readGlossaryBytesFromPath(path));
};

export const glossarySaveFileSystem = {
  chmod,
  close: async (handle: FileHandle): Promise<void> => handle.close(),
  createExclusive: async (path: string): Promise<FileHandle> => open(path, "wx", 0o600),
  flush: async (handle: FileHandle): Promise<void> => handle.sync(),
  readSnapshot: readGlossarySnapshot,
  remove: unlink,
  rename,
  write: async (handle: FileHandle, source: string): Promise<void> => handle.writeFile(source, "utf8"),
};
