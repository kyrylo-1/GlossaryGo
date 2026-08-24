import { getPreferenceValues, List } from "@raycast/api";
import { type ReactElement, useMemo, useState } from "react";

import { searchTerms } from "./search";
import { CommandContent } from "./search-term-content";
import { useGlossary } from "./use-glossary";

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
