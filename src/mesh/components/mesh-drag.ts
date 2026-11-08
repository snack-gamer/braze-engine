import { captureMeshReference, type MeshReference } from "../domain/mesh-reference";
export const MESH_DRAG_TYPE = "application/x-braze-mesh";
export function writeMeshDrag(transfer: DataTransfer, reference: MeshReference) {
  transfer.setData(MESH_DRAG_TYPE, JSON.stringify(reference)); transfer.effectAllowed = "copy";
}
export function readMeshDrag(transfer: DataTransfer): MeshReference | undefined {
  try { return captureMeshReference(JSON.parse(transfer.getData(MESH_DRAG_TYPE))); } catch { return undefined; }
}
