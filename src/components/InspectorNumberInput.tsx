import { useEffect, useState, type KeyboardEvent } from "react";
import {
  isContinuousAdjustmentKey,
  useHistoryInteraction,
} from "../history/useHistoryInteraction";
import { useScrub } from "../hooks/useScrub";

type InspectorNumberInputProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  unit?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

function clamp(value: number, min?: number, max?: number): number {
  let next = value;
  if (typeof min === "number") next = Math.max(min, next);
  if (typeof max === "number") next = Math.min(max, next);
  return next;
}

function formatValue(value: number, decimals: number): string {
  return decimals === 0 ? String(Math.round(value)) : value.toFixed(decimals);
}

function stepFor(decimals: number, step?: number): number {
  if (typeof step === "number" && Number.isFinite(step) && step > 0) return step;
  return decimals === 0 ? 1 : 1 / 10 ** decimals;
}

function multiplierFor(event: KeyboardEvent<HTMLInputElement>): number {
  if (event.shiftKey) return 10;
  if (event.altKey || event.ctrlKey || event.metaKey) return 0.1;
  return 1;
}

export function InspectorNumberInput({
  value,
  onChange,
  min,
  max,
  step,
  decimals = 2,
  unit,
  ariaLabel,
  disabled = false,
}: InspectorNumberInputProps) {
  const formatted = formatValue(clamp(value, min, max), decimals);
  const [draft, setDraft] = useState(formatted);
  const [editing, setEditing] = useState(false);
  const baseStep = stepFor(decimals, step);
  const keyboardInteraction = useHistoryInteraction();

  const { isScrubbing, scrubProps } = useScrub({
    value,
    onChange: (next) => onChange(clamp(next, min, max)),
    step,
    min,
    max,
    decimals,
    disabled,
    onScrubStart: () => setEditing(false),
  });

  useEffect(() => {
    if (!editing && !isScrubbing) setDraft(formatted);
  }, [editing, formatted, isScrubbing]);

  const commitValue = (next: number) => {
    if (disabled) return;
    const clamped = clamp(next, min, max);
    setDraft(formatValue(clamped, decimals));
    if (Math.abs(clamped - clamp(value, min, max)) > Number.EPSILON) {
      onChange(clamped);
    }
  };

  const commit = () => {
    setEditing(false);
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(formatted);
      return;
    }
    commitValue(parsed);
  };

  const nudge = (direction: 1 | -1, event: KeyboardEvent<HTMLInputElement>, page = false) => {
    event.preventDefault();
    setEditing(false);
    const parsed = Number(editing ? draft : formatted);
    const base = Number.isFinite(parsed) ? parsed : clamp(value, min, max);
    commitValue(base + direction * baseStep * multiplierFor(event) * (page ? 10 : 1));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isContinuousAdjustmentKey(event.key)) keyboardInteraction.begin();
    if (event.key === "Enter") {
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setEditing(false);
      setDraft(formatted);
      event.currentTarget.blur();
    } else if (event.key === "ArrowUp") {
      nudge(1, event);
    } else if (event.key === "ArrowDown") {
      nudge(-1, event);
    } else if (event.key === "PageUp") {
      nudge(1, event, true);
    } else if (event.key === "PageDown") {
      nudge(-1, event, true);
    } else if (event.key === "Home" && typeof min === "number") {
      event.preventDefault();
      commitValue(min);
    } else if (event.key === "End" && typeof max === "number") {
      event.preventDefault();
      commitValue(max);
    }
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isContinuousAdjustmentKey(event.key)) keyboardInteraction.end();
  };

  return (
    <span
      className={`inspector-number ${isScrubbing ? "is-scrubbing" : ""}`}
      title="Drag horizontally to scrub. Use arrow keys to step."
      {...scrubProps}
    >
      <input
        className="inspector-number__input"
        type="number"
        inputMode="decimal"
        autoComplete="off"
        min={min}
        max={max}
        step={step}
        value={editing ? draft : formatted}
        aria-label={ariaLabel}
        disabled={disabled}
        onFocus={() => setEditing(true)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          commit();
          keyboardInteraction.end();
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
      />
      {unit && <span className="inspector-number__unit">{unit}</span>}
    </span>
  );
}
