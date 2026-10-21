import type { CSSProperties } from "react";
import type { DockRect } from "./layout";

export function dockFrameStyle(rect: DockRect): CSSProperties {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${Math.max(0, rect.width)}px`,
    height: `${Math.max(0, rect.height)}px`,
  };
}
