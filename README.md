# GlossaryGo

GlossaryGo searches and updates a private glossary stored in a local YAML file. Open **Search Term** in Raycast to find
an entry by prefix, **Add Term** for a reusable form, or **Quick Add Term** to save from Raycast's root search.

## Setup

Open **Search Term**, **Add Term**, or **Quick Add Term** in Raycast. No file setup is required: when **Glossary File**
is not selected in the extension preferences, every command uses `glossary.yaml` in Raycast's extension-specific
Application Support directory. The first valid add creates that file and its support directory. Opening a command,
canceling a form, or submitting invalid fields does not create anything.

To keep a glossary elsewhere, select an existing `.yaml` file in the optional shared **Glossary File** preference. A
selected custom path always takes precedence. If that file is later removed, a valid Add Term save can recreate it
only when its parent folder still exists; GlossaryGo never creates custom directory trees.

GlossaryGo supports macOS. An existing Glossary File must be readable, contain exactly one YAML document, and be no
larger than 5 MiB. Changing terms also requires the path to be a writable ordinary file with exactly one filesystem
link. Symbolic links and multiply hard-linked files may be searched, but GlossaryGo will not update them because
replacement could change their link semantics. The `.yml` extension is not supported. Raycast may remove the default
file when the extension is uninstalled, so select a custom file if the glossary must outlive the installation.

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

For editor validation, use the [GlossaryGo JSON Schema](glossary.schema.json).

`term` and `definition` must both be non-empty strings. A term cannot have leading or trailing whitespace. Definitions
may span multiple lines, and their content is preserved when displayed and copied. An empty glossary is valid:

```yaml
terms: []
```

Do not add other root or entry fields. Duplicate terms are rejected using the same Unicode-normalized,
case-insensitive comparison as search. Anchors, aliases, merge keys, custom tags, and multiple YAML documents are not
supported. Ordinary mappings, sequences, comments, quoted strings, and literal or folded multiline strings are
supported.

## Adding terms

Open the standalone **Add Term** command to enter a **Term** and multiline **Definition**, then choose **Save Term**.
Names are trimmed when saved; definitions must contain non-whitespace text and otherwise retain their exact content.
After a successful save, a **Term Added** confirmation keeps the saved term and definition visible. Choose **Add
Another Term** to open a pristine form focused on **Term**, or **Done** to close the command. Failed saves keep both
entered values in the form and show an actionable error. The form does not save drafts. It displays the effective
Glossary File path and offers **Reveal Glossary in Finder**.

The standalone command uses the same safe save path and Glossary File preference as the Search Term actions described
below. A saved term appears the next time Search Term opens, or after choosing **Reload Glossary** in an already-open
Search Term window.

## Quick adding terms

Open **Quick Add Term** from Raycast's root search, enter the required inline **Term** and **Definition** arguments,
then press Return to save without opening a form. Term names are trimmed, definitions preserve their entered content,
and duplicate or invalid entries are rejected using the same rules as **Add Term**. **Term Added** appears only after
the effective Glossary File has been saved successfully. Use the existing **Add Term** form for multiline definitions
or when adding several entries in succession.

## Searching and actions

Search matches term-name prefixes only. It trims the query, ignores case, preserves accent differences, and treats
canonically equivalent Unicode text as the same. For example, `a` matches `API`, while `e` does not match `éclair`.
Definitions are never searched.

Matches are sorted in case-insensitive, accent-sensitive, locale-aware ascending order. GlossaryGo displays at most
the first five results; when more exist, it reports `Showing 5 of N matches`.

With an empty or whitespace-only query, **Recent Terms** shows up to five previously copied terms, most recent first.
A successful **Copy Definition** or **Copy Term** records that term; typing and moving the selection do not. Reusing a
term moves it to the front without duplicates. History holds at most 20 names and evicts the least recently used name
when full. If no valid history remains, the first five terms from the alphabetically sorted glossary are shown.
Typed prefix searches always keep alphabetical ordering, including terms that have never been copied.

History stays in memory for the current Search Term command session and resets when that command is unmounted or its
effective Glossary File path changes. Reload removes names no longer present in the glossary and displays current
names and definitions; a missing file clears history, and a failed reload hides results until recovery. Renaming a
term removes its old history entry unless the new name is case- or Unicode-equivalent. History is never written to
the Glossary File, Raycast storage, logs, or the network.

For a selected result, actions appear in this order: **Copy Definition**, **Copy Term**, **Add Term**, **Edit Term**,
**Delete Term**, **Reload Glossary**, and **Reveal Glossary in Finder**. Copy actions do not close the command. Choose
**Add Term** from a result, an empty glossary, a missing-glossary onboarding view, or a no-match view to open a form in
the same **Search Term** command. Those views do not offer Edit or Delete. The current query is used as the initial term
name. Names are trimmed when saved; definitions must contain non-whitespace text and otherwise retain their exact
content. After a successful add, GlossaryGo searches for the saved name and reloads the glossary.

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
views keep only file-recovery actions until the effective file is valid again. A missing file instead shows its
effective path with Add Term, reload, Reveal in Finder, and Preferences actions so it can be created or replaced.

Choose **Reload Glossary** after editing the file externally to reread and revalidate it. GlossaryGo does not watch the
file automatically, and a failed reload shows an error instead of retaining stale results.

Term changes save only to the effective Glossary File. A first Add creates a missing file exclusively with `0600`
permissions; the default support directory is created with `0700` permissions. Later saves reread and validate the
latest source, write a restricted sibling temporary file, recheck the selected file, and replace it only after the
write has completed. Saves submitted by this GlossaryGo process for the same path run in sequence. These checks reduce
accidental overwrites, but they are not an atomic compare-and-swap against external editors or separate processes and
do not guarantee crash durability on every filesystem. Avoid editing the Glossary File elsewhere while GlossaryGo is
saving it.

## Testing

See [Testing GlossaryGo](TESTING.md) for local Raycast setup, automated checks, and the manual testing checklist.

## Privacy

GlossaryGo reads only the effective Glossary File. Existing glossary content and text entered in a term form or Quick
Add Term's inline arguments stay on your device and are held in memory while the command is open. A valid explicit
first Add may create the file; later changes use a restrictive sibling temporary copy before replacing it. Normal
failures remove files created by the failed operation, but a crash or cleanup failure can leave an incomplete first
file or temporary copy for manual recovery. GlossaryGo does not otherwise persist glossary content, log it, send it
over the network, or include it in telemetry. Content leaves the command only when you explicitly copy a term or
definition to the clipboard.

## Troubleshooting

- **No Glossary File is selected:** Add the first term to create GlossaryGo's default file, or select a custom `.yaml`
  file in extension preferences.
- **A custom file cannot be recreated:** Confirm that its existing parent folder is writable. GlossaryGo does not
  create missing custom folders.
- **The file cannot be loaded:** Confirm that it ends in `.yaml`, is readable, uses valid UTF-8, and is no larger than
  5 MiB. Select a different file from the extension preferences if necessary.
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
