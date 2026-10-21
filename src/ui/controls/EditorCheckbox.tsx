import type { InputHTMLAttributes } from "react";

export type EditorCheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** Native checkbox semantics with the shared Braze editor skin. */
export function EditorCheckbox({ className = "", ...props }: EditorCheckboxProps) {
  return <input type="checkbox" className={`editor-checkbox ${className}`.trim()} {...props} />;
}
