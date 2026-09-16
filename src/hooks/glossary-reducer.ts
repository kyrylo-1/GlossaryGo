import { areTermsEquivalent } from "../glossary/term-matching";
import { rememberTerm, resolveRecentTerms } from "./recent-terms";
import type { Term } from "../utils/types";

export type CommandState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "missing" }>
  | Readonly<{ status: "ready"; terms: readonly Term[] }>
  | Readonly<{ status: "error"; message: string }>;

export type GlossaryReducerState = Readonly<{
  query: string;
  recentTerms: readonly string[];
  state: CommandState;
}>;

export type GlossaryAction =
  | Readonly<{ message: string; type: "loadFailed" }>
  | Readonly<{ type: "loadMissing" }>
  | Readonly<{ type: "loadStarted" }>
  | Readonly<{ terms: readonly Term[]; type: "loadSucceeded" }>
  | Readonly<{ name: string; type: "termUsed" }>
  | Readonly<{ query: string; type: "queryChanged" }>;

export const glossaryReducer = (state: GlossaryReducerState, action: GlossaryAction): GlossaryReducerState => {
  switch (action.type) {
    case "loadFailed": {
      return { ...state, state: { message: action.message, status: "error" } };
    }
    case "loadStarted": {
      return { ...state, state: { status: "loading" } };
    }
    case "loadMissing": {
      return { ...state, recentTerms: [], state: { status: "missing" } };
    }
    case "loadSucceeded": {
      return {
        ...state,
        recentTerms: resolveRecentTerms(state.recentTerms, action.terms).map(({ term }) => term),
        state: { status: "ready", terms: action.terms },
      };
    }
    case "termUsed": {
      if (state.state.status !== "ready") {
        return state;
      }
      const match = state.state.terms.find(({ term }) => areTermsEquivalent(term, action.name));
      return match ? { ...state, recentTerms: rememberTerm(state.recentTerms, match.term) } : state;
    }
    case "queryChanged": {
      return { ...state, query: action.query };
    }
  }
};
