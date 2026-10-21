import type { UiDocument, UiNode } from "./ui-document";
import type { UiPatch } from "./ui-validation";
export type { UiDocument, UiNode, UiStyle, UiLength, UiKind } from "./ui-document";
export type { UiPatch } from "./ui-validation";
export type UiAction = Readonly<{ screenId: string; nodeId: string; action: string; value?: string | number | boolean }>;
export type UiTweenValues = Readonly<{ opacity?: number; x?: number; y?: number; scale?: number; rotate?: number }>;
export type UiTweenOptions = Readonly<{
  /** Seconds on the fixed gameplay clock. Pause holds; Step advances one tick. */
  duration: number; delay?: number; easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "back-out";
  repeat?: number; yoyo?: boolean;
}>;
export type UiTween = Readonly<{ cancel: () => void; state: () => "running" | "completed" | "cancelled" }>;
export type UiScreen = Readonly<{
  id: string;
  inspect: (nodeId: string) => UiNode;
  /** Sparse runtime values only; never writes the authored scene. Style values merge. */
  update: (nodeId: string, patch: UiPatch) => void;
  /** Actions are queued by controls and delivered inside the next fixed tick. */
  on: (action: string, listener: (event: UiAction) => void) => () => void;
  tween: (nodeId: string, to: UiTweenValues, options: UiTweenOptions) => UiTween;
  dispose: () => void;
}>;
export type GameUi = Readonly<{
  create: (id: string, document: UiDocument) => UiScreen;
  /** Saved canvases are addressed by their owning scene object's ID. */
  screen: (id: string) => UiScreen | undefined;
}>;
