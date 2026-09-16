import { describe, expect, test } from "vitest";

import { applyGlossaryChange } from "./apply-glossary-change";
import { parseGlossarySource, type GlossaryErrorCode } from "./glossary";

type ExpectedGlossaryError = Readonly<{
  code: GlossaryErrorCode;
  line: number;
  message: string;
}>;

const validationCases: ReadonlyArray<readonly [string, string, ExpectedGlossaryError]> = [
  [
    "malformed YAML before an unsupported directive",
    "%YAML 1.2\n---\nterms: [}\n",
    { code: "invalid-yaml", line: 3, message: "The glossary contains invalid YAML near line 3." },
  ],
  [
    "multiple documents before an unsupported anchor",
    "terms: &terms []\n---\nterms: []\n",
    {
      code: "multiple-documents",
      line: 2,
      message: "The glossary must contain exactly one YAML document near line 2.",
    },
  ],
  [
    "an unsupported construct before an invalid root schema",
    "terms: &terms {}\n",
    {
      code: "unsupported-yaml",
      line: 1,
      message: "The glossary uses an unsupported YAML construct near line 1.",
    },
  ],
  [
    "an invalid root before invalid entries",
    "version: 1\nterms:\n  - API\n",
    {
      code: "invalid-schema",
      line: 1,
      message: "The glossary root must contain exactly one terms sequence near line 1.",
    },
  ],
  [
    "an invalid entry before a later duplicate",
    "terms:\n  - term: API\n  - term: API\n    definition: Duplicate\n",
    {
      code: "invalid-schema",
      line: 2,
      message: "Entry 1 must contain exactly the term and definition fields near line 2.",
    },
  ],
  [
    "duplicate terms after schema validation",
    "terms:\n  - term: API\n    definition: First\n  - term: api\n    definition: Second\n",
    { code: "duplicate-term", line: 4, message: "Entry 2 duplicates another term near line 4." },
  ],
];

describe("Glossary source validation parity", () => {
  test.each(validationCases)("parseGlossarySource reports %s", (_label, source, expected) => {
    expect(() => parseGlossarySource(source)).toThrowError(expect.objectContaining(expected));
  });

  test.each(validationCases)("applyGlossaryChange reports %s", (_label, source, expected) => {
    expect(() =>
      applyGlossaryChange(source, { term: { definition: "Synthetic definition", term: "Synthetic" }, type: "add" }),
    ).toThrowError(expect.objectContaining(expected));
  });
});
