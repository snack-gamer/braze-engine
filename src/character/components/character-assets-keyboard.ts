export type CharacterAssetHistoryCommand = "undo" | "redo";

type CharacterAssetKeyboardEvent = Readonly<{
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}>;

/** Routes only panel-level history shortcuts; native text editing keeps its own undo stack. */
export function characterAssetHistoryCommand(
  event: CharacterAssetKeyboardEvent,
): CharacterAssetHistoryCommand | null {
  if (event.altKey || (!event.metaKey && !event.ctrlKey) || receivesNativeUndo(event.target)) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  return key === "y" ? "redo" : null;
}

function receivesNativeUndo(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as EventTarget & {
    tagName?: unknown;
    isContentEditable?: unknown;
    closest?: (selectors: string) => Element | null;
  };
  if (element.isContentEditable === true) return true;
  if (typeof element.tagName === "string" && /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName)) {
    return true;
  }
  return typeof element.closest === "function"
    && Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
}
