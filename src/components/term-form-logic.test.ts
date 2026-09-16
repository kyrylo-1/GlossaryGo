import { describe, expect, test, vi, type Mock } from "vitest";

import type { GlossaryChange } from "../glossary/apply-glossary-change";
import { GlossaryError } from "../glossary/glossary";
import type { Term } from "../utils/types";
import {
  getInitialTerm,
  runTermFormSubmission,
  type TermFormErrors,
  validateTermField,
  validateTermForm,
} from "./term-form-logic";

const values = {
  definition: "  First line\nSecond line  ",
  term: "  API  ",
};

type TestCallbacks = Readonly<{
  onEditConflict: Mock<(message: string) => Promise<void>>;
  onErrors: Mock<(errors: TermFormErrors) => void>;
  onPostSaveFailure: Mock<() => Promise<void>>;
  onSaved: Mock<(term: Term) => Promise<void>>;
  onSaveFailure: Mock<(message: string) => Promise<void>>;
  onSaveSuccess: Mock<(term: Term) => Promise<void>>;
  onSubmittingChange: Mock<(isSubmitting: boolean) => void>;
}>;

const createCallbacks = (): TestCallbacks => ({
  onEditConflict: vi.fn<(message: string) => Promise<void>>().mockResolvedValue(),
  onErrors: vi.fn<(errors: TermFormErrors) => void>(),
  onPostSaveFailure: vi.fn<() => Promise<void>>().mockResolvedValue(),
  onSaveFailure: vi.fn<(message: string) => Promise<void>>().mockResolvedValue(),
  onSaveSuccess: vi.fn<(term: Term) => Promise<void>>().mockResolvedValue(),
  onSaved: vi.fn<(term: Term) => Promise<void>>().mockResolvedValue(),
  onSubmittingChange: vi.fn<(isSubmitting: boolean) => void>(),
});

describe("term form initialization", () => {
  test("initializes edit fields from the selected term snapshot", () => {
    expect(
      getInitialTerm({
        mode: "edit",
        original: { definition: "Selected definition", term: "Selected Term" },
      }),
    ).toEqual({ definition: "Selected definition", term: "Selected Term" });
  });
});

describe("term form validation", () => {
  test("trims the term while preserving a meaningful definition exactly", () => {
    expect(validateTermForm(values)).toEqual({
      errors: {},
      term: { definition: values.definition, term: "API" },
    });
  });

  test("rejects a blank term and whitespace-only definition", () => {
    expect(validateTermForm({ definition: " \n ", term: "  " })).toEqual({
      errors: {
        definition: "Definition must contain non-whitespace text.",
        term: "Term must contain non-whitespace text.",
      },
    });
  });

  test("validates individual fields for blur feedback", () => {
    expect(validateTermField("term", " ")).toBe("Term must contain non-whitespace text.");
    expect(validateTermField("definition", "Definition")).toBeNull();
  });
});

describe("runTermFormSubmission add changes", () => {
  test("submits an add with the normalized term", async () => {
    const callbacks = createCallbacks();
    const saveChange = vi
      .fn<(path: string, change: GlossaryChange, options?: { createParent?: boolean }) => Promise<void>>()
      .mockResolvedValue();
    const submitting = { current: false };

    await expect(
      runTermFormSubmission({
        ...callbacks,
        createParent: true,
        glossaryFile: "/tmp/glossary.yaml",
        mode: "add",
        saveChange,
        submitting,
        values,
      }),
    ).resolves.toBe(true);

    expect(saveChange).toHaveBeenCalledWith(
      "/tmp/glossary.yaml",
      {
        term: { definition: values.definition, term: "API" },
        type: "add",
      },
      { createParent: true },
    );
    expect(callbacks.onSaveSuccess).toHaveBeenCalledWith({ definition: values.definition, term: "API" });
    expect(callbacks.onSaved).toHaveBeenCalledWith({ definition: values.definition, term: "API" });
    expect(submitting.current).toBe(true);
  });
});

