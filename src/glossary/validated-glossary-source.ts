import { LineCounter } from "yaml";

import { parseGlossaryTerms } from "./glossary-schema";
import type { ParsedGlossaryDocument } from "./glossary-types";
import { parseGlossaryDocument, rejectUnsupportedYaml } from "./glossary-yaml";
import type { Term } from "../utils/types";

type ValidatedGlossarySource = Readonly<{
  document: ParsedGlossaryDocument;
  terms: readonly Term[];
}>;

export const parseValidatedGlossarySource = (source: string): ValidatedGlossarySource => {
  const lineCounter = new LineCounter();
  const document = parseGlossaryDocument(source, lineCounter);
  rejectUnsupportedYaml(source, document, lineCounter);
  const terms = parseGlossaryTerms(document, lineCounter);
  return Object.freeze({ document, terms });
};
