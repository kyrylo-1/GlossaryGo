import { open, type FileHandle } from "node:fs/promises";
import { TextDecoder } from "node:util";

import {
  type Document,
  isMap,
  isNode,
  isScalar,
  isSeq,
  LineCounter,
  type Pair,
  parseAllDocuments,
  type ParsedNode,
  visit,
  type YAMLMap,
  type YAMLSeq,
} from "yaml";

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

type ParsedGlossaryDocument = Document.Parsed;
type SourceRange = readonly number[] | null | undefined;
type EntryPairs = Readonly<{
  definitionPair: Pair<unknown, unknown>;
  termPair: Pair<unknown, unknown>;
}>;

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

const createLocatedError = (
  code: GlossaryErrorCode,
  message: string,
  lineCounter: LineCounter,
  range: readonly number[] | null | undefined,
): GlossaryError => {
  const line = lineCounter.linePos(range?.[0] ?? 0).line;
  return new GlossaryError(code, `${message} near line ${line}.`, line);
};

const createUnreadableError = (): GlossaryError => {
  return new GlossaryError(
    "unreadable",
    "The glossary file could not be read. Check that it still exists and is accessible.",
  );
};

const createInvalidRootError = (
  lineCounter: LineCounter,
  range: readonly number[] | null | undefined,
): GlossaryError => {
  return createLocatedError(
    "invalid-schema",
    "The glossary root must contain exactly one terms sequence",
    lineCounter,
    range,
  );
};

const getNodeRange = (node: unknown, fallbackNode: unknown): SourceRange => {
  if (isNode(node)) {
    return node.range;
  }
  if (isNode(fallbackNode)) {
    return fallbackNode.range;
  }
  return null;
};

const readGlossaryBytes = async (path: string): Promise<Buffer> => {
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
};

const decodeGlossary = (bytes: Buffer): string => {
  try {
    return new TextDecoder("utf8", { fatal: true }).decode(bytes);
  } catch {
    throw new GlossaryError("invalid-encoding", "The glossary file must use valid UTF-8.");
  }
};

const parseGlossaryDocument = (source: string, lineCounter: LineCounter): ParsedGlossaryDocument => {
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

  return documents[0];
};

const findUnsupportedYamlOffset = (document: ParsedGlossaryDocument): number | null => {
  let offset: number | null = null;
  visit(document, {
    Alias(_key, node) {
      offset = node.range?.[0] ?? 0;
      return visit.BREAK;
    },
    Node(_key, node) {
      if (node.anchor || node.tag) {
        offset = node.range?.[0] ?? 0;
        return visit.BREAK;
      }
    },
    Pair(_key, pair) {
      if (isScalar(pair.key) && pair.key.value === "<<") {
        offset = pair.key.range?.[0] ?? 0;
        return visit.BREAK;
      }
    },
  });
  return offset;
};

const rejectUnsupportedYaml = (
  source: string,
  document: ParsedGlossaryDocument,
  lineCounter: LineCounter,
): void => {
  const directiveOffset = /^%/m.exec(source)?.index;
  const warning = document.warnings[0];
  if (typeof directiveOffset === "number" || warning) {
    const line = lineCounter.linePos(directiveOffset ?? warning?.pos[0] ?? 0).line;
    throw new GlossaryError(
      "unsupported-yaml",
      `The glossary uses an unsupported YAML construct near line ${line}.`,
      line,
    );
  }

  const unsupportedOffset = findUnsupportedYamlOffset(document);
  if (unsupportedOffset !== null) {
    const line = lineCounter.linePos(unsupportedOffset).line;
    throw new GlossaryError(
      "unsupported-yaml",
      `The glossary uses an unsupported YAML construct near line ${line}.`,
      line,
    );
  }
};

const getTermsSequence = (contents: ParsedNode | null, lineCounter: LineCounter): YAMLSeq<unknown> => {
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
    throw createInvalidRootError(lineCounter, isNode(termsPair.value) ? termsPair.value.range : termsPair.key.range);
  }

  return termsPair.value;
};

const validateEntryFields = (
  entry: YAMLMap<unknown, unknown>,
  message: string,
  lineCounter: LineCounter,
): void => {
  const fieldNames = new Set<string>();
  let invalidFieldRange: SourceRange = null;
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
};

const getEntryPairs = (
  entry: unknown,
  index: number,
  lineCounter: LineCounter,
  sequenceRange: SourceRange,
): EntryPairs => {
  const message = `Entry ${index + 1} must contain exactly the term and definition fields`;
  if (!isMap(entry)) {
    throw createLocatedError(
      "invalid-schema",
      message,
      lineCounter,
      isNode(entry) ? entry.range : sequenceRange,
    );
  }

  validateEntryFields(entry, message, lineCounter);
  const termPair = entry.items.find((pair) => isScalar(pair.key) && pair.key.value === "term");
  const definitionPair = entry.items.find((pair) => isScalar(pair.key) && pair.key.value === "definition");
  if (!termPair || !definitionPair) {
    throw createLocatedError("invalid-schema", message, lineCounter, entry.range);
  }

  return { definitionPair, termPair };
};

const parseTermValue = (
  termPair: Pair<unknown, unknown>,
  index: number,
  lineCounter: LineCounter,
): string => {
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
      getNodeRange(termNode, termPair.key),
    );
  }
  return termNode.value;
};

const parseDefinitionValue = (
  definitionPair: Pair<unknown, unknown>,
  index: number,
  lineCounter: LineCounter,
): string => {
  const definitionNode = definitionPair.value;
  if (!isScalar(definitionNode) || typeof definitionNode.value !== "string" || definitionNode.value.length === 0) {
    throw createLocatedError(
      "invalid-schema",
      `Entry ${index + 1} definition must be a non-empty string`,
      lineCounter,
      getNodeRange(definitionNode, definitionPair.key),
    );
  }
  return definitionNode.value;
};

const parseGlossaryEntry = (
  entry: unknown,
  index: number,
  terms: readonly Term[],
  lineCounter: LineCounter,
  sequenceRange: SourceRange,
): Term => {
  const { definitionPair, termPair } = getEntryPairs(entry, index, lineCounter, sequenceRange);
  const termValue = parseTermValue(termPair, index, lineCounter);
  const definitionValue = parseDefinitionValue(definitionPair, index, lineCounter);

  if (terms.some((term) => areTermsEquivalent(term.term, termValue))) {
    throw createLocatedError(
      "duplicate-term",
      `Entry ${index + 1} duplicates another term`,
      lineCounter,
      isNode(termPair.value) ? termPair.value.range : null,
    );
  }

  return Object.freeze({ definition: definitionValue, term: termValue });
};

const parseGlossaryTerms = (document: ParsedGlossaryDocument, lineCounter: LineCounter): readonly Term[] => {
  const termsSequence = getTermsSequence(document.contents, lineCounter);
  const terms: Term[] = [];
  for (const [index, entry] of termsSequence.items.entries()) {
    terms.push(parseGlossaryEntry(entry, index, terms, lineCounter, termsSequence.range));
  }
  return Object.freeze(terms);
};

export const loadGlossary = async (path: string): Promise<readonly Term[]> => {
  if (!path.endsWith(".yaml")) {
    throw new GlossaryError("invalid-extension", "Choose a file with the .yaml extension.");
  }

  const bytes = await readGlossaryBytes(path);
  const source = decodeGlossary(bytes);
  const lineCounter = new LineCounter();
  const document = parseGlossaryDocument(source, lineCounter);
  rejectUnsupportedYaml(source, document, lineCounter);
  return parseGlossaryTerms(document, lineCounter);
};
