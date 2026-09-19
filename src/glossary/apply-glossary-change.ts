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

const countEmbeddedCommentBlankLines = (commentBefore: string): number =>
  countInterstitialBlankLines(commentBefore) + (/(?:\r\n|\r|\n)[\t ]*$/.test(commentBefore) ? 1 : 0);

const isBlankOnly = (source: string): boolean => source.length > 0 && /^[\t \r\n]*$/.test(source);

const getGapInsertionOffset = (interstitial: string, previousEnd: number): number => {
  const firstLineBreak = interstitial.match(/\r\n|\r|\n/);
  return typeof firstLineBreak?.index === "number"
    ? previousEnd + firstLineBreak.index + firstLineBreak[0].length
    : previousEnd;
};

type GapInsertion = Readonly<{ count: number; offset: number }>;
type EntryGap = Readonly<{
  embeddedCommentBlankLines: number;
  externalBlankLines: number;
  hasAttachedCommentMarker: boolean;
}>;

const EMPTY_ENTRY_GAP: EntryGap = {
  embeddedCommentBlankLines: 0,
  externalBlankLines: 0,
  hasAttachedCommentMarker: false,
};

const measureEntryGap = (source: string, sequence: YAMLSeq, index: number): EntryGap | undefined => {
  const previous = sequence.items[index - 1];
  const entry = sequence.items[index];
  const previousEnd = previous?.range?.[2];
  const entryStart = entry?.range?.[0];
  if (!previous || !entry || typeof previousEnd !== "number" || typeof entryStart !== "number") {
    return;
  }

  const interstitial = source.slice(previousEnd, entryStart);
  const interstitialLines = interstitial.split(/\r\n|\r|\n/).slice(0, -1);
  const firstAttachedCommentIndex = interstitialLines.findIndex((line) => /^[\t ]*#/.test(line));
  const hasAttachedCommentMarker = firstAttachedCommentIndex !== -1;
  const totalBlankLines = countInterstitialBlankLines(interstitial);
  if (sequence.flow === true && typeof previous.comment === "string") {
    const externalBlankLines = hasAttachedCommentMarker
      ? interstitialLines.slice(0, firstAttachedCommentIndex).filter((line) => /^[\t ]*$/.test(line)).length
      : totalBlankLines;
    return {
      embeddedCommentBlankLines: totalBlankLines - externalBlankLines,
      externalBlankLines,
      hasAttachedCommentMarker,
    };
  }

  const embeddedCommentBlankLines = countEmbeddedCommentBlankLines(entry.commentBefore ?? "");
  return {
    embeddedCommentBlankLines,
    externalBlankLines: Math.max(0, totalBlankLines - embeddedCommentBlankLines),
    hasAttachedCommentMarker,
  };
};

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

const captureEntryGaps = (source: string, sequence: YAMLSeq): Map<object, EntryGap> => {
  const gaps = new Map<object, EntryGap>();
  for (let index = 1; index < sequence.items.length; index += 1) {
    const entry = sequence.items[index];
    const gap = measureEntryGap(source, sequence, index);
    if (entry && gap) {
      gaps.set(entry, gap);
    }
  }
  return gaps;
};

const separateTerms = (sequence: YAMLSeq, originalEntryGaps: ReadonlyMap<object, EntryGap>): readonly EntryGap[] => {
  const firstEntry = sequence.items[0];
  const firstEntryGap = firstEntry && originalEntryGaps.get(firstEntry);
  const displacedFirstExternalGap = firstEntryGap?.externalBlankLines ?? 0;
  if (firstEntry && firstEntryGap) {
    firstEntry.spaceBefore = false;
    if (
      sequence.flow === true &&
      !firstEntryGap.hasAttachedCommentMarker &&
      isBlankOnly(firstEntry.commentBefore ?? "")
    ) {
      firstEntry.commentBefore = "";
    }
  }
  const requiredEntryGaps: EntryGap[] = [];
  for (const [index, entry] of sequence.items.slice(1).entries()) {
    if (entry) {
      const originalGap = originalEntryGaps.get(entry) ?? {
        ...EMPTY_ENTRY_GAP,
        embeddedCommentBlankLines: countEmbeddedCommentBlankLines(entry.commentBefore ?? ""),
        hasAttachedCommentMarker: typeof entry.commentBefore === "string",
      };
      const preservedExternalGap = Math.max(
        originalGap.externalBlankLines,
        index === 0 ? displacedFirstExternalGap : 0,
      );
      const requiredExternalGap =
        preservedExternalGap === 0 && originalGap.embeddedCommentBlankLines === 0 ? 1 : preservedExternalGap;
      entry.spaceBefore = requiredExternalGap > 0;
      requiredEntryGaps.push({
        embeddedCommentBlankLines: originalGap.embeddedCommentBlankLines,
        externalBlankLines: requiredExternalGap,
        hasAttachedCommentMarker: originalGap.hasAttachedCommentMarker,
      });
    }
  }
  return requiredEntryGaps;
};

const restoreLargerEntryGaps = (source: string, requiredEntryGaps: readonly EntryGap[]): string => {
  if (requiredEntryGaps.every(({ externalBlankLines }) => externalBlankLines <= 1)) {
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
      const actualExternalBlankLines = measureEntryGap(source, sequence, index)?.externalBlankLines ?? 0;
      const missingGapCount = requiredEntryGaps[index - 1].externalBlankLines - actualExternalBlankLines;
      if (missingGapCount > 0) {
        insertions.push({ count: missingGapCount, offset: getGapInsertionOffset(interstitial, previousEnd) });
      }
    }
  }
  return insertGapLines(source, insertions);
};

