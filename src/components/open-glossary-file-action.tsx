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

  // eslint-disable-next-line @raycast/prefer-title-case -- The macOS Open With label includes an ellipsis.
  return <Action.OpenWith title="Open Glossary With…" path={glossaryFile} />;
};
