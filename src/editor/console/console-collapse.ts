import type { EditorConsoleEntry } from "./console-types";

export type CollapsedConsoleEntry = Readonly<{
  entry: EditorConsoleEntry;
  count: number;
}>;

/** Groups equivalent output globally while showing the newest source and stack. */
export function collapseConsoleEntries(entries: readonly EditorConsoleEntry[]): readonly CollapsedConsoleEntry[] {
  const grouped = new Map<string, { entry: EditorConsoleEntry; count: number }>();
  for (const entry of entries) {
    const key = [entry.level, entry.method, entry.channel, entry.code, entry.message, entry.details].join("\u0000");
    const current = grouped.get(key);
    if (current) {
      current.entry = entry;
      current.count += 1;
    } else {
      grouped.set(key, { entry, count: 1 });
    }
  }
  return [...grouped.values()].sort((left, right) => left.entry.sequence - right.entry.sequence);
}
