import { parseSceneObjects } from "../../scene/serialization/scene-object-decoder";
import { serializeSceneObject } from "../../scene/serialization/scene-object-encoder";
import { createCharacterMotorWorld } from "../../character-controller/runtime/character-motor-world";
import { migrateSceneDocument, type SceneDocumentV1 } from "../../scene/serialization/scene-document";
import { parsePhysicsWorldSettings } from "../../physics/serialization/codec";
import { compileAuthoredPhysicsScene } from "../../physics/authoring/scene-compiler";
import { compileRigidWorld } from "../../physics/authoring/rigid-world-compiler";

import { executeObjectCommands, validateHierarchy, type ObjectCommandOptions } from "./object-commands";

export function validateAutomationScene(input: unknown) {
  const scene = migrateSceneDocument(input); const objects = parseSceneObjects(scene.objects);
  const diagnostics: string[] = [];
  for (const object of objects) {
    if (object.behaviors?.unavailable) diagnostics.push(`${object.id}: ${object.behaviors.unavailable.message}`);
    if (object.uiCanvas?.unavailable) diagnostics.push(`${object.id}: ${object.uiCanvas.unavailable.message}`);
  }
  try { validateHierarchy(objects); } catch (error) { diagnostics.push(String(error)); }
  try {
    const world = compileRigidWorld(compileAuthoredPhysicsScene(objects, "automation", parsePhysicsWorldSettings(scene.physics)));
    if (objects.some((object) => object.characterController?.enabled)) createCharacterMotorWorld(objects, world);
  }
  catch (error) { diagnostics.push(String(error)); }
  return { valid: diagnostics.length === 0, diagnostics, objectCount: objects.length };
}

/** Transport-neutral authoring transaction. The server owns revision checks and persistence. */
export function executeSceneCommands(input: unknown, commands: unknown, options?: ObjectCommandOptions) {
  const scene = migrateSceneDocument(input); const { objects, changedIds } = executeObjectCommands(parseSceneObjects(scene.objects), commands, options);
  const changed = new Set(changedIds);
  const rawById = new Map(scene.objects.map((item) => [(item as { id: string }).id, item]));
  const next: SceneDocumentV1 = { ...scene,
    objects: objects.map((object) => changed.has(object.id) ? { ...rawById.get(object.id) as object, ...serializeSceneObject(object) } : rawById.get(object.id)!),
  };
  for (const key of ["activeObjectId", "activeCameraId"] as const) {
    if (next[key] && !objects.some((object) => object.id === next[key])) next[key] = null;
  }
  const validation = validateAutomationScene(next);
  return { scene: next, changedIds: [...changed], ...validation };
}
