import type { SVGProps } from "react";
import { editorIcons, type EditorIconName } from "./icons";

export type EditorIconSize =
  | "micro"
  | "compact"
  | "control"
  | "disclosure"
  | "row-action"
  | "indicator"
  | "tree"
  | "toolbar"
  | "transport"
  | "brand"
  | "hero"
  | "preview";

export type EditorIconWeight = "fine" | "regular" | "strong";

export type EditorIconProps = Omit<SVGProps<SVGSVGElement>, "width" | "height" | "size" | "strokeWidth"> & {
  /** Semantic registry name. */
  name: EditorIconName;
  /** Theme-backed size role; never a pixel value. */
  size?: EditorIconSize;
  weight?: EditorIconWeight;
  filled?: boolean;
};

export function EditorIcon({
  name,
  size = "control",
  weight = "regular",
  filled = false,
  className = "",
  ...props
}: EditorIconProps) {
  const Icon = editorIcons[name];
  const classes = [
    "editor-icon",
    `editor-icon--${size}`,
    `editor-icon--stroke-${weight}`,
    filled ? "editor-icon--filled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <Icon className={classes} aria-hidden={props["aria-label"] ? undefined : true} {...props} />;
}
