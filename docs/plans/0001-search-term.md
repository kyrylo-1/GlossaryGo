# Search Term Implementation Plan

Status: Confirmed on 2026-08-23. This document is an implementation plan, not an implementation.

## Outcome

GlossaryGo will expose one public Raycast command, **Search Term**, that reads a user-selected local glossary and shows
at most five prefix matches with their definitions. The command will work on macOS and Windows, keep glossary content
local, and provide copy and reload actions.

This plan follows the project language in [CONTEXT.md](../../CONTEXT.md) and the file-format decision in
[ADR 0001](../adr/0001-use-a-user-selected-yaml-glossary.md).

## Scope

Version one includes:

- one interactive `view` command named `search-term` with the title `Search Term`;
- a required Raycast `file` preference for the glossary path;
- strict loading and validation of one local `.yaml` file;
- prefix search over term names only;
- a five-result list with a full definition detail pane;
- `Copy Definition`, `Copy Term`, and `Reload Glossary` actions;
- distinct loading, empty-glossary, no-match, and configuration-error states;
- automated tests for the pure loading, validation, and search behavior; and
- setup, format, privacy, and troubleshooting documentation.

Version one does not include glossary editing, `.yml` or JSON input, categories, aliases, links, tags, fuzzy or
contains matching, definition searching, automatic file watching, persistent caching, network access, telemetry, or
publishing the extension.

## User Workflow

1. The user opens `Search Term` for the first time and Raycast requests the required **Glossary File** preference.
2. The user selects a local `.yaml` file.
3. The command loads and validates the complete file before showing any terms.
4. With an empty query, the list shows the first five terms in ascending order.
5. As the user types, the list shows the first five terms whose names begin with the trimmed query.
6. Selecting a result shows its complete definition in the detail pane.
7. The primary action copies the definition; the secondary action copies the term. Both keep the command open and
   provide brief success feedback.
8. `Reload Glossary` rereads the selected file. A failed reload replaces the old results with an error rather than
   leaving stale data visible.

## Glossary File Contract

The file must use the `.yaml` extension, contain valid UTF-8, be no larger than 5 MiB, and contain exactly one YAML
document. It has no schema-version field.

```yaml
terms:
  - term: API
    definition: Application Programming Interface

  - term: ADR
    definition: |
      A short record of an architectural decision
      and the reasons behind it.
```

The document root must contain exactly one field, `terms`, whose value is a sequence. `terms: []` is valid. Every
entry must be a mapping with exactly two fields:

- `term`: a non-empty string with no leading or trailing whitespace;
- `definition`: a non-empty plain-text string, which may contain line breaks.

Definition content is preserved when copied. The UI must render it as literal plain text even though Raycast's detail
component accepts Markdown.

Reject the complete file when any of these conditions occurs:

- the path does not end in `.yaml`, the file is missing or unreadable, the bytes are not valid UTF-8, or the file is
  larger than 5 MiB;
- the stream contains malformed YAML or more than one document;
- the root shape, `terms` value, entry shape, or field type is invalid;
- a root or entry mapping contains an unknown field;
- a term or definition is empty, or a term has surrounding whitespace;
- two terms are equivalent after the same Unicode normalization and case-insensitive comparison used by search; or
- the document contains anchors, aliases, merge keys, custom tags, or another unsupported YAML construct.

Ordinary mappings, sequences, comments, quoted strings, and literal or folded multiline strings remain supported.
Validation errors should identify the affected entry and source line when the parser provides location information.
User-facing errors must be concise and must not expose parser stacks or glossary content.

## Search Contract

Search operates entirely in memory after a successful load:

1. Trim the query and normalize it and candidate term names to a consistent Unicode form.
2. Compare term prefixes case-insensitively but accent-sensitively. For example, `a` matches `API`, while `e` does
   not match `éclair`; canonically equivalent encodings of the same visible text do match.
3. Never search definition content.
4. Sort all matches by `term` using a case-insensitive, accent-sensitive, locale-aware ascending comparison.
5. Compute the total match count, then return only the first five results.

An empty query matches the entire glossary before sorting and truncation. When more than five entries match, the UI
shows `Showing 5 of N matches`. No exact-match promotion or file-order preference overrides ascending order.

## Interaction States

| State          | List content                                                               | Detail/actions                               |
| -------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| Loading        | Loading indicator                                                          | No term actions                              |
| Ready          | Up to five ordered matches                                                 | Selected definition; copy and reload actions |
| Empty glossary | `No Terms in Glossary`                                                     | Reload and open-preferences actions          |
| No match       | `No Matching Terms` with guidance to refine the prefix                     | Reload action                                |
| Error          | Actionable parse, validation, access, encoding, extension, or size message | Reload and open-preferences actions          |

The first visible result is selected by default so its definition is immediately available. Copy operations preserve
the selected value, show success feedback, and do not close Raycast.

## Module Boundaries

Keep the command entry point focused on Raycast UI and place untrusted-input handling behind small typed modules:

- `package.json`
  - rename the manifest command from `searh-term` to `search-term`;
  - change the title to `Search Term` and mode to `view`;
  - add the required **Glossary File** file preference;
  - add `yaml`, Vitest, and an `npm test` script while preserving npm lockfile consistency.
- `src/searh-term.ts` → `src/search-term.tsx`
  - render the Raycast list, detail pane, empty/error states, and action panels;
  - own an explicit loading/ready/error state machine so a failed reload cannot retain stale results;
  - obtain the configured file path from Raycast preferences and call the loader;
  - keep clipboard writes and feedback at the UI boundary.
