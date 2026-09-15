import { Action, ActionPanel, Icon, List, openExtensionPreferences, useNavigation } from "@raycast/api";
import { useCallback, type ReactElement } from "react";

import { showFailureToast } from "@raycast/utils";
import { TermForm } from "./components/term-form";
import type { SearchResult } from "./hooks/search";
import { useGlossary, type CommandState } from "./hooks/use-glossary";
import { copyWithFeedback } from "./utils/copy-with-feedback";
import { renderPlainTextAsMarkdown } from "./utils/render-plain-text-as-markdown";
import type { Term } from "./utils/types";

const runAction = (action: () => Promise<unknown>, failureTitle: string): void => {
  action().catch((error: unknown) => showFailureToast(error, { title: failureTitle }));
};

const ReloadAction = ({ onReload }: Readonly<{ onReload: () => Promise<void> }>): ReactElement => {
  return (
    <Action
      title="Reload Glossary"
      icon={Icon.ArrowClockwise}
      onAction={() => runAction(onReload, "Failed to Reload Glossary")}
    />
  );
};

const OpenPreferencesAction = (): ReactElement => {
  return (
    <Action
      title="Open Extension Preferences"
      icon={Icon.Gear}
      onAction={() => runAction(openExtensionPreferences, "Failed to Open Extension Preferences")}
    />
  );
};

const RecoveryActions = ({ onReload }: Readonly<{ onReload: () => Promise<void> }>): ReactElement => {
  return (
    <ActionPanel>
      <ReloadAction onReload={onReload} />
      <OpenPreferencesAction />
    </ActionPanel>
  );
};

type AddTermActionProps = Readonly<{
  glossaryFile: string;
  initialTerm: string;
  onSaved: (term: Term) => Promise<void>;
}>;

const AddTermAction = ({ glossaryFile, initialTerm, onSaved }: AddTermActionProps): ReactElement => {
  return (
    <Action.Push
      title="Add Term"
      icon={Icon.Plus}
      target={<TermForm glossaryFile={glossaryFile} initialTerm={initialTerm} mode="add" onSaved={onSaved} />}
    />
  );
};

type SearchActionsProps = AddTermActionProps & Readonly<{ onReload: () => Promise<void> }>;

const EmptyGlossaryActions = (props: SearchActionsProps): ReactElement => {
  return (
    <ActionPanel>
      <AddTermAction {...props} />
      <ActionPanel.Section>
        <ReloadAction onReload={props.onReload} />
        <OpenPreferencesAction />
      </ActionPanel.Section>
    </ActionPanel>
  );
};

const NoMatchActions = (props: SearchActionsProps): ReactElement => {
  return (
    <ActionPanel>
      <AddTermAction {...props} />
      <ActionPanel.Section>
        <ReloadAction onReload={props.onReload} />
      </ActionPanel.Section>
    </ActionPanel>
  );
};

type TermActionsProps = SearchActionsProps & Readonly<{ term: Term }>;

const TermActions = ({ term, ...props }: TermActionsProps): ReactElement => {
  return (
    <ActionPanel>
      <Action
        title="Copy Definition"
        icon={Icon.Clipboard}
        onAction={() => runAction(() => copyWithFeedback(term.definition, "Definition"), "Failed to Copy Definition")}
      />
      <Action
        title="Copy Term"
        icon={Icon.Clipboard}
        onAction={() => runAction(() => copyWithFeedback(term.term, "Term"), "Failed to Copy Term")}
      />
      <ActionPanel.Section>
        <AddTermAction {...props} />
        <ReloadAction onReload={props.onReload} />
      </ActionPanel.Section>
    </ActionPanel>
  );
};

const ResultSection = ({ result, ...props }: SearchActionsProps & Readonly<{ result: SearchResult }>): ReactElement => {
  return (
    <List.Section {...(result.totalMatchCount > 5 ? { title: `Showing 5 of ${result.totalMatchCount} matches` } : {})}>
      {result.terms.map((term) => (
        <List.Item
          key={term.term}
          id={term.term}
          title={term.term}
          detail={<List.Item.Detail markdown={renderPlainTextAsMarkdown(term.definition)} />}
          actions={<TermActions term={term} {...props} />}
        />
      ))}
    </List.Section>
  );
};

const CommandContent = ({
  onReload,
  result,
  state,
  ...props
}: SearchActionsProps & Readonly<{ result: SearchResult; state: CommandState }>): ReactElement | null => {
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
        description="Add a term to the selected glossary file."
        actions={<EmptyGlossaryActions onReload={onReload} {...props} />}
      />
    );
  }

  if (result.totalMatchCount === 0) {
    return (
      <List.EmptyView
        title="No Matching Terms"
        description="Try a shorter or different prefix."
        actions={<NoMatchActions onReload={onReload} {...props} />}
      />
    );
  }

  return <ResultSection onReload={onReload} result={result} {...props} />;
};

export default function Command(): ReactElement {
  const { glossaryFile, query, reload, result, setQuery, state } = useGlossary();
  const { pop } = useNavigation();
  const onSaved = useCallback(
    async (term: Term): Promise<void> => {
      setQuery(term.term);
      await reload();
      pop();
    },
    [pop, reload, setQuery],
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
      <CommandContent
        glossaryFile={glossaryFile}
        initialTerm={query}
        onReload={reload}
        onSaved={onSaved}
        result={result}
        state={state}
      />
    </List>
  );
}
