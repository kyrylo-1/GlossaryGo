import { termStartsWith } from "../glossary/term-matching";
import type { Term } from "../utils/types";

import { resolveRecentTerms } from "../hooks/recent-terms";
import { searchTerms, type SearchResult } from "../hooks/search";

type IndexedTerm = Readonly<{
  entry: Term;
  index: number;
  key: string;
}>;

export type PrefixIndex = Readonly<{
  ascii: readonly IndexedTerm[];
  nonAscii: readonly IndexedTerm[];
  terms: readonly Term[];
}>;

export type LatencyTails = Readonly<{
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}>;

export type PrefixSearchBenchmarkReport = Readonly<{
  amortizationLookups: number;
  amortizedBinaryPerLookupMs: number;
  phases: Readonly<{
    binaryColdEndToEnd: LatencyTails;
    binaryPreparation: LatencyTails;
    binaryWarmEndToEnd: LatencyTails;
    binaryWarmLookup: LatencyTails;
    binaryWarmMatchCollection: LatencyTails;
    linearEndToEnd: LatencyTails;
  }>;
  rendering: "not measured: Raycast rendering requires an application runtime";
  runtime: Readonly<{ icu: string; node: string }>;
}>;

export type PrefixSearchBenchmarkOptions = Readonly<{
  amortizationLookups?: number;
  entries: readonly Term[];
  queries: readonly string[];
  repetitions: number;
}>;

const termCollator = new Intl.Collator([], { sensitivity: "accent", usage: "sort" });
const asciiOnly = /^[\u0020-\u007E]*$/u;

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

const compareAsciiKeys = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
};

export const preparePrefixIndex = (terms: readonly Term[]): PrefixIndex => {
  const ascii: IndexedTerm[] = [];
  const nonAscii: IndexedTerm[] = [];

  for (const [index, entry] of terms.entries()) {
    const indexed = { entry, index, key: entry.term.toLowerCase() };
    if (asciiOnly.test(entry.term)) {
      ascii.push(indexed);
    } else {
      nonAscii.push(indexed);
    }
  }

  ascii.sort((left, right) => compareAsciiKeys(left.key, right.key));
  return Object.freeze({ ascii: Object.freeze(ascii), nonAscii: Object.freeze(nonAscii), terms });
};

const matchingEntries = (entries: readonly IndexedTerm[]): readonly Term[] => {
  return entries.toSorted((left, right) => left.index - right.index).map(({ entry }) => entry);
};

export const lookupPrefixIndex = (index: PrefixIndex, query: string): readonly Term[] => {
  const normalizedQuery = query.trim();
  const asciiQuery = asciiOnly.test(normalizedQuery);
  const lowercaseQuery = normalizedQuery.toLowerCase();
  const start = asciiQuery ? lowerBound(index.ascii, lowercaseQuery) : 0;
  const end = asciiQuery ? lowerBound(index.ascii, `${lowercaseQuery}\u{10FFFF}`) : 0;
  const asciiMatches = asciiQuery
    ? index.ascii
        .slice(start, end)
        .filter(({ entry, key }) => key.startsWith(lowercaseQuery) && termStartsWith(entry.term, normalizedQuery))
    : index.ascii.filter(({ entry }) => termStartsWith(entry.term, normalizedQuery));

  return matchingEntries([
    ...asciiMatches,
    ...index.nonAscii.filter(({ entry }) => termStartsWith(entry.term, normalizedQuery)),
  ]);
};

export const collectPrefixMatches = (
  index: PrefixIndex,
  matching: readonly Term[],
  query: string,
  history: readonly Term[] = [],
): SearchResult => {
  const normalizedQuery = query.trim();
  const alphabetical = matching.toSorted((left, right) => termCollator.compare(left.term, right.term));
  const recent = normalizedQuery.length === 0 ? resolveRecentTerms(history, index.terms) : [];
  const recentEntries = new Set(recent);
  const matches = [...recent, ...alphabetical.filter((entry) => !recentEntries.has(entry))];

  return Object.freeze({ terms: Object.freeze(matches), totalMatchCount: matches.length });
};

