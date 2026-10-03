import { showToast, Toast, type LaunchProps } from "@raycast/api";

import { openGlossarySelection } from "./utils/open-glossary-selection";
import { getGlossaryTarget } from "./glossary/get-glossary-target";
import { saveGlossaryChange } from "./glossary/save-glossary-change";
import { runQuickAddTerm, type QuickAddTermArguments, type QuickAddTermFailure } from "./quick-add-term-logic";

const openSelection = (): void => {
  openGlossarySelection().catch(() => null);
};

const showFailure = async (failure: QuickAddTermFailure): Promise<void> => {
  await showToast({
    message: failure.message,
    ...(failure.kind === "save" ? { primaryAction: { onAction: openSelection, title: "Select Glossary File" } } : {}),
    style: Toast.Style.Failure,
    title: "Could Not Add Term",
  });
};

const showSuccess = async (): Promise<void> => {
  await showToast({ style: Toast.Style.Success, title: "Term Added" });
};

export default async function Command(props: LaunchProps<{ arguments: QuickAddTermArguments }>): Promise<void> {
  let glossaryTarget;
  try {
    glossaryTarget = await getGlossaryTarget();
  } catch {
    await showFailure({
      kind: "save",
      message: "Could not read the active Glossary File. Retry or use Select Glossary File.",
    });
    return;
  }
  await runQuickAddTerm({
    arguments: props.arguments,
    glossaryTarget,
    onFailure: showFailure,
    onSuccess: showSuccess,
    saveChange: saveGlossaryChange,
  });
}
