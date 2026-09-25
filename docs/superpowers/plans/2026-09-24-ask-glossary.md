# Ask Glossary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Ask Glossary Raycast command that sends a deliberately bounded, explicitly disclosed Glossary context to Raycast AI and returns grounded answers with supporting terms.

**Architecture:** A pure context builder owns limits and prompt construction, an injected orchestration function owns access/load/AI sequencing, and a TSX command owns disclosure and view state. Existing target resolution and Glossary loading remain the only path and validation seams; AI is the only external boundary.

**Tech Stack:** TypeScript, React 19, Raycast API `AI.ask`, Vitest, Testing Library, YAML-backed existing Glossary loader.

**Spec:** `docs/superpowers/specs/2026-09-24-ask-glossary-design.md`

## Global Constraints

- Register one `mode: "view"` command named `ask-glossary`, titled **Ask Glossary**.
- Opening, typing, cancelling disclosure, access denial, file failure, empty Glossary, or limit failure starts no AI request.
- Ask for disclosure confirmation once per mounted command session and persist no acknowledgement.
- Resolve the effective path only through `getGlossaryTarget()` and load/validate only through `loadGlossary()`.
- Limit trimmed questions to 2,000 JavaScript string characters.
- Limit complete serialized Glossary JSON to 32 KiB by UTF-8 byte length; send all entries or none.
- Send decoded `term` and `definition` values only; exclude paths, YAML source, comments, preferences, and metadata.
- Treat same-name entries independently and preserve every decoded entry in the serialized context.
- Use `AI.ask(prompt, { creativity: "none", signal })` without selecting a paid model.
- Persist no questions, answers, history, cache, logs, or Glossary content.
- Perform no filesystem writes and expose no Add, Edit, or Delete action from Ask Glossary.
- Keep glossary fixtures synthetic and do not print their contents during verification.
- Update README and TESTING in the same ticket; distinguish automated evidence from fresh Raycast evidence.
- Create one focused commit after each task through a separate Luna low-reasoning agent.
- Publish exactly one pull request for KYR-31 and leave it unmerged.

## Review Focus

- A definition containing multibyte characters must be accepted at exactly 32 KiB and refused when one additional byte crosses the boundary.
- Instruction-like text and delimiter-like strings inside a term or definition must stay JSON data and must not replace the grounding instructions.
- Repeated submit gestures while disclosure or AI work is pending must start one confirmation and one AI request.
- An answer that resolves after navigation or unmount must not overwrite the next view; the active request must receive an abort signal.
- Every success and failure path must preserve the Glossary File bytes and containing-directory entries exactly.

---

### Task 1: Build bounded grounding context

**Files:**

- Create: `src/ask-glossary-context.ts`
- Create: `src/ask-glossary-context.test.ts`

**Interfaces:**

- Consumes: `Term` from `src/utils/types.ts`.
- Produces: `MAX_ASK_QUESTION_CHARACTERS`, `MAX_GLOSSARY_CONTEXT_BYTES`, `AskGlossaryPromptResult`, and `buildAskGlossaryPrompt(question: string, terms: readonly Term[]): AskGlossaryPromptResult`.

- [ ] **Step 1: Write failing table-driven question and Glossary limit tests**

Add tests that name the break each case catches:

```ts
test.each([
  ["", "empty-question"],
  [" \n\t ", "empty-question"],
  ["q".repeat(MAX_ASK_QUESTION_CHARACTERS + 1), "question-too-long"],
] as const)("refuses invalid question %j before constructing a prompt", (question, reason) => {
  expect(buildAskGlossaryPrompt(question, [{ term: "API", definition: "Interface" }])).toEqual({
    reason,
    status: "rejected",
  });
});

test("accepts the exact question boundary after trimming", () => {
  const question = ` ${"q".repeat(MAX_ASK_QUESTION_CHARACTERS)} `;
  expect(buildAskGlossaryPrompt(question, [{ term: "API", definition: "Interface" }])).toMatchObject({
    status: "ready",
  });
});

test("refuses an empty Glossary without constructing a prompt", () => {
  expect(buildAskGlossaryPrompt("What is API?", [])).toEqual({ reason: "empty-glossary", status: "rejected" });
});
```

