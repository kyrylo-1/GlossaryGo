export const isGlossaryLoadCancelledError = (error: unknown): boolean => {
  return error instanceof Error && error.name === "AbortError";
};

export const throwIfGlossaryLoadCancelled = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    const error = new Error("Glossary load cancelled");
    error.name = "AbortError";
    throw error;
  }
};
