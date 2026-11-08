import { createElement, type SVGProps } from "react";
import { editorIconClassName, type EditorIconSize, type EditorIconWeight } from "./editor-icon-style";
import { editorIcons, type EditorIconName } from "./icons";

export type { EditorIconSize, EditorIconWeight } from "./editor-icon-style";

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
  const [, , nodes = []] = editorIcons[name];
  return (
    <svg
      data-icon={name}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={editorIconClassName(size, weight, filled, className)}
      aria-hidden={props["aria-label"] ? undefined : true}
      role={props["aria-label"] ? "img" : undefined}
      focusable="false"
      {...props}
    >
      {nodes.map(([tag, attributes], index) => createElement(tag, {
        ...Object.fromEntries(Object.entries(attributes).map(([key, value]) => [
          key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()), value,
        ])),
        key: index,
      }))}
    </svg>
  );
}
