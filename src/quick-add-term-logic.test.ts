import { stat } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { loadGlossary } from "./glossary/glossary";
import { createTemporaryPath, removeTemporaryDirectories, writeGlossary } from "./glossary/glossary-test-utils";
import { resolveGlossaryTarget } from "./glossary/glossary-target";
import { saveGlossaryChange } from "./glossary/save-glossary-change";
import { runQuickAddTerm, type QuickAddTermFailure } from "./quick-add-term-logic";

afterEach(async () => {
  vi.restoreAllMocks();
  await removeTemporaryDirectories();
});

describe("runQuickAddTerm validation", () => {
  test("saves a normalized term while preserving its definition", async () => {
    const glossaryFile = await createTemporaryPath("glossary.yaml");
    const onFailure = vi.fn<(failure: QuickAddTermFailure) => Promise<void>>().mockResolvedValue();
    const onSuccess = vi.fn<() => Promise<void>>().mockResolvedValue();

    await runQuickAddTerm({
      arguments: { definition: "  First line\nSecond line  ", term: "  API  " },
      glossaryTarget: { createParent: false, path: glossaryFile },
      onFailure,
      onSuccess,
      saveChange: saveGlossaryChange,
    });

    await expect(loadGlossary(glossaryFile)).resolves.toEqual([
      { definition: "  First line\nSecond line  ", term: "API" },
    ]);
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
  });

  test("reports invalid arguments without creating a glossary", async () => {
    const glossaryFile = await createTemporaryPath("glossary.yaml");
    const onFailure = vi.fn<(failure: QuickAddTermFailure) => Promise<void>>().mockResolvedValue();

    await runQuickAddTerm({
      arguments: { definition: " \n ", term: "  " },
      glossaryTarget: { createParent: false, path: glossaryFile },
      onFailure,
      onSuccess: vi.fn<() => Promise<void>>().mockResolvedValue(),
      saveChange: saveGlossaryChange,
    });

    expect(onFailure).toHaveBeenCalledWith({
      kind: "validation",
      message: "Term must contain non-whitespace text.",
    });
    await expect(stat(glossaryFile)).rejects.toEqual(expect.objectContaining({ code: "ENOENT" }));
  });
});

describe("runQuickAddTerm target selection", () => {
  test("creates the default glossary and its support directory on first save", async () => {
    const supportPath = await createTemporaryPath("support");
    const glossaryTarget = resolveGlossaryTarget(supportPath);

    await runQuickAddTerm({
      arguments: { definition: "Application Programming Interface", term: "API" },
      glossaryTarget,
      onFailure: vi.fn<(failure: QuickAddTermFailure) => Promise<void>>().mockResolvedValue(),
      onSuccess: vi.fn<() => Promise<void>>().mockResolvedValue(),
      saveChange: saveGlossaryChange,
    });

    await expect(loadGlossary(join(supportPath, "glossary.yaml"))).resolves.toEqual([
      { definition: "Application Programming Interface", term: "API" },
    ]);
  });

  test("saves to the selected custom glossary instead of the default", async () => {
    const supportPath = await createTemporaryPath("support");
    const customGlossary = await createTemporaryPath("custom.yaml");
    const glossaryTarget = resolveGlossaryTarget(supportPath, customGlossary);

    await runQuickAddTerm({
      arguments: { definition: "Architectural Decision Record", term: "ADR" },
      glossaryTarget,
      onFailure: vi.fn<(failure: QuickAddTermFailure) => Promise<void>>().mockResolvedValue(),
      onSuccess: vi.fn<() => Promise<void>>().mockResolvedValue(),
      saveChange: saveGlossaryChange,
    });

    await expect(loadGlossary(customGlossary)).resolves.toEqual([
      { definition: "Architectural Decision Record", term: "ADR" },
    ]);
    await expect(stat(join(supportPath, "glossary.yaml"))).rejects.toEqual(expect.objectContaining({ code: "ENOENT" }));
  });
});

describe("runQuickAddTerm save failures", () => {
  test("reports a Unicode-equivalent duplicate without reporting success", async () => {
    const glossaryFile = await writeGlossary("terms:\n  - term: Éclair\n    definition: Existing definition\n");
    const onFailure = vi.fn<(failure: QuickAddTermFailure) => Promise<void>>().mockResolvedValue();
    const onSuccess = vi.fn<() => Promise<void>>().mockResolvedValue();

    await runQuickAddTerm({
      arguments: { definition: "Duplicate definition", term: "éclair" },
      glossaryTarget: { createParent: false, path: glossaryFile },
      onFailure,
      onSuccess,
      saveChange: saveGlossaryChange,
    });

    expect(onFailure).toHaveBeenCalledWith({
      kind: "duplicate",
      message: expect.stringContaining("duplicates another term"),
    });
    expect(onSuccess).not.toHaveBeenCalled();
    await expect(loadGlossary(glossaryFile)).resolves.toEqual([{ definition: "Existing definition", term: "Éclair" }]);
  });

  test("reports a save failure without creating the invalid target", async () => {
    const glossaryFile = await createTemporaryPath("glossary.yml");
    const onFailure = vi.fn<(failure: QuickAddTermFailure) => Promise<void>>().mockResolvedValue();
    const onSuccess = vi.fn<() => Promise<void>>().mockResolvedValue();

    await runQuickAddTerm({
      arguments: { definition: "Application Programming Interface", term: "API" },
      glossaryTarget: { createParent: false, path: glossaryFile },
      onFailure,
      onSuccess,
      saveChange: saveGlossaryChange,
    });

    expect(onFailure).toHaveBeenCalledWith({
      kind: "save",
      message: "Choose a file with the .yaml extension.",
    });
    expect(onSuccess).not.toHaveBeenCalled();
    await expect(stat(glossaryFile)).rejects.toEqual(expect.objectContaining({ code: "ENOENT" }));
  });
});
