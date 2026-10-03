import { Alert, confirmAlert, showInFinder } from "@raycast/api";

import { openGlossarySelection } from "./utils/open-glossary-selection";
import { resolveRevealGlossaryPath } from "./components/reveal-glossary-path";
import { getGlossaryTarget } from "./glossary/get-glossary-target";

const showRecovery = async (title: string, message: string): Promise<void> => {
  const openSelection = await confirmAlert({
    dismissAction: { title: "Done" },
    message,
    primaryAction: { style: Alert.ActionStyle.Default, title: "Select Glossary File" },
    title,
  });
  if (!openSelection) {
    return;
  }

  try {
    await openGlossarySelection();
  } catch {
    await confirmAlert({
      message: "Open Raycast root search and run Select Glossary File manually.",
      primaryAction: { title: "OK" },
      title: "Could Not Open File Selection",
    });
  }
};

export default async function Command(): Promise<void> {
  let glossaryFile: string;
  let revealPath: string;
  try {
    glossaryFile = (await getGlossaryTarget()).path;
    revealPath = resolveRevealGlossaryPath(glossaryFile);
  } catch {
    await showRecovery(
      "Could Not Reveal Glossary",
      "Check the Glossary File path and permissions, then retry or use Select Glossary File.",
    );
    return;
  }

  try {
    await showInFinder(revealPath);
  } catch {
    await showRecovery(
      "Could Not Reveal Glossary",
      "Check that the file is accessible in Finder and try again, or use Select Glossary File.",
    );
    return;
  }

  if (revealPath !== glossaryFile) {
    await showRecovery(
      "Glossary File Is Missing",
      "Revealed the nearest folder. Use Select Glossary File to choose an existing file. If the original parent folder still exists, Add Term can recreate the missing file at its exact path.",
    );
  }
}
