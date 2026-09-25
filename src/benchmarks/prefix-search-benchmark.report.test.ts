import { expect, test } from "vitest";

import type { Term } from "../utils/types";

import { runPrefixSearchBenchmark } from "./prefix-search-benchmark";

const syntheticTerms = (count: number): readonly Term[] => {
  const entries: Term[] = [];
  for (let index = 0; index < count; index += 1) {
    const padded = index.toString().padStart(6, "0");
    const prefixes = ["Architecture", "API", "Beta", "Zulu"];
    const prefix = prefixes[index % prefixes.length];
    entries.push({ definition: `Synthetic definition ${padded}`, term: `${prefix}-${padded}` });
  }

  return [
    ...entries,
    { definition: "Synthetic duplicate one", term: "API-duplicate" },
    { definition: "Synthetic duplicate two", term: "API-duplicate" },
    { definition: "Synthetic accented NFC", term: "éclair" },
    { definition: "Synthetic accented NFD", term: "e\u0301clair" },
  ];
};

test("reports repeatable synthetic prefix-search calibration data", () => {
  const queries = [" ", "a", "api-000", "architecture-000", "é", "e\u0301", "no-match"];
  const report = runPrefixSearchBenchmark({
    entries: syntheticTerms(10_000),
    queries,
    repetitions: 50,
  });
  const calibration = [500, 1_000, 5_000].map((entryCount) => {
    const measured = runPrefixSearchBenchmark({ entries: syntheticTerms(entryCount), queries, repetitions: 30 });
    return {
      amortizedBinaryPerLookupMs: measured.amortizedBinaryPerLookupMs,
      binaryPreparationP50Ms: measured.phases.binaryPreparation.p50Ms,
      binaryWarmEndToEndP50Ms: measured.phases.binaryWarmEndToEnd.p50Ms,
      entryCount,
      linearEndToEndP50Ms: measured.phases.linearEndToEnd.p50Ms,
    };
  });

  expect(report.phases.linearEndToEnd.p50Ms).toBeGreaterThanOrEqual(0);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ calibration, report }, null, 2));
}, 30_000);
