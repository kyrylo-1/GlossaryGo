import { Action, ActionPanel, Form, Icon, openExtensionPreferences, showToast, Toast } from "@raycast/api";
import { useRef, useState, type ReactElement } from "react";

import { saveGlossaryChange } from "../glossary/save-glossary-change";
import type { Term } from "../utils/types";
import {
  getInitialTerm,
  runTermFormSubmission,
  type TermFormErrors,
  type TermFormValues,
  validateTermField,
} from "./term-form-logic";

export type TermFormProps = Readonly<{
  glossaryFile: string;
  onSaved: (term: Term) => Promise<void>;
}> &
  (
    | Readonly<{ initialTerm?: string; mode: "add" }>
    | Readonly<{ mode: "edit"; onReload: () => Promise<void>; original: Term }>
  );

const openPreferences = (): void => {
  openExtensionPreferences().catch(() => null);
};

const showSaveFailure = async (message: string): Promise<void> => {
  await showToast({
    message,
    primaryAction: { onAction: openPreferences, title: "Open Extension Preferences" },
    style: Toast.Style.Failure,
    title: "Could Not Save Term",
  });
};

const showPostSaveFailure = async (): Promise<void> => {
  await showToast({
    message: "The term was saved, but Search Term could not be refreshed. Reopen the command to reload it.",
    style: Toast.Style.Failure,
    title: "Term Saved",
  });
};

const showEditConflict = async (message: string, onReload: () => Promise<void>): Promise<void> => {
  await showToast({
    message: `${message} Current results must be reloaded before editing again. Your entered values remain in this form.`,
    primaryAction: {
      onAction: () => {
        onReload().catch(() => null);
      },
      title: "Reload Glossary",
    },
    style: Toast.Style.Failure,
    title: "Glossary Changed",
  });
};

type TermFormModel = Readonly<{
  definition: string;
  definitionError: string | null;
  handleSubmit: (values: TermFormValues) => Promise<boolean>;
  isSubmitting: boolean;
  onDefinitionChange: (value: string) => void;
  onTermChange: (value: string) => void;
  setDefinitionError: (error: string | null) => void;
  setTermError: (error: string | null) => void;
  term: string;
  termError: string | null;
}>;

type SubmitTermFormOptions = Readonly<{
  onErrors: (errors: TermFormErrors) => void;
  onSubmittingChange: (isSubmitting: boolean) => void;
  props: TermFormProps;
  submitting: { current: boolean };
  values: TermFormValues;
}>;

const submitTermForm = async (options: SubmitTermFormOptions): Promise<boolean> => {
  const { props } = options;
  return runTermFormSubmission({
    ...(props.mode === "edit" ? { original: props.original } : {}),
    glossaryFile: props.glossaryFile,
    mode: props.mode,
    onEditConflict: async (message: string): Promise<void> => {
      if (props.mode === "edit") {
        await showEditConflict(message, props.onReload);
      }
    },
    onErrors: options.onErrors,
    onPostSaveFailure: showPostSaveFailure,
    onSaveFailure: showSaveFailure,
    onSaveSuccess: async () => {
      await showToast({ style: Toast.Style.Success, title: props.mode === "add" ? "Term Added" : "Term Updated" });
    },
    onSaved: props.onSaved,
    onSubmittingChange: options.onSubmittingChange,
    saveChange: saveGlossaryChange,
    submitting: options.submitting,
    values: options.values,
  });
};

const useTermForm = (props: TermFormProps): TermFormModel => {
  const [term, setTerm] = useState(() => getInitialTerm(props).term);
  const [definition, setDefinition] = useState(() => getInitialTerm(props).definition);
  const [termError, setTermError] = useState<string | null>(null);
  const [definitionError, setDefinitionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const applyErrors = (errors: TermFormErrors): void => {
    setTermError(errors.term ?? null);
    setDefinitionError(errors.definition ?? null);
  };
  const handleSubmit = async (values: TermFormValues): Promise<boolean> => {
    return submitTermForm({
      onErrors: applyErrors,
      onSubmittingChange: setIsSubmitting,
      props,
      submitting,
      values,
    });
  };
  const onDefinitionChange = (value: string): void => {
    setDefinition(value);
    setDefinitionError(null);
  };
  const onTermChange = (value: string): void => {
    setTerm(value);
    setTermError(null);
  };
  return {
    definition,
    definitionError,
    handleSubmit,
    isSubmitting,
    onDefinitionChange,
    onTermChange,
    setDefinitionError,
    setTermError,
    term,
    termError,
  };
};

export const TermForm = (props: TermFormProps): ReactElement => {
  const model = useTermForm(props);

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm<TermFormValues>
            title={props.mode === "add" ? "Add Term" : "Update Term"}
            icon={props.mode === "add" ? Icon.Plus : Icon.Pencil}
            onSubmit={model.handleSubmit}
          />
        </ActionPanel>
      }
      enableDrafts={false}
      isLoading={model.isSubmitting}
      navigationTitle={props.mode === "add" ? "Add Term" : "Edit Term"}
    >
      <Form.TextField
        id="term"
        title="Term"
        value={model.term}
        onBlur={() => model.setTermError(validateTermField("term", model.term))}
        onChange={model.onTermChange}
        {...(model.termError === null ? {} : { error: model.termError })}
      />
      <Form.TextArea
        id="definition"
        title="Definition"
        value={model.definition}
        onBlur={() => model.setDefinitionError(validateTermField("definition", model.definition))}
        onChange={model.onDefinitionChange}
        {...(model.definitionError === null ? {} : { error: model.definitionError })}
      />
    </Form>
  );
};
