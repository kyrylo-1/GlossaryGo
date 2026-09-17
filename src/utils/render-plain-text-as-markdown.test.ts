import { describe, expect, test } from "vitest";

import { renderPlainTextAsMarkdown } from "./render-plain-text-as-markdown";

describe("renderPlainTextAsMarkdown", () => {
  test("renders long prose with explicit line breaks instead of a code block", () => {
    expect(renderPlainTextAsMarkdown("First line\nSecond line")).toBe("First line  \nSecond line");
  });

  test.each([
    ["# Title", "&#35; Title"],
    ["**bold** _text_ `code`", "&#42;&#42;bold&#42;&#42; &#95;text&#95; &#96;code&#96;"],
    ["[link](url)", "&#91;link&#93;&#40;url&#41;"],
    ["<b> &copy;", "&#60;b&#62; &#38;copy&#59;"],
    [String.raw`$math$ \[brackets\]`, "&#36;math&#36; &#92;&#91;brackets&#92;&#93;"],
  ])("renders punctuation literally without Markdown or math syntax: %s", (input, expected) => {
    expect(renderPlainTextAsMarkdown(input)).toBe(expected);
  });

  test("preserves blank lines and leading whitespace without creating indented code", () => {
    expect(renderPlainTextAsMarkdown("    indented\n\n\tTabbed\n")).toBe(
      "&#32;&#32;&#32;&#32;indented  \n&#160;  \n&#9;Tabbed  \n&#160;",
    );
  });

  test("preserves Unicode prose", () => {
    expect(renderPlainTextAsMarkdown("Résumé 👩‍💻")).toBe("Résumé 👩‍💻");
  });
});
