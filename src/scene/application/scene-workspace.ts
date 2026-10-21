import { deleteWorkspaceScene, type SceneDeletion } from "./scene-deletion";
import { activeSceneInstance, createSceneSession, replaceSceneInstance, setSceneInstancePhase } from "../domain/scene-session";
import { prepareSceneDocument, type PreparedSceneDocument } from "./scene-document-preparation";
import type { SavedSceneDocument, SavedSceneSummary } from "../../lib/scene-api";
import type { SceneDocumentV1 } from "../serialization/scene-document";
import { defaultSceneName, validateSceneId, validateSceneName } from "../domain/scene-identity";
import type { SceneTemplate } from "./scene-templates";

export type SceneEditorStatus = { name: string; loaded: boolean; dirty: boolean; mode: string; prefab: boolean; objectCount: number; loadFailed?: boolean; loadError?: string };
export type SceneEditorPort = {
  status: () => SceneEditorStatus;
  save: () => Promise<boolean>;
  savedRevision: () => string | null;
  rename: (name: string) => Promise<boolean>;
  capture: () => SceneDocumentV1;
  execute: (request: Record<string, unknown>) => Promise<unknown>;
};
export type SceneWorkspacePorts = {
  initialId: string;
  enter?: () => void;
  list: () => Promise<SavedSceneSummary[]>;
  read: (id: string) => Promise<SavedSceneDocument>;
  write: (scene: SceneDocumentV1, id: string) => Promise<{ revision: string }>;
  create: (name: string, template: SceneTemplate) => SceneDocumentV1;
  remove: (id: string, revision: string) => Promise<{ trashId: string }>;
  newId: () => string;
  remember: (id: string) => void;
};
export type SceneDialog = "new" | "copy" | "rename" | "delete" | null;

