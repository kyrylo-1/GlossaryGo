// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { confirmAlert } from "@raycast/api";

import Command from "./create-glossary-file";
import { GlossaryError } from "./glossary/glossary-error";
import { raycastApiMocks } from "./test/raycast-api-stub";

const mocks = vi.hoisted(() => ({
  createGlossaryFile:
    vi.fn<(_directory: string, _terms: ReadonlyArray<{ definition: string; term: string }>) => Promise<string>>(),
}));

vi.mock("./glossary/create-glossary-file", () => ({ createGlossaryFile: mocks.createGlossaryFile }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createGlossaryFile.mockResolvedValue("/tmp/selected/glossary.yaml");
  vi.mocked(confirmAlert).mockResolvedValue(true);
  raycastApiMocks.showToast.mockResolvedValue();
});

afterEach(() => cleanup());

// eslint-disable-next-line max-lines-per-function
describe("Create Glossary File command", () => {
  test("opening, missing folder, and canceled confirmation create nothing", async () => {
    render(<Command />);
    expect(mocks.createGlossaryFile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Review and Create" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Choose an existing folder.");
    expect(confirmAlert).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("directory"), { target: { value: "/tmp/selected" } });
    vi.mocked(confirmAlert).mockResolvedValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Review and Create" }));
    await waitFor(() => expect(confirmAlert).toHaveBeenCalledOnce());
    expect(mocks.createGlossaryFile).not.toHaveBeenCalled();
  });

  test("validates every initial term before confirmation and retains entered values", async () => {
    render(<Command />);
    fireEvent.change(screen.getByTestId("directory"), { target: { value: "/tmp/selected" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Initial Term" }));
    fireEvent.change(screen.getByTestId("term-0"), { target: { value: "API" } });
    fireEvent.click(screen.getByRole("button", { name: "Review and Create" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Definition must contain non-whitespace text.");
    expect(screen.getByTestId("term-0")).toHaveProperty("value", "API");
    expect(confirmAlert).not.toHaveBeenCalled();
    expect(mocks.createGlossaryFile).not.toHaveBeenCalled();
  });

  test("confirms and creates multiple normalized terms at the selected path", async () => {
    render(<Command />);
    fireEvent.change(screen.getByTestId("directory"), { target: { value: "/tmp/selected" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Initial Term" }));
    fireEvent.change(screen.getByTestId("term-0"), { target: { value: "  Zulu  " } });
    fireEvent.change(screen.getByTestId("definition-0"), { target: { value: "Last" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Initial Term" }));
    fireEvent.change(screen.getByTestId("term-1"), { target: { value: "Alpha" } });
    fireEvent.change(screen.getByTestId("definition-1"), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Review and Create" }));

    await waitFor(() =>
      expect(mocks.createGlossaryFile).toHaveBeenCalledWith("/tmp/selected", [
        { definition: "Last", term: "Zulu" },
        { definition: "First", term: "Alpha" },
      ]),
    );
    expect(confirmAlert).toHaveBeenCalledWith(expect.objectContaining({ title: "Create Glossary File?" }));
    expect(await screen.findByRole("heading", { name: "Glossary File Created" })).toBeTruthy();
    expect(screen.getByText(/\/tmp\/selected\/glossary.yaml/)).toBeTruthy();
    expect(screen.getByText(/shared Glossary Location preference/)).toBeTruthy();
  });

  test("creates an empty glossary only after confirmation", async () => {
    render(<Command />);
    fireEvent.change(screen.getByTestId("directory"), { target: { value: "/tmp/selected" } });
    fireEvent.click(screen.getByRole("button", { name: "Review and Create" }));

    await waitFor(() => expect(mocks.createGlossaryFile).toHaveBeenCalledWith("/tmp/selected", []));
    expect(await screen.findByRole("heading", { name: "Glossary File Created" })).toBeTruthy();
  });

  test("shows collision errors and keeps the chosen folder for correction", async () => {
    mocks.createGlossaryFile.mockRejectedValueOnce(
      new GlossaryError("already-exists", "A glossary.yaml already exists in that folder. Choose another folder."),
    );
    render(<Command />);
    fireEvent.change(screen.getByTestId("directory"), { target: { value: "/tmp/selected" } });
    fireEvent.click(screen.getByRole("button", { name: "Review and Create" }));

    await waitFor(() =>
      expect(raycastApiMocks.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "A glossary.yaml already exists in that folder. Choose another folder.",
          title: "Could Not Create Glossary File",
        }),
      ),
    );
    expect(screen.getByTestId("directory")).toHaveProperty("value", "/tmp/selected");
    expect(screen.queryByRole("heading", { name: "Glossary File Created" })).toBeNull();
  });
});
