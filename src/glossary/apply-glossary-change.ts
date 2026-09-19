import { isMap, isScalar, isSeq, type YAMLSeq } from "yaml";

import { MAXIMUM_GLOSSARY_BYTES } from "../constants";
import type { Term } from "../utils/types";
import { GlossaryError } from "./glossary-error";
import { resolveSelectedIndex } from "./entry-identity";
import { compareTermNames } from "./term-name-order";
import { parseValidatedGlossarySource } from "./validated-glossary-source";

export type GlossaryChange =
  | Readonly<{ term: Term; type: "add" }>
  | Readonly<{ original: Term; term: Term; type: "edit" }>
  | Readonly<{ original: Term; type: "delete" }>;

const normalizeTerm = (term: Term): Term => {
  const normalizedTerm = { definition: term.definition, term: term.term.trim() };
  if (normalizedTerm.term.length === 0 || normalizedTerm.definition.trim().length === 0) {
    throw new GlossaryError("invalid-schema", "Term and definition must contain non-whitespace text.");
  }
  return normalizedTerm;
};

const sortTermsSequence = (sequence: YAMLSeq, terms: readonly Term[]): void => {
  sequence.items = sequence.items
    .map((node, index) => ({ name: terms[index].term, node }))
    .sort((left, right) => compareTermNames(left.name, right.name))
    .map(({ node }) => node);
};

const countInterstitialBlankLines = (source: string): number => {
  const lines = source.split(/\r\n|\r|\n/);
  return lines.slice(0, -1).filter((line) => /^[\t ]*$/.test(line)).length;
};

const countEmbeddedCommentBlankLines = (commentBefore: string): number => {
  const trailingLineBreaks = commentBefore.match(/(?:(?:\r\n|\r|\n)[\t ]*)+$/)?.[0] ?? "";
  return trailingLineBreaks.match(/\r\n|\r|\n/g)?.length ?? 0;
};

const getGapInsertionOffset = (interstitial: string, previousEnd: number): number => {
  const firstLineBreak = interstitial.match(/\r\n|\r|\n/);
  return typeof firstLineBreak?.index === "number"
    ? previousEnd + firstLineBreak.index + firstLineBreak[0].length
    : previousEnd;
};

type GapInsertion = Readonly<{ count: number; offset: number }>;

const insertGapLines = (source: string, insertions: readonly GapInsertion[]): string => {
  const parts: string[] = [];
  let sourceOffset = 0;
  for (const insertion of insertions) {
    parts.push(source.slice(sourceOffset, insertion.offset), "\n".repeat(insertion.count));
    sourceOffset = insertion.offset;
  }
  parts.push(source.slice(sourceOffset));
  return parts.join("");
};

const captureEntryGapCounts = (source: string, sequence: YAMLSeq): Map<object, number> => {
  const gapCounts = new Map<object, number>();
  for (let index = 1; index < sequence.items.length; index += 1) {
    const previous = sequence.items[index - 1];
    const entry = sequence.items[index];
    const previousEnd = previous?.range?.[2];
    const entryStart = entry?.range?.[0];
    if (previous && entry && typeof previousEnd === "number" && typeof entryStart === "number") {
      const interstitial = source.slice(previousEnd, entryStart);
      gapCounts.set(entry, countInterstitialBlankLines(interstitial));
    }
  }
  return gapCounts;
};

const separateTerms = (sequence: YAMLSeq, originalGapCounts: ReadonlyMap<object, number>): readonly number[] => {
  const firstEntry = sequence.items[0];
  const embeddedCommentGapCount = countEmbeddedCommentBlankLines(firstEntry?.commentBefore ?? "");
  const displacedFirstGapCount =
    firstEntry?.spaceBefore === true
      ? Math.max(0, (originalGapCounts.get(firstEntry) ?? 0) - embeddedCommentGapCount)
      : 0;
  if (firstEntry && originalGapCounts.has(firstEntry)) {
    firstEntry.spaceBefore = false;
  }
  const requiredGapCounts: number[] = [];
  for (const [index, entry] of sequence.items.slice(1).entries()) {
    if (entry) {
      const originalGapCount = originalGapCounts.get(entry) ?? 0;
      if (originalGapCount === 0) {
        entry.spaceBefore = true;
      }
      requiredGapCounts.push(Math.max(1, originalGapCount, index === 0 ? displacedFirstGapCount : 0));
    }
  }
  return requiredGapCounts;
};

