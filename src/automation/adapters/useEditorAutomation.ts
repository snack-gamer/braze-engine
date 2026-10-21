import { useSceneWorkspace } from "../../scene/components/SceneWorkspaceContext";
import { createStaticSceneQueryCache } from "../application/static-scene-query";
import { useRenderSession } from "../../rendering/application/RenderSessionProvider";
import { physicsWorldForSession } from "../../three/physics/shared-physics-world";
import { parseRuntimeBodyCommand } from "../application/runtime-body-command";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import type { useHistory } from "../../hooks/useHistory";
import type { useSceneSync } from "../../hooks/useSceneSync";
import type { ScenePlaySessionController } from "../../editor/session/useScenePlaySaveSession";
import type { CameraState, SceneObject } from "../../types";
import type { PhysicsWorldController } from "../../physics/application/use-physics-world-controller";
import { SCENE_DOCUMENT_VERSION } from "../../scene/serialization/scene-document";
import { serializeSceneObject } from "../../scene/serialization/scene-object-encoder";
import { parseSceneObjects } from "../../scene/serialization/scene-object-decoder";
import { serializePhysicsWorldSettings } from "../../physics/serialization/codec";
import { executeSceneCommands, validateAutomationScene } from "../application/scene-commands";
import { connectAutomationEditor } from "./editor-connection";
import { inspectBehaviorCatalog } from "./behavior-catalog-command";
import { inspectGameUi } from "../../game-ui/adapters/ui-inspection-command";
import { editorAuthoringAssets } from "./editor-authoring-assets";
import { reconcileSceneAssetReferences } from "../../assets/application/scene-asset-resolution";

type Input = {
  objectsHistory: ReturnType<typeof useHistory<SceneObject[]>>;
  sceneSync: ReturnType<typeof useSceneSync>;
  playback: ScenePlaySessionController;
  physicsWorld: PhysicsWorldController;
  prefabModeActive: boolean;
  activeObjectId: string;
  selectSceneObject: (id: string) => void;
  camera: CameraState;
  setCamera: (camera: CameraState) => void;
};

