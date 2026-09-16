import { describe, expect, test } from "vitest";

import { rememberTerm, resolveRecentTerms } from "./recent-terms";

describe("memory-only recent terms", () => {
  test("moves repeated equivalent names to the front without duplicates", () => {
    expect(rememberTerm(["Zulu", "éclair", "Alpha"], "E\u0301CLAIR")).toEqual(["E\u0301CLAIR", "Zulu", "Alpha"]);
  });

  test("evicts the least recently used name at capacity and retains a reused older name", () => {
    let history: readonly string[] = [];
    for (let index = 1; index <= 20; index += 1) {
      history = rememberTerm(history, `Term ${index}`);
    }
    history = rememberTerm(history, "Term 1");
    history = rememberTerm(history, "Term 21");
    expect(history).toHaveLength(20);
    expect(history.slice(0, 3)).toEqual(["Term 21", "Term 1", "Term 20"]);
    expect(history).not.toContain("Term 2");
    expect(history.at(-1)).toBe("Term 3");
  });

  test("prunes absent names and resolves equivalent names to current definitions", () => {
    expect(resolveRecentTerms(["Deleted", "E\u0301CLAIR"], [{ definition: "Updated", term: "éclair" }])).toEqual([
      { definition: "Updated", term: "éclair" },
    ]);
  });
});
