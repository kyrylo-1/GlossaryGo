# Term actions write to the selected Glossary File

GlossaryGo currently reads a user-owned Glossary File, and its privacy guidance prohibits persisting glossary content. The user confirmed that the existing Search Term window's action menu should support adding, editing, and deleting terms directly in that file, so those operations can be completed without manual YAML editing. This introduces a narrow exception for user-requested term changes to the selected Glossary File; it does not authorize unrelated persistence, logging, or transmission.

## Consequences

- Update the read-only privacy wording when implementing the feature.
- Treat the existing file as user-owned content that must be protected during saves.
- A restricted transient sibling file may be used for replacement. Normal cleanup removes it, but a crash may leave it behind; this privacy consequence was accepted during the design interview.
- Detected external edits abort the save with the user's input preserved. The user accepts that these checks cannot guarantee protection against an external writer changing the file at the exact same moment.
- The menu replaces the earlier standalone-command proposal; the existing Search Term preference remains in place.
- Edit Term changes both name and definition. Delete Term requires confirmation and retains the current search query after refresh; removing the last term leaves an empty file.
- Editing preserves comments. Deletion removes comments attached to the deleted entry while preserving glossary and surviving-entry comments, using parsed YAML node ownership.
- Writing is limited to ordinary files; symbolic links and multiply linked files are rejected to avoid changing their link relationships through replacement.
- The implementation plan records all confirmed behavior and the incremental validation/commit sequence. Implementation remains a separate task from this planning session.
