import { useState } from "react";
import type { useProjectLayers } from "../application/useProjectLayers";

export function ProjectLayersEditor({ project }: { project: ReturnType<typeof useProjectLayers> }) {
  return <section className="project-layers-editor" aria-label="Layer definitions">
    <div className="project-layers-editor__list">
    {project.catalog.names.map((name, index) => <LayerName key={`${index}:${name}`} index={index} name={name}
      disabled={!project.ready || project.saving || index === 0}
      onSave={(value) => { const names = [...project.catalog.names]; names[index] = value; void project.saveNames(names); }} />)}
    </div>
    {project.error && <p role="alert">{project.error}</p>}
    {project.saving && <p role="status">Saving layers…</p>}
  </section>;
}

function LayerName({ index, name, disabled, onSave }: { index: number; name: string; disabled: boolean; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(name);
  return <label className="project-layers-editor__row"><span>{index === 0 ? "Builtin" : "User"} Layer {index}</span>
    <input className="editor-input" aria-label={`Layer ${index} name`} value={draft} disabled={disabled} maxLength={48}
      placeholder="Unnamed" onChange={(event) => setDraft(event.target.value)}
      onBlur={() => { if (draft.trim() !== name) onSave(draft.trim()); }}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
  </label>;
}
