import * as THREE from "three";
import type { CharacterDiagnostic } from "../../domain/diagnostics";
import {
  scanThreeCharacterModelWork,
  type ThreeCharacterModelWorkScan,
} from "./three-character-model-work-limits";

export type ThreeBlendShapePolicyResult = Readonly<{
  animations: readonly THREE.AnimationClip[];
  diagnostics: readonly CharacterDiagnostic[];
  changed: boolean;
}>;

/** Removes imported morph data and tracks when the importer policy disables it. */
export function stripThreeBlendShapes(
  root: THREE.Object3D,
  animations: readonly THREE.AnimationClip[],
): ThreeBlendShapePolicyResult {
  const scan = scanThreeCharacterModelWork(root);
  if (!scan.accepted) return { animations, diagnostics: scan.diagnostics, changed: false };
  return stripThreeBlendShapesFromScan(scan, animations);
}

export function stripThreeBlendShapesFromScan(
  scan: ThreeCharacterModelWorkScan,
  animations: readonly THREE.AnimationClip[],
): ThreeBlendShapePolicyResult {
  const geometries = new Set<THREE.BufferGeometry>();
  let removedTargets = 0;
  let removedMeshBindings = 0;
  for (const mesh of scan.meshes) {
    if (!geometries.has(mesh.geometry)) {
      geometries.add(mesh.geometry);
      const targetCount = Math.max(
        0,
        ...Object.values(mesh.geometry.morphAttributes).map((items) => items.length),
      );
      removedTargets += targetCount;
      if (targetCount > 0) {
        mesh.geometry.morphAttributes = {};
        mesh.geometry.morphTargetsRelative = false;
      }
    }
    if (mesh.morphTargetDictionary !== undefined || mesh.morphTargetInfluences !== undefined) {
      removedMeshBindings += 1;
      mesh.morphTargetDictionary = undefined;
      mesh.morphTargetInfluences = undefined;
    }
  }

  let removedTracks = 0;
  const filteredAnimations = animations.map((clip) => {
    const tracks = clip.tracks.filter((track) => !isMorphTargetTrack(track.name));
    removedTracks += clip.tracks.length - tracks.length;
    if (tracks.length === clip.tracks.length) return clip;
    return new THREE.AnimationClip(
      clip.name,
      clip.duration,
      tracks.map((track) => track.clone()),
      clip.blendMode,
    );
  });
  const changed = removedTargets > 0 || removedMeshBindings > 0 || removedTracks > 0;
  return {
    animations: changed ? filteredAnimations : animations,
    changed,
    diagnostics: changed ? [{
      code: "blend-shapes-stripped",
      severity: "info",
      message: `Removed ${removedTargets} blend shapes and ${removedTracks} morph animation tracks.`,
    }] : [],
  };
}

export function isMorphTargetTrack(trackName: string): boolean {
  return /(?:^|\.)morphTargetInfluences(?:\[|\.|$)/.test(trackName);
}
