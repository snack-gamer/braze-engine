import type {
  EditorConsoleEntry,
  EditorConsoleEntryInput,
  EditorConsoleOption,
  EditorConsoleOptions,
  EditorConsoleSnapshot,
} from "./console-types";

const DEFAULT_CAPACITY = 2_000;

export const DEFAULT_EDITOR_CONSOLE_OPTIONS: EditorConsoleOptions = Object.freeze({
  collapse: false,
  clearOnPlay: true,
  errorPause: false,
  showTimestamps: false,
  showLog: true,
  showWarning: true,
  showError: true,
});

type Listener = () => void;

/** Bounded process-local log store. Console entries never enter project or scene persistence. */
export class EditorConsoleStore {
  private readonly listeners = new Set<Listener>();
  private readonly capacity: number;
  private entries: readonly EditorConsoleEntry[] = Object.freeze([]);
  private options: EditorConsoleOptions;
  private snapshot: EditorConsoleSnapshot;
  private nextSequence = 1;

  constructor(options: Partial<EditorConsoleOptions> = {}, capacity = DEFAULT_CAPACITY) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.options = Object.freeze({ ...DEFAULT_EDITOR_CONSOLE_OPTIONS, ...options });
    this.snapshot = Object.freeze({ entries: this.entries, options: this.options });
  }

  readonly getSnapshot = () => this.snapshot;

  readonly subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  publish(input: EditorConsoleEntryInput): EditorConsoleEntry {
    const sequence = this.nextSequence++;
    const entry: EditorConsoleEntry = Object.freeze({
      id: `console-${sequence}`,
      sequence,
      level: input.level,
      method: input.method ?? "diagnostic",
      message: input.message.trim() || "(empty message)",
      details: input.details?.trim() ?? "",
      stack: input.stack?.trim() ?? "",
      source: input.source?.trim() ?? "",
      channel: input.channel?.trim() ?? "",
      code: input.code?.trim() ?? "",
      timestamp: input.timestamp ?? Date.now(),
    });
    this.entries = Object.freeze([...this.entries, entry].slice(-this.capacity));
    this.emit();
    return entry;
  }

  clear(): void {
    if (this.entries.length === 0) return;
    this.entries = Object.freeze([]);
    this.emit();
  }

  setOption(option: EditorConsoleOption, value: boolean): void {
    if (this.options[option] === value) return;
    this.options = Object.freeze({ ...this.options, [option]: value });
    this.emit();
  }

  private emit(): void {
    this.snapshot = Object.freeze({ entries: this.entries, options: this.options });
    for (const listener of this.listeners) listener();
  }
}
