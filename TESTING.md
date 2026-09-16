# Testing GlossaryGo

Follow this guide to load the local extension into Raycast and verify its behavior with synthetic data.

## Add the local extension to Raycast

With Raycast running and Node.js 22.22.2 or newer installed, run these commands from the extension directory:

```bash
node --version
npm ci
npm run dev
```

Development mode builds the extension and automatically imports it into Raycast. Open Raycast, search for
**GlossaryGo**, **Search Term**, or **Add Term**. Leave **Glossary File** unset to test the default support-directory
file, or select a custom `.yaml` file in extension preferences.

Once the extension loads, press **Ctrl+C** in the terminal to stop development mode. The extension remains available
in Raycast. Run `npm run dev` again after changing extension code. See the official
[Raycast setup guide](https://developers.raycast.com/basics/create-your-first-extension) and
[CLI documentation](https://developers.raycast.com/information/developer-tools/cli).

## Automated checks

After installing dependencies with `npm ci`, run these commands from the extension directory:

```bash
npm test
npm run lint
npm run check:format
npm run build
```

All four commands must finish successfully. To run only the search tests:

```bash
npm test -- src/hooks/search.test.ts
```

The existing tests cover default/custom path resolution, first-file creation, private permissions, missing custom
parents, first-write cleanup, glossary loading, YAML validation, duplicate rejection, UTF-8 and file-size limits,
Unicode prefix matching, sorting, result limits, reducer state transitions, repeated-submit guards, and resetting the
standalone form after a successful save. Automated checks do not verify the Raycast interface, clipboard actions, or
the complete reload lifecycle; perform the manual checks below as well.

## First-run glossary acceptance matrix

Run these checks before selecting a custom Glossary File. Use only synthetic terms.

| Check                 | Action                                                                                | Expected result                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No setup prompt       | Open **Search Term**, then **Add Term**, with no preference selected.                 | Both commands open. Search Term shows **Create Your Glossary** and the effective support-directory path; Add Term shows an empty form and the same path.  |
| No implicit write     | Open and close both commands, then reopen Add Term and submit blank fields.           | No `glossary.yaml` is created.                                                                                                                            |
| Standalone first save | Submit one valid synthetic term from standalone Add Term.                             | A loadable `glossary.yaml` is created with that term, the form resets, and the file and support directory use `0600` and `0700` permissions respectively. |
| Search persistence    | Open Search Term and search for the saved name, then restart Raycast and repeat.      | The term is found through the same effective path before and after restart.                                                                               |
| Later add             | Add another term from either command.                                                 | Both the original and new terms remain searchable.                                                                                                        |
| Search first save     | Remove the synthetic default file, open Search Term, and use onboarding **Add Term**. | The valid save creates the glossary, reloads results, and searches for the saved name.                                                                    |
| Reveal path           | Choose **Reveal Glossary in Finder** before and after first creation.                 | Finder opens the glossary's parent before creation and selects the file after creation.                                                                   |
| Custom precedence     | Select the prepared custom glossary and reopen both commands.                         | Both show and use the custom path; the default file is unchanged.                                                                                         |
| Missing custom file   | Remove a selected custom file while leaving its parent, then submit a valid Add.      | The file is recreated at the selected path; GlossaryGo does not switch to the default.                                                                    |
| Missing custom parent | Select a custom file, remove its containing test folder, and submit a valid Add.      | A safe failure retains both form fields and no directory tree is created.                                                                                 |

## Prepare a test glossary

Use synthetic data for testing. Save the following as a UTF-8 file named `glossarygo-test.yaml` outside the repository,
then select it as the **Glossary File**. Keep this example available to restore the file between scenarios.

```yaml
terms:
  - term: API
    definition: Application Programming Interface
  - term: Apple
    definition: A fruit
  - term: Application
    definition: A software program
  - term: Apricot
    definition: Another fruit
  - term: Aptitude
    definition: An ability
  - term: Aquarium
    definition: A tank for aquatic animals
  - term: éclair
    definition: A pastry
  - term: Markdown
    definition: |-
      **These asterisks should remain visible.**
      This second line should be preserved.
```

## Manual checks in Raycast

Start with the unmodified test glossary. For a selected result, confirm that the action panel order is **Copy
Definition**, **Copy Term**, **Add Term**, **Edit Term**, **Delete Term**, **Reload Glossary**, and **Reveal Glossary in
Finder**. Restore the test glossary and reload it after each scenario that changes its contents.

| Check                 | Action                                                                                                             | Expected result                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Initial load          | Open **Search Term** with an empty query.                                                                          | Five sorted results and `Showing 5 of 8 matches`.                              |
| Prefix matching       | Search for `ap`.                                                                                                   | API, Apple, Application, Apricot, and Aptitude.                                |
| Case and whitespace   | Search for `AP` with one leading and one trailing space.                                                           | The same five matches as `ap`.                                                 |
| Result limit          | Search for `a`.                                                                                                    | Five results and `Showing 5 of 6 matches`.                                     |
| No substring search   | Search for `ple`.                                                                                                  | **No Matching Terms**.                                                         |
| No definition search  | Search for `fruit`.                                                                                                | **No Matching Terms**.                                                         |
| Accent matching       | Search for `é`, then `e`.                                                                                          | `é` matches éclair; `e` does not.                                              |
| Unicode normalization | Replace the éclair term name with `"\u0065\u0301"` (keep quotes and literal escapes), reload, then search for `é`. | The decoded decomposed term matches the composed query.                        |
| Plain-text display    | Search for `Markdown` and select it.                                                                               | Asterisks remain visible and the line break is preserved.                      |
| Copy definition       | Choose **Copy Definition** for Markdown and paste into a text editor.                                              | Both lines copy exactly, success feedback appears, and the command stays open. |
| Copy term             | Choose **Copy Term** for API and paste into a text editor.                                                         | Exactly `API` is copied, success feedback appears, and the command stays open. |
| Explicit reload       | Search for `api`, edit its definition in the file, and save. Then choose **Reload Glossary**.                      | The edit appears only after reload; the query stays `api`.                     |
| Failed reload         | Replace the file contents with `terms: [`, save, and reload.                                                       | **Glossary Could Not Be Loaded** appears and old results disappear.            |
| Recovery              | Restore valid YAML after a failed reload and reload again.                                                         | Results return without reopening the command.                                  |
| Duplicate rejection   | Add an entry named `api` alongside API and reload.                                                                 | A validation error appears.                                                    |
| Empty glossary        | Replace the file contents with `terms: []` and reload.                                                             | **No Terms in Glossary** appears.                                              |
| Preference recovery   | From an error state, choose **Open Extension Preferences**, select a valid test glossary, and reopen the command.  | The selected glossary loads.                                                   |
| Local installation    | Stop development mode with Ctrl+C, restart Raycast, and open **Search Term**.                                      | The extension remains available and loads the selected file.                   |

## Standalone Add Term acceptance matrix

Run every check on macOS and record each result as passed, failed, or unverified. Restore the
synthetic glossary before each scenario that changes the file.

| Check                    | Action                                                                                                     | Expected result                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Shared setup             | Select the test file in extension preferences, then open **Add Term** and **Search Term**.                 | Both commands display and use the same custom path.                                                                        |
| Default setup            | Clear the shared preference and open **Add Term**.                                                         | The form opens without a prompt and displays the default support-directory path.                                           |
| Form contents            | Open **Add Term**.                                                                                         | **Term**, multiline **Definition**, and **Save Term** are visible; both fields begin empty.                                |
| Empty glossary           | Select a file containing `terms: []`, enter a unique term and definition, and choose **Save Term**.        | **Term Added** appears and exactly one entry is appended.                                                                  |
| Populated glossary       | Restore the synthetic glossary, add a unique term, then reload Search Term.                                | The new entry follows the existing entries in file order and is searchable.                                                |
| Blank fields             | Submit spaces in either field while the other field is valid.                                              | The corresponding field error appears, entered text remains, and no write occurs.                                          |
| Duplicate                | Submit `api` while `API` exists.                                                                           | The duplicate error appears on **Term**, both fields retain their input, and the file is unchanged.                        |
| Exact definition         | Save a definition containing meaningful leading/trailing spaces and a line break.                          | The exact definition is present after reload; existing values and comments survive.                                        |
| Successful reset         | Save a unique term and wait for completion.                                                                | Both fields clear, loading stops, and focus returns to **Term** for another entry.                                         |
| Consecutive additions    | After one successful reset, add a second unique term.                                                      | Both terms are written exactly once; the first success does not leave the form locked.                                     |
| Save failure             | Make the selected ordinary file read-only, submit valid values, then restore its permissions.              | A safe failure offers **Open Extension Preferences**; both entered values remain.                                          |
| Cancel and reopen        | Enter values, close Add Term without submitting, and reopen it.                                            | The glossary is unchanged and both fields reopen empty because drafts are disabled.                                        |
| Existing Search behavior | Search, copy both fields, use the menu Add action, externally edit and reload, then edit and delete terms. | Search Term retains its existing search, clipboard, nested Add, reload, Edit, and Delete behavior with the shared setting. |

## Search Term Add Term acceptance matrix

Run every check on macOS and record each result as passed, failed, or unverified. Restore the
synthetic glossary before each scenario that changes the file.

| Check                     | Action                                                                                                                 | Expected result                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Result menu               | Search for `ap`, open a result's actions, and choose **Add Term**.                                                     | A nested form opens with `ap` in **Term** and a blank **Definition**.                                                          |
| Empty glossary            | Load `terms: []`, reload, and open the empty-view actions.                                                             | **Add Term**, **Reload Glossary**, **Reveal Glossary in Finder**, and **Open Extension Preferences** are available.            |
| No match                  | Search for `missing` and open the no-match actions.                                                                    | **Add Term**, **Reload Glossary**, and **Reveal Glossary in Finder** are available; Add opens with `missing` prefilled.        |
| Load error                | Replace the file with `terms: [`, reload, and open the error actions.                                                  | **Reload Glossary**, **Reveal Glossary in Finder**, and **Open Extension Preferences** are available; **Add Term** is absent.  |
| Blank name                | Open Add, enter spaces in **Term**, move focus away, and submit with a valid definition.                               | A Term field error appears and no file write occurs.                                                                           |
| Blank definition          | Enter a valid term and a spaces-only **Definition**, move focus away, and submit.                                      | A Definition field error appears and no file write occurs.                                                                     |
| Error clearing            | Trigger both field errors, then edit only **Term**.                                                                    | The Term error clears while the Definition error remains.                                                                      |
| Duplicate                 | Submit `api` with any meaningful definition while `API` exists.                                                        | The duplicate error appears on **Term**, entered text remains, and no duplicate is written.                                    |
| Exact definition          | Add `Protocol` with a definition containing meaningful leading/trailing spaces and a line break.                       | **Term Added** appears; the saved name is `Protocol`, and the definition text is preserved exactly after reload.               |
| Refresh and navigation    | Successfully add a unique term from a non-empty query.                                                                 | The form closes after reload, the query becomes the trimmed saved name, and the new result is shown.                           |
| Save failure recovery     | Make the selected ordinary file read-only after opening Add, then submit valid values.                                 | A safe failure toast offers **Open Extension Preferences**, the form stays open, and both entered values remain.               |
| Linked-file policy        | Select a symbolic link or a path with multiple hard links, then submit valid values.                                   | A safe failure toast offers **Open Extension Preferences**; the selected path and linked source are unchanged.                 |
| Double submission         | Submit the same valid form twice rapidly.                                                                              | Only one term is written and the UI remains loading until the save and refresh complete.                                       |
| Post-save refresh failure | Cause the file to become invalid or unavailable immediately after a successful replacement but before the reload ends. | The save is not labeled as failed or retried; Search Term shows its load-error recovery state, or safe saved/refresh feedback. |

Automated tests cover validation, normalization, duplicate routing, double-submit guarding, and the post-save failure
boundary, but they do not establish platform UI acceptance.

## Edit Term acceptance matrix

Run every check on macOS and record each result as passed, failed, or unverified. Restore the
synthetic glossary before each scenario that changes the file.

| Check                     | Action                                                                                                                          | Expected result                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selected-result menu      | Search for `ap` and open API's actions.                                                                                         | Actions are ordered **Copy Definition**, **Copy Term**, **Add Term**, **Edit Term**, **Delete Term**, **Reload Glossary**, and **Reveal Glossary in Finder**. |
| Empty or no-match view    | Load `terms: []`, then restore the glossary and search for `missing`; inspect both action panels.                               | **Add Term** remains available, while **Edit Term** and **Delete Term** are absent because neither view has a selected result.                                |
| Selected snapshot         | Search for `a`, select API, and choose **Edit Term**.                                                                           | **Term** contains `API` and **Definition** contains `Application Programming Interface`, independent of the query.                                            |
| Name and definition       | Rename API to `Protocol` and enter a multiline definition with meaningful leading/trailing whitespace.                          | **Term Updated** appears; the form closes after reload, the query becomes `Protocol`, and the exact definition is shown and copied after reopening.           |
| Existing-name collision   | Edit API and rename it `Apple`.                                                                                                 | A duplicate error appears on **Term**, the file is unchanged, and both entered values remain in the form.                                                     |
| Case-only rename          | Edit API and change only its name to `api`.                                                                                     | The selected entry is updated in its original file position and the query becomes `api`.                                                                      |
| Stale selected term       | Open Edit for API, change API's name or definition externally, then submit the open form.                                       | The stale snapshot is refused; the external contents and entered form values remain, and the toast offers **Reload Glossary**.                                |
| File changed during save  | Arrange for the ordinary file to be replaced after submission begins but before GlossaryGo replaces it.                         | The edit is refused with the safe file-changed message; entered values remain, and **Reload Glossary** returns to results without changing the query.         |
| Conflict reload           | From either conflict toast, choose **Reload Glossary**.                                                                         | Current results reload and the form closes without retrying the edit or changing the query.                                                                   |
| Double submission         | Submit one valid edit twice rapidly.                                                                                            | Only one write occurs and the form remains loading until save and refresh complete.                                                                           |
| Post-save refresh failure | Cause the file to become invalid or unavailable immediately after a successful edit replacement but before the reload finishes. | The edit stays successful and cannot be retried; Search Term shows its load-error recovery state, or safe saved/refresh feedback.                             |
| Existing actions          | Copy API's term and definition, add a unique term, and explicitly reload after an external edit.                                | Copy, Add Term, search, and Reload Glossary behavior remains unchanged.                                                                                       |

Automated tests cover edit initialization, original-snapshot submission, normalized saved-name callbacks, duplicate and
conflict routing, double-submit guarding, and post-save failure separation. They do not establish platform UI acceptance.

## Delete Term acceptance matrix

Run every check on macOS and record each result as passed, failed, or unverified. Use only synthetic
glossary content. Restore the synthetic glossary before each scenario that changes the file.

| Check                          | Action                                                                                                             | Expected result                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete selected-result menu  | Search for `api`, select API, and open its actions.                                                                | Actions are ordered **Copy Definition**, **Copy Term**, **Add Term**, **Edit Term**, **Delete Term**, **Reload Glossary**, and **Reveal Glossary in Finder**. Empty/no-match states have Add, not Edit/Delete. |
| Delete confirmation            | Choose **Delete Term** for API.                                                                                    | A destructive confirmation identifies API and offers explicit **Cancel** and destructive **Delete** choices.                                                                                                   |
| Cancel deletion                | Choose **Cancel**.                                                                                                 | No file write, reload, or success notification occurs; API remains selected and Delete can be opened again.                                                                                                    |
| Confirm deletion               | Choose **Delete**, then inspect the file and command.                                                              | Exactly API is removed once, **Term Deleted** appears only after persistence, and the existing query is preserved during reload.                                                                               |
| Selection changes              | Open Delete for one result, then change the selected row before resolving confirmation if the platform permits it. | The originally named result is the only possible deletion target; the pending operation never follows the new selection.                                                                                       |
| Rapid repeated delete          | Invoke Delete repeatedly during confirmation and again while saving.                                               | One confirmation and at most one write occur.                                                                                                                                                                  |
| Last match                     | Use a prefix matching one term, delete that term, and keep the same query.                                         | **No Matching Terms** appears with **Add Term** available.                                                                                                                                                     |
| Last entry                     | Load a one-entry glossary and delete its only term.                                                                | The selected file remains present and valid with `terms: []`; **No Terms in Glossary** appears with **Add Term** available.                                                                                    |
| Comment ownership              | Delete an entry with leading and field comments while document, sequence, and another entry also have comments.    | Entry-owned comments disappear; document, sequence, and surviving-entry comments remain.                                                                                                                       |
| Stale selected term            | Open Delete, externally change or remove that exact term, then confirm.                                            | No unrelated term changes; the static stale-term message appears, results reload once, and deletion must be retried from a current result.                                                                     |
| File changed during save       | Change the selected file after the delete save begins but before replacement.                                      | The static file-changed message appears, the external contents remain, results reload once, and the obsolete action cannot retry.                                                                              |
| Generic save failure           | Make the ordinary selected file unwritable and confirm Delete, then restore its permissions.                       | A static safe failure appears without raw paths or glossary values; no success appears, and the same current action may be retried.                                                                            |
| Linked-file policy             | Select a symbolic link or a path with multiple hard links and confirm Delete.                                      | A safe failure appears; neither the selected path nor linked source is replaced.                                                                                                                               |
| Post-save notification failure | Cause success notification delivery to fail after a persisted deletion, if the test harness supports injection.    | Reload still runs; the persisted deletion is not reported as failed and cannot be retried.                                                                                                                     |
| Post-save refresh failure      | Make the file invalid or unavailable immediately after successful replacement but before reload completes.         | The deletion stays successful and cannot be retried; Search Term shows its load-error recovery state without a failed-deletion message.                                                                        |
| Existing actions               | Repeat search, copy, Add, Edit, and explicit reload checks after exercising Delete.                                | Existing behavior remains unchanged.                                                                                                                                                                           |

Automated tests cover cancellation, callback ordering, immutable selection capture, repeat guarding, conflict routing,
retry behavior, and post-save failure separation. They do not establish platform UI acceptance.

Testing is complete when all automated commands pass and every manual check produces the expected result. Record any
failed scenario with its query, synthetic input, and observed behavior before making a fix.

See the [KYR-16 final verification record](docs/verification/2026-09-15-kyr-16.md) for the integrated automated,
review, and macOS live-test results.
