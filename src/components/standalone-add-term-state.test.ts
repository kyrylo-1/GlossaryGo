import { describe, expect, test } from "vitest";

import {
  createStandaloneAddTermState,
  showStandaloneAddTermConfirmation,
  startAnotherStandaloneTerm,
} from "./standalone-add-term-state";

describe("standalone Add Term state", () => {
  test("starts with a pristine form that focuses Term", () => {
    expect(createStandaloneAddTermState()).toEqual({ formKey: 0, focusTermOnMount: true, view: "form" });
  });

  test("preserves the normalized saved values in a stable confirmation", () => {
    const state = showStandaloneAddTermConfirmation(createStandaloneAddTermState(), {
      definition: "  First line\nSecond line  ",
      term: "API",
    });

    expect(state).toEqual({
      formKey: 0,
      savedTerm: {
        definition: "  First line\nSecond line  ",
        term: "API",
      },
      view: "confirmation",
    });
  });

  test("starts another term with a fresh form instance", () => {
    const confirmation = showStandaloneAddTermConfirmation(createStandaloneAddTermState(), {
      definition: "Application Programming Interface",
      term: "API",
    });

    expect(startAnotherStandaloneTerm(confirmation)).toEqual({
      formKey: 1,
      focusTermOnMount: true,
      view: "form",
    });
  });
});