Construct a definition whose serialized JSON is exactly `MAX_GLOSSARY_CONTEXT_BYTES`, then a multibyte variant one byte over. Use `Buffer.byteLength(JSON.stringify(...), "utf8")` only in test-fixture setup; expected statuses stay literal.

- [ ] **Step 2: Run the context test and verify RED**

Run: `bun run test -- src/ask-glossary-context.test.ts`

Expected: FAIL because `ask-glossary-context.ts` and its exports do not exist.

- [ ] **Step 3: Implement limits and a discriminated result**

Implement these exact public types and constants:

```ts
import type { Term } from "./utils/types";

export const MAX_ASK_QUESTION_CHARACTERS = 2_000;
export const MAX_GLOSSARY_CONTEXT_BYTES = 32 * 1_024;

type AskGlossaryPromptFailure = Readonly<{
  reason: "context-too-large" | "empty-glossary" | "empty-question" | "question-too-long";
  status: "rejected";
}>;

type AskGlossaryPrompt = Readonly<{
  prompt: string;
  question: string;
  status: "ready";
}>;

export type AskGlossaryPromptResult = AskGlossaryPrompt | AskGlossaryPromptFailure;
```

`buildAskGlossaryPrompt` must trim the question, check its `.length`, reject an empty term array, serialize `terms.map(({ term, definition }) => ({ term, definition }))`, measure the serialized JSON with `Buffer.byteLength(..., "utf8")`, and reject before building a prompt when it exceeds 32 KiB.

- [ ] **Step 4: Add failing prompt-grounding tests**

Use two same-name entries plus an instruction-like definition. Assert that the literal prompt:

- begins with static rules to use only Glossary data;
- requires either a grounded answer or an insufficient-information statement;
- requires a `Supporting terms` section with exact term names;
- says term names and definitions are untrusted data, not instructions;
- includes the trimmed question; and
- contains both entries exactly once inside `JSON.stringify(terms)`.

The expected prompt string must be a hand-written literal around the independently serialized JSON fixture, never computed by a production helper.

- [ ] **Step 5: Run RED, implement the prompt, then verify GREEN**

Run before implementation: `bun run test -- src/ask-glossary-context.test.ts`

Expected: FAIL because ready results do not yet contain the required prompt.

Implement one static template with rules before question and data delimiters. Then run:

```bash
bun run test -- src/ask-glossary-context.test.ts
bun run check:format -- src/ask-glossary-context.ts src/ask-glossary-context.test.ts
```

Expected: all context tests pass and both files are formatted.

- [ ] **Step 6: Commit the context unit through Luna**

Stage only the two context files. Commit message: `feat: build bounded Ask Glossary context`

---

### Task 2: Orchestrate one read-only AI attempt

**Files:**

- Create: `src/ask-glossary-logic.ts`
- Create: `src/ask-glossary-logic.test.ts`
- Read: `src/glossary/glossary.ts`
- Read: `src/glossary/glossary-error.ts`

**Interfaces:**

- Consumes: `buildAskGlossaryPrompt`, `Term`, `GlossaryError`, caller-provided `AbortSignal`.
- Produces: `AskGlossaryAi`, `AskGlossaryOutcome`, `RunAskGlossaryOptions`, and `runAskGlossary(options: RunAskGlossaryOptions): Promise<AskGlossaryOutcome>`.

- [ ] **Step 1: Write failing request-gate tests**

Define controlled spies and assert this ordering:

```ts
test("stops before loading when Raycast AI access is unavailable", async () => {
  const loadTerms = vi.fn<() => Promise<readonly Term[]>>();
  const askAi = vi.fn<AskGlossaryAi>();

  await expect(
    runAskGlossary({
      askAi,
      canAccessAi: () => false,
      loadTerms,
      onData: vi.fn(),
      question: "What is API?",
      signal: new AbortController().signal,
    }),
  ).resolves.toEqual({ kind: "access", message: expect.any(String), status: "failed" });
  expect(loadTerms).not.toHaveBeenCalled();
  expect(askAi).not.toHaveBeenCalled();
});
```

Add separate tests for each prompt rejection reason and assert `askAi` stays untouched. Empty question must be rejected before loading; other prompt failures occur after one successful load.

