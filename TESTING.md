# Testing GlossaryGo

Use this plan for Codex acceptance testing in Raycast. Test observable outcomes against the current product contract;
discover controls from the live UI instead of relying on fixed coordinates, menu positions, or remembered labels.
`README.md` defines expected behavior, `CONTEXT.md` defines terminology, and `package.json` lists current commands,
preferences, runtime requirements, and scripts. A disagreement between those sources and the UI is a finding to resolve,
not a reason to silently change the expected result.

## Prepare a run

1. Read `AGENTS.md` and the sources above. Record the checkout, branch, commit, uncommitted changes, and requested scope.
   For a full acceptance run, cover every scenario below and each current command. For a feature change, cover its
   affected scenarios plus a search, edit, delete, and reload smoke test; identify anything left untested.
2. Use the repository's npm workflow: satisfy the runtime requirement, run `npm ci` when dependencies need installation,
   and start `npm run dev` from the checkout being tested. Confirm which checkout Raycast actually runs using local
   development or installation metadata. Recheck after switching commands or restarting; an installed copy can differ
   from the working checkout. If runtime identity cannot be established, report that limit on UI evidence.
3. Load the available `computer-use:computer-use` skill before interacting with Raycast. Follow its current setup and
   tool instructions; this document intentionally does not duplicate its API or installation paths. If the skill or
   desktop is unavailable, complete independent checks and mark UI cases blocked with a concrete resumption step.
4. Record the original Glossary File preference and development-mode state without exposing private glossary contents.
   Select a dedicated, disposable synthetic `.yaml` fixture before opening glossary results or exercising writes.
   Never copy, log, capture, or back up a personal glossary for testing. Read-only file assertions and fixture preparation
   may use filesystem tools; exercise user-facing search and mutations through Raycast.
5. Build synthetic data with enough terms to exceed the current result limit, deliberately different file and display
   order, overlapping prefixes, accented names, canonically equivalent Unicode queries, multiline definitions, and
   document/entry comments. Include a word found only in a definition. Keep the fixture's starting bytes in memory for
   comparison and restoration. Use separate invalid fixtures for failure cases; never damage a real Glossary File.

For default-file tests, first establish that the effective default path is unused or already a disposable synthetic
fixture. If it contains personal data, leave it intact and report the case blocked until an isolated target is available.

## Observe, act, verify

- Inspect current accessibility state before choosing a control. After each action or short action sequence, fetch fresh
  state before deciding the next step. Resolve element identifiers again from that state.
- Prefer named accessibility controls and keyboard navigation. When accessibility information is incomplete, inspect a
  current screenshot and use its visible controls. Capture only synthetic data; keep evidence local.
- Derive navigation and shortcuts from the current UI. An absent expected action is a finding, not a cue to invoke its
  implementation directly and call that a UI pass.
- Before each case, state the expected outcome. Afterward, compare the visible state and, for mutations, the synthetic
  file's bytes or parsed content. A success toast alone does not establish persistence or correct targeting.
- Verify copy actions with a local comparison to the synthetic expected value. Avoid printing existing clipboard data;
  preserve and restore it in memory when the tools support that, and disclose any restoration limit.
- Keep automated and live UI evidence distinct. If an error cannot be induced reliably in Raycast, cite its automated
  coverage separately and leave its UI status untested or blocked.

## Acceptance scenarios

Use the current README for exact limits, normalization rules, action availability, and post-save behavior. The cases
below describe stable user outcomes; choose fresh synthetic values rather than depending on a fixed fixture inventory.

