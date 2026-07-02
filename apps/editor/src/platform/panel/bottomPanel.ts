// Bottom panel tabs are a workbench contract, not a terminal implementation
// detail. Problems and output are rendered beside the terminal today, but other
// built-in extensions should be able to target the same panel area without
// importing terminal UI files just to share this type.
export type BottomPanelTab = "problems" | "output";
export type OutputEntryLevel = "info" | "success" | "warning" | "error";

export interface OutputEntry {
  id: number;
  time: string;
  level: OutputEntryLevel;
  source: string;
  message: string;
}