- [ ] **Step 2: Run the orchestration test and verify RED**

Run: `bun run test -- src/ask-glossary-logic.test.ts`

Expected: FAIL because `ask-glossary-logic.ts` does not exist.

- [ ] **Step 3: Implement public orchestration types and gates**

Use these interfaces:

```ts
export type AskGlossaryAi = (
  prompt: string,
  options: Readonly<{ onData: (chunk: string) => void; signal: AbortSignal }>,
) => Promise<string>;

export type AskGlossaryOutcome =
  | Readonly<{ answer: string; status: "answered" }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{
      kind: "access" | "ai" | "context" | "glossary" | "question";
      message: string;
      status: "failed";
    }>;

export type RunAskGlossaryOptions = Readonly<{
  askAi: AskGlossaryAi;
  canAccessAi: () => boolean;
  loadTerms: () => Promise<readonly Term[]>;
  onData: (chunk: string) => void;
  question: string;
  signal: AbortSignal;
}>;
```

Check an empty/oversized question locally, then access, then load, then context, then AI. Map `GlossaryError` to its safe `.message`; map unknown load failures to `The glossary could not be loaded. Try again.`. Map AI failures to `Raycast AI could not answer this question. Try again.`. Return `cancelled` when `signal.aborted` before or after a rejection.

- [ ] **Step 4: Add failing stream, failure, and cancellation tests**

Cover:

- `askAi` receives exactly the ready prompt and original `AbortSignal`;
- each `onData` chunk is forwarded in order and the final resolved answer wins;
- a known `GlossaryError` message is preserved without an AI request;
- an unknown load error is replaced by the fixed safe message;
- an AI error is replaced by the fixed safe message;
- an already aborted request and a request aborted before rejection return `cancelled`; and
- a second call is independent and performs exactly one AI attempt.

- [ ] **Step 5: Add a failing read-only filesystem integration test**

Use `writeGlossary()` to create a synthetic valid fixture, capture `readFile(path)` and `readdir(dirname(path))`, run `runAskGlossary` with the real `loadGlossary(path)` and mocked `askAi`, then assert exact byte and directory-entry equality. Repeat with a rejected AI promise. Register `removeTemporaryDirectories` in `afterEach` as existing Glossary tests do.

- [ ] **Step 6: Implement minimal streaming/error behavior and verify GREEN**

Run:

```bash
bun run test -- src/ask-glossary-context.test.ts src/ask-glossary-logic.test.ts
bun run check:format -- src/ask-glossary-logic.ts src/ask-glossary-logic.test.ts
```

Expected: both suites pass; filesystem assertions show unchanged bytes and directory entries.

- [ ] **Step 7: Commit the orchestration unit through Luna**

Stage only the logic files. Commit message: `feat: orchestrate Ask Glossary requests`

---

### Task 3: Render disclosure, questions, and streamed answers

**Files:**

- Create: `src/ask-glossary.tsx`
- Create: `src/ask-glossary.test.tsx`
- Modify: `src/test/raycast-api-stub.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: `runAskGlossary`, `AI.ask`, `environment.canAccess`, `confirmAlert`, `getGlossaryTarget`, `loadGlossary`.
- Produces: the default Raycast command and exported `AskGlossaryCommand` component with injectable `AskGlossaryCommandDependencies` for component tests.

- [ ] **Step 1: Extend the Raycast stub only enough for failing component tests**

Add observable support for:

- `Form.Description` rendering its title/text;
- `Action.SubmitForm` collecting `question` as well as existing term fields without breaking them;
- `Detail` exposing `isLoading` as `data-loading`;
- `environment.canAccess` and `environment.supportPath`;
- `AI.ask`; and
- the existing `confirmAlert` mock accepting alert options.

Keep existing Add/Search component tests green after the stub change:

Run: `bun run test -- src/add-term.test.tsx src/search-term.test.tsx`

- [ ] **Step 2: Write failing initial-view and disclosure tests**

Render `AskGlossaryCommand` with controlled dependencies. Assert:

- the **Question** textarea and privacy description render;
- mount and typing invoke neither confirmation, load, nor AI;
- whitespace submit shows a field error without confirmation;
- cancelling confirmation preserves the question and starts no load/AI;
- accepting confirmation allows one attempt; and
- a later question in the same mounted session skips confirmation, while remounting requires it again.

- [ ] **Step 3: Run the component test and verify RED**

Run: `bun run test -- src/ask-glossary.test.tsx`

Expected: FAIL because the component and command do not exist.

- [ ] **Step 4: Implement the form, disclosure state, and manifest entry**

Use this dependency boundary:

```ts
export type AskGlossaryCommandDependencies = Readonly<{
  askAi: AskGlossaryAi;
  canAccessAi: () => boolean;
  confirmDisclosure: () => Promise<boolean>;
  loadTerms: () => Promise<readonly Term[]>;
}>;

