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

type TerminalFlowMarker = Readonly<{
  owner: NonNullable<YAMLSeq["items"][number]>;
  suffix: string;
}>;

const normalizeTerminalInlineFlowComment = (source: string, sequence: YAMLSeq): TerminalFlowMarker | undefined => {
  const lastEntry = sequence.items.at(-1);
  const lastEntryValueEnd = lastEntry?.range?.[1];
  const lastEntryEnd = lastEntry?.range?.[2];
  const sequenceEnd = sequence.range?.[2];
  if (
    !lastEntry ||
    typeof lastEntryValueEnd !== "number" ||
    typeof lastEntryEnd !== "number" ||
    typeof sequenceEnd !== "number"
  ) {
    return;
  }
  const trailingLines = source.slice(lastEntryEnd, sequenceEnd).split(/\r\n|\r|\n/);
  const inlineComment = trailingLines[0].match(/^[\t ]*,[\t ]*#([\t ]*)$/);
  if (inlineComment) {
    sequence.comment = (sequence.comment ?? "")
      .split(/\r\n|\r|\n/)
      .slice(1)
      .join("\n");
    if (typeof lastEntry.comment === "string") {
      return { owner: lastEntry, suffix: inlineComment[1] };
    }
    lastEntry.comment = inlineComment[1].length > 0 ? inlineComment[1] : " ";
    return;
  }

  const valueTrailingLines = source.slice(lastEntryValueEnd, sequenceEnd).split(/\r\n|\r|\n/);
  const noCommaInlineComment = valueTrailingLines[0].match(/^[\t ]*#(.*)$/);
  if (noCommaInlineComment && typeof lastEntry.comment === "string") {
    const commentLines = lastEntry.comment.split(/\r\n|\r|\n/);
    lastEntry.comment = noCommaInlineComment[1].length > 0 ? noCommaInlineComment[1] : " ";
    sequence.comment = commentLines.slice(1).join("\n");
  }
};

const preserveStandaloneSequenceCommentGap = (source: string, sequence: YAMLSeq): void => {
  const sequenceValueEnd = sequence.range?.[1];
  const sequenceEnd = sequence.range?.[2];
  if (typeof sequence.comment !== "string" || typeof sequenceValueEnd !== "number" || typeof sequenceEnd !== "number") {
    return;
  }
  const trailingSource = source.slice(sequenceValueEnd, sequenceEnd);
  const leadingLines = trailingSource.match(/^((?:[\t ]*(?:\r\n|\r|\n))+)[\t ]*#/);
  if (!leadingLines) {
    return;
  }
  const lineBreakCount = leadingLines[1].match(/\r\n|\r|\n/g)?.length ?? 0;
  const blankLineCount = Math.max(0, lineBreakCount - 1);
  if (blankLineCount > 0 && !sequence.comment.startsWith("\n")) {
    sequence.comment = `${"\n".repeat(blankLineCount)}${sequence.comment}`;
  }
};

const normalizeBareInlineFlowComments = (source: string, sequence: YAMLSeq): TerminalFlowMarker | undefined => {
  if (sequence.flow !== true) {
    return;
  }
  let distinctFlowMarker: TerminalFlowMarker | undefined;
  for (let index = 1; index < sequence.items.length; index += 1) {
    const previous = sequence.items[index - 1];
    const entry = sequence.items[index];
    const previousEnd = previous?.range?.[2];
    const entryStart = entry?.range?.[0];
    if (previous && entry && typeof previousEnd === "number" && typeof entryStart === "number") {
      const interstitialLines = source.slice(previousEnd, entryStart).split(/\r\n|\r|\n/);
      const bareInlineComment = interstitialLines[0].match(/^[\t ]*,[\t ]*#([\t ]*)$/);
      if (bareInlineComment && typeof previous.comment !== "string") {
        previous.comment = bareInlineComment[1].length > 0 ? bareInlineComment[1] : " ";
        const firstAttachedCommentIndex = interstitialLines.slice(0, -1).findIndex((line) => /^[\t ]*#/.test(line));
        const commentBeforeLines = (entry.commentBefore ?? "").split(/\r\n|\r|\n/);
        entry.commentBefore =
          firstAttachedCommentIndex === -1 ? "" : commentBeforeLines.slice(firstAttachedCommentIndex).join("\n");
      } else if (bareInlineComment && typeof previous.comment === "string") {
        const commentLines = previous.comment.split(/\r\n|\r|\n/);
        if (commentLines.length > 1) {
          previous.comment = commentLines.slice(0, -1).join("\n");
          distinctFlowMarker = { owner: previous, suffix: bareInlineComment[1] };
        }
      }
    }
  }
  const terminalFlowMarker = normalizeTerminalInlineFlowComment(source, sequence);
  preserveStandaloneSequenceCommentGap(source, sequence);
  return terminalFlowMarker ?? distinctFlowMarker;
};

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

const measureEntryGap = (
  source: string,
  sequence: YAMLSeq,
  index: number,
  precedingOwnerMarker = false,
): EntryGap | undefined => {
  const previous = sequence.items[index - 1];
  const entry = sequence.items[index];
  const previousEnd = previous?.range?.[2];
  const entryStart = entry?.range?.[0];
  if (!previous || !entry || typeof previousEnd !== "number" || typeof entryStart !== "number") {
    return;
  }

  const interstitial = source.slice(previousEnd, entryStart);
  const interstitialLines = interstitial.split(/\r\n|\r|\n/).slice(0, -1);
  const entryOwnedLines = precedingOwnerMarker ? interstitialLines.slice(1) : interstitialLines;
  const firstAttachedCommentIndex = entryOwnedLines.findIndex((line) => /^[\t ]*#/.test(line));
  const hasAttachedCommentMarker = firstAttachedCommentIndex !== -1;
  const totalBlankLines = countInterstitialBlankLines(interstitial);
  const externalBlankLines = hasAttachedCommentMarker
    ? entryOwnedLines.slice(0, firstAttachedCommentIndex).filter((line) => /^[\t ]*$/.test(line)).length
    : totalBlankLines;
  return {
    embeddedCommentBlankLines: totalBlankLines - externalBlankLines,
    externalBlankLines,
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

const captureEntryGaps = (
  source: string,
  sequence: YAMLSeq,
  flowMarker: TerminalFlowMarker | undefined,
): Map<object, EntryGap> => {
  const gaps = new Map<object, EntryGap>();
  const markerOwnerIndex = flowMarker ? sequence.items.indexOf(flowMarker.owner) : -1;
  for (let index = 1; index < sequence.items.length; index += 1) {
    const entry = sequence.items[index];
    const gap = measureEntryGap(source, sequence, index, markerOwnerIndex === index - 1);
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
  normalizeBareInlineFlowComments(source, sequence);

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

const restoreNonterminalFlowMarker = (source: string, ownerValueEnd: number, markerLine: string): string => {
  const ownerLineEnd = source.indexOf("\n", ownerValueEnd);
  const ownerLineSuffix = ownerLineEnd === -1 ? "" : source.slice(ownerValueEnd, ownerLineEnd);
  const separatingComma = ownerLineSuffix.match(/^[\t ]*,(?=[\t ]*#)/);
  if (ownerLineEnd === -1 || typeof separatingComma?.index !== "number") {
    return source;
  }
  const commaOffset = ownerValueEnd + separatingComma.index + separatingComma[0].indexOf(",");
  return `${source.slice(0, commaOffset)}${source.slice(commaOffset + 1, ownerLineEnd + 1)}${markerLine}${source.slice(ownerLineEnd + 1)}`;
};

const restoreFinalFlowMarker = (source: string, sequence: YAMLSeq, markerLine: string): string => {
  const sequenceValueEnd = sequence.range?.[1];
  const closingOffset = typeof sequenceValueEnd === "number" ? source.lastIndexOf("]", sequenceValueEnd - 1) : -1;
  const closingLineStart = closingOffset === -1 ? -1 : source.lastIndexOf("\n", closingOffset - 1) + 1;
  if (closingLineStart < 0 || !/^[\t ]*$/.test(source.slice(closingLineStart, closingOffset))) {
    return source;
  }
  return `${source.slice(0, closingLineStart)}${markerLine}${source.slice(closingLineStart)}`;
};

const restoreTerminalFlowMarker = (
  source: string,
  marker: TerminalFlowMarker | undefined,
  ownerIndex: number,
): string => {
  if (!marker || ownerIndex < 0) {
    return source;
  }
  const { document } = parseValidatedGlossarySource(source);
  const sequence = document.get("terms", true);
  if (!isSeq(sequence) || sequence.flow !== true) {
    return source;
  }
  const owner = sequence.items[ownerIndex];
  const ownerStart = owner?.range?.[0];
  const ownerValueEnd = owner?.range?.[1];
  if (!owner || typeof ownerStart !== "number" || typeof ownerValueEnd !== "number") {
    return source;
  }
  const ownerLineStart = source.lastIndexOf("\n", ownerStart - 1) + 1;
  const ownerIndent = source.slice(ownerLineStart, ownerStart);
  if (!/^[\t ]*$/.test(ownerIndent)) {
    return source;
  }
  const normalizedSuffix = marker.suffix === " " ? "" : marker.suffix;
  const markerLine = `${ownerIndent}, #${normalizedSuffix}\n`;
  if (ownerIndex < sequence.items.length - 1) {
    return restoreNonterminalFlowMarker(source, ownerValueEnd, markerLine);
  }
  return restoreFinalFlowMarker(source, sequence, markerLine);
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
  const terminalFlowMarker = normalizeBareInlineFlowComments(source, sequence);
  const originalEntryGaps = captureEntryGaps(source, sequence, terminalFlowMarker);

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
  const terminalFlowMarkerOwnerIndex = terminalFlowMarker ? sequence.items.indexOf(terminalFlowMarker.owner) : -1;
  const gapRestoredSource = restoreLargerEntryGaps(document.toString(), requiredEntryGaps);
  const serializedSource = restoreTerminalFlowMarker(
    gapRestoredSource,
    terminalFlowMarker,
    terminalFlowMarkerOwnerIndex,
  );
  const nextSource = `${source.startsWith("\uFEFF") ? "\uFEFF" : ""}${serializedSource}`;
  if (Buffer.byteLength(nextSource, "utf8") > MAXIMUM_GLOSSARY_BYTES) {
    throw new GlossaryError("too-large", "The glossary file is larger than 5 MiB.");
  }
  parseValidatedGlossarySource(nextSource);
  return nextSource;
};
