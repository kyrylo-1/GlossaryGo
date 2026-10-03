# KYR-75 verification

Ticket: https://linear.app/kyrylo1/issue/KYR-75/allow-selecting-any-yaml-glossary-file-instead-of-a-folder

Scope clarification: replace the creation flow entirely with file selection. Keep the `create-glossary-file` command ID
for existing aliases; its displayed title is Select Glossary File. The unused exclusive-create service remains in the
repository because this workspace prohibits file deletion. No command invokes it.

## Automated evidence

- `bun run test`: 493 tests across 40 files passed.
- `bun run lint`: passed (manifest, icons, ESLint, and Prettier).
- `bun run check:format`: passed.
- `bun run build`: passed.
- `bun x tsc --noEmit`: 51 diagnostics, reproduced against a separate archive of `origin/main` with the same locked
  dependencies; no additional diagnostics from this branch. Standalone typechecking is not a configured CI gate.
- Focused red/green checks established `.yml` load/save behavior, activated-path precedence, and Quick Add storage-error
  recovery before implementing those changes.

| Criterion                                   | Verification                                                                                                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File picker, arbitrary names and extensions | Command tests select existing `team-notes.yaml` and `vocabulary.yml`, preview validation, then explicitly activate.                                                                                             |
| Shared validated path                       | Public resolver and actual Search, Add, Quick Add, and Reveal entry points use the activated file. Open With receives that exact path. Ask retains its disclosure gate and awaits the same resolver.            |
| Local handling and safe writes              | Selection preserves bytes, inode, timestamps, mode, and directory entries. Only the path reaches local storage; no AI call occurs. Read-only and symbolic-link targets remain protected from writes.            |
| Cancellation and recovery                   | Invalid YAML/schema/extension, missing or unreadable file, storage error, changed preview, cancel, and close during pending validation preserve the previous selection. Recovery actions launch file selection. |
| Named fixtures and regression coverage      | Both specified filenames run through actual command integrations; legacy/default resolution and the existing save suites remain green.                                                                          |

## Native Raycast evidence

Date: 2026-10-03. Used a temporary copy of commit `68ac4a8`, with only manifest identity changed to
`glossarygo-kyr75-check` / **GlossaryGo KYR-75 Check**. `ray develop` compiled the copy and its installed manifest confirmed
the isolated identity. The user's regular extension preferences and active glossary were not edited.

- Confirmed the root command title and native **Glossary File / Select File** control; [screenshot](select-file.jpg).
- Confirmed the native file dialog navigated to and selected the synthetic `team-notes.yaml`.
- The initial automated dialog interaction returned to root search, and a later locked Mac prevented further testing.
  After unlocking, refreshing accessibility state immediately before clicking each dialog control allowed the entire
  flow to complete repeatedly. No application code change was needed; the earlier observation did not reproduce with
  this interaction sequence.
- Selected `team-notes.yaml`, observed **Valid glossary: 1 term**, activated it, and reopened Search Term to see Team and
  its synthetic definition. [Native preview](valid-preview.jpg).
- Opened Add Term, confirmed its displayed path ended in `team-notes.yaml`, saved Native Add, and read the fixture to
  verify the entry was written to that exact file.
- Selected `vocabulary.yml`, observed **Valid glossary: 1 term**, activated it, and reopened Search Term to see Vocabulary.
  [Search after activation](selected-yml-search.jpg). Quick Add then saved Native Quick; reading the fixture confirmed
  that exact `.yml` file contained the new term.
- Reveal Glossary File opened Finder with `vocabulary.yml` selected at the expected fixture path.
- Selecting `invalid.yml` showed the existing invalid-YAML recovery message. Canceling the subsequently opened picker
  returned to that form; leaving the command and reopening Search still showed Vocabulary and Native Quick.
  [Invalid-file recovery](invalid-file.jpg).
- Previewed `team-notes.yaml`, temporarily removed its read permissions, then attempted activation. The form reported
  that the file could not be read. Restored its original `0644` permissions immediately; reopened Search still showed
  Vocabulary and Native Quick, proving the failed activation retained the prior selection.
- Selection left fixture contents unchanged; only the explicit Add Term and Quick Add actions above changed them.
  Automated command integrations above are distinct from this native evidence.

The validation folder is recorded locally in `/tmp/kyr-75-native-path.txt`; all content is synthetic. The isolated
development extension retains its test selection so these checks can be reproduced without changing the user's regular
extension preferences.
