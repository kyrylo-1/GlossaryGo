import type { GlossaryChange } from "../glossary/apply-glossary-change";
import { GlossaryError } from "../glossary/glossary";
import type { Term } from "../utils/types";

type DeletionLock = { current: boolean };

type DeleteTermOptions = Readonly<{
  confirmDelete: (original: Term) => Promise<boolean>;
  deleting: DeletionLock;
  glossaryFile: string;
  onDeleteFailure: (message: string) => Promise<void>;
  onDeleteSuccess: () => Promise<void>;
  original: Term;
  reload: () => Promise<void>;
  saveChange: (path: string, change: GlossaryChange) => Promise<void>;
}>;

const deleteFailureMessage = "The term could not be deleted. Try again.";
const conflictMessages = {
  "file-changed": "The glossary changed while saving. Try again.",
  "stale-term": "The selected term changed or was removed. Reload the glossary and try again.",
} as const;

export const runDeleteTerm = async (options: DeleteTermOptions): Promise<boolean> => {
  if (options.deleting.current) {
    return false;
  }

  options.deleting.current = true;
  const original = {
    definition: options.original.definition,
    term: options.original.term,
  };
  let confirmed: boolean;
  try {
    confirmed = await options.confirmDelete(original);
  } catch {
    await options.onDeleteFailure(deleteFailureMessage).catch(() => null);
    options.deleting.current = false;
    return false;
  }
  if (!confirmed) {
    options.deleting.current = false;
    return false;
  }
  try {
    await options.saveChange(options.glossaryFile, { original, type: "delete" });
  } catch (error: unknown) {
    if (error instanceof GlossaryError && (error.code === "stale-term" || error.code === "file-changed")) {
      await options.onDeleteFailure(conflictMessages[error.code]).catch(() => null);
      await options.reload().catch(() => null);
      return false;
    }
    await options.onDeleteFailure(deleteFailureMessage).catch(() => null);
    options.deleting.current = false;
    return false;
  }
  await options.onDeleteSuccess().catch(() => null);
  await options.reload().catch(() => null);
  return true;
};
