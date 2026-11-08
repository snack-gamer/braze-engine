import { expect, it } from "vitest";
import { captureEntityLayer } from "../domain/entity-layers";
import { decodeProjectLayerCatalog, DEFAULT_LAYER_CATALOG } from "../serialization/project-layer-catalog";
import { parseSceneObjects } from "../../scene/serialization/scene-object-decoder";
import { serializeSceneObject } from "../../scene/serialization/scene-object-encoder";
import { executeSceneCommands } from "../../automation/application/scene-commands";

it("validates fixed layer slots and keeps names at their assigned indices", () => {
  expect(captureEntityLayer(undefined)).toBe(0);
  for (const invalid of [-1, 32, 1.5, "2", NaN]) expect(() => captureEntityLayer(invalid)).toThrow();
  const names = [...DEFAULT_LAYER_CATALOG.names]; names[8] = "Actors";
  expect(decodeProjectLayerCatalog({ version: 1, names }).names[8]).toBe("Actors");
  names[8] = "Characters";
  expect(decodeProjectLayerCatalog({ version: 1, names }).names[8]).toBe("Characters");
  names[9] = "Characters";
  expect(() => decodeProjectLayerCatalog({ version: 1, names })).toThrow(/unique/);
});

it("round-trips object layers and exposes the same validated public edit", () => {
  const [object] = parseSceneObjects([{ id: "box", name: "Box", source_type: "cube", layer: 8 }]);
  expect(object.layer).toBe(8);
  expect(serializeSceneObject(object).layer).toBe(8);
  const scene = { version: "braze-engine/scene-v1", objects: [serializeSceneObject(object)] };
  expect(JSON.stringify(executeSceneCommands(scene, [{ op: "object.update", id: "box", values: { layer: 9 } }]))).toContain('"layer":9');
  expect(() => executeSceneCommands(scene, [{ op: "object.update", id: "box", values: { layer: 32 } }])).toThrow();
});
