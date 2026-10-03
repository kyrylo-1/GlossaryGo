import { statSync } from "node:fs";
import { join } from "node:path";

import { hasGlossaryExtension } from "./has-glossary-extension";

export type GlossaryTarget = Readonly<{
  createParent: boolean;
  path: string;
}>;

export const resolveGlossaryTarget = (supportPath: string, glossaryLocation?: string): GlossaryTarget => {
  if (!glossaryLocation) {
    return { createParent: true, path: join(supportPath, "glossary.yaml") };
  }

  try {
    return {
      createParent: false,
      path: statSync(glossaryLocation).isDirectory() ? join(glossaryLocation, "glossary.yaml") : glossaryLocation,
    };
  } catch {
    // The preference key previously held file-picker values, including files that may now be missing.
    return {
      createParent: false,
      path: hasGlossaryExtension(glossaryLocation) ? glossaryLocation : join(glossaryLocation, "glossary.yaml"),
    };
  }
};
