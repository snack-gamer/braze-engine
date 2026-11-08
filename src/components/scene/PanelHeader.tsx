import { useEffect, useRef, useState, type ReactNode } from "react";
import { toneClassName, type EditorTone } from "../../ui/tones";

type PanelHeaderProps = {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
  nameField?: { id: string; value: string; onChange: (value: string) => void };
  /** Category tone of the inspected thing; tints the icon chip. Neutral when omitted. */
  tone?: EditorTone;
};

// The title block of a right-rail panel: the identity of what is being
// inspected (an object, "Render Settings"). It is not a bar. It sits on the pane
// surface and carries the largest type in the Inspector, so the hierarchy reads
// object > component header > group label instead of stacked chrome bars.
export function PanelHeader({ title, icon, actions, tone, nameField, leading }: PanelHeaderProps) {
  return (
    <header className={`panel-header ${nameField ? "panel-header--object" : ""} ${tone ? toneClassName(tone) : ""}`.trim()}>
      {icon && (
        <span className="panel-header__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {leading}
      {nameField ? (
        <ObjectNameField key={nameField.id} value={nameField.value} onCommit={nameField.onChange} />
      ) : <h2 className="panel-header__title">{title}</h2>}
      {actions && <div className="panel-header__actions">{actions}</div>}
    </header>
  );
}

function ObjectNameField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const cancel = useRef(false);
  useEffect(() => setDraft(value), [value]);
  return <input className="panel-header__name" aria-label="Object name" value={draft}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={() => {
      if (!cancel.current) {
        const name = draft.trim() || "Untitled";
        if (name !== value) onCommit(name);
        setDraft(name);
      }
      cancel.current = false;
    }}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); cancel.current = true; setDraft(value); event.currentTarget.blur(); }
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
    }} />;
}
