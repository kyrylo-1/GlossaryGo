import { Action, ActionPanel, Clipboard, Icon, openExtensionPreferences, showToast, Toast } from "@raycast/api";
import type { ReactElement } from "react";

import type { Term } from "./glossary";

const copyWithFeedback = async (content: string, label: string): Promise<void> => {
  try {
    await Clipboard.copy(content);
    await showToast({ style: Toast.Style.Success, title: `${label} copied` });
  } catch {
    await showToast({ style: Toast.Style.Failure, title: `${label} could not be copied` });
  }
};

const runAction = (action: () => Promise<unknown>): void => {
  action().catch(() => null);
};

export const ReloadAction = ({ onReload }: Readonly<{ onReload: () => Promise<void> }>): ReactElement => {
  return <Action title="Reload Glossary" icon={Icon.ArrowClockwise} onAction={() => runAction(onReload)} />;
};

export const RecoveryActions = ({ onReload }: Readonly<{ onReload: () => Promise<void> }>): ReactElement => {
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

export const TermActions = ({
  term,
  onReload,
}: Readonly<{ term: Term; onReload: () => Promise<void> }>): ReactElement => {
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
