import type { ReactNode } from "react";

type InspectorPresetGridProps<T extends string> = {
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
};

// Preset picker — a row of equal-width buttons. The canonical control for
// aspect-ratio pickers, primitive pickers, and other "pick one of a few
// presets" rows that don't fit a dropdown's vertical flow.
//
// Replaces ad-hoc .preset-row + .preset-button used in image/video inspectors.

export function InspectorPresetGrid<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: InspectorPresetGridProps<T>) {
  return (
    <div className="inspector-preset-grid" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            className={`inspector-preset-grid__button ${active ? "is-active" : ""}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
