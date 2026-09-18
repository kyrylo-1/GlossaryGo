import { areTermsEquivalent, termStartsWith } from "../glossary/term-matching";
import type { Term } from "../utils/types";

import { resolveRecentTerms } from "./recent-terms";

export type SearchResult = Readonly<{
  terms: readonly Term[];
  totalMatchCount: number;
}>;

const termCollator = new Intl.Collator([], { sensitivity: "accent", usage: "sort" });

export const searchTerms = (terms: readonly Term[], query: string, history: readonly string[] = []): SearchResult => {
  const normalizedQuery = query.trim();
  const alphabetical = terms
    .filter(({ term }) => termStartsWith(term, normalizedQuery))
    .sort((left, right) => termCollator.compare(left.term, right.term));
  const recent =
    normalizedQuery.length === 0
      ? resolveRecentTerms(history, terms).filter(
          (entry, index, resolved) =>
            !resolved.slice(0, index).some(({ term }) => areTermsEquivalent(term, entry.term)),
        )
      : [];
  const matches =
    recent.length > 0
      ? [...recent, ...alphabetical.filter(({ term }) => !recent.some((entry) => areTermsEquivalent(entry.term, term)))]
      : alphabetical;

  return Object.freeze({
    terms: Object.freeze(matches),
    totalMatchCount: matches.length,
  });
};
