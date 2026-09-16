import { areTermsEquivalent } from "../glossary/term-matching";
import type { Term } from "../utils/types";

const RECENT_TERM_CAPACITY = 20;

export const rememberTerm = (history: readonly string[], name: string): readonly string[] => {
  return [name, ...history.filter((previous) => !areTermsEquivalent(previous, name))].slice(0, RECENT_TERM_CAPACITY);
};

export const resolveRecentTerms = (history: readonly string[], terms: readonly Term[]): readonly Term[] => {
  return history.flatMap((name) => {
    const match = terms.find(({ term }) => areTermsEquivalent(term, name));
    return match ? [match] : [];
  });
};
