import { describe, expect, test } from "vitest";

import { parseGlossarySource } from "../glossary/glossary";
import type { Term } from "../utils/types";
import { glossaryReducer, type GlossaryReducerState } from "./glossary-reducer";

const terms: readonly Term[] = [{ definition: "Application Programming Interface", term: "API" }];

describe("glossaryReducer", () => {
  test("changes the query without discarding ready terms", () => {
    const state: GlossaryReducerState = { query: "a", recentTerms: [], state: { status: "ready", terms } };

    expect(glossaryReducer(state, { query: "ap", type: "queryChanged" })).toEqual({
      query: "ap",
      recentTerms: [],
      state: { status: "ready", terms },
    });
  });

  test("starts loading without clearing the query", () => {
    const state: GlossaryReducerState = { query: "api", recentTerms: [], state: { status: "ready", terms } };

    expect(glossaryReducer(state, { type: "loadStarted" })).toEqual({
      query: "api",
      recentTerms: [],
      state: { status: "loading" },
    });
  });

  test("stores loaded terms without clearing the query", () => {
    const state: GlossaryReducerState = { query: "api", recentTerms: [], state: { status: "loading" } };

    expect(glossaryReducer(state, { terms, type: "loadSucceeded" })).toEqual({
      query: "api",
      recentTerms: [],
      state: { status: "ready", terms },
    });
  });
});

describe("glossaryReducer recovery", () => {
  test("stores a safe loading error without clearing the query", () => {
    const state: GlossaryReducerState = { query: "api", recentTerms: [], state: { status: "loading" } };

    expect(glossaryReducer(state, { message: "Invalid glossary", type: "loadFailed" })).toEqual({
      query: "api",
      recentTerms: [],
      state: { message: "Invalid glossary", status: "error" },
    });
  });

  test("stores a missing-glossary onboarding state without clearing the query", () => {
    const state: GlossaryReducerState = { query: "api", recentTerms: [], state: { status: "loading" } };

    expect(glossaryReducer(state, { type: "loadMissing" })).toEqual({
      query: "api",
      recentTerms: [],
      state: { status: "missing" },
    });
  });
});

describe("glossaryReducer copy and reload ordering", () => {
  test("retains a successful copy during reload and validates it against the loaded glossary", () => {
    const loading: GlossaryReducerState = { query: "", recentTerms: [], state: { status: "loading" } };
    const copied = glossaryReducer(loading, { term: terms[0], type: "termUsed" });
    expect(glossaryReducer(copied, { terms, type: "loadSucceeded" }).recentTerms).toEqual([terms[0]]);
    expect(glossaryReducer(copied, { terms: [], type: "loadSucceeded" }).recentTerms).toEqual([]);
  });
});

test("keeps a successful pending copy through a reload failure and validates on recovery", () => {
  const loading: GlossaryReducerState = { query: "", recentTerms: [], state: { status: "loading" } };
  const failed = glossaryReducer(loading, { message: "Unreadable", type: "loadFailed" });
  const copied = glossaryReducer(failed, { term: terms[0], type: "termUsed" });
  expect(glossaryReducer(copied, { terms, type: "loadSucceeded" }).recentTerms).toEqual([terms[0]]);
  expect(glossaryReducer(copied, { terms: [], type: "loadSucceeded" }).recentTerms).toEqual([]);
});

test("records a completed pending copy against current entry identity after reload", () => {
  const before = parseGlossarySource("terms: [{ term: API, definition: First }, { term: API, definition: Second }]\n");
  const after = parseGlossarySource(
    "terms: [{ term: AAA, definition: Added }, { term: API, definition: First }, { term: API, definition: Second }]\n",
  );
  const current: GlossaryReducerState = { query: "", recentTerms: [], state: { status: "ready", terms: after } };
  expect(glossaryReducer(current, { term: before[1], type: "termUsed" }).recentTerms[0]).toBe(after[2]);
  const removed = parseGlossarySource("terms: [{ term: API, definition: First }]\n");
  expect(
    glossaryReducer({ ...current, state: { status: "ready", terms: removed } }, { term: before[1], type: "termUsed" })
      .recentTerms,
  ).toEqual([]);
});
