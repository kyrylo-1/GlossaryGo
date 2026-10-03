import { environment, getPreferenceValues } from "@raycast/api";

import { resolveGlossaryTarget, type GlossaryTarget } from "./glossary-target";

import { getSelectedGlossaryFile } from "./select-glossary-file";

type GlossaryPreferences = Readonly<{
  glossaryFile?: string;
}>;

export const getGlossaryTarget = async (): Promise<GlossaryTarget> => {
  const selectedPath = await getSelectedGlossaryFile();
  if (selectedPath) {
    return { createParent: false, path: selectedPath };
  }
  const { glossaryFile } = getPreferenceValues<GlossaryPreferences>();
  const glossaryLocation = glossaryFile;
  return resolveGlossaryTarget(environment.supportPath, glossaryLocation);
};
