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

Testing is complete when all automated commands pass and every manual check produces the expected result. Record any
failed scenario with its query, synthetic input, and observed behavior before making a fix.
