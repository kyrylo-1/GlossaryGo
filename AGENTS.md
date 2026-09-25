# Repository Guidelines

GlossaryGo: Raycast extension for searching private local YAML glossary.

## Structure and context

- `src/search-term.tsx`: command UI.
- `src/glossary/`: loading, decoding, validation, tests.
- `src/hooks/`: state, reload, search. `src/utils/`: shared helpers.
- `*.test.ts`: tests beside source. `assets/`: extension icon.
- `package.json`: commands, preferences. `glossary.schema.json`: format.

Read `CONTEXT.md` before changing domain terminology. Read `README.md` before changing validation or search behavior.

## Commands

Look at scripts in package.json

## Style and tests

Strict TypeScript; two spaces; double quotes; semicolons; Prettier width 120.
Use kebab-case filenames, camelCase functions/variables, PascalCase types/components.
Follow ESLint: function expressions, explicit return types, type-only imports, `type` aliases.
For TSX, use `vercel-react-best-practices` skill.

Use descriptive Vitest `describe` / `test` names. No numeric coverage threshold.

## Commits and PRs

Use concise, action-oriented subjects; imperative, `feat:`, or `refactor:` styles match history. Keep commits focused.
PRs explain problem, resulting behavior, validation; link issues and include screenshots for visible UI changes.

## Privacy and agent rules

Keep glossary content local and in memory for every command except Ask Glossary. Only after an explicit question and
in-session disclosure confirmation, Ask Glossary may send the question and complete decoded term/definition context
within its limit to Raycast AI with static grounding instructions. Refuse over-limit context in full; exclude paths,
YAML source, comments, and metadata. Persist, log, and cache none of the question, answer, or context.
Only permitted glossary persistence: explicit Add Term, Edit Term, or Delete Term through the glossary save service to
the effective Glossary File: `glossary.yaml` inside the user-selected Glossary Location, preserving a legacy
user-selected `.yaml` file preference, otherwise `glossary.yaml` under Raycast's `environment.supportPath`.
Use synthetic test data.

Preserve unrelated worktree changes. DSG hook blocks file deletion: provide deletion commands instead.
When committing, delegate creation to separate Luna agent with low reasoning.
