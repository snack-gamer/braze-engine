import { DEFAULT_OBJECT_COLOR, type PrimitiveKind, type Vec3 } from "../../scene/domain/scene-values";
import type { SceneObject } from "../../scene/domain/scene-object";
import { captureEntityTags } from "../../world/domain/entity-tags";
import { decodeBehaviorComponent, encodeBehaviorComponent } from "../../behaviors/serialization/behavior-component-codec";
import { decodeUiCanvas, encodeUiCanvas } from "../../game-ui/serialization/ui-canvas-codec";
import { decodeAnimatorComponent, encodeAnimatorComponent } from "../../character/serialization/animator-component-codec";
import { decodeCharacterController, encodeCharacterController } from "../../character-controller/serialization/character-controller-codec";
import { PREFAB_DOCUMENT_VERSION, PREFAB_ASSET_RE, type PrefabDocument } from "../domain/prefab-document";
type PrefabSourceLabel = Readonly<{ filename: string; name: string }>;

const PREFAB_PRIMITIVES: ReadonlySet<string> = new Set<PrimitiveKind>([
  "transform",
  "cube",
  "sphere",
  "plane",
  "water",
  "cloner",
  "effector",
  "particle",
  "image",
  "fbx",
  "usdz",
  "usd",
  "gltf",
  "camera",
  "directionalLight",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isPrefabPrimitive(value: string): value is PrimitiveKind {
  return PREFAB_PRIMITIVES.has(value);
}

function parsePrefabVec3(value: unknown): Vec3 | undefined {
  if (!Array.isArray(value) || value.length < 3) return undefined;
  const [x, y, z] = value;
  return typeof x === "number" && Number.isFinite(x)
    && typeof y === "number" && Number.isFinite(y)
    && typeof z === "number" && Number.isFinite(z)
    ? [x, y, z]
    : undefined;
}

function invalidPrefab(asset: PrefabSourceLabel, detail: string): Error {
  return new Error(`Invalid prefab: ${asset.filename} (${detail})`);
}

function parsePrefabObject(value: unknown, index: number, asset: PrefabSourceLabel): SceneObject {
  if (!isRecord(value)) {
    throw invalidPrefab(asset, `object ${index + 1} must be an object`);
  }
  const id = nonEmptyString(value.id);
  const primitive = nonEmptyString(value.primitive);
  const position = parsePrefabVec3(value.position);
  const rotation = parsePrefabVec3(value.rotation);
  const scale = parsePrefabVec3(value.scale);
  if (!id) throw invalidPrefab(asset, `object ${index + 1} has no id`);
  if (!primitive || !isPrefabPrimitive(primitive)) {
    throw invalidPrefab(asset, `object ${index + 1} has an unsupported primitive`);
  }
  if (!position || !rotation || !scale) {
    throw invalidPrefab(asset, `object ${index + 1} has an invalid transform`);
  }

  const rawCharacter = value.characterController ?? value.character_controller;
  const characterController = rawCharacter === undefined || rawCharacter === null ? undefined : decodeCharacterController(rawCharacter);
  if (rawCharacter !== undefined && rawCharacter !== null && !characterController) throw invalidPrefab(asset, `${id} has an invalid Character Controller`);
  const { character_controller: _legacyCharacter, ...fields } = value;

  return {
    ...fields,
    id,
    name: nonEmptyString(value.name) ?? `Object ${index + 1}`,
    tags: value.tags === undefined ? undefined : captureEntityTags(value.tags),
    behaviors: decodeBehaviorComponent(value.behaviors),
    uiCanvas: decodeUiCanvas(value.uiCanvas),
    animator: value.animator === undefined || value.animator === null ? undefined : decodeAnimatorComponent(value.animator),
    characterController,
    primitive,
    color: nonEmptyString(value.color) ?? DEFAULT_OBJECT_COLOR,
    visible: value.visible !== false,
    locked: value.locked === true,
    position,
    rotation,
    scale,
    parentId: nonEmptyString(value.parentId),
  };
}

export function decodePrefabDocument(rawDocument: unknown, asset: PrefabSourceLabel): PrefabDocument {
  if (!isRecord(rawDocument) || !Array.isArray(rawDocument.objects)) {
    throw invalidPrefab(asset, "document must contain an objects array");
  }
  const sourceVersion = nonEmptyString(rawDocument.version);
  if (
    sourceVersion !== undefined
    && sourceVersion !== PREFAB_DOCUMENT_VERSION
    && sourceVersion !== "tgan/prefab-v1"
  ) {
    throw invalidPrefab(asset, `unsupported document version: ${sourceVersion}`);
  }
  const objects = rawDocument.objects.map((object, index) => parsePrefabObject(object, index, asset));
  if (objects.length === 0) throw invalidPrefab(asset, "objects array is empty");
  const objectIds = new Set<string>();
  for (const object of objects) {
    if (objectIds.has(object.id)) throw invalidPrefab(asset, `duplicate object id: ${object.id}`);
    objectIds.add(object.id);
  }
  const requestedRootIds = Array.isArray(rawDocument.rootIds)
    ? rawDocument.rootIds
        .filter((id): id is string => typeof id === "string" && objectIds.has(id))
        .filter((id, index, ids) => ids.indexOf(id) === index)
    : [];
  const rootIds = requestedRootIds.length > 0
    ? requestedRootIds
    : objects.filter((object) => !object.parentId).map((object) => object.id);
  const name = nonEmptyString(rawDocument.name) ?? asset.name.replace(PREFAB_ASSET_RE, "");
  return {
    version: PREFAB_DOCUMENT_VERSION,
    name,
    createdAt: nonEmptyString(rawDocument.createdAt) ?? new Date().toISOString(),
    savedAt: nonEmptyString(rawDocument.savedAt),
    rootIds,
    objects,
  };
}

/** Prefabs use authored object names; components still cross their owned codec boundary. */
export function encodePrefabDocument(document: PrefabDocument) {
  return {
    ...document,
    objects: document.objects.map((object) => ({
      ...object,
      ...(object.behaviors === undefined ? {} : { behaviors: encodeBehaviorComponent(object.behaviors) }),
      ...(object.uiCanvas === undefined ? {} : { uiCanvas: encodeUiCanvas(object.uiCanvas) }),
      ...(object.animator === undefined ? {} : { animator: encodeAnimatorComponent(object.animator) }),
      ...(object.characterController === undefined ? {} : { characterController: encodeCharacterController(object.characterController) }),
    })),
  };
}
