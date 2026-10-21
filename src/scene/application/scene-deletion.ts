import { prepareSceneDocument, type PreparedSceneDocument } from "./scene-document-preparation";
import type { SceneEditorPort, SceneWorkspacePorts } from "./scene-workspace";

export type SceneDeletion = { sceneId: string; name: string; revision: string; instanceId?: number };

/** Prepares the replacement before removal; failures keep the current instance alive. */
export async function deleteWorkspaceScene(ports: SceneWorkspacePorts, current: SceneEditorPort, activeId: string,
  target: SceneDeletion, guard: () => void): Promise<{ replacement: PreparedSceneDocument | null; trashId: string }> {
  let replacement: PreparedSceneDocument | null = null;
  let created: { id: string; revision: string } | null = null;
  let revision = target.revision;
  if (target.sceneId === activeId) {
    if (target.instanceId === undefined && current.savedRevision() !== revision) throw new Error("Scene changed since deletion was requested. Cancel and try again.");
    const candidates = (await ports.list()).filter((scene) => scene.id !== activeId); guard();
    const next = candidates.find((scene) => scene.id === "current") ?? candidates[0];
    if (next) replacement = prepareSceneDocument(next.id, await ports.read(next.id));
    guard();
    if (!await current.save()) throw new Error("Scene could not be saved before deletion.");
    guard();
    revision = current.savedRevision() ?? "";
    if (!revision) throw new Error("Scene has no saved revision.");
  }
  try {
    if (target.sceneId === activeId && !replacement) {
      const id = ports.newId(), scene = ports.create("New Scene", "basic");
      const prepared = prepareSceneDocument(id, { scene, revision: null });
      const written = await ports.write(scene, id); created = { id, revision: written.revision }; guard();
      replacement = { ...prepared, revision: written.revision };
    }
    const deleted = await ports.remove(target.sceneId, revision);
    return { replacement, trashId: deleted.trashId };
  } catch (cause) {
    if (created) await ports.remove(created.id, created.revision).catch(() => undefined);
    throw cause;
  }
}
