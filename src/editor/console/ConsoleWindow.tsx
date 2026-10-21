import { useEffect, useMemo, useRef, useState } from "react";
import { EditorIcon } from "../../ui/EditorIcon";
import { collapseConsoleEntries, type CollapsedConsoleEntry } from "./console-collapse";
import { useEditorConsoleCommands, useEditorConsoleSnapshot } from "./EditorConsoleProvider";
import type { EditorConsoleEntry, EditorConsoleLevel, EditorConsoleOption } from "./console-types";
import { useConsoleCopy } from "./useConsoleCopy";

const LEVEL_OPTIONS: Readonly<Record<EditorConsoleLevel, EditorConsoleOption>> = {
  log: "showLog",
  warning: "showWarning",
  error: "showError",
};

const LEVEL_LABELS: Readonly<Record<EditorConsoleLevel, string>> = {
  log: "Logs",
  warning: "Warnings",
  error: "Errors",
};

const LEVEL_ICONS = {
  log: "console",
  warning: "warning",
  error: "error",
} as const;

/** Dockable Unity-style Console with bounded capture, filtering, collapse, and details. */
export function ConsoleWindow() {
  const snapshot = useEditorConsoleSnapshot();
  const commands = useEditorConsoleCommands();
  const { copy, feedback } = useConsoleCopy();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const followTailRef = useRef(true);
  const counts = useMemo(() => countEntries(snapshot.entries), [snapshot.entries]);
  const rows = useMemo(() => filterEntries(
    snapshot.options.collapse
      ? collapseConsoleEntries(snapshot.entries)
      : snapshot.entries.map((entry) => ({ entry, count: 1 })),
    snapshot.options,
    query,
  ), [query, snapshot.entries, snapshot.options]);
  const selected = rows.find(({ entry }) => entry.id === selectedId)?.entry
    ?? snapshot.entries.find((entry) => entry.id === selectedId)
    ?? null;
  const copySelected = () => {
    if (selected) void copy([rows.find(({ entry }) => entry.id === selected.id) ?? { entry: selected, count: 1 }]);
  };

  useEffect(() => {
    const list = listRef.current;
    if (list && followTailRef.current) list.scrollTop = list.scrollHeight;
  }, [rows.length, snapshot.entries.length]);

  return (
    <section className="console-window" aria-label="Editor Console">
      <header className="console-window__toolbar" aria-label="Console controls">
        <button
          type="button"
          className="console-window__clear"
          onClick={() => {
            commands.clear();
            setSelectedId(null);
          }}
          disabled={snapshot.entries.length === 0}
        >
          Clear
        </button>
        <span className="console-window__divider" aria-hidden="true" />
        <ConsoleToggle
          label="Collapse"
          pressed={snapshot.options.collapse}
          onChange={(value) => commands.setOption("collapse", value)}
        />
        <ConsoleToggle
          label="Clear on Play"
          pressed={snapshot.options.clearOnPlay}
          onChange={(value) => commands.setOption("clearOnPlay", value)}
        />
        <ConsoleToggle
          label="Error Pause"
          pressed={snapshot.options.errorPause}
          onChange={(value) => commands.setOption("errorPause", value)}
        />
        <ConsoleToggle
          label="Timestamp"
          pressed={snapshot.options.showTimestamps}
          onChange={(value) => commands.setOption("showTimestamps", value)}
        />

        <label className="console-window__search">
          <EditorIcon name="search" size="compact" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search"
            aria-label="Search Console"
          />
          {query && (
            <button type="button" aria-label="Clear Console search" onClick={() => setQuery("")}>
              <EditorIcon name="close" size="compact" />
            </button>
          )}
        </label>

        <div className="console-window__levels" role="group" aria-label="Console severity filters">
          {(Object.keys(LEVEL_OPTIONS) as EditorConsoleLevel[]).map((level) => {
            const option = LEVEL_OPTIONS[level];
            return (
              <button
                key={level}
                type="button"
                className={`console-window__level is-${level}`}
                aria-label={`Show ${LEVEL_LABELS[level]}`}
                aria-pressed={snapshot.options[option]}
                title={`${LEVEL_LABELS[level]}: ${counts[level]}`}
                onClick={() => commands.setOption(option, !snapshot.options[option])}
              >
                <EditorIcon name={LEVEL_ICONS[level]} size="compact" />
                <span>{counts[level]}</span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="console-window__copy-controls" role="group" aria-label="Copy Console messages">
        <button type="button" className="ghost-button compact" disabled={!selected} onClick={copySelected}
          title={selected ? "Copy the selected message, details and stack trace" : "Select a message first"}>
          <EditorIcon name="duplicate" size="compact" /> Copy selected
        </button>
        <button type="button" className="ghost-button compact" disabled={rows.length === 0} onClick={() => void copy(rows)}
          title="Copy all messages matching the current search and severity filters, including details and stack traces">
          <EditorIcon name="duplicate" size="compact" /> Copy visible ({rows.length})
        </button>
        <span role="status" aria-live="polite">{feedback}</span>
      </div>

      <div className="console-window__body">
        <div
          ref={listRef}
          className="console-window__list"
          role="listbox"
          aria-label="Console messages"
          onKeyDown={(event) => {
            if (selected && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && !event.altKey && !event.shiftKey) {
              event.preventDefault(); copySelected();
            }
          }}
          onScroll={(event) => {
            const element = event.currentTarget;
            followTailRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 20;
          }}
        >
          {rows.length === 0 ? (
            <div className="console-window__empty">
              <EditorIcon name="console" size="hero" />
              <strong>{snapshot.entries.length === 0 ? "No console messages" : "No messages match the filters"}</strong>
              <span>Runtime, editor, and browser output appears here.</span>
            </div>
          ) : rows.map(({ entry, count }) => (
            <button
              key={entry.id}
              type="button"
              className={`console-window__row is-${entry.level} ${selected?.id === entry.id ? "is-selected" : ""}`}
              role="option"
              aria-selected={selected?.id === entry.id}
              onClick={() => setSelectedId(entry.id)}
              onDoubleClick={() => void copy([{ entry, count }])}
            >
              <EditorIcon name={LEVEL_ICONS[entry.level]} size="compact" />
              {snapshot.options.showTimestamps && (
                <time dateTime={new Date(entry.timestamp).toISOString()}>{formatTimestamp(entry.timestamp)}</time>
              )}
              <span className="console-window__message">{entry.message}</span>
              {(entry.channel || entry.source) && (
                <small>{entry.channel || entry.source}</small>
              )}
              {count > 1 && <strong className="console-window__repeat" aria-label={`Repeated ${count} times`}>{count}</strong>}
            </button>
          ))}
        </div>

        <ConsoleDetails entry={selected} onCopy={copySelected} />
      </div>
    </section>
  );
}

function ConsoleToggle({
  label,
  pressed,
  onChange,
}: Readonly<{ label: string; pressed: boolean; onChange: (value: boolean) => void }>) {
  return (
    <button
      type="button"
      className="console-window__toggle"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
    >
      {label}
    </button>
  );
}

function ConsoleDetails({ entry, onCopy }: Readonly<{ entry: EditorConsoleEntry | null; onCopy: () => void }>) {
  if (!entry) {
    return <div className="console-window__details is-empty">Select a message to inspect its details and stack trace.</div>;
  }
  return (
    <article className={`console-window__details is-${entry.level}`} aria-label="Selected Console message">
      <header>
        <EditorIcon name={LEVEL_ICONS[entry.level]} size="compact" />
        <strong>{entry.channel || LEVEL_LABELS[entry.level]}</strong>
        {entry.code && <code>{entry.code}</code>}
        <time dateTime={new Date(entry.timestamp).toISOString()}>{new Date(entry.timestamp).toLocaleString()}</time>
        <button type="button" onClick={onCopy}>Copy</button>
      </header>
      <div className="console-window__detail-scroll">
        <pre>{entry.message}</pre>
        {entry.details && entry.details !== entry.message && <pre>{entry.details}</pre>}
        {entry.source && <div className="console-window__source">{entry.source}</div>}
        {entry.stack && <pre className="console-window__stack">{entry.stack}</pre>}
      </div>
    </article>
  );
}

function countEntries(entries: readonly EditorConsoleEntry[]): Record<EditorConsoleLevel, number> {
  const counts: Record<EditorConsoleLevel, number> = { log: 0, warning: 0, error: 0 };
  for (const entry of entries) counts[entry.level] += 1;
  return counts;
}

function filterEntries(
  entries: readonly CollapsedConsoleEntry[],
  options: ReturnType<typeof useEditorConsoleSnapshot>["options"],
  query: string,
): readonly CollapsedConsoleEntry[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return entries.filter(({ entry }) => {
    if (!options[LEVEL_OPTIONS[entry.level]]) return false;
    if (!normalizedQuery) return true;
    return [entry.message, entry.details, entry.channel, entry.code, entry.source]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
