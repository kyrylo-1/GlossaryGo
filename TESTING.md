# Testing GlossaryGo

Use this acceptance plan with the current `README.md` product contract, `CONTEXT.md` terminology, and `package.json`
commands and scripts. Keep automated component results separate from live Raycast observations.

## Prepare a run

1. Read `AGENTS.md` and the sources above. Record the checkout, branch, commit, uncommitted changes, and requested scope.
2. Use the repository npm workflow: meet the Node.js requirement, run `npm ci`, then start `npm run dev` from the checkout
   being tested. Confirm which checkout Raycast actually runs using development or installation metadata. Recheck after
   switching commands or restarting; an installed extension can differ from the working checkout.
3. Load the `computer-use:computer-use` skill before interacting with Raycast. Discover controls from fresh accessibility
   state or screenshots instead of relying on remembered coordinates. Capture only synthetic data and keep evidence local.
4. Record the original Glossary File preference and development-mode state without exposing personal glossary contents.
   Select a dedicated synthetic `.yaml` fixture before opening results or exercising mutations. Never copy, log, capture,
   or back up a personal glossary. Test default storage only when its effective path is unused or already synthetic.
5. Use synthetic terms with overlapping prefixes, deliberately different file/display order, accents, Unicode canonical
   equivalents, multiline definitions with literal Markdown-like characters, and comments. Include more than five terms
   and a word that appears only in a definition. Keep starting fixture bytes in memory for restoration. Use separate
   invalid fixtures for failure cases.

## Acceptance scenarios

| Area                                   | Exercise                                                                                                                                                                                                             | Expected outcome                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search and result details              | Search empty, whitespace-only, matching, mixed-case, accented, Unicode-equivalent, definition-only, and non-prefix queries. Select different terms, including multiline definitions with literal Markdown-like text. | Prefix matching and alphabetical ordering follow README. Names and definitions belong to the selected term. Definitions retain their existing literal fenced-code display. Result details show neither a Glossary File metadata label nor its local path. The split detail pane remains visible when results exist. |
| Result limits                          | Search a prefix with more than five matches, then narrow to a hidden term.                                                                                                                                           | At most five results appear, the total count is accurate, and hidden terms remain searchable.                                                                                                                                                                                                                       |
| Selection and actions                  | Select a term, copy its definition and name, open Add/Edit, cancel Delete, reload, and reveal the file.                                                                                                              | Existing actions remain available in their documented order. Copy preserves exact original text and leaves the command open; edit targets the selected term; cancellation leaves disk unchanged; reload and Reveal use the effective file.                                                                          |
| Recent Terms                           | Copy several terms using both copy actions, repeat one, type a prefix, then clear it. Navigate without copying and simulate a failed copy where feasible.                                                            | Empty or whitespace queries show up to five successfully copied names in most-recent-first order without duplicates. Passive navigation and failed copies do not record terms. Typed searches remain alphabetical. With no valid history, alphabetical results appear.                                              |
| Recent history lifecycle               | Reload after editing/removing a copied term; change the effective file; close and reopen Search Term.                                                                                                                | Reload uses current definitions and prunes missing names. History stays in memory, resets on target changes and command unmount, and is never written to disk or Raycast storage.                                                                                                                                   |
| Edit and delete                        | Edit a selected term whose file position differs from display position, including definition-only and case-only changes. Cancel and confirm deletion; delete the last match and last entry.                          | Exactly the captured entry changes. Surviving order, comments, and unrelated content remain intact. Deletion confirmation names the selection; cancellation does not write or reload. Last-match and empty-glossary states offer the documented actions.                                                            |
| Validation and conflicts               | Submit blank or duplicate names; externally change a synthetic selected entry while an edit or delete is open.                                                                                                       | Invalid or stale changes are refused without overwriting external changes. Edit values remain available, and conflict recovery matches README.                                                                                                                                                                      |
| Reload and recovery                    | Change a synthetic file externally, reload, then test invalid YAML, duplicates, or an unreadable file and restore a valid target.                                                                                    | Successful reload reflects current data; failed reload hides stale results and keeps recovery actions. A later reload restores results without reinstalling.                                                                                                                                                        |
| Add entry points                       | Exercise Search Term Add, standalone Add Term, and Quick Add Term with valid, invalid, and duplicate input.                                                                                                          | All use the effective Glossary File and shared validation. Only explicit valid saves create or update the file. Standalone confirmation keeps saved values; Add Another Term opens a clean form; Quick Add reports success only after persistence.                                                                  |
| Empty, missing, and target preferences | Use an empty synthetic glossary, a safely isolated missing target, and two different selected synthetic files.                                                                                                       | Views offer their documented onboarding/recovery actions. Read-only use and canceled/invalid input create nothing. Every command honors the same effective target; only the selected target changes on save.                                                                                                        |
| Persistence                            | Save synthetic changes, reopen the command, then restart Raycast completely.                                                                                                                                         | Changes survive reopening and a full restart in the same verified synthetic target. Reopening alone is not full-restart proof.                                                                                                                                                                                      |

Use automated tests for deterministic boundary checks such as file-size limits, linked files, write failures, and
concurrent source changes. Do not count simulated components as live UI evidence. This plan describes the current
result-detail display; there is no separate full-definition reader in this version.

## Finish and report

1. Run `npm test`, `npm run lint`, `npm run check:format`, `npm run build`, and `git diff --check` for code changes. Record
   actual outcomes and distinguish pre-existing failures. Documentation-only changes need formatting and contract checks.
2. For live acceptance, state expected results before acting and compare fresh visible state afterward. Verify synthetic
   mutations against file bytes or parsed content; a success toast alone is insufficient. Check copies locally without
   printing existing clipboard contents; preserve and restore clipboard state in memory when supported.
3. For full-restart persistence, stop only this run's development process, quit Raycast, verify it exited, relaunch, and
   confirm runtime identity and synthetic target before checking saved content.
4. Restore fixture bytes, preferences, clipboard where supported, and development-mode state. Verify restoration and
   repository status without displaying private data. Follow `AGENTS.md`: provide cleanup commands instead of deleting
   filesystem files yourself.
5. Report checkout/runtime identity, scope, automated results, and live cases as
   `scenario | expected | observed | pass/fail/blocked/not run | evidence`. Include pending cases, blockers, restoration,
   and evidence limits. Keep run-specific findings and screenshots out of this reusable plan.

Every feature addition, behavior change, or regression fix must update its affected scenario in this file in the same
change. An updated future acceptance case is not evidence that it was executed.
