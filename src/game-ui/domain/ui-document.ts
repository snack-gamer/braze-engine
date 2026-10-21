import type { AssetRef } from "../../assets/domain/asset-reference";

/** Screen-space layout in CSS pixels; percentages refer to the containing panel. */
export type UiLength = number | `${number}%` | "auto";
export type UiStyle = Readonly<{
  layout?: "row" | "column" | "grid" | "overlay";
  width?: UiLength; height?: UiLength; minWidth?: UiLength; maxWidth?: UiLength; minHeight?: UiLength; maxHeight?: UiLength;
  left?: UiLength; right?: UiLength; top?: UiLength; bottom?: UiLength;
  position?: "flow" | "absolute";
  gap?: number; padding?: number; grow?: number; columns?: number; cellMin?: number; wrap?: boolean;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "space-between" | "space-around";
  overflow?: "visible" | "hidden" | "auto";
  background?: string; color?: string; borderColor?: string; borderWidth?: number; radius?: number;
  font?: AssetRef; fit?: "contain" | "cover" | "fill";
  fontSize?: number; fontWeight?: number; textAlign?: "left" | "center" | "right";
  opacity?: number; x?: number; y?: number; scale?: number; rotate?: number;
  pointer?: "pass" | "block";
}>;
export type UiKind = "panel" | "text" | "image" | "button" | "input" | "slider" | "toggle" | "progress";
export type UiNode = Readonly<{
  id: string; kind: UiKind;
  image?: AssetRef;
  text?: string; label?: string; action?: string; value?: string | number | boolean;
  min?: number; max?: number; step?: number;
  visible?: boolean; disabled?: boolean;
  style?: UiStyle;
  /** Ascending min-width overrides, measured against this Game viewport, not the editor window. */
  responsive?: readonly Readonly<{ minWidth: number; style: UiStyle }>[];
  children?: readonly UiNode[];
}>;
export type UiDocument = Readonly<{
  version: 1; enabled: boolean; order: number;
  theme: Readonly<Record<string, string>>;
  /** Opt-in standard gamepad navigation, in authored tree order. */
  navigation?: Readonly<{ enabled: boolean; wrap?: boolean; initialFocus?: string; cancel?: string }>;
  root: UiNode;
}>;
export type UiCanvasComponent = UiDocument & Readonly<{
  /** Unsupported data is inert and round-trips until explicitly replaced or removed. */
  unavailable?: Readonly<{ message: string; source: unknown }>;
  extensions?: Readonly<Record<string, unknown>>;
}>;
export const UI_LIMITS = Object.freeze({ screens: 32, nodesPerScreen: 256, totalNodes: 1024, depth: 16, tweens: 128, events: 256, listeners: 256 });
export const UI_KINDS: readonly UiKind[] = ["panel", "text", "image", "button", "input", "slider", "toggle", "progress"];
export const UI_THEME = Object.freeze({ surface: "#172335ee", accent: "#72efd1", text: "#f5f8ff", muted: "#a9bbd2" });
export function createUiCanvas(): UiDocument {
  return { version: 1, enabled: true, order: 0, theme: { ...UI_THEME }, root: { id: "root", kind: "panel",
    style: { layout: "column", width: "100%", height: "100%", padding: 24, gap: 12, align: "start", pointer: "pass" },
    children: [{ id: "title", kind: "text", text: "Your game UI", style: { background: "$surface", color: "$text", padding: 16, radius: 12, fontSize: 24 } }] } };
}
export function flattenUi(root: UiNode): UiNode[] {
  return [root, ...(root.children ?? []).flatMap(flattenUi)];
}
