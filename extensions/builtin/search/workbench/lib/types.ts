import type { AxonCommand } from "@axon-editor/shared/commands";

export interface CommandPaletteCommand {
  id: AxonCommand;
  title: string;
  group?: string;
  subtitle?: string;
  shortcut?: string;
  keywords?: string[];
  disabled?: boolean;
}
