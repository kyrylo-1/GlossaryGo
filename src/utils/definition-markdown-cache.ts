import { prepareMarkdownForDisplay } from "./prepare-markdown-for-display";

const MAX_CACHED_DEFINITIONS = 200;

type DefinitionFormatter = (definition: string) => string;

export type DefinitionMarkdownCache = Readonly<{
  getMarkdown: (definition: string) => string;
}>;

export const createDefinitionMarkdownCache = (
  formatDefinition: DefinitionFormatter = prepareMarkdownForDisplay,
): DefinitionMarkdownCache => {
  const markdownByDefinition = new Map<string, string>();

  const getMarkdown = (definition: string): string => {
    if (markdownByDefinition.has(definition)) {
      const cachedMarkdown = markdownByDefinition.get(definition) ?? "";
      markdownByDefinition.delete(definition);
      markdownByDefinition.set(definition, cachedMarkdown);
      return cachedMarkdown;
    }

    const markdown = formatDefinition(definition);
    markdownByDefinition.set(definition, markdown);
    if (markdownByDefinition.size > MAX_CACHED_DEFINITIONS) {
      const leastRecentlyUsedEntry = markdownByDefinition.keys().next();
      if (!leastRecentlyUsedEntry.done) {
        markdownByDefinition.delete(leastRecentlyUsedEntry.value);
      }
    }
    return markdown;
  };

  return { getMarkdown };
};
