import { expect, it } from "vitest";
import document from "../../../tests/gameplay/fixtures/runtime-duo.braze-prefab.json";
import { decodePrefabDocument } from "../../prefabs/serialization/prefab-document";
import { instantiatePrefabDocument, updatePrefabLinkedInstances } from "../../lib/prefabs";
import { parsePrefabLink, serializePrefabLink } from "../../lib/prefab-link";
import { parseSceneObjects } from "../../scene/serialization/scene-object-decoder";
import { serializeSceneObject } from "../../scene/serialization/scene-object-encoder";
import { duplicateActiveSceneObject, updateAuthoredSceneObject } from "../../scene/authoring/scene-object-commands";
import { createPrefabEditorState, updatePrefabEditorObjects, undoPrefabEditorState, redoPrefabEditorState } from "../../prefabs/authoring/prefab-editor-state";
import { executeSceneCommands } from "../../automation/application/scene-commands";

const asset = { filename: "Duo.braze-prefab.json", name: "Duo", guid: "a".repeat(32), url: "/Duo", path: "Duo", kind: "prefab" as const, sizeBytes: 1 };
const prefab = () => decodePrefabDocument(structuredClone(document), asset);

it("round-trips tags, preserves legacy untagged objects and rejects malformed scene/prefab data", () => {
  const root = prefab().objects[0];
  expect(parseSceneObjects([serializeSceneObject(root)])[0].tags).toEqual(["Reusable"]);
  const legacy = { ...root, tags: undefined };
  expect(serializeSceneObject(legacy)).not.toHaveProperty("tags");
  expect(parseSceneObjects([serializeSceneObject(legacy)])[0].tags).toBeUndefined();
  expect(() => parseSceneObjects([{ ...serializeSceneObject(root), tags: ["bad tag"] }])).toThrow(/Tags/);
  const invalid = structuredClone(document); invalid.objects[0].tags = ["bad tag"];
  expect(() => decodePrefabDocument(invalid, asset)).toThrow(/Tags/);
  const cloned = duplicateActiveSceneObject([root], root.id, () => "copy");
  expect(cloned.objects[1].tags).toEqual(["Reusable"]);
});

it("marks tags as prefab overrides and preserves explicit empty overrides during reimport", () => {
  const source = prefab();
  const instances = instantiatePrefabDocument(source, { asset });
  const root = instances.find((object) => object.prefabLink?.sourceObjectId === "root")!;
  const changed = updateAuthoredSceneObject(instances, root.id, { tags: [] });
  expect(changed.find((object) => object.id === root.id)?.prefabLink?.overrides).toContain("tags");
  const link = changed.find((object) => object.id === root.id)!.prefabLink!;
  expect(parsePrefabLink(serializePrefabLink(link))?.overrides).toContain("tags");
  source.objects[0].tags = ["Updated"];
  expect(updatePrefabLinkedInstances(changed, source, asset).find((object) => object.id === root.id)?.tags).toEqual([]);
  expect(updatePrefabLinkedInstances(instances, source, asset).find((object) => object.id === root.id)?.tags).toEqual(["Updated"]);
});

it("uses the prefab undo boundary and the same validation in authoring commands", () => {
  const initial = createPrefabEditorState(asset, prefab());
  const changed = updatePrefabEditorObjects(initial, (objects) => updateAuthoredSceneObject(objects, "root", { tags: ["Edited"] }));
  expect(changed.doc.objects[0].tags).toEqual(["Edited"]);
  expect(undoPrefabEditorState(changed).doc.objects[0].tags).toEqual(["Reusable"]);
  expect(redoPrefabEditorState(undoPrefabEditorState(changed)).doc.objects[0].tags).toEqual(["Edited"]);
  const scene = { version: "braze-engine/scene-v1", objects: [serializeSceneObject(prefab().objects[0])] };
  const result = executeSceneCommands(scene, [{ op: "object.update", id: "root", values: { tags: ["Actor"] } }]);
  expect(JSON.stringify(result)).toContain('"Actor"');
  expect(() => executeSceneCommands(scene, [{ op: "object.update", id: "root", values: { tags: ["A", "A"] } }])).toThrow(/at most 1/);
});
