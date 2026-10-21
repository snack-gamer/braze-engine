import { expect, it } from "vitest";
import { modelSource } from "../testing/model-runtime-fixture";
import { decodePrefabDocument, encodePrefabDocument } from "../serialization/prefab-document";
import { createCharacterControllerPatch } from "../../character-controller/application/character-controller-authoring";
import { compileRuntimePrefabLibrary } from "./runtime-prefab-compiler";
import { copyEntityCommands } from "../../world/runtime/entity-change-plan";
import { PRIMITIVE_CUBE_SIZE } from "../../scene/domain/primitive-dimensions";
import type { SceneObject } from "../../scene/domain/scene-object";
import { createDefaultAnimatorComponent } from "../../character/domain/animator-component";
import { createEmptyCharacterAssetLibrary } from "../../character/domain/character-asset-library";
import { encodeCharacterAssetLibrary } from "../../character/serialization/character-asset-library-codec";

function source(primitive: SceneObject["primitive"] = "cube", edit?: (objects: SceneObject[]) => void) {
  const saved = modelSource(), document = decodePrefabDocument(saved.document, { name: saved.name, filename: "test" });
  const leaf = document.objects[1]; leaf.primitive = primitive;
  if (primitive !== "gltf") delete leaf.assetRef;
  Object.assign(leaf, createCharacterControllerPatch(leaf));
  edit?.(document.objects);
  return { ...saved, document: encodePrefabDocument(document) };
}

it("compiles saved capsule defaults through hierarchy world scale and yaw without a dynamic primitive", () => {
  const saved = source("cube", ([root, leaf]) => {
    root.position = [10, 0, 0]; root.rotation = [0, 90, 0]; root.scale = [2, 3, 2]; leaf.position = [1, 0, 0];
    leaf.characterController = { ...leaf.characterController!, movement: { skinWidth: 0.03, stepHeight: 0, groundSnap: 0.2, maxSlopeDegrees: 35 } };
    leaf.colliders![0].friction = 0.8; leaf.colliders![0].collisionLayer = 2; leaf.colliders![0].collisionMask = 7;
  });
  const library = compileRuntimePrefabLibrary([saved]), command = library[0].create()[1];
  if (command.op !== "create") throw Error("No character command");
  expect(command.primitive).toBeUndefined(); expect(command.character?.position[0]).toBeCloseTo(10);
  expect(command.character?.position[2]).toBeCloseTo(-2); expect(command.character?.rotation?.[1]).toBeCloseTo(90);
  expect(command.character?.capsule.radius).toBeCloseTo(0.7); expect(command.character?.capsule.halfLength).toBeCloseTo(1.65);
  expect(command.character?.capsule.center[1]).toBeCloseTo(2.7);
  expect(command.character?.render?.shape).toEqual({ kind: "box", size: [2, 3, 2].map((n) => n * PRIMITIVE_CUBE_SIZE) });
  expect(command.character?.movement).toMatchObject({ stepHeight: 0, maxSlopeDegrees: 35 });
  expect(command.character?.physics).toMatchObject({ friction: 0.8, collisionLayer: 2, collisionMask: 7 });
  expect(copyEntityCommands([command])[0]).toMatchObject({ components: ["transform", "meshFilter", "meshRenderer", "collider", "rigidbody", "characterController"] });
  (saved.document as { objects: SceneObject[] }).objects[1].colliders![0].radius = 9;
  const next = library[0].create()[1]; if (next.op !== "create") throw Error("No character command");
  expect(next.character?.capsule.radius).toBeCloseTo(0.7);
});

it("supports sphere visuals and model leaves, canonicalizing 180-degree character yaw", () => {
  for (const primitive of ["sphere", "gltf"] as const) {
    const command = compileRuntimePrefabLibrary([source(primitive, ([root]) => { root.rotation = [0, 180, 0]; })])[0].create()[1];
    if (command.op !== "create") throw Error("No character command");
    expect(command.character?.rotation?.[0]).toBe(0); expect(command.character?.rotation?.[2]).toBe(0);
    expect(Math.abs(command.character!.rotation![1])).toBeCloseTo(180);
    if (primitive === "gltf") { expect(command.model).toBeDefined(); expect(command.character?.render).toBeUndefined(); }
    else expect(command.character?.render?.shape.kind).toBe("sphere");
    expect(() => copyEntityCommands([command])).not.toThrow();
  }
});

