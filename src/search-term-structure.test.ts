import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("Search Term command source layout", () => {
  test("keeps all TSX implementation in search-term.tsx", async () => {
    const sourceFiles = await readdir(resolve(process.cwd(), "src"), { recursive: true });
    const tsxFiles = sourceFiles.filter((file) => file.endsWith(".tsx")).toSorted();

    expect(tsxFiles).toEqual(["search-term.tsx"]);
  });
});
