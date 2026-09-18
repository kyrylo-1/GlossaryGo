# GlossaryGo

GlossaryGo supports finding, adding, editing, and deleting terms in a user-owned glossary.

## Language

**Glossary**:
A user-owned collection of terms and their definitions.
_Avoid_: Dictionary, configuration

**Glossary File**:
The effective YAML file that encodes a Glossary. It is either the optional user-selected file or GlossaryGo's default
file in Raycast's extension support directory.
_Avoid_: Configuration file, glossary document

**Term**:
A named glossary entry that has a definition and can appear in search results. Multiple terms may share the same name, including case- or Unicode-equivalent spellings. Each is an independent entry with its own definition; even identical name-and-definition entries remain separate.
_Avoid_: Item, record, search term

**Definition**:
The plain-text explanatory content associated with a term. A definition may span multiple lines.
_Avoid_: Description, value
