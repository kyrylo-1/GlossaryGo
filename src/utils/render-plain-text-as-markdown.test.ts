import { describe, expect, test } from "vitest";

import { renderPlainTextAsMarkdown } from "./render-plain-text-as-markdown";

describe("renderPlainTextAsMarkdown", () => {
  test("renders long prose with explicit line breaks instead of a code block", () => {
    expect(renderPlainTextAsMarkdown("First line\nSecond line")).toBe("First line  \nSecond line");
  });

  test("escapes Markdown, HTML, links, and entities as literal text", () => {
    expect(renderPlainTextAsMarkdown("# Title\n**bold** _text_ `code` [link](https://example.com) <b> &copy; \\")).toBe(
      "\\# Title  \n\\*\\*bold\\*\\* \\_text\\_ \\`code\\` \\[link\\]\\(https\\:\\/\\/example\\.com\\) \\<b\\> \\&copy\\; \\\\",
    );
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
