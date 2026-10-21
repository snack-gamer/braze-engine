import type { ReactNode } from "react";
import {
  EditorPropertyRow,
  EditorToggle,
} from "../../ui";

type ModelImportToggleRowProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function ModelImportToggleRow({
  label,
  checked,
  onChange,
}: ModelImportToggleRowProps) {
  return (
    <EditorPropertyRow label={label}>
      <EditorToggle checked={checked} ariaLabel={label} onChange={onChange} />
    </EditorPropertyRow>
  );
}

type ModelImportSelectRowProps<T extends string | number> = {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
};

export function ModelImportSelectRow<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: ModelImportSelectRowProps<T>) {
  return (
    <EditorPropertyRow label={label}>
      <select
        value={value}
        aria-label={label}
        onChange={(event) => {
          const selected = options.find((option) => String(option.value) === event.target.value);
          if (selected) onChange(selected.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </EditorPropertyRow>
  );
}
