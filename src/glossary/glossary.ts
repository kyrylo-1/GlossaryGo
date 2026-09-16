import { LineCounter } from "yaml";

import { GLOSSARY_FILE_EXTENSION } from "../constants";
import { GlossaryError } from "./glossary-error";
import { readGlossarySource } from "./glossary-file";
import { parseGlossaryTerms } from "./glossary-schema";
import { parseGlossaryDocument, rejectUnsupportedYaml } from "./glossary-yaml";
import type { Term } from "../utils/types";

export const parseGlossarySource = (source: string): readonly Term[] => {
  const lineCounter = new LineCounter();
  const document = parseGlossaryDocument(source, lineCounter);
  rejectUnsupportedYaml(source, document, lineCounter);
  return parseGlossaryTerms(document, lineCounter);
};

export { GlossaryError } from "./glossary-error";
export type { GlossaryErrorCode } from "./glossary-error";

export const loadGlossary = async (path: string): Promise<readonly Term[]> => {
  if (!path.endsWith(GLOSSARY_FILE_EXTENSION)) {
    throw new GlossaryError("invalid-extension", `Choose a file with the ${GLOSSARY_FILE_EXTENSION} extension.`);
  }

  const source = await readGlossarySource(path);
  return parseGlossarySource(source);
};
