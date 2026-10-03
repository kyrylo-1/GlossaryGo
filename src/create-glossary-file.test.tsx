// @vitest-environment jsdom
/// <reference lib="dom" />

import { open, writeFile, type FileHandle } from "node:fs/promises";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LocalStorage } from "@raycast/api";

import { glossaryReadFileSystem } from "./glossary/glossary-file";
import Command from "./create-glossary-file";
import { getSelectedGlossaryFile, selectGlossaryFile } from "./glossary/select-glossary-file";
import { removeTemporaryDirectories, writeGlossary } from "./glossary/glossary-test-utils";

beforeEach(async () => {
  vi.clearAllMocks();
  await LocalStorage.clear();
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await removeTemporaryDirectories();
});

describe("Select Glossary File command", () => {
  test.each(["team-notes.yaml", "vocabulary.yml"])("validates and explicitly activates %s", async (filename) => {
    const path = await writeGlossary("terms:\n  - term: Alpha\n    definition: First\n", filename);
    render(<Command />);
    fireEvent.change(screen.getByTestId("glossary-file"), { target: { value: path } });
    expect(await screen.findByText("Valid glossary: 1 term. Choose Use This Glossary to activate it.")).toBeTruthy();
    await expect(getSelectedGlossaryFile()).resolves.toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Use This Glossary" }));
    expect(await screen.findByRole("heading", { name: "Glossary File Selected" })).toBeTruthy();
    await expect(getSelectedGlossaryFile()).resolves.toBe(path);
    expect(LocalStorage.setItem).toHaveBeenCalledExactlyOnceWith("selected-glossary-file", path);
  });
});

describe("Glossary selection recovery", () => {
  test("canceling a picked file retains the active glossary", async () => {
    const active = await writeGlossary("terms: []\n", "active.yaml");
    await selectGlossaryFile(active);
    const candidate = await writeGlossary("terms: []\n", "candidate.yml");
    const view = render(<Command />);
    fireEvent.change(screen.getByTestId("glossary-file"), { target: { value: candidate } });
    await screen.findByText("Valid glossary: 0 terms. Choose Use This Glossary to activate it.");
    fireEvent.change(screen.getByTestId("glossary-file"), { target: { value: "" } });
    view.unmount();
    expect(await getSelectedGlossaryFile()).toBe(active);
  });

  test("invalid YAML keeps the active glossary and allows a corrected selection", async () => {
    const active = await writeGlossary("terms: []\n", "active.yaml");
    await selectGlossaryFile(active);
    const invalid = await writeGlossary("terms: [invalid\n", "invalid.yml");
    render(<Command />);
    fireEvent.change(screen.getByTestId("glossary-file"), { target: { value: invalid } });
    expect((await screen.findByRole("alert")).textContent).toContain("Choose another existing YAML glossary file");
    expect(await getSelectedGlossaryFile()).toBe(active);
    const valid = await writeGlossary("terms: []\n", "repaired.yml");
    fireEvent.change(screen.getByTestId("glossary-file"), { target: { value: valid } });
    await screen.findByText("Valid glossary: 0 terms. Choose Use This Glossary to activate it.");
    fireEvent.click(screen.getByRole("button", { name: "Use This Glossary" }));
    await screen.findByRole("heading", { name: "Glossary File Selected" });
    expect(await getSelectedGlossaryFile()).toBe(valid);
  });

  test("revalidates a file changed after the picker preview", async () => {
    const active = await writeGlossary("terms: []\n", "active.yaml");
    await selectGlossaryFile(active);
    const candidate = await writeGlossary("terms: []\n", "candidate.yml");
    render(<Command />);
    fireEvent.change(screen.getByTestId("glossary-file"), { target: { value: candidate } });
    await screen.findByText("Valid glossary: 0 terms. Choose Use This Glossary to activate it.");
    await writeFile(candidate, "terms: [broken\n");
    fireEvent.click(screen.getByRole("button", { name: "Use This Glossary" }));
    await screen.findByRole("alert");
    expect(await getSelectedGlossaryFile()).toBe(active);
    expect(screen.queryByRole("heading", { name: "Glossary File Selected" })).toBeNull();
  });
});

describe("closing during activation", () => {
  test("cancels a pending validation without activating the candidate", async () => {
    const active = await writeGlossary("terms: []\n", "active.yaml");
    await selectGlossaryFile(active);
    const candidate = await writeGlossary("terms: []\n", "candidate.yml");
    const view = render(<Command />);
    fireEvent.change(screen.getByTestId("glossary-file"), { target: { value: candidate } });
    await screen.findByText("Valid glossary: 0 terms. Choose Use This Glossary to activate it.");
    let release!: (handle: FileHandle) => void;
    // Delay the filesystem boundary while the user closes the command.
    // eslint-disable-next-line promise/avoid-new
    const pending = new Promise<FileHandle>((resolve) => {
      release = resolve;
    });
    vi.spyOn(glossaryReadFileSystem, "open").mockReturnValueOnce(pending);
    fireEvent.click(screen.getByRole("button", { name: "Use This Glossary" }));
    view.unmount();
    const handle = await open(candidate, "r");
    release(handle);
    await waitFor(() => expect(handle.fd).toBe(-1));
    expect(await getSelectedGlossaryFile()).toBe(active);
  });
});
