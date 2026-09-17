# Repository Guidelines

GlossaryGo: Raycast extension for searching private local YAML glossary.

## Structure and context

- `src/search-term.tsx`: command UI.
- `src/glossary/`: loading, decoding, validation, tests.
- `src/hooks/`: state, reload, search. `src/utils/`: shared helpers.
- `*.test.ts`: tests beside source. `assets/`: extension icon.
- `package.json`: commands, preferences. `glossary.schema.json`: format.

Read `CONTEXT.md` before changing domain terminology. Read `README.md` before changing validation or search behavior.
Read `TESTING.md` before features, behavior changes, regression fixes, or acceptance tests.
Update affected testing scenarios in the same change. Report automated checks separately from live Raycast evidence.

## Commands

Look at scripts in package.json

## Style and tests

Strict TypeScript; two spaces; double quotes; semicolons; Prettier width 120.
Use kebab-case filenames, camelCase functions/variables, PascalCase types/components.
Follow ESLint: function expressions, explicit return types, type-only imports, `type` aliases.
For TSX, use `vercel-react-best-practices` skill.

Use descriptive Vitest `describe` / `test` names. Cover changed behavior, especially invalid YAML, duplicates,
Unicode prefixes, reload failures. No numeric coverage threshold.
Before submitting code, run tests, lint, formatting checks, build.
For UI changes, verify search, reload, clipboard in Raycast using `TESTING.md`.

## Commits and PRs

Use concise, action-oriented subjects; imperative, `feat:`, or `refactor:` styles match history. Keep commits focused.
PRs explain problem, resulting behavior, validation; link issues and include screenshots for visible UI changes.

## Privacy and agent rules

Keep glossary content local and in memory. Only permitted persistence: explicit Add Term, Edit Term, or Delete Term
through glossary save service to effective Glossary File. Target user-selected `.yaml` when configured; otherwise
`glossary.yaml` under Raycast's `environment.supportPath`. Never persist content elsewhere, log it, or transmit it.
Use synthetic test data.

Preserve unrelated worktree changes. DSG hook blocks file deletion: provide deletion commands instead.
When committing, delegate creation to separate Luna agent with low reasoning.
