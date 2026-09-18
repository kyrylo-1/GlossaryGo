import { isMap, isScalar, isSeq, type YAMLSeq } from "yaml";

import { MAXIMUM_GLOSSARY_BYTES } from "../constants";
import type { Term } from "../utils/types";
import { GlossaryError } from "./glossary-error";
import { areTermsEquivalent } from "./term-matching";
import { compareTermNames } from "./term-name-order";
import { parseValidatedGlossarySource } from "./validated-glossary-source";

export type GlossaryChange =
  | Readonly<{ term: Term; type: "add" }>
  | Readonly<{ original: Term; term: Term; type: "edit" }>
  | Readonly<{ original: Term; type: "delete" }>;

const normalizeTerm = (term: Term): Term => {
  const normalizedTerm = { definition: term.definition, term: term.term.trim() };
  if (normalizedTerm.term.length === 0 || normalizedTerm.definition.trim().length === 0) {
    throw new GlossaryError("invalid-schema", "Term and definition must contain non-whitespace text.");
  }
  return normalizedTerm;
};

const sortTermsSequence = (sequence: YAMLSeq, terms: readonly Term[]): void => {
  sequence.items = sequence.items
    .map((node, index) => ({ name: terms[index].term, node }))
    .sort((left, right) => compareTermNames(left.name, right.name))
    .map(({ node }) => node);
};

export const applyGlossaryChange = (source: string, change: GlossaryChange): string => {
  const { document, terms } = parseValidatedGlossarySource(source);
  const sequence = document.get("terms", true);
  if (!isSeq(sequence)) {
    throw new GlossaryError("invalid-schema", "The glossary terms field must be a sequence.");
  }

  if (change.type === "add") {
    const term = normalizeTerm(change.term);
    document.addIn(["terms"], document.createNode(term));
    sortTermsSequence(sequence, [...terms, term]);
  } else {
    const index = terms.findIndex((term) => areTermsEquivalent(term.term, change.original.term));
    if (
      index === -1 ||
      terms[index].term !== change.original.term ||
      terms[index].definition !== change.original.definition
    ) {
      throw new GlossaryError(
        "stale-term",
        "The selected term changed or was removed. Reload the glossary and try again.",
      );
    }
    if (change.type === "delete") {
      sequence.delete(index);
    } else {
      const entry = sequence.items[index];
      const normalizedTerm = normalizeTerm(change.term);
      if (!isMap(entry)) {
        throw new GlossaryError("invalid-schema", "The selected term must have string fields.");
      }
      const termScalar = entry.get("term", true);
      const definitionScalar = entry.get("definition", true);
      if (!isScalar(termScalar) || !isScalar(definitionScalar)) {
        throw new GlossaryError("invalid-schema", "The selected term must have string fields.");
      }
      termScalar.value = normalizedTerm.term;
      definitionScalar.value = normalizedTerm.definition;
    }
  }

  const nextSource = document.toString();
  if (Buffer.byteLength(nextSource, "utf8") > MAXIMUM_GLOSSARY_BYTES) {
    throw new GlossaryError("too-large", "The glossary file is larger than 5 MiB.");
  }
  parseValidatedGlossarySource(nextSource);
  return nextSource;
};