describe("runTermFormSubmission edit changes", () => {
  test("submits an edit with the original snapshot", async () => {
    const callbacks = createCallbacks();
    const original = { definition: "Old definition", term: "API" };
    const saveChange = vi.fn<(path: string, change: GlossaryChange) => Promise<void>>().mockResolvedValue();

    await runTermFormSubmission({
      ...callbacks,
      glossaryFile: "/tmp/glossary.yaml",
      mode: "edit",
      original,
      saveChange,
      submitting: { current: false },
      values,
    });

    expect(saveChange).toHaveBeenCalledWith("/tmp/glossary.yaml", {
      original,
      term: { definition: values.definition, term: "API" },
      type: "edit",
    });
    expect(callbacks.onSaveSuccess).toHaveBeenCalledWith({ definition: values.definition, term: "API" });
    expect(callbacks.onSaved).toHaveBeenCalledWith({ definition: values.definition, term: "API" });
  });
});

describe("runTermFormSubmission failures", () => {
  test("maps a duplicate failure to the Term field and allows correction", async () => {
    const callbacks = createCallbacks();
    const submitting = { current: false };
    const saveChange = vi
      .fn<(path: string, change: GlossaryChange) => Promise<void>>()
      .mockRejectedValue(new GlossaryError("duplicate-term", "A term with this name already exists."));

    await expect(
      runTermFormSubmission({
        ...callbacks,
        glossaryFile: "/tmp/glossary.yaml",
        mode: "add",
        saveChange,
        submitting,
        values,
      }),
    ).resolves.toBe(false);

    expect(callbacks.onErrors).toHaveBeenLastCalledWith({ term: "A term with this name already exists." });
    expect(callbacks.onSaveFailure).not.toHaveBeenCalled();
    expect(callbacks.onSubmittingChange).toHaveBeenLastCalledWith(false);
    expect(submitting.current).toBe(false);
  });

  test("does not leave the form or alter entered values when saving fails", async () => {
    const callbacks = createCallbacks();
    const enteredValues = { definition: "Definition stays", term: "Term stays" };

    await runTermFormSubmission({
      ...callbacks,
      glossaryFile: "/tmp/glossary.yaml",
      mode: "add",
      saveChange: vi.fn<(path: string, change: GlossaryChange) => Promise<void>>().mockRejectedValue(new Error()),
      submitting: { current: false },
      values: enteredValues,
    });

    expect(enteredValues).toEqual({ definition: "Definition stays", term: "Term stays" });
    expect(callbacks.onSaveSuccess).not.toHaveBeenCalled();
    expect(callbacks.onSaved).not.toHaveBeenCalled();
    expect(callbacks.onSaveFailure).toHaveBeenCalledWith("The glossary file could not be saved. Try again.");
  });
});

describe("runTermFormSubmission edit failure routing", () => {
  test("maps an edit duplicate to the Term field instead of conflict recovery", async () => {
    const callbacks = createCallbacks();

    await runTermFormSubmission({
      ...callbacks,
      glossaryFile: "/tmp/glossary.yaml",
      mode: "edit",
      original: { definition: "Old definition", term: "API" },
      saveChange: vi
        .fn<(path: string, change: GlossaryChange) => Promise<void>>()
        .mockRejectedValue(new GlossaryError("duplicate-term", "A term with this name already exists.")),
      submitting: { current: false },
      values,
    });

    expect(callbacks.onErrors).toHaveBeenLastCalledWith({ term: "A term with this name already exists." });
    expect(callbacks.onEditConflict).not.toHaveBeenCalled();
    expect(callbacks.onSaveFailure).not.toHaveBeenCalled();
  });

  test.each([
    ["stale-term", "The selected term changed or was removed. Reload the glossary and try again."],
    ["file-changed", "The glossary changed while saving. Try again."],
  ] as const)("routes an edit %s failure to conflict recovery", async (code, message) => {
    const callbacks = createCallbacks();
    const submitting = { current: false };

    await expect(
      runTermFormSubmission({
        ...callbacks,
        glossaryFile: "/tmp/glossary.yaml",
        mode: "edit",
        original: { definition: "Old definition", term: "API" },
        saveChange: vi
          .fn<(path: string, change: GlossaryChange) => Promise<void>>()
          .mockRejectedValue(new GlossaryError(code, message)),
        submitting,
        values,
      }),
    ).resolves.toBe(false);

    expect(callbacks.onEditConflict).toHaveBeenCalledWith(message);
    expect(callbacks.onSaveFailure).not.toHaveBeenCalled();
    expect(callbacks.onSubmittingChange).toHaveBeenLastCalledWith(false);
    expect(submitting.current).toBe(false);
  });
});

