import { describe, expect, test } from "vitest";

import { resolveGlossaryTarget } from "./glossary-target";

describe("resolveGlossaryTarget", () => {
  test("uses the selected custom glossary before the default", () => {
    expect(resolveGlossaryTarget("/Users/test/custom.yaml", "/Users/test/support")).toEqual({
      createParent: false,
      path: "/Users/test/custom.yaml",
    });
  });

  test("uses the extension support directory when no glossary is selected", () => {
    expect(resolveGlossaryTarget(undefined, "/Users/test/support")).toEqual({
      createParent: true,
      path: "/Users/test/support/glossary.yaml",
    });
  });
});
