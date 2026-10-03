// @vitest-environment jsdom
/// <reference lib="dom" />

import { readFile, writeFile } from "node:fs/promises";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LaunchType, LocalStorage, getPreferenceValues, launchCommand } from "@raycast/api";
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

describe("selection storage recovery", () => {
  test("Quick Add reports selection read failure without writing to the fallback", async () => {
    const fallback = await writeGlossary("terms: []\n", "legacy.yaml");
    vi.mocked(getPreferenceValues).mockReturnValue({ glossaryFile: fallback });
    vi.mocked(LocalStorage.getItem).mockRejectedValueOnce(new Error("Storage unavailable"));
    await QuickAddTerm({ arguments: { definition: "First", term: "Alpha" }, launchType: LaunchType.UserInitiated });
    expect(raycastApiMocks.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Could not read the active Glossary File. Retry or use Select Glossary File.",
        title: "Could Not Add Term",
      }),
    );
    expect(await readFile(fallback, "utf8")).toBe("terms: []\n");
  });
});

describe("Search Term selection recovery", () => {
  test("retries the selected path without opening a fallback after storage failure", async () => {
    const path = await writeGlossary("terms:\n  - term: Selected\n    definition: Current file\n", "vocabulary.yml");
    await selectGlossaryFile(path);
    vi.mocked(LocalStorage.getItem).mockRejectedValueOnce(new Error("Storage unavailable"));
    render(<SearchTerm />);
    await screen.findByText(/Could Not Read Glossary Selection/u);
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("article", { name: "Selected" })).toBeTruthy();
  });
});

describe("invalid active-file recovery", () => {
  test("opens file selection from Search Term when the selected file becomes invalid", async () => {
    const path = await writeGlossary("terms: []\n", "vocabulary.yml");
    await selectGlossaryFile(path);
    await writeFile(path, "terms: [broken\n");
    render(<SearchTerm />);
    const action = await screen.findByRole("button", { name: "Select Glossary File" });
    fireEvent.click(action);
    expect(launchCommand).toHaveBeenCalledWith({ name: "create-glossary-file", type: LaunchType.UserInitiated });
  });
});
