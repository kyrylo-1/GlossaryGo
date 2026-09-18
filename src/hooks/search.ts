import { termStartsWith } from "../glossary/term-matching";
import type { Term } from "../utils/types";

import { resolveRecentTerms } from "./recent-terms";

export type SearchResult = Readonly<{
  terms: readonly Term[];
  totalMatchCount: number;
}>;

const termCollator = new Intl.Collator([], { sensitivity: "accent", usage: "sort" });

export const searchTerms = (terms: readonly Term[], query: string, history: readonly Term[] = []): SearchResult => {
  const normalizedQuery = query.trim();
  const alphabetical = terms
    .filter(({ term }) => termStartsWith(term, normalizedQuery))
    .sort((left, right) => termCollator.compare(left.term, right.term));
  const recent = normalizedQuery.length === 0 ? resolveRecentTerms(history, terms) : [];
  const recentEntries = new Set(recent);
  const matches = [...recent, ...alphabetical.filter((entry) => !recentEntries.has(entry))];

  return Object.freeze({
    terms: Object.freeze(matches),
    totalMatchCount: matches.length,
  });
};
