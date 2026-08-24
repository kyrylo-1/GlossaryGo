import { Action, ActionPanel, getPreferenceValues, Icon, List, openExtensionPreferences } from "@raycast/api";
import { useMemo, useState, type ReactElement } from "react";

import type { Term } from "./glossary";
import { copyWithFeedback } from "./helpers/copy-with-feedback";
import type { CommandState } from "./hooks/use-glossary";
import { useGlossary } from "./hooks/use-glossary";
import { searchTerms, type SearchResult } from "./search";
import { renderPlainTextAsMarkdown } from "./utils/render-plain-text-as-markdown";

const runAction = (action: () => Promise<unknown>): void => {
  action().catch(() => null);
};

const ReloadAction = ({ onReload }: Readonly<{ onReload: () => Promise<void> }>): ReactElement => {
  return <Action title="Reload Glossary" icon={Icon.ArrowClockwise} onAction={() => runAction(onReload)} />;
};

const RecoveryActions = ({ onReload }: Readonly<{ onReload: () => Promise<void> }>): ReactElement => {
  return (
    <ActionPanel>
      <ReloadAction onReload={onReload} />
      <Action
        title="Open Extension Preferences"
        icon={Icon.Gear}
        onAction={() => runAction(openExtensionPreferences)}
      />
    </ActionPanel>
  );
};

const TermActions = ({ term, onReload }: Readonly<{ term: Term; onReload: () => Promise<void> }>): ReactElement => {
  return (
    <ActionPanel>
      <Action
        title="Copy Definition"
        icon={Icon.Clipboard}
        onAction={() => runAction(() => copyWithFeedback(term.definition, "Definition"))}
      />
      <Action
        title="Copy Term"
        icon={Icon.Clipboard}
        onAction={() => runAction(() => copyWithFeedback(term.term, "Term"))}
      />
      <ActionPanel.Section>
        <ReloadAction onReload={onReload} />
      </ActionPanel.Section>
    </ActionPanel>
  );
};

const ResultSection = ({
  onReload,
  result,
}: Readonly<{ onReload: () => Promise<void>; result: SearchResult }>): ReactElement => {
  return (
    <List.Section {...(result.totalMatchCount > 5 ? { title: `Showing 5 of ${result.totalMatchCount} matches` } : {})}>
      {result.terms.map((term) => (
        <List.Item
          key={term.term}
          id={term.term}
          title={term.term}
          detail={<List.Item.Detail markdown={renderPlainTextAsMarkdown(term.definition)} />}
          actions={<TermActions term={term} onReload={onReload} />}
        />
      ))}
    </List.Section>
  );
};

const CommandContent = ({
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

export default function Command(): ReactElement {
  const { glossaryFile } = getPreferenceValues<Preferences.SearchTerm>();
  const { reload, state } = useGlossary(glossaryFile);
  const [query, setQuery] = useState("");
  const result = useMemo(
    () => (state.status === "ready" ? searchTerms(state.terms, query) : { terms: [], totalMatchCount: 0 }),
    [query, state],
  );

  return (
    <List
      filtering={false}
      isLoading={state.status === "loading"}
      isShowingDetail={state.status === "ready" && result.terms.length > 0}
      onSearchTextChange={setQuery}
      searchBarPlaceholder="Search terms by prefix"
      searchText={query}
    >
      <CommandContent onReload={reload} result={result} state={state} />
    </List>
  );
}
