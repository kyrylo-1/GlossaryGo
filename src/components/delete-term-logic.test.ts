import { describe, expect, test, vi, type Mock } from "vitest";

import type { GlossaryChange } from "../glossary/apply-glossary-change";
import { applyGlossaryChange } from "../glossary/apply-glossary-change";
import { parseGlossarySource } from "../glossary/glossary";
import { GlossaryError } from "../glossary/glossary";
import type { Term } from "../utils/types";
import { runDeleteTerm } from "./delete-term-logic";

const original = { definition: "Application Programming Interface", term: "API" };

type TestOptions = Readonly<{
  confirmDelete: Mock<(selected: Term) => Promise<boolean>>;
  deleting: { current: boolean };
  glossaryFile: string;
  onDeleteFailure: Mock<(message: string) => Promise<void>>;
  onDeleteSuccess: Mock<() => Promise<void>>;
  original: Term;
  reload: Mock<() => Promise<void>>;
  saveChange: Mock<(path: string, change: GlossaryChange) => Promise<void>>;
}>;

const createOptions = (): TestOptions => ({
  confirmDelete: vi.fn<(selected: typeof original) => Promise<boolean>>().mockResolvedValue(false),
  deleting: { current: false },
  glossaryFile: "/tmp/glossary.yaml",
  onDeleteFailure: vi.fn<(message: string) => Promise<void>>().mockResolvedValue(),
  onDeleteSuccess: vi.fn<() => Promise<void>>().mockResolvedValue(),
  original,
  reload: vi.fn<() => Promise<void>>().mockResolvedValue(),
  saveChange: vi.fn<(path: string, change: GlossaryChange) => Promise<void>>().mockResolvedValue(),
});

describe("runDeleteTerm cancellation and success", () => {
  test("cancellation performs no work and releases the guard", async () => {
    const options = createOptions();

    await expect(runDeleteTerm(options)).resolves.toBe(false);

    expect(options.saveChange).not.toHaveBeenCalled();
    expect(options.reload).not.toHaveBeenCalled();
    expect(options.onDeleteSuccess).not.toHaveBeenCalled();
    expect(options.deleting.current).toBe(false);
  });

  test("confirmation persists once before success notification and reload", async () => {
    const events: string[] = [];
    const options = createOptions();
    options.confirmDelete.mockImplementation(() => {
      events.push("confirm");
      return Promise.resolve(true);
    });
    options.saveChange.mockImplementation(() => {
      events.push("save");
      return Promise.resolve();
    });
    options.onDeleteSuccess.mockImplementation(() => {
      events.push("success");
      return Promise.resolve();
    });
    options.reload.mockImplementation(() => {
      events.push("reload");
      return Promise.resolve();
    });

    await expect(runDeleteTerm(options)).resolves.toBe(true);

    expect(events).toEqual(["confirm", "save", "success", "reload"]);
    expect(options.saveChange).toHaveBeenCalledOnce();
    expect(options.saveChange).toHaveBeenCalledWith("/tmp/glossary.yaml", { original, type: "delete" });
    expect(options.deleting.current).toBe(true);
  });
});

describe("runDeleteTerm guarding", () => {
  test("blocks repeated invocation during confirmation and saving", async () => {
    const confirmation = Promise.withResolvers<boolean>();
    const saving = Promise.withResolvers<number>();
    const options = createOptions();
    options.confirmDelete.mockReturnValue(confirmation.promise);
    options.saveChange.mockImplementation(async () => {
      await saving.promise;
    });

    const first = runDeleteTerm(options);
    await expect(runDeleteTerm(options)).resolves.toBe(false);
    expect(options.confirmDelete).toHaveBeenCalledOnce();
    expect(options.saveChange).not.toHaveBeenCalled();

    confirmation.resolve(true);
    await Promise.resolve();
    await expect(runDeleteTerm(options)).resolves.toBe(false);
    expect(options.saveChange).toHaveBeenCalledOnce();

    saving.resolve(1);
    await expect(first).resolves.toBe(true);
  });

  test("captures an immutable selected snapshot before confirmation", async () => {
    const confirmation = Promise.withResolvers<boolean>();
    const selected = { definition: "Original definition", term: "Original" };
    const options = { ...createOptions(), original: selected };
    options.confirmDelete.mockReturnValue(confirmation.promise);

    const deletion = runDeleteTerm(options);
    selected.term = "New selection";
    selected.definition = "New definition";
    confirmation.resolve(true);
    await deletion;

    expect(options.confirmDelete).toHaveBeenCalledWith({ definition: "Original definition", term: "Original" });
    expect(options.saveChange).toHaveBeenCalledWith("/tmp/glossary.yaml", {
      original: { definition: "Original definition", term: "Original" },
      type: "delete",
    });
  });
});

