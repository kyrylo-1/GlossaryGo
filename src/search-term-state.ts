import type { Term } from "./glossary";

export type CommandState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; terms: readonly Term[] }>
  | Readonly<{ status: "error"; message: string }>;
