import { afterEach, describe, expect, test } from "vitest";
import { dirname } from "node:path";

import { createTemporaryPath, removeTemporaryDirectories, writeGlossary } from "../glossary/glossary-test-utils";
import { resolveRevealGlossaryPath } from "./reveal-glossary-path";

afterEach(removeTemporaryDirectories);

describe("resolveRevealGlossaryPath", () => {
  test("reveals an existing glossary file", async () => {
    const path = await writeGlossary("terms: []\n");

    expect(resolveRevealGlossaryPath(path)).toBe(path);
  });

  test("reveals the nearest existing ancestor before first creation", async () => {
    const path = await createTemporaryPath("support/glossary.yaml");

    expect(resolveRevealGlossaryPath(path)).toBe(dirname(dirname(path)));
  });
});
