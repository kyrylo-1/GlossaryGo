# Testing GlossaryGo

Follow this guide to load the local extension into Raycast and verify its behavior with synthetic data.

## Add the local extension to Raycast

With Raycast running and Node.js 22.14 or newer installed, run these commands from the extension directory:

```bash
node --version
npm ci
npm run dev
```

Development mode builds the extension and automatically imports it into Raycast. Open Raycast, search for
**GlossaryGo** or **Search Term**, and select your **Glossary File** when prompted.

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

The existing tests cover glossary loading, YAML validation, duplicate rejection, UTF-8 and file-size limits,
Unicode prefix matching, sorting, result limits, and reducer state transitions. Automated checks do not verify the
Raycast interface, clipboard actions, or the complete reload lifecycle; perform the manual checks below as well.

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

Start with the unmodified test glossary. Open the action panel to access **Copy Definition**, **Copy Term**, and
**Reload Glossary**. Restore the test glossary and reload it after each scenario that changes its contents.

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

## Add Term acceptance matrix

Run every check on both macOS and Windows and record each platform as passed, failed, or unverified. Restore the
synthetic glossary before each scenario that changes the file.

| Check                     | Action                                                                                                                 | Expected result                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Result menu               | Search for `ap`, open a result's actions, and choose **Add Term**.                                                     | A nested form opens with `ap` in **Term** and a blank **Definition**.                                                          |
| Empty glossary            | Load `terms: []`, reload, and open the empty-view actions.                                                             | **Add Term**, **Reload Glossary**, and **Open Extension Preferences** are available.                                           |
| No match                  | Search for `missing` and open the no-match actions.                                                                    | **Add Term** and **Reload Glossary** are available; Add opens with `missing` prefilled.                                        |
| Load error                | Replace the file with `terms: [`, reload, and open the error actions.                                                  | Only **Reload Glossary** and **Open Extension Preferences** are available; **Add Term** is absent.                             |
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

Testing is complete when all automated commands pass and every manual check produces the expected result. Record any
failed scenario with its query, synthetic input, and observed behavior before making a fix.
