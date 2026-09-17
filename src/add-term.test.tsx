// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import Command from "./add-term";
import { GlossaryError } from "./glossary/glossary";
import type { GlossaryChange } from "./glossary/apply-glossary-change";
import { raycastApiMocks } from "./test/raycast-api-stub";

const mocks = vi.hoisted(() => ({
  saveGlossaryChange: vi.fn<(path: string, change: GlossaryChange) => Promise<void>>(),
}));

vi.mock("@raycast/utils", () => ({ showFailureToast: vi.fn<(...args: unknown[]) => void>() }));
vi.mock("./glossary/get-glossary-target", () => ({
  getGlossaryTarget: (): { createParent: boolean; path: string } => ({
    createParent: false,
    path: "/tmp/glossary.yaml",
  }),
}));
vi.mock("./glossary/save-glossary-change", () => ({ saveGlossaryChange: mocks.saveGlossaryChange }));

const valueOf = (id: string): string => {
  const field = screen.getByTestId(id);
  if (!(field instanceof globalThis.HTMLInputElement) && !(field instanceof globalThis.HTMLTextAreaElement)) {
    throw new TypeError(`Unexpected ${id} form field.`);
  }
  return field.value;
};

const expectPristineForm = (): ReturnType<typeof screen.getByTestId> => {
  const termField = screen.getByTestId("term");
  expect(valueOf("term")).toBe("");
  expect(valueOf("definition")).toBe("");
  expect(globalThis.document.activeElement).toBe(termField);
  expect(screen.queryByRole("alert")).toBeNull();
  return termField;
};

beforeEach(() => {
  vi.clearAllMocks();
  raycastApiMocks.closeMainWindow.mockResolvedValue();
  raycastApiMocks.showInFinder.mockResolvedValue();
  raycastApiMocks.showToast.mockResolvedValue();
});

afterEach(cleanup);

describe("standalone Add Term command", () => {
  test("shows saved values, supports Done, and starts another pristine focused form", async () => {
    mocks.saveGlossaryChange.mockResolvedValue();
    render(<Command />);
    const initialTermField = expectPristineForm();

    fireEvent.blur(initialTermField);
    expect(screen.getByRole("alert").textContent).toBe("Term must contain non-whitespace text.");

    fireEvent.change(initialTermField, { target: { value: "  API  " } });
    fireEvent.change(screen.getByTestId("definition"), { target: { value: "First line\nSecond line" } });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save Term" }));

    expect(await screen.findByRole("heading", { name: "Term Added" })).toBeTruthy();
    expect(screen.getByText(/API/).textContent).toContain("First line  \nSecond line");

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(raycastApiMocks.closeMainWindow).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Add Another Term" }));
    expectPristineForm();
  });

  test("keeps both entered values and shows an actionable error when saving fails", async () => {
    mocks.saveGlossaryChange.mockRejectedValue(new Error("write failed"));
    render(<Command />);

    fireEvent.change(screen.getByTestId("term"), { target: { value: "Retained Term" } });
    fireEvent.change(screen.getByTestId("definition"), { target: { value: "Retained definition" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Term" }));

    await waitFor(() =>
      expect(raycastApiMocks.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "The glossary file could not be saved. Try again.",
          primaryAction: expect.objectContaining({ title: "Open Extension Preferences" }),
          title: "Could Not Save Term",
        }),
      ),
    );
    expect(valueOf("term")).toBe("Retained Term");
    expect(valueOf("definition")).toBe("Retained definition");
  });

  test("focuses the first invalid field and keeps whitespace errors until valid correction", async () => {
    render(<Command />);
    fireEvent.change(screen.getByTestId("term"), { target: { value: "  " } });
    fireEvent.change(screen.getByTestId("definition"), { target: { value: "\t" } });
    screen.getByTestId("definition").focus();
    fireEvent.click(screen.getByRole("button", { name: "Save Term" }));
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
    expect(globalThis.document.activeElement).toBe(screen.getByTestId("term"));
    expect(mocks.saveGlossaryChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("term"), { target: { value: " " } });
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    fireEvent.change(screen.getByTestId("term"), { target: { value: "Valid" } });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Save Term" }));
    await waitFor(() => expect(globalThis.document.activeElement).toBe(screen.getByTestId("definition")));
    fireEvent.change(screen.getByTestId("definition"), { target: { value: "Valid definition" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("clears a duplicate error after correction and saves the corrected name with literal definition", async () => {
    mocks.saveGlossaryChange.mockRejectedValueOnce(new GlossaryError("duplicate-term", "Term already exists."));
    mocks.saveGlossaryChange.mockResolvedValueOnce();
    render(<Command />);
    fireEvent.change(screen.getByTestId("term"), { target: { value: "Duplicate" } });
    fireEvent.change(screen.getByTestId("definition"), { target: { value: " Literal\nDefinition " } });
    fireEvent.click(screen.getByRole("button", { name: "Save Term" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Term already exists.");
    expect(valueOf("term")).toBe("Duplicate");
    expect(valueOf("definition")).toBe(" Literal\nDefinition ");
    fireEvent.change(screen.getByTestId("term"), { target: { value: "  Corrected  " } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save Term" }));
    await screen.findByRole("heading", { name: "Term Added" });
    expect(mocks.saveGlossaryChange).toHaveBeenLastCalledWith("/tmp/glossary.yaml", {
      type: "add", term: { term: "Corrected", definition: " Literal\nDefinition " },
    });
  });

});
