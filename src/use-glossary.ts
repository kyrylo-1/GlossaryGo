import { useCallback, useEffect, useRef, useState } from "react";

import { GlossaryError, loadGlossary } from "./glossary";
import type { CommandState } from "./search-term-state";

type GlossaryState = Readonly<{
  reload: () => Promise<void>;
  state: CommandState;
}>;

const getSafeErrorMessage = (error: unknown): string => {
  return error instanceof GlossaryError ? error.message : "The glossary could not be loaded. Try reloading it.";
};

export const useGlossary = (glossaryFile: string): GlossaryState => {
  const [state, setState] = useState<CommandState>({ status: "loading" });
  const loadSequence = useRef(0);
  const reload = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setState({ status: "loading" });

    try {
      const terms = await loadGlossary(glossaryFile);
      if (sequence === loadSequence.current) {
        setState({ status: "ready", terms });
      }
    } catch (error: unknown) {
      if (sequence === loadSequence.current) {
        setState({ message: getSafeErrorMessage(error), status: "error" });
      }
    }
  }, [glossaryFile]);

  useEffect(() => {
    reload();
    return (): void => {
      loadSequence.current += 1;
    };
  }, [reload]);

  return { reload, state };
};
