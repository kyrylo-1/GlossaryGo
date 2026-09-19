import { describe, expect, test, vi } from "vitest";

import { createDefinitionMarkdownCache } from "./definition-markdown-cache";

describe("createDefinitionMarkdownCache", () => {
  test("reuses formatted Markdown for the same definition", () => {
    const formatDefinition = vi.fn<(definition: string) => string>((definition) => `formatted ${definition}`);
    const cache = createDefinitionMarkdownCache(formatDefinition);

    expect(cache.getMarkdown("Synthetic definition")).toBe("formatted Synthetic definition");
    expect(cache.getMarkdown("Synthetic definition")).toBe("formatted Synthetic definition");

    expect(formatDefinition).toHaveBeenCalledExactlyOnceWith("Synthetic definition");
  });

  test("evicts the least recently used definition after the bounded session cache fills", () => {
    const formatDefinition = vi.fn<(definition: string) => string>((definition) => definition);
    const cache = createDefinitionMarkdownCache(formatDefinition);
    const definitions = Array.from({ length: 200 }, (_, index) => `Synthetic definition ${index + 1}`);

    definitions.forEach((definition) => cache.getMarkdown(definition));
    cache.getMarkdown(definitions[0]);
    cache.getMarkdown("Synthetic definition 201");
    cache.getMarkdown(definitions[1]);

    expect(formatDefinition).toHaveBeenCalledTimes(202);
    expect(formatDefinition).toHaveBeenLastCalledWith(definitions[1]);
  });
});
