# Add Term writes to the selected Glossary File

GlossaryGo currently reads a user-owned Glossary File, and its privacy guidance prohibits persisting glossary content. The user confirmed that Add Term may change that file and save a new term directly, so adding a term can be completed through the command without manual YAML insertion. This introduces a narrow exception for user-requested additions to the selected Glossary File; it does not authorize unrelated persistence, logging, or transmission.

## Consequences

- Update the read-only privacy wording when implementing the feature.
- Treat the existing file as user-owned content that must be protected during saves.
- A restricted transient sibling file may be used for replacement. Normal cleanup removes it, but a crash may leave it behind; this privacy consequence was accepted during the design interview.
- Detected external edits abort the save with the user's input preserved. The user accepts that these checks cannot guarantee protection against an external writer changing the file at the exact same moment.
- The implementation plan records the confirmed entry points, input rules, formatting, success navigation, and recovery behavior. Support for linked file paths remains the final scope check.
