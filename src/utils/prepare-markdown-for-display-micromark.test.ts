import { parse, postprocess, preprocess } from "micromark";
import { describe, expect, test } from "vitest";

import { prepareMarkdownForDisplay } from "./prepare-markdown-for-display";

const getHazards = (markdown: string): string[] => {
  return postprocess(
    parse()
      .document()
      .write(preprocess()(markdown, null, true)),
  )
    .filter(([kind, token]) => kind === "enter" && ["image", "htmlFlow", "htmlText"].includes(token.type))
    .map(([, token]) => token.type);
};

const expectSafeMarkdown = (markdown: string): string => {
  const result = prepareMarkdownForDisplay(markdown);
  expect(getHazards(result)).toEqual([]);
  return result;
};

// eslint-disable-next-line max-lines-per-function -- Each case documents a distinct CommonMark boundary.
describe("prepareMarkdownForDisplay with Micromark token boundaries", () => {
  test("neutralizes direct, reference, collapsed, and shortcut images while preserving ordinary links", () => {
    const markdown = `[ordinary link](https://example.test/docs)
![direct](https://tracker.test/pixel)
![reference][pixel]
![collapsed][]
![shortcut]

[pixel]: https://tracker.test/reference
[collapsed]: https://tracker.test/collapsed
[shortcut]: https://tracker.test/shortcut`;

    const result = expectSafeMarkdown(markdown);
    expect(result).toContain("[ordinary link](https://example.test/docs)");
    expect(result).toContain("&#33;[direct](https://tracker.test/pixel)");
    expect(result).toContain("&#33;[reference][pixel]");
    expect(result).toContain("&#33;[collapsed][]");
    expect(result).toContain("&#33;[shortcut]");
  });

  test("neutralizes inline and flow HTML, including latent images in attributes and nested tags", () => {
    const markdown = `# Heading remains Markdown

[ordinary link](https://example.test/docs)

<span title="![secret](https://tracker.test/pixel)"><img src="https://tracker.test/nested"></span>

<section>
![secret](https://tracker.test/flow)
<img alt="<tag>" src="https://tracker.test/pixel">
</section>`;

    const result = expectSafeMarkdown(markdown);
    expect(result).toContain("# Heading remains Markdown");
    expect(result).toContain("[ordinary link](https://example.test/docs)");
    expect(result).toContain("&#60;span");
    expect(result).toContain("&#33;&#91;secret&#93;&#40;https&#58;&#47;&#47;tracker&#46;test&#47;pixel&#41;");
    expect(result).toContain("&#60;section&#62;");
    expect(result).toContain("&#33;&#91;secret&#93;&#40;https&#58;&#47;&#47;tracker&#46;test&#47;flow&#41;");
  });

  test("monotonically encodes hazards exposed beside ordinary Markdown and fenced code", () => {
    const markdown = `# Markdown heading

[ordinary link](https://example.test/docs)

\`\`\`
+---------+
| ![code] |
+---------+
\`\`\`

<section>
\\<span title="![secret](https://tracker.test/pixel)"><img src="https://tracker.test/nested"></span>
</section>`;

    const result = expectSafeMarkdown(markdown);
    expect(result).toContain("# Markdown heading");
    expect(result).toContain("[ordinary link](https://example.test/docs)");
    expect(result).toContain("```\n+---------+\n| ![code] |\n+---------+\n```");
    expect(result).toContain("&#60;section&#62;");
    expect(result).toContain(
      "&#92;&#60;span title&#61;&#34;&#33;&#91;secret&#93;&#40;https&#58;&#47;&#47;tracker&#46;test&#47;pixel&#41;&#34;&#62;",
    );
    expect(result).toContain(
      "&#60;img src&#61;&#34;https&#58;&#47;&#47;tracker&#46;test&#47;nested&#34;&#62;&#60;&#47;span&#62;",
    );
    expect(result).toContain("&#60;&#47;section&#62;");
  });

  test("neutralizes only an active image marker while retaining inline-code label bytes", () => {
    const markdown = "![label `<img>` and `![code](u)`](url)";

    const result = expectSafeMarkdown(markdown);
    expect(result).toBe("&#33;[label `<img>` and `![code](u)`](url)");
  });

  test("literalizes only raw HTML token ranges beside ordinary Markdown and fenced code", () => {
    const markdown = `# Heading

[ordinary link](https://example.test/docs)

\`\`\`
+---------+
| ![code] |
+---------+
\`\`\`

<section>
\\<span>
</section>`;

    const result = expectSafeMarkdown(markdown);
    expect(result).toContain("# Heading");
    expect(result).toContain("[ordinary link](https://example.test/docs)");
    expect(result).toContain("```\n+---------+\n| ![code] |\n+---------+\n```");
    expect(result).toContain("&#60;section&#62;  \n&#92;&#60;span&#62;  \n&#60;&#47;section&#62;");
  });

  test("neutralizes hazards exposed by valid less-indented fence closings and container exits", () => {
    const markdown = `   \`\`\`
code
\`\`\`
![top](https://tracker.test/pixel)

> ~~~
> code

![quote](https://tracker.test/pixel)

- item

  ~~~
  code
  ~~~
![list](https://tracker.test/pixel)`;

    const result = expectSafeMarkdown(markdown);
    expect(result).toContain("&#33;[top](https://tracker.test/pixel)");
    expect(result).toContain("&#33;[quote](https://tracker.test/pixel)");
    expect(result).toContain("&#33;[list](https://tracker.test/pixel)");
  });

  test("does not escape code in nested blockquote/list fences or treat over-indented closings as fences", () => {
    const code = `> - diagram
>   \`\`\`
>   ![node](https://tracker.test/pixel)
>   <img src="unchanged">
>   \`\`\``;
    const overIndentedClosing = `\`\`\`
code
    \`\`\`
![secret](https://tracker.test/pixel)`;

    expect(prepareMarkdownForDisplay(code)).toBe(code);
    expectSafeMarkdown(overIndentedClosing);
  });

  test("keeps headings, paragraphs, blank list items, CRLF, Unicode, and code bytes intact", () => {
    const crlf = String.fromCharCode(13, 10);
    const markdown = [
      "# Heading",
      "",
      "Paragraph 👩‍💻",
      "",
      "- item",
      "",
      "  continuation",
      "",
      '`![inline](https://tracker.test/unchanged) <img src="unchanged">`',
      "",
      "```",
      "+---------+",
      "| ![node] |",
      "+---------+",
      "```",
      "![secret](https://tracker.test/pixel)",
    ].join(crlf);

    const result = expectSafeMarkdown(markdown);
    expect(result).toContain(["# Heading", "", "Paragraph 👩‍💻", ""].join(crlf));
    expect(result).toContain('`![inline](https://tracker.test/unchanged) <img src="unchanged">`');
    expect(result).toContain(["```", "+---------+", "| ![node] |", "+---------+", "```"].join(crlf));
    expect(result).toContain("&#33;[secret](https://tracker.test/pixel)");
  });

  test("keeps Obsidian-style image-like text literal because it is not a CommonMark image", () => {
    const markdown = "![[vault/image.png]]";

    expect(expectSafeMarkdown(markdown)).toBe(markdown);
  });

  test("neutralizes many images while preserving source order and the final Unicode tail", () => {
    const imageCount = 10_000;
    const images = Array.from(
      { length: imageCount },
      (_, index) => `![image ${index + 1}](https://tracker.test/${index + 1})`,
    ).join("\n");
    const markdown = `# Bulk images\n${images}\nTail 👩‍💻`;

    const result = expectSafeMarkdown(markdown);
    expect(result).toContain("&#33;[image 1](https://tracker.test/1)");
    expect(result).toContain("&#33;[image 5000](https://tracker.test/5000)");
    expect(result).toContain("&#33;[image 10000](https://tracker.test/10000)");
    expect(result.endsWith("Tail 👩‍💻")).toBe(true);
  });
});
