import { getNormalizedTermName } from "../glossary/entry-identity";
import { normalizeTermName, normalizedTermStartsWith } from "../glossary/term-matching";
import type { Term } from "../utils/types";

import { resolveRecentTerms } from "./recent-terms";

export type SearchResult = Readonly<{
  terms: readonly Term[];
  totalMatchCount: number;
}>;

type IndexedTerm = Readonly<{
  key: string;
  normalizedTerm: string;
  term: Term;
}>;

export type PreparedTermsForSearch = Readonly<{
  alphabetical: readonly Term[];
  asciiPrefixIndex: readonly IndexedTerm[] | null;
  nonAsciiTerms: readonly IndexedTerm[];
  normalizedTerms: readonly IndexedTerm[];
  terms: readonly Term[];
}>;

const termCollator = new Intl.Collator([], { sensitivity: "accent", usage: "sort" });
const ASCII_ONLY = /^[\u0020-\u007E]*$/u;
export const PREPARED_PREFIX_SEARCH_THRESHOLD = 500;

const lowerBound = (entries: readonly IndexedTerm[], key: string): number => {
  let start = 0;
  let end = entries.length;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    if (entries[middle].key < key) {
      start = middle + 1;
    } else {
      end = middle;
    }
  }
  return start;
};

const buildSearchResult = (
  terms: readonly Term[],
  alphabetical: readonly Term[],
  query: string,
  history: readonly Term[],
): SearchResult => {
  const recent = query.length === 0 ? resolveRecentTerms(history, terms) : [];
  const recentEntries = new Set(recent);
  const matches = [...recent, ...alphabetical.filter((entry) => !recentEntries.has(entry))];
  return Object.freeze({ terms: Object.freeze(matches), totalMatchCount: matches.length });
};

export const prepareTermsForSearch = (terms: readonly Term[]): PreparedTermsForSearch => {
  const alphabetical = terms.toSorted((left, right) => termCollator.compare(left.term, right.term));
  const normalizedTerms = terms.map((term) => ({
    key: "",
    normalizedTerm: getNormalizedTermName(term),
    term,
  }));
  if (terms.length <= PREPARED_PREFIX_SEARCH_THRESHOLD) {
    return Object.freeze({
      alphabetical: Object.freeze(alphabetical),
      asciiPrefixIndex: null,
      nonAsciiTerms: Object.freeze(normalizedTerms),
      normalizedTerms: Object.freeze(normalizedTerms),
      terms,
    });
  }

  const asciiPrefixIndex: IndexedTerm[] = [];
  const nonAsciiTerms: IndexedTerm[] = [];
  for (const entry of normalizedTerms) {
    if (ASCII_ONLY.test(entry.normalizedTerm)) {
      asciiPrefixIndex.push({ ...entry, key: entry.normalizedTerm.toLowerCase() });
    } else {
      nonAsciiTerms.push(entry);
    }
  }
  asciiPrefixIndex.sort((left, right) => {
    if (left.key === right.key) {
      return 0;
    }
    return left.key < right.key ? -1 : 1;
  });
  return Object.freeze({
    alphabetical: Object.freeze(alphabetical),
    asciiPrefixIndex: Object.freeze(asciiPrefixIndex),
    nonAsciiTerms: Object.freeze(nonAsciiTerms),
    normalizedTerms: Object.freeze(normalizedTerms),
    terms,
  });
};

const findPreparedPrefixMatches = (prepared: PreparedTermsForSearch, normalizedQuery: string): readonly Term[] => {
  if (!prepared.asciiPrefixIndex || !ASCII_ONLY.test(normalizedQuery)) {
    return prepared.normalizedTerms
      .filter(({ normalizedTerm }) => normalizedTermStartsWith(normalizedTerm, normalizedQuery))
      .map(({ term }) => term);
  }

  const lowercaseQuery = normalizedQuery.toLowerCase();
  const matches: Term[] = [];
  for (
    let index = lowerBound(prepared.asciiPrefixIndex, lowercaseQuery);
    index < prepared.asciiPrefixIndex.length;
    index += 1
  ) {
    const candidate = prepared.asciiPrefixIndex[index];
    if (!candidate.key.startsWith(lowercaseQuery)) {
      break;
    }
    if (normalizedTermStartsWith(candidate.normalizedTerm, normalizedQuery)) {
      matches.push(candidate.term);
    }
  }
  return [
    ...matches,
    ...prepared.nonAsciiTerms
      .filter(({ normalizedTerm }) => normalizedTermStartsWith(normalizedTerm, normalizedQuery))
      .map(({ term }) => term),
  ];
};

export const searchPreparedTerms = (
  prepared: PreparedTermsForSearch,
  query: string,
  history: readonly Term[] = [],
): SearchResult => {
  const normalizedQuery = normalizeTermName(query.trim());
  if (normalizedQuery.length === 0) {
    return buildSearchResult(prepared.terms, prepared.alphabetical, normalizedQuery, history);
  }
  const alphabetical = findPreparedPrefixMatches(prepared, normalizedQuery).toSorted((left, right) =>
    termCollator.compare(left.term, right.term),
  );
  return buildSearchResult(prepared.terms, alphabetical, normalizedQuery, history);
};

export const searchTerms = (terms: readonly Term[], query: string, history: readonly Term[] = []): SearchResult => {
  const normalizedQuery = normalizeTermName(query.trim());
  const alphabetical = terms
    .filter((entry) => normalizedTermStartsWith(getNormalizedTermName(entry), normalizedQuery))
    .sort((left, right) => termCollator.compare(left.term, right.term));
  return buildSearchResult(terms, alphabetical, normalizedQuery, history);
};