it("rejects missing backing, triggers, wrong axes, extra colliders, interpolation and invalid world transforms before commands", () => {
  for (const edit of [
    (leaf: SceneObject) => { delete leaf.rigidbody; }, (leaf: SceneObject) => { leaf.rigidbody!.bodyType = "dynamic"; },
    (leaf: SceneObject) => { leaf.colliders![0].isTrigger = true; }, (leaf: SceneObject) => { leaf.colliders![0].enabled = false; },
    (leaf: SceneObject) => { leaf.characterController = { ...leaf.characterController!, capsuleColliderId: "missing" }; },
    (leaf: SceneObject) => { leaf.colliders![0].axis = "x"; }, (leaf: SceneObject) => { leaf.colliders!.push({ ...leaf.colliders![0], id: "extra" }); },
    (leaf: SceneObject) => { leaf.rigidbody!.interpolation = "interpolate"; },
    (leaf: SceneObject) => { leaf.rotation = [10, 0, 0]; }, (leaf: SceneObject) => { leaf.scale = [2, 1, 1]; },
  ]) expect(() => compileRuntimePrefabLibrary([source("cube", ([, leaf]) => edit(leaf))])).toThrow();
  expect(() => compileRuntimePrefabLibrary([source("cube", ([root, leaf]) => { root.scale = [2, 1, 1]; leaf.rotation = [0, 45, 0]; })])).toThrow();
});

it("keeps disabled controllers inert while diagnosing unsupported disabled kinematic backing", () => {
  const disabled = source("gltf", ([, leaf]) => { leaf.characterController = { ...leaf.characterController!, enabled: false }; delete leaf.rigidbody; delete leaf.colliders; });
  const command = compileRuntimePrefabLibrary([disabled])[0].create()[1];
  if (command.op !== "create") throw Error("No model command");
  expect(command.character).toBeUndefined(); expect(command.model).toBeDefined();
  expect(() => compileRuntimePrefabLibrary([source("cube", ([, leaf]) => { leaf.characterController = { ...leaf.characterController!, enabled: false }; })])).toThrow(/Enable the Character Controller/);
  const dynamic = compileRuntimePrefabLibrary([source("cube", ([, leaf]) => {
    leaf.characterController = { ...leaf.characterController!, enabled: false }; leaf.rigidbody!.bodyType = "dynamic"; leaf.colliders![0].shape = "box";
  })])[0].create()[1];
  if (dynamic.op !== "create") throw Error("No dynamic command");
  expect(dynamic.character).toBeUndefined(); expect(dynamic.primitive).toBeDefined();
});

it("round-trips the existing Character Controller codec and rejects malformed active declarations", () => {
  const saved = source(), document = decodePrefabDocument(saved.document, { name: saved.name, filename: "test" });
  expect(document.objects[1].characterController).toMatchObject({ version: 1, enabled: true, capsuleColliderId: document.objects[1].colliders![0].id });
  (saved.document as { objects: Array<Record<string, unknown>> }).objects[1].characterController = { version: "future", enabled: true };
  expect(() => compileRuntimePrefabLibrary([saved])).toThrow(/invalid Character Controller/);
});

it("supports captured applied yaw Animator motion on model characters and rejects applied full rotation", () => {
  const saved = source("gltf", ([, leaf]) => {
    leaf.animator = createDefaultAnimatorComponent(); leaf.animator.rootMotion.mode = "applyToObject";
  });
  const imported = { guid: "b".repeat(32), filename: "model.gltf", name: "Model", kind: "model", status: "ready", url: "/3d-models/model.gltf", path: "assets/model.gltf", sizeBytes: 128 };
  const animated = { ...saved, resources: { ...saved.resources!, animation: {
    characterAssets: encodeCharacterAssetLibrary(createEmptyCharacterAssetLibrary()), importedAssets: [imported],
    modelImportDocuments: { "model.gltf": { version: "braze/model-import-v3", sourceFilename: "model.gltf", settings: {}, revision: "r1", updatedAt: null, importVersion: "r1" } },
  } } };
  const command = compileRuntimePrefabLibrary([animated])[0].create()[1];
  if (command.op !== "create") throw Error("No animated character command");
  expect(command.model?.animator?.rootMotion.mode).toBe("applyToObject"); expect(command.character).toBeDefined();
  const leaf = (animated.document as { objects: SceneObject[] }).objects[1]; leaf.animator!.rootMotion.rotation = "full";
  expect(() => compileRuntimePrefabLibrary([animated])).toThrow(/yaw rotation only/);
  leaf.animator!.rootMotion.mode = "extractOnly";
  expect(() => compileRuntimePrefabLibrary([animated])).not.toThrow();
});
