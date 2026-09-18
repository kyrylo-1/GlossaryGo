import { describe, expect, test } from "vitest";

import { searchTerms } from "../hooks/search";
import { applyGlossaryChange } from "./apply-glossary-change";
import { parseGlossarySource } from "./glossary";

describe("Term canonical equivalence across parsing, mutation, and search", () => {
  test("treats NFC and NFD spellings as canonically equivalent", () => {
    const duplicateSource = "terms:\n  - term: café\n    definition: NFC\n  - term: cafe\u0301\n    definition: NFD\n";

    expect(parseGlossarySource(duplicateSource)).toHaveLength(2);
    expect(
      parseGlossarySource(
        applyGlossaryChange("terms:\n  - term: café\n    definition: NFC\n", {
          term: { definition: "NFD", term: "cafe\u0301" },
          type: "add",
        }),
      ),
    ).toHaveLength(2);
    expect(searchTerms([{ definition: "NFC", term: "café" }], "cafe\u0301")).toEqual({
      terms: [{ definition: "NFC", term: "café" }],
      totalMatchCount: 1,
    });
  });
});

describe("Term case equivalence across parsing, mutation, and search", () => {
  test("treats Greek sigma case variants as equivalent", () => {
    const duplicateSource = "terms:\n  - term: ΟΣ\n    definition: Upper\n  - term: οσ\n    definition: Lower\n";

    expect(parseGlossarySource(duplicateSource)).toHaveLength(2);
    expect(
      parseGlossarySource(
        applyGlossaryChange("terms:\n  - term: ΟΣ\n    definition: Upper\n", {
          term: { definition: "Lower", term: "οσ" },
          type: "add",
        }),
      ),
    ).toHaveLength(2);
    expect(searchTerms([{ definition: "Upper", term: "ΟΣ" }], "οσ")).toEqual({
      terms: [{ definition: "Upper", term: "ΟΣ" }],
      totalMatchCount: 1,
    });
  });
});

describe("Term accent sensitivity across parsing, mutation, and search", () => {
  test("keeps accented and unaccented names distinct", () => {
    const source = "terms:\n  - term: cafe\n    definition: Plain\n  - term: café\n    definition: Accented\n";

    expect(parseGlossarySource(source)).toEqual([
      { definition: "Plain", term: "cafe" },
      { definition: "Accented", term: "café" },
    ]);
    const nextSource = applyGlossaryChange("terms:\n  - term: cafe\n    definition: Plain\n", {
      term: { definition: "Accented", term: "café" },
      type: "add",
    });
    expect(parseGlossarySource(nextSource)).toHaveLength(2);
    expect(searchTerms(parseGlossarySource(source), "cafe")).toEqual({
      terms: [{ definition: "Plain", term: "cafe" }],
      totalMatchCount: 1,
    });
  });
});
