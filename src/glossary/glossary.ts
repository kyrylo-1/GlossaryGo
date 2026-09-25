import { GLOSSARY_FILE_EXTENSION } from "../constants";
import { GlossaryError } from "./glossary-error";
import { readGlossarySource } from "./glossary-file";
import { throwIfGlossaryLoadCancelled } from "./glossary-load-cancellation";
import { parseValidatedGlossarySource } from "./validated-glossary-source";
import type { Term } from "../utils/types";

export const parseGlossarySource = (source: string): readonly Term[] => {
  return parseValidatedGlossarySource(source).terms;
};

export { GlossaryError } from "./glossary-error";
export type { GlossaryErrorCode } from "./glossary-error";

export const loadGlossarySource = async (path: string, signal?: AbortSignal): Promise<string> => {
  throwIfGlossaryLoadCancelled(signal);
  if (!path.endsWith(GLOSSARY_FILE_EXTENSION)) {
    throw new GlossaryError("invalid-extension", `Choose a file with the ${GLOSSARY_FILE_EXTENSION} extension.`);
  }

  const source = await readGlossarySource(path, signal);
  throwIfGlossaryLoadCancelled(signal);
  return source;
};

export const loadGlossary = async (path: string, signal?: AbortSignal): Promise<readonly Term[]> => {
  throwIfGlossaryLoadCancelled(signal);
  const source = await loadGlossarySource(path, signal);
  throwIfGlossaryLoadCancelled(signal);
  return parseGlossarySource(source);
};
