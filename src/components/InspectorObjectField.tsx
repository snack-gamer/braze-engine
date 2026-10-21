import type { ReactNode } from "react";
import { EditorIcon } from "../ui/EditorIcon";

// Canonical Unity-style object-reference field. Any component that points at
// an asset (Mesh, Material, Sprite, a scene object, …) renders it through this
// so the whole engine speaks one visual language:
//
//   [type icon]  Friendly Name .......................... [◎ pick]
//
// It shows a NAME, never a path or URL. The optional picker button is the only
// affordance for changing the reference — omit it for read-only references.
type InspectorObjectFieldProps = {
  name?: string;
  placeholder?: string;
  icon?: ReactNode;
  title?: string;
  disabled?: boolean;
  onPick?: () => void;
};

export function InspectorObjectField({
  name,
  placeholder = "None",
  icon,
  title,
  disabled = false,
  onPick,
}: InspectorObjectFieldProps) {
  const empty = !name;
  return (
    <div
      className={`object-field ${empty ? "is-empty" : ""} ${disabled ? "is-disabled" : ""}`}
      title={title ?? name ?? placeholder}
    >
      {icon && <span className="object-field__icon" aria-hidden="true">{icon}</span>}
      <span className="object-field__name">{name || placeholder}</span>
      {onPick && (
        <button
          type="button"
          className="object-field__pick"
          disabled={disabled}
          title="Select"
          aria-label="Select reference"
          onClick={onPick}
        >
          <EditorIcon name="objectPicker" size="control" />
        </button>
      )}
    </div>
  );
}
