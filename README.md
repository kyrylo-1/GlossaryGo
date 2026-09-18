# GlossaryGo

Search and update private local YAML glossary in Raycast. **Search Term** finds prefixes; **Add Term** opens reusable
form; **Quick Add Term** saves from root search; **Reveal Glossary File** locates storage in Finder.

## Setup

Open any command. No file setup required. Without **Glossary File** preference, all commands use `glossary.yaml` in
Raycast's extension-specific Application Support directory. First valid add creates file and support directory.
Opening commands, canceling forms, or submitting invalid fields creates nothing.

Select existing `.yaml` in shared **Glossary File** preference for custom storage. Custom path always takes precedence.
If removed, valid Add Term can recreate file only when parent folder exists. GlossaryGo never creates custom folders.

macOS only. Existing file must be readable, contain one YAML document, and not exceed 5 MiB. Writes require writable
ordinary file with exactly one filesystem link. Symbolic links and multiply hard-linked files support search only:
replacement could change link semantics. `.yml` is unsupported. Raycast may remove default file on uninstall;
choose custom file for storage beyond installation.

## Glossary format

Root contains only `terms`: sequence of entries containing only `term` and `definition`.

```yaml
terms:
  - term: API
    definition: Application Programming Interface

  - term: ADR
    definition: |
      A short record of an architectural decision
      and the reasons behind it.
```

Editor validation: [GlossaryGo JSON Schema](glossary.schema.json).

Both fields require non-empty strings. Term cannot have surrounding whitespace. Multiline definitions retain content
when displayed and copied. Empty glossary is valid:

```yaml
terms: []
```

Duplicates use search's Unicode-normalized, case-insensitive comparison. No extra fields, anchors, aliases, merge keys,
custom tags, or multiple documents. Ordinary mappings, sequences, comments, quoted strings, literal/folded multiline
strings are supported.

## Adding terms

Open **Add Term**. Enter **Term** and multiline **Definition**; choose **Save Term**. Saved names are trimmed.
Definitions require non-whitespace text; remaining content stays exact.

After save, **Term Added** keeps saved fields visible. **Add Another Term** opens pristine form focused on **Term**;
**Done** closes command. Failed saves retain both inputs and show actionable error. No saved drafts.
Form shows effective Glossary File path and **Reveal Glossary in Finder**.

Standalone Add uses same safe save service and shared preference as Search Term. Saved term appears when Search Term
next opens or after **Reload Glossary** in an open search.

## Quick adding terms

Open **Quick Add Term** from root search. Enter required inline **Term** and **Definition**; press Return.
No form opens. Names are trimmed; definitions retain entered content. Add Term validation and duplicate rules apply.
**Term Added** appears only after successful save to effective file. Use **Add Term** for multiline definitions or
successive entries.

## Revealing the glossary file

Open **Reveal Glossary File** from Raycast root search to select the effective Glossary File in Finder. It uses the
shared custom file preference when set, otherwise the default support-directory file. It needs no search result and
works with invalid YAML, an empty glossary, or a blank file without reading or validating its contents.

If the file is missing, Finder reveals the nearest existing folder, including when intermediate folders are absent.
A **Glossary File Is Missing** dialog stays available after Finder opens, explains how to create or select a file,
and offers **Open Extension Preferences** or **Done**. Path or Finder failures use the same recovery dialog. If
Preferences cannot open, a second dialog explains how to find the setting manually. Reveal never creates folders
or files and never changes glossary contents.

## Searching and actions

Search matches term-name prefixes only, never definitions. Query is trimmed; matching ignores case, preserves accents,
and treats canonically equivalent Unicode as equal. `a` matches `API`; `e` does not match `éclair`.

Matches sort case-insensitively, accent-sensitively, in locale-aware ascending order. Display limit: first five.
Additional matches show `Showing 5 of N matches`.

Empty/whitespace query shows **Recent Terms**: up to five copied terms, most recent first. Successful **Copy Definition**
or **Copy Term** records term. Typing and selection do not. Reuse moves term first without duplicates.
History holds 20 names; evicts least recently used when full. Without valid history, show first five alphabetical terms.
Typed prefixes always sort alphabetically, including never-copied terms.

