import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorIcon } from "./EditorIcon";
import { EditorCheckbox, EditorRange } from "./controls";
import "./grid-settings-controls.css";

export type GridSettingsValueProps = Readonly<{
  visible: boolean;
  opacity: number;
  onVisibleChange: (visible: boolean) => void;
  onOpacityChange: (opacity: number) => void;
}>;

type GridSettingsFieldsProps = GridSettingsValueProps & Readonly<{
  className?: string;
  children?: ReactNode;
}>;

export function GridSettingsFields({
  visible,
  opacity,
  onVisibleChange,
  onOpacityChange,
  className = "",
  children,
}: GridSettingsFieldsProps) {
  return (
    <div className={`grid-settings-fields ${className}`.trim()}>
      <label className="grid-settings-fields__toggle">
        <EditorCheckbox checked={visible} onChange={(event) => onVisibleChange(event.currentTarget.checked)} />
        <span>Show grid</span>
      </label>
      <div className="grid-settings-fields__body" aria-disabled={!visible}>
        <label className="grid-settings-fields__row">
          <span>Opacity</span>
          <EditorRange
            aria-label="Grid opacity"
            min={0}
            max={1}
            step={0.01}
            value={opacity}
            disabled={!visible}
            onChange={(event) => onOpacityChange(Number(event.currentTarget.value))}
          />
          <output>{opacity.toFixed(2)}</output>
        </label>
        {children}
      </div>
    </div>
  );
}

type GridSettingsPopoverProps = GridSettingsValueProps & Readonly<{
  placement: "above" | "below";
  className?: string;
}>;

export function GridSettingsPopover({
  visible,
  opacity,
  onVisibleChange,
  onOpacityChange,
  placement,
  className = "",
}: GridSettingsPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`grid-settings-popover grid-settings-popover--${placement} ${className}`.trim()}>
      <button
        type="button"
        className={`grid-settings-popover__trigger ghost-button compact ${visible ? "active" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-label="Grid settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Grid visibility and opacity"
      >
        <EditorIcon name="wireframe" size="compact" />
        <span>Grid</span>
        <EditorIcon name="disclosureOpen" size="compact" />
      </button>
      {open && (
        <div className="grid-settings-popover__panel" role="dialog" aria-label="Grid settings">
          <header>Preview Grid</header>
          <GridSettingsFields
            visible={visible}
            opacity={opacity}
            onVisibleChange={onVisibleChange}
            onOpacityChange={onOpacityChange}
          />
        </div>
      )}
    </div>
  );
}
