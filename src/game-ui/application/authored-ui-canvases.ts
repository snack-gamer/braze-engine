import type { SceneObject } from "../../scene/domain/scene-object";
import type { UiDocument } from "../domain/ui-document";

/** Cold Play capture. Scene transforms do not position screen-space canvases. */
export function authoredUiCanvases(objects: readonly SceneObject[]) {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const result: { id: string; document: UiDocument }[] = [];
  for (const object of objects) {
    if (!object.uiCanvas || object.uiCanvas.unavailable) continue;
    let current: SceneObject | undefined = object, visible = true;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id); visible &&= current.visible; current = byId.get(current.parentId ?? "");
    }
    const { unavailable: _unavailable, extensions: _extensions, ...document } = object.uiCanvas;
    result.push({ id: object.id, document: { ...document, enabled: visible && document.enabled } });
  }
  return result;
}
