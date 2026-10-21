import * as THREE from "three";
import type { CharacterDiagnostic } from "../../domain/diagnostics";

export type ThreeCharacterModelWorkLimits = Readonly<{
  maximumObjects: number;
  maximumHierarchyDepth: number;
  maximumSkinnedMeshes: number;
  maximumBonesPerSkeleton: number;
  maximumUniqueBones: number;
  maximumVerticesPerSkinGeometry: number;
  maximumUniqueSkinnedVertices: number;
  maximumInspectedSkinVertices: number;
  maximumPlannedSkinVertices: number;
  maximumMorphAttributeChannels: number;
  maximumMorphTargets: number;
  maximumMorphTargetNames: number;
}>;

export const THREE_CHARACTER_MODEL_WORK_LIMITS: ThreeCharacterModelWorkLimits = Object.freeze({
  maximumObjects: 10_000,
  maximumHierarchyDepth: 256,
  maximumSkinnedMeshes: 64,
  maximumBonesPerSkeleton: 1_024,
  maximumUniqueBones: 2_048,
  maximumVerticesPerSkinGeometry: 500_000,
  maximumUniqueSkinnedVertices: 1_000_000,
  maximumInspectedSkinVertices: 2_000_000,
  maximumPlannedSkinVertices: 1_000_000,
  maximumMorphAttributeChannels: 16,
  maximumMorphTargets: 1_024,
  maximumMorphTargetNames: 2_048,
});

export type ThreeCharacterModelWorkStats = Readonly<{
  objects: number;
  maximumHierarchyDepth: number;
  skinnedMeshes: number;
  uniqueBones: number;
  maximumBonesPerSkeleton: number;
  maximumVerticesPerSkinGeometry: number;
  uniqueSkinnedVertices: number;
  inspectedSkinVertices: number;
  plannedSkinVertices: number;
  maximumMorphAttributeChannels: number;
  morphTargets: number;
  morphTargetNames: number;
}>;

export type ThreeCharacterModelWorkScan = Readonly<{
  accepted: boolean;
  diagnostics: readonly CharacterDiagnostic[];
  objects: readonly THREE.Object3D[];
  meshes: readonly THREE.Mesh[];
  skinnedMeshes: readonly THREE.SkinnedMesh[];
  stats: ThreeCharacterModelWorkStats;
}>;

type MutableStats = {
  -readonly [Key in keyof ThreeCharacterModelWorkStats]: ThreeCharacterModelWorkStats[Key];
};

const EMPTY_STATS: ThreeCharacterModelWorkStats = Object.freeze({
  objects: 0,
  maximumHierarchyDepth: 0,
  skinnedMeshes: 0,
  uniqueBones: 0,
  maximumBonesPerSkeleton: 0,
  maximumVerticesPerSkinGeometry: 0,
  uniqueSkinnedVertices: 0,
  inspectedSkinVertices: 0,
  plannedSkinVertices: 0,
  maximumMorphAttributeChannels: 0,
  morphTargets: 0,
  morphTargetNames: 0,
});

/**
 * Performs one bounded, non-mutating pass before character import/extraction.
 * Totals mirror the later per-mesh scans and per-variant skin allocations.
 */
