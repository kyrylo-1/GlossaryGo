import { LocalStorage } from "@raycast/api";

import { loadGlossary } from "./glossary";
import { throwIfGlossaryLoadCancelled } from "./glossary-load-cancellation";

const selectedFileKey = "selected-glossary-file";

export const getSelectedGlossaryFile = (): Promise<string | undefined> => LocalStorage.getItem<string>(selectedFileKey);

export const selectGlossaryFile = async (path: string, signal?: AbortSignal): Promise<void> => {
  await loadGlossary(path, signal);
  throwIfGlossaryLoadCancelled(signal);
  await LocalStorage.setItem(selectedFileKey, path);
};
