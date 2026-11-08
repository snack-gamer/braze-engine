import { useRef, useState } from "react";

/** Same draft/Enter/blur/Escape contract as other Inspector name fields. */
export function ProjectTagNameField({ name, index, selected, disabled, missing, onSelect, onRename }: {
  name: string; index: number; selected: boolean; disabled: boolean; missing: boolean;
  onSelect: () => void; onRename: (name: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(name), [error, setError] = useState("");
  const cancel = useRef(false), busy = useRef(false);
  const commit = async () => {
    if (cancel.current) { cancel.current = false; return; }
    if (busy.current || draft === name || missing) return;
    busy.current = true; setError("");
    try {
      if (await onRename(draft)) setDraft(draft.trim());
      else setError("Rename was not saved. Check the message below.");
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { busy.current = false; }
  };
  return <div className={`project-tag-row ${selected ? "is-selected" : ""}`}>
    <label><span>Tag {index}</span><input className="editor-input" aria-label={`Tag ${name} name`} value={draft}
      aria-invalid={Boolean(error)} aria-describedby={error ? `tag-error-${name}` : undefined}
      maxLength={48} disabled={disabled} readOnly={missing} title={missing ? "Register this missing definition before renaming." : "Enter to rename. Escape to cancel."}
      onFocus={onSelect} onChange={(event) => { setDraft(event.target.value); setError(""); }}
      onBlur={() => void commit()} onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
        if (event.key === "Escape") { event.preventDefault(); cancel.current = true; setDraft(name); setError(""); event.currentTarget.blur(); }
      }} /></label>
    {error && <p id={`tag-error-${name}`} role="alert">{error}</p>}
  </div>;
}
