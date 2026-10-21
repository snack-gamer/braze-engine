export type EditorStatusSlot = "context" | "activity" | "metric";
export type EditorStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export type EditorStatusAction = Readonly<{
  label: string;
  ariaLabel?: string;
  run: () => void;
}>;

export type EditorStatusEntry = Readonly<{
  id: string;
  slot: EditorStatusSlot;
  label: string;
  detail?: string;
  tone?: EditorStatusTone;
  priority?: number;
  busy?: boolean;
  action?: EditorStatusAction;
}>;

type Listener = () => void;
type StoredEntry = { entry: EditorStatusEntry; sequence: number };

/** Process-local status stream; project and scene documents never persist it. */
export class EditorStatusStore {
  private readonly listeners = new Set<Listener>();
  private readonly entries = new Map<string, StoredEntry>();
  private nextSequence = 1;
  private snapshot: readonly EditorStatusEntry[] = Object.freeze([]);

  readonly getSnapshot = () => this.snapshot;

  readonly subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  upsert(entry: EditorStatusEntry): void {
    const current = this.entries.get(entry.id);
    if (current && sameEntry(current.entry, entry)) return;
    this.entries.set(entry.id, {
      entry,
      sequence: current?.sequence ?? this.nextSequence++,
    });
    this.publish();
  }

  remove(id: string): void {
    if (!this.entries.delete(id)) return;
    this.publish();
  }

  private publish(): void {
    this.snapshot = Object.freeze([...this.entries.values()]
      .sort((left, right) => (
        (right.entry.priority ?? 0) - (left.entry.priority ?? 0)
        || right.sequence - left.sequence
      ))
      .map(({ entry }) => entry));
    for (const listener of this.listeners) listener();
  }
}

function sameEntry(left: EditorStatusEntry, right: EditorStatusEntry): boolean {
  return left === right || (left.id === right.id && left.slot === right.slot && left.label === right.label
    && left.detail === right.detail && left.tone === right.tone && left.priority === right.priority && left.busy === right.busy
    && left.action?.label === right.action?.label && left.action?.ariaLabel === right.action?.ariaLabel && left.action?.run === right.action?.run);
}
