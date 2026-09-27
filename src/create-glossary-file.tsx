import { join } from "node:path";

import {
  Action,
  ActionPanel,
  Alert,
  closeMainWindow,
  confirmAlert,
  Detail,
  Form,
  Icon,
  openExtensionPreferences,
  showInFinder,
  showToast,
  Toast,
} from "@raycast/api";
import { useRef, useState, type ReactElement } from "react";

import { validateTermForm } from "./components/term-form-logic";
import { createGlossaryFile } from "./glossary/create-glossary-file";
import { GlossaryError } from "./glossary/glossary-error";
import { renderPlainTextAsMarkdown } from "./utils/render-plain-text-as-markdown";
import type { Term } from "./utils/types";

type InitialTerm = Readonly<Term & { id: number }>;
type InitialTermErrors = Readonly<{ definition?: string; term?: string }>;

const closeCommand = (): void => {
  closeMainWindow().catch(() => null);
};

const openPreferences = (): void => {
  openExtensionPreferences().catch(() => null);
};

// This form keeps its folder, repeatable rows, confirmation, and result in one command session.
// eslint-disable-next-line max-lines-per-function
export default function Command(): ReactElement {
  const [directory, setDirectory] = useState("");
  const [directoryError, setDirectoryError] = useState("");
  const [terms, setTerms] = useState<InitialTerm[]>([]);
  const [termErrors, setTermErrors] = useState<Record<number, InitialTermErrors>>({});
  const [createdPath, setCreatedPath] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const nextId = useRef(0);
  const creating = useRef(false);

  const addTerm = (): void => {
    const id = nextId.current++;
    setTerms((current) => [...current, { definition: "", id, term: "" }]);
  };

  const updateTerm = (id: number, field: "definition" | "term", value: string): void => {
    setTerms((current) => current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)));
    setTermErrors((current) => ({ ...current, [id]: { ...current[id], [field]: "" } }));
  };

  const reviewAndCreate = async (): Promise<void> => {
    if (creating.current) {
      return;
    }
    if (!directory) {
      setDirectoryError("Choose an existing folder.");
      return;
    }
    const validations = terms.map(({ definition, term }) => validateTermForm({ definition, term }));
    const errors = Object.fromEntries(validations.map((validation, index) => [terms[index].id, validation.errors]));
    setTermErrors(errors);
    if (validations.some((validation) => !validation.term)) {
      return;
    }
    const initialTerms = validations.map((validation) => validation.term as Term);
    creating.current = true;
    try {
      const confirmed = await confirmAlert({
        dismissAction: { style: Alert.ActionStyle.Cancel, title: "Cancel" },
        message: `Create ${join(directory, "glossary.yaml")} with ${initialTerms.length} initial term${initialTerms.length === 1 ? "" : "s"}? This will not change the active Glossary Location preference.`,
        primaryAction: { title: "Create Glossary File" },
        title: "Create Glossary File?",
      });
      if (!confirmed) {
        return;
      }
      setIsCreating(true);
      const path = await createGlossaryFile(directory, initialTerms);
      setCreatedPath(path);
    } catch (error: unknown) {
      await showToast({
        message: error instanceof GlossaryError ? error.message : "Check the folder and try again.",
        style: Toast.Style.Failure,
        title: "Could Not Create Glossary File",
      });
    } finally {
      creating.current = false;
      setIsCreating(false);
    }
  };

  if (createdPath !== null) {
    return (
      <Detail
        actions={
          <ActionPanel>
            <Action
              title="Reveal Glossary in Finder"
              icon={Icon.Finder}
              onAction={() => {
                showInFinder(createdPath).catch(() =>
                  showToast({
                    message:
                      "Finder could not reveal the new file. Open the folder shown above and select glossary.yaml.",
                    style: Toast.Style.Failure,
                    title: "Could Not Reveal Glossary File",
                  }).catch(() => null),
                );
              }}
            />
            <Action title="Open Extension Preferences" onAction={openPreferences} />
            <Action title="Done" icon={Icon.Checkmark} onAction={closeCommand} />
          </ActionPanel>
        }
        markdown={`# Glossary File Created\n\n${renderPlainTextAsMarkdown(createdPath)}\n\nTo use this file in Search Term and other commands, select its folder in the shared Glossary Location preference.`}
        navigationTitle="Glossary File Created"
      />
    );
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Review and Create" icon={Icon.Document} onSubmit={reviewAndCreate} />
          <Action title="Add Initial Term" icon={Icon.Plus} onAction={addTerm} />
          {terms.length > 0 ? (
            <Action title="Remove Last Initial Term" onAction={() => setTerms((current) => current.slice(0, -1))} />
          ) : null}
        </ActionPanel>
      }
      enableDrafts={false}
      isLoading={isCreating}
      navigationTitle="Create Glossary File"
    >
      <Form.FilePicker
        id="directory"
        title="Folder"
        canChooseFiles={false}
        canChooseDirectories
        allowMultipleSelection={false}
        value={directory ? [directory] : []}
        error={directoryError}
        onChange={(selected) => {
          setDirectory(selected[0] ?? "");
          setDirectoryError("");
        }}
      />
      <Form.Description
        title="Glossary File"
        text={directory ? join(directory, "glossary.yaml") : "Choose an existing folder."}
      />
      <Form.Description text="Initial terms are optional. Add each term and definition before creating the file." />
      {terms.flatMap((entry, index) => [
        <Form.TextField
          id={`term-${entry.id}`}
          key={`term-${entry.id}`}
          title={`Term ${index + 1}`}
          value={entry.term}
          error={termErrors[entry.id]?.term}
          onChange={(value) => updateTerm(entry.id, "term", value)}
        />,
        <Form.TextArea
          id={`definition-${entry.id}`}
          key={`definition-${entry.id}`}
          title={`Definition ${index + 1}`}
          value={entry.definition}
          error={termErrors[entry.id]?.definition}
          onChange={(value) => updateTerm(entry.id, "definition", value)}
        />,
      ])}
    </Form>
  );
}
