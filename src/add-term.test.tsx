// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import Command from "./add-term";
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

const valueOf = (id: string): string => screen.getByTestId(id).value;

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
    expect(screen.getByText(/API/).textContent).toContain("First line\nSecond line");

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
});
