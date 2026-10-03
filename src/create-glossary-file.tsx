import { Action, ActionPanel, closeMainWindow, Detail, Form, Icon } from "@raycast/api";
import { useEffect, useRef, useState, type ReactElement } from "react";

import { loadGlossary } from "./glossary/glossary";
import { GlossaryError } from "./glossary/glossary-error";
import { selectGlossaryFile } from "./glossary/select-glossary-file";
import { renderPlainTextAsMarkdown } from "./utils/render-plain-text-as-markdown";

const selectionError = (error: unknown): string =>
  error instanceof GlossaryError
    ? `${error.message} Choose another existing YAML glossary file or repair this file and select it again.`
    : "Could not activate this file. Your active glossary is unchanged. Try again.";

const closeCommand = (): void => {
  closeMainWindow().catch(() => null);
};

// Retain the command ID so existing Raycast aliases continue to open the replacement flow.
// eslint-disable-next-line max-lines-per-function
export default function Command(): ReactElement {
  const [path, setPath] = useState("");
  const [error, setError] = useState("");
  const [termCount, setTermCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const activating = useRef(false);

  useEffect(() => (): void => pending.current?.abort(), []);

  const chooseFile = (paths: string[]): void => {
    if (activating.current) {
      return;
    }
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const candidate = paths[0] ?? "";
    setPath(candidate);
    setError("");
    setTermCount(null);
    setIsLoading(candidate !== "");
    if (!candidate) {
      return;
    }
    loadGlossary(candidate, controller.signal)
      .then((terms) => {
        if (!controller.signal.aborted) {
          setTermCount(terms.length);
          setIsLoading(false);
        }
        return null;
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(selectionError(failure));
          setIsLoading(false);
        }
      });
  };

  const activate = async (): Promise<void> => {
    if (isLoading || activating.current) {
      return;
    }
    if (!path || termCount === null) {
      setError("Select a valid existing .yaml or .yml glossary file first.");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    activating.current = true;
    setIsLoading(true);
    try {
      await selectGlossaryFile(path, controller.signal);
      if (!controller.signal.aborted) {
        setSelectedPath(path);
      }
    } catch (failure: unknown) {
      if (!controller.signal.aborted) {
        setError(selectionError(failure));
        setTermCount(null);
      }
    } finally {
      activating.current = false;
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  if (selectedPath !== null) {
    return (
      <Detail
        actions={
          <ActionPanel>
            <Action title="Done" icon={Icon.Checkmark} onAction={closeCommand} />
          </ActionPanel>
        }
        markdown={`# Glossary File Selected\n\n${renderPlainTextAsMarkdown(selectedPath)}\n\nSearch Term, Add Term, Quick Add Term, Ask Glossary, and file actions will use this file the next time they open.`}
        navigationTitle="Glossary File Selected"
      />
    );
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Use This Glossary" icon={Icon.Document} onSubmit={activate} />
        </ActionPanel>
      }
      enableDrafts={false}
      isLoading={isLoading}
      navigationTitle="Select Glossary File"
    >
      <Form.FilePicker
        id="glossary-file"
        title="Glossary File"
        canChooseFiles
        canChooseDirectories={false}
        allowMultipleSelection={false}
        value={path ? [path] : []}
        error={error}
        onChange={chooseFile}
      />
      <Form.Description text="Select an existing .yaml or .yml file with any filename. The file is validated locally and is never changed during selection." />
      <Form.Description
        text={
          termCount === null
            ? "Your active glossary stays unchanged until you choose Use This Glossary."
            : `Valid glossary: ${termCount} term${termCount === 1 ? "" : "s"}. Choose Use This Glossary to activate it.`
        }
      />
    </Form>
  );
}
