import type { GlossaryChange } from "../glossary/apply-glossary-change";
import { GlossaryError } from "../glossary/glossary";
import type { SaveGlossaryChangeOptions } from "../glossary/save-glossary-change";
import type { Term } from "../utils/types";

export type TermFormField = "definition" | "term";

export type TermFormErrors = Readonly<Partial<Record<TermFormField, string>>>;

export type TermFormValues = Readonly<{
  definition: string;
  term: string;
}>;

export type TermFormValidation = Readonly<{
  errors: TermFormErrors;
  term?: Term;
}>;

type SubmissionLock = { current: boolean };

export type TermFormMode = Readonly<{ mode: "add"; initialTerm?: string }> | Readonly<{ mode: "edit"; original: Term }>;

type SubmissionMode = Readonly<{ mode: "add" }> | Readonly<{ mode: "edit"; original: Term }>;

type SubmissionCallbacks = Readonly<{
  onEditConflict: (message: string) => Promise<void>;
  onErrors: (errors: TermFormErrors) => void;
  onPostSaveFailure: () => Promise<void>;
  onSaved: (term: Term) => Promise<void>;
  onSaveFailure: (message: string) => Promise<void>;
  onSaveSuccess: (term: Term) => Promise<void>;
  onSubmittingChange: (isSubmitting: boolean) => void;
}>;

type SubmissionDependencies = Readonly<{
  createParent?: boolean;
  glossaryFile: string;
  saveChange: (path: string, change: GlossaryChange, options?: SaveGlossaryChangeOptions) => Promise<void>;
  submitting: SubmissionLock;
  values: TermFormValues;
}>;

type SubmitTermFormOptions = SubmissionCallbacks & SubmissionDependencies & SubmissionMode;

const validationMessages: Readonly<Record<TermFormField, string>> = {
  definition: "Definition must contain non-whitespace text.",
  term: "Term must contain non-whitespace text.",
};

const unknownSaveErrorMessage = "The glossary file could not be saved. Try again.";

export const getInitialTerm = (mode: TermFormMode): Term => {
  return mode.mode === "add"
    ? { definition: "", term: mode.initialTerm ?? "" }
    : { definition: mode.original.definition, term: mode.original.term };
};

export const validateTermField = (field: TermFormField, value: string): string | null => {
  return value.trim().length === 0 ? validationMessages[field] : null;
};

export const validateTermForm = (values: TermFormValues): TermFormValidation => {
  const definitionError = validateTermField("definition", values.definition);
  const termError = validateTermField("term", values.term);
  const errors: Partial<Record<TermFormField, string>> = {};
  if (definitionError !== null) {
    errors.definition = definitionError;
  }
  if (termError !== null) {
    errors.term = termError;
  }
  if (definitionError !== null || termError !== null) {
    return { errors };
  }
  return { errors, term: { definition: values.definition, term: values.term.trim() } };
};

const createChange = (options: SubmitTermFormOptions, term: Term): GlossaryChange => {
  return options.mode === "add" ? { term, type: "add" } : { original: options.original, term, type: "edit" };
};

const handleSaveFailure = async (options: SubmitTermFormOptions, error: unknown): Promise<void> => {
  if (error instanceof GlossaryError && error.code === "duplicate-term") {
    options.onErrors({ term: error.message });
    return;
  }
  if (
    options.mode === "edit" &&
    error instanceof GlossaryError &&
    (error.code === "stale-term" || error.code === "file-changed")
  ) {
    await options.onEditConflict(error.message);
    return;
  }
  await options.onSaveFailure(error instanceof GlossaryError ? error.message : unknownSaveErrorMessage);
};

export const runTermFormSubmission = async (options: SubmitTermFormOptions): Promise<boolean> => {
  if (options.submitting.current) {
    return false;
  }
  const validation = validateTermForm(options.values);
  options.onErrors(validation.errors);
  if (!("term" in validation)) {
    return false;
  }

  options.submitting.current = true;
  options.onSubmittingChange(true);
  try {
    const change = createChange(options, validation.term);
    if (options.mode === "add" && options.createParent === true) {
      await options.saveChange(options.glossaryFile, change, { createParent: true });
    } else {
      await options.saveChange(options.glossaryFile, change);
    }
  } catch (error: unknown) {
    try {
      await handleSaveFailure(options, error);
    } finally {
      options.submitting.current = false;
      options.onSubmittingChange(false);
    }
    return false;
  }

  await options.onSaveSuccess(validation.term).catch(() => null);
  try {
    await options.onSaved(validation.term);
  } catch {
    await options.onPostSaveFailure();
    return true;
  }
  return true;
};
