import { getPreferenceValues } from "@raycast/api";
import type { ReactElement } from "react";

import { TermForm } from "./components/term-form";

const keepCommandOpen = (): Promise<void> => Promise.resolve();

export default function Command(): ReactElement {
  const { glossaryFile } = getPreferenceValues<Preferences>();

  return (
    <TermForm glossaryFile={glossaryFile} mode="add" onSaved={keepCommandOpen} resetAfterSave submitTitle="Save Term" />
  );
}
