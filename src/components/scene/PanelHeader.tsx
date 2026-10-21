import { type ReactNode } from "react";
import { toneClassName, type EditorTone } from "../../ui/tones";

type PanelHeaderProps = {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  /** Category tone of the inspected thing; tints the icon chip. Neutral when omitted. */
  tone?: EditorTone;
};

// The title block of a right-rail panel: the identity of what is being
// inspected (an object, "Render Settings"). It is not a bar. It sits on the pane
// surface and carries the largest type in the Inspector, so the hierarchy reads
// object > component header > group label instead of stacked chrome bars.
export function PanelHeader({ title, icon, actions, tone }: PanelHeaderProps) {
  return (
    <header className={`panel-header ${tone ? toneClassName(tone) : ""}`.trim()}>
      {icon && (
        <span className="panel-header__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <h2 className="panel-header__title">{title}</h2>
      {actions && <div className="panel-header__actions">{actions}</div>}
    </header>
  );
}
