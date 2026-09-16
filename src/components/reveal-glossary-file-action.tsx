import { Action, Icon, showInFinder } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { ReactElement } from "react";

const getRevealPath = (glossaryFile: string): string => {
  return existsSync(glossaryFile) ? glossaryFile : dirname(glossaryFile);
};

export const RevealGlossaryFileAction = ({ glossaryFile }: Readonly<{ glossaryFile: string }>): ReactElement => {
  return (
    <Action
      title="Reveal Glossary in Finder"
      icon={Icon.Finder}
      onAction={() => {
        showInFinder(getRevealPath(glossaryFile)).catch((error: unknown) =>
          showFailureToast(error, { title: "Could Not Reveal Glossary" }),
        );
      }}
    />
  );
};
