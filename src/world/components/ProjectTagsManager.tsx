import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SceneObject } from "../../scene/domain/scene-object";
import type { useProjectTags } from "../application/useProjectTags";
import { fetchProjectTagUsage, type TagUsage } from "../adapters/project-tags-api";

export function ProjectTagsManager({ project, objects, onClose }: Readonly<{
  project: ReturnType<typeof useProjectTags>; objects: readonly SceneObject[]; onClose: () => void;
}>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(""), [selected, setSelected] = useState(project.catalog.names[0] ?? "");
  const [usage, setUsage] = useState<TagUsage | null>(null), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  useEffect(() => { const node = dialog.current!; node.showModal(); return () => node.close(); }, []);
  useEffect(() => {
    const abort = new AbortController(); setUsage(null); setError("");
    void fetchProjectTagUsage(abort.signal).then((value) => { if (!abort.signal.aborted) setUsage(value); })
      .catch((failure) => { if (!abort.signal.aborted) setError(String(failure)); });
    return () => abort.abort();
  }, [refresh]);
  const assignments = useMemo(() => objects.filter((object) => object.tags?.includes(selected)), [objects, selected]);
  const saved = useMemo(() => usage?.assignments.filter((entry) => entry.tag === selected) ?? [], [usage, selected]);
  const names = useMemo(() => [...new Set([...project.catalog.names, ...objects.flatMap((object) => object.tags ?? []),
    ...usage?.assignments.map((entry) => entry.tag) ?? []])].sort(), [project.catalog.names, objects, usage]);
  const add = () => { void project.saveNames([...project.catalog.names, name.trim()]); };
  return createPortal(<dialog ref={dialog} className="project-tags-manager" aria-label="Project Tags" onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDown={(event) => event.stopPropagation()}>
    <header><h2>Project Tags</h2><button type="button" className="ghost-button compact" onClick={onClose}>Close tags</button></header>
    <p>Define tags once, then choose one in each object's header. Untagged means no assignment.</p>
    <div className="project-tags-manager__create">
      <input className="editor-input" aria-label="New tag name" placeholder="New tag name" value={name} maxLength={48} onChange={(event) => setName(event.currentTarget.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
      <button type="button" className="ghost-button compact" disabled={!project.ready || project.saving || !name.trim()} onClick={add}>Add tag</button>
      <button type="button" className="ghost-button compact" onClick={() => setRefresh((value) => value + 1)}>Refresh usage</button>
    </div>
    {(project.error || error) && <p role="alert">{project.error || error}</p>}
    {project.saving && <p role="status">Saving project tags…</p>}
    <div className="project-tags-manager__columns">
      <div className="project-tags-manager__names" aria-label="Tag definitions">
        {names.slice(0, 512).map((tag) => <button type="button" className="ghost-button compact" key={tag} aria-pressed={selected === tag} onClick={() => setSelected(tag)}>
          {tag}{!project.catalog.names.includes(tag) && " (missing definition)"}
        </button>)}
        {names.length === 0 && <p>No project tags yet.</p>}
        {names.length > 512 && <p>Showing the first 512 names.</p>}
      </div>
      <section aria-label="Tag assignments">
        <h3>{selected || "Select a tag"}</h3>
        {selected && !project.catalog.names.includes(selected) && <button type="button" className="ghost-button compact" disabled={!project.ready || project.saving}
          onClick={() => void project.saveNames([...project.catalog.names, selected])}>Register tag</button>}
        <h4>Open document: {assignments.length} {assignments.length === 1 ? "assignment" : "assignments"}</h4>
        <p>Includes unsaved scene or prefab edits.</p>
        <ul>{assignments.slice(0, 200).map((object) => <li key={object.id}>{object.name} <small>({object.id})</small></li>)}</ul>
        <h4>Saved project: {saved.length} {saved.length === 1 ? "assignment" : "assignments"}</h4>
        <p>Saved scenes and prefab sources; the open document may also appear here.</p>
        {!usage && !error && <p role="status">Reading saved assignments…</p>}
        {usage && !usage.complete && <p role="alert">Usage audit is incomplete. {usage.issues.join("; ") || "Scan limit reached."}</p>}
        <ul>{saved.slice(0, 200).map((entry, index) => <li key={`${entry.source}:${entry.objectId}:${index}`}>{entry.objectName} <small>{entry.source} · {entry.objectId}</small></li>)}</ul>
        {(assignments.length > 200 || saved.length > 200) && <p>Showing the first 200 assignments in each list.</p>}
        {selected && project.catalog.names.includes(selected) && <button type="button" className="ghost-button compact"
          disabled={project.saving || !usage?.complete || Boolean(assignments.length || saved.length)}
          title="Remove only unused definitions after a complete usage audit. Clear assignments and save first."
          onClick={() => void project.saveNames(project.catalog.names.filter((tag) => tag !== selected))}>Remove unused tag</button>}
      </section>
    </div>
  </dialog>, document.body);
}
