import { describe, expect, test } from "vitest";

import type { Term } from "../utils/types";
import { searchTerms } from "../hooks/search";

import { preparePrefixIndex, runPrefixSearchBenchmark, searchTermsWithPrefixIndex } from "./prefix-search-benchmark";

const term = (name: string, definition = `${name} definition`): Term => ({ definition, term: name });

describe("searchTermsWithPrefixIndex", () => {
  test.each([
    ["duplicate names", [term("API", "first"), term("API", "second"), term("Alpha")], "api", []],
    ["blank query", [term("Zulu"), term("Alpha"), term("API")], "   ", [term("Zulu")]],
    ["broad ASCII query", [term("A03"), term("A01"), term("A02"), term("Beta")], "a", []],
    ["ASCII punctuation", [term("A_foo"), term("A-foo"), term("A0"), term("Aa")], "a_", []],
    ["selective ASCII query", [term("Architecture"), term("API"), term("Beta")], "architect", []],
    ["accented Unicode", [term("eclair"), term("éclair"), term("café"), term("cafe\u0301")], "e\u0301c", []],
    ["Unicode query equivalent to ASCII", [term("K"), term("Kelvin"), term("Zulu")], "K", []],
    ["Unicode case variants", [term("ΟΣ"), term("Istanbul"), term("İstanbul")], "οσ", []],
  ])("matches current linear search for %s", (_scenario, entries, query, history) => {
    const index = preparePrefixIndex(entries);

    expect(searchTermsWithPrefixIndex(index, query, history)).toEqual(searchTerms(entries, query, history));
  });
});

test("reports Node and ICU runtime plus warm and cold prefix-search measurements", () => {
  const report = runPrefixSearchBenchmark({
    entries: [term("API"), term("Architecture"), term("éclair"), term("Zulu")],
    queries: ["a", "architect", "é", " "],
    repetitions: 3,
  });

  expect(report.runtime.node).toMatch(/^v\d+/u);
  expect(report.runtime.icu).toMatch(/^\d/u);
  expect(report.phases).toHaveProperty("binaryPreparation");
  expect(report.phases).toHaveProperty("linearEndToEnd");
  expect(report.phases).toHaveProperty("binaryWarmLookup");
  expect(report.phases).toHaveProperty("binaryWarmMatchCollection");
  expect(report.phases).toHaveProperty("binaryColdEndToEnd");
  expect(report.amortizedBinaryPerLookupMs).toBeGreaterThanOrEqual(0);
});
