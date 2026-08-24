import { Clipboard, showToast, Toast } from "@raycast/api";

export const copyWithFeedback = async (content: string, label: string): Promise<void> => {
  try {
    await Clipboard.copy(content);
    await showToast({ style: Toast.Style.Success, title: `${label} copied` });
  } catch {
    await showToast({ style: Toast.Style.Failure, title: `${label} could not be copied` });
  }
};
