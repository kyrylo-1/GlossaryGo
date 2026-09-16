import { join } from "node:path";

export type GlossaryTarget = Readonly<{
  createParent: boolean;
  path: string;
}>;

export const resolveGlossaryTarget = (supportPath: string, glossaryFile?: string): GlossaryTarget => {
  return glossaryFile
    ? { createParent: false, path: glossaryFile }
    : { createParent: true, path: join(supportPath, "glossary.yaml") };
};
