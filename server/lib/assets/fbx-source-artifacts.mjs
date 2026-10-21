import { createHash } from "node:crypto";
import { assetDiagnostic } from "./asset-diagnostics.mjs";
import { fbxAnimationTiming } from "./fbx-animation-timing.mjs";
import {
  cleanLocalIdPart,
  semanticFingerprint,
  semanticLocalId,
  uniqueSemanticLocalId,
} from "./gltf-source-context.mjs";

function rawNodeLabel(object) {
  return object.name.trim() || object.type || "Object";
}

function escapedPathSegment(value) {
  return value
    .replace(/~/g, "~0")
    .replace(/\//g, "~1")
    .replace(/\[/g, "~2")
    .replace(/\]/g, "~3");
}

function pathSegment(object) {
  const raw = rawNodeLabel(object);
  const siblings = object.parent?.children.filter((item) => rawNodeLabel(item) === raw) ?? [object];
  const index = siblings.indexOf(object);
  const label = escapedPathSegment(raw);
  return index > 0 ? `${label}[${index + 1}]` : label;
}

function objectPath(root, object) {
  if (object === root) return pathSegment(object);
  const segments = [];
  let cursor = object;
  while (cursor && cursor !== root) {
    segments.push(pathSegment(cursor));
    cursor = cursor.parent;
  }
  return segments.reverse().join("/");
}

function skinnedMeshes(root) {
  const meshes = [];
  root.traverse((object) => {
    if (object.isSkinnedMesh && object.skeleton) meshes.push(object);
  });
  return meshes.sort((left, right) => objectPath(root, left).localeCompare(objectPath(root, right)));
}

function sourceMeshes(root) {
  const meshes = [];
  root.traverse((object) => {
    if (object.isMesh) meshes.push(object);
  });
  return meshes.sort((left, right) => objectPath(root, left).localeCompare(objectPath(root, right)));
}

function meshAndMaterialArtifacts(root) {
  const meshes = sourceMeshes(root);
  const materialBindings = new Map();
  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material, slot) => {
      if (!material) return;
      const bindings = materialBindings.get(material) ?? [];
      bindings.push({ nodePath: objectPath(root, mesh), slot });
      materialBindings.set(material, bindings);
    });
  }

  const usedMaterials = new Set();
  const materialLocalIds = new Map();
  const materials = [...materialBindings.entries()]
    .map(([material, bindings]) => {
      const sortedBindings = bindings.slice().sort((left, right) => (
        left.nodePath.localeCompare(right.nodePath) || left.slot - right.slot
      ));
      const name = material.name?.trim() || material.type || "Material";
      const semantics = { name, type: material.type || null, bindings: sortedBindings };
      return { material, bindings: sortedBindings, name, semantics };
    })
    .sort((left, right) => (
      left.bindings[0].nodePath.localeCompare(right.bindings[0].nodePath)
      || left.bindings[0].slot - right.bindings[0].slot
      || left.name.localeCompare(right.name)
    ))
    .map((candidate, sourceIndex) => {
      const localId = uniqueSemanticLocalId(
        semanticLocalId("material", candidate.name, candidate.semantics),
        usedMaterials,
        candidate.semantics,
      );
      materialLocalIds.set(candidate.material, localId);
      return {
        localId,
        kind: "material",
        name: candidate.name,
        sourceIndex,
        materialType: candidate.material.type || "Material",
        bindings: candidate.bindings,
        inspectorValues: {
          Shader: candidate.material.type || "Material",
          "Base Color": candidate.material.color?.isColor === true
            ? `#${candidate.material.color.getHexString()}` : "Not specified",
          "Used By": candidate.bindings.map(({ nodePath }) => nodePath).join(", ") || "None",
        },
        ...(candidate.material.color?.isColor === true
          ? { previewColor: `#${candidate.material.color.getHexString()}` }
          : {}),
      };
    });

  const usedMeshes = new Set();
  const meshAssets = meshes.map((mesh, sourceIndex) => {
    const path = objectPath(root, mesh);
    const name = mesh.name.trim() || "Mesh";
    const attributes = Object.keys(mesh.geometry?.attributes ?? {}).sort();
    const vertexCount = mesh.geometry?.attributes?.position?.count ?? 0;
    const indexCount = mesh.geometry?.index?.count ?? vertexCount;
    const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const materialIds = materialList.flatMap((material) => {
      const localId = materialLocalIds.get(material);
      return localId ? [localId] : [];
    });
    const semantics = {
      path,
      skinned: mesh.isSkinnedMesh === true,
      materials: materialIds,
      attributes,
    };
    return {
      localId: uniqueSemanticLocalId(
        semanticLocalId("mesh", name, semantics),
        usedMeshes,
        semantics,
      ),
      kind: "mesh",
      name,
      sourceIndex,
      nodePath: path,
      skinned: mesh.isSkinnedMesh === true,
      vertexCount,
      triangleCount: Math.floor(indexCount / 3),
      attributes,
      materialLocalIds: materialIds,
      inspectorValues: {
        Node: path,
        Vertices: vertexCount,
        Triangles: Math.floor(indexCount / 3),
        Skinned: mesh.isSkinnedMesh === true ? "Yes" : "No",
        Attributes: attributes.join(", ") || "None",
        Materials: materialList
          .map((material) => material?.name?.trim() || material?.type)
          .filter(Boolean).join(", ") || "None",
      },
    };
  });
  return { meshes: meshAssets, materials };
}

