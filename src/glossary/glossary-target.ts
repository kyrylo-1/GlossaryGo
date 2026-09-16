import { join } from "node:path";

export type GlossaryTarget = Readonly<{
  createParent: boolean;
  path: string;
}>;

export const resolveGlossaryTarget = (glossaryFile: string | undefined, supportPath: string): GlossaryTarget => {
  return glossaryFile === undefined || glossaryFile.length === 0
    ? { createParent: true, path: join(supportPath, "glossary.yaml") }
    : { createParent: false, path: glossaryFile };
};
