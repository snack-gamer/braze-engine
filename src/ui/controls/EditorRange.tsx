import type { CSSProperties, InputHTMLAttributes } from "react";

export type EditorRangeProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** Theme-owned native range for compact toolbars and popovers. */
export function EditorRange({ className = "", ...props }: EditorRangeProps) {
  const minimum = Number.isFinite(Number(props.min)) ? Number(props.min) : 0;
  const maximum = Number.isFinite(Number(props.max)) ? Number(props.max) : 100;
  const fallback = minimum + ((maximum - minimum) / 2);
  const current = Number.isFinite(Number(props.value ?? props.defaultValue))
    ? Number(props.value ?? props.defaultValue)
    : fallback;
  const fill = maximum <= minimum
    ? 0
    : Math.min(100, Math.max(0, ((current - minimum) / (maximum - minimum)) * 100));
  const rangeStyle = { "--editor-range-fill": `${fill}%` } as CSSProperties;

  return (
    <span className="editor-range-control" style={rangeStyle}>
      <span className="editor-range-control__track" aria-hidden="true">
        <span className="editor-range-control__fill" />
      </span>
      <input type="range" className={`editor-range ${className}`.trim()} {...props} />
    </span>
  );
}
