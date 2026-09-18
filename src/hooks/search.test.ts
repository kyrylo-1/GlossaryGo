import { describe, expect, test } from "vitest";

import type { Term } from "../utils/types";
import { searchTerms } from "./search";

const term = (name: string, definition = `${name} definition`): Term => {
  return { definition, term: name };
};

describe("searchTerms query behavior", () => {
  test("an empty query returns every alphabetical glossary term", () => {
    const terms = [term("Zulu"), term("echo"), term("Delta"), term("charlie"), term("Bravo"), term("alpha")];

    expect(searchTerms(terms, "")).toEqual({
      terms: [term("alpha"), term("Bravo"), term("charlie"), term("Delta"), term("echo"), term("Zulu")],
      totalMatchCount: 6,
    });
  });

  test("trims the query and matches ordinary, mixed-case, and multiword prefixes", () => {
    const terms = [term("Application Programming Interface"), term("API"), term("Architecture")];

    expect(searchTerms(terms, "  application proG  ")).toEqual({
      terms: [term("Application Programming Interface")],
      totalMatchCount: 1,
    });
  });

  test("never searches definition content", () => {
    const terms = [term("ADR", "Application Programming Interface")];

    expect(searchTerms(terms, "Application")).toEqual({ terms: [], totalMatchCount: 0 });
  });
});

describe("searchTerms Unicode and complete results", () => {
  test("is accent-sensitive while matching canonically equivalent Unicode", () => {
    const terms = [term("eclair"), term("éclair")];

    expect(searchTerms(terms, "e")).toEqual({ terms: [term("eclair")], totalMatchCount: 1 });
    expect(searchTerms(terms, "e\u0301c")).toEqual({ terms: [term("éclair")], totalMatchCount: 1 });
  });

  test("handles Unicode case variants without treating accents as case", () => {
    expect(searchTerms([term("ΟΣ")], "οσ")).toEqual({ terms: [term("ΟΣ")], totalMatchCount: 1 });
    expect(searchTerms([term("Istanbul"), term("İstanbul")], "i")).toEqual({
      terms: [term("Istanbul")],
      totalMatchCount: 1,
    });
  });

  test("matches normalized code-point prefixes inside multi-code-point graphemes", () => {
    expect(searchTerms([term("👩‍💻 Developer")], "👩")).toEqual({
      terms: [term("👩‍💻 Developer")],
      totalMatchCount: 1,
    });
    expect(searchTerms([term("क्षत्र")], "क")).toEqual({ terms: [term("क्षत्र")], totalMatchCount: 1 });
  });

  test("returns every prefix match instead of truncating to five", () => {
    const all = ["A07", "A06", "A05", "A04", "A03", "A02", "A01"].map((name) => term(name));
    const alphabetical = [...all].reverse();

    expect(searchTerms(all, "a")).toEqual({ terms: alphabetical, totalMatchCount: 7 });
  });

  test("treats a whitespace-only query as empty", () => {
    expect(searchTerms([term("Beta"), term("Alpha")], " \t ")).toEqual({
      terms: [term("Alpha"), term("Beta")],
      totalMatchCount: 2,
    });
  });
});

describe("recent terms", () => {
  test("uses current definitions in the recent-first portion", () => {
    expect(searchTerms([term("Alpha"), term("Zulu", "Updated")], "", ["Zulu"])).toEqual({
      terms: [term("Zulu", "Updated"), term("Alpha")],
      totalMatchCount: 2,
    });
  });

  test("places every current recent term before the remaining alphabetical glossary", () => {
    const all = ["A07", "A06", "A05", "A04", "A03", "A02", "A01"].map((name) => term(name));

    expect(searchTerms(all, " ", ["A07", "A02", "Deleted"])).toEqual({
      terms: [term("A07"), term("A02"), term("A01"), term("A03"), term("A04"), term("A05"), term("A06")],
      totalMatchCount: 7,
    });
  });

  test("falls back alphabetically when all history entries are stale", () => {
    expect(searchTerms([term("Zulu"), term("Alpha")], "", ["Deleted"])).toEqual({
      terms: [term("Alpha"), term("Zulu")],
      totalMatchCount: 2,
    });
  });

  test("does not duplicate equivalent current recent names", () => {
    expect(searchTerms([term("Résumé"), term("Zulu")], "", ["résumé", "RÉSUMÉ", "Zulu"])).toEqual({
      terms: [term("Résumé"), term("Zulu")],
      totalMatchCount: 2,
    });
  });

  test("keeps typed prefix matches alphabetical regardless of history", () => {
    expect(searchTerms([term("API"), term("ADR"), term("Zulu")], "a", ["Zulu", "API"])).toEqual({
      terms: [term("ADR"), term("API")],
      totalMatchCount: 2,
    });
  });
});
