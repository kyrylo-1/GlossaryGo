import { readFile, readdir } from "node:fs/promises";
import { dirname } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  MAX_ASK_QUESTION_CHARACTERS,
  MAX_GLOSSARY_CONTEXT_BYTES,
  buildAskGlossaryPrompt,
} from "./ask-glossary-context";
import { GlossaryError } from "./glossary/glossary-error";
import { loadGlossary } from "./glossary/glossary";
import { removeTemporaryDirectories, writeGlossary } from "./glossary/glossary-test-utils";
import { runAskGlossary, type AskGlossaryAi, type RunAskGlossaryOptions } from "./ask-glossary-logic";
import type { Term } from "./utils/types";

afterEach(async () => {
  vi.restoreAllMocks();
  await removeTemporaryDirectories();
});

const terms: readonly Term[] = [{ definition: "Application Programming Interface", term: "API" }];

const createOptions = (overrides: Partial<RunAskGlossaryOptions> = {}): RunAskGlossaryOptions => {
  return {
    askAi: vi.fn<AskGlossaryAi>().mockResolvedValue("An API is an interface."),
    canAccessAi: () => true,
    loadTerms: () => Promise.resolve(terms),
    onData: vi.fn<(chunk: string) => void>(),
    question: "What is API?",
    signal: new AbortController().signal,
    ...overrides,
  };
};

const makeTermAtSerializedByteLength = (byteLength: number): Term => {
  const term = "API";
  const definitionPrefix = JSON.stringify([{ definition: "", term }]);
  const definitionLength = byteLength - Buffer.byteLength(definitionPrefix, "utf8");
  return { definition: "a".repeat(definitionLength), term };
};