const transferDeletedEntryExternalGap = (
  sequence: YAMLSeq,
  index: number,
  originalEntryGaps: Map<object, EntryGap>,
): void => {
  const removedEntry = sequence.items[index];
  const followingEntry = sequence.items[index + 1];
  if (index > 0 && removedEntry && followingEntry) {
    const removedGap = originalEntryGaps.get(removedEntry) ?? EMPTY_ENTRY_GAP;
    const followingGap = originalEntryGaps.get(followingEntry) ?? EMPTY_ENTRY_GAP;
    originalEntryGaps.set(followingEntry, {
      embeddedCommentBlankLines: followingGap.embeddedCommentBlankLines,
      externalBlankLines: Math.max(removedGap.externalBlankLines, followingGap.externalBlankLines),
      hasAttachedCommentMarker: followingGap.hasAttachedCommentMarker,
    });
  }
};

const applyExistingEntryChange = (
  source: string,
  terms: readonly Term[],
  sequence: YAMLSeq,
  change: Exclude<GlossaryChange, Readonly<{ term: Term; type: "add" }>>,
  originalEntryGaps: Map<object, EntryGap>,
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
    transferDeletedEntryExternalGap(sequence, index, originalEntryGaps);
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
  const originalEntryGaps = captureEntryGaps(source, sequence);

  if (change.type === "add") {
    const term = normalizeTerm(change.term);
    document.addIn(["terms"], document.createNode(term));
    sortTermsSequence(sequence, [...terms, term]);
  } else {
    const changed = applyExistingEntryChange(source, terms, sequence, change, originalEntryGaps);
    if (!changed) {
      return source;
    }
  }

  const requiredEntryGaps = separateTerms(sequence, originalEntryGaps);
  const serializedSource = restoreLargerEntryGaps(document.toString(), requiredEntryGaps);
  const nextSource = `${source.startsWith("\uFEFF") ? "\uFEFF" : ""}${serializedSource}`;
  if (Buffer.byteLength(nextSource, "utf8") > MAXIMUM_GLOSSARY_BYTES) {
    throw new GlossaryError("too-large", "The glossary file is larger than 5 MiB.");
  }
  parseValidatedGlossarySource(nextSource);
  return nextSource;
};
