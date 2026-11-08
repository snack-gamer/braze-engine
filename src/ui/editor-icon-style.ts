/** Shared presentation contract for React chrome and embedded DOM editors. */
export type EditorIconSize =
  | "status" | "micro" | "compact" | "control" | "disclosure" | "row-action"
  | "indicator" | "tree" | "toolbar" | "transport" | "brand" | "hero" | "preview";
export type EditorIconWeight = "fine" | "regular" | "strong";

export function editorIconClassName(
  size: EditorIconSize = "control",
  weight: EditorIconWeight = "regular",
  filled = false,
  className = "",
): string {
  return ["editor-icon", `editor-icon--${size}`, `editor-icon--stroke-${weight}`,
    filled ? "editor-icon--filled" : "", className].filter(Boolean).join(" ");
}