- `src/glossary.ts`
  - export the immutable `Term` domain type;
  - read the file with cross-platform Node APIs, enforce byte-size and fatal UTF-8 decoding checks, and parse it with
    the `yaml` document API;
  - inspect the YAML syntax tree for forbidden constructs before converting untrusted values;
  - validate and narrow every value without `any`;
  - return validated terms or a typed, user-safe glossary error with location metadata when available.
- `src/search.ts`
  - own query normalization, duplicate comparison keys, prefix matching, locale-aware sorting, total counting, and
    five-result truncation;
  - expose a pure result containing the visible terms and total match count.
- `src/glossary.test.ts` and `src/search.test.ts`
  - exercise the data and search contracts without requiring the Raycast UI runtime.
- `README.md` and `CHANGELOG.md`
  - document the user-visible workflow and preserve Raycast's `{PR_MERGE_DATE}` changelog placeholder.

Do not introduce platform-specific path handling or shell execution. Do not read, cache, log, or transmit glossary
content outside the selected file, in-memory command state, and an explicit clipboard action.

## Implementation Slices

### 1. Establish the command shell

- Rename the misspelled manifest command and source entry point together.
- Convert the entry point to `.tsx`, change the command to `view` mode, and add the required file preference.
- Render a minimal loading/empty shell that proves Raycast resolves the renamed command and generated preference types.
- Run manifest lint and build before proceeding.

### 2. Load and validate a glossary

- Add the `yaml` runtime dependency through npm.
- Implement the typed glossary loader, size and UTF-8 gates, one-document parser, forbidden-node checks, schema
  validation, duplicate detection, and safe errors.
- Add Vitest through npm, configure `npm test`, and cover valid and invalid file-contract scenarios.
- Connect the command state machine to the loader so launch and reload both use the same path and failure behavior.

### 3. Deliver prefix search

- Implement normalization, prefix matching, sorting, total counting, and five-item truncation as pure functions.
- Add focused tests for empty queries, trimming, case differences, accents, canonically equivalent Unicode, definition
  exclusion, ordering, duplicate comparison, truncation, and total counts.
- Feed the query and loaded terms into the search result without file rereads on each keystroke.

### 4. Complete the Raycast interaction

- Render list items with the term as title and the selected plain-text definition in the detail pane.
- Add distinct empty-glossary, no-match, and error views.
- Add the truncation count, copy actions, reload, open-preferences, and success/error feedback.
- Confirm that reload clears prior data before committing a new valid glossary and that failures cannot display stale
  results.

### 5. Document and verify the release candidate

- Expand the README with setup, the exact YAML schema, a multiline example, matching behavior, the five-result limit,
  supported platforms, privacy, reload instructions, and common validation failures.
- Add the user-visible feature to the changelog while preserving `{PR_MERGE_DATE}`.
- Inspect the complete diff for accidental platform assumptions, content logging, unrelated changes, or manifest/source
  mismatches.

## Automated Test Matrix

Loader and validator coverage:

- valid one-line, quoted, commented, literal-block, and folded multiline definitions;
- an empty `terms` sequence and a glossary with several thousand entries;
- wrong extension, missing file, unreadable file, invalid UTF-8, and files at and over the 5 MiB boundary;
- malformed and multiple-document YAML;
- missing, extra, reordered, non-string, null, empty, and whitespace-padded fields;
- wrong root and `terms` container types;
- case-insensitive and canonically equivalent duplicate terms;
- anchors with or without aliases, aliases, merge keys, and explicit/custom tags; and
- safe messages with entry or line information and no raw stack or glossary-value leakage.

Search coverage:

- empty and whitespace-only queries;
- ordinary, mixed-case, and multiword prefixes;
- definitions never affecting matches;
- accent-sensitive and canonically normalized comparisons;
- case-insensitive, locale-aware ascending order;
- zero, one, five, and more-than-five matches; and
- correct total counts alongside the five visible results.

## Verification

Run from the repository root using npm exclusively:

```bash
npm test
npm run lint
npm run build
npm run dev
```

In Raycast development mode, manually verify:

- first-run required preference setup;
- valid, empty, missing, malformed, oversized, and subsequently corrupted glossaries;
- empty-query and typed-query ordering, counts, truncation, Unicode, and no-match behavior;
- full multiline detail rendering and exact clipboard contents;
- copy actions staying open with feedback;
- successful reloads and failed reloads replacing stale results; and
- concise error recovery through reload and extension preferences.

Exercise both macOS and Windows when environments are available. If Windows manual testing is unavailable, report that
gap explicitly; lint, build, and platform-neutral tests do not substitute for live Windows acceptance.

## Acceptance Criteria

- Raycast resolves exactly one command named `search-term`, backed by `src/search-term.tsx`, and the old misspelling no
  longer exists in the command registry or source tree.
- The command cannot open without a selected glossary file and accepts only the confirmed `.yaml` contract.
- Invalid input never produces partial or stale results and always produces a safe, actionable error.
- Empty and non-empty queries follow the confirmed prefix, Unicode, ordering, count, and five-result rules.
- The selected definition is fully readable and both copy actions preserve content while keeping Raycast open.
- Launch and manual reload always reread the local source of truth; no glossary data is persisted, logged, or sent over
  the network.
- `npm test`, `npm run lint`, and `npm run build` pass, and available manual macOS/Windows checks are reported honestly.
- README and changelog describe the shipped behavior, and no publish, push, or pull request occurs without a separate
  explicit request.
