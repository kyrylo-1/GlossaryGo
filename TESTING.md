# Testing GlossaryGo

Use for Codex acceptance testing in Raycast. Test observable product outcomes. Discover controls from live UI;
never depend on fixed coordinates, menu positions, remembered labels.
`README.md`: behavior. `CONTEXT.md`: terminology. `package.json`: commands, preferences, runtime, scripts.
Source/UI disagreement is a finding to resolve; do not silently change expectations.

## Prepare a run

1. Read `AGENTS.md` and sources above. Record checkout, branch, commit, uncommitted changes, requested scope.
   Full acceptance covers every scenario and current command. Feature checks cover affected scenarios plus
   search/edit/delete/reload smoke tests. Identify untested cases.
2. Use npm; satisfy runtime requirement. Run `npm ci` when dependencies need installation; `npm run dev` from tested
   checkout. Confirm actual runtime checkout through development/installation metadata. Recheck after command switches
   and restarts; installed copy may differ. Report unknown runtime identity as UI evidence limit.
3. Load `computer-use:computer-use` skill before Raycast interaction. Follow current setup/tools; do not duplicate APIs
   or installation paths here. If skill/desktop unavailable, finish independent checks; mark UI cases blocked with
   concrete resumption step.
4. Record original Glossary File preference and development-mode state without exposing private content.
   Select dedicated disposable synthetic `.yaml` before opening results or writing. Never copy, log, capture, or back up
   personal glossary for testing. Filesystem tools may prepare fixtures and perform read-only assertions;
   exercise user-facing search/mutations through Raycast.
5. Fixture needs more terms than result limit, differing file/display order, overlapping prefixes, accented names,
   canonically equivalent queries, multiline definitions, document/entry comments, definition-only word.
   Keep starting bytes in memory for comparison/restoration. Use separate invalid fixtures; never damage real file.

Test default storage only when effective default path is unused or disposable synthetic fixture.
If personal data exists there, leave intact; block case until isolated target is available.

## Observe, act, verify

- Inspect current accessibility state before selecting control. Fetch fresh state after each action/short sequence;
  resolve element identifiers again.
- Prefer named accessibility controls and keyboard navigation. If state incomplete, inspect current screenshot and use
  visible controls. Capture only synthetic data; keep evidence local.
- Derive navigation/shortcuts from current UI. Missing expected action is a finding; direct implementation calls are not
  UI evidence.
- State expected outcome before each case. Compare visible result and, for writes, synthetic bytes/parsed content.
  Success toast alone proves neither persistence nor targeting.
- Compare clipboard locally with synthetic expected value. Never print existing clipboard. Preserve/restore in memory
  when tools support it; disclose restoration limits.
- Separate automated/live evidence. Errors not reliably inducible in Raycast remain UI untested/blocked;
  cite automated coverage separately.

## Acceptance scenarios

Use current README for exact limits, normalization, action availability, post-save behavior.
Choose fresh synthetic values; no fixed fixture inventory.

- **Search:** Try blank query, prefix, mixed case, surrounding spaces, accents, canonical Unicode equivalents,
  definition-only and non-prefix queries. Verify matching/order, correct name/definition pairing, multiline prose
  wrapping, literal Markdown-like characters.
- **Definition reading:** Select long multiline definition with headings, emphasis, links, backticks, math-like
  delimiters, HTML-like text, Unicode. Open full reader, scroll to end, copy both values, reveal file, return.
  Verify literal preview without file metadata, every line in full-width reader, exact copied text, Reveal action,
  retained query/selection.
- **Result limits:** Exceed cap; narrow to previously hidden term. Verify displayed/total counts against fixture and
  contract; hidden terms remain searchable.
- **Selection and copying:** Navigate results; copy term and multiline definition. Verify selected-result targeting,
  preserved content, documented command behavior.
- **Edit targeting:** Select term with differing file/display position using partial query. Open edit;
  verify actual selected fields, independent of query/display index.
- **Edit success:** Change definition, rename, case-only rename. Verify only intended entry changes; preserve order,
  surviving comments, unrelated entries, definition content. Search/selection reflect save.
