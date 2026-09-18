import { Action, Icon, showInFinder } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import type { ReactElement } from "react";

import { resolveRevealGlossaryPath } from "./reveal-glossary-path";

const revealGlossaryFile = async (glossaryFile: string): Promise<void> => {
  await showInFinder(resolveRevealGlossaryPath(glossaryFile));
};

export const RevealGlossaryFileAction = ({ glossaryFile }: Readonly<{ glossaryFile: string }>): ReactElement => {
  return (
    <Action
      title="Reveal Glossary in Finder"
      icon={Icon.Finder}
      onAction={() => {
        revealGlossaryFile(glossaryFile).catch((error: unknown) =>
          showFailureToast(error, { title: "Could Not Reveal Glossary" }),
        );
      }}
    />
  );
};
