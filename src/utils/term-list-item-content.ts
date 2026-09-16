import type { Term } from "./types";

export type TermListItemContent = Readonly<{
  id: string;
  subtitle: string;
  title: string;
}>;

export const getTermListItemContent = (term: Term): TermListItemContent => {
  return { id: term.term, subtitle: term.definition, title: term.term };
};
