export const renderPlainTextAsMarkdown = (value: string): string => {
  return value
    .split(/\r?\n/)
    .map((line) => {
      if (line.length === 0) {
        return "&#160;";
      }
      const escaped = line.replaceAll(/[!-/:-@[-`{-~]/g, (character) => `&#${character.charCodeAt(0)};`);
      return escaped.replace(/^[ \t]+/, (indent) =>
        [...indent].map((character) => (character === "\t" ? "&#9;" : "&#32;")).join(""),
      );
    })
    .join("  \n");
};
