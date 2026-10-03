# GlossaryGo

GlossaryGo supports finding, adding, editing, and deleting terms in a user-owned glossary.

## Language

**Glossary**:
A user-owned collection of terms and their definitions.
_Avoid_: Dictionary, configuration

**Glossary File**:
The effective `.yaml` or `.yml` file that encodes a Glossary. **Select Glossary File** validates an existing file and,
after explicit activation, stores its exact path locally for subsequent commands. Selection never writes file contents.
Before the first activation, a retained Glossary Location preference or Raycast's default support-directory
`glossary.yaml` remains effective. Invalid or missing active files cause recovery rather than fallback.
_Avoid_: Configuration file, glossary document

**Glossary Location**:
The legacy optional preference used only until a file is activated through Select Glossary File. A stored folder
resolves to `glossary.yaml`; a retained direct YAML file path stays direct. A valid first Add can create a missing file
at this fallback target, but choosing a location or opening a command cannot.
_Avoid_: Active selection, configuration folder

**Term**:
A named glossary entry that has a definition and can appear in search results. Multiple terms may share the same name, including case- or Unicode-equivalent spellings. Each is an independent entry with its own definition; even identical name-and-definition entries remain separate.
_Avoid_: Item, record, search term

**Definition**:
The plain-text explanatory content associated with a term. A definition may span multiple lines.
_Avoid_: Description, value