export const AskGlossaryCommand = ({
  dependencies,
}: Readonly<{ dependencies: AskGlossaryCommandDependencies }>): ReactElement => {
  // in-memory form, disclosure, request, and result state
};
```

The default export resolves the target once per mount and adapts Raycast streaming:

```ts
const askAi: AskGlossaryAi = async (prompt, { onData, signal }) => {
  const stream = AI.ask(prompt, { creativity: "none", signal });
  stream.on("data", onData);
  return stream;
};
```

Use a confirmation titled **Send to Raycast AI?** that states the question and supplied Glossary context will be sent for processing. Add the manifest command adjacent to Search Term:

```json
{
  "name": "ask-glossary",
  "title": "Ask Glossary",
  "description": "Ask questions grounded in your local glossary using Raycast AI",
  "mode": "view"
}
```

- [ ] **Step 5: Add failing detail, duplicate-submit, repeat, and abort tests**

Assert:

- loading detail renders accumulated chunks and `data-loading="true"`;
- completion displays the authoritative final answer and clears loading;
- each failure kind renders its actionable message;
- **Ask Another Question** aborts any active request, returns a blank form, and retains session disclosure;
- two submit gestures while confirmation is pending cause one confirmation and one attempt;
- two submit gestures while AI is pending cause one attempt;
- unmount aborts the active signal; and
- late chunks/completion after Ask Another or unmount do not overwrite current state.

The mutation that each test catches is a duplicate external request or stale state write, not the existence of a mock.

- [ ] **Step 6: Add failing default-wiring and manifest tests**

Mock `getGlossaryTarget()` to return a synthetic custom path and `loadGlossary()` to record its argument. Render the default command, accept disclosure, submit, and assert the loader receives that exact path while AI receives a bounded prompt without the path. Repeat target setup for the default support-path result.

Read `package.json` as JSON and assert the exact command contract: name, title, description, and `mode: "view"`.

- [ ] **Step 7: Implement latest-request guards and verify GREEN**

Use a `useRef` submission guard, monotonically increasing request token, and one active `AbortController`. Invalidate the token before aborting on Ask Another/unmount. Only the matching active token may append chunks or apply the returned outcome.

Run:

```bash
bun run test -- src/ask-glossary.test.tsx src/add-term.test.tsx src/search-term.test.tsx
bun run check:format -- src/ask-glossary.tsx src/ask-glossary.test.tsx src/test/raycast-api-stub.ts package.json
```

Expected: all component suites pass with no React warnings.

- [ ] **Step 8: Commit the command unit through Luna**

Stage only `src/ask-glossary.tsx`, `src/ask-glossary.test.tsx`, `src/test/raycast-api-stub.ts`, and `package.json`. Commit message: `feat: add Ask Glossary command`

---

### Task 4: Document setup, privacy, and live acceptance

**Files:**

- Modify: `README.md`
- Modify: `TESTING.md`

**Interfaces:**

- Consumes: visible labels and exact behavior implemented in Tasks 1–3.
- Produces: user-facing privacy contract and reusable Ask Glossary acceptance scenarios.

- [ ] **Step 1: Update README from the verified implementation**

Add an **Asking the glossary** section that states:

- Raycast AI access is required;
- opening and typing send nothing;
- first submission per command session requires disclosure confirmation;
- the question and complete bounded decoded context are sent only after confirmation;
- context over 32 KiB is refused rather than truncated;
- answers identify supporting terms or state insufficient evidence;
- questions, answers, and acknowledgement are not persisted; and
- Search, Add, Edit, Delete, Copy, Reload, and Reveal retain their existing local-only behavior except explicit clipboard/Finder actions.

Revise the Privacy section so it no longer falsely promises zero Glossary transmission for every command, while keeping the local-only guarantees precise for all existing commands.

- [ ] **Step 2: Update TESTING with distinct Ask Glossary scenarios**

Add stable scenario IDs for:

- initial form and zero-request gate;
- disclosure cancel/accept and reopen reset;
- known and insufficient-evidence questions with exact supporting terms;
- AI access unavailable;
- custom/default target resolution and every file failure class;
- exact question/context boundaries and multibyte over-limit refusal;
- streaming, repeat question, duplicate-submit prevention, and abort;
- byte/directory preservation and absence of persistent cache/history; and
- fresh Raycast runtime identity and effective synthetic path.

Add the new suites to automated coverage pointers. State that mocked AI/component tests are automated evidence only and that any unavailable live AI variant must be recorded as unavailable rather than inferred.

- [ ] **Step 3: Check documentation agreement and formatting**

Run:

```bash
bun run check:format -- README.md TESTING.md
rg -n "Ask Glossary|Raycast AI|32 KiB|send|persist" README.md TESTING.md
git diff --check -- README.md TESTING.md
```

Compare every visible label and numeric limit against the implementation; correct any mismatch.

- [ ] **Step 4: Commit documentation through Luna**

Stage only README and TESTING. Commit message: `docs: document Ask Glossary privacy and testing`

---

### Task 5: Verify, review, and publish KYR-31

**Files:**

- Review: every branch change since `origin/main`
- Keep untracked and uncommitted: `bun.lock`

**Interfaces:**

- Consumes: completed Tasks 1–4 and KYR-31 acceptance criteria.
- Produces: verified branch, one GitHub pull request, and attached PR artifact.

- [ ] **Step 1: Run the complete automated gate from the KYR-31 worktree**

Run fresh:

```bash
bun run test
bun run lint
bun run check:format
bun run build
```

Record test file/test counts and exact exit status. A failed command blocks publication until fixed and rerun.

- [ ] **Step 2: Audit requirements and privacy boundaries**

For every specification requirement, identify its proving test, source path, documentation, or live evidence. Inspect:

```bash
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
git status --short --branch
rg -n "LocalStorage|Cache|writeFile|appendFile|console\.|fetch\(" src/ask-glossary* src/test/raycast-api-stub.ts
```

Confirm no Ask Glossary production module imports a save service or persistence API, no path enters the AI prompt, and `bun.lock` remains outside commits.

- [ ] **Step 3: Perform fresh Raycast acceptance where available**

Start `bun run dev` from this exact worktree, verify the process path and effective synthetic Glossary path, then execute the scoped Ask Glossary TESTING scenarios with synthetic terms. Restore the original preference, fixture bytes, and prior development process state exactly. If Raycast AI access or UI automation is unavailable, record each live variant as unavailable and keep automated evidence separate.

- [ ] **Step 4: Request a whole-branch code review and resolve findings**

Use the code-review skill against `origin/main...HEAD`. Apply validated findings test-first, verify each red/green cycle, and create a focused Luna commit after every resulting change. Rerun the complete gate after the last finding.

- [ ] **Step 5: Push and open one pull request**

Use the publish workflow to push `wkyrylo/kyr-31-add-ask-glossary-command-powered-by-raycast-ai` and create one PR whose body includes:

- the problem and resulting Ask Glossary behavior;
- privacy/request gates and exact context limits;
- automated command results;
- fresh Raycast evidence or explicitly unavailable variants;
- `Closes KYR-31`; and
- screenshots for the form, disclosure, loading/answer, and representative error states when fresh UI capture is available.

Leave the PR unmerged. Attach its URL to the current task with the pull-request artifact tool.

- [ ] **Step 6: Verify publication state**

Inspect the live PR and verify its base, head, commit list, changed files, checks, and issue link. Confirm the main checkout remains unchanged and report the untracked setup file cleanup command:

```bash
rm /Users/kyryloavramenko/.codex/worktrees/kyr-31-ask-glossary/glossarygo/bun.lock
```
