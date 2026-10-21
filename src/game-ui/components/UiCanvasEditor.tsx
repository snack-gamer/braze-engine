import { useState } from "react";
import type { SceneObject } from "../../scene/domain/scene-object";
import { SceneComponentSection } from "../../components/scene/SceneComponentPresentation";
import { UI_KINDS, flattenUi, type UiDocument, type UiKind } from "../domain/ui-document";
import { parseUiCanvas, encodeUiCanvas } from "../serialization/ui-canvas-codec";
import { editUiDocument, type UiEdit } from "../application/ui-authoring";
import { UiNodeFields } from "./UiNodeFields";
import { UiResponsiveFields } from "./UiResponsiveFields";
import { UiPreview } from "./UiPreview";
import "./ui-canvas-editor.css";

export type UiCanvasEditorProps = { object: SceneObject; updateObject: (id: string, patch: Partial<SceneObject>) => void };
export function UiCanvasEditor({ object, updateObject }: UiCanvasEditorProps) {
  const [selected, select] = useState("root"), [kind, setKind] = useState<UiKind>("button");
  const [error, setError] = useState<string>(), [draft, setDraft] = useState<{ base: string; text: string }>();
  const canvas = object.uiCanvas;
  if (!canvas) return null;
  const encoded = encodeUiCanvas(canvas), source = JSON.stringify(encoded, null, 2);
  const { extensions: _extensions, unavailable: _unavailable, ...supported } = canvas;
  const document: UiDocument | null = canvas.unavailable ? null : supported;
  const nodes = document ? flattenUi(document.root) : [], node = nodes.find((item) => item.id === selected) ?? document?.root;
  const commit = (run: () => unknown) => {
    try { const value = parseUiCanvas(run()); updateObject(object.id, { uiCanvas: value }); setError(undefined); return true; }
    catch (failure) { setError(String(failure)); return false; }
  };
  const edit = (operation: UiEdit) => document && commit(() => ({ ...canvas.extensions, ...editUiDocument(document, operation) }));
  return <SceneComponentSection componentId="uiCanvas" id="object.uiCanvas" className="ui-canvas-editor" defaultOpen onRemove={() => updateObject(object.id, { uiCanvas: undefined })}>
    <p>Responsive screen-space layout. Bind named actions and animate nodes through <code>context.ui</code>.</p>
    {canvas.unavailable && <p role="alert">{canvas.unavailable.message} Original data is retained. Replace the document below to recover.</p>}
    {document && <>
      <label className="ui-canvas-row">Enabled <input aria-label="UI Canvas enabled" type="checkbox" checked={document.enabled} onChange={(event) => commit(() => ({ ...encoded as object, enabled: event.target.checked }))} /></label>
      <label className="ui-canvas-row">Gamepad navigation <input aria-label="UI gamepad navigation" type="checkbox" checked={document.navigation?.enabled ?? false} onChange={(event) => commit(() => ({ ...encoded as object, navigation: { ...document.navigation, enabled: event.target.checked } }))} /></label>
      <UiPreview document={document} selected={node?.id} onSelect={select} />
      <label className="ui-canvas-row">Element <select aria-label="UI element" value={node?.id} onChange={(event) => select(event.target.value)}>
        {nodes.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.kind}</option>)}
      </select></label>
      <div className="ui-canvas-row"><select aria-label="New UI element kind" value={kind} onChange={(event) => setKind(event.target.value as UiKind)}>
        {UI_KINDS.map((item) => <option key={item}>{item}</option>)}
      </select><button className="ghost-button compact" onClick={() => edit({ op: "add", kind, parentId: node?.kind === "panel" ? node.id : document.root.id })}>Add UI element</button></div>
      {node && <><UiNodeFields node={node} change={(patch) => edit({ op: "patch", id: node.id, patch })} />
        <UiResponsiveFields key={node.id} node={node} change={(patch) => edit({ op: "patch", id: node.id, patch })} />
        {node.id !== document.root.id && <>
          <label className="ui-canvas-row">Parent <select aria-label="UI parent" value={nodes.find((item) => item.children?.some((child) => child.id === node.id))?.id}
            onChange={(event) => edit({ op: "move", id: node.id, parentId: event.target.value, index: 999 })}>
            {nodes.filter((item) => item.kind === "panel" && item.id !== node.id).map((item) => <option key={item.id}>{item.id}</option>)}
          </select></label>
          <div className="ui-canvas-row">{([-1, 1] as const).map((direction) => {
            const parent = nodes.find((item) => item.children?.some((child) => child.id === node.id))!;
            const index = parent.children!.findIndex((child) => child.id === node.id), next = index + direction;
            return <button key={direction} className="ghost-button compact" disabled={next < 0 || next >= parent.children!.length} onClick={() => edit({ op: "move", id: node.id, parentId: parent.id, index: next })}>{direction < 0 ? "Move earlier" : "Move later"}</button>;
          })}</div>
          <button className="ghost-button compact" onClick={() => edit({ op: "remove", id: node.id })}>Remove UI element</button>
        </>}
      </>}
    </>}
    <details className="ui-canvas-document"><summary>Full layout document</summary>
      <p>Edit breakpoints, theme tokens, anchors, ordering and all control settings. Apply is one undoable edit.</p>
      <textarea aria-label="UI layout document" spellCheck={false} value={draft?.text ?? source} onChange={(event) => setDraft({ base: draft?.base ?? source, text: event.target.value })} />
      <button className="ghost-button compact" disabled={!draft} onClick={() => {
        if (!draft) return;
        if (draft.base !== source) { setError("UI changed while this draft was open. Reset the draft and reapply your edit."); return; }
        if (commit(() => JSON.parse(draft.text))) setDraft(undefined);
      }}>Apply layout</button>
      <button className="ghost-button compact" onClick={() => { setDraft(undefined); setError(undefined); }}>Reset draft</button>
    </details>
    {error && <p role="alert">{error}</p>}
  </SceneComponentSection>;
}