/** Live mutations share editor history, save ownership and Play Mode snapshots. */
export function useEditorAutomation(input: Input) {
  const session = useRenderSession();
  const workspace = useSceneWorkspace();
  const initialRevision = useMemo(() => workspace?.nextRevision() ?? 0, [workspace]);
  const queryStatic = useRef(createStaticSceneQueryCache());
  const latest = useRef(input); latest.current = input;
  const revision = useRef({ objects: input.objectsHistory.state, physics: input.physicsWorld.settings, value: initialRevision });
  if (revision.current.objects !== input.objectsHistory.state || revision.current.physics !== input.physicsWorld.settings) {
    revision.current = { objects: input.objectsHistory.state, physics: input.physicsWorld.settings, value: workspace?.nextRevision() ?? revision.current.value + 1 };
  }
  const editorStatus = () => ({ name: latest.current.sceneSync.name, loaded: latest.current.sceneSync.loaded, loadFailed: latest.current.sceneSync.loadFailed, loadError: latest.current.sceneSync.loadFailed ? latest.current.sceneSync.error : undefined, dirty: latest.current.sceneSync.dirty, mode: latest.current.playback.mode, prefab: latest.current.prefabModeActive, objectCount: latest.current.objectsHistory.state.length });
  useLayoutEffect(() => { workspace?.updateStatus(input.sceneSync.sceneInstanceId, editorStatus()); }, [workspace, input.sceneSync.sceneInstanceId, input.sceneSync.loadFailed, input.sceneSync.error, input.sceneSync.name, input.sceneSync.loaded, input.sceneSync.dirty, input.playback.mode, input.prefabModeActive, input.objectsHistory.state.length]);
  useEffect(() => {
    const execute = async (request: Record<string, unknown>) => {
    const commandAssets = await editorAuthoringAssets(request);
    const current = latest.current;
    const objects = current.objectsHistory.state;
    if (request.sceneId !== undefined && request.sceneId !== current.sceneSync.sceneId) throw new Error("The active scene changed; inspect before retrying.");
    if (request.sceneInstanceId !== undefined && request.sceneInstanceId !== current.sceneSync.sceneInstanceId) throw new Error("The scene instance retired; inspect before retrying.");
    const status = () => ({ sceneInstanceId: current.sceneSync.sceneInstanceId, sceneInstances: workspace?.getSnapshot().session.instances ?? [], sceneId: current.sceneSync.sceneId, sceneName: latest.current.sceneSync.name, revision: revision.current.value, loaded: latest.current.sceneSync.loaded,
      mode: latest.current.playback.mode, dirty: latest.current.sceneSync.dirty, saving: latest.current.sceneSync.saving,
      saveError: latest.current.sceneSync.error, loadFailed: latest.current.sceneSync.loadFailed, worldSource: latest.current.sceneSync.worldSource, objectCount: latest.current.objectsHistory.state.length,
      physics: physicsWorldForSession(session)?.diagnostics(),
      activeObjectId: latest.current.activeObjectId, camera: latest.current.camera });
    const document = () => ({ version: SCENE_DOCUMENT_VERSION, objects: objects.map(serializeSceneObject), physics: serializePhysicsWorldSettings(current.physicsWorld.settings) });
    if (request.operation === "editor.status") return status();
    if (request.operation === "editor.behaviors") return inspectBehaviorCatalog();
    if (request.operation === "editor.ui") return inspectGameUi(session, request);
    if (!current.sceneSync.loaded) throw new Error("Scene is still loading.");
    if (current.prefabModeActive) throw new Error("Close Prefab Mode before operating on the scene.");
    if (request.operation === "editor.inspect") {
      const offset = request.offset ?? 0, limit = request.limit ?? 100;
      if (!Number.isInteger(offset) || Number(offset) < 0 || !Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 200) throw new Error("Invalid pagination (limit 1–200).");
      return { ...status(), items: objects.slice(Number(offset), Number(offset) + Number(limit)).map(serializeSceneObject) };
    }
    if (request.operation === "editor.validate") return validateAutomationScene(document());
    if (request.operation === "editor.edit") {
      if (current.playback.mode !== "edit") throw new Error("Stop Play Mode before editing authored objects.");
      if (request.baseRevision !== revision.current.value) throw new Error("Editor revision changed; inspect and preview again.");
      if (request.apply !== undefined && typeof request.apply !== "boolean") throw new Error("apply must be boolean.");
      const result = executeSceneCommands(document(), request.commands, { animatorCatalog: commandAssets && { ready: true, importedAssets: commandAssets } });
      if (request.apply) {
        if (!result.valid) throw new Error(result.diagnostics.join("\n"));
        const next = parseSceneObjects(result.scene.objects);
        flushSync(() => current.objectsHistory.set(commandAssets ? reconcileSceneAssetReferences(next, commandAssets) : next));
      }
      return { ...status(), applied: request.apply === true, valid: result.valid, diagnostics: result.diagnostics, changedIds: result.changedIds };
    }
    if (request.operation === "editor.mesh") {
      if (typeof request.objectId !== "string") throw new Error("Expected objectId.");
      const world = physicsWorldForSession(session); if (!world) throw new Error("Physics world is unavailable.");
      return { ...status(), objectId: request.objectId, geometry: world.captureCollisionMesh(request.objectId) };
    }
    if (request.operation === "editor.query") return queryStatic.current(objects, current.physicsWorld.settings, request);
    if (request.operation === "editor.events") {
      const world = physicsWorldForSession(session); if (!world) throw new Error("Physics world is unavailable.");
      return world.readEvents();
    }
    if (request.operation === "editor.physics") {
      const world = physicsWorldForSession(session);
      if (!world || typeof request.objectId !== "string") throw new Error("Expected a running physics world and objectId.");
      if (request.kind === "character-move") {
        if (!Array.isArray(request.displacement) || request.displacement.length !== 3 || !request.displacement.every((n) => typeof n === "number" && Number.isFinite(n))) throw new Error("displacement requires three finite numbers.");
        return world.moveCharacter(request.objectId, request.displacement as [number, number, number]);
      }
      world.queueBodyCommand(request.objectId, parseRuntimeBodyCommand(request));
      return { ...status(), queued: true };
    }
    if (request.operation === "editor.save") {
      if (current.playback.mode !== "edit") throw new Error("Stop Play Mode before saving.");
      const saved = await current.sceneSync.saveNow();
      flushSync(() => undefined);
      if (!saved) throw new Error(latest.current.sceneSync.error || "Scene save failed.");
      return { ...status(), saved };
    }
    if (request.operation === "editor.transport") {
      const action = request.action, mode = current.playback.mode;
      if (!["play", "pause", "step", "stop"].includes(String(action))) throw new Error("Expected play, pause, step or stop.");
      flushSync(() => {
        if (action === "play" && mode === "edit" || action === "stop" && mode !== "edit") current.playback.togglePlay();
        else if (action === "play" && mode === "paused" || action === "pause" && mode === "playing") current.playback.togglePause();
        else if (action === "step") current.playback.step();
      });
      return status();
    }
    if (request.operation === "editor.select") {
      if (typeof request.objectId !== "string" || !objects.some((object) => object.id === request.objectId)) throw new Error("Unknown objectId.");
      flushSync(() => current.selectSceneObject(request.objectId as string)); return status();
    }
    if (request.operation === "editor.camera") {
      const vector = (value: unknown): value is [number, number, number] => Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number" && Number.isFinite(n));
      if (!vector(request.position) || !vector(request.target)) throw new Error("Camera requires finite position and target vectors.");
      const next = { ...current.camera, position: request.position, target: request.target };
      flushSync(() => current.setCamera(next)); return status();
    }
    if (request.operation === "editor.undo" || request.operation === "editor.redo") {
      if (current.playback.mode !== "edit") throw new Error("Stop Play Mode before undo/redo.");
      flushSync(() => request.operation === "editor.undo" ? current.objectsHistory.undo() : current.objectsHistory.redo()); return status();
    }
    throw new Error(`Unknown editor operation: ${String(request.operation)}`);
    };
    return workspace ? workspace.register(input.sceneSync.sceneInstanceId, { execute, status: editorStatus,
      savedRevision: () => latest.current.sceneSync.savedRevision(), save: () => latest.current.sceneSync.saveBeforeSwitch(), rename: (name) => latest.current.sceneSync.rename(name), capture: () => latest.current.sceneSync.captureDocument() }) : connectAutomationEditor(execute);
  }, [session, workspace, input.sceneSync.sceneInstanceId]);
}
