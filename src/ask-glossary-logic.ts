import { buildAskGlossaryPrompt, MAX_ASK_QUESTION_CHARACTERS } from "./ask-glossary-context";
import { GlossaryError } from "./glossary/glossary-error";
import type { Term } from "./utils/types";

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

const failureMessages = {
  access: "Raycast AI access is unavailable. Check Raycast AI settings and try again.",
  ai: "Raycast AI could not answer this question. Try again.",
  context: "The glossary context exceeds the 32 KiB limit. Reduce the glossary size and try again.",
  emptyGlossary: "The glossary is empty. Add terms before asking a question.",
  emptyQuestion: "Enter a question.",
  questionTooLong: `Questions must be ${MAX_ASK_QUESTION_CHARACTERS.toLocaleString("en-US")} characters or fewer.`,
  unknownGlossary: "The glossary could not be loaded. Try again.",
} as const;

const failed = (kind: "access" | "ai" | "context" | "glossary" | "question", message: string): AskGlossaryOutcome => ({
  kind,
  message,
  status: "failed",
});

const promptFailure = (
  reason: "context-too-large" | "empty-glossary" | "empty-question" | "question-too-long",
): AskGlossaryOutcome => {
  switch (reason) {
    case "context-too-large": {
      return failed("context", failureMessages.context);
    }
    case "empty-glossary": {
      return failed("glossary", failureMessages.emptyGlossary);
    }
    case "empty-question": {
      return failed("question", failureMessages.emptyQuestion);
    }
    case "question-too-long": {
      return failed("question", failureMessages.questionTooLong);
    }
  }
};

export const runAskGlossary = async (options: RunAskGlossaryOptions): Promise<AskGlossaryOutcome> => {
  if (options.signal.aborted) {
    return { status: "cancelled" };
  }

  const questionCheck = buildAskGlossaryPrompt(options.question, []);
  if (questionCheck.status === "rejected" && questionCheck.reason !== "empty-glossary") {
    const isEmpty = questionCheck.reason === "empty-question";
    return failed("question", isEmpty ? failureMessages.emptyQuestion : failureMessages.questionTooLong);
  }

  if (!options.canAccessAi()) {
    return failed("access", failureMessages.access);
  }

  let terms: readonly Term[];
  try {
    terms = await options.loadTerms();
  } catch (error: unknown) {
    if (options.signal.aborted) {
      return { status: "cancelled" };
    }

    return failed("glossary", error instanceof GlossaryError ? error.message : failureMessages.unknownGlossary);
  }

  if (options.signal.aborted) {
    return { status: "cancelled" };
  }

  const promptResult = buildAskGlossaryPrompt(options.question, terms);
  if (promptResult.status === "rejected") {
    return promptFailure(promptResult.reason);
  }

  try {
    const answer = await options.askAi(promptResult.prompt, {
      onData: options.onData,
      signal: options.signal,
    });
    return options.signal.aborted ? { status: "cancelled" } : { answer, status: "answered" };
  } catch {
    return options.signal.aborted ? { status: "cancelled" } : failed("ai", failureMessages.ai);
  }
};
