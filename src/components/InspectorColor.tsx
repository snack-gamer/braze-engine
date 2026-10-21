import { useEffect, useState, type FormEvent } from "react";

type InspectorColorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
};

// Color input — chip + hex code. The canonical color row control.
// Replaces ad-hoc .brdf-color-row and inline <input type="color"/>.

function normalizeHex(raw: string): string | null {
  const trimmed = raw.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(trimmed)) return null;
  return `#${trimmed.toLowerCase()}`;
}

function displayHex(value: string): string {
  const trimmed = value.trim().replace(/^#/, "").toUpperCase();
  return `#${trimmed.padEnd(6, "0").slice(0, 6)}`;
}

export function InspectorColor({ value, onChange, disabled = false, ariaLabel }: InspectorColorProps) {
  const [draft, setDraft] = useState(displayHex(value));

  useEffect(() => {
    setDraft(displayHex(value));
  }, [value]);

  const handlePickerChange = (event: FormEvent<HTMLInputElement>) => {
    if (disabled) return;
    onChange(event.currentTarget.value);
  };

  const commitHex = () => {
    const normalized = normalizeHex(draft);
    if (normalized) onChange(normalized);
    else setDraft(displayHex(value));
  };

  return (
    <div className="inspector-color">
      <span className="inspector-color__chip" style={{ background: value }}>
        <input
          type="color"
          value={value}
          disabled={disabled}
          onInput={handlePickerChange}
          onChange={handlePickerChange}
          aria-label={ariaLabel}
        />
      </span>
      <input
        type="text"
        className="inspector-color__hex"
        value={draft}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitHex}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            setDraft(displayHex(value));
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
