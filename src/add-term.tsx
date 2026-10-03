import { useMemo, useState, type ReactElement } from "react";

import { isExistingGlossaryFile } from "./components/is-existing-glossary-file";
import { StandaloneAddTermConfirmation } from "./components/standalone-add-term-confirmation";
import {
  createStandaloneAddTermState,
  showStandaloneAddTermConfirmation,
  startAnotherStandaloneTerm,
} from "./components/standalone-add-term-state";
import { TermForm } from "./components/term-form";
import { GlossaryTargetView } from "./components/glossary-target-view";
import type { GlossaryTarget } from "./glossary/glossary-target";
import type { Term } from "./utils/types";

const AddTermCommand = ({ glossaryTarget }: Readonly<{ glossaryTarget: GlossaryTarget }>): ReactElement => {
  const [state, setState] = useState(createStandaloneAddTermState);
  // A new form can follow a first save that created the file.
  const openWithAvailable = useMemo(
    () => isExistingGlossaryFile(glossaryTarget.path),
    // A new form can follow a save that created the file at the same path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [glossaryTarget.path, state.formKey],
  );

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
      openWithAvailable={openWithAvailable}
      key={state.formKey}
      mode="add"
      onSaved={handleSaved}
      submitTitle="Save Term"
    />
  );
};

export default function Command(): ReactElement {
  return (
    <GlossaryTargetView>{(target) => <AddTermCommand key={target.path} glossaryTarget={target} />}</GlossaryTargetView>
  );
}