describe("runDeleteTerm failures", () => {
  test("a confirmation failure reports a safe message and unlocks retry", async () => {
    const options = createOptions();
    options.confirmDelete.mockRejectedValue(new Error("private selected term"));

    await expect(runDeleteTerm(options)).resolves.toBe(false);

    expect(options.onDeleteFailure).toHaveBeenCalledWith("The term could not be deleted. Try again.");
    expect(options.saveChange).not.toHaveBeenCalled();
    expect(options.reload).not.toHaveBeenCalled();
    expect(options.deleting.current).toBe(false);
  });

  test("a generic save failure reports a safe message and unlocks retry", async () => {
    const options = createOptions();
    options.confirmDelete.mockResolvedValue(true);
    options.saveChange.mockRejectedValue(new Error("private path and term"));

    await expect(runDeleteTerm(options)).resolves.toBe(false);

    expect(options.onDeleteFailure).toHaveBeenCalledWith("The term could not be deleted. Try again.");
    expect(options.reload).not.toHaveBeenCalled();
    expect(options.onDeleteSuccess).not.toHaveBeenCalled();
    expect(options.deleting.current).toBe(false);
  });

  test.each([
    ["stale-term", "The selected term changed or was removed. Reload the glossary and try again."],
    ["file-changed", "The glossary changed while saving. Try again."],
  ] as const)(
    "a %s conflict reports safely, reloads once, and keeps the stale action locked",
    async (code, message) => {
      const options = createOptions();
      options.confirmDelete.mockResolvedValue(true);
      options.saveChange.mockRejectedValue(new GlossaryError(code, "unsafe supplied message"));

      await expect(runDeleteTerm(options)).resolves.toBe(false);

      expect(options.onDeleteFailure).toHaveBeenCalledWith(message);
      expect(options.reload).toHaveBeenCalledOnce();
      expect(options.onDeleteSuccess).not.toHaveBeenCalled();
      expect(options.deleting.current).toBe(true);
    },
  );
});

describe("runDeleteTerm post-persistence handling", () => {
  test("a success-notification failure still reloads and keeps the persisted action locked", async () => {
    const options = createOptions();
    options.confirmDelete.mockResolvedValue(true);
    options.onDeleteSuccess.mockRejectedValue(new Error("notification failed"));

    await expect(runDeleteTerm(options)).resolves.toBe(true);

    expect(options.reload).toHaveBeenCalledOnce();
    expect(options.onDeleteFailure).not.toHaveBeenCalled();
    expect(options.deleting.current).toBe(true);
  });

  test("a refresh failure after persistence is not reported as a failed deletion or unlocked", async () => {
    const options = createOptions();
    options.confirmDelete.mockResolvedValue(true);
    options.reload.mockRejectedValue(new Error("refresh failed"));

    await expect(runDeleteTerm(options)).resolves.toBe(true);

    expect(options.saveChange).toHaveBeenCalledOnce();
    expect(options.onDeleteSuccess).toHaveBeenCalledOnce();
    expect(options.onDeleteFailure).not.toHaveBeenCalled();
    expect(options.deleting.current).toBe(true);
  });
});

test("retains captured identity through confirmation for identical siblings", async () => {
  const source = "terms:\n  - term: API # first\n    definition: Same\n  - term: API # second\n    definition: Same\n";
  const selected = parseGlossarySource(source)[1];
  let result = source;
  const options = createOptions();
  options.confirmDelete.mockResolvedValue(true);
  options.saveChange.mockImplementation((_path, change) => {
    result = applyGlossaryChange(source, change);
    return Promise.resolve();
  });
  await expect(runDeleteTerm({ ...options, original: selected })).resolves.toBe(true);
  expect(result).toContain("# first");
  expect(result).not.toContain("# second");
});