function skeletonBones(root, meshes) {
  const bones = new Set();
  for (const mesh of meshes) {
    for (const bone of mesh.skeleton.bones) {
      let cursor = bone;
      const chain = [];
      while (cursor && cursor !== root) {
        if (cursor.isBone) chain.push(cursor);
        cursor = cursor.parent;
      }
      if (cursor === root) chain.forEach((item) => bones.add(item));
    }
  }
  return [...bones].sort((left, right) => objectPath(root, left).localeCompare(objectPath(root, right)));
}

function nearestBoneParent(bone, boneSet) {
  let cursor = bone.parent;
  while (cursor) {
    if (cursor.isBone && boneSet.has(cursor)) return cursor;
    cursor = cursor.parent;
  }
  return null;
}

function boneArtifacts(root, bones) {
  const boneSet = new Set(bones);
  const localIds = new Map(bones.map((bone) => [bone, `bone:${objectPath(root, bone)}`]));
  return {
    localIds,
    bones: bones.map((bone) => {
      const parent = nearestBoneParent(bone, boneSet);
      return {
        localId: localIds.get(bone),
        name: bone.name.trim() || "Bone",
        path: objectPath(root, bone),
        parentLocalId: parent ? localIds.get(parent) : null,
        joint: true,
        restTransform: {
          translation: bone.position.toArray(),
          rotation: bone.quaternion.toArray(),
          scale: bone.scale.toArray(),
        },
      };
    }),
  };
}

function skinArtifacts(root, meshes, localIds) {
  const used = new Set();
  return meshes.map((mesh) => {
    const path = objectPath(root, mesh);
    const joints = mesh.skeleton.bones.flatMap((bone) => localIds.has(bone) ? [localIds.get(bone)] : []);
    const semantics = { path, joints };
    const localId = uniqueSemanticLocalId(
      semanticLocalId("skin", mesh.name.trim() || "skin", semantics),
      used,
      semantics,
    );
    return {
      localId,
      name: mesh.name.trim() || "Skin",
      jointCount: joints.length,
      joints,
      bindings: [{ nodePath: path }],
    };
  });
}

