import { describe, expect, test } from "vitest";

import type { Term } from "./types";
import { getTermListItemContent } from "./term-list-item-content";

describe("getTermListItemContent", () => {
  test.each([
    ["an ordinary definition", "Application Programming Interface"],
    ["a multiline definition", "First line\nSecond line"],
    ["a definition containing formatting markers", "**bold** `code` [link](https://example.com)"],
  ])("keeps %s as an unchanged plain-text subtitle", (_label, definition) => {
    const term: Term = { definition, term: "API" };

    expect(getTermListItemContent(term)).toEqual({
      id: "API",
      subtitle: definition,
      title: "API",
    });
  });
});
