import { statSync } from "node:fs";
import { dirname } from "node:path";

export const resolveRevealGlossaryPath = (glossaryFile: string): string => {
  let revealPath = glossaryFile;
  for (;;) {
    try {
      statSync(revealPath);
      return revealPath;
    } catch (error: unknown) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
      const parent = dirname(revealPath);
      if (parent === revealPath) {
        throw error;
      }
      revealPath = parent;
    }
  }
};
