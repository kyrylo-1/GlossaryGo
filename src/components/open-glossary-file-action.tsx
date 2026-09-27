import { statSync } from "node:fs";

import { Action } from "@raycast/api";
import type { ReactElement } from "react";

export const OpenGlossaryFileAction = ({ glossaryFile }: Readonly<{ glossaryFile: string }>): ReactElement | null => {
  try {
    if (!statSync(glossaryFile).isFile()) {
      return null;
    }
  } catch {
    return null;
  }

  return <Action.OpenWith title="Open With…" path={glossaryFile} />;
};
