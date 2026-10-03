import { Action, ActionPanel, Detail, getPreferenceValues } from "@raycast/api";
import { useEffect, useState, type ReactElement } from "react";

import { getGlossaryTarget } from "../glossary/get-glossary-target";
import type { GlossaryTarget } from "../glossary/glossary-target";

type Resolution = Readonly<{ key: string; target?: GlossaryTarget }>;

export const GlossaryTargetView = ({
  children,
}: Readonly<{ children: (target: GlossaryTarget) => ReactElement }>): ReactElement => {
  const { glossaryFile } = getPreferenceValues<{ glossaryFile?: string }>();
  const [attempt, setAttempt] = useState(0);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const key = JSON.stringify([glossaryFile, attempt]);

  useEffect(() => {
    let current = true;
    getGlossaryTarget()
      .then((target) => {
        if (current) {
          setResolution({ key, target });
        }
        return null;
      })
      .catch(() => {
        if (current) {
          setResolution({ key });
        }
      });
    return (): void => {
      current = false;
    };
  }, [key]);

  if (resolution?.key !== key) {
    return <Detail isLoading navigationTitle="Loading Glossary File" />;
  }
  if (!resolution.target) {
    return (
      <Detail
        actions={
          <ActionPanel>
            <Action title="Retry" onAction={() => setAttempt((value) => value + 1)} />
          </ActionPanel>
        }
        markdown="# Could Not Read Glossary Selection\n\nRetry to load your active Glossary File. No fallback file has been opened."
      />
    );
  }
  return children(resolution.target);
};
