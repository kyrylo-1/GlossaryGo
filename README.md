# GlossaryGo

GlossaryGo searches a private glossary stored in a local YAML file. Open **Search Term** in Raycast, type the start of
a term, and select a result to read or copy its complete definition.

## Setup

1. Create a UTF-8 file whose name ends in `.yaml` using the format below.
2. Open **Search Term** in Raycast.
3. When prompted, set the required **Glossary File** preference to that file. You can change it later in the
   extension preferences.

GlossaryGo supports macOS and Windows. The selected file must be readable, contain exactly one YAML document, and be
no larger than 5 MiB. Changing terms also requires the path to be a writable ordinary file with exactly one filesystem
link. Symbolic links and multiply hard-linked files may be searched, but GlossaryGo will not update them because
replacement could change their link semantics. The `.yml` extension is not supported.

## Glossary format

The document root must contain exactly one field named `terms`. Its value is a sequence of entries, and each entry
must contain exactly the two fields shown here:

```yaml
terms:
  - term: API
    definition: Application Programming Interface

  - term: ADR
    definition: |
      A short record of an architectural decision
      and the reasons behind it.
```

`term` and `definition` must both be non-empty strings. A term cannot have leading or trailing whitespace. Definitions
may span multiple lines, and their content is preserved when displayed and copied. An empty glossary is valid:

```yaml
terms: []
```

Do not add other root or entry fields. Duplicate terms are rejected using the same Unicode-normalized,
case-insensitive comparison as search. Anchors, aliases, merge keys, custom tags, and multiple YAML documents are not
supported. Ordinary mappings, sequences, comments, quoted strings, and literal or folded multiline strings are
supported.

## Searching and actions

Search matches term-name prefixes only. It trims the query, ignores case, preserves accent differences, and treats
canonically equivalent Unicode text as the same. For example, `a` matches `API`, while `e` does not match `éclair`.
Definitions are never searched.

Matches are sorted in case-insensitive, accent-sensitive, locale-aware ascending order. GlossaryGo displays at most
the first five results; when more exist, it reports `Showing 5 of N matches`. With an empty query, the first five terms
from the sorted glossary are shown.

For a selected result, actions appear in this order: **Copy Definition**, **Copy Term**, **Add Term**, **Edit Term**,
**Delete Term**, and **Reload Glossary**. Copy actions do not close the command. Choose **Add Term** from a result, an
empty glossary, or a no-match view to open a form in the same **Search Term** command. Those empty/no-match views do not
offer Edit or Delete. The current query is used as the initial term name. Names are trimmed when saved; definitions
must contain non-whitespace text and otherwise retain their exact content. After a successful add, GlossaryGo searches
for the saved name and reloads the glossary.

Choose **Edit Term** from a selected result to open the same form with that result's actual name and definition. Both
fields are editable independently of the current query. A successful edit updates the selected entry in its existing
file position, preserves its field comments, searches for the normalized saved name, and reloads the glossary. Renaming
to another case- or Unicode-equivalent term is rejected, while changing only the selected term's case is allowed when
no other entry conflicts.

**Delete Term** is available only for a selected result and asks for confirmation naming the captured selection.
Canceling does not write or reload. Confirming removes exactly that captured entry, shows **Term Deleted** after the
save, and reloads without changing the query. Entry-owned comments are removed with the entry; document, sequence, and
surviving-entry comments remain. Deleting the last match shows the no-match view with **Add Term** available, and
deleting the last entry leaves a valid empty glossary in the selected file.

If the selected term or file changes before an edit or deletion can be saved, GlossaryGo refuses the stale operation
with a safe conflict message. A conflicted edit retains the entered values and offers a user-triggered reload without
changing the query. A conflicted deletion reloads once and must be retried from a current result. Load-error
views keep only file-recovery actions until the selected file is valid again.

Choose **Reload Glossary** after editing the file externally to reread and revalidate it. GlossaryGo does not watch the
file automatically, and a failed reload shows an error instead of retaining stale results.

Term changes save only to the selected Glossary File. Each save rereads and validates the latest source, writes a
restricted sibling temporary file, rechecks the selected file, and replaces it only after the write has completed.
Saves submitted by this GlossaryGo process for the same path run in sequence. These checks reduce accidental
overwrites, but they are not an atomic compare-and-swap against external editors or separate processes and do not
guarantee crash durability on every filesystem. Avoid editing the Glossary File elsewhere while GlossaryGo is saving
it.

## Testing

See [Testing GlossaryGo](TESTING.md) for local Raycast setup, automated checks, and the manual testing checklist.

## Privacy

GlossaryGo reads only the glossary file you select. Existing glossary content and text entered in the term form stay on
your device and are held in memory while the command is open. Content is written only to the selected Glossary File
when you explicitly submit a term change; it is not persisted elsewhere, logged, sent over the network, or included in
telemetry. Content leaves the command only when you explicitly copy a term or definition to the clipboard.

## Troubleshooting

- **The file cannot be selected or loaded:** Confirm that it ends in `.yaml`, is readable, uses valid UTF-8, and is no
  larger than 5 MiB. Select a different file from the extension preferences if necessary.
- **The glossary is rejected:** Confirm that the file contains one YAML document with only the `terms` root field and
  that every entry has only a non-empty `term` and `definition`. Remove duplicate terms and unsupported YAML features
  such as anchors, aliases, merge keys, or custom tags.
- **No terms appear:** `terms: []` is a valid empty glossary. Otherwise, fix the validation error and choose **Reload
  Glossary**.
- **A search returns no matches:** Search uses the beginning of term names, not definitions or text in the middle of a
  term. Shorten or correct the prefix.
- **Recent edits do not appear:** Choose **Reload Glossary** from the action panel. File changes are not loaded
  automatically.
- **A term cannot be added or edited:** Correct any field error shown in the form. If saving fails, use the recovery
  action from the failure toast. File conflicts offer **Reload Glossary**; other failures offer **Open Extension
  Preferences** so you can select a writable ordinary `.yaml` file with one filesystem link.
- **A term cannot be deleted:** Retry from a refreshed result after resolving any external file edit. GlossaryGo will
  not delete from a symbolic link, multiply hard-linked file, or stale selected snapshot.
