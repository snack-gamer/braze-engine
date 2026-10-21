import type { ReactNode } from "react";

type InspectorToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
};

// Pill switch — the canonical boolean control for inspector rows.
// Replaces the legacy `.toggle-row` checkbox pattern (square checkbox
// floating left-aligned inside a 1fr column with dead space to the right).
//
// Two usage modes:
//
//   1. Inside <InspectorRow label="..."> — pass NO `label` prop; the row
//      provides it. The switch fills the right edge of the control column.
//
//   2. Standalone, when the label + an optional description need to live
//      next to the switch (e.g. "Hierarchy row tint" with a sub-description):
//      pass `label={<><strong>...</strong><span>...</span></>}` and the
//      component renders both as a single labelled toggle row.
export function InspectorToggle({
  checked,
  onChange,
  label,
  ariaLabel,
  disabled = false,
}: InspectorToggleProps) {
  if (label === undefined) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        className={`inspector-toggle ${checked ? "is-on" : ""}`}
        onClick={() => {
          if (!disabled) onChange(!checked);
        }}
      >
        <span className="inspector-toggle__thumb" aria-hidden="true" />
      </button>
    );
  }
  return (
    <label className={`inspector-toggle-row ${disabled ? "is-disabled" : ""}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        className={`inspector-toggle ${checked ? "is-on" : ""}`}
        onClick={() => {
          if (!disabled) onChange(!checked);
        }}
      >
        <span className="inspector-toggle__thumb" aria-hidden="true" />
      </button>
      <div className="inspector-toggle-row__label">{label}</div>
    </label>
  );
}
