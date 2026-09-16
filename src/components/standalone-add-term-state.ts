import type { Term } from "../utils/types";

export type StandaloneAddTermState =
  | Readonly<{ formKey: number; view: "form" }>
  | Readonly<{ formKey: number; savedTerm: Term; view: "confirmation" }>;

export const createStandaloneAddTermState = (): StandaloneAddTermState => ({ formKey: 0, view: "form" });

export const showStandaloneAddTermConfirmation = (
  state: StandaloneAddTermState,
  _savedTerm: Term,
): StandaloneAddTermState => state;

export const startAnotherStandaloneTerm = (state: StandaloneAddTermState): StandaloneAddTermState => state;
