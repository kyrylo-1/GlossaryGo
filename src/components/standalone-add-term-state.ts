import type { Term } from "../utils/types";

export type StandaloneAddTermState =
  | Readonly<{ focusTermOnMount: true; formKey: number; view: "form" }>
  | Readonly<{ formKey: number; savedTerm: Term; view: "confirmation" }>;

export const createStandaloneAddTermState = (): StandaloneAddTermState => ({
  focusTermOnMount: true,
  formKey: 0,
  view: "form",
});

export const showStandaloneAddTermConfirmation = (
  state: StandaloneAddTermState,
  savedTerm: Term,
): StandaloneAddTermState => ({ formKey: state.formKey, savedTerm, view: "confirmation" });

export const startAnotherStandaloneTerm = (state: StandaloneAddTermState): StandaloneAddTermState => ({
  focusTermOnMount: true,
  formKey: state.formKey + 1,
  view: "form",
});