export function scanThreeCharacterModelWork(
  root: THREE.Object3D,
  limits: ThreeCharacterModelWorkLimits = THREE_CHARACTER_MODEL_WORK_LIMITS,
): ThreeCharacterModelWorkScan {
  const objects: THREE.Object3D[] = [];
  const meshes: THREE.Mesh[] = [];
  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  const diagnostics: CharacterDiagnostic[] = [];
  const stats: MutableStats = { ...EMPTY_STATS };
  const pending: Array<Readonly<{ object: THREE.Object3D; depth: number }>> = [{ object: root, depth: 0 }];

  while (pending.length > 0) {
    const entry = pending.pop()!;
    stats.objects += 1;
    stats.maximumHierarchyDepth = Math.max(stats.maximumHierarchyDepth, entry.depth);
    if (stats.objects > limits.maximumObjects) {
      diagnostics.push(limitDiagnostic(
        "character-model-object-limit-exceeded",
        "object graph",
        stats.objects,
        limits.maximumObjects,
      ));
      return rejectedScan(objects, meshes, skinnedMeshes, stats, diagnostics);
    }
    if (entry.depth > limits.maximumHierarchyDepth) {
      diagnostics.push(limitDiagnostic(
        "character-model-depth-limit-exceeded",
        "hierarchy depth",
        entry.depth,
        limits.maximumHierarchyDepth,
      ));
      return rejectedScan(objects, meshes, skinnedMeshes, stats, diagnostics);
    }
    objects.push(entry.object);
    const mesh = entry.object as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) meshes.push(mesh);
    const skinnedMesh = entry.object as THREE.SkinnedMesh;
    if (skinnedMesh.isSkinnedMesh && skinnedMesh.geometry && skinnedMesh.skeleton) {
      skinnedMeshes.push(skinnedMesh);
      if (skinnedMeshes.length > limits.maximumSkinnedMeshes) {
        stats.skinnedMeshes = skinnedMeshes.length;
        diagnostics.push(limitDiagnostic(
          "character-skinned-mesh-limit-exceeded",
          "skinned mesh count",
          stats.skinnedMeshes,
          limits.maximumSkinnedMeshes,
        ));
        return rejectedScan(objects, meshes, skinnedMeshes, stats, diagnostics);
      }
    }
    const discoveredObjects = stats.objects + pending.length + entry.object.children.length;
    if (discoveredObjects > limits.maximumObjects) {
      stats.objects = discoveredObjects;
      diagnostics.push(limitDiagnostic(
        "character-model-object-limit-exceeded",
        "object graph",
        discoveredObjects,
        limits.maximumObjects,
      ));
      return rejectedScan(objects, meshes, skinnedMeshes, stats, diagnostics);
    }
    for (let index = entry.object.children.length - 1; index >= 0; index -= 1) {
      pending.push({ object: entry.object.children[index]!, depth: entry.depth + 1 });
    }
  }

  stats.skinnedMeshes = skinnedMeshes.length;
  const bones = new Set<THREE.Bone>();
  const geometryBoneCounts = new Map<THREE.BufferGeometry, Set<number>>();
  const geometryVertexCounts = new Map<THREE.BufferGeometry, number>();
  for (const mesh of skinnedMeshes) {
    const boneCount = mesh.skeleton.bones.length;
    stats.maximumBonesPerSkeleton = Math.max(stats.maximumBonesPerSkeleton, boneCount);
    if (boneCount > limits.maximumBonesPerSkeleton) diagnostics.push(limitDiagnostic(
      "character-skeleton-bone-limit-exceeded",
      `bone count for ${mesh.name || mesh.type}`,
      boneCount,
      limits.maximumBonesPerSkeleton,
    ));
    if (diagnostics.length > 0) return rejectedScan(objects, meshes, skinnedMeshes, stats, diagnostics);
    for (const bone of mesh.skeleton.bones) {
      if (bone) bones.add(bone);
      if (bones.size > limits.maximumUniqueBones) {
        stats.uniqueBones = bones.size;
        diagnostics.push(limitDiagnostic(
          "character-unique-bone-limit-exceeded",
          "unique bone count",
          stats.uniqueBones,
          limits.maximumUniqueBones,
        ));
        return rejectedScan(objects, meshes, skinnedMeshes, stats, diagnostics);
      }
    }

    const indices = mesh.geometry.getAttribute("skinIndex");
    const weights = mesh.geometry.getAttribute("skinWeight");
    if (!indices || !weights || indices.count !== weights.count) continue;
    const vertexCount = weights.count;
    stats.maximumVerticesPerSkinGeometry = Math.max(stats.maximumVerticesPerSkinGeometry, vertexCount);
    if (vertexCount > limits.maximumVerticesPerSkinGeometry) diagnostics.push(limitDiagnostic(
      "character-skin-geometry-vertex-limit-exceeded",
      `skin vertices for ${mesh.name || mesh.type}`,
      vertexCount,
      limits.maximumVerticesPerSkinGeometry,
    ));
    stats.inspectedSkinVertices += vertexCount;
    if (!geometryVertexCounts.has(mesh.geometry)) geometryVertexCounts.set(mesh.geometry, vertexCount);
    if (boneCount > 0) {
      const variants = geometryBoneCounts.get(mesh.geometry) ?? new Set<number>();
      variants.add(boneCount);
      geometryBoneCounts.set(mesh.geometry, variants);
    }
  }
  stats.uniqueBones = bones.size;
  stats.uniqueSkinnedVertices = [...geometryVertexCounts.values()].reduce((sum, count) => sum + count, 0);
  stats.plannedSkinVertices = [...geometryBoneCounts].reduce((sum, [geometry, boneCounts]) => (
    sum + (geometryVertexCounts.get(geometry) ?? 0) * boneCounts.size
  ), 0);
  appendTotalLimitDiagnostics(stats, limits, diagnostics);
  if (diagnostics.length > 0) return rejectedScan(objects, meshes, skinnedMeshes, stats, diagnostics);

  for (const mesh of meshes) {
    let channels = 0;
    let targetCount = 0;
    const morphAttributes = mesh.geometry.morphAttributes as unknown as Readonly<
      Record<string, readonly unknown[] | undefined>
    >;
    for (const key in morphAttributes) {
      if (!Object.prototype.hasOwnProperty.call(morphAttributes, key)) continue;
      channels += 1;
      if (channels > limits.maximumMorphAttributeChannels) break;
      targetCount = Math.max(targetCount, morphAttributes[key]?.length ?? 0);
    }
    stats.maximumMorphAttributeChannels = Math.max(stats.maximumMorphAttributeChannels, channels);
    if (channels > limits.maximumMorphAttributeChannels) diagnostics.push(limitDiagnostic(
      "character-morph-channel-limit-exceeded",
      `morph attribute channels for ${mesh.name || mesh.type}`,
      channels,
      limits.maximumMorphAttributeChannels,
    ));
    stats.morphTargets += targetCount;
    if (stats.morphTargets > limits.maximumMorphTargets) diagnostics.push(limitDiagnostic(
      "character-morph-target-limit-exceeded",
      "morph target bindings",
      stats.morphTargets,
      limits.maximumMorphTargets,
    ));
    for (const name in mesh.morphTargetDictionary ?? {}) {
      if (!Object.prototype.hasOwnProperty.call(mesh.morphTargetDictionary, name)) continue;
      stats.morphTargetNames += 1;
      if (stats.morphTargetNames > limits.maximumMorphTargetNames) break;
    }
    if (stats.morphTargetNames > limits.maximumMorphTargetNames) diagnostics.push(limitDiagnostic(
      "character-morph-name-limit-exceeded",
      "morph target names",
      stats.morphTargetNames,
      limits.maximumMorphTargetNames,
    ));
    if (diagnostics.length > 0) return rejectedScan(objects, meshes, skinnedMeshes, stats, diagnostics);
  }

  return {
    accepted: true,
    diagnostics,
    objects,
    meshes,
    skinnedMeshes,
    stats,
  };
}

