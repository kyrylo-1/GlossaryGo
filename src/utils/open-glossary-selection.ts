import { launchCommand, LaunchType } from "@raycast/api";

export const openGlossarySelection = (): Promise<void> =>
  launchCommand({ name: "create-glossary-file", type: LaunchType.UserInitiated });
