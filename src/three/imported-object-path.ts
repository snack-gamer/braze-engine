import type * as THREE from "three";

/** Stable escaped hierarchy path shared by imported subasset adapters. */
export function getImportedObjectPath(root: THREE.Object3D, object: THREE.Object3D): string {
  if (object === root) return segmentFor(object);
  const segments: string[] = [];
  let cursor: THREE.Object3D | null = object;
  while (cursor && cursor !== root) {
    segments.push(segmentFor(cursor));
    cursor = cursor.parent;
  }
  return segments.reverse().join("/");
}

function segmentFor(object: THREE.Object3D): string {
  const rawLabel = object.name.trim() || object.type || "Object";
  const label = escapePathSegment(rawLabel);
  const siblings = object.parent?.children.filter((item) => (
    (item.name.trim() || item.type || "Object") === rawLabel
  )) ?? [object];
  const index = siblings.indexOf(object);
  return index > 0 ? `${label}[${index + 1}]` : label;
}

function escapePathSegment(value: string): string {
  return value
    .replace(/~/g, "~0")
    .replace(/\//g, "~1")
    .replace(/\[/g, "~2")
    .replace(/\]/g, "~3");
}
