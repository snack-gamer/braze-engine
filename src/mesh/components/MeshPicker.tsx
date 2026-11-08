import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LibraryAsset } from "../../lib/asset-api";
import { EditorIcon } from "../../ui/EditorIcon";
import { SceneComponentIdentity } from "../../components/scene/SceneComponentPresentation";
import { BUILTIN_MESHES, type MeshReference } from "../domain/mesh-reference";
import { meshBindingForReference } from "../application/mesh-assignment";

type Choice = { name: string; detail: string; value: MeshReference };
export function MeshPicker({ assets, value, onChoose, onClose }: {
  assets: readonly LibraryAsset[]; value: MeshReference; onChoose: (mesh: MeshReference) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const choices: Choice[] = [{ name: "None (Mesh)", detail: "Clear geometry", value: null },
    ...BUILTIN_MESHES.map((primitive) => ({ name: primitive[0].toUpperCase() + primitive.slice(1), detail: "Built-in",
      value: { kind: "builtin", primitive } as MeshReference }))];
  for (const asset of assets) for (const sub of asset.subAssets ?? []) {
    if (!asset.guid || sub.kind !== "mesh") continue;
    const reference: MeshReference = { kind: "asset", asset: { guid: asset.guid, localId: sub.localId } };
    try { meshBindingForReference(reference, [asset]); choices.push({ name: sub.name, detail: asset.filename, value: reference }); } catch { /* Ineligible sources never masquerade as assignable meshes. */ }
  }
  const matches = choices.filter((item) => `${item.name} ${item.detail}`.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const modal = dialog.current!;
    modal.showModal(); search.current?.focus();
    return () => { modal.close(); previous?.focus(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="mesh-picker" aria-label="Select Mesh" onCancel={(event) => {
    event.preventDefault(); onClose();
  }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={(event) => {
    event.stopPropagation();
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (event.target === search.current && event.key !== "ArrowDown") return;
    const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    if (!options.length) return;
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
      : event.key === "ArrowDown" ? (index + 1) % options.length : (index - 1 + options.length) % options.length;
    event.preventDefault(); options[next]?.focus();
  }}>
    <div className="mesh-picker__content">
      <header><strong>Select Mesh</strong><button type="button" className="icon-button" aria-label="Close mesh picker" onClick={onClose}><EditorIcon name="close" size="compact" /></button></header>
      <input ref={search} type="search" aria-label="Search meshes" placeholder="Search meshes" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="mesh-picker__list" role="listbox" aria-label="Meshes">
        {matches.slice(0, 100).map((item) => <button type="button" role="option" key={JSON.stringify(item.value)}
          aria-selected={JSON.stringify(value) === JSON.stringify(item.value)} title={`${item.name} (${item.detail})`}
          onClick={() => onChoose(item.value)}>
          <SceneComponentIdentity componentId="meshFilter" label="" size="control" /><span>{item.name}<small>{item.detail}</small></span>
        </button>)}
        {!matches.length && <p>No matching meshes.</p>}
      </div>
      {matches.length > 100 && <p>Showing 100 of {matches.length}. Refine your search.</p>}
    </div>
  </dialog>, document.body);
}
