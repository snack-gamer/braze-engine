import { flattenUi, type UiCanvasComponent } from "../domain/ui-document";
/** Counts authored nodes that depend on these assets, including responsive font overrides. */
export function countUiAssetReferences(objects: readonly { uiCanvas?: UiCanvasComponent }[], guids: ReadonlySet<string>): number {
  return objects.reduce((sum, object) => sum + (object.uiCanvas && !object.uiCanvas.unavailable ? flattenUi(object.uiCanvas.root).filter((node) =>
    [node.image, node.style?.font, ...(node.responsive ?? []).map((rule) => rule.style.font)].some((ref) => ref && guids.has(ref.guid.toLowerCase()))).length : 0), 0);
}
