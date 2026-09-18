import { createHash } from "node:crypto";

import { areTermsEquivalent } from "./term-matching";
import type { Term } from "../utils/types";

type EntryIdentity = Readonly<{
  id: string;
  index: number;
  source: string;
  equivalentCount: number;
  identicalCount: number;
}>;

const identities = new WeakMap<Term, EntryIdentity>();

// Metadata never enters YAML or the public two-field Term value.
export const captureEntryIdentities = (source: string, terms: readonly Term[]): void => {
  const fingerprint = createHash("sha256").update(source).digest("hex");
  const collator = new Intl.Collator("und", { sensitivity: "accent", usage: "search" });
  const ordered = terms
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => collator.compare(left.entry.term.normalize("NFC"), right.entry.term.normalize("NFC")));
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && areTermsEquivalent(ordered[start].entry.term, ordered[end].entry.term)) {
      end += 1;
    }
    const group = ordered.slice(start, end);
    const definitionCounts = new Map<string, number>();
    for (const { entry } of group) {
      definitionCounts.set(entry.definition, (definitionCounts.get(entry.definition) ?? 0) + 1);
    }
    for (const { entry, index } of group) {
      identities.set(
        entry,
        Object.freeze({
          id: `${fingerprint}:${index}`,
          index,
          source,
          equivalentCount: group.length,
          identicalCount: definitionCounts.get(entry.definition) ?? 0,
        }),
      );
    }
    start = end;
  }
};

export const getEntryIdentity = (entry: Term): EntryIdentity | undefined => identities.get(entry);

export const resolveSelectedIndex = (source: string, terms: readonly Term[], original: Term): number => {
  const identity = identities.get(original);
  if (identity) {
    return identity.source === source ? identity.index : -1;
  }
  const matches = terms.flatMap((entry, index) =>
    entry.term === original.term && entry.definition === original.definition ? [index] : [],
  );
  return matches.length === 1 ? matches[0] : -1;
};

export const captureSelectedTerm = (entry: Term): Term => {
  const captured = Object.freeze({ term: entry.term, definition: entry.definition });
  const identity = identities.get(entry);
  if (identity) {
    identities.set(captured, identity);
  }
  return captured;
};
