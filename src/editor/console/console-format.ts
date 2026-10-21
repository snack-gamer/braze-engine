import type { EditorConsoleEntryInput, EditorConsoleLevel, EditorConsoleMethod } from "./console-types";

const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 40;
const MAX_OBJECT_KEYS = 60;
const MAX_TEXT_LENGTH = 12_000;
const CAPTURE_FRAME_MARKERS = [
  "/editor/console/browser-console-capture",
  "/editor/console/console-format",
  "/editor/console/EditorConsoleProvider",
  "/editor/console/editor-console-store",
];

export function consoleEntryFromArguments(
  method: EditorConsoleMethod,
  args: readonly unknown[],
  timestamp = Date.now(),
): EditorConsoleEntryInput {
  const level = consoleLevelForMethod(method);
  const rendered = args.map((value) => formatConsoleValue(value));
  const message = compactMessage(formatMessage(args, rendered));
  const suppliedError = args.find((value): value is Error => value instanceof Error);
  const stack = suppliedError?.stack ?? captureConsoleStack();
  return {
    level,
    method,
    message: message || `(empty ${method})`,
    details: rendered.join("\n"),
    stack,
    source: sourceFromConsoleStack(stack),
    channel: channelFromMessage(message),
    timestamp,
  };
}

export function consoleLevelForMethod(method: EditorConsoleMethod): EditorConsoleLevel {
  if (method === "error") return "error";
  if (method === "warn") return "warning";
  return "log";
}

export function formatConsoleValue(value: unknown): string {
  const seen = new WeakSet<object>();
  return truncate(formatValue(value, 0, seen));
}

export function sourceFromConsoleStack(stack: string | undefined): string {
  if (!stack) return "";
  const line = stack.split("\n")
    .map((candidate) => candidate.trim())
    .find((candidate) => (
      candidate.length > 0
      && !candidate.startsWith("Error")
      && !CAPTURE_FRAME_MARKERS.some((marker) => candidate.includes(marker))
    ));
  if (!line) return "";
  const sourceMatch = line.match(/(?:https?:\/\/[^/]+\/)?(src\/[^?\s)]+)(?:\?[^:\s)]*)?:(\d+):(\d+)/);
  if (sourceMatch) return `${sourceMatch[1]}:${sourceMatch[2]}`;
  return line.replace(/^at\s+/, "").slice(0, 180);
}

export function channelFromMessage(message: string): string {
  const match = message.match(/^\[([^\]]{1,40})\]/);
  return match?.[1] ?? "";
}

function formatMessage(args: readonly unknown[], rendered: readonly string[]): string {
  if (typeof args[0] !== "string") return rendered.join(" ");
  let replacementIndex = 1;
  const interpolated = args[0].replace(/%[sdifoO%]/g, (token) => {
    if (token === "%%") return "%";
    if (replacementIndex >= args.length) return token;
    const value = args[replacementIndex++];
    if (token === "%s") return String(value);
    if (token === "%d" || token === "%i") return String(Number.parseInt(String(value), 10));
    if (token === "%f") return String(Number.parseFloat(String(value)));
    return formatConsoleValue(value);
  });
  return [interpolated, ...rendered.slice(replacementIndex)].join(" ");
}

function compactMessage(message: string): string {
  return truncate(message.replace(/\s*\n\s*/g, " ").trim(), 2_000);
}

function captureConsoleStack(): string {
  const stack = new Error().stack ?? "";
  return stack.split("\n")
    .filter((line) => !CAPTURE_FRAME_MARKERS.some((marker) => line.includes(marker)))
    .join("\n");
}

function formatValue(value: unknown, depth: number, seen: WeakSet<object>): string {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (value instanceof Error) return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ""}`;
  if (typeof Element !== "undefined" && value instanceof Element) {
    const id = value.id ? `#${value.id}` : "";
    const className = typeof value.className === "string"
      ? value.className.trim().split(/\s+/).filter(Boolean).map((name) => `.${name}`).join("")
      : "";
    return `<${value.tagName.toLowerCase()}${id}${className}>`;
  }
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  if (depth >= MAX_DEPTH) return Array.isArray(value) ? "[Array]" : "[Object]";
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => formatValue(item, depth + 1, seen));
      if (value.length > MAX_ARRAY_ITEMS) items.push(`… ${value.length - MAX_ARRAY_ITEMS} more`);
      return `[${items.join(", ")}]`;
    }
    if (value instanceof Date) return value.toISOString();
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).slice(0, MAX_OBJECT_KEYS);
    const fields = keys.map((key) => `${key}: ${formatValue(record[key], depth + 1, seen)}`);
    const remaining = Object.keys(record).length - keys.length;
    if (remaining > 0) fields.push(`… ${remaining} more`);
    const name = value.constructor?.name && value.constructor.name !== "Object" ? `${value.constructor.name} ` : "";
    return `${name}{ ${fields.join(", ")} }`;
  } catch (error) {
    return `[Unserializable: ${error instanceof Error ? error.message : String(error)}]`;
  } finally {
    seen.delete(value);
  }
}

function truncate(value: string, limit = MAX_TEXT_LENGTH): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
}
