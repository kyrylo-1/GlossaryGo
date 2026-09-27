// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { createTemporaryPath, removeTemporaryDirectories, writeGlossary } from "../glossary/glossary-test-utils";
import { OpenGlossaryFileAction } from "./open-glossary-file-action";

afterEach(async () => {
  cleanup();
  await removeTemporaryDirectories();
});

describe("Open Glossary File action", () => {
  test("passes an existing effective Glossary File to Raycast's native Open With action", async () => {
    const path = await writeGlossary("terms: []\n", "custom.yaml");

    render(<OpenGlossaryFileAction glossaryFile={path} />);

    const openWith = screen.getByRole("button", { name: "Open Glossary With…" });
    expect(openWith.dataset.path).toBe(path);
    expect(openWith.dataset.nativeOpenWith).toBe("true");
  });

  test("does not offer Open With when the effective Glossary File is missing", async () => {
    const path = await createTemporaryPath("glossary.yaml");

    render(<OpenGlossaryFileAction glossaryFile={path} />);

    expect(screen.queryByRole("button", { name: "Open Glossary With…" })).toBeNull();
  });
});
