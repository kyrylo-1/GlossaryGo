import { openExtensionPreferences, showInFinder, showToast, Toast } from "@raycast/api";

import { resolveRevealGlossaryPath } from "./components/reveal-glossary-path";
import { getGlossaryTarget } from "./glossary/get-glossary-target";

const showRecovery = async (title: string, message: string): Promise<void> => {
  await showToast({
    message,
    primaryAction: {
      onAction: () => {
        openExtensionPreferences().catch(() => null);
      },
      title: "Open Extension Preferences",
    },
    style: Toast.Style.Failure,
    title,
  });
};

export default async function Command(): Promise<void> {
  let glossaryFile: string;
  let revealPath: string;
  try {
    glossaryFile = getGlossaryTarget().path;
    revealPath = resolveRevealGlossaryPath(glossaryFile);
  } catch {
    await showRecovery(
      "Could Not Reveal Glossary",
      "Check the Glossary File path and folder permissions, or choose another file in Preferences.",
    );
    return;
  }

  try {
    await showInFinder(revealPath);
  } catch {
    await showRecovery(
      "Could Not Reveal Glossary",
      "Check that the location is accessible in Finder and try again, or choose another file in Preferences.",
    );
    return;
  }

  if (revealPath !== glossaryFile) {
    await showRecovery(
      "Glossary File Is Missing",
      "Revealed the nearest folder. Use Add Term after creating any missing custom folders, or choose a file in Preferences.",
    );
  }
}