| Area                        | Exercise                                                                                                                                                                                                                                          | Verify                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search                      | Empty query; matching prefix; mixed case and surrounding spaces; accent differences and canonical Unicode equivalents; definition-only and non-prefix queries.                                                                                    | Results follow the documented matching and ordering rules; names and definitions belong to the correct terms. Multiline definitions wrap as prose and preserve literal Markdown-like characters.                                       |
| Definition reading          | Select a term with a long multiline definition and literal headings, emphasis, links, backticks, math-like delimiters, HTML-like text, and Unicode; open the full definition, scroll to the end, copy both values, reveal the file, then go back. | Preview wraps as literal prose without file metadata; the full-width reader displays every line and scrolls to the end; copying retains exact original text, Reveal remains accessible, and returning retains the query and selection. |
| Result limits               | Query more matches than the current cap, then narrow to a previously hidden term.                                                                                                                                                                 | Displayed count and total agree with the fixture and current contract; hidden results remain searchable.                                                                                                                               |
| Selection and copying       | Navigate between results; copy a term and a multiline definition.                                                                                                                                                                                 | Each copied value belongs to the selected result and preserves its documented content; command behavior matches the contract.                                                                                                          |
| Edit targeting              | Select a term whose file position differs from its displayed position, using a partial query; open edit.                                                                                                                                          | Both fields contain that selected term's actual values, independent of the query and display index.                                                                                                                                    |
| Edit success                | Change only the definition, rename the term, and make a case-only rename.                                                                                                                                                                         | Exactly the intended entry changes; order, surviving comments, unrelated entries, and definition content are preserved as documented. Search and selection reflect the saved result.                                                   |
| Edit rejection and cancel   | Try blank fields and a name conflicting by case or canonical Unicode equivalence; cancel an unsaved edit.                                                                                                                                         | Invalid changes never reach disk; correctable input remains available; cancellation leaves the file unchanged.                                                                                                                         |
| Delete selection and cancel | Select a term in a different display/file position; open confirmation, then cancel.                                                                                                                                                               | Confirmation names the captured term; cancellation changes neither file nor query and does not trigger a reload.                                                                                                                       |
| Delete success              | Confirm deletion with multiple matches, then delete the last match and finally the last entry.                                                                                                                                                    | Only the captured term is removed; surviving data/comments remain; query is retained; no-match and valid empty-glossary states expose the appropriate actions.                                                                         |
| Stale operations            | Open an edit or delete confirmation, then externally change the selected synthetic entry before submitting.                                                                                                                                       | The stale mutation is refused without overwriting external changes; input retention, refresh, and retry follow the documented conflict behavior.                                                                                       |
| Save failures               | Use a synthetic target that is non-writable or otherwise unsupported for writes.                                                                                                                                                                  | No false success or partial mutation; actionable recovery is available, and entered edit values are retained. Retry succeeds after fixing the condition.                                                                               |
| Reload and recovery         | Change the synthetic file externally and explicitly reload; load invalid YAML, duplicate terms, or an unreadable target, then restore a valid target and reload.                                                                                  | Successful reload reflects new content; failed reload hides stale results and limits actions appropriately; recovery works without reinstalling.                                                                                       |
| Empty and missing files     | Select an empty synthetic glossary and a safely isolated missing target.                                                                                                                                                                          | Each state offers its documented onboarding/recovery actions; edit/delete require a selected term. Read-only access and canceled/invalid input do not create files.                                                                    |
| Add entry points            | Exercise every current add command or action, including form and inline entry where available; try valid, invalid, and duplicate input.                                                                                                           | All entry points use the effective Glossary File and shared validation; successful entries become searchable; follow-up, cancellation, and failed-save behavior match the contract.                                                    |
| Preferences and targeting   | Switch between two synthetic Glossary Files; exercise default storage only when isolated as described above.                                                                                                                                      | Commands agree on the effective target; mutations affect only that target; preference changes and recovery are honored.                                                                                                                |
| Persistence                 | Save changes, reopen the command, then perform the full restart check below.                                                                                                                                                                      | Saved edits remain and deleted terms stay absent from the same verified synthetic target.                                                                                                                                              |

Use automated tests for deterministic boundary and race checks such as file-size limits, linked files, write failures,
and concurrent source changes. When those mechanisms change, run their focused tests and add a feasible UI recovery
case. Do not label simulated component behavior as a live Raycast observation.

## Finish and report

1. For code changes, run the current test, lint, formatting, and build scripts from `package.json`. For documentation-only
   changes, check formatting and verify referenced files/scripts and agreement with the product contract. Record actual
   commands, outcomes, and any pre-existing failures.
2. For full restart persistence, stop only the development process associated with this run, quit Raycast completely,
   verify it exited, relaunch, and reopen the command. Verify runtime identity and effective synthetic path again before
   checking saved content. Reopening a command alone is not a full restart check. If switching runtimes prevents the
   check, report it separately from successful command-reopen persistence.
3. Restore synthetic fixtures byte-for-byte, the original preference, and the prior development-mode state. Verify
   restoration without displaying personal glossary contents. Inspect repository status for accidental changes.
   Follow `AGENTS.md`: provide exact cleanup commands for disposable files instead of deleting files yourself. Deleting
   a synthetic term through the extension is a test case; deleting a filesystem file is cleanup.
4. Report **test plan and findings** with checkout/runtime identity, scope, automated results, and one row per exercised
   case: `scenario | expected | observed | pass/fail/blocked/not run | evidence`. Include failures, pending cases, blockers,
   restoration status, and evidence limits. Keep run-specific values, screenshots, and findings out of this reusable plan.

## Keep this plan current

Every feature addition, behavior change, or regression fix must update the affected scenario in this file in the same
change. Describe the observable outcome and recovery expectation; add a row only for a distinct user workflow. Reuse
existing rows for new variants and remove obsolete expectations when behavior is intentionally retired. Keep exact UI
labels, numeric limits, file paths, and script inventories in their existing source of truth rather than copying them
here. Include the plan update and its validation status in the implementation handoff; future coverage is not evidence
that the scenario was executed.
