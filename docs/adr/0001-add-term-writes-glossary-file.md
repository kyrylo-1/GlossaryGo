# Add Term writes to the selected Glossary File

GlossaryGo currently reads a user-owned Glossary File, and its privacy guidance prohibits persisting glossary content. The user confirmed that Add Term may change that file and save a new term directly, so adding a term can be completed through the command without manual YAML insertion. This introduces a narrow exception for user-requested additions to the selected Glossary File; it does not authorize unrelated persistence, logging, or transmission.

## Consequences

- Update the read-only privacy wording when implementing the feature.
- Treat the existing file as user-owned content that must be protected during saves.
- Command entry points, duplicate handling, input cleanup, formatting, and the file-writing mechanism remain separate design decisions.