/** One active scene per editor tab. Saves finish before the old scene lifetime retires. */
export function createSceneWorkspace(ports: SceneWorkspacePorts) {
  let editor: SceneEditorPort | null = null, refreshGeneration = 0, revision = 0, lifetime = 0, disposed = false;
  let state = { session: createSceneSession(ports.initialId),
    scenes: [] as SavedSceneSummary[], deletion: null as SceneDeletion | null, busy: false, error: "", dialog: null as SceneDialog,
    editor: { name: defaultSceneName(ports.initialId), loaded: false, dirty: false, mode: "edit", prefab: false, objectCount: 0 } as SceneEditorStatus };
  const prepared = new Map<number, PreparedSceneDocument>();
  const pendingLoads = new Map<number, Promise<PreparedSceneDocument>>();
  const active = () => activeSceneInstance(state.session);
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<typeof state>) => { state = { ...state, ...patch }; for (const notify of listeners) notify(); };
  const checkEditor = () => {
    if (!editor || (!editor.status().loaded && active().phase !== "failed")) throw new Error("Wait for the scene to load.");
    if (editor.status().mode !== "edit") throw new Error("Stop Play Mode before changing scenes.");
    if (editor.status().prefab) throw new Error("Close Prefab Mode before changing scenes.");
    return editor;
  };
  const refresh = async () => {
    const generation = ++refreshGeneration;
    const scenes = await ports.list(); if (!disposed && generation === refreshGeneration) publish({ scenes });
    return scenes;
  };
  const activate = (document: PreparedSceneDocument) => {
    editor = null;
    const session = replaceSceneInstance(state.session, document.sceneId);
    prepared.clear(); pendingLoads.clear();
    prepared.set(session.activeInstanceId, document);
    publish({ session, dialog: null,
      editor: { name: document.name, loaded: false, dirty: false, mode: "edit", prefab: false, objectCount: 0 } });
  };
  const loadInstance = (instanceId: number): Promise<PreparedSceneDocument> => {
    if (active().instanceId !== instanceId || disposed) return Promise.reject(new Error("Scene instance retired."));
    const cached = prepared.get(instanceId);
    if (cached) return Promise.resolve(cached);
    const pending = pendingLoads.get(instanceId);
    if (pending) return pending;
    const id = active().sceneId;
    const request = ports.read(id).then(async (document) => {
      if (active().instanceId !== instanceId || disposed) throw new Error("Scene instance retired.");
      if (instanceId === 0 && id === "current" && !document.scene) {
        const available = await ports.list();
        if (available[0]) {
          const next = prepareSceneDocument(available[0].id, await ports.read(available[0].id));
          if (active().instanceId !== instanceId || disposed) throw new Error("Scene instance retired.");
          activate(next); return next;
        }
      }
      return prepareSceneDocument(id, document, instanceId === 0);
    });
    pendingLoads.set(instanceId, request);
    return request;
  };
  const transaction = async (operation: (current: SceneEditorPort, guard: () => void) => Promise<unknown>) => {
    if (state.busy) throw new Error("A scene operation is already pending.");
    const generation = lifetime;
    const guard = () => { if (disposed || generation !== lifetime) throw new Error("Scene workspace closed before the operation completed."); };
    guard();
    const current = checkEditor(); publish({ busy: true, error: "" });
    try { return await operation(current, guard); }
    catch (cause) { if (!disposed && generation === lifetime) publish({ error: cause instanceof Error ? cause.message : String(cause) }); throw cause; }
    finally { if (!disposed && generation === lifetime) publish({ busy: false }); }
  };
  const save = async (current: SceneEditorPort) => {
    if (!await current.save()) throw new Error("Scene could not be saved. Resolve its save error before switching.");
  };
  const open = (input: string) => transaction(async (current, guard) => {
    const id = validateSceneId(input);
    if (id === active().sceneId) return { sceneId: id };
    const document = prepareSceneDocument(id, await ports.read(id)); guard();
    await save(current); guard();
    await refresh().catch(() => undefined); guard();
    activate(document);
    return { sceneId: id };
  });
  const create = (input: string, template: SceneTemplate = "basic", copy = false) => transaction(async (current, guard) => {
    const name = validateSceneName(input);
    if (copy && !current.status().loaded) throw new Error("Open a valid scene before making a copy.");
    await save(current); guard();
    await refresh().catch(() => undefined); guard();
    const scene = copy ? { ...current.capture(), name, savedAt: new Date().toISOString() } : ports.create(name, template);
    const id = validateSceneId(ports.newId());
    const preparedScene = prepareSceneDocument(id, { scene, revision: null });
    const result = await ports.write(scene, id); guard();
    // A catalog refresh failure must not turn a successful creation into a retryable write.
    publish({ scenes: [...state.scenes, { id, name, revision: result.revision, savedAt: scene.savedAt ?? null, sizeBytes: 0, objectCount: scene.objects.length }] });
    activate({ ...preparedScene, revision: result.revision });
    return { sceneId: id, name };
  });
  const rename = (input: string) => transaction(async (current, guard) => {
    const name = validateSceneName(input);
    if (!await current.rename(name)) throw new Error("Scene rename could not be saved.");
    guard();
    publish({ dialog: null, editor: { ...state.editor, name }, scenes: state.scenes.map((scene) => scene.id === active().sceneId ? { ...scene, name } : scene) });
    return { sceneId: active().sceneId, name };
  });
  const requestDeletion = (input: string) => transaction(async (_current, guard) => {
    const sceneId = validateSceneId(input), document = await ports.read(sceneId); guard();
    if (!document.scene || !document.revision) throw new Error("Scene no longer exists. Refresh the Project window.");
    publish({ dialog: "delete", deletion: { sceneId, name: document.scene.name ?? defaultSceneName(sceneId), revision: document.revision, ...(sceneId === active().sceneId ? { instanceId: active().instanceId } : {}) } });
  });
  const remove = (target: SceneDeletion) => transaction(async (current, guard) => {
    validateSceneId(target.sceneId);
    if (target.instanceId !== undefined && target.instanceId !== active().instanceId) throw new Error("Scene instance changed; request deletion again.");
    const result = await deleteWorkspaceScene(ports, current, active().sceneId, target, guard); guard();
    publish({ scenes: state.scenes.filter((scene) => scene.id !== target.sceneId), dialog: null, deletion: null });
    if (result.replacement) activate(result.replacement);
    await refresh().catch(() => undefined);
    return { deletedSceneId: target.sceneId, sceneId: active().sceneId, trashId: result.trashId };
  });
  return {
    beginLifetime() {
      disposed = false; lifetime++; ports.enter?.();
      return () => { disposed = true; lifetime++; refreshGeneration++; editor = null; };
    },
    nextRevision: () => ++revision,
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh, open, create, rename, loadInstance, requestDeletion, remove,
    acknowledgeHydration(instanceId: number) { prepared.delete(instanceId); pendingLoads.delete(instanceId); },
    showSceneDialog(id: string, dialog: SceneDialog) { if (!state.busy && id === active().sceneId) publish({ dialog, error: "" }); },
    showDialog(dialog: SceneDialog) { if (state.busy) return; publish({ dialog, error: "" }); },
    reportError(error: unknown) { publish({ error: error instanceof Error ? error.message : String(error) }); },
    register(instanceId: number, current: SceneEditorPort) {
      if (instanceId !== active().instanceId) return () => undefined;
      editor = current;
      return () => { if (editor === current) editor = null; };
    },
    updateStatus(instanceId: number, status: SceneEditorStatus) {
      if (instanceId !== active().instanceId) return;
      const phase = status.loadFailed ? "failed" : status.loaded ? "ready" : "loading";
      const session = setSceneInstancePhase(state.session, instanceId, phase);
      if (phase === "ready" && active().phase !== "ready") {
        // Workspace preference persistence never determines whether a document loaded.
        try { ports.remember(active().sceneId); } catch { /* Current in-memory session remains usable. */ }
      }
      if (session !== state.session || JSON.stringify(state.editor) !== JSON.stringify(status)) publish({ session, editor: status, ...(status.loadFailed ? { error: status.loadError || "Scene failed to load. Open another scene from Project." } : {}) });
    },
    async execute(request: Record<string, unknown>) {
      const operation = request.operation;
      if (operation === "editor.scene.list") return { sceneId: active().sceneId, sceneInstanceId: active().instanceId, sceneInstances: state.session.instances, scenes: await refresh() };
      if (operation === "editor.scene.open") {
        if (request.mode !== undefined && request.mode !== "single") throw new Error("Only single-scene loading is supported.");
        return open(validateSceneId(request.sceneId));
      }
      if (operation === "editor.scene.create") return create(validateSceneName(request.name), (request.template ?? "basic") as SceneTemplate);
      if (operation === "editor.scene.copy") return create(validateSceneName(request.name), "basic", true);
      if (operation === "editor.scene.delete") {
        if (typeof request.baseRevision !== "string" || !request.baseRevision) throw new Error("Deletion requires baseRevision from editor.scene.list.");
        return remove({ sceneId: validateSceneId(request.sceneId), name: "", revision: request.baseRevision });
      }
      if (operation === "editor.scene.rename") return rename(validateSceneName(request.name));
      if (state.busy && operation !== "editor.status") throw new Error("Wait for the scene operation to finish.");
      if (!editor) throw new Error("Scene is opening; wait for editor.status.loaded.");
      return editor.execute(request);
    },
  };
}
export type SceneWorkspaceController = ReturnType<typeof createSceneWorkspace>;
