# Scrollable Term List Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans only when implementation is authorized. This handoff is planning only. Implement KYR-29 through one pull request, with incremental commits delegated to a separate Luna agent at low reasoning.

**Goal:** Browse every matching glossary term in Raycast's native scrollable list and read the complete selected definition.

**Architecture:** Keep the existing whole-file YAML loader and native split-pane List. Return all matching terms instead of slicing to five. For blank queries, prepend valid recent terms to the remaining alphabetical glossary without duplicates; typed prefixes stay alphabetical. Keep complete definitions rendered as literal text in List.Item.Detail and the existing full-width reader.

**Tech Stack:** TypeScript, React, @raycast/api, Vitest, Testing Library, Prettier.

**Spec:** [KYR-29 — Show all matching terms in a scrollable Search Term list](https://linear.app/kyrylo1/issue/KYR-29/show-all-matching-terms-in-a-scrollable-search-term-list).

## Planning status and scope

The user requested research, a plan, and a ticket, and explicitly prohibited implementation. This document proposes showing all terms in the left list, including when recent history exists, and verifying complete right-pane scrolling. An optional clarification was offered; this is the stated planning assumption pending any correction. It does not authorize code changes.

## Research findings

Research used the local Obsidian extension at `../extensions/extensions/obsidian`, rather than a Desktop copy. Paths below are relative to that extension.

- `src/components/NoteList/NoteList.tsx:51–79` sorts/filters notes and slices to a rendering cap; `src/utils/constants.ts:7` sets that cap to 1,000. It has no pagination. Obsidian does not render an unlimited number of notes.
- `src/components/NoteList/NoteList.tsx:85–112` renders Raycast's native `List`, enables its detail pane, tracks selection, and maps the filtered notes into rows.
- `src/components/NoteList/NoteListItem/NoteListItem.tsx:62–99` loads content for the selected row and supplies it to `List.Item.Detail`.
- `src/utils/hooks.ts:153–173` reads the complete selected Markdown file asynchronously. Obsidian filters and renders Markdown-specific syntax; GlossaryGo definitions are plain text, so those content transformations do not apply.
- `src/components/NoteQuickLook.tsx:7–27` supplies the selected content to a standalone `Detail` reader.

GlossaryGo already loads the entire validated glossary through `src/glossary/glossary.ts:14–21`. Its search hook discards results beyond five at `src/hooks/search.ts:25`; `src/constants.ts:3` defines that limit. `src/search-term.tsx:268–287` maps the remaining terms and displays the overflow subtitle. Both the preview and full reader already receive complete literal definitions. Completed KYR-23 covers that reader; KYR-29 addresses complete list browsing and verifies preview scrolling alongside it.

The recommended approach removes GlossaryGo's arbitrary display cap and uses the existing native list. Raising the cap to 1,000 would still hide valid glossary entries. Pagination would add controls and state to a glossary that is already fully loaded. Neither is needed for this bounded change.

## Global constraints

- macOS only; preserve the existing 5 MiB source-file limit.
- Search term-name prefixes only; trim queries, ignore case, preserve accents, and match canonically equivalent Unicode.
- Preserve locale-aware alphabetical order for typed matches and for non-recent blank-query terms.
- Preserve history capacity of 20, successful-copy-only recording, pruning, and session/path reset. Blank queries will now append non-recent terms instead of hiding them.
- Preserve exact clipboard values, literal definition rendering, existing actions, explicit reload, and failure recovery.
- Keep glossary content and history local and in memory; use synthetic fixtures. Writes remain exclusively explicit mutations through the existing save service.
- Preserve unrelated changes. Do not delete files or revert commits. Delegate commits and commit-message creation to a separate Luna agent at low reasoning.
- Read AGENTS.md, README.md, TESTING.md, and package.json before implementation; use vercel-react-best-practices for TSX changes.
- Deliver one pull request for KYR-29. Implementation and publication require subsequent authorization.

## Task 1: Complete searchable and browsable results

**Files:**

- Modify `src/hooks/search.ts`: complete results and blank-query ordering.
- Modify `src/constants.ts`: remove only the unused result-limit export.
- Modify `src/search-term.tsx`: remove cap-related import/subtitle and describe the expanded result list accurately.
- Modify `src/hooks/search.test.ts`: replace capped expectations and cover ordering/deduplication.
- Modify `src/search-term.test.tsx`: update history expectations and prove later rows/actions render.
- Modify `README.md`: complete list, recent-first blank-query ordering, native scrolling.
- Modify `TESTING.md`: affected S1–S5, H1–H5, search fixture requirements, and coverage pointers.

**Interfaces:** Keep `searchTerms(terms: readonly Term[], query: string, history: readonly string[] = []): SearchResult` and `SearchResult { terms, totalMatchCount }`. The result count equals returned terms. `useGlossary` continues exposing the same controller; its `isRecent` flag describes a blank-query recent-first ordering rather than a recent-only result set.

- [ ] Add failing unit cases for an empty query with more than five terms, a prefix matching more than five terms, all current recent terms followed by all remaining terms, stale history fallback, and no duplicates for case-/Unicode-equivalent recent names. Keep existing prefix, accent, whitespace, and definition-exclusion coverage.

  Concrete assertions using the existing `term` test helper:

  ```ts
  const all = ["A07", "A06", "A05", "A04", "A03", "A02", "A01"].map((name) => term(name));
  const alphabetical = [...all].reverse();
  expect(searchTerms(all, "a")).toEqual({ terms: alphabetical, totalMatchCount: 7 });
  expect(searchTerms(all, "")).toEqual({ terms: alphabetical, totalMatchCount: 7 });
  expect(searchTerms(all, " ", ["A07", "A02", "Deleted"])).toEqual({
    terms: [term("A07"), term("A02"), term("A01"), term("A03"), term("A04"), term("A05"), term("A06")],
    totalMatchCount: 7,
  });
  ```

- [ ] Add a failing component case that renders every synthetic term, includes the last match for a broad prefix, shows no five-result overflow message, and copies the last row's original definition. Update existing history assertions so copied terms precede the remaining alphabetical glossary; failed copies and path/session resets still yield the full alphabetical glossary.
- [ ] Run `npm test -- src/hooks/search.test.ts src/search-term.test.tsx` and confirm the new expectations fail because of the current cap/recent-only branch.
- [ ] Return all ordered matches. Sort a filtered copy; preserve source order and data. Resolve current recent terms only on blank queries and exclude their equivalent names from the alphabetical remainder using the shared matching policy. The core change can follow this shape, with an `areTermsEquivalent` import from `../glossary/term-matching`:

  ```ts
  const normalizedQuery = query.trim();
  const alphabetical = terms
    .filter(({ term }) => termStartsWith(term, normalizedQuery))
    .sort((left, right) => termCollator.compare(left.term, right.term));
  const recent = normalizedQuery.length === 0 ? resolveRecentTerms(history, terms) : [];
  const matches =
    recent.length > 0
      ? [...recent, ...alphabetical.filter(({ term }) => !recent.some((entry) => areTermsEquivalent(entry.term, term)))]
      : alphabetical;
  return Object.freeze({ terms: Object.freeze(matches), totalMatchCount: matches.length });
  ```

- [ ] Remove result-limit wiring. Keep one `Terms` section; use `Recent terms first` as its subtitle when `isRecent` is true and no subtitle otherwise. Keep the existing native List, stable row IDs, item detail, literal renderer, and action order. Do not add a custom scroll container or copy Obsidian's Markdown transformations.
- [ ] Update README and affected TESTING scenarios in the same feature change. S2 must reach the last result by scrolling without narrowing the query. S3 must reach the last definition line in the right pane. H1/H2 must show recent names first followed by every remaining term, without duplicates. H3–H5 must distinguish history membership from the expanded visible list.
- [ ] Run the targeted suites again; then run `npm test`, `npm run lint`, `npm run check:format`, and `npm run build`. Record actual results and baseline failures separately. No changes to source validation or mutation services are planned.
- [ ] Delegate a focused local feature commit to a separate Luna agent at low reasoning after its checks pass. Keep any later fixes in separate commits; never revert earlier commits. Commit only intended files.

## Task 2: Verify native scrolling and prepare the ticket handoff

**Files:** Read `TESTING.md`; record run-specific evidence in the implementation handoff, not this reusable plan. Any resulting fixes also update affected tests/docs and receive a separate focused commit.

- [ ] Confirm the active Raycast runtime and effective synthetic Glossary File. Use a disposable glossary with 100 matching names in deliberately unsorted file order, plus a long literal multiline definition with a distinctive final line.
- [ ] For S1/S2, browse from the first to the last term with an empty query, then with a shared prefix. Repeat after successful copies populate history; every term stays reachable, with recent terms first on blank queries and alphabetical typed matches.
- [ ] For S3/S4, scroll the selected right preview to its final line, switch rows, and open the existing full reader. Verify complete literal content and correct selection/query on return. Do not infer scrolling from component tests or data presence alone.
- [ ] For S5 and V5, copy a late row's name and definition exactly, then reload after synthetic additions/removals. Verify query retention, complete current results, history pruning, and recovery from invalid content without stale results.
- [ ] Check responsiveness with a larger synthetic glossary within the current size limit. If scrolling or typing becomes sluggish, record the fixture scale and observed behavior before selecting an optimization; do not silently reintroduce a cap. Verify native scrolling directly rather than assuming a virtualization mechanism.
- [ ] Restore fixture bytes, preferences, clipboard, and runtime state. Provide filesystem cleanup commands instead of deleting disposable files.
- [ ] Report automated checks separately from live Raycast cases, with pass/fail/blocked/not-run evidence. Include a synthetic screenshot of complete list browsing in the eventual single KYR-29 pull request. Leave implementation unverified until these steps are actually executed.

## Plan verification

Local source research and ticket creation are complete. The planning change requires a formatting check and review of referenced files/scripts. Feature tests, build, performance checks, and live Raycast acceptance are future implementation work; no feature behavior has been changed or verified by this plan.
