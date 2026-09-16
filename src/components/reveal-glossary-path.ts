import { existsSync } from "node:fs";
import { dirname } from "node:path";

export const resolveRevealGlossaryPath = (glossaryFile: string): string => {
  let revealPath = glossaryFile;
  while (!existsSync(revealPath)) {
    const parent = dirname(revealPath);
    if (parent === revealPath) {
      return revealPath;
    }
    revealPath = parent;
  }
  return revealPath;
};
