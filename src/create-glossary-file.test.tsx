// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LocalStorage } from "@raycast/api";

import Command from "./create-glossary-file";
import { getSelectedGlossaryFile } from "./glossary/select-glossary-file";
import { removeTemporaryDirectories, writeGlossary } from "./glossary/glossary-test-utils";

beforeEach(async () => {
  vi.clearAllMocks();
  await LocalStorage.clear();
});

afterEach(async () => {
  cleanup();
  await removeTemporaryDirectories();
});

describe("Select Glossary File command", () => {
  test.each(["team-notes.yaml", "vocabulary.yml"])("validates and explicitly activates %s", async (filename) => {
    const path = await writeGlossary("terms:\n  - term: Alpha\n    definition: First\n", filename);
    render(<Command />);
    fireEvent.change(screen.getByLabelText("Glossary File"), { target: { value: path } });
    expect(await screen.findByText("Valid glossary: 1 term. Choose Use This Glossary to activate it.")).toBeTruthy();
    await expect(getSelectedGlossaryFile()).resolves.toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Use This Glossary" }));
    expect(await screen.findByRole("heading", { name: "Glossary File Selected" })).toBeTruthy();
    await expect(getSelectedGlossaryFile()).resolves.toBe(path);
    expect(LocalStorage.setItem).toHaveBeenCalledExactlyOnceWith("selected-glossary-file", path);
  });
});