export const searchTermsWithPrefixIndex = (
  index: PrefixIndex,
  query: string,
  history: readonly Term[] = [],
): SearchResult => {
  return collectPrefixMatches(index, lookupPrefixIndex(index, query), query, history);
};

const percentile = (samples: readonly number[], percentileValue: number): number => {
  return samples[Math.min(samples.length - 1, Math.ceil(samples.length * percentileValue) - 1)];
};

const measure = (repetitions: number, operation: () => void): LatencyTails => {
  const samples: number[] = [];
  for (let iteration = 0; iteration < repetitions; iteration += 1) {
    const startedAt = performance.now();
    operation();
    samples.push(performance.now() - startedAt);
  }

  const sorted = samples.toSorted((left, right) => left - right);
  return Object.freeze({
    maxMs: sorted.at(-1) ?? 0,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
  });
};

const assertParity = (index: PrefixIndex, queries: readonly string[]): void => {
  for (const query of queries) {
    const linear = searchTerms(index.terms, query);
    const indexed = searchTermsWithPrefixIndex(index, query);
    if (
      linear.totalMatchCount !== indexed.totalMatchCount ||
      linear.terms.some((entry, entryIndex) => entry !== indexed.terms[entryIndex])
    ) {
      throw new Error(`Prefix-index parity failed for synthetic query ${JSON.stringify(query)}.`);
    }
  }
};

const measureBenchmarkPhases = (
  index: PrefixIndex,
  queries: readonly string[],
  repetitions: number,
): PrefixSearchBenchmarkReport["phases"] => {
  const matches = queries.map((query) => lookupPrefixIndex(index, query));
  const repeatQueries = (operation: (query: string, queryIndex: number) => void): void => {
    for (const [queryIndex, query] of queries.entries()) {
      operation(query, queryIndex);
    }
  };

  return Object.freeze({
    binaryColdEndToEnd: measure(repetitions, () =>
      repeatQueries((query) => {
        const coldIndex = preparePrefixIndex(index.terms);
        searchTermsWithPrefixIndex(coldIndex, query);
      }),
    ),
    binaryPreparation: measure(repetitions, () => preparePrefixIndex(index.terms)),
    binaryWarmEndToEnd: measure(repetitions, () => repeatQueries((query) => searchTermsWithPrefixIndex(index, query))),
    binaryWarmLookup: measure(repetitions, () => repeatQueries((query) => lookupPrefixIndex(index, query))),
    binaryWarmMatchCollection: measure(repetitions, () =>
      repeatQueries((query, queryIndex) => collectPrefixMatches(index, matches[queryIndex], query)),
    ),
    linearEndToEnd: measure(repetitions, () => repeatQueries((query) => searchTerms(index.terms, query))),
  });
};

export const runPrefixSearchBenchmark = (options: PrefixSearchBenchmarkOptions): PrefixSearchBenchmarkReport => {
  const amortizationLookups = options.amortizationLookups ?? 20;
  if (options.repetitions < 1 || options.queries.length === 0 || amortizationLookups < 1) {
    throw new Error("Benchmark repetitions, queries, and amortization lookups must be positive.");
  }

  const index = preparePrefixIndex(options.entries);
  assertParity(index, options.queries);
  for (const query of options.queries) {
    searchTerms(options.entries, query);
    searchTermsWithPrefixIndex(index, query);
  }
  const phases = measureBenchmarkPhases(index, options.queries, options.repetitions);

  return Object.freeze({
    amortizationLookups,
    amortizedBinaryPerLookupMs:
      (phases.binaryPreparation.p50Ms + phases.binaryWarmEndToEnd.p50Ms * amortizationLookups) / amortizationLookups,
    phases,
    rendering: "not measured: Raycast rendering requires an application runtime",
    runtime: Object.freeze({ icu: process.versions.icu, node: process.version }),
  });
};
