type SegmentedOption<T extends string> = {
  id: T;
  label: string;
  title?: string;
};

type InspectorSegmentedProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
};

/**
 * A choice between named, mutually exclusive modes (Local/World, XY/XZ/YZ).
 * Boolean values always use InspectorToggle; Off/On is not a mode selector.
 */
export function InspectorSegmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: InspectorSegmentedProps<T>) {
  return (
    <div
      className="inspector-segmented"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            className={active ? "active" : ""}
            aria-pressed={active}
            title={option.title}
            disabled={disabled}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
