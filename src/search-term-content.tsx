import { ActionPanel, List } from "@raycast/api";
import type { ReactElement } from "react";

import type { SearchResult } from "./search";
import { RecoveryActions, ReloadAction } from "./search-term-actions";
import { ResultSection } from "./search-term-results";
import type { CommandState } from "./search-term-state";

export const CommandContent = ({
  onReload,
  result,
  state,
}: Readonly<{ onReload: () => Promise<void>; result: SearchResult; state: CommandState }>): ReactElement | null => {
  if (state.status === "error") {
    return (
      <List.EmptyView
        title="Glossary Could Not Be Loaded"
        description={state.message}
        actions={<RecoveryActions onReload={onReload} />}
      />
    );
  }

  if (state.status === "loading") {
    return null;
  }

  if (state.terms.length === 0) {
    return (
      <List.EmptyView
        title="No Terms in Glossary"
        description="Add terms to the selected glossary file, then reload it."
        actions={<RecoveryActions onReload={onReload} />}
      />
    );
  }

  if (result.totalMatchCount === 0) {
    return (
      <List.EmptyView
        title="No Matching Terms"
        description="Try a shorter or different prefix."
        actions={
          <ActionPanel>
            <ReloadAction onReload={onReload} />
          </ActionPanel>
        }
      />
    );
  }

  return <ResultSection onReload={onReload} result={result} />;
};
