import type { ReactNode } from "react";
import { EditorCheckbox } from "../ui/controls/EditorCheckbox";

type InspectorRowKeyState = "none" | "animated" | "override";

type InspectorRowProps = {
  label?: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  variant?: "inline" | "stacked" | "vec";
  className?: string;
  muted?: boolean;
  keyState?: InspectorRowKeyState;
  // Optional-property enablement belongs beside the property label. This is
  // distinct from a boolean property, whose value uses InspectorToggle in the
  // control column. Never model a boolean with an Off/On segmented control.
  enable?: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    ariaLabel?: string;
    disabled?: boolean;
  };
};

export function InspectorRow({
  label,
  children,
  icon,
  actions,
  variant = "inline",
  className = "",
  muted = false,
  keyState = "none",
  enable,
}: InspectorRowProps) {
  const hasHead = label !== undefined || icon || actions || enable;
  const classes = [
    "inspector-row",
    `inspector-row--${variant}`,
    muted ? "is-muted" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const keyTitle =
    keyState === "animated"
      ? "Animated"
      : keyState === "override"
        ? "Overrides prefab"
        : undefined;
  return (
    <div className={classes} data-key-state={keyState}>
      <span className="inspector-row__gutter" aria-hidden="true" title={keyTitle}>
        {keyState === "animated" && <span className="inspector-row__key inspector-row__key--anim" />}
        {keyState === "override" && <span className="inspector-row__key inspector-row__key--override" />}
      </span>
      {hasHead && (
        <div className="inspector-row__head">
          {enable && (
            <EditorCheckbox
              className="inspector-row__enable"
              checked={enable.checked}
              disabled={enable.disabled}
              aria-label={enable.ariaLabel}
              onChange={(event) => enable.onChange(event.currentTarget.checked)}
            />
          )}
          {icon && <span className="inspector-row__icon">{icon}</span>}
          {label !== undefined && <span className="inspector-row__label">{label}</span>}
          {actions && <span className="inspector-row__actions">{actions}</span>}
        </div>
      )}
      <div className="inspector-row__control">{children}</div>
    </div>
  );
}
