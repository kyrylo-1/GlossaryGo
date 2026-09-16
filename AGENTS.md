# Repository Guidelines

## Project Structure & Module Organization

GlossaryGo is a Raycast extension for searching a private local YAML glossary.

- `src/search-term.tsx` implements the command UI.
- `src/glossary/` contains glossary file loading, decoding, validation, and their tests.
- `src/hooks/` contains glossary state, reload handling, and search logic; `src/utils/` contains shared helpers.
- Tests live beside source files as `*.test.ts`; `assets/` contains the extension icon.
- `package.json` defines the Raycast command and preferences; `glossary.schema.json` describes the glossary format.

Read `CONTEXT.md` before changing domain terminology and `README.md` before changing glossary validation or search behavior.

## Build, Test, and Development Commands

Use only npm for this repo. Node.js 22.22.2 or newer is required.

- `npm ci`: install dependencies from `package-lock.json`.
- `npm run dev`: start Raycast development mode.
- `npm run build`: build the extension.
- `npm run lint`: run Raycast/ESLint checks; `npm run fix-lint` applies automatic fixes.
- `npm test`: run the Vitest suite once.
- `npm test -- src/hooks/search.test.ts`: run focused search tests.
- `npm run check:format`: check Prettier formatting; `npm run format` formats the repository.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, double quotes, semicolons, and Prettier's 120-column width. Use kebab-case filenames, camelCase functions and variables, and PascalCase types and components. Follow ESLint's requirements for function expressions, explicit return types, type-only imports, and `type` aliases.

For TSX files, use the `vercel-react-best-practices` skill.

## Testing Guidelines

Use Vitest with descriptive `describe` and `test` names. Cover changed behavior, especially invalid YAML, duplicate terms, Unicode prefix matching, and reload failures. No numeric coverage threshold is configured. Before submitting code changes, run tests, lint, formatting checks, and the build. For UI changes, manually verify search, reload, and clipboard actions in Raycast.

## Commit & Pull Request Guidelines

Recent history mixes imperative subjects with `feat:` and `refactor:` prefixes. Write concise, action-oriented subjects and keep commits focused. PRs should explain the problem, resulting behavior, and validation; link relevant issues and include screenshots for visible UI changes.

## Privacy & Agent Instructions

Keep glossary content local and in memory. The only permitted persistence is an explicit Add Term, Edit Term, or
Delete Term write through the glossary save service to the effective Glossary File: the user-selected `.yaml` file when
configured, otherwise `glossary.yaml` under Raycast's `environment.supportPath`. Never persist glossary content
elsewhere, log it, or transmit it. Use synthetic glossary data in tests.

Preserve unrelated working-tree changes. Agents must provide deletion commands for the user instead of deleting files because of the DSG hook. When a commit is requested, delegate its creation to a separate Luna agent with low reasoning.
