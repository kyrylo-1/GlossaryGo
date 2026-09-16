import { Action, ActionPanel, closeMainWindow, Detail, Icon } from "@raycast/api";
import type { ReactElement } from "react";

import type { Term } from "../utils/types";
import { renderPlainTextAsMarkdown } from "../utils/render-plain-text-as-markdown";

type StandaloneAddTermConfirmationProps = Readonly<{
  onAddAnother: () => void;
  savedTerm: Term;
}>;

const closeCommand = (): void => {
  closeMainWindow().catch(() => null);
};

export const StandaloneAddTermConfirmation = ({
  onAddAnother,
  savedTerm,
}: StandaloneAddTermConfirmationProps): ReactElement => {
  const markdown = [
    "# Term Added",
    "",
    "## Term",
    renderPlainTextAsMarkdown(savedTerm.term),
    "",
    "## Definition",
    renderPlainTextAsMarkdown(savedTerm.definition),
  ].join("\n");

  return (
    <Detail
      actions={
        <ActionPanel>
          <Action title="Add Another Term" icon={Icon.Plus} onAction={onAddAnother} />
          <Action title="Done" icon={Icon.Checkmark} onAction={closeCommand} />
        </ActionPanel>
      }
      markdown={markdown}
      navigationTitle="Term Added"
    />
  );
};
