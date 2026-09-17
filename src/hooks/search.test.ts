import { describe, expect, test } from "vitest";

import { SEARCH_RESULT_LIMIT } from "../constants";
import type { Term } from "../utils/types";
import { searchTerms } from "./search";

const term = (name: string, definition = `${name} definition`): Term => {
  return { definition, term: name };
};

describe("searchTerms query behavior", () => {
  test("an empty query sorts the full glossary and returns only the first five matches", () => {
    const terms = [term("Zulu"), term("echo"), term("Delta"), term("charlie"), term("Bravo"), term("alpha")];

    expect(terms).toHaveLength(SEARCH_RESULT_LIMIT + 1);
    expect(searchTerms(terms, "")).toEqual({
      terms: [term("alpha"), term("Bravo"), term("charlie"), term("Delta"), term("echo")],
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

describe("searchTerms Unicode and limits", () => {
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

  test("returns all five matches when the total is exactly five", () => {
    const terms = [term("A5"), term("A3"), term("A1"), term("A4"), term("A2")];

    expect(searchTerms(terms, "a")).toEqual({
      terms: [term("A1"), term("A2"), term("A3"), term("A4"), term("A5")],
      totalMatchCount: 5,
    });
  });

  test("treats a whitespace-only query as empty", () => {
    expect(searchTerms([term("Beta"), term("Alpha")], " \t ")).toEqual({
      terms: [term("Alpha"), term("Beta")],
      totalMatchCount: 2,
    });
  });
});

describe("recent terms", () => {
  test("shows recent terms first for an empty query using current definitions", () => {
    expect(searchTerms([term("Alpha"), term("Zulu", "Updated")], "", ["Zulu", "Alpha"])).toEqual({
      terms: [term("Zulu", "Updated"), term("Alpha")],
      totalMatchCount: 2,
    });
  });

  test("falls back alphabetically when all history entries are stale", () => {
    expect(searchTerms([term("Zulu"), term("Alpha")], "", ["Deleted"])).toEqual({
      terms: [term("Alpha"), term("Zulu")],
      totalMatchCount: 2,
    });
  });

  test("shows only valid recent terms for whitespace queries and keeps the five-result cap", () => {
    const terms = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Zulu"].map((name) => term(name));
    expect(searchTerms(terms, " \t", ["Missing", "Zulu", "Foxtrot", "Echo", "Delta", "Charlie", "Bravo"])).toEqual({
      terms: [term("Zulu"), term("Foxtrot"), term("Echo"), term("Delta"), term("Charlie")],
      totalMatchCount: 6,
    });
  });

  test("keeps typed prefix matches alphabetical regardless of history", () => {
    expect(searchTerms([term("API"), term("ADR"), term("Zulu")], "a", ["Zulu", "API"])).toEqual({
      terms: [term("ADR"), term("API")],
      totalMatchCount: 2,
    });
  });
});
