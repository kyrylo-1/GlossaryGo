import { List } from "@raycast/api";
import type { ReactElement } from "react";

import type { SearchResult } from "./search";
import { TermActions } from "./search-term-actions";

const renderPlainTextAsMarkdown = (value: string): string => {
  const longestBacktickRun = [...value.matchAll(/`+/g)].reduce(
    (longest, match) => Math.max(longest, match[0].length),
    0,
  );
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  return `${fence}\n${value}${value.endsWith("\n") ? "" : "\n"}${fence}`;
};

export const ResultSection = ({
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
