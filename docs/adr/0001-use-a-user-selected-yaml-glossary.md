# Use a user-selected YAML glossary

GlossaryGo will read its glossary from a `.yaml` file selected through a required Raycast file preference. YAML was
chosen as the version-one public format because users can comfortably edit comments and multiline definitions, while
the file preference avoids fixed, platform-specific paths on macOS and Windows. The document root is an object with a
`terms` collection, and each entry contains exactly the required `term` and `definition` string fields. Files must be
UTF-8, contain exactly one YAML document of no more than 5 MiB, and need no schema-version field. `terms` may be empty;
ordinary mappings, sequences, comments, and multiline strings are supported. Anchors, aliases, merge keys, custom
tags, unknown fields, and case-insensitive duplicate terms are rejected so the public contract stays predictable and
safe to validate.