History stays in memory during Search Term session; resets on command unmount or effective file path change.
Reload prunes missing names and shows current names/definitions. Missing file clears history; failed reload hides results
until recovery. Rename removes old history unless new name is case- or Unicode-equivalent. Never persist history to
Glossary File, Raycast storage, logs, or network.

Split-pane preview wraps definitions as literal prose, including Markdown-like characters; omits file metadata.
**View Full Definition** opens full-width scrollable reader titled with term. Reader offers **Copy Definition**,
**Copy Term**, **Reveal Glossary in Finder**. Successful copies in either view update Recent Terms.
Go back to same query.

Selected-result action order: **Copy Definition**, **Copy Term**, **View Full Definition**, **Add Term**, **Edit Term**,
**Delete Term**, **Reload Glossary**, **Reveal Glossary in Finder**. Copy does not close command.

**Add Term** also appears in empty-glossary, missing-file, and no-match views. Those views have no Edit/Delete.
Add opens form inside Search Term; current query pre-fills name. Shared trimming and definition rules apply.
Successful add searches saved name and reloads.

**Edit Term** pre-fills selected result's actual fields, independent of query. Both fields are editable.
Success updates same file position, preserves field comments, searches normalized saved name, and reloads.
Rename conflicting with another case- or Unicode-equivalent term fails. Case-only rename of selected term succeeds
when no other entry conflicts.

**Delete Term** requires selected result. Confirmation names captured selection. Cancel writes nothing and does not
reload. Confirm removes only captured entry, shows **Term Deleted** after save, reloads with query unchanged.
Entry-owned comments leave with entry; document, sequence, surviving-entry comments remain.
Deleting last match shows no-match view with **Add Term**. Deleting last entry leaves valid empty glossary in same file.

Changed selection or file before edit/delete save causes safe conflict refusal. Conflicted edit retains input and offers
user-triggered reload without query change. Conflicted delete reloads once; retry from current result.
Load errors expose only file recovery until valid. Missing-file view shows effective path plus Add Term, reload,
Reveal in Finder, Preferences for creation or replacement.

After external edits, choose **Reload Glossary** to reread and validate. No automatic file watching.
Failed reload shows error and hides stale results.

Changes save only to effective file. First Add creates missing file exclusively with `0600` permissions;
default support directory uses `0700`. Later saves reread/validate latest source, write restricted sibling temporary
file, recheck selected file, then replace after write completes. Same-path saves in this process run sequentially.
Checks reduce overwrites but do not provide atomic compare-and-swap against external editors/processes or guarantee
crash durability on every filesystem. Avoid external edits during saves.

## Testing

See [Testing GlossaryGo](TESTING.md) for Raycast setup, automated checks, manual acceptance plan.

## Privacy

Only effective Glossary File is read. Existing content, form input, inline arguments stay on device, in memory while
command is open. Explicit valid first Add may create file; later changes use restricted sibling temporary copy.
Normal failures remove files created by failed operation. Crash or cleanup failure may leave incomplete first file or
temporary copy for manual recovery. No other content persistence, logging, network transmission, or telemetry.
Explicit copy to clipboard is only way content leaves command.

## Troubleshooting

- **No file selected:** Add first term for default storage or select custom `.yaml` in extension preferences.
- **Custom file cannot be recreated:** Ensure existing parent folder is writable. Missing custom folders are not created.
- **Load fails:** Require readable `.yaml`, valid UTF-8, at most 5 MiB. Select another file in preferences if needed.
- **Validation fails:** Require one document, only `terms` root, only non-empty `term`/`definition` per entry.
  Remove duplicates, anchors, aliases, merge keys, custom tags.
- **No terms:** `terms: []` is valid. Otherwise fix validation error and **Reload Glossary**.
- **No matches:** Use term-name prefix; shorten/correct query. Definitions and middle-of-name text are not searched.
- **External edits missing:** Choose **Reload Glossary**. No automatic reload.
- **Add/Edit fails:** Correct form errors. Failure toast offers **Reload Glossary** for conflicts;
  otherwise **Open Extension Preferences** to choose writable ordinary `.yaml` with one filesystem link.
- **Delete fails:** Resolve external edits; retry refreshed result. No writes to symbolic links, multiply hard-linked
  files, or stale selections.