- **Edit rejection and cancel:** Try blank/whitespace fields and case-/Unicode-equivalent conflicts; correct errors;
  cancel unsaved edit. Verify no invalid writes, first-invalid-field focus, errors clear after correction including
  duplicates, input retained, canceled file unchanged.
- **Delete selection and cancel:** Select differing file/display position; open confirmation; cancel.
  Verify captured name, unchanged file/query, no reload.
- **Delete success:** Confirm with multiple matches; delete last match, then last entry. Verify only captured entry
  removed, surviving data/comments preserved, query retained, correct no-match/valid-empty actions.
- **Stale operations:** Open edit/delete confirmation; externally change selected synthetic entry; submit.
  Verify refusal without overwrite; documented input retention, refresh, retry.
- **Save failures:** Use non-writable or otherwise unsupported synthetic target. Verify no false success/partial mutation,
  actionable recovery, retained edit input, successful retry after repair.
- **Reload and recovery:** Externally edit fixture; reload. Try invalid YAML, duplicates, unreadable target; restore valid
  target; reload. Verify new content, hidden stale results and restricted actions on failure, recovery without reinstall.
- **Empty and missing files:** Select empty glossary and safely isolated missing target. Verify documented
  onboarding/recovery; edit/delete require selection. Read-only access and canceled/invalid input create nothing.
- **Add entry points:** Exercise every add command/action, forms/inline input where available, valid/invalid/duplicate
  input. Verify effective target, shared validation, first-invalid-field focus, errors clear after correction,
  saved terms searchable, documented follow-up/cancel/failure behavior.
- **Preferences and targeting:** Switch between two synthetic files. Test isolated default storage only as above.
  Verify all commands agree on target; writes affect only target; preference changes/recovery honored.
- **Persistence:** Save, reopen command, perform full restart below. Verify edits remain and deleted terms stay absent
  from same verified synthetic target.
- **Recent Terms:** Use both copy actions in preview/full reader; copy several terms, repeat one, type prefix, clear.
  Navigate without copying; induce failed copy where feasible. Verify blank/whitespace query shows up to five
  successfully copied names, newest first, no duplicates. Navigation/failed copies record nothing.
  Typed search remains alphabetical; absent valid history falls back to alphabetical results.
- **Recent history lifecycle:** Reload after editing/removing copied term; switch effective file; close/reopen Search Term.
  Verify current definitions, missing-name pruning, memory-only history, reset on target change/command unmount,
  no writes to disk/Raycast storage.

Use automated tests for deterministic boundaries/races: file size, linked files, write failures, concurrent changes.
When mechanisms change, run focused tests and add feasible UI recovery case.
Simulated component behavior is not live Raycast evidence.

## Finish and report

1. Code changes: run current test/lint/format/build scripts from `package.json`.
   Docs only: check format, referenced files/scripts, product-contract agreement.
   Record actual commands, outcomes, pre-existing failures.
2. Full restart: stop only this run's development process; quit Raycast completely; verify exit; relaunch; reopen command.
   Recheck runtime identity and effective synthetic path before saved-content assertions.
   Command reopen alone is not full restart. If runtime switching blocks restart check, report separately from reopen pass.
3. Restore synthetic bytes exactly, original preference, prior development-mode state. Verify without displaying private
   content. Inspect repository status. Follow `AGENTS.md`: provide exact disposable-file cleanup commands; never delete
   files yourself. Extension term deletion is a test; filesystem deletion is cleanup.
4. Report **test plan and findings**: checkout/runtime identity, scope, automated results; one row per exercised case:
   `scenario | expected | observed | pass/fail/blocked/not run | evidence`.
   Include failures, pending cases, blockers, restoration, evidence limits.
   Keep run-specific values/screenshots/findings out of reusable plan.

## Keep this plan current

Update affected scenarios with every feature, behavior change, regression fix in same change.
Describe observable outcome and recovery. Add scenario only for distinct workflow; reuse cases for variants.
Remove obsolete expectations when behavior intentionally retires. Keep exact UI labels, limits, paths, script inventories
in existing sources of truth. Handoff includes plan update and validation status; planned coverage is not execution proof.
