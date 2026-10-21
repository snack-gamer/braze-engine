import { lazy, Suspense, useState } from "react";
import type { SceneObject } from "../../scene/domain/scene-object";
import { useProjectTags } from "../application/useProjectTags";
import "./entity-tags.css";

const LazyProjectTagsManager = lazy(async () => {
  const { ProjectTagsManager } = await import("./ProjectTagsManager");
  return { default: ProjectTagsManager };
});

/** Tag is an intrinsic identity field in the object header, not a component card. */
export function EntityTagHeader({ object, objects, onChange }: Readonly<{
  object: SceneObject; objects: readonly SceneObject[]; onChange: (tags: readonly string[]) => void;
}>) {
  const project = useProjectTags(), [open, setOpen] = useState(false);
  const assigned = object.tags?.[0] ?? "", missing = assigned && !project.catalog.names.includes(assigned);
  return <div className="entity-tag-header">
    <label>Tag <select className="editor-select" aria-label="Object tag" value={assigned} disabled={!project.ready || project.saving}
      onChange={(event) => onChange(event.currentTarget.value ? [event.currentTarget.value] : [])}>
      <option value="">Untagged</option>
      {missing && <option value={assigned}>{assigned} (missing definition)</option>}
      {project.catalog.names.map((name) => <option key={name} value={name}>{name}</option>)}
    </select></label>
    <button type="button" className="ghost-button compact" onClick={() => setOpen(true)}>Manage tags…</button>
    {project.error && <span role="alert">{project.error}</span>}
    {open && <Suspense fallback={<span role="status">Loading project tags…</span>}>
      <LazyProjectTagsManager project={project} objects={objects} onClose={() => setOpen(false)} />
    </Suspense>}
  </div>;
}