describe("runTermFormSubmission safe fallback", () => {
  test("uses a safe message for an unknown save failure", async () => {
    const callbacks = createCallbacks();

    await runTermFormSubmission({
      ...callbacks,
      glossaryFile: "/tmp/glossary.yaml",
      mode: "add",
      saveChange: vi
        .fn<(path: string, change: GlossaryChange) => Promise<void>>()
        .mockRejectedValue(new Error("secret path and stack")),
      submitting: { current: false },
      values,
    });

    expect(callbacks.onSaveFailure).toHaveBeenCalledWith("The glossary file could not be saved. Try again.");
  });
});

describe("runTermFormSubmission guarding", () => {
  test("blocks a second submission synchronously while the save is pending", async () => {
    const pendingSave = Promise.withResolvers<number>();
    const saveChange = vi.fn<(path: string, change: GlossaryChange) => Promise<void>>(async () => {
      await pendingSave.promise;
    });
    const callbacks = createCallbacks();
    const submitting = { current: false };
    const first = runTermFormSubmission({
      ...callbacks,
      glossaryFile: "/tmp/glossary.yaml",
      mode: "add",
      saveChange,
      submitting,
      values,
    });
    const second = runTermFormSubmission({
      ...callbacks,
      glossaryFile: "/tmp/glossary.yaml",
      mode: "add",
      saveChange,
      submitting,
      values,
    });

    await expect(second).resolves.toBe(false);
    expect(saveChange).toHaveBeenCalledTimes(1);
    pendingSave.resolve(1);
    await expect(first).resolves.toBe(true);
  });
});

describe("runTermFormSubmission edit guarding", () => {
  test("blocks a second edit submission while the selected snapshot save is pending", async () => {
    const pendingSave = Promise.withResolvers<number>();
    const saveChange = vi.fn<(path: string, change: GlossaryChange) => Promise<void>>(async () => {
      await pendingSave.promise;
    });
    const callbacks = createCallbacks();
    const submitting = { current: false };
    const options = {
      ...callbacks,
      glossaryFile: "/tmp/glossary.yaml",
      mode: "edit" as const,
      original: { definition: "Old definition", term: "API" },
      saveChange,
      submitting,
      values,
    };

    const first = runTermFormSubmission(options);
    await expect(runTermFormSubmission(options)).resolves.toBe(false);
    expect(saveChange).toHaveBeenCalledTimes(1);
    pendingSave.resolve(1);
    await expect(first).resolves.toBe(true);
  });
});

describe("runTermFormSubmission post-save handling", () => {
  test("continues navigation when the success notification fails", async () => {
    const callbacks = createCallbacks();
    callbacks.onSaveSuccess.mockRejectedValue(new Error("notification failed"));
    const submitting = { current: false };

    await expect(
      runTermFormSubmission({
        ...callbacks,
        glossaryFile: "/tmp/glossary.yaml",
        mode: "add",
        saveChange: vi.fn<(path: string, change: GlossaryChange) => Promise<void>>().mockResolvedValue(),
        submitting,
        values,
      }),
    ).resolves.toBe(true);

    expect(callbacks.onSaved).toHaveBeenCalledWith({ definition: values.definition, term: "API" });
    expect(callbacks.onSaveFailure).not.toHaveBeenCalled();
    expect(callbacks.onPostSaveFailure).not.toHaveBeenCalled();
    expect(callbacks.onSubmittingChange).not.toHaveBeenLastCalledWith(false);
    expect(submitting.current).toBe(true);
  });

  test("does not report or unlock a persisted save when post-save refresh fails", async () => {
    const callbacks = createCallbacks();
    callbacks.onSaved.mockRejectedValue(new Error("refresh failed"));
    const submitting = { current: false };

    await expect(
      runTermFormSubmission({
        ...callbacks,
        glossaryFile: "/tmp/glossary.yaml",
        mode: "edit",
        original: { definition: "Old definition", term: "API" },
        saveChange: vi.fn<(path: string, change: GlossaryChange) => Promise<void>>().mockResolvedValue(),
        submitting,
        values,
      }),
    ).resolves.toBe(true);

    expect(callbacks.onSaveFailure).not.toHaveBeenCalled();
    expect(callbacks.onPostSaveFailure).toHaveBeenCalledOnce();
    expect(callbacks.onSubmittingChange).not.toHaveBeenLastCalledWith(false);
    expect(submitting.current).toBe(true);
  });
});
