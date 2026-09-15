import { describe, expect, test } from "vitest";

import { applyGlossaryChange } from "./apply-glossary-change";
import { parseGlossarySource } from "./glossary";

describe("applyGlossaryChange", () => {
  test("appends to an empty glossary without changing definition text", () => {
    const term = { definition: "  first line\nsecond line\n", term: "API" };
    const next = applyGlossaryChange("# My glossary\nterms: []\n", { term, type: "add" });
    expect(parseGlossarySource(next)).toEqual([term]);
    expect(next).toContain("# My glossary");
  });

  test("renames the selected term without treating it as a duplicate of itself", () => {
    const original = { definition: "Old definition", term: "API" };
    const source = "terms:\n  - term: API\n    definition: Old definition\n";
    const term = { definition: "New definition\n", term: "api" };
    expect(parseGlossarySource(applyGlossaryChange(source, { original, term, type: "edit" }))).toEqual([term]);
  });
});
