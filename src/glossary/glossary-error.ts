import type { LineCounter } from "yaml";

import type { SourceRange } from "./glossary-types";

export type GlossaryErrorCode =
  | "duplicate-term"
  | "invalid-encoding"
  | "invalid-extension"
  | "invalid-schema"
  | "invalid-yaml"
  | "missing"
  | "missing-parent"
  | "multiple-documents"
  | "stale-term"
  | "too-large"
  | "unwritable"
  | "file-changed"
  | "unsupported-write-target"
  | "unsupported-yaml"
  | "unreadable";

export class GlossaryError extends Error {
  constructor(
    readonly code: GlossaryErrorCode,
    message: string,
    readonly line?: number,
  ) {
    super(message);
    this.name = "GlossaryError";
  }
}

export const createLocatedError = (
  code: GlossaryErrorCode,
  message: string,
  lineCounter: LineCounter,
  range: SourceRange,
): GlossaryError => {
  const line = lineCounter.linePos(range?.[0] ?? 0).line;
  return new GlossaryError(code, `${message} near line ${line}.`, line);
};

export const createUnreadableError = (): GlossaryError => {
  return new GlossaryError(
    "unreadable",
    "The glossary file could not be read. Check that it still exists and is accessible.",
  );
};

export const createMissingError = (): GlossaryError => {
  return new GlossaryError("missing", "No glossary file exists at this path. Add a term to create it.");
};

export const createMissingParentError = (): GlossaryError => {
  return new GlossaryError(
    "missing-parent",
    "The glossary file could not be created because its parent folder is unavailable.",
  );
};

export const createUnwritableError = (): GlossaryError => {
  return new GlossaryError("unwritable", "The glossary file could not be saved. Check its permissions and try again.");
};

export const createFileChangedError = (): GlossaryError => {
  return new GlossaryError("file-changed", "The glossary changed while saving. Try again.");
};

export const createUnsupportedWriteTargetError = (): GlossaryError => {
  return new GlossaryError(
    "unsupported-write-target",
    "The selected glossary cannot be safely replaced. Choose a regular file with one link.",
  );
};

export const createInvalidRootError = (lineCounter: LineCounter, range: SourceRange): GlossaryError => {
  return createLocatedError(
    "invalid-schema",
    "The glossary root must contain exactly one terms sequence",
    lineCounter,
    range,
  );
};
