import { statSync } from "node:fs";
import { join } from "node:path";

import { GLOSSARY_FILE_EXTENSION } from "../constants";

export type GlossaryTarget = Readonly<{
  createParent: boolean;
  path: string;
}>;

export const resolveGlossaryTarget = (supportPath: string, glossaryFile?: string): GlossaryTarget => {
  if (!glossaryFile) {
    return { createParent: true, path: join(supportPath, "glossary.yaml") };
  }

  try {
    return {
      createParent: false,
      path: statSync(glossaryFile).isDirectory() ? join(glossaryFile, "glossary.yaml") : glossaryFile,
    };
  } catch {
    return {
      createParent: false,
      path: glossaryFile.endsWith(GLOSSARY_FILE_EXTENSION) ? glossaryFile : join(glossaryFile, "glossary.yaml"),
    };
  }
};
