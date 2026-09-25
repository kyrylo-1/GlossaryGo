import { loadGlossarySource, parseGlossarySource } from "./glossary";
import { throwIfGlossaryLoadCancelled } from "./glossary-load-cancellation";
import type { Term } from "../utils/types";

type SourceCacheDependencies = Readonly<{
  parseSource: (source: string) => readonly Term[];
  readSource: (path: string, signal?: AbortSignal) => Promise<string>;
}>;

type SourceCacheEntry = Readonly<{
  path: string;
  source: string;
  terms: readonly Term[];
}>;

export type GlossarySourceCache = Readonly<{
  clear: () => void;
  load: (path: string, signal?: AbortSignal) => Promise<readonly Term[]>;
}>;

const productionDependencies: SourceCacheDependencies = {
  parseSource: parseGlossarySource,
  readSource: loadGlossarySource,
};

export const createGlossarySourceCache = (
  dependencies: SourceCacheDependencies = productionDependencies,
): GlossarySourceCache => {
  let activePath: string | null = null;
  let entry: SourceCacheEntry | null = null;

  const clear = (): void => {
    activePath = null;
    entry = null;
  };

  const load = async (path: string, signal?: AbortSignal): Promise<readonly Term[]> => {
    if (activePath !== path) {
      entry = null;
      activePath = path;
    }

    try {
      throwIfGlossaryLoadCancelled(signal);
      const source = await dependencies.readSource(path, signal);
      throwIfGlossaryLoadCancelled(signal);
      if (activePath !== path) {
        return dependencies.parseSource(source);
      }
      if (entry?.path === path && entry.source === source) {
        return entry.terms;
      }

      throwIfGlossaryLoadCancelled(signal);
      const terms = dependencies.parseSource(source);
      entry = { path, source, terms };
      return terms;
    } catch (error: unknown) {
      if (activePath === path) {
        clear();
      }
      throw error;
    }
  };

  return { clear, load };
};
