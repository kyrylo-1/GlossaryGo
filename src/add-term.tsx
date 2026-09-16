import { useState, type ReactElement } from "react";

import { StandaloneAddTermConfirmation } from "./components/standalone-add-term-confirmation";
import {
  createStandaloneAddTermState,
  showStandaloneAddTermConfirmation,
  startAnotherStandaloneTerm,
} from "./components/standalone-add-term-state";
import { TermForm } from "./components/term-form";
import { getGlossaryTarget } from "./glossary/get-glossary-target";
import type { Term } from "./utils/types";

export default function Command(): ReactElement {
  const glossaryTarget = getGlossaryTarget();
  const [state, setState] = useState(createStandaloneAddTermState);

  if (state.view === "confirmation") {
    return (
      <StandaloneAddTermConfirmation
        savedTerm={state.savedTerm}
        onAddAnother={() => setState((current) => startAnotherStandaloneTerm(current))}
      />
    );
  }

  const handleSaved = (term: Term): Promise<void> => {
    setState((current) => showStandaloneAddTermConfirmation(current, term));
    return Promise.resolve();
  };

  return (
    <TermForm
      createParent={glossaryTarget.createParent}
      focusTermOnMount={state.focusTermOnMount}
      glossaryFile={glossaryTarget.path}
      key={state.formKey}
      mode="add"
      onSaved={handleSaved}
      submitTitle="Save Term"
    />
  );
}
