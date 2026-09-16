import { SEARCH_RESULT_LIMIT } from "../constants";
import { termStartsWith } from "../glossary/term-matching";
import type { Term } from "../utils/types";

export type SearchResult = Readonly<{
  terms: readonly Term[];
  totalMatchCount: number;
}>;

const termCollator = new Intl.Collator([], { sensitivity: "accent", usage: "sort" });

export const searchTerms = (terms: readonly Term[], query: string): SearchResult => {
  const normalizedQuery = query.trim();
  const matches = terms
    .filter(({ term }) => termStartsWith(term, normalizedQuery))
    .sort((left, right) => termCollator.compare(left.term, right.term));

  return Object.freeze({
    terms: Object.freeze(matches.slice(0, SEARCH_RESULT_LIMIT)),
    totalMatchCount: matches.length,
  });
};
