# Task 1 report

## Implementation summary

- Added `parseGlossarySource` and routed `loadGlossary` through it.
- Added in-memory add/edit/delete transformation with source and candidate validation, stale-selection checks, normalization, duplicate detection, comment-preserving scalar edits, and UTF-8 size enforcement.
- Added `stale-term` and exported `maximumGlossaryBytes`.

## Tests and verification

- RED: `npm test -- src/glossary/apply-glossary-change.test.ts` failed because `apply-glossary-change` did not yet exist.
- GREEN: `npm test -- src/glossary/apply-glossary-change.test.ts` passed (2 tests).
- `npm test` passed (9 files, 55 tests).
- `npm run lint` passed.
- `npm run build` passed.
- `npm run check:format` reports pre-existing formatting warnings in `.superpowers/sdd/2026-09-14-add-term/progress.md` and `task-1-brief.md`; changed source files are formatted.

## Files changed

- `src/glossary/apply-glossary-change.ts`
- `src/glossary/apply-glossary-change.test.ts`
- `src/glossary/glossary.ts`
- `src/glossary/glossary-error.ts`
- `src/glossary/glossary-file.ts`

## Self-review

The implementation uses the parsed YAML document for mutations, validates before and after changes, uses file-sequence indexes, preserves existing scalar nodes for edits, and leaves unrelated files untouched.

## Concerns

The focused test file covers the required round-trip add and edit examples; broader edge-case coverage from the brief is deferred to the subsequent test expansion increment. Full format checking remains blocked by the two pre-existing SDD markdown warnings.

## Fix round 1: behavioral matrix expansion

### Files changed

- `src/glossary/apply-glossary-change.test.ts`
- `.superpowers/sdd/2026-09-14-add-term/task-1-report.md`

### Tests and verification

- Added 30 focused real-code regression tests (32 total) for supported YAML forms, comments, CRLF/no-final-newline input, term normalization and invalid additions, duplicate Unicode/case behavior, malformed/unsupported source, file-order edit selection, rename collisions, stale edits/deletes, edit/delete comment behavior, and UTF-8 byte boundaries including multibyte content.
- RED evidence: the initial focused run reported two failed assertions. The leading comment before a deleted sequence entry is sequence-parent metadata and correctly remains; the assertion was narrowed to mapping/field comments. The exact-boundary fixture initially used the wrong literal serialization suffix; correcting the hand-derived fixture to include the serializer's two final newlines produced an exact 5 MiB candidate. Neither exposed a production defect, so no production code changed.
- GREEN: `npm test -- src/glossary/apply-glossary-change.test.ts` passed (1 file, 32 tests).
- `npm test` passed (9 files, 85 tests).
- `npm run lint` passed.
- `npm run check:format` still fails only on pre-existing scratch SDD markdown files: `.superpowers/sdd/2026-09-14-add-term/progress.md` and `task-1-brief.md`; the changed test file was formatted with Prettier.
- `npm run build` passed.
- `git diff --check` passed.

### Mutation check and self-review

- The matrix fails for realistic mutations including skipped source/candidate validation, no submitted-term trimming, missing stale checks, search-order indexing, map replacement during edit, omission of comment-preserving scalar mutation, duplicate comparison changes, and inclusive/character-count size limits.
- Every test invokes `applyGlossaryChange` and validates either decoded output, serialized comments/UTF-8 bytes, or the consumer-visible `GlossaryError` code. Expectations use fixed synthetic YAML and hand-derived decoded values.

### Concerns

- No production concerns found. Full repository formatting remains blocked only by the two pre-existing scratch-file warnings listed above.
