import { ProjectTagNameField } from "./ProjectTagNameField";
import { validateTagRename } from "../domain/tag-rename";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SceneObject } from "../../scene/domain/scene-object";
import { PanelHeader } from "../../components/scene/PanelHeader";
import { EditorIcon } from "../../ui/EditorIcon";
import { useProjectTags } from "../application/useProjectTags";
import { useProjectLayers } from "../application/useProjectLayers";
import { useProjectTagUsage } from "../application/useProjectTagUsage";
import { ProjectLayersEditor } from "./ProjectLayersEditor";
import "./entity-tags.css";

/** Project settings are a normal Inspector target, with live document and saved usage. */
export function ProjectTagsManager({ initialTab, objects, onClose }: Readonly<{
  initialTab: "tags" | "layers"; objects: readonly SceneObject[]; onClose: () => void;
}>) {
  const project = useProjectTags(), layers = useProjectLayers();
  const { usage, checking, error, refresh } = useProjectTagUsage();
  const [name, setName] = useState(""), [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(initialTab === "tags"), [removing, setRemoving] = useState(false);
  const pendingName = useRef("");
  const operation = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const latestObjects = useRef(objects); latestObjects.current = objects;
  const [renaming, setRenaming] = useState(false);
  const assignments = useMemo(() => objects.filter((object) => object.tags?.includes(selected)), [objects, selected]);
  const saved = usage?.assignments.filter((entry) => entry.tag === selected) ?? [];
  const names = useMemo(() => [...new Set([...project.catalog.names, ...objects.flatMap((object) => object.tags ?? []),
    ...usage?.assignments.map((entry) => entry.tag) ?? []])].sort(), [project.catalog.names, objects, usage]);
  useEffect(() => {
    if (pendingName.current && project.catalog.names.includes(pendingName.current)) {
      setSelected(pendingName.current); setName(""); setCreating(false); pendingName.current = "";
    } else if (selected && !names.includes(selected)) setSelected("");
  }, [project.catalog.names, names, selected]);
  const busy = project.saving || renaming || removing;
  const add = async () => {
    const next = name.trim();
    if (!project.ready || operation.current || project.saving || !next) return;
    if (project.catalog.names.includes(next)) { setSelected(next); setName(""); setCreating(false); return; }
    operation.current = true; pendingName.current = next;
    try { if (!await project.saveNames([...project.catalog.names, next])) pendingName.current = ""; }
    finally { operation.current = false; }
  };
  const remove = async () => {
    if (!selected || assignments.length || operation.current || project.saving) return;
    operation.current = true;
    setRemoving(true);
    try {
      const latest = await refresh();
      if (mounted.current && latest?.complete
        && !latestObjects.current.some((object) => object.tags?.includes(selected))
        && !latest.assignments.some((entry) => entry.tag === selected)) {
        await project.saveNames(project.catalog.names.filter((tag) => tag !== selected));
      }
    } finally { operation.current = false; if (mounted.current) setRemoving(false); }
  };
  const rename = async (from: string, input: string): Promise<boolean> => {
    const next = validateTagRename(from, input, names);
    if (next === from) return true;
    if (operation.current || project.saving) throw new Error("Wait for the current tag change to finish.");
    operation.current = true; setRenaming(true);
    try {
      const fresh = await refresh();
      if (!mounted.current) return false;
      if (!fresh?.complete) throw new Error("Saved usage could not be verified. Try again when the usage check completes.");
      validateTagRename(from, next, fresh.assignments.map((entry) => entry.tag));
      const inDocument = latestObjects.current.some((object) => object.tags?.includes(from));
      if (inDocument || fresh.assignments.some((entry) => entry.tag === from)) {
        throw new Error(`"${from}" is in use. Clear its object assignments and save before renaming.`);
      }
      if (!project.catalog.names.includes(from)) throw new Error("This definition has changed. Reopen Tags and Layers before renaming.");
      const saved = await project.saveNames(project.catalog.names.map((tag) => tag === from ? next : tag));
      if (saved) { setSelected(next); pendingName.current = next; }
      return saved;
    } finally { operation.current = false; if (mounted.current) setRenaming(false); }
  };
  return <div className="rail-scroll project-identity-inspector" aria-label="Tags and Layers settings">
    <PanelHeader title="Tags and Layers" icon={<EditorIcon name="identitySettings" size="brand" />}
      actions={<button type="button" className="ghost-button compact" aria-label="Back to object Inspector" onClick={onClose}>Back</button>} />
    <details className="project-identity-section" open={initialTab === "tags"}>
      <summary className="inspector-section__head"><span className="project-identity-section__toggle"><EditorIcon name="disclosureClosed" size="disclosure" /></span><span className="inspector-section__title">Tags</span></summary>
      <div className="project-identity-section__content">
        <div className="project-tag-list" aria-label="Tag definitions">
          {names.map((tag, index) => <ProjectTagNameField key={tag} name={tag} index={index}
            selected={selected === tag} disabled={!project.ready || busy}
            missing={!project.catalog.names.includes(tag)} onSelect={() => setSelected(tag)}
            onRename={(next) => rename(tag, next)} />)}
          {names.length === 0 && <span className="project-tag-list__empty">List is empty</span>}
        </div>
        <div className="project-tag-list__actions">
          <button type="button" className="icon-button" aria-label="Add tag" title="Add tag" disabled={!project.ready || busy} onClick={() => setCreating(true)}><EditorIcon name="add" /></button>
          <button type="button" className="icon-button" aria-label="Remove selected tag" title="Remove unused tag" disabled={!project.catalog.names.includes(selected) || busy || checking || !usage?.complete || Boolean(assignments.length || saved.length)} onClick={() => void remove()}><EditorIcon name="remove" /></button>
        </div>
        {creating && <form className="project-tag-create" onSubmit={(event) => { event.preventDefault(); void add(); }}>
          <input className="editor-input" aria-label="New tag name" placeholder="New tag name" value={name} maxLength={48} autoFocus onChange={(event) => setName(event.target.value)} />
          <button type="submit" className="ghost-button compact" disabled={!project.ready || busy || !name.trim()}>Create</button>
        </form>}
        {project.error && <p role="alert">{project.error}</p>}
        {project.saving && <p role="status">Saving tags…</p>}
        {selected && <details className="project-tag-usage"><summary>Usage: {selected}</summary>
          {!project.catalog.names.includes(selected) && <button type="button" className="ghost-button compact" disabled={busy} onClick={() => void project.saveNames([...project.catalog.names, selected])}>Register tag</button>}
          <p>Open document: {assignments.length} assignments</p>
          <ul>{assignments.slice(0, 200).map((object) => <li key={object.id}>{object.name}</li>)}</ul>
          <p>Saved project: {usage ? `${saved.length} assignments` : "Checking…"}</p>
          <ul>{saved.slice(0, 200).map((entry, index) => <li key={`${entry.source}:${entry.objectId}:${index}`}>{entry.objectName}<small>{entry.source}</small></li>)}</ul>
          {checking && <small role="status">Updating saved usage…</small>}
          <small>Saved usage updates automatically. Save document changes to update it.</small>
        </details>}
        {error && <p role="alert">{error}</p>}
        {usage && !usage.complete && <p role="alert">Saved usage is incomplete. Tag removal is unavailable.</p>}
      </div>
    </details>
    <details className="project-identity-section" open={initialTab === "layers"}>
      <summary className="inspector-section__head"><span className="project-identity-section__toggle"><EditorIcon name="disclosureClosed" size="disclosure" /></span><span className="inspector-section__title">Layers</span></summary>
      <div className="project-identity-section__content"><ProjectLayersEditor project={layers} /></div>
    </details>
  </div>;
}
