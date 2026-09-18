import { describe, expect, test } from "vitest";

import { parseGlossarySource } from "../glossary/glossary";
import type { Term } from "../utils/types";
import { rememberTerm, resolveRecentTerms } from "./recent-terms";

const source = (entries: readonly Term[]): string => `terms: ${JSON.stringify(entries)}\n`;
const twins = [
  { definition: "Same", term: "API" },
  { definition: "Same", term: "API" },
];

// Independent entry history behaviors share synthetic parse helpers.
// eslint-disable-next-line max-lines-per-function
describe("memory-only recent entries", () => {
  test("keeps identical sibling history independent and moves only the reused entry", () => {
    const entries = parseGlossarySource(source(twins));
    const history = rememberTerm(rememberTerm([], entries[0]), entries[1]);
    expect(history).toEqual([entries[1], entries[0]]);
    expect(rememberTerm(history, entries[0])).toEqual([entries[0], entries[1]]);
    const reloaded = parseGlossarySource(source(twins));
    expect(resolveRecentTerms(history, reloaded)[0]).toBe(reloaded[1]);
    expect(resolveRecentTerms(history, reloaded)[1]).toBe(reloaded[0]);
  });

  test("evicts the least recently used entry at capacity", () => {
    const entries = parseGlossarySource(
      source(Array.from({ length: 21 }, (_, index) => ({ definition: "Same", term: `Term ${index}` }))),
    );
    let history: readonly Term[] = [];
    for (const entry of entries.slice(0, 20)) {
      history = rememberTerm(history, entry);
    }
    history = rememberTerm(history, entries[0]);
    history = rememberTerm(history, entries[20]);
    expect(history).toHaveLength(20);
    expect(history.slice(0, 2)).toEqual([entries[20], entries[0]]);
    expect(history).not.toContain(entries[1]);
  });

  test("reconciles unique siblings across sorting while pruning indistinguishable survival", () => {
    const entries = parseGlossarySource(
      source([
        { definition: "First", term: "API" },
        { definition: "Second", term: "API" },
      ]),
    );
    const sorted = parseGlossarySource(source([{ definition: "New", term: "AAA" }, ...entries]));
    expect(resolveRecentTerms([entries[1]], sorted)[0]).toBe(sorted[2]);
    const identical = parseGlossarySource(source(twins));
    expect(resolveRecentTerms([identical[1]], parseGlossarySource(source([twins[0]])))).toEqual([]);
    expect(resolveRecentTerms([identical[1]], parseGlossarySource(`# changed\n${source(twins)}`))).toEqual([]);
  });

  test("retains equivalent singleton renames and definition changes but never substitutes a sibling", () => {
    const before = parseGlossarySource(source([{ definition: "Old", term: "éclair" }]));
    const after = parseGlossarySource(source([{ definition: "Updated", term: "E\u0301CLAIR" }]));
    expect(resolveRecentTerms(before, after)).toEqual(after);
    const siblings = parseGlossarySource(
      source([
        { definition: "First", term: "API" },
        { definition: "Second", term: "API" },
      ]),
    );
    expect(resolveRecentTerms([siblings[0]], parseGlossarySource(source([siblings[1]])))).toEqual([]);
  });
});
