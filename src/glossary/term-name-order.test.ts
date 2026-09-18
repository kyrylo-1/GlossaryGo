import { describe, expect, test } from "vitest";

import { compareTermNames } from "./term-name-order";

describe("deterministic saved term-name order", () => {
  test.each([
    ["case-insensitive primary order", "alpha", "Beta", -1],
    ["accent-distinct ordinal order", "Zulu", "Ångström", -1],
    ["normalized primary order", "e\u0301clair", "Zulu", 1],
    ["case tie resolved by normalized original names", "API", "api", -1],
    ["canonical tie resolved by original names", "cafe\u0301", "café", -1],
    ["case and canonical tie", "Éclair", "e\u0301clair", -1],
    ["identical names", "API", "API", 0],
  ])("compares %s", (_label, left, right, expected) => {
    expect(compareTermNames(left, right)).toBe(expected);
    expect(compareTermNames(right, left)).toBe(expected === 0 ? 0 : -expected);
  });

  test("sorts case and canonical ties independently of their initial order", () => {
    const names = ["éclair", "e\u0301clair", "api", "Éclair", "API"];
    const expected = ["API", "api", "Éclair", "e\u0301clair", "éclair"];

    expect(names.toSorted(compareTermNames)).toEqual(expected);
    expect(names.toReversed().toSorted(compareTermNames)).toEqual(expected);
  });
});
