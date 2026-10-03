// @vitest-environment jsdom
/// <reference lib="dom" />

import { readFile } from "node:fs/promises";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LaunchType, LocalStorage, getPreferenceValues } from "@raycast/api";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import AddTerm from "./add-term";
import QuickAddTerm from "./quick-add-term";
import RevealGlossary from "./reveal-glossary-file";
import SearchTerm from "./search-term";
import { loadGlossary } from "./glossary/glossary";
import { removeTemporaryDirectories, writeGlossary } from "./glossary/glossary-test-utils";
import { selectGlossaryFile } from "./glossary/select-glossary-file";
import { raycastApiMocks } from "./test/raycast-api-stub";

beforeEach(async () => {
  vi.clearAllMocks();
  await LocalStorage.clear();
});
afterEach(async () => {
  cleanup();
  await removeTemporaryDirectories();
});

describe("selected Glossary File across commands", () => {
  test.each(["team-notes.yaml", "vocabulary.yml"])(
    "uses the exact %s path for search, adds, and file actions",
    async (filename) => {
      const legacy = await writeGlossary("terms: []\n", "legacy.yaml");
      vi.mocked(getPreferenceValues).mockReturnValue({ glossaryFile: legacy });
      const path = await writeGlossary("terms:\n  - term: Alpha\n    definition: First\n", filename);
      await selectGlossaryFile(path);
      render(<SearchTerm />);
      const row = within(await screen.findByRole("article", { name: "Alpha" }));
      expect(row.getByRole("button", { name: "Open Glossary With…" }).dataset.path).toBe(path);
      cleanup();

      render(<AddTerm />);
      fireEvent.change(await screen.findByTestId("term"), { target: { value: "Bravo" } });
      fireEvent.change(screen.getByTestId("definition"), { target: { value: "Second" } });
      fireEvent.click(screen.getByRole("button", { name: "Save Term" }));
      await screen.findByRole("heading", { name: "Term Added" });
      cleanup();

      await QuickAddTerm({ arguments: { definition: "Third", term: "Charlie" }, launchType: LaunchType.UserInitiated });
      await RevealGlossary();
      expect(raycastApiMocks.showInFinder).toHaveBeenCalledWith(path);
      await expect(loadGlossary(path)).resolves.toEqual([
        { definition: "First", term: "Alpha" },
        { definition: "Second", term: "Bravo" },
        { definition: "Third", term: "Charlie" },
      ]);
      expect(await readFile(legacy, "utf8")).toBe("terms: []\n");
    },
  );
});
