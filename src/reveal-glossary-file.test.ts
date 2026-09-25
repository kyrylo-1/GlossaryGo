import { existsSync } from "node:fs";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createTemporaryPath, removeTemporaryDirectories, writeGlossary } from "./glossary/glossary-test-utils";
import Command from "./reveal-glossary-file";

const api = vi.hoisted(() => ({
  Alert: { ActionStyle: { Default: "default" } },
  confirmAlert: vi.fn<(options: unknown) => Promise<boolean>>(),
  environment: { supportPath: "" },
  getPreferenceValues: vi.fn<() => { glossaryFile?: string }>(),
  openExtensionPreferences: vi.fn<() => Promise<void>>(),
  showInFinder: vi.fn<(path: string) => Promise<void>>(),
}));

vi.mock("@raycast/api", () => api);

beforeEach(async () => {
  vi.resetAllMocks();
  api.confirmAlert.mockResolvedValue(false);
  api.environment.supportPath = dirname(await createTemporaryPath("glossary.yaml"));
  api.getPreferenceValues.mockReturnValue({});
  api.openExtensionPreferences.mockResolvedValue();
  api.showInFinder.mockResolvedValue();
});
afterEach(removeTemporaryDirectories);

describe("Reveal Glossary File existing targets", () => {
  test("reveals glossary.yaml inside the selected glossary folder", async () => {
    const path = await writeGlossary("terms: []\n");
    api.getPreferenceValues.mockReturnValue({ glossaryFile: dirname(path) });

    await Command();

    expect(api.showInFinder).toHaveBeenCalledExactlyOnceWith(path);
    expect(await readFile(path, "utf8")).toBe("terms: []\n");
    expect(api.confirmAlert).not.toHaveBeenCalled();
  });

  test.each(["terms: []\n", "terms: [invalid YAML\n", ""])(
    "reveals a configured file without validating or changing its contents: %j",
    async (contents) => {
      const path = await writeGlossary(contents);
      api.getPreferenceValues.mockReturnValue({ glossaryFile: path });

      await Command();

      expect(api.showInFinder).toHaveBeenCalledExactlyOnceWith(path);
      expect(await readFile(path, "utf8")).toBe(contents);
      expect(existsSync(join(api.environment.supportPath, "glossary.yaml"))).toBe(false);
      expect(api.confirmAlert).not.toHaveBeenCalled();
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
      expect(api.confirmAlert).toHaveBeenCalledWith(
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
    expect(api.confirmAlert).toHaveBeenCalledWith(expect.objectContaining({ title: "Glossary File Is Missing" }));
  });
});

describe("Reveal Glossary File recovery", () => {
  test("offers preferences and retry guidance when Finder fails", async () => {
    api.showInFinder.mockRejectedValue(new Error("Finder unavailable"));

    await Command();

    expect(api.confirmAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/Finder.*try again/u),
        primaryAction: expect.objectContaining({ title: "Open Extension Preferences" }),
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
    expect(api.confirmAlert).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/Glossary Location.*folder permissions/u) }),
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
      expect(api.confirmAlert).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringMatching(/path.*permissions/u) }),
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
    expect(api.confirmAlert).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/path.*permissions/u) }),
    );
  });
});

describe("Reveal Glossary File recovery choices", () => {
  test("offers a normal Preferences action after revealing the missing target ancestor", async () => {
    api.confirmAlert.mockResolvedValueOnce(true);

    await Command();

    expect(api.confirmAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        dismissAction: { title: "Done" },
        primaryAction: { style: "default", title: "Open Extension Preferences" },
      }),
    );
    expect(api.showInFinder).toHaveBeenCalledBefore(api.confirmAlert);
    expect(api.openExtensionPreferences).toHaveBeenCalledExactlyOnceWith();
    expect(api.openExtensionPreferences).toHaveBeenCalledAfter(api.confirmAlert);
  });

  test("dismisses recovery without opening Preferences or creating a glossary", async () => {
    await Command();

    expect(api.confirmAlert).toHaveBeenCalledOnce();
    expect(api.openExtensionPreferences).not.toHaveBeenCalled();
    expect(existsSync(join(api.environment.supportPath, "glossary.yaml"))).toBe(false);
  });

  test("provides manual settings guidance if opening Preferences fails", async () => {
    api.confirmAlert.mockResolvedValueOnce(true);
    api.openExtensionPreferences.mockRejectedValue(new Error("Preferences unavailable"));

    await Command();

    expect(api.confirmAlert).toHaveBeenCalledTimes(2);
    expect(api.confirmAlert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/Raycast Settings.*GlossaryGo.*Glossary Location/u),
        primaryAction: { title: "OK" },
        title: "Could Not Open Preferences",
      }),
    );
  });
});

describe("Reveal Glossary File dialog lifetime", () => {
  test("waits for the recovery choice after Finder opens", async () => {
    const confirmation = Promise.withResolvers<boolean>();
    const completed = vi.fn<() => void>();
    api.confirmAlert.mockReturnValueOnce(confirmation.promise);

    const command = Command().then(completed);
    await vi.waitFor(() => expect(api.confirmAlert).toHaveBeenCalledOnce());

    expect(api.showInFinder).toHaveBeenCalledOnce();
    expect(completed).not.toHaveBeenCalled();
    expect(api.openExtensionPreferences).not.toHaveBeenCalled();
    confirmation.resolve(false);
    await command;
    expect(completed).toHaveBeenCalledOnce();
  });
});