function appendDuplicateBoneDiagnostic(bones, diagnostics) {
  const counts = new Map();
  bones.forEach((bone) => counts.set(bone.name, (counts.get(bone.name) ?? 0) + 1));
  const repeated = [...counts.values()].filter((count) => count > 1);
  if (repeated.length === 0) return;
  const duplicates = repeated.reduce((total, count) => total + count - 1, 0);
  diagnostics.push(assetDiagnostic(
    "duplicate-bone-names",
    "warning",
    `${repeated.length} bone names repeat across imported skin branches (${duplicates} duplicate instances); Avatar mapping uses stable hierarchy paths.`,
  ));
}

function rigArtifacts(root, displayName, diagnostics) {
  const meshes = skinnedMeshes(root);
  const sourceBones = skeletonBones(root, meshes);
  if (meshes.length === 0 || sourceBones.length === 0) return null;
  const artifacts = boneArtifacts(root, sourceBones);
  const skins = skinArtifacts(root, meshes, artifacts.localIds);
  const roots = artifacts.bones.filter((bone) => bone.parentLocalId === null);
  const semantics = {
    bones: artifacts.bones.map((bone) => ({
      localId: bone.localId,
      parentLocalId: bone.parentLocalId,
    })),
    skins: skins.map((skin) => ({ path: skin.bindings[0].nodePath, joints: skin.joints })),
  };
  const skeletonSignature = semanticFingerprint(semantics);
  const rootLabel = roots.length === 1 ? roots[0].name : displayName;
  const skeletonLocalId = semanticLocalId("skeleton", rootLabel, semantics);
  const avatarLocalId = semanticLocalId("avatar", rootLabel, semantics);
  const skeletonRoot = roots.length === 1 ? {
    localId: roots[0].localId,
    name: roots[0].name,
    path: roots[0].path,
  } : null;
  const shared = {
    sourceIndex: 0,
    skeletonSignature,
    skeletonRoot,
    bones: artifacts.bones,
    skins,
  };
  appendDuplicateBoneDiagnostic(artifacts.bones, diagnostics);
  return {
    skeleton: {
      localId: skeletonLocalId,
      kind: "skeleton",
      name: `${rootLabel} Skeleton`,
      compatibilitySignature: skeletonSignature,
      inspectorValues: {
        "Root Bone": skeletonRoot?.name ?? "None",
        Bones: artifacts.bones.length,
        Skins: skins.length,
      },
      ...shared,
    },
    avatar: {
      localId: avatarLocalId,
      kind: "avatar",
      name: `${rootLabel} Avatar`,
      rigType: "generic",
      skeletonLocalId,
      inspectorValues: {
        "Animation Type": "Generic",
        Definition: "Create From This Model",
        "Root Bone": skeletonRoot?.name ?? "None",
        "Motion Root": skeletonRoot?.name ?? "None",
        "Human Mapping": "0 bones",
        Bones: artifacts.bones.length,
        Skins: skins.length,
      },
      ...shared,
    },
  };
}

function clipSemantics(clip) {
  return {
    name: clip.name.trim() || null,
    duration: Number.isFinite(clip.duration) ? clip.duration : null,
    tracks: clip.tracks.map((track) => ({
      name: track.name,
      valueType: track.ValueTypeName,
      keyframes: track.times?.length ?? 0,
      firstTime: track.times?.[0] ?? null,
      lastTime: track.times?.[track.times.length - 1] ?? null,
      keyframeFingerprint: trackKeyframeFingerprint(track),
    })),
  };
}

