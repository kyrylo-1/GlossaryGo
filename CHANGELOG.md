# GlossaryGo Changelog

## [Select Existing Glossary Files] - {PR_MERGE_DATE}

- Replaced Create Glossary File with Select Glossary File for existing `.yaml` and `.yml` files with any basename.
- Validate locally before explicit activation; share the selected path across commands without changing file contents.
- Preserve the active glossary on cancellation, invalid files, or access failures, with file-selection recovery actions.

## [Initial Version] - {PR_MERGE_DATE}

- Added the **Search Term** command for case-insensitive prefix search across a user-selected local YAML glossary.
- Added sorted results with a five-result limit, full definition details, and copy actions for terms and definitions.
- Added in-command actions for adding, editing, and deleting glossary terms.
- Added the standalone **Add Term** command with saved-value confirmation and an option to add another term.
- Added the **Quick Add Term** command with inline arguments for saving directly from Raycast's root search.
- Added automatic first-save creation of a private default glossary in Raycast's extension support directory.
- Added safe, conflict-aware glossary updates that preserve supported YAML comments and formatting.
