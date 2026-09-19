import { parse, postprocess, preprocess } from "micromark";

import { renderPlainTextAsMarkdown } from "./render-plain-text-as-markdown";

const maximumSanitizationPasses = 2;

type SourceRange = Readonly<{ end: number; start: number }>;

type SanitizationPlan = Readonly<{ htmlRanges: SourceRange[]; imageOffsets: number[] }>;

const getSanitizationPlan = (markdown: string): SanitizationPlan => {
  const htmlRanges: SourceRange[] = [];
  const imageOffsets: number[] = [];
  const events = postprocess(
    parse()
      .document()
      .write(preprocess()(markdown, null, true)),
  );
  for (const [kind, token] of events) {
    if (kind === "enter") {
      if (token.type === "image") {
        imageOffsets.push(token.start.offset);
      } else if (token.type === "htmlFlow" || token.type === "htmlText") {
        htmlRanges.push({ end: token.end.offset, start: token.start.offset });
      }
    }
  }
  const mergedHtmlRanges = htmlRanges
    .sort((left, right) => left.start - right.start)
    .reduce<SourceRange[]>((merged, range) => {
      const previous = merged.at(-1);
      if (previous && range.start <= previous.end) {
        merged[merged.length - 1] = { end: Math.max(previous.end, range.end), start: previous.start };
      } else {
        merged.push(range);
      }
      return merged;
    }, []);
  return { htmlRanges: mergedHtmlRanges, imageOffsets: [...new Set(imageOffsets)].sort((left, right) => left - right) };
};

const getImageOffsetsOutsideHtml = (imageOffsets: readonly number[], htmlRanges: readonly SourceRange[]): number[] => {
  const outsideHtml: number[] = [];
  let htmlIndex = 0;
  for (const offset of imageOffsets) {
    while (htmlRanges[htmlIndex] && htmlRanges[htmlIndex].end <= offset) {
      htmlIndex += 1;
    }
    const containingHtml = htmlRanges[htmlIndex];
    if (!containingHtml || offset < containingHtml.start) {
      outsideHtml.push(offset);
    }
  }
  return outsideHtml;
};

const applySanitizationPlan = (markdown: string, plan: SanitizationPlan): string => {
  const imageOffsets = getImageOffsetsOutsideHtml(plan.imageOffsets, plan.htmlRanges);
  const parts: string[] = [];
  let sourceOffset = 0;
  let htmlIndex = 0;
  let imageIndex = 0;
  while (htmlIndex < plan.htmlRanges.length || imageIndex < imageOffsets.length) {
    const htmlRange = plan.htmlRanges[htmlIndex];
    const imageOffset = imageOffsets[imageIndex];
    if (htmlRange && (imageIndex === imageOffsets.length || htmlRange.start <= imageOffset)) {
      parts.push(
        markdown.slice(sourceOffset, htmlRange.start),
        renderPlainTextAsMarkdown(markdown.slice(htmlRange.start, htmlRange.end)),
      );
      sourceOffset = htmlRange.end;
      htmlIndex += 1;
    } else {
      parts.push(markdown.slice(sourceOffset, imageOffset), "&#33;");
      sourceOffset = imageOffset + 1;
      imageIndex += 1;
    }
  }
  parts.push(markdown.slice(sourceOffset));
  return parts.join("");
};

const fallbackToLiteralMarkdown = (markdown: string): string => {
  return renderPlainTextAsMarkdown(markdown);
};

const hasInvalidPlan = (markdown: string, plan: SanitizationPlan): boolean => {
  const { length } = markdown;
  return (
    plan.htmlRanges.some((range) => range.start < 0 || range.end < range.start || range.end > length) ||
    plan.imageOffsets.some((offset) => offset < 0 || offset >= length || markdown[offset] !== "!")
  );
};

/**
 * Retains CommonMark presentation while neutralizing tokenized images and raw
 * HTML. Token offsets leave code spans and fenced code byte-for-byte intact.
 */
export const prepareMarkdownForDisplay = (markdown: string): string => {
  let result = markdown;
  for (let iteration = 0; iteration < maximumSanitizationPasses; iteration += 1) {
    const plan = getSanitizationPlan(result);
    if (plan.htmlRanges.length === 0 && plan.imageOffsets.length === 0) {
      return result;
    }
    if (hasInvalidPlan(result, plan)) {
      return fallbackToLiteralMarkdown(result);
    }
    const next = applySanitizationPlan(result, plan);
    if (next === result) {
      return fallbackToLiteralMarkdown(result);
    }
    result = next;
  }
  const finalPlan = getSanitizationPlan(result);
  return finalPlan.htmlRanges.length === 0 && finalPlan.imageOffsets.length === 0
    ? result
    : fallbackToLiteralMarkdown(result);
};
