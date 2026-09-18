import { getEntryIdentity } from "../glossary/entry-identity";
import { areTermsEquivalent } from "../glossary/term-matching";
import type { Term } from "../utils/types";

const RECENT_TERM_CAPACITY = 20;

const sameEntry = (left: Term, right: Term): boolean => {
  const leftIdentity = getEntryIdentity(left);
  const rightIdentity = getEntryIdentity(right);
  return left === right || (leftIdentity ? leftIdentity.id === rightIdentity?.id : false);
};

export const rememberTerm = (history: readonly Term[], entry: Term): readonly Term[] => {
  return [entry, ...history.filter((previous) => !sameEntry(previous, entry))].slice(0, RECENT_TERM_CAPACITY);
};

export const resolveRecentTerm = (entry: Term, terms: readonly Term[]): Term | null => {
  const same = terms.find((candidate) => sameEntry(entry, candidate));
  if (same) {
    return same;
  }
  const identity = getEntryIdentity(entry);
  // A changed snapshot cannot prove which identical sibling survived.
  if (identity && identity.identicalCount > 1) {
    return null;
  }
  const equivalent = terms.filter((candidate) => areTermsEquivalent(candidate.term, entry.term));
  const exact = equivalent.filter((candidate) => candidate.definition === entry.definition);
  if (exact.length === 1) {
    return exact[0];
  }
  return exact.length === 0 && (identity?.equivalentCount ?? 1) === 1 && equivalent.length === 1 ? equivalent[0] : null;
};

export const resolveRecentTerms = (history: readonly Term[], terms: readonly Term[]): readonly Term[] => {
  const resolved: Term[] = [];
  for (const entry of history) {
    const match = resolveRecentTerm(entry, terms);
    if (match && !resolved.includes(match)) {
      resolved.push(match);
    }
  }
  return resolved;
};
