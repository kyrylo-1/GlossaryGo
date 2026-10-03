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
- **Unresolved:** accepting the native file dialog returned to Raycast root search through Computer Use, preventing
  observation of the validation preview or activation. Raycast also restarted during the automated interaction.
  These observations do not establish whether the cause is the host, UI control, or extension. Native activation,
  command-reopen persistence, cancellation/error recovery, and mutation smoke checks remain unverified.
- Synthetic fixture bytes remained unchanged. Automated command integrations above are distinct from native evidence.

Resume by opening **Select Glossary File — GlossaryGo KYR-75 Check**, selecting each named fixture, confirming the preview,
activating it, and reopening Search Term. Exercise cancel and invalid YAML while retaining the selected sentinel.
The validation folder is recorded locally in `/tmp/kyr-75-native-path.txt`; no private glossary is needed.
