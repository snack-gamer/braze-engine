import type { CollapsedConsoleEntry } from "./console-collapse";

/** Exports the displayed order and collapse counts without truncating row text. */
export function formatConsoleCopy(rows: readonly CollapsedConsoleEntry[]): string {
  return rows.map(({ entry, count }) => {
    const heading = [new Date(entry.timestamp).toISOString(), entry.level.toUpperCase(), entry.channel, entry.code]
      .filter(Boolean).join(" | ");
    const detailsRepeatMessage = entry.details.replace(/\s*\n\s*/g, " ").trim() === entry.message;
    const body = detailsRepeatMessage ? entry.details : [entry.message, entry.details].filter(Boolean).join("\n");
    return [
      `[${heading}]${count > 1 ? ` (repeated ${count} times)` : ""}`,
      body,
      entry.source && `Source: ${entry.source}`,
      entry.stack && `Stack:\n${entry.stack}`,
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}
