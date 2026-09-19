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
import { useCallback, useRef, useState, type ReactElement } from "react";

import { showFailureToast } from "@raycast/utils";
import { runDeleteTerm } from "./components/delete-term-logic";
import { RevealGlossaryFileAction } from "./components/reveal-glossary-file-action";
import { TermForm } from "./components/term-form";
import { getEntryIdentity } from "./glossary/entry-identity";
import { areTermsEquivalent } from "./glossary/term-matching";
import { getGlossaryTarget } from "./glossary/get-glossary-target";
import type { GlossaryTarget } from "./glossary/glossary-target";
import { saveGlossaryChange } from "./glossary/save-glossary-change";
import type { SearchResult } from "./hooks/search";
import { useGlossary, type CommandState } from "./hooks/use-glossary";
import { copyWithFeedback } from "./utils/copy-with-feedback";
import { prepareMarkdownForDisplay } from "./utils/prepare-markdown-for-display";
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
    onTermUsed: (term: Term) => void;
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

type CopyTermActionsProps = Readonly<{ onTermUsed: (term: Term) => void; term: Term }>;

const CopyTermActions = ({ onTermUsed, term }: CopyTermActionsProps): ReactElement => {
  return (
    <>
      <Action
        title="Copy Definition"
        icon={Icon.Clipboard}
        onAction={() =>
          runAction(
            () => copyWithFeedback(term.definition, "Definition", () => onTermUsed(term)),
            "Failed to Copy Definition",
          )
        }
      />
      <Action
        title="Copy Term"
        icon={Icon.Clipboard}
        onAction={() =>
          runAction(() => copyWithFeedback(term.term, "Term", () => onTermUsed(term)), "Failed to Copy Term")
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
      markdown={prepareMarkdownForDisplay(term.definition)}
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

const getResultSubtitle = (term: Term, terms: readonly Term[], index: number): string => {
  const identity = getEntryIdentity(term);
  const count = identity?.equivalentCount ?? terms.filter((entry) => areTermsEquivalent(entry.term, term.term)).length;
  if (count < 2) {
    return "";
  }
  const preview = term.definition.replaceAll(/\s+/gu, " ").trim().slice(0, 100);
  return `Entry ${(identity?.index ?? index) + 1} · ${preview}`;
};

const getResultId = (term: Term, index: number): string => getEntryIdentity(term)?.id ?? `${index}`;

const ResultSection = ({ result, ...props }: SearchActionsProps & Readonly<{ result: SearchResult }>): ReactElement => {
  return (
    <List.Section title="Terms" subtitle={props.isRecent ? "Recent terms first" : ""}>
      {result.terms.map((term, index) => (
        <List.Item
          key={getResultId(term, index)}
          id={getResultId(term, index)}
          title={term.term}
          subtitle={getResultSubtitle(term, result.terms, index)}
          detail={<List.Item.Detail markdown={prepareMarkdownForDisplay(term.definition)} />}
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

const useResultSelection = (
  status: CommandState["status"],
  terms: readonly Term[],
): Readonly<{
  onSelectionChange: (id: string | null) => void;
  selectedItemId: string;
}> => {
  const [selection, setSelection] = useState("");
  const onSelectionChange = useCallback((id: string | null): void => {
    // Loading removes all rows; its null callback must not erase the captured sibling.
    if (id) {
      setSelection(id);
    }
  }, []);
  const currentIds = terms.map(getResultId);
  const selectedItemId =
    status === "ready" ? (currentIds.find((id) => id === selection) ?? currentIds[0] ?? "") : selection;
  return { onSelectionChange, selectedItemId };
};

const SearchTermCommand = ({ target }: Readonly<{ target: GlossaryTarget }>): ReactElement => {
  const { createParent, glossaryFile, isRecent, query, recordTerm, reload, result, setQuery, state } =
    useGlossary(target);
  const { pop } = useNavigation();
  const { onSelectionChange, selectedItemId } = useResultSelection(state.status, result.terms);
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
      onSelectionChange={onSelectionChange}
      selectedItemId={selectedItemId}
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
