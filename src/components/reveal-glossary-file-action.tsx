import { Action, Icon, showInFinder } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import type { ReactElement } from "react";

import { resolveRevealGlossaryPath } from "./reveal-glossary-path";

export const RevealGlossaryFileAction = ({ glossaryFile }: Readonly<{ glossaryFile: string }>): ReactElement => {
  return (
    <Action
      title="Reveal Glossary in Finder"
      icon={Icon.Finder}
      onAction={() => {
        showInFinder(resolveRevealGlossaryPath(glossaryFile)).catch((error: unknown) =>
          showFailureToast(error, { title: "Could Not Reveal Glossary" }),
        );
      }}
    />
  );
};
