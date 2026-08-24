import {
  Action,
  ActionPanel,
  Clipboard,
  getPreferenceValues,
  Icon,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GlossaryError, loadGlossary, type Term } from "./glossary";
import { searchTerms } from "./search";

type CommandState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; terms: readonly Term[] }>
  | Readonly<{ status: "error"; message: string }>;

function getSafeErrorMessage(error: unknown) {
  return error instanceof GlossaryError ? error.message : "The glossary could not be loaded. Try reloading it.";
}

function renderPlainTextAsMarkdown(value: string) {
  const longestBacktickRun = [...value.matchAll(/`+/g)].reduce(
    (longest, match) => Math.max(longest, match[0].length),
    0,
  );
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  return `${fence}\n${value}${value.endsWith("\n") ? "" : "\n"}${fence}`;
}

async function copyWithFeedback(content: string, label: string) {
  try {
    await Clipboard.copy(content);
    await showToast({ style: Toast.Style.Success, title: `${label} copied` });
  } catch {
    await showToast({ style: Toast.Style.Failure, title: `${label} could not be copied` });
  }
}

function ReloadAction({ onReload }: Readonly<{ onReload: () => Promise<void> }>) {
  return <Action title="Reload Glossary" icon={Icon.ArrowClockwise} onAction={onReload} />;
}

function RecoveryActions({ onReload }: Readonly<{ onReload: () => Promise<void> }>) {
  return (
    <ActionPanel>
      <ReloadAction onReload={onReload} />
      <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
    </ActionPanel>
  );
}

function TermActions({ term, onReload }: Readonly<{ term: Term; onReload: () => Promise<void> }>) {
  return (
    <ActionPanel>
      <Action
        title="Copy Definition"
        icon={Icon.Clipboard}
        onAction={() => copyWithFeedback(term.definition, "Definition")}
      />
      <Action title="Copy Term" icon={Icon.Clipboard} onAction={() => copyWithFeedback(term.term, "Term")} />
      <ActionPanel.Section>
        <ReloadAction onReload={onReload} />
      </ActionPanel.Section>
    </ActionPanel>
  );
}

export default function Command(): ReactElement {
  const { glossaryFile } = getPreferenceValues<Preferences.SearchTerm>();
  const [state, setState] = useState<CommandState>({ status: "loading" });
  const [query, setQuery] = useState("");
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
    return () => {
      loadSequence.current += 1;
    };
  }, [reload]);

  const result = useMemo(
    () => (state.status === "ready" ? searchTerms(state.terms, query) : { terms: [], totalMatchCount: 0 }),
    [query, state],
  );

  const hasResults = state.status === "ready" && result.terms.length > 0;

  return (
    <List
      filtering={false}
      isLoading={state.status === "loading"}
      isShowingDetail={hasResults}
      onSearchTextChange={setQuery}
      searchBarPlaceholder="Search terms by prefix"
      searchText={query}
    >
      {state.status === "error" ? (
        <List.EmptyView
          title="Glossary Could Not Be Loaded"
          description={state.message}
          actions={<RecoveryActions onReload={reload} />}
        />
      ) : state.status === "ready" && state.terms.length === 0 ? (
        <List.EmptyView
          title="No Terms in Glossary"
          description="Add terms to the selected glossary file, then reload it."
          actions={<RecoveryActions onReload={reload} />}
        />
      ) : state.status === "ready" && result.totalMatchCount === 0 ? (
        <List.EmptyView
          title="No Matching Terms"
          description="Try a shorter or different prefix."
          actions={
            <ActionPanel>
              <ReloadAction onReload={reload} />
            </ActionPanel>
          }
        />
      ) : state.status === "ready" ? (
        <List.Section
          {...(result.totalMatchCount > 5 ? { title: `Showing 5 of ${result.totalMatchCount} matches` } : {})}
        >
          {result.terms.map((term) => (
            <List.Item
              key={term.term}
              id={term.term}
              title={term.term}
              detail={<List.Item.Detail markdown={renderPlainTextAsMarkdown(term.definition)} />}
              actions={<TermActions term={term} onReload={reload} />}
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}
