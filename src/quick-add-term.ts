import { openExtensionPreferences, showToast, Toast, type LaunchProps } from "@raycast/api";

import { getGlossaryTarget } from "./glossary/get-glossary-target";
import { saveGlossaryChange } from "./glossary/save-glossary-change";
import { runQuickAddTerm, type QuickAddTermArguments, type QuickAddTermFailure } from "./quick-add-term-logic";

const openPreferences = (): void => {
  openExtensionPreferences().catch(() => null);
};

const showFailure = async (failure: QuickAddTermFailure): Promise<void> => {
  await showToast({
    message: failure.message,
    ...(failure.kind === "save"
      ? { primaryAction: { onAction: openPreferences, title: "Open Extension Preferences" } }
      : {}),
    style: Toast.Style.Failure,
    title: "Could Not Add Term",
  });
};

const showSuccess = async (): Promise<void> => {
  await showToast({ style: Toast.Style.Success, title: "Term Added" });
};

export default async function Command(props: LaunchProps<{ arguments: QuickAddTermArguments }>): Promise<void> {
  await runQuickAddTerm({
    arguments: props.arguments,
    glossaryTarget: getGlossaryTarget(),
    onFailure: showFailure,
    onSuccess: showSuccess,
    saveChange: saveGlossaryChange,
  });
}
