import { Action, ActionPanel, AI, Alert, confirmAlert, Detail, environment, Form } from "@raycast/api";
import { useEffect, useRef, useState, type ReactElement } from "react";

import { runAskGlossary, type AskGlossaryAi } from "./ask-glossary-logic";
import { getGlossaryTarget } from "./glossary/get-glossary-target";
import { loadGlossary } from "./glossary/glossary";
import { prepareMarkdownForDisplay } from "./utils/prepare-markdown-for-display";
import type { Term } from "./utils/types";

const disclosureMessage =
  "If processing proceeds, your question and every term and definition in the Glossary are sent to Raycast AI. Glossaries over the 32 KiB context limit are refused and not sent.";

export type AskGlossaryCommandDependencies = Readonly<{
  askAi: AskGlossaryAi;
  canAccessAi: () => boolean;
  confirmDisclosure: () => Promise<boolean>;
  loadTerms: () => Promise<readonly Term[]>;
}>;

type View =
  | Readonly<{ status: "question" }>
  | Readonly<{ answer: string; status: "loading"; token: number }>
  | Readonly<{ answer: string; status: "answered" }>
  | Readonly<{ message: string; question: string; status: "failure" }>;

// The request lifecycle stays in one component so its refs share one mounted-session boundary.
// eslint-disable-next-line max-lines-per-function
export const AskGlossaryCommand = ({
  dependencies,
}: Readonly<{ dependencies: AskGlossaryCommandDependencies }>): ReactElement => {
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<View>({ status: "question" });
  const acknowledged = useRef(false);
  const submitting = useRef(false);
  const requestToken = useRef(0);
  const activeController = useRef<AbortController | null>(null);

  useEffect((): (() => void) => {
    return (): void => {
      requestToken.current += 1;
      activeController.current?.abort();
      activeController.current = null;
    };
  }, []);

  const returnToQuestion = (value: string): void => {
    requestToken.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    submitting.current = false;
    setQuestion(value);
    setError("");
    setView({ status: "question" });
  };

  // The guard spans confirmation, loading, and AI completion.
  // eslint-disable-next-line max-lines-per-function
  const askQuestion = async (): Promise<void> => {
    if (submitting.current) {
      return;
    }
    if (question.trim().length === 0) {
      setError("Enter a question.");
      return;
    }
    submitting.current = true;
    const token = ++requestToken.current;
    if (!acknowledged.current) {
      if (!(await dependencies.confirmDisclosure())) {
        submitting.current = false;
        return;
      }
      if (requestToken.current !== token) {
        return;
      }
      acknowledged.current = true;
    }

    const controller = new AbortController();
    activeController.current = controller;
    setView({ answer: "", status: "loading", token });
    const outcome = await runAskGlossary({
      askAi: dependencies.askAi,
      canAccessAi: dependencies.canAccessAi,
      loadTerms: dependencies.loadTerms,
      onData: (chunk) => {
        if (requestToken.current === token && !controller.signal.aborted) {
          setView((current) =>
            current.status === "loading" && current.token === token
              ? { answer: current.answer + chunk, status: "loading", token }
              : current,
          );
        }
      },
      question,
      signal: controller.signal,
    });
    if (requestToken.current !== token || controller.signal.aborted) {
      return;
    }
    activeController.current = null;
    submitting.current = false;
    if (outcome.status === "answered") {
      setView({ answer: outcome.answer, status: "answered" });
    } else if (outcome.status === "failed") {
      setView({ message: outcome.message, question, status: "failure" });
    }
  };

  if (view.status !== "question") {
    return (
      <Detail
        isLoading={view.status === "loading"}
        markdown={view.status === "failure" ? view.message : prepareMarkdownForDisplay(view.answer)}
        navigationTitle="Ask Glossary"
        actions={
          <ActionPanel>
            {view.status === "failure" ? (
              <Action title="Edit Question" onAction={() => returnToQuestion(view.question)} />
            ) : null}
            <Action title="Ask Another Question" onAction={() => returnToQuestion("")} />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Ask Glossary" onSubmit={() => askQuestion()} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="question"
        title="Question"
        value={question}
        error={error}
        onChange={(value) => {
          setQuestion(value);
          setError("");
        }}
      />
      <Form.Description text={`${disclosureMessage} Opening this command alone sends nothing.`} />
    </Form>
  );
};

export default function Command(): ReactElement {
  const askAi: AskGlossaryAi = async (prompt, { onData, signal }) => {
    const stream = AI.ask(prompt, { creativity: "none", signal });
    stream.on("data", onData);
    return stream;
  };

  return (
    <AskGlossaryCommand
      dependencies={{
        askAi,
        canAccessAi: () => environment.canAccess(AI),
        confirmDisclosure: () =>
          confirmAlert({
            dismissAction: { style: Alert.ActionStyle.Cancel, title: "Cancel" },
            message: disclosureMessage,
            primaryAction: { title: "Send to Raycast AI" },
            title: "Send to Raycast AI?",
          }),
        loadTerms: () => loadGlossary(getGlossaryTarget().path),
      }}
    />
  );
}
