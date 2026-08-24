# GlossaryGo

GlossaryGo provides fast lookup of terms stored in a user-owned glossary.

## Language

**Glossary**:
A user-owned collection of terms and their definitions.
_Avoid_: Dictionary, configuration

**Term**:
A named glossary entry that has a definition and can appear in search results.
_Avoid_: Item, record, search term

**Definition**:
The plain-text explanatory content associated with a term. A definition may span multiple lines.
_Avoid_: Description, value

**Prefix Search**:
A case-insensitive but accent-sensitive search in which a trimmed query matches terms whose names begin with that
query; for example, `a` matches `a123`, `a456`, and `API`, but `e` does not match `éclair`. Equivalent Unicode
encodings compare identically. Definitions are not searched. Matching Terms are ordered in case-insensitive,
accent-sensitive, locale-aware ascending order. The result contains at most the first five matching Terms and the
total number of matches. It distinguishes a Glossary with no Terms from a query that matches no Terms.
_Avoid_: Fuzzy search, contains search
