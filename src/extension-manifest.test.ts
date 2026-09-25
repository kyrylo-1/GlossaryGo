import { describe, expect, test } from "vitest";

import manifest from "../package.json";

describe("extension manifest", () => {
  test("does not expose Reveal Glossary File as a standalone command", () => {
    expect(manifest.commands.map(({ name }) => name)).not.toContain("reveal-glossary-file");
  });
});
