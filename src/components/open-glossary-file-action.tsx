import { Action } from "@raycast/api";
import type { ReactElement } from "react";

import { isExistingGlossaryFile } from "./is-existing-glossary-file";

export const OpenGlossaryFileAction = ({
  glossaryFile,
  isAvailable = isExistingGlossaryFile(glossaryFile),
}: Readonly<{ glossaryFile: string; isAvailable?: boolean }>): ReactElement | null => {
  if (!isAvailable) {
    return null;
  }

  // eslint-disable-next-line @raycast/prefer-title-case -- The macOS Open With label includes an ellipsis.
  return <Action.OpenWith title="Open Glossary With…" path={glossaryFile} />;
};
