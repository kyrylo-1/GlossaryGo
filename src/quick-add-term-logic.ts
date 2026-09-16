import type { GlossaryChange } from "./glossary/apply-glossary-change";
import { GlossaryError } from "./glossary/glossary-error";
import type { GlossaryTarget } from "./glossary/glossary-target";
import type { SaveGlossaryChangeOptions } from "./glossary/save-glossary-change";
import { validateTermForm, type TermFormValues } from "./components/term-form-logic";

export type QuickAddTermArguments = TermFormValues;

export type QuickAddTermFailure = Readonly<{
  kind: "save" | "validation";
  message: string;
}>;

type QuickAddTermOptions = Readonly<{
  arguments: QuickAddTermArguments;
  glossaryTarget: GlossaryTarget;
  onFailure: (failure: QuickAddTermFailure) => Promise<void>;
  onSuccess: () => Promise<void>;
  saveChange: (path: string, change: GlossaryChange, options?: SaveGlossaryChangeOptions) => Promise<void>;
}>;

const unknownSaveErrorMessage = "The glossary file could not be saved. Try again.";

export const runQuickAddTerm = async (options: QuickAddTermOptions): Promise<boolean> => {
  const validation = validateTermForm(options.arguments);
  if (!("term" in validation)) {
    await options.onFailure({
      kind: "validation",
      message: validation.errors.term ?? validation.errors.definition ?? unknownSaveErrorMessage,
    });
    return false;
  }

  try {
    const change: GlossaryChange = { term: validation.term, type: "add" };
    if (options.glossaryTarget.createParent) {
      await options.saveChange(options.glossaryTarget.path, change, { createParent: true });
    } else {
      await options.saveChange(options.glossaryTarget.path, change);
    }
  } catch (error: unknown) {
    await options.onFailure({
      kind: "save",
      message: error instanceof GlossaryError ? error.message : unknownSaveErrorMessage,
    });
    return false;
  }

  await options.onSuccess();
  return true;
};
