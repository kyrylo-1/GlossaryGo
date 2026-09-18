import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Detail,
  Icon,
  Keyboard,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useRef, type ReactElement } from "react";

import { showFailureToast } from "@raycast/utils";
import { runDeleteTerm } from "./components/delete-term-logic";
import { RevealGlossaryFileAction } from "./components/reveal-glossary-file-action";
import { TermForm } from "./components/term-form";
import { SEARCH_RESULT_LIMIT } from "./constants";
import { getGlossaryTarget } from "./glossary/get-glossary-target";
import type { GlossaryTarget } from "./glossary/glossary-target";
import { saveGlossaryChange } from "./glossary/save-glossary-change";
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

const RecoveryActions = ({
  glossaryFile,
  onReload,
}: Readonly<{ glossaryFile: string; onReload: () => Promise<void> }>): ReactElement => {
  return (
    <ActionPanel>
      <ReloadAction onReload={onReload} />
      <RevealGlossaryFileAction glossaryFile={glossaryFile} />
      <OpenPreferencesAction />
    </ActionPanel>
  );
};

type AddTermActionProps = Readonly<{
  createParent: boolean;
  glossaryFile: string;
  initialTerm: string;
  onSaved: (term: Term) => Promise<void>;
}>;

const AddTermAction = ({ createParent, glossaryFile, initialTerm, onSaved }: AddTermActionProps): ReactElement => {
  return (
    <Action.Push
      title="Add Term"
      shortcut={Keyboard.Shortcut.Common.New}
      icon={Icon.Plus}
      target={
        <TermForm
          createParent={createParent}
          glossaryFile={glossaryFile}
          initialTerm={initialTerm}
          mode="add"
          onSaved={onSaved}
        />
      }
    />
  );
};

type EditTermActionProps = Readonly<{
  glossaryFile: string;
  onReload: () => Promise<void>;
  onSaved: (term: Term) => Promise<void>;
  original: Term;
}>;

const EditTermAction = ({ glossaryFile, onReload, onSaved, original }: EditTermActionProps): ReactElement => {
  return (
    <Action.Push
      title="Edit Term"
      shortcut={Keyboard.Shortcut.Common.Edit}
      icon={Icon.Pencil}
      target={
        <TermForm glossaryFile={glossaryFile} mode="edit" onReload={onReload} onSaved={onSaved} original={original} />
      }
    />
  );
};

type DeletionLock = { current: boolean };

type DeleteTermActionProps = Readonly<{
  glossaryFile: string;
  onReload: () => Promise<void>;
  term: Term;
}>;

const confirmDelete = async (term: Term): Promise<boolean> => {
  return confirmAlert({
    dismissAction: { style: Alert.ActionStyle.Cancel, title: "Cancel" },
    message: `Delete “${term.term}” from this glossary? This cannot be undone.`,
    primaryAction: { style: Alert.ActionStyle.Destructive, title: "Delete" },
    title: "Delete Term?",
  });
};

const showDeleteFailure = async (message: string): Promise<void> => {
  await showToast({ message, style: Toast.Style.Failure, title: "Could Not Delete Term" });
};

const showDeleteSuccess = async (): Promise<void> => {
  await showToast({ style: Toast.Style.Success, title: "Term Deleted" });
};

const DeleteTermAction = ({ glossaryFile, onReload, term }: DeleteTermActionProps): ReactElement => {
  const deleting: DeletionLock = useRef(false);
  return (
    <Action
      title="Delete Term"
      shortcut={{ key: "x", modifiers: ["ctrl"] }}
      icon={Icon.Trash}
      style={Action.Style.Destructive}
      onAction={() =>
        runAction(
          () =>
            runDeleteTerm({
              confirmDelete,
              deleting,
              glossaryFile,
              onDeleteFailure: showDeleteFailure,
              onDeleteSuccess: showDeleteSuccess,
              original: term,
              reload: onReload,
              saveChange: saveGlossaryChange,
            }),
          "Failed to Delete Term",
        )
      }
    />
  );
};

type SearchActionsProps = AddTermActionProps &
  Readonly<{
    isRecent: boolean;
    onTermUsed: (name: string) => void;
    onEditConflictReload: () => Promise<void>;
    onReload: () => Promise<void>;
  }>;

const EmptyGlossaryActions = (props: SearchActionsProps): ReactElement => {
  return (
    <ActionPanel>
      <AddTermAction {...props} />
      <ActionPanel.Section>
        <ReloadAction onReload={props.onReload} />
        <RevealGlossaryFileAction glossaryFile={props.glossaryFile} />
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
        <RevealGlossaryFileAction glossaryFile={props.glossaryFile} />
      </ActionPanel.Section>
    </ActionPanel>
  );
};

type TermActionsProps = SearchActionsProps & Readonly<{ term: Term }>;

type CopyTermActionsProps = Readonly<{ onTermUsed: (name: string) => void; term: Term }>;

