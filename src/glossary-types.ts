import type { Document, Pair } from "yaml";

export type Term = Readonly<{
  term: string;
  definition: string;
}>;

export type ParsedGlossaryDocument = Document.Parsed;
export type SourceRange = readonly number[] | null | undefined;
export type EntryPairs = Readonly<{
  definitionPair: Pair<unknown, unknown>;
  termPair: Pair<unknown, unknown>;
}>;
