import type { ReactElement } from "react";

import { TermForm } from "./components/term-form";
import { getGlossaryTarget } from "./glossary/get-glossary-target";

const keepCommandOpen = (): Promise<void> => Promise.resolve();

export default function Command(): ReactElement {
  const glossaryTarget = getGlossaryTarget();

  return (
    <TermForm
      glossaryFile={glossaryTarget.path}
      mode="add"
      onSaved={keepCommandOpen}
      resetAfterSave
      submitTitle="Save Term"
    />
  );
}
