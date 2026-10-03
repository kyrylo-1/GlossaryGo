import { LocalStorage, getPreferenceValues } from "@raycast/api";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { getGlossaryTarget } from "./get-glossary-target";
import { removeTemporaryDirectories, writeGlossary } from "./glossary-test-utils";
import { selectGlossaryFile } from "./select-glossary-file";

beforeEach(async () => {
  await LocalStorage.clear();
  vi.mocked(getPreferenceValues).mockReturnValue({ glossaryFile: "/legacy/glossary.yaml" });
});
afterEach(removeTemporaryDirectories);

describe("effective Glossary File selection", () => {
  test("retains the configured glossary until an existing file is explicitly activated", async () => {
    expect(await getGlossaryTarget()).toEqual({ createParent: false, path: "/legacy/glossary.yaml" });
    const path = await writeGlossary("terms: []\n", "vocabulary.yml");
    await selectGlossaryFile(path);
    expect(await getGlossaryTarget()).toEqual({ createParent: false, path });
  });
});
