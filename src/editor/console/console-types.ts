import type { ScenePlaybackMode } from "../../types";

export type EditorConsoleLevel = "log" | "warning" | "error";
export type EditorConsoleMethod = "debug" | "info" | "log" | "warn" | "error" | "trace" | "diagnostic";

export type EditorConsoleEntryInput = Readonly<{
  level: EditorConsoleLevel;
  method?: EditorConsoleMethod;
  message: string;
  details?: string;
  stack?: string;
  source?: string;
  channel?: string;
  code?: string;
  timestamp?: number;
}>;

export type EditorConsoleEntry = Readonly<{
  id: string;
  sequence: number;
  level: EditorConsoleLevel;
  method: EditorConsoleMethod;
  message: string;
  details: string;
  stack: string;
  source: string;
  channel: string;
  code: string;
  timestamp: number;
}>;

export type EditorConsoleOptions = Readonly<{
  collapse: boolean;
  clearOnPlay: boolean;
  errorPause: boolean;
  showTimestamps: boolean;
  showLog: boolean;
  showWarning: boolean;
  showError: boolean;
}>;

export type EditorConsoleOption = keyof EditorConsoleOptions;

export type EditorConsoleSnapshot = Readonly<{
  entries: readonly EditorConsoleEntry[];
  options: EditorConsoleOptions;
}>;

export type EditorConsolePublish = (entry: EditorConsoleEntryInput) => EditorConsoleEntry;

export type EditorConsolePlayback = Readonly<{
  mode: ScenePlaybackMode;
  pauseForError?: () => void;
}>;
