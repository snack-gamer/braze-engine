import * as THREE from "three";
import { normalizeClonerSettings } from "../../lib/cloner";
import { normalizeEffectorSettings } from "../../lib/effector";
import type { ClonerSettings, SceneObject } from "../../types";
import type { NodeUserData, Runtime } from "../runtime";

export type SourceEntry = {
  object: SceneObject;
  node: THREE.Object3D;
  subtree: SceneObject[];
};

export function descendantsFor(source: SceneObject, objects: SceneObject[]): SceneObject[] {
  const descendants = [source];
  const queue = [source.id];
  while (queue.length > 0) {
    const parentId = queue.shift();
    for (const object of objects) {
      if (object.parentId !== parentId) continue;
      descendants.push(object);
      queue.push(object.id);
    }
  }
  return descendants;
}

export function directSourcesFor(
  cloner: SceneObject,
  objects: SceneObject[],
  runtime: Runtime,
): SourceEntry[] {
  return objects
    .filter((object) =>
      object.parentId === cloner.id &&
      object.primitive !== "camera" &&
      object.primitive !== "effector" &&
      object.visible !== false)
    .flatMap((object) => {
      const node = runtime.objectMap.get(object.id);
      return node ? [{ object, node, subtree: descendantsFor(object, objects) }] : [];
    });
}

function objectSignature(object: SceneObject, node?: THREE.Object3D) {
  const userData = node?.userData as Partial<NodeUserData> | undefined;
  return {
    id: object.id,
    primitive: object.primitive,
    visible: object.visible,
    position: object.position,
    rotation: object.rotation,
    scale: object.scale,
    materialId: object.materialId,
    color: object.color,
    wireframe: object.wireframe,
    bodyKey: userData?.bodyKey,
    materialKey: userData?.materialKey,
  };
}

export function effectorStackFor(cloner: ClonerSettings, objects: SceneObject[]): SceneObject[] {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const stack: SceneObject[] = [];
  for (const id of cloner.effectorIds) {
    const object = byId.get(id);
    if (!object || object.primitive !== "effector" || object.visible === false) continue;
    const settings = normalizeEffectorSettings(object.effector);
    if (!settings.enabled) continue;
    if (stack.some((existing) => existing.id === object.id)) continue;
    stack.push(object);
  }
  return stack;
}

export function clonerHasAnimatedEffectors(objects: SceneObject[]): boolean {
  const animatedEffectorIds = new Set<string>();
  for (const object of objects) {
    if (object.primitive !== "effector" || object.visible === false) continue;
    const effector = normalizeEffectorSettings(object.effector);
    if (!effector.enabled) continue;
    const animatedRandom = effector.type === "random"
      && (effector.randomMode === "noise" || effector.randomMode === "turbulence")
      && Math.abs(effector.animationSpeed) > 1e-6;
    const animatedShader = effector.type === "shader"
      && (Math.abs(effector.evolutionSpeed) > 1e-6 || Math.abs(effector.movementSpeed) > 1e-6);
    if (animatedRandom || animatedShader) animatedEffectorIds.add(object.id);
  }
  if (animatedEffectorIds.size === 0) return false;
  for (const object of objects) {
    if (object.primitive !== "cloner") continue;
    const cloner = normalizeClonerSettings(object.cloner);
    if (cloner.enabled && cloner.effectorIds.some((id) => animatedEffectorIds.has(id))) return true;
  }
  return false;
}

export function clonerSignature(
  cloner: SceneObject,
  sources: SourceEntry[],
  objects: SceneObject[],
  runtime: Runtime,
): string {
  const normalized = normalizeClonerSettings(cloner.cloner);
  const inputObject = normalized.inputObjectId
    ? objects.find((object) => object.id === normalized.inputObjectId)
    : undefined;
  const inputSubtree = inputObject ? descendantsFor(inputObject, objects) : [];
  const clonerNode = runtime.objectMap.get(cloner.id);
  const effectors = effectorStackFor(normalized, objects).map((effectorObject) => {
    const node = runtime.objectMap.get(effectorObject.id);
    const settings = normalizeEffectorSettings(effectorObject.effector);
    const targetNode = settings.targetObjectId
      ? runtime.objectMap.get(settings.targetObjectId)
      : undefined;
    return {
      id: effectorObject.id,
      settings,
      world: node ? node.matrixWorld.toArray() : null,
      targetWorld: targetNode ? targetNode.matrixWorld.toArray() : null,
    };
  });
  return JSON.stringify({
    cloner: cloner.cloner,
    visible: cloner.visible,
    clonerWorld: clonerNode ? clonerNode.matrixWorld.toArray() : null,
    effectors,
    input: inputSubtree.map((object) => objectSignature(object, runtime.objectMap.get(object.id))),
    sources: sources.map((source) => ({
      id: source.object.id,
      bodyKey: (source.node.userData as NodeUserData).bodyKey,
      materialKey: (source.node.userData as NodeUserData).materialKey,
      subtree: source.subtree.map((object) => objectSignature(object, runtime.objectMap.get(object.id))),
    })),
  });
}

export function clonerSourceIds(objects: SceneObject[]): Set<string> {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const hidden = new Set<string>();
  for (const object of objects) {
    const parent = object.parentId ? byId.get(object.parentId) : undefined;
    if (parent?.primitive === "cloner" && object.primitive !== "effector" &&
        !normalizeClonerSettings(parent.cloner).showSources) {
      hidden.add(object.id);
    }
  }
  return hidden;
}
