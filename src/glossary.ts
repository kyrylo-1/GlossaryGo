import { open, type FileHandle } from "node:fs/promises";
import { TextDecoder } from "node:util";

import { isMap, isNode, isScalar, isSeq, LineCounter, parseAllDocuments, visit } from "yaml";

import { areTermsEquivalent } from "./search";

export type Term = Readonly<{
  term: string;
  definition: string;
}>;

export type GlossaryErrorCode =
  | "duplicate-term"
  | "invalid-encoding"
  | "invalid-extension"
  | "invalid-schema"
  | "invalid-yaml"
  | "multiple-documents"
  | "too-large"
  | "unsupported-yaml"
  | "unreadable";

const maximumGlossaryBytes = 5 * 1024 * 1024;
const readChunkBytes = 64 * 1024;

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

function createLocatedError(
  code: GlossaryErrorCode,
  message: string,
  lineCounter: LineCounter,
  range: readonly number[] | null | undefined,
) {
  const line = lineCounter.linePos(range?.[0] ?? 0).line;
  return new GlossaryError(code, `${message} near line ${line}.`, line);
}

function createUnreadableError() {
  return new GlossaryError(
    "unreadable",
    "The glossary file could not be read. Check that it still exists and is accessible.",
  );
}

function createInvalidRootError(lineCounter: LineCounter, range: readonly number[] | null | undefined) {
  return createLocatedError(
    "invalid-schema",
    "The glossary root must contain exactly one terms sequence",
    lineCounter,
    range,
  );
}

async function readGlossaryBytes(path: string) {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, "r");
    const fileStats = await handle.stat();
    if (!fileStats.isFile()) {
      throw createUnreadableError();
    }
    if (fileStats.size > maximumGlossaryBytes) {
      throw new GlossaryError("too-large", "The glossary file is larger than 5 MiB.");
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    while (totalBytes <= maximumGlossaryBytes) {
      const bytesRemaining = maximumGlossaryBytes + 1 - totalBytes;
      const chunk = Buffer.allocUnsafe(Math.min(readChunkBytes, bytesRemaining));
      const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, null);
      if (bytesRead === 0) {
        break;
      }
      chunks.push(chunk.subarray(0, bytesRead));
      totalBytes += bytesRead;
    }

    if (totalBytes > maximumGlossaryBytes) {
      throw new GlossaryError("too-large", "The glossary file is larger than 5 MiB.");
    }

    return Buffer.concat(chunks, totalBytes);
  } catch (error: unknown) {
    if (error instanceof GlossaryError) {
      throw error;
    }
    throw createUnreadableError();
  } finally {
    await handle?.close().catch(() => null);
  }
}

