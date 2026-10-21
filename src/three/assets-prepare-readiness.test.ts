import { expect, it, vi } from "vitest";
import { Group, Mesh, BoxGeometry, MeshStandardMaterial, type LoadingManager } from "three";
import { loadAndPrepareAsset } from "./assets";
import { loadImportedModelSource } from "./imported-model-source-loader";
import { normalizeImmutableModelImportSettings } from "../lib/model-import-settings";
import { disposeImportedAssetSource } from "./resources/imported-asset-lifetime";
vi.mock("./imported-model-source-loader", () => ({ loadImportedModelSource: vi.fn() }));
const settings = normalizeImmutableModelImportSettings({ fitToEditorSize: false });
function source() { const object = new Group(); object.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial())); return { object, animations: [], stampSubAssetBindings() {} }; }
it("waits for format-loader dependencies that outlive parsing", async () => {
  let manager!: LoadingManager;
  vi.mocked(loadImportedModelSource).mockImplementation(async (_url, _kind, next) => { manager = next!; manager.itemStart("delayed.png"); return source(); });
  let completed = false;
  const pending = loadAndPrepareAsset("/3d-models/test.fbx", "fbx", settings, true).then((value) => { completed = true; return value; });
  for (let n = 0; n < 10; n++) await Promise.resolve(); expect(completed).toBe(false);
  manager.itemEnd("delayed.png"); const loaded = await pending; expect(completed).toBe(true); disposeImportedAssetSource(loaded);
});
it("completes even when a deduplicated source request emits no manager events", async () => {
  vi.mocked(loadImportedModelSource).mockImplementation(async () => source());
  const loaded = await loadAndPrepareAsset("/3d-models/test.fbx", "fbx", settings, true); disposeImportedAssetSource(loaded);
});
it("disposes a parsed model when a dependent texture fails", async () => {
  const value = source(), dispose = vi.spyOn((value.object.children[0] as Mesh).geometry, "dispose");
  vi.mocked(loadImportedModelSource).mockImplementation(async (_url, _kind, manager) => {
    manager!.itemStart("missing.png"); manager!.itemError("missing.png"); manager!.itemEnd("missing.png"); return value;
  });
  await expect(loadAndPrepareAsset("/3d-models/test.fbx", "fbx", settings, true)).rejects.toThrow(/missing.png/); expect(dispose).toHaveBeenCalledTimes(1);
});
