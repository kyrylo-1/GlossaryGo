import { existsSync } from "node:fs";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createTemporaryPath, removeTemporaryDirectories, writeGlossary } from "./glossary/glossary-test-utils";
import Command from "./reveal-glossary-file";

const api = vi.hoisted(() => ({
  Toast: { Style: { Failure: "failure", Success: "success" } },
  environment: { supportPath: "" },
  getPreferenceValues: vi.fn<() => { glossaryFile?: string }>(),
  openExtensionPreferences: vi.fn<() => Promise<void>>(),
  showInFinder: vi.fn<(path: string) => Promise<void>>(),
  showToast: vi.fn<(options: unknown) => Promise<void>>(),
}));

vi.mock("@raycast/api", () => api);

beforeEach(async () => {
  vi.resetAllMocks();
  api.environment.supportPath = dirname(await createTemporaryPath("glossary.yaml"));
  api.getPreferenceValues.mockReturnValue({});
  api.openExtensionPreferences.mockResolvedValue();
  api.showInFinder.mockResolvedValue();
  api.showToast.mockResolvedValue();
});
afterEach(removeTemporaryDirectories);

describe("Reveal Glossary File existing targets", () => {
  test.each(["terms: []\n", "terms: [invalid YAML\n", ""])(
    "reveals a configured file without validating or changing its contents: %j",
    async (contents) => {
      const path = await writeGlossary(contents);
      api.getPreferenceValues.mockReturnValue({ glossaryFile: path });

      await Command();

      expect(api.showInFinder).toHaveBeenCalledExactlyOnceWith(path);
      expect(await readFile(path, "utf8")).toBe(contents);
      expect(existsSync(join(api.environment.supportPath, "glossary.yaml"))).toBe(false);
      expect(api.showToast).not.toHaveBeenCalled();
    },
  );

  test("reveals the existing default file when the preference is unset", async () => {
    const path = join(api.environment.supportPath, "glossary.yaml");
    await writeFile(path, "terms: []\n");

    await Command();

    expect(api.showInFinder).toHaveBeenCalledExactlyOnceWith(path);
    expect(await readFile(path, "utf8")).toBe("terms: []\n");
  });
});

describe("Reveal Glossary File missing targets", () => {
  test.each(["glossary.yaml", "missing/nested/glossary.yaml"])(
    "reveals the nearest ancestor for a missing configured target: %s",
    async (relativePath) => {
      const path = join(api.environment.supportPath, relativePath);
      api.getPreferenceValues.mockReturnValue({ glossaryFile: path });

      await Command();

      expect(api.showInFinder).toHaveBeenCalledExactlyOnceWith(api.environment.supportPath);
      expect(existsSync(path)).toBe(false);
      expect(existsSync(join(api.environment.supportPath, "missing"))).toBe(false);
      expect(api.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/Add Term.*Preferences/u),
          primaryAction: expect.objectContaining({ title: "Open Extension Preferences" }),
          title: "Glossary File Is Missing",
        }),
      );
    },
  );

  test("does not create missing default support directories", async () => {
    const existingAncestor = api.environment.supportPath;
    api.environment.supportPath = join(existingAncestor, "missing", "support");

    await Command();

    expect(api.showInFinder).toHaveBeenCalledExactlyOnceWith(existingAncestor);
    expect(existsSync(join(existingAncestor, "missing"))).toBe(false);
    expect(api.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Glossary File Is Missing" }));
  });
});

describe("Reveal Glossary File recovery", () => {
  test("offers preferences and retry guidance when Finder fails", async () => {
    api.showInFinder.mockRejectedValue(new Error("Finder unavailable"));

    await Command();

    expect(api.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/Finder.*try again/u),
        primaryAction: expect.objectContaining({ title: "Open Extension Preferences" }),
        style: "failure",
        title: "Could Not Reveal Glossary",
      }),
    );
  });

  test("offers path recovery when target resolution fails", async () => {
    api.getPreferenceValues.mockImplementation(() => {
      throw new Error("Preferences unavailable");
    });

    await Command();

    expect(api.showInFinder).not.toHaveBeenCalled();
    expect(api.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/path.*permissions/u), style: "failure" }),
    );
  });
});

describe("Reveal Glossary File inaccessible locations", () => {
  test("reports inaccessible folders instead of treating them as missing", async () => {
    const path = await writeGlossary("terms: []\n");
    api.getPreferenceValues.mockReturnValue({ glossaryFile: path });
    await chmod(dirname(path), 0o000);
    try {
      await Command();

      expect(api.showInFinder).not.toHaveBeenCalled();
      expect(api.showToast).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringMatching(/path.*permissions/u), style: "failure" }),
      );
    } finally {
      await chmod(dirname(path), 0o700);
    }
  });

  test("reports an invalid intermediate path instead of revealing an unrelated ancestor", async () => {
    const file = await writeGlossary("terms: []\n");
    api.getPreferenceValues.mockReturnValue({ glossaryFile: join(file, "glossary.yaml") });

    await Command();

    expect(api.showInFinder).not.toHaveBeenCalled();
    expect(api.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/path.*permissions/u), style: "failure" }),
    );
  });
});