export async function loadGlossary(path: string): Promise<readonly Term[]> {
  if (!path.endsWith(".yaml")) {
    throw new GlossaryError("invalid-extension", "Choose a file with the .yaml extension.");
  }

  const bytes = await readGlossaryBytes(path);

  let source: string;
  try {
    source = new TextDecoder("utf8", { fatal: true }).decode(bytes);
  } catch {
    throw new GlossaryError("invalid-encoding", "The glossary file must use valid UTF-8.");
  }
  const lineCounter = new LineCounter();
  const documents = parseAllDocuments(source, { lineCounter, prettyErrors: false, strict: true });
  const parseError = documents.find((document) => document.errors.length > 0)?.errors[0];
  if (parseError) {
    const line = lineCounter.linePos(parseError.pos[0]).line;
    throw new GlossaryError("invalid-yaml", `The glossary contains invalid YAML near line ${line}.`, line);
  }

  if (documents.length !== 1) {
    const line = lineCounter.linePos(documents[1]?.range[0] ?? 0).line;
    throw new GlossaryError(
      "multiple-documents",
      `The glossary must contain exactly one YAML document near line ${line}.`,
      line,
    );
  }

  const directiveOffset = /^%/m.exec(source)?.index;
  const warning = documents[0].warnings[0];
  if (typeof directiveOffset === "number" || warning) {
    const line = lineCounter.linePos(directiveOffset ?? warning.pos[0]).line;
    throw new GlossaryError(
      "unsupported-yaml",
      `The glossary uses an unsupported YAML construct near line ${line}.`,
      line,
    );
  }

  let unsupportedOffset: number | undefined;
  visit(documents[0], {
    Alias(_key, node) {
      unsupportedOffset = node.range?.[0] ?? 0;
      return visit.BREAK;
    },
    Node(_key, node) {
      if (node.anchor || node.tag) {
        unsupportedOffset = node.range?.[0] ?? 0;
        return visit.BREAK;
      }
    },
    Pair(_key, pair) {
      if (isScalar(pair.key) && pair.key.value === "<<") {
        unsupportedOffset = pair.key.range?.[0] ?? 0;
        return visit.BREAK;
      }
    },
  });

  if (typeof unsupportedOffset === "number") {
    const line = lineCounter.linePos(unsupportedOffset).line;
    throw new GlossaryError(
      "unsupported-yaml",
      `The glossary uses an unsupported YAML construct near line ${line}.`,
      line,
    );
  }

  const contents = documents[0].contents;
  if (!isMap(contents)) {
    throw createInvalidRootError(lineCounter, contents?.range);
  }

  const invalidRootPair = contents.items.find((pair) => !isScalar(pair.key) || pair.key.value !== "terms");
  if (invalidRootPair) {
    throw createInvalidRootError(
      lineCounter,
      isScalar(invalidRootPair.key) ? invalidRootPair.key.range : contents.range,
    );
  }

  if (contents.items.length !== 1) {
    throw createInvalidRootError(lineCounter, contents.range);
  }

  const termsPair = contents.items[0];
  if (!isScalar(termsPair.key) || termsPair.key.value !== "terms") {
    throw createInvalidRootError(lineCounter, isScalar(termsPair.key) ? termsPair.key.range : contents.range);
  }

  if (!isSeq(termsPair.value)) {
    throw createInvalidRootError(lineCounter, termsPair.value?.range ?? termsPair.key.range);
  }

  const terms: Term[] = [];
  for (const [index, entry] of termsPair.value.items.entries()) {
    const message = `Entry ${index + 1} must contain exactly the term and definition fields`;
    if (!isMap(entry)) {
      throw createLocatedError("invalid-schema", message, lineCounter, entry?.range ?? termsPair.value.range);
    }

    const fieldNames = new Set<string>();
    let invalidFieldRange: readonly number[] | null | undefined;
    for (const pair of entry.items) {
      if (!isScalar(pair.key) || (pair.key.value !== "term" && pair.key.value !== "definition")) {
        invalidFieldRange = isScalar(pair.key) ? pair.key.range : entry.range;
        break;
      }
      fieldNames.add(pair.key.value);
    }

    if (invalidFieldRange) {
      throw createLocatedError("invalid-schema", message, lineCounter, invalidFieldRange);
    }

    if (entry.items.length !== 2 || !fieldNames.has("term") || !fieldNames.has("definition")) {
      throw createLocatedError("invalid-schema", message, lineCounter, invalidFieldRange ?? entry.range);
    }

    const termPair = entry.items.find((pair) => isScalar(pair.key) && pair.key.value === "term");
    const definitionPair = entry.items.find((pair) => isScalar(pair.key) && pair.key.value === "definition");
    if (!termPair || !definitionPair) {
      throw createLocatedError("invalid-schema", message, lineCounter, entry.range);
    }

    const termNode = termPair.value;
    if (
      !isScalar(termNode) ||
      typeof termNode.value !== "string" ||
      termNode.value.length === 0 ||
      termNode.value.trim() !== termNode.value
    ) {
      throw createLocatedError(
        "invalid-schema",
        `Entry ${index + 1} term must be a non-empty string without surrounding whitespace`,
        lineCounter,
        isNode(termNode) ? termNode.range : termPair.key.range,
      );
    }
    const termValue = termNode.value;

    const definitionNode = definitionPair.value;
    if (!isScalar(definitionNode) || typeof definitionNode.value !== "string" || definitionNode.value.length === 0) {
      throw createLocatedError(
        "invalid-schema",
        `Entry ${index + 1} definition must be a non-empty string`,
        lineCounter,
        isNode(definitionNode) ? definitionNode.range : definitionPair.key.range,
      );
    }

    if (terms.some((term) => areTermsEquivalent(term.term, termValue))) {
      throw createLocatedError(
        "duplicate-term",
        `Entry ${index + 1} duplicates another term`,
        lineCounter,
        termNode.range,
      );
    }

    terms.push(Object.freeze({ definition: definitionNode.value, term: termValue }));
  }

  return Object.freeze(terms);
}