const CopyTermActions = ({ onTermUsed, term }: CopyTermActionsProps): ReactElement => {
  return (
    <>
      <Action
        title="Copy Definition"
        icon={Icon.Clipboard}
        onAction={() =>
          runAction(
            () => copyWithFeedback(term.definition, "Definition", () => onTermUsed(term.term)),
            "Failed to Copy Definition",
          )
        }
      />
      <Action
        title="Copy Term"
        icon={Icon.Clipboard}
        onAction={() =>
          runAction(() => copyWithFeedback(term.term, "Term", () => onTermUsed(term.term)), "Failed to Copy Term")
        }
      />
    </>
  );
};

const FullDefinition = ({
  glossaryFile,
  onTermUsed,
  term,
}: CopyTermActionsProps & Readonly<{ glossaryFile: string }>): ReactElement => {
  return (
    <Detail
      navigationTitle={term.term}
      markdown={renderPlainTextAsMarkdown(term.definition)}
      actions={
        <ActionPanel>
          <CopyTermActions onTermUsed={onTermUsed} term={term} />
          <RevealGlossaryFileAction glossaryFile={glossaryFile} />
        </ActionPanel>
      }
    />
  );
};

const TermActions = ({ term, ...props }: TermActionsProps): ReactElement => {
  return (
    <ActionPanel>
      <CopyTermActions onTermUsed={props.onTermUsed} term={term} />
      <Action.Push
        title="View Full Definition"
        shortcut={{ key: "v", modifiers: ["cmd", "shift"] }}
        icon={Icon.Document}
        target={<FullDefinition glossaryFile={props.glossaryFile} onTermUsed={props.onTermUsed} term={term} />}
      />
      <ActionPanel.Section>
        <AddTermAction {...props} />
        <EditTermAction
          glossaryFile={props.glossaryFile}
          onReload={props.onEditConflictReload}
          onSaved={props.onSaved}
          original={term}
        />
        <DeleteTermAction glossaryFile={props.glossaryFile} onReload={props.onReload} term={term} />
        <ReloadAction onReload={props.onReload} />
        <RevealGlossaryFileAction glossaryFile={props.glossaryFile} />
      </ActionPanel.Section>
    </ActionPanel>
  );
};

const ResultSection = ({ result, ...props }: SearchActionsProps & Readonly<{ result: SearchResult }>): ReactElement => {
  return (
    <List.Section
      title={props.isRecent ? "Recent Terms" : "Terms"}
      subtitle={
        result.totalMatchCount > SEARCH_RESULT_LIMIT
          ? `Showing ${SEARCH_RESULT_LIMIT} of ${result.totalMatchCount} ${props.isRecent ? "recent terms" : "matches"}`
          : ""
      }
    >
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

const MissingGlossaryView = (props: SearchActionsProps): ReactElement => {
  return (
    <List.EmptyView
      title="Create Your Glossary"
      description={`No glossary exists at ${props.glossaryFile}. Add your first term to create it.`}
      actions={<EmptyGlossaryActions {...props} />}
    />
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
        description={`${state.message}\n\nGlossary File: ${props.glossaryFile}`}
        actions={<RecoveryActions glossaryFile={props.glossaryFile} onReload={onReload} />}
      />
    );
  }

  if (state.status === "loading") {
    return null;
  }

  if (state.status === "missing") {
    return <MissingGlossaryView onReload={onReload} {...props} />;
  }

  if (state.terms.length === 0) {
    return (
      <List.EmptyView
        title="No Terms in Glossary"
        description={`Add a term to ${props.glossaryFile}.`}
        actions={<EmptyGlossaryActions onReload={onReload} {...props} />}
      />
    );
  }

  if (result.totalMatchCount === 0) {
    return (
      <List.EmptyView
        title="No Matching Terms"
        description={`Try a shorter or different prefix.\n\nGlossary File: ${props.glossaryFile}`}
        actions={<NoMatchActions onReload={onReload} {...props} />}
      />
    );
  }

  return <ResultSection onReload={onReload} result={result} {...props} />;
};

const SearchTermCommand = ({ target }: Readonly<{ target: GlossaryTarget }>): ReactElement => {
  const { createParent, glossaryFile, isRecent, query, recordTerm, reload, result, setQuery, state } =
    useGlossary(target);
  const { pop } = useNavigation();
  const onSaved = useCallback(
    async (term: Term): Promise<void> => {
      setQuery(term.term);
      await reload();
      pop();
    },
    [pop, reload, setQuery],
  );
  const onEditConflictReload = useCallback(async (): Promise<void> => {
    await reload();
    pop();
  }, [pop, reload]);

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
        createParent={createParent}
        glossaryFile={glossaryFile}
        initialTerm={query}
        isRecent={isRecent}
        onTermUsed={recordTerm}
        onEditConflictReload={onEditConflictReload}
        onReload={reload}
        onSaved={onSaved}
        result={result}
        state={state}
      />
    </List>
  );
};

export default function Command(): ReactElement {
  const target = getGlossaryTarget();
  return <SearchTermCommand key={target.path} target={target} />;
}