describe("runAskGlossary request gates", () => {
  test("stops before loading when Raycast AI access is unavailable", async () => {
    const loadTerms = vi.fn<() => Promise<readonly Term[]>>();
    const askAi = vi.fn<AskGlossaryAi>();

    await expect(
      runAskGlossary({
        askAi,
        canAccessAi: () => false,
        loadTerms,
        onData: vi.fn<(chunk: string) => void>(),
        question: "What is API?",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ kind: "access", message: expect.any(String), status: "failed" });
    expect(loadTerms).not.toHaveBeenCalled();
    expect(askAi).not.toHaveBeenCalled();
  });

  test.each([
    ["empty", "", "empty-question", "question", 0],
    ["oversized", "q".repeat(MAX_ASK_QUESTION_CHARACTERS + 1), "question-too-long", "question", 0],
    ["empty glossary", "What is API?", "empty-glossary", "glossary", 1],
    ["oversized context", "What is API?", "context-too-large", "context", 1],
  ] as const)("rejects a %s prompt without calling AI", async (_, question, reason, kind, loadCount) => {
    const rejectedTerms =
      reason === "empty-glossary" ? [] : [makeTermAtSerializedByteLength(MAX_GLOSSARY_CONTEXT_BYTES + 1)];
    const loadTerms = vi.fn<() => Promise<readonly Term[]>>().mockResolvedValue(rejectedTerms);
    const askAi = vi.fn<AskGlossaryAi>();
    const canAccessAi = vi.fn<() => boolean>(() => true);

    const outcome = await runAskGlossary(createOptions({ askAi, canAccessAi, loadTerms, question }));

    expect(outcome).toMatchObject({ kind, message: expect.any(String), status: "failed" });
    expect(canAccessAi).toHaveBeenCalledTimes(loadCount === 0 ? 0 : 1);
    expect(loadTerms).toHaveBeenCalledTimes(loadCount);
    expect(askAi).not.toHaveBeenCalled();
    expect(buildAskGlossaryPrompt(question, rejectedTerms)).toEqual({ reason, status: "rejected" });
  });
});

describe("runAskGlossary AI answer", () => {
  test("passes the ready prompt and original signal, forwards chunks, and returns the final answer", async () => {
    const controller = new AbortController();
    const onData = vi.fn<(chunk: string) => void>();
    const expectedPrompt = buildAskGlossaryPrompt("What is API?", terms);
    expect(expectedPrompt.status).toBe("ready");
    if (expectedPrompt.status !== "ready") {
      throw new Error("Expected a ready prompt for the valid question and glossary.");
    }
    const askAi = vi.fn<AskGlossaryAi>().mockImplementation((prompt, { onData: receiveData, signal }) => {
      expect(signal).toBe(controller.signal);
      receiveData("An ");
      receiveData("API");
      expect(prompt).toBe(expectedPrompt.prompt);
      return Promise.resolve("An API is an application programming interface.");
    });

    await expect(runAskGlossary(createOptions({ askAi, onData, signal: controller.signal }))).resolves.toEqual({
      answer: "An API is an application programming interface.",
      status: "answered",
    });
    expect(onData.mock.calls).toEqual([["An "], ["API"]]);
    expect(askAi).toHaveBeenCalledOnce();
  });
});

describe("runAskGlossary failures", () => {
  test("preserves a safe GlossaryError message without an AI request", async () => {
    const askAi = vi.fn<AskGlossaryAi>();
    const error = new GlossaryError("missing", "No glossary exists at this path.");

    await expect(runAskGlossary(createOptions({ askAi, loadTerms: () => Promise.reject(error) }))).resolves.toEqual({
      kind: "glossary",
      message: error.message,
      status: "failed",
    });
    expect(askAi).not.toHaveBeenCalled();
  });

  test("replaces an unknown Glossary load error with a safe message", async () => {
    const askAi = vi.fn<AskGlossaryAi>();

    await expect(
      runAskGlossary(createOptions({ askAi, loadTerms: () => Promise.reject(new Error("private detail")) })),
    ).resolves.toEqual({
      kind: "glossary",
      message: "The glossary could not be loaded. Try again.",
      status: "failed",
    });
    expect(askAi).not.toHaveBeenCalled();
  });

  test("replaces an AI rejection with a safe message", async () => {
    const askAi = vi.fn<AskGlossaryAi>().mockRejectedValue(new Error("private AI detail"));

    await expect(runAskGlossary(createOptions({ askAi }))).resolves.toEqual({
      kind: "ai",
      message: "Raycast AI could not answer this question. Try again.",
      status: "failed",
    });
    expect(askAi).toHaveBeenCalledOnce();
  });
});

describe("runAskGlossary cancellation and retry", () => {
  test("returns cancelled when already aborted before the request", async () => {
    const controller = new AbortController();
    controller.abort();
    const askAi = vi.fn<AskGlossaryAi>();
    const loadTerms = vi.fn<() => Promise<readonly Term[]>>();

    await expect(runAskGlossary(createOptions({ askAi, loadTerms, signal: controller.signal }))).resolves.toEqual({
      status: "cancelled",
    });
    expect(loadTerms).not.toHaveBeenCalled();
    expect(askAi).not.toHaveBeenCalled();
  });

  test("returns cancelled when aborted before an AI rejection", async () => {
    const controller = new AbortController();
    const askAi = vi.fn<AskGlossaryAi>().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new Error("private AI detail"));
    });

    await expect(runAskGlossary(createOptions({ askAi, signal: controller.signal }))).resolves.toEqual({
      status: "cancelled",
    });
    expect(askAi).toHaveBeenCalledOnce();
  });

  test("keeps a second call independent and makes one AI attempt per call", async () => {
    const askAi = vi.fn<AskGlossaryAi>().mockResolvedValue("A grounded answer.");
    const options = createOptions({ askAi });

    await expect(runAskGlossary(options)).resolves.toEqual({ answer: "A grounded answer.", status: "answered" });
    await expect(runAskGlossary(options)).resolves.toEqual({ answer: "A grounded answer.", status: "answered" });
    expect(askAi).toHaveBeenCalledTimes(2);
  });
});

describe("runAskGlossary filesystem behavior", () => {
  test("preserves Glossary bytes and directory entries after a successful AI answer", async () => {
    const path = await writeGlossary("terms:\n  - term: API\n    definition: Application Programming Interface\n");
    const originalBytes = await readFile(path);
    const originalEntries = await readdir(dirname(path));
    const askAi = vi.fn<AskGlossaryAi>().mockResolvedValue("A grounded answer.");

    await expect(runAskGlossary(createOptions({ askAi, loadTerms: () => loadGlossary(path) }))).resolves.toEqual({
      answer: "A grounded answer.",
      status: "answered",
    });

    expect(await readFile(path)).toEqual(originalBytes);
    expect(await readdir(dirname(path))).toEqual(originalEntries);
  });

  test("preserves Glossary bytes and directory entries after an AI failure", async () => {
    const path = await writeGlossary("terms:\n  - term: API\n    definition: Application Programming Interface\n");
    const originalBytes = await readFile(path);
    const originalEntries = await readdir(dirname(path));
    const askAi = vi.fn<AskGlossaryAi>().mockRejectedValue(new Error("private AI detail"));

    await expect(runAskGlossary(createOptions({ askAi, loadTerms: () => loadGlossary(path) }))).resolves.toMatchObject({
      kind: "ai",
      status: "failed",
    });

    expect(await readFile(path)).toEqual(originalBytes);
    expect(await readdir(dirname(path))).toEqual(originalEntries);
  });
});
