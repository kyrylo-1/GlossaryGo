import { useCallback, useEffect, useMemo, useReducer, useRef, type Dispatch } from "react";

import type { Term } from "../utils/types";
import { GlossaryError, loadGlossary } from "../glossary/glossary";
import type { GlossaryTarget } from "../glossary/glossary-target";
import { prepareTermsForSearch, searchPreparedTerms, type PreparedTermsForSearch, type SearchResult } from "./search";
import { glossaryReducer, type CommandState, type GlossaryAction } from "./glossary-reducer";

export type { CommandState } from "./glossary-reducer";

type GlossaryController = Readonly<{
  createParent: boolean;
  glossaryFile: string;
  isRecent: boolean;
  query: string;
  recordTerm: (term: Term) => void;
  reload: () => Promise<void>;
  result: SearchResult;
  setQuery: (query: string) => void;
  state: CommandState;
}>;

const EMPTY_SEARCH_RESULT: SearchResult = Object.freeze({
  terms: Object.freeze([]),
  totalMatchCount: 0,
});

const getSafeErrorMessage = (error: unknown): string => {
  return error instanceof GlossaryError ? error.message : "The glossary could not be loaded. Try reloading it.";
};

const useGlossaryReload = (glossaryFile: string, dispatch: Dispatch<GlossaryAction>): (() => Promise<void>) => {
  const loadSequence = useRef(0);
  const reload = useCallback(async () => {
    const sequence = ++loadSequence.current;
    await Promise.resolve();
    if (sequence !== loadSequence.current) {
      return;
    }
    dispatch({ type: "loadStarted" });

    try {
      const terms = await loadGlossary(glossaryFile);
      if (sequence === loadSequence.current) {
        dispatch({ terms, type: "loadSucceeded" });
      }
    } catch (error: unknown) {
      if (sequence === loadSequence.current) {
        if (error instanceof GlossaryError && error.code === "missing") {
          dispatch({ type: "loadMissing" });
        } else {
          dispatch({ message: getSafeErrorMessage(error), type: "loadFailed" });
        }
      }
    }
  }, [dispatch, glossaryFile]);
  useEffect(() => {
    let isActive = true;
    queueMicrotask(() => {
      if (isActive) {
        reload().catch(() => null);
      }
    });
    return (): void => {
      isActive = false;
      loadSequence.current += 1;
    };
  }, [reload]);

  return reload;
};

export const useGlossary = ({ createParent, path: glossaryFile }: GlossaryTarget): GlossaryController => {
  const [model, dispatch] = useReducer(glossaryReducer, { query: "", recentTerms: [], state: { status: "loading" } });
  const reload = useGlossaryReload(glossaryFile, dispatch);
  const setQuery = useCallback((query: string) => dispatch({ query, type: "queryChanged" }), []);
  const recordTerm = useCallback((term: Term) => dispatch({ term, type: "termUsed" }), []);
  const preparedTerms: PreparedTermsForSearch | null = useMemo(
    () => (model.state.status === "ready" ? prepareTermsForSearch(model.state.terms) : null),
    [model.state],
  );
  const hasTypedQuery = model.query.trim().length > 0;
  const typedResult = useMemo(
    () => (preparedTerms && hasTypedQuery ? searchPreparedTerms(preparedTerms, model.query) : EMPTY_SEARCH_RESULT),
    [hasTypedQuery, model.query, preparedTerms],
  );
  const blankQueryResult = useMemo(
    () =>
      preparedTerms && !hasTypedQuery
        ? searchPreparedTerms(preparedTerms, model.query, model.recentTerms)
        : EMPTY_SEARCH_RESULT,
    [hasTypedQuery, model.query, model.recentTerms, preparedTerms],
  );
  const result = hasTypedQuery ? typedResult : blankQueryResult;

  return {
    createParent,
    glossaryFile,
    isRecent: !hasTypedQuery && model.recentTerms.length > 0,
    query: model.query,
    recordTerm,
    reload,
    result,
    setQuery,
    state: model.state,
  };
};
