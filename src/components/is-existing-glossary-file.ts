import { statSync } from "node:fs";

export const isExistingGlossaryFile = (glossaryFile: string): boolean => {
  try {
    return statSync(glossaryFile).isFile();
  } catch {
    return false;
  }
};
