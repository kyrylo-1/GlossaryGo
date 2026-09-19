import { describe, expect, test } from "vitest";

import { prepareMarkdownForDisplay } from "./prepare-markdown-for-display";

// eslint-disable-next-line max-lines-per-function -- Keeps the shared Markdown fixture next to its safety assertions.
describe("prepareMarkdownForDisplay", () => {
  test("preserves CommonMark prose while neutralizing active embeds and HTML tags", () => {
    const markdown = `# Heading

**bold** and _italic_ [ordinary link](https://example.test/docs)

- list item
> blockquote

![image](https://tracker.test/pixel)
![[obsidian-embed]]
<img src="https://tracker.test/pixel">
<iframe src="https://tracker.test/embed"></iframe>
<img
  src="https://tracker.test/multiline-pixel"
  alt="tracking pixel">`;

    const expected = [
      "# Heading",
      "",
      "**bold** and _italic_ [ordinary link](https://example.test/docs)",
      "",
      "- list item",
      "> blockquote",
      "",
      "&#33;[image](https://tracker.test/pixel)",
      "![[obsidian-embed]]",
      "&#60;img src&#61;&#34;https&#58;&#47;&#47;tracker&#46;test&#47;pixel&#34;&#62;",
      "&#60;iframe src&#61;&#34;https&#58;&#47;&#47;tracker&#46;test&#47;embed&#34;&#62;&#60;&#47;iframe&#62;  ",
      "&#60;img  ",
      "&#32;&#32;src&#61;&#34;https&#58;&#47;&#47;tracker&#46;test&#47;multiline&#45;pixel&#34;  ",
      "&#32;&#32;alt&#61;&#34;tracking pixel&#34;&#62;",
    ].join("\n");

    expect(prepareMarkdownForDisplay(markdown)).toBe(expected);
  });

  test("preserves image-like and HTML-like code exactly, including fenced diagram spacing", () => {
    const markdown = `Inline \`![code image](https://example.test/unchanged) <img src="unchanged">\`

\`\`\`
+---------+
| ![node] |
| <img>   |
+---------+
\`\`\``;

    expect(prepareMarkdownForDisplay(markdown)).toBe(markdown);
  });

  test("does not treat an unclosed inline code delimiter as a safety boundary", () => {
    const result = prepareMarkdownForDisplay("Unclosed `![image](https://tracker.test/pixel) <img> ");
    expect(result).toContain("&#33;[image](https://tracker.test/pixel)");
    expect(result).toContain("&#60;img&#62;");
  });

  test("neutralizes images after escaped or block-separated backtick delimiters", () => {
    const escapedBacktick = String.raw`\``;
    const escapedDelimiter = [escapedBacktick, "![secret](https://tracker.test/pixel)", "`"].join("");
    const blockSeparatedDelimiter = "`opening\n\n![secret](https://tracker.test/pixel)\n\nclosing`";

    expect(prepareMarkdownForDisplay(escapedDelimiter)).toContain("&#33;[secret](https://tracker.test/pixel)");
    expect(prepareMarkdownForDisplay(blockSeparatedDelimiter)).toContain("&#33;[secret](https://tracker.test/pixel)");
  });

  test("neutralizes images after an invalid backtick fence info string", () => {
    const markdown = "```invalid ` info\n![secret](https://tracker.test/pixel)\n```";

    expect(prepareMarkdownForDisplay(markdown)).toBe(
      "```invalid ` info\n&#33;[secret](https://tracker.test/pixel)\n```",
    );
  });

  test("neutralizes raw HTML tags when quoted attributes contain angle brackets", () => {
    const markdown = '<img alt="<tag>" src="https://tracker.test/pixel">';

    expect(prepareMarkdownForDisplay(markdown)).toBe(
      "&#60;img alt&#61;&#34;&#60;tag&#62;&#34; src&#61;&#34;https&#58;&#47;&#47;tracker&#46;test&#47;pixel&#34;&#62;",
    );
  });

  test("preserves valid blockquoted and list-contained fenced code exactly", () => {
    const blockquoteFence = `> \`\`\`
> ![node](https://tracker.test/pixel)
> <img src="unchanged">
> \`\`\``;
    const listFence = `- diagram
    \`\`\`
    ![node](https://tracker.test/pixel)
    <img src="unchanged">
    \`\`\``;

    expect(prepareMarkdownForDisplay(blockquoteFence)).toBe(blockquoteFence);
    expect(prepareMarkdownForDisplay(listFence)).toBe(listFence);
  });

  test("neutralizes resolved inline, reference, shortcut, and collapsed images", () => {
    const markdown = `![inline](https://tracker.test/pixel)
![reference][pixel]
![shortcut]
![collapsed][]

[pixel]: https://tracker.test/pixel
[shortcut]: https://tracker.test/shortcut
[collapsed]: https://tracker.test/collapsed`;

    expect(prepareMarkdownForDisplay(markdown)).toBe(`&#33;[inline](https://tracker.test/pixel)
&#33;[reference][pixel]
&#33;[shortcut]
&#33;[collapsed][]

[pixel]: https://tracker.test/pixel
[shortcut]: https://tracker.test/shortcut
[collapsed]: https://tracker.test/collapsed`);
  });
});
