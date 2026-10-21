import {
  fetchPrefabAssetDocument,
  type LibraryAsset,
  type PrefabAssetDocument,
} from "./asset-api";
import {
  DEFAULT_OBJECT_COLOR,
  type PrefabLink,
  type PrefabOverrideKey,
  type SceneObject,
} from "../types";
import { createAuthoredId } from "../identity/authored-id";
import { remapBehaviorReferences } from "../behaviors/domain/behavior-references";

import { PREFAB_DOCUMENT_VERSION, type PrefabDocument } from "../prefabs/domain/prefab-document";
import { decodePrefabDocument } from "../prefabs/serialization/prefab-document";
export { PREFAB_DOCUMENT_VERSION, PREFAB_ASSET_SUFFIX, LEGACY_PREFAB_ASSET_SUFFIX, PREFAB_ASSET_RE } from "../prefabs/domain/prefab-document";
export type { PrefabDocument } from "../prefabs/domain/prefab-document";

function createMasterRoot(name: string): SceneObject {
  return {
    id: createAuthoredId("prefab-root"),
    name: name.trim() || "Prefab Root",
    primitive: "transform",
    color: DEFAULT_OBJECT_COLOR,
    visible: true,
    locked: false,
    transformLocked: false,
    renderVisible: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

function deepCloneObject(object: SceneObject): SceneObject {
  return JSON.parse(JSON.stringify(object)) as SceneObject;
}

function cloneAsPrefabSource(object: SceneObject): SceneObject {
  const clone = deepCloneObject(object);
  delete clone.prefabLink;
  return clone;
}

function overrideSet(link?: PrefabLink): Set<PrefabOverrideKey> {
  return new Set(link?.overrides ?? []);
}

function reachesRoot(object: SceneObject, byId: Map<string, SceneObject>, rootId: string): boolean {
  let parentId = object.parentId;
  const seen = new Set<string>([object.id]);
  while (parentId) {
    if (parentId === rootId) return true;
    if (seen.has(parentId)) return false;
    seen.add(parentId);
    parentId = byId.get(parentId)?.parentId;
  }
  return object.id === rootId;
}

export function ensurePrefabMasterRoot(prefab: PrefabDocument, preferredName = prefab.name): PrefabDocument {
  const sourceObjects = prefab.objects.map(cloneAsPrefabSource);
  const byId = new Map(sourceObjects.map((object) => [object.id, object]));
  const validRootIds = prefab.rootIds.filter((id) => byId.has(id));
  const preferredRoot = validRootIds.map((id) => byId.get(id)).find((object) => object?.primitive === "transform");
  const topLevelTransform = sourceObjects.find(
    (object) => object.primitive === "transform" && (!object.parentId || !byId.has(object.parentId)),
  );
  const existingRoot = preferredRoot ?? topLevelTransform ?? null;
  const root = existingRoot
    ? {
        ...existingRoot,
        name: existingRoot.name?.trim() || preferredName.trim() || "Prefab Root",
        parentId: undefined,
        primitive: "transform" as const,
        renderVisible: false,
      }
    : createMasterRoot(preferredName);
  const rootId = root.id;
  const withRoot = existingRoot
    ? sourceObjects.map((object) => (object.id === rootId ? root : object))
    : [root, ...sourceObjects];
  const rootAware = new Map(withRoot.map((object) => [object.id, object]));
  const objects = withRoot.map((object) => {
    if (object.id === rootId) return root;
    const parentId =
      object.parentId && object.parentId !== object.id && rootAware.has(object.parentId)
        ? object.parentId
        : rootId;
    return { ...object, parentId };
  });
  const normalizedById = new Map(objects.map((object) => [object.id, object]));
  const normalized = objects.map((object) => {
    if (object.id === rootId) return object;
    return reachesRoot(object, normalizedById, rootId) ? object : { ...object, parentId: rootId };
  });
  const normalizedRoot = normalized.find((object) => object.id === rootId) ?? root;
  return {
    ...prefab,
    name: prefab.name || preferredName || root.name,
    rootIds: [rootId],
    objects: [normalizedRoot, ...normalized.filter((object) => object.id !== rootId)],
  };
}

function mergeOverrides(base: SceneObject, existing: SceneObject | undefined, alwaysPreserveRoot: boolean): SceneObject {
  if (!existing) return base;
  const overrides = overrideSet(existing.prefabLink);
  const next: SceneObject = { ...base };
  if (overrides.has("name")) next.name = existing.name;
  if (overrides.has("tags")) next.tags = existing.tags;
  if (overrides.has("color")) next.color = existing.color;
  if (overrides.has("visibility")) next.visible = existing.visible;
  if (overrides.has("lock")) {
    next.locked = existing.locked;
    next.transformLocked = existing.transformLocked;
  }
  if (alwaysPreserveRoot || overrides.has("transform")) {
    next.position = [...existing.position];
    next.rotation = [...existing.rotation];
    next.scale = [...existing.scale];
  }
  if (alwaysPreserveRoot || overrides.has("hierarchy")) {
    next.parentId = existing.parentId;
  }
  if (overrides.has("asset")) {
    next.assetName = existing.assetName;
    next.assetUrl = existing.assetUrl;
    next.assetNote = existing.assetNote;
  }
  if (overrides.has("botProfile")) next.botProfileId = existing.botProfileId;
  if (overrides.has("materialId")) next.materialId = existing.materialId;
  if (overrides.has("importedMaterialBindings")) {
    next.importedMaterialBindings = existing.importedMaterialBindings
      ? existing.importedMaterialBindings.map((binding) => ({ ...binding }))
      : undefined;
  }
  if (overrides.has("water")) next.water = existing.water;
  if (overrides.has("cloner")) next.cloner = existing.cloner;
  if (overrides.has("camera")) next.camera = existing.camera ? { ...existing.camera } : undefined;
  if (overrides.has("directionalLight")) {
    next.directionalLight = existing.directionalLight ? { ...existing.directionalLight } : undefined;
  }
  if (overrides.has("modifiers")) next.modifiers = existing.modifiers ? deepCloneObject(existing).modifiers : undefined;
  if (overrides.has("components")) {
    next.uiCanvas = existing.uiCanvas ? deepCloneObject(existing).uiCanvas : undefined;
    next.behaviors = existing.behaviors ? deepCloneObject(existing).behaviors : undefined;
    next.animator = existing.animator ? deepCloneObject(existing).animator : undefined;
    next.characterController = existing.characterController
      ? { ...existing.characterController }
      : undefined;
    next.animationPlayer = existing.animationPlayer ? { ...existing.animationPlayer } : undefined;
    next.depthOfField = existing.depthOfField ? { ...existing.depthOfField } : undefined;
    next.motionPulse = existing.motionPulse ? deepCloneObject(existing).motionPulse : undefined;
    next.joint = existing.joint ? deepCloneObject(existing).joint : undefined;
    next.rigidbody = existing.rigidbody ? { ...existing.rigidbody } : undefined;
    next.colliders = existing.colliders ? deepCloneObject(existing).colliders : undefined;
    next.water = existing.water ? deepCloneObject(existing).water : undefined;
  }
  if (overrides.has("display")) {
    next.solo = existing.solo;
    next.wireframe = existing.wireframe ? { ...existing.wireframe } : undefined;
    next.renderVisible = existing.renderVisible;
  }
  if (overrides.has("rowStyle")) {
    next.rowColor = existing.rowColor;
    next.rowColorEnabled = existing.rowColorEnabled;
  }
  return next;
}

function collectSubtree(objects: SceneObject[], ids: string[]): { rootIds: string[]; objects: SceneObject[] } {
  const known = new Set(objects.map((object) => object.id));
  const included = new Set(ids.filter((id) => known.has(id)));
  let grew = true;
  while (grew) {
    grew = false;
    for (const object of objects) {
      if (object.parentId && included.has(object.parentId) && !included.has(object.id)) {
        included.add(object.id);
        grew = true;
      }
    }
  }
  const selectedObjects = objects.filter((object) => included.has(object.id));
  const rootIds = selectedObjects
    .filter((object) => !object.parentId || !included.has(object.parentId))
    .map((object) => object.id);
  return { rootIds, objects: selectedObjects.map(cloneAsPrefabSource) };
}

export function createPrefabDocument(objects: SceneObject[], ids: string[], name: string): PrefabDocument | null {
  const subtree = collectSubtree(objects, ids);
  if (subtree.objects.length === 0) return null;
  return ensurePrefabMasterRoot({
    version: PREFAB_DOCUMENT_VERSION,
    name,
    createdAt: new Date().toISOString(),
    rootIds: subtree.rootIds,
    objects: subtree.objects,
  }, name);
}

export type PrefabDocumentSnapshot = {
  document: PrefabDocument;
  revision: string;
};

export async function fetchPrefabDocumentSnapshot(
  asset: LibraryAsset,
): Promise<PrefabDocumentSnapshot> {
  let loaded: PrefabAssetDocument;
  try {
    loaded = await fetchPrefabAssetDocument(asset.filename);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error(`Invalid prefab: ${asset.filename} (unreadable JSON)`);
  }
  return {
    document: ensurePrefabMasterRoot(decodePrefabDocument(loaded.prefab, asset)),
    revision: loaded.revision,
  };
}

export async function fetchPrefabDocument(asset: LibraryAsset): Promise<PrefabDocument> {
  return (await fetchPrefabDocumentSnapshot(asset)).document;
}

export function instantiatePrefabDocument(
  prefab: PrefabDocument,
  options: {
    parentId?: string;
    position?: [number, number, number];
    asset?: Pick<LibraryAsset, "filename" | "name" | "guid">;
    instanceId?: string;
  } = {},
): SceneObject[] {
  const instanceId = options.instanceId ?? createAuthoredId("prefab-inst");
  const idMap = new Map(prefab.objects.map((object) => [object.id, createAuthoredId("obj")]));
  const rootSet = new Set(prefab.rootIds);
  const firstRoot = prefab.objects.find((object) => rootSet.has(object.id)) ?? prefab.objects[0];
  const offset: [number, number, number] = options.position
    ? [
        options.position[0] - firstRoot.position[0],
        options.position[1] - firstRoot.position[1],
        options.position[2] - firstRoot.position[2],
      ]
    : [0, 0, 0];

  return prefab.objects.map((object) => {
    let clone = cloneAsPrefabSource(object);
    const isRoot = rootSet.has(object.id);
    clone.id = idMap.get(object.id) ?? createAuthoredId("obj");
    clone.behaviors = remapBehaviorReferences(clone.behaviors, idMap);
    if (clone.joint?.connectedObjectId) clone.joint.connectedObjectId = idMap.get(clone.joint.connectedObjectId) ?? clone.joint.connectedObjectId;
    clone.name = object.name;
    clone.parentId = isRoot ? options.parentId : object.parentId ? idMap.get(object.parentId) : undefined;
    if (isRoot || !object.parentId) {
      clone.position = [
        object.position[0] + offset[0],
        object.position[1] + offset[1],
        object.position[2] + offset[2],
      ];
    }
    if (options.asset) {
      clone.prefabLink = {
        ...(options.asset.guid ? { prefabRef: { guid: options.asset.guid, localId: "main" } } : {}),
        prefabFilename: options.asset.filename,
        prefabName: options.asset.name,
        instanceId,
        sourceObjectId: object.id,
      };
    }
    return clone;
  });
}

export function prefabOverrideKeysForPatch(patch: Partial<SceneObject>): PrefabOverrideKey[] {
  const keys = new Set<PrefabOverrideKey>();
  if ("name" in patch) keys.add("name");
  if ("tags" in patch) keys.add("tags");
  if ("color" in patch) keys.add("color");
  if ("visible" in patch) keys.add("visibility");
  if ("locked" in patch || "transformLocked" in patch) keys.add("lock");
  if ("position" in patch || "rotation" in patch || "scale" in patch) keys.add("transform");
  if ("parentId" in patch) keys.add("hierarchy");
  if ("assetName" in patch || "assetUrl" in patch || "assetNote" in patch) keys.add("asset");
  if ("botProfileId" in patch) keys.add("botProfile");
  if ("materialId" in patch) keys.add("materialId");
  if ("importedMaterialBindings" in patch) keys.add("importedMaterialBindings");
  if ("water" in patch) keys.add("components");
  if ("cloner" in patch) keys.add("cloner");
  if ("particle" in patch) keys.add("particle");
  if ("camera" in patch) keys.add("camera");
  if ("directionalLight" in patch) keys.add("directionalLight");
  if ("modifiers" in patch) keys.add("modifiers");
  if (
    "animator" in patch ||
    "behaviors" in patch || "uiCanvas" in patch ||
    "characterController" in patch ||
    "animationPlayer" in patch ||
    "depthOfField" in patch ||
    "motionPulse" in patch ||
    "joint" in patch ||
    "rigidbody" in patch ||
    "colliders" in patch
  ) {
    keys.add("components");
  }
  if ("solo" in patch || "wireframe" in patch || "renderVisible" in patch) keys.add("display");
  if ("rowColor" in patch || "rowColorEnabled" in patch) keys.add("rowStyle");
  return Array.from(keys);
}

export function withPrefabOverrides(object: SceneObject, keys: PrefabOverrideKey[]): SceneObject {
  if (!object.prefabLink || keys.length === 0) return object;
  const overrides = new Set(object.prefabLink.overrides ?? []);
  for (const key of keys) overrides.add(key);
  return {
    ...object,
    prefabLink: {
      ...object.prefabLink,
      overrides: Array.from(overrides).sort(),
    },
  };
}

export function updatePrefabLinkedInstances(
  sceneObjects: SceneObject[],
  prefab: PrefabDocument,
  asset: Pick<LibraryAsset, "filename" | "name" | "guid">,
): SceneObject[] {
  const matchesAsset = (link: PrefabLink | undefined): link is PrefabLink => {
    if (!link) return false;
    if (asset.guid && link.prefabRef?.guid) {
      return link.prefabRef.guid.toLowerCase() === asset.guid.toLowerCase();
    }
    return link.prefabFilename === asset.filename;
  };
  const linked = sceneObjects.filter((object) => matchesAsset(object.prefabLink));
  if (linked.length === 0) return sceneObjects;

  const sourceRootIds = new Set(prefab.rootIds);
  const byInstance = new Map<string, SceneObject[]>();
  for (const object of linked) {
    const instanceId = object.prefabLink?.instanceId;
    if (!instanceId) continue;
    const group = byInstance.get(instanceId);
    if (group) group.push(object);
    else byInstance.set(instanceId, [object]);
  }

  const syncedByInstance = new Map<string, SceneObject[]>();
  for (const [instanceId, group] of byInstance) {
    const existingBySource = new Map<string, SceneObject>();
    for (const object of group) {
      const sourceObjectId = object.prefabLink?.sourceObjectId;
      if (sourceObjectId) existingBySource.set(sourceObjectId, object);
    }
    const idMap = new Map<string, string>();
    for (const source of prefab.objects) {
      idMap.set(source.id, existingBySource.get(source.id)?.id ?? createAuthoredId("obj"));
    }
    const synced = prefab.objects.map((source) => {
      const existing = existingBySource.get(source.id);
      const isRoot = sourceRootIds.has(source.id);
      let next = cloneAsPrefabSource(source);
      next.id = idMap.get(source.id)!;
      next.behaviors = remapBehaviorReferences(next.behaviors, idMap);
      next.parentId = isRoot ? existing?.parentId : source.parentId ? idMap.get(source.parentId) : undefined;
      if (next.joint?.connectedObjectId) next.joint.connectedObjectId = idMap.get(next.joint.connectedObjectId) ?? next.joint.connectedObjectId;
      next = mergeOverrides(next, existing, isRoot);
      next.prefabLink = {
        ...(existing?.prefabLink?.prefabRef
          ? { prefabRef: { ...existing.prefabLink.prefabRef } }
          : asset.guid
            ? { prefabRef: { guid: asset.guid, localId: "main" } }
            : {}),
        prefabFilename: asset.filename,
        prefabName: asset.name,
        instanceId,
        sourceObjectId: source.id,
        overrides: existing?.prefabLink?.overrides,
      };
      if (next.prefabLink.overrides?.length === 0) delete next.prefabLink.overrides;
      return next;
    });
    syncedByInstance.set(instanceId, synced);
  }

  const emitted = new Set<string>();
  const result: SceneObject[] = [];
  for (const object of sceneObjects) {
    const link = object.prefabLink;
    if (!matchesAsset(link)) {
      result.push(object);
      continue;
    }
    if (emitted.has(link.instanceId)) continue;
    const synced = syncedByInstance.get(link.instanceId);
    if (synced) result.push(...synced);
    emitted.add(link.instanceId);
  }
  return result;
}
