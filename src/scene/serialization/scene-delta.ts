import type { SceneDocumentV1 } from "./scene-document";

export type SceneDocumentPatch = {
  metadata?: Record<string, unknown>;
  removeMetadata?: string[];
  upsertObjects?: unknown[];
  removeObjectIds?: string[];
  objectOrder?: string[];
};

function recordId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && id ? id : null;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Builds a transport delta while leaving the canonical disk format unchanged. */
export function createSceneDocumentPatch(
  previous: SceneDocumentV1,
  next: SceneDocumentV1,
): SceneDocumentPatch | null {
  const metadata: Record<string, unknown> = {};
  const removeMetadata: string[] = [];
  const previousRecord = previous as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;
  for (const [key, value] of Object.entries(nextRecord)) {
    if (key !== "objects" && !sameJson(value, previousRecord[key])) metadata[key] = value;
  }
  for (const key of Object.keys(previousRecord)) {
    if (key !== "objects" && !Object.prototype.hasOwnProperty.call(nextRecord, key)) removeMetadata.push(key);
  }

  const previousObjects = new Map<string, unknown>();
  for (const object of previous.objects) {
    const id = recordId(object);
    if (!id || previousObjects.has(id)) return null;
    previousObjects.set(id, object);
  }
  const nextObjects = new Map<string, unknown>();
  const nextOrder: string[] = [];
  const upsertObjects: unknown[] = [];
  for (const object of next.objects) {
    const id = recordId(object);
    if (!id || nextObjects.has(id)) return null;
    nextObjects.set(id, object);
    nextOrder.push(id);
    if (!sameJson(object, previousObjects.get(id))) upsertObjects.push(object);
  }
  const removeObjectIds = [...previousObjects.keys()].filter((id) => !nextObjects.has(id));
  const previousOrder = previous.objects.map(recordId);
  const orderChanged = previousOrder.length !== nextOrder.length
    || previousOrder.some((id, index) => id !== nextOrder[index]);

  const patch: SceneDocumentPatch = {};
  if (Object.keys(metadata).length > 0) patch.metadata = metadata;
  if (removeMetadata.length > 0) patch.removeMetadata = removeMetadata;
  if (upsertObjects.length > 0) patch.upsertObjects = upsertObjects;
  if (removeObjectIds.length > 0) patch.removeObjectIds = removeObjectIds;
  if (orderChanged) patch.objectOrder = nextOrder;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** `savedAt` describes a successful write, not authored scene state. This
 * keeps hydration/HMR normalization from manufacturing an autosave whose only
 * change would be a new clock value. */
export function sceneDocumentHasAuthoredChanges(
  previous: SceneDocumentV1,
  next: SceneDocumentV1,
): boolean {
  return createSceneDocumentPatch(previous, {
    ...next,
    savedAt: previous.savedAt,
  }) !== null;
}