function trackKeyframeFingerprint(track) {
  const hash = createHash("sha256");
  for (const values of [track.times, track.values]) {
    if (!ArrayBuffer.isView(values)) continue;
    hash.update(values.constructor.name);
    hash.update(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
  }
  return hash.digest("hex").slice(0, 16);
}

function clipArtifacts(root, avatarLocalId, diagnostics) {
  const used = new Set(["main"]);
  const candidates = (root.animations ?? []).flatMap((clip, sourceIndex) => {
    const name = clip.name.trim() || `Clip ${sourceIndex + 1}`;
    if (!Number.isFinite(clip.duration) || clip.duration <= 0 || clip.tracks.length === 0) {
      diagnostics.push(assetDiagnostic(
        "fbx-empty-animation-take",
        "warning",
        `Animation take ${name} contains no playable keyframes and was not imported as a Clip.`,
        { sourceIndex },
      ));
      return [];
    }
    return [{ clip, sourceIndex, name, semantics: clipSemantics(clip) }];
  });
  const nameCounts = new Map();
  candidates.forEach(({ name }) => nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1));
  return candidates.map(({ clip, sourceIndex, name, semantics }) => {
    const base = nameCounts.get(name) === 1
      ? `clip:${cleanLocalIdPart(name, `Clip-${sourceIndex + 1}`)}`
      : semanticLocalId("clip", name, semantics);
    const localId = uniqueSemanticLocalId(base, used, semantics);
    const timing = fbxAnimationTiming(clip);
    return {
      localId,
      kind: "clip",
      name,
      sourceName: name,
      sourceIndex,
      sourceTakeLocalId: localId,
      clipOrigin: "source",
      runtimeClipIndex: sourceIndex,
      runtimeSegmentBaseIndex: root.animations?.length ?? candidates.length,
      durationSeconds: clip.duration,
      sourceDurationSeconds: clip.duration,
      frameRate: timing.frameRate,
      firstFrame: timing.firstFrame,
      lastFrame: timing.lastFrame,
      sourceFirstFrame: timing.firstFrame,
      sourceLastFrame: timing.lastFrame,
      looping: true,
      sourceLooping: true,
      trackCount: clip.tracks.length,
      keyframeCount: clip.tracks.reduce((total, track) => total + (track.times?.length ?? 0), 0),
      inspectorValues: {
        Duration: `${clip.duration.toFixed(2)} s`,
        Start: timing.firstFrame,
        End: timing.lastFrame,
        "Sample Rate": `${timing.frameRate} FPS`,
        "Loop Time": "Yes",
        Curves: clip.tracks.length,
        Keyframes: clip.tracks.reduce((total, track) => total + (track.times?.length ?? 0), 0),
        Imported: "Yes",
        Avatar: avatarLocalId ? "1 Avatar" : "None",
      },
      ...(avatarLocalId ? { bindings: [{ avatarLocalIds: [avatarLocalId] }] } : {}),
    };
  });
}

/** Derives durable character sub-assets from Three's parsed FBX scene. */
export function fbxSourceArtifacts(root, displayName) {
  const diagnostics = [];
  const geometry = meshAndMaterialArtifacts(root);
  const rig = rigArtifacts(root, displayName, diagnostics);
  const clips = clipArtifacts(root, rig?.avatar.localId, diagnostics);
  const animationTakes = clips.map((clip) => ({
    localId: clip.localId,
    name: clip.sourceName,
    sourceIndex: clip.sourceIndex,
    frameRate: clip.frameRate,
    firstFrame: clip.sourceFirstFrame,
    lastFrame: clip.sourceLastFrame,
    durationSeconds: clip.sourceDurationSeconds,
    looping: clip.sourceLooping,
    runtimeSegmentBaseIndex: clip.runtimeSegmentBaseIndex,
  }));
  const subAssets = [
    {
      localId: "main",
      kind: "model",
      name: displayName,
      sourceIndex: 0,
      ...(animationTakes.length > 0 ? { animationTakes } : {}),
    },
    ...geometry.meshes,
    ...geometry.materials,
    ...clips,
    ...(rig ? [rig.skeleton, rig.avatar] : []),
  ];
  diagnostics.sort((left, right) => [left.code, left.sourceIndex ?? "", left.message]
    .join(":").localeCompare([right.code, right.sourceIndex ?? "", right.message].join(":")));
  return { dependencies: [], subAssets, diagnostics };
}
