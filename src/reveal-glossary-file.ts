import { Alert, confirmAlert, openExtensionPreferences, showInFinder } from "@raycast/api";

import { resolveRevealGlossaryPath } from "./components/reveal-glossary-path";
import { getGlossaryTarget } from "./glossary/get-glossary-target";

const showRecovery = async (title: string, message: string): Promise<void> => {
  const openPreferences = await confirmAlert({
    dismissAction: { title: "Done" },
    message,
    primaryAction: { style: Alert.ActionStyle.Default, title: "Open Extension Preferences" },
    title,
  });
  if (!openPreferences) {
    return;
  }

  try {
    await openExtensionPreferences();
  } catch {
    await confirmAlert({
      message: "Open Raycast Settings, select Extensions > GlossaryGo, and choose a Glossary Location manually.",
      primaryAction: { title: "OK" },
      title: "Could Not Open Preferences",
    });
  }
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
      "Check the Glossary Location path and folder permissions, or choose another folder in Preferences.",
    );
    return;
  }

  try {
    await showInFinder(revealPath);
  } catch {
    await showRecovery(
      "Could Not Reveal Glossary",
      "Check that the location is accessible in Finder and try again, or choose another folder in Preferences.",
    );
    return;
  }

  if (revealPath !== glossaryFile) {
    await showRecovery(
      "Glossary File Is Missing",
      "Revealed the nearest folder. Use Add Term to create the missing glossary, or choose a Glossary Location in Preferences.",
    );
  }
}
