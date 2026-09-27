// @vitest-environment jsdom
/// <reference lib="dom" />

import { dirname } from "node:path";

import { cleanup, render, screen, within } from "@testing-library/react";
import { environment, getPreferenceValues } from "@raycast/api";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { removeTemporaryDirectories, writeGlossary } from "./glossary/glossary-test-utils";
import Command from "./search-term";

const originalSupportPath = environment.supportPath;

beforeEach(() => {
  vi.mocked(getPreferenceValues).mockReturnValue({});
});

afterEach(async () => {
  cleanup();
  environment.supportPath = originalSupportPath;
  await removeTemporaryDirectories();
});

describe("Search Term Open Glossary With target resolution", () => {
  test.each(["selected folder", "retained direct file", "default support directory"])(
    "passes the exact %s Glossary File to Raycast's native action",
    async (target) => {
      const filename = target === "retained direct file" ? "legacy.yaml" : "glossary.yaml";
      const path = await writeGlossary("terms:\n  - term: Alpha\n    definition: Synthetic definition\n", filename);
      if (target === "selected folder") {
        vi.mocked(getPreferenceValues).mockReturnValue({ glossaryFile: dirname(path) });
      } else if (target === "retained direct file") {
        vi.mocked(getPreferenceValues).mockReturnValue({ glossaryFile: path });
      } else {
        environment.supportPath = dirname(path);
      }

      render(<Command />);

      const result = within(await screen.findByRole("article", { name: "Alpha" }));
      const openWith = result.getByRole("button", { name: "Open Glossary With…" });
      expect(openWith.dataset.path).toBe(path);
      expect(openWith.dataset.nativeOpenWith).toBe("true");
    },
  );
});
