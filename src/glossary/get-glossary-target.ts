import { environment, getPreferenceValues } from "@raycast/api";

import { resolveGlossaryTarget, type GlossaryTarget } from "./glossary-target";

type GlossaryPreferences = Readonly<{
  glossaryFile?: string;
}>;

export const getGlossaryTarget = (): GlossaryTarget => {
  const { glossaryFile } = getPreferenceValues<GlossaryPreferences>();
  return resolveGlossaryTarget(glossaryFile, environment.supportPath);
};