const restoreLargerEntryGaps = (source: string, requiredGapCounts: readonly number[]): string => {
  if (requiredGapCounts.every((count) => count <= 1)) {
    return source;
  }
  const { document } = parseValidatedGlossarySource(source);
  const sequence = document.get("terms", true);
  if (!isSeq(sequence)) {
    throw new GlossaryError("invalid-schema", "The glossary terms field must be a sequence.");
  }

  const insertions: GapInsertion[] = [];
  for (let index = 1; index < sequence.items.length; index += 1) {
    const previous = sequence.items[index - 1];
    const entry = sequence.items[index];
    const previousEnd = previous?.range?.[2];
    const entryStart = entry?.range?.[0];
    if (typeof previousEnd === "number" && typeof entryStart === "number") {
      const interstitial = source.slice(previousEnd, entryStart);
      const missingGapCount = requiredGapCounts[index - 1] - countInterstitialBlankLines(interstitial);
      if (missingGapCount > 0) {
        insertions.push({ count: missingGapCount, offset: getGapInsertionOffset(interstitial, previousEnd) });
      }
    }
  }
  return insertGapLines(source, insertions);
};

const applyExistingEntryChange = (
  source: string,
  terms: readonly Term[],
  sequence: YAMLSeq,
  change: Exclude<GlossaryChange, Readonly<{ term: Term; type: "add" }>>,
  originalGapCounts: Map<object, number>,
): boolean => {
  const index = resolveSelectedIndex(source, terms, change.original);
  if (
    index === -1 ||
    terms[index].term !== change.original.term ||
    terms[index].definition !== change.original.definition
  ) {
    throw new GlossaryError(
      "stale-term",
      "The selected term changed or was removed. Reload the glossary and try again.",
    );
  }
  if (change.type === "delete") {
    const removedEntry = sequence.items[index];
    const followingEntry = sequence.items[index + 1];
    if (index > 0 && removedEntry && followingEntry) {
      originalGapCounts.set(
        followingEntry,
        Math.max(originalGapCounts.get(removedEntry) ?? 0, originalGapCounts.get(followingEntry) ?? 0),
      );
    }
    sequence.delete(index);
    return true;
  }

  const entry = sequence.items[index];
  const normalizedTerm = normalizeTerm(change.term);
  if (normalizedTerm.term === terms[index].term && normalizedTerm.definition === terms[index].definition) {
    return false;
  }
  if (!isMap(entry)) {
    throw new GlossaryError("invalid-schema", "The selected term must have string fields.");
  }
  const termScalar = entry.get("term", true);
  const definitionScalar = entry.get("definition", true);
  if (!isScalar(termScalar) || !isScalar(definitionScalar)) {
    throw new GlossaryError("invalid-schema", "The selected term must have string fields.");
  }
  termScalar.value = normalizedTerm.term;
  definitionScalar.value = normalizedTerm.definition;
  return true;
};

export const applyGlossaryChange = (source: string, change: GlossaryChange): string => {
  const { document, terms } = parseValidatedGlossarySource(source);
  const sequence = document.get("terms", true);
  if (!isSeq(sequence)) {
    throw new GlossaryError("invalid-schema", "The glossary terms field must be a sequence.");
  }
  const originalGapCounts = captureEntryGapCounts(source, sequence);

  if (change.type === "add") {
    const term = normalizeTerm(change.term);
    document.addIn(["terms"], document.createNode(term));
    sortTermsSequence(sequence, [...terms, term]);
  } else {
    const changed = applyExistingEntryChange(source, terms, sequence, change, originalGapCounts);
    if (!changed) {
      return source;
    }
  }

  const requiredGapCounts = separateTerms(sequence, originalGapCounts);
  const serializedSource = restoreLargerEntryGaps(document.toString(), requiredGapCounts);
  const nextSource = `${source.startsWith("\uFEFF") ? "\uFEFF" : ""}${serializedSource}`;
  if (Buffer.byteLength(nextSource, "utf8") > MAXIMUM_GLOSSARY_BYTES) {
    throw new GlossaryError("too-large", "The glossary file is larger than 5 MiB.");
  }
  parseValidatedGlossarySource(nextSource);
  return nextSource;
};
