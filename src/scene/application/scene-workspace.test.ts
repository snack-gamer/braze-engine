import { describe, expect, it, vi } from "vitest";
import { createSceneWorkspace, type SceneEditorPort } from "./scene-workspace";
import { createSceneTemplate } from "./scene-templates";
import { activeSceneInstance } from "../domain/scene-session";

function fixture() {
  const source = { ...createSceneTemplate("A"), extension: { retained: true }, physics: { gravity: [0, -3, 0] } };
  const target = createSceneTemplate("B", "empty");
  const editor: SceneEditorPort = { status: () => ({ name: "A", loaded: true, mode: "edit", dirty: true, prefab: false, objectCount: 2 }),
    savedRevision: () => "source-revision", save: vi.fn(async () => true), rename: vi.fn(async () => true), capture: () => source, execute: vi.fn(async () => "source") };
  const ports = { initialId: "current", list: vi.fn(async () => []), read: vi.fn(async () => ({ scene: target, revision: "b" })),
    write: vi.fn(async () => ({ revision: "new" })), create: createSceneTemplate,
    remove: vi.fn(async () => ({ trashId: "trash" })), newId: () => "scene-new", remember: vi.fn() };
  const workspace = createSceneWorkspace(ports); workspace.register(0, editor);
  return { workspace, editor, ports, source, target };
}
describe("scene workspace lifetime", () => {
  it("saves before retiring the old editor and preserves the exact target revision", async () => {
    const { workspace, editor, ports } = fixture();
    const before = workspace.nextRevision();
    await workspace.open("b");
    expect(editor.save).toHaveBeenCalledOnce(); expect(ports.remember).not.toHaveBeenCalled();
    expect(workspace.getSnapshot()).toMatchObject({ session: { activeInstanceId: 1, instances: [{ sceneId: "b", instanceId: 1, phase: "loading" }] }, editor: { loaded: false } });
    expect(await workspace.loadInstance(1)).toMatchObject({ sceneId: "b", revision: "b", hydration: { state: { objects: [] } } });
    expect(ports.read).toHaveBeenCalledOnce();
    workspace.updateStatus(1, editor.status());
    expect(ports.remember).toHaveBeenCalledWith("b");
    await expect(workspace.execute({ operation: "editor.inspect" })).rejects.toThrow("opening");
    workspace.register(1, { ...editor, execute: async () => "target" });
    expect(await workspace.execute({ operation: "editor.inspect" })).toBe("target"); expect(workspace.nextRevision()).toBeGreaterThan(before);
  });
  it("does not create or open another scene when the current save conflicts", async () => {
    const { workspace, editor, ports } = fixture(); vi.mocked(editor.save).mockResolvedValue(false);
    await expect(workspace.open("b")).rejects.toThrow("could not be saved");
    await expect(workspace.create("Copy", "basic", true)).rejects.toThrow("could not be saved");
    expect(ports.write).not.toHaveBeenCalled(); expect(activeSceneInstance(workspace.getSnapshot().session).sceneId).toBe("current");
  });
  it("blocks concurrent switches and automation mutations while a read is pending", async () => {
    const { workspace, ports, target } = fixture(); let release!: () => void;
    ports.read.mockImplementation(async () => { await new Promise<void>((resolve) => { release = resolve; }); return { scene: target, revision: "b" }; });
    const pending = workspace.open("b");
    await expect(workspace.open("c")).rejects.toThrow("already pending");
    await expect(workspace.execute({ operation: "editor.edit" })).rejects.toThrow("Wait");
    release(); await pending; expect(workspace.getSnapshot().busy).toBe(false);
  });
  it("copies scene-owned state and extensions, while a new scene starts from independent defaults", async () => {
    const { workspace, ports, source } = fixture();
    await workspace.create("A Copy", "basic", true);
    expect(ports.write.mock.calls[0]).toEqual([expect.objectContaining({ name: "A Copy", objects: source.objects, physics: source.physics, extension: source.extension }), "scene-new"]);
    const fresh = createSceneTemplate("Empty", "empty"); expect(fresh.objects).toEqual([]); expect(fresh.physics).not.toEqual(source.physics);
  });
  it("rejects malformed/missing scenes without unloading or saving the current one", async () => {
    const { workspace, ports, editor } = fixture();
    ports.read.mockResolvedValue({ scene: { version: "invalid", objects: [] } as never, revision: "bad" });
    await expect(workspace.open("bad")).rejects.toThrow("Unsupported scene"); expect(editor.save).not.toHaveBeenCalled();
    expect(activeSceneInstance(workspace.getSnapshot().session).sceneId).toBe("current");
    await expect(workspace.open("../outside")).rejects.toThrow("Invalid scene ID");
  });
  it("keeps old registrations and status updates out of a reopened document instance", async () => {
    const { workspace, editor, ports } = fixture();
    await workspace.open("b"); workspace.register(1, editor); workspace.updateStatus(1, editor.status());
    await workspace.open("current"); workspace.register(2, editor); workspace.updateStatus(2, editor.status());
    const before = workspace.getSnapshot();
    workspace.register(0, { ...editor, execute: async () => "retired" });
    workspace.updateStatus(0, { ...editor.status(), loaded: false });
    expect(workspace.getSnapshot()).toBe(before);
    expect(await workspace.execute({ operation: "editor.inspect" })).toBe("source");
    await expect(workspace.loadInstance(0)).rejects.toThrow("retired");
    expect(ports.read).toHaveBeenCalledTimes(2);
  });
  it("recovers from an initial failure by opening a valid document, without copying failed state", async () => {
    const { workspace, editor, ports } = fixture();
    editor.status = () => ({ name: "Missing", loaded: false, loadFailed: true, mode: "edit", dirty: false, prefab: false, objectCount: 0 });
    workspace.updateStatus(0, editor.status());
    await expect(workspace.create("Bad Copy", "basic", true)).rejects.toThrow("valid scene");
    expect(ports.write).not.toHaveBeenCalled();
    await workspace.open("b");
    expect(activeSceneInstance(workspace.getSnapshot().session).sceneId).toBe("b");
  });
  it("rejects additive loading without starting a transition", async () => {
    const { workspace, ports, editor } = fixture();
    await expect(workspace.execute({ operation: "editor.scene.open", sceneId: "b", mode: "additive" })).rejects.toThrow("Only single");
    expect(ports.read).not.toHaveBeenCalled(); expect(editor.save).not.toHaveBeenCalled();
  });
  it("opens an existing document in a fresh tab when Main Scene has been removed", async () => {
    const { workspace, ports, target } = fixture();
    ports.read.mockResolvedValueOnce({ scene: null as never, revision: null as never });
    ports.list.mockResolvedValue([{ id: "b", revision: "b", sizeBytes: 0, savedAt: null }] as never);
    expect((await workspace.loadInstance(0)).sceneId).toBe("b");
    expect(activeSceneInstance(workspace.getSnapshot().session)).toMatchObject({ sceneId: "b", instanceId: 1 });
    expect(await workspace.loadInstance(1)).toMatchObject({ sceneId: "b", hydration: { serverDocument: target } });
  });
  it("rejects scene changes during Play or Prefab Mode", async () => {
    const { workspace, editor } = fixture(); const initial = editor.status();
    editor.status = () => ({ ...initial, mode: "playing" }); await expect(workspace.create("New")).rejects.toThrow("Stop Play");
    editor.status = () => ({ ...initial, prefab: true }); await expect(workspace.rename("New")).rejects.toThrow("Close Prefab");
  });
  it("does not activate a scene whose load outlives the workspace", async () => {
    const { workspace, ports, target, editor } = fixture(); let release!: () => void;
    const retire = workspace.beginLifetime();
    ports.read.mockImplementation(async () => { await new Promise<void>((resolve) => { release = resolve; }); return { scene: target, revision: "b" }; });
    const pending = workspace.open("b"); retire(); release();
    await expect(pending).rejects.toThrow("workspace closed");
    expect(ports.remember).not.toHaveBeenCalled(); expect(editor.save).not.toHaveBeenCalled();
  });
});