function appendTotalLimitDiagnostics(
  stats: ThreeCharacterModelWorkStats,
  limits: ThreeCharacterModelWorkLimits,
  diagnostics: CharacterDiagnostic[],
): void {
  const totals: ReadonlyArray<readonly [number, number, string, string]> = [
    [stats.uniqueSkinnedVertices, limits.maximumUniqueSkinnedVertices,
      "character-unique-skinned-vertex-limit-exceeded", "unique skinned vertices"],
    [stats.inspectedSkinVertices, limits.maximumInspectedSkinVertices,
      "character-skin-inspection-limit-exceeded", "skin vertices inspected"],
    [stats.plannedSkinVertices, limits.maximumPlannedSkinVertices,
      "character-skin-plan-limit-exceeded", "skin-plan vertices"],
  ];
  for (const [actual, maximum, code, label] of totals) {
    if (actual > maximum) diagnostics.push(limitDiagnostic(code, label, actual, maximum));
  }
}

function rejectedScan(
  objects: readonly THREE.Object3D[],
  meshes: readonly THREE.Mesh[],
  skinnedMeshes: readonly THREE.SkinnedMesh[],
  stats: ThreeCharacterModelWorkStats,
  diagnostics: readonly CharacterDiagnostic[],
): ThreeCharacterModelWorkScan {
  return { accepted: false, diagnostics, objects, meshes, skinnedMeshes, stats };
}

function limitDiagnostic(
  code: string,
  label: string,
  actual: number,
  maximum: number,
): CharacterDiagnostic {
  return {
    code,
    severity: "error",
    message: `Character model ${label} is ${actual}; the synchronous work limit is ${maximum}.`,
  };
}
