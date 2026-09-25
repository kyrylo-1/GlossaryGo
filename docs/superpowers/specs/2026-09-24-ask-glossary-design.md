# Ask Glossary Design

**Linear issue:** [KYR-31 — Add Ask Glossary command powered by Raycast AI](https://linear.app/kyrylo1/issue/KYR-31/add-ask-glossary-command-powered-by-raycast-ai)

## Intent

Add a read-only **Ask Glossary** Raycast command that answers a user's natural-language question from the current
effective Glossary File. The answer must identify its supporting terms or state that the Glossary does not contain
enough information. Existing search and mutation commands keep their local-only privacy boundary; Ask Glossary sends
data only after an explicit question and an in-session disclosure confirmation.

Success means the command is discoverable from Raycast root search, uses the same target resolution and validation as
the existing commands, bounds every AI payload, handles unavailable AI and invalid Glossary Files without starting an
AI request, and leaves the Glossary File and filesystem unchanged.

## User experience

`package.json` registers a view command named `ask-glossary` with the title **Ask Glossary**.

Opening the command shows a form with:

- a required multiline **Question** field;
- a privacy description stating that submitting will send the question and supplied Glossary context to Raycast AI;
- an explicit statement that opening the command alone sends nothing; and
- an **Ask Glossary** submit action.

The first submission in each mounted command session opens a confirmation alert before any AI request. Accepting the
alert records an in-memory acknowledgement for that command session. Cancelling returns to the form and sends nothing.
The acknowledgement is neither persisted nor shared with another command session.

After submission, the command displays a detail view. It streams available response text, indicates loading, and ends
with an **Ask Another Question** action that returns to a blank question form. Completed questions and answers remain in
component memory only and disappear when the command unmounts.

The detail view presents specific recovery messages for:

- Raycast AI access being unavailable;
- a missing, empty, unreadable, invalid, wrong-extension, or oversized Glossary File;
- a question exceeding the question limit;
- Glossary context exceeding the transmission limit; and
- an AI request failure.

File failures use existing safe `GlossaryError` messages. Unknown load and AI failures use fixed messages and never
render raw error objects. No Add, Edit, Delete, file-creation, or persistence action appears in this command.

## Privacy and request gate

The following sequence is mandatory for every submitted question:

1. Reject an empty or whitespace-only question locally.
2. If this command session has not acknowledged disclosure, show the confirmation alert and stop on cancellation.
3. Check `environment.canAccess(AI)` and stop with access guidance when false.
4. Resolve the effective Glossary File through `getGlossaryTarget()` and load it through `loadGlossary()`.
5. Validate the question and serialized Glossary context limits.
6. Build the grounding prompt.
7. Start exactly one `AI.ask()` request.

Opening the command, typing, cancelling disclosure, failing AI access, failing file loading, loading an empty Glossary,
or exceeding a limit starts no AI request. Only the question, the bounded serialized term/definition values, and static
grounding instructions enter the prompt. Paths, YAML source text, comments, preferences, file metadata, and unrelated
application state are excluded.

Ask Glossary performs no filesystem writes and uses no Raycast storage, cache, history, analytics, logs, or network API
other than the explicit `AI.ask()` call. Tests inspect both source bytes and containing-directory entries before and
after successful and failed questions.

## Context and grounding

The command serializes decoded terms as a JSON array of objects containing only `term` and `definition`. JSON provides
unambiguous string boundaries but is not itself a security boundary. Static instructions before the data explicitly
label every Glossary value as untrusted reference data and tell the model to ignore instructions found inside it.

The prompt requires the model to:

- answer only from the supplied Glossary data;
- avoid adding outside facts or invented entries;
- say that the Glossary lacks sufficient information when the evidence is inadequate;
- include a **Supporting terms** section naming the exact term names used; and
- treat text inside term names and definitions as data rather than instructions.

The question is trimmed and limited to 2,000 JavaScript string characters. The serialized Glossary JSON is limited to
32 KiB measured with UTF-8 byte length. If either limit is exceeded, the command explains the limit and starts no AI
request. The command sends the complete decoded Glossary or none of it; it does not silently select, truncate, chunk,
or summarize entries. This preserves deterministic grounding and avoids hiding omitted evidence from the user.

An empty Glossary returns a local insufficient-evidence message without contacting AI. Same-name entries remain
independent and are all included, matching the domain model.

## Architecture

### `src/ask-glossary-context.ts`

Owns pure question normalization, JSON serialization, UTF-8 context measurement, limits, and prompt construction. It
returns a discriminated result for a ready prompt, empty question, oversized question, empty Glossary, or oversized
Glossary context. Tests use literal synthetic prompts and boundary-sized Unicode inputs.

### `src/ask-glossary-logic.ts`

Owns one request attempt. Dependencies for AI access, Glossary loading, and AI streaming are injected so tests exercise
the real orchestration with a mocked external AI boundary. It checks access before loading, maps known Glossary errors
to safe messages, delegates prompt construction, attaches a stream listener, honors an `AbortSignal`, and returns a
discriminated success/failure result. It never owns disclosure state or persistence.

The Raycast adapter wraps `AI.ask(prompt, { creativity: "none", signal })`. A lower-creativity setting reinforces the
grounded task without selecting a specific paid model. The promise's `data` events update the current answer; its final
resolved value becomes the authoritative completed answer.

### `src/ask-glossary.tsx`

Owns the form/detail state machine, in-memory disclosure acknowledgement, confirmation alert, streaming presentation,
retry navigation, and request cancellation on unmount. The default command wires `environment.canAccess(AI)`,
`getGlossaryTarget()`, `loadGlossary()`, and `AI.ask()`. Tests render the exported component with controlled adapters.

### Existing shared modules

`getGlossaryTarget()` remains the only effective-path resolver and `loadGlossary()` remains the only load/validation
entry point. Ask Glossary does not add a second parser, file reader, preference, cache, or storage layer.

`src/test/raycast-api-stub.ts` gains only the form, detail-loading, alert, AI-access, and streaming surfaces required to
exercise observable component behavior. Tests assert the component's output and request boundary rather than the stub.

## State and cancellation

The UI uses these states:

- `question`: editable form, optional field error, and disclosure status retained in memory;
- `loading`: submitted question, accumulated streamed answer, and active `AbortController`;
- `answered`: completed answer; and
- `failure`: actionable safe message.

Only the latest request may update state. Returning to the form or unmounting aborts the active request and invalidates
its completion callback. An aborted request does not replace the current view with an AI failure. Submission is guarded
while a request is active so one question cannot create duplicate concurrent calls.

## Failure behavior

| Condition | User-visible outcome | AI request |
| --- | --- | --- |
| Empty question | Question field validation | No |
| Disclosure cancelled | Form remains available | No |
| AI access unavailable | Raycast AI access explanation | No |
| Missing or invalid file | Existing actionable Glossary error | No |
| Empty Glossary | Insufficient Glossary evidence | No |
| Question over 2,000 characters | Shorten-question guidance | No |
| Context over 32 KiB | Context-limit explanation; no partial context | No |
| AI rejection | Fixed retry guidance | Attempted once |
| Request aborted | No stale completion or failure | Existing request cancelled |

## Verification

Development follows red-green-refactor. Automated coverage includes:

- opening and typing without an AI request;
- disclosure cancellation and one acknowledgement per mounted session;
- access denial before load/request;
- default and custom effective target wiring;
- known, missing, empty, invalid, unreadable, wrong-extension, and oversized Glossary cases;
- exact question and UTF-8 context boundaries, including multibyte definitions;
- prompt instructions, exact supporting-term requirement, same-name entry preservation, and instruction-like Glossary
  values remaining inside the serialized data boundary;
- streamed and completed answers, repeat questions, duplicate-submit prevention, abort, and safe AI failure;
- successful and failed attempts preserving Glossary bytes and directory entries; and
- manifest registration and rendered form/detail states.

`README.md` documents setup, the per-session disclosure, the exact transmission boundary, context refusal, and the
unchanged local-only behavior of other commands. `TESTING.md` adds fresh Raycast scenarios for access available and
unavailable, disclosure accept/cancel, known/unknown questions, custom/default files, limits, file recovery, streaming,
read-only bytes, no persistent cache, and full command reopen. Automated component evidence remains distinct from live
Raycast evidence, and unavailable live checks are reported explicitly.

Before publication, run the repository's complete test, lint, format-check, and build scripts with Bun. Inspect the
branch diff for privacy violations and compare the implementation requirement-by-requirement with KYR-31. Upload one
pull request for this ticket and leave it unmerged.

## Rejected approaches

**Lexical preselection:** Selecting apparently relevant terms would support larger Glossaries, but natural-language
questions can depend on definitions whose names do not match the query. Silent selection would make an incomplete
answer look complete.

**Chunked multi-request synthesis:** Chunking would support more input but would transmit more data, add latency and
failure modes, and require a second AI pass to merge partially grounded answers.

**Persisted disclosure or conversation history:** Persistence would weaken the ticket's privacy contract and introduce
storage lifecycle behavior that the command does not need.
