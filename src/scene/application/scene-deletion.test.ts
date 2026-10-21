import { describe, expect, it, vi } from "vitest";
import { deleteWorkspaceScene } from "./scene-deletion";
import { createSceneTemplate } from "./scene-templates";
import type { SceneEditorPort, SceneWorkspacePorts } from "./scene-workspace";

function fixture() {
  let revision = "old";
  const editor: SceneEditorPort = { savedRevision: () => revision, save: vi.fn(async () => { revision = "saved"; return true; }),
    status: () => ({ loaded: true, name: "A", dirty: true, prefab: false, mode: "edit", objectCount: 2 }), rename: async () => true,
    capture: () => createSceneTemplate("A"), execute: async () => null };
  const ports: SceneWorkspacePorts = { initialId: "a", list: vi.fn(async () => [{ id: "b", name: "B", revision: "b", savedAt: null, sizeBytes: 0 }]),
    read: vi.fn(async () => ({ scene: createSceneTemplate("B"), revision: "b" })), create: createSceneTemplate,
    write: vi.fn(async () => ({ revision: "fresh" })), newId: () => "fresh-id", remember: vi.fn(), remove: vi.fn(async () => ({ trashId: "trash" })) };
  const target = { sceneId: "a", name: "A", revision: "old" };
  return { editor, ports, target, guard: vi.fn() };
}
describe("recoverable scene deletion", () => {
  it("saves active changes and prepares another scene before deleting the owned saved revision", async () => {
    const { editor, ports, target, guard } = fixture();
    const result = await deleteWorkspaceScene(ports, editor, "a", target, guard);
    expect(result.replacement?.sceneId).toBe("b");
    expect(ports.remove).toHaveBeenCalledWith("a", "saved");
    expect(ports.write).not.toHaveBeenCalled();
  });
  it("accepts autosaves by the same confirmed UI lifetime, but rejects stale API revisions", async () => {
    const { editor, ports, target, guard } = fixture();
    await expect(deleteWorkspaceScene(ports, editor, "a", { ...target, revision: "older" }, guard)).rejects.toThrow("changed since");
    await deleteWorkspaceScene(ports, editor, "a", { ...target, revision: "older", instanceId: 3 }, guard);
    expect(ports.remove).toHaveBeenCalledWith("a", "saved");
  });
  it("deletes an inactive document without touching the active scene's history or save state", async () => {
    const { editor, ports, target, guard } = fixture();
    expect((await deleteWorkspaceScene(ports, editor, "other", target, guard)).replacement).toBeNull();
    expect(editor.save).not.toHaveBeenCalled(); expect(ports.read).not.toHaveBeenCalled();
    expect(ports.remove).toHaveBeenCalledWith("a", "old");
  });
  it("keeps the source when its save fails or the replacement is invalid", async () => {
    const { editor, ports, target, guard } = fixture();
    vi.mocked(editor.save).mockResolvedValue(false);
    await expect(deleteWorkspaceScene(ports, editor, "a", target, guard)).rejects.toThrow("could not be saved");
    expect(ports.remove).not.toHaveBeenCalled();
    vi.mocked(ports.read).mockResolvedValue({ scene: { version: "broken", objects: [] }, revision: "bad" });
    await expect(deleteWorkspaceScene(ports, editor, "a", target, guard)).rejects.toThrow("Unsupported");
    expect(ports.remove).not.toHaveBeenCalled();
  });
  it("creates a replacement for the final scene and cleans it up if deletion conflicts", async () => {
    const { editor, ports, target, guard } = fixture();
    vi.mocked(ports.list).mockResolvedValue([]);
    vi.mocked(ports.remove).mockRejectedValueOnce(new Error("conflict"));
    await expect(deleteWorkspaceScene(ports, editor, "a", target, guard)).rejects.toThrow("conflict");
    expect(ports.write).toHaveBeenCalledOnce();
    expect(ports.remove).toHaveBeenLastCalledWith("fresh-id", "fresh");
  });
});
