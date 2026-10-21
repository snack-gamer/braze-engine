import { assetReference } from "./asset-identity.mjs";
import { enrichGltfAnimationArtifacts } from "./gltf-animation-artifacts.mjs";
import { enrichGltfDeformationArtifacts } from "./gltf-deformation-artifacts.mjs";
import { validateGltfCharacterDocument } from "./gltf-document-validation.mjs";
import { deriveGltfRigArtifacts } from "./gltf-rig-artifacts.mjs";
import {
  buildGltfNodeGraph,
  cleanLocalIdPart,
  explicitLocalId,
  gltfAccessorFacts,
  semanticAccessorFacts,
  semanticFingerprint,
  semanticLocalId,
  sourceItemLabel,
  uniqueSemanticLocalId,
} from "./gltf-source-context.mjs";

export { semanticFingerprint, semanticLocalId } from "./gltf-source-context.mjs";

function animationBufferIdentity(document, sourceIndex, cache) {
  if (!Number.isInteger(sourceIndex)) return null;
  if (cache.has(sourceIndex)) return cache.get(sourceIndex);
  const buffer = Array.isArray(document.buffers) ? document.buffers[sourceIndex] : null;
  const uri = typeof buffer?.uri === "string" ? buffer.uri : null;
  const identity = buffer && typeof buffer === "object" ? {
    uri: uri && /^data:/i.test(uri) ? `data:${semanticFingerprint(uri)}` : uri,
    byteLength: Number.isInteger(buffer.byteLength) ? buffer.byteLength : null,
  } : null;
  cache.set(sourceIndex, identity);
  return identity;
}

function animationAccessorIdentity(document, sourceIndex, cache) {
  if (cache.accessors.has(sourceIndex)) return cache.accessors.get(sourceIndex);
  const facts = gltfAccessorFacts(document, sourceIndex);
  const view = Number.isInteger(facts.bufferView)
    && Array.isArray(document.bufferViews)
    ? document.bufferViews[facts.bufferView]
    : null;
  const identity = {
    ...semanticAccessorFacts(facts),
    storage: view && typeof view === "object" ? {
      accessorByteOffset: facts.byteOffset ?? 0,
      viewByteOffset: Number.isInteger(view.byteOffset) ? view.byteOffset : 0,
      viewByteLength: Number.isInteger(view.byteLength) ? view.byteLength : null,
      viewByteStride: Number.isInteger(view.byteStride) ? view.byteStride : null,
      buffer: animationBufferIdentity(document, view.buffer, cache.buffers),
    } : null,
  };
  cache.accessors.set(sourceIndex, identity);
  return identity;
}

function animationIdentitySemantics(document, animation, graph, cache) {
  const samplers = (Array.isArray(animation?.samplers) ? animation.samplers : []).map((sampler) => ({
    interpolation: typeof sampler?.interpolation === "string" ? sampler.interpolation : "LINEAR",
    input: animationAccessorIdentity(document, sampler?.input, cache),
    output: animationAccessorIdentity(document, sampler?.output, cache),
  }));
  const samplerIds = samplers.map(semanticFingerprint);
  const channels = (Array.isArray(animation?.channels) ? animation.channels : []).map((channel) => {
    const targetIndex = channel?.target?.node;
    return {
      target: Number.isInteger(targetIndex)
        && targetIndex >= 0
        && targetIndex < graph.nodes.length
        ? graph.nodeKey(targetIndex)
        : null,
      path: typeof channel?.target?.path === "string" ? channel.target.path : null,
      sampler: Number.isInteger(channel?.sampler) ? samplerIds[channel.sampler] ?? null : null,
    };
  });
  return {
    samplers: samplerIds.sort(),
    channels: channels.map(semanticFingerprint).sort(),
  };
}

function appendAnimationSubAssets(document, graph, subAssets, used) {
  const animations = Array.isArray(document.animations) ? document.animations : [];
  const identityCache = { accessors: new Map(), buffers: new Map() };
  const candidates = animations.map((item, sourceIndex) => {
    const label = sourceItemLabel(item, "clip", sourceIndex);
    const explicit = explicitLocalId("clip", item);
    const named = typeof item?.name === "string" && item.name.trim()
      ? item.name.trim()
      : null;
    const legacy = explicit ?? `clip:${cleanLocalIdPart(label, String(sourceIndex + 1))}`;
    return {
      item,
      sourceIndex,
      label,
      explicit,
      named,
      legacy,
      semantics: animationIdentitySemantics(document, item, graph, identityCache),
    };
  });
  const counts = new Map();
  for (const candidate of candidates) {
    counts.set(candidate.legacy, (counts.get(candidate.legacy) ?? 0) + 1);
  }
  for (const candidate of candidates) {
    const semanticIdentity = !candidate.explicit
      && (!candidate.named || counts.get(candidate.legacy) > 1);
    const base = semanticIdentity
      ? semanticLocalId("clip", candidate.named || "clip", candidate.semantics)
      : candidate.legacy;
    const localId = uniqueSemanticLocalId(base, used, candidate.semantics);
    subAssets.push({
      localId,
      kind: "clip",
      name: candidate.label,
      sourceIndex: candidate.sourceIndex,
      looping: candidate.item?.extras?.brazeLooping !== false,
    });
  }
}

export function gltfSubAssets(document, displayName, sourceGraph) {
  const used = new Set(["main"]);
  const subAssets = [
    { localId: "main", kind: "model", name: displayName, sourceIndex: 0 },
  ];
  const append = (kind, item, index) => {
    const label = sourceItemLabel(item, kind, index);
    const fallback = `${kind}:${cleanLocalIdPart(label, String(index + 1))}`;
    const explicit = typeof item?.extras?.brazeLocalId === "string"
      ? item.extras.brazeLocalId.trim()
      : "";
    let localId = cleanLocalIdPart(explicit, fallback);
    if (!localId.includes(":")) localId = `${kind}:${localId}`;
    const base = localId;
    let suffix = 2;
    while (used.has(localId)) {
      localId = `${base}:${suffix}`;
      suffix += 1;
    }
    used.add(localId);
    subAssets.push({ localId, kind, name: label, sourceIndex: index });
  };
  (Array.isArray(document.meshes) ? document.meshes : [])
    .forEach((item, index) => append("mesh", item, index));
  (Array.isArray(document.materials) ? document.materials : [])
    .forEach((item, index) => append("material", item, index));
  const graph = sourceGraph ?? buildGltfNodeGraph(document, []);
  appendAnimationSubAssets(document, graph, subAssets, used);
  return subAssets;
}

export function gltfSourceArtifacts(document, displayName) {
  const diagnostics = [];
  validateGltfCharacterDocument(document, diagnostics);
  const graph = buildGltfNodeGraph(document, diagnostics);
  const subAssets = gltfSubAssets(document, displayName, graph);
  const meshRecords = subAssets.filter((item) => item.kind === "mesh");
  const clipRecords = subAssets.filter((item) => item.kind === "clip");
  const meshByIndex = new Map(meshRecords.map((item) => [item.sourceIndex, item]));
  const { avatars, skeletons } = deriveGltfRigArtifacts(
    document,
    meshByIndex,
    displayName,
    diagnostics,
    graph,
  );
  const used = new Set(subAssets.map((item) => item.localId));
  const skeletonLocalIdBySignature = new Map();
  for (const skeleton of skeletons) {
    skeleton.localId = uniqueSemanticLocalId(
      skeleton.localId,
      used,
      skeleton.compatibilitySignature,
    );
    skeletonLocalIdBySignature.set(skeleton.compatibilitySignature, skeleton.localId);
  }
  for (const avatar of avatars) {
    avatar.skeletonLocalId = skeletonLocalIdBySignature.get(avatar.skeletonSignature)
      ?? avatar.skeletonLocalId;
    avatar.localId = uniqueSemanticLocalId(avatar.localId, used, avatar.skeletonSignature);
  }
  enrichGltfDeformationArtifacts(document, meshRecords, diagnostics);
  enrichGltfAnimationArtifacts(document, clipRecords, graph, avatars, diagnostics);
  subAssets.push(...skeletons, ...avatars);
  diagnostics.sort((left, right) => [left.code, left.localId ?? "", left.message]
    .join(":").localeCompare([right.code, right.localId ?? "", right.message].join(":")));
  return { subAssets, diagnostics };
}

export function gltfDependencies(document) {
  const dependencies = [];
  const append = (kind, item) => {
    if (typeof item?.uri !== "string" || !item.uri.trim() || /^data:/i.test(item.uri)) return;
    dependencies.push({ kind, path: item.uri.replaceAll("\\", "/") });
  };
  (Array.isArray(document.buffers) ? document.buffers : [])
    .forEach((item) => append("buffer", item));
  (Array.isArray(document.images) ? document.images : [])
    .forEach((item) => append("texture", item));
  return dependencies;
}

export function prefabArtifacts(document, displayName) {
  if (!document || typeof document !== "object" || !Array.isArray(document.objects)) {
    throw new Error("Prefab must contain an objects array");
  }
  const subAssets = [
    { localId: "main", kind: "prefab", name: displayName, sourceIndex: 0 },
  ];
  const dependencies = [];
  const dependencyKeys = new Set();
  const appendDependency = (reference, objectId, relationship) => {
    if (!reference) return;
    const key = `${reference.guid}:${reference.localId}:${relationship}`;
    if (dependencyKeys.has(key)) return;
    dependencyKeys.add(key);
    dependencies.push({
      kind: "asset",
      guid: reference.guid,
      localId: reference.localId,
      objectId,
      relationship,
    });
  };
  const usedLocalIds = new Set(["main"]);
  document.objects.forEach((object, index) => {
    if (!object || typeof object !== "object") return;
    const objectId = typeof object.id === "string" && object.id.trim()
      ? object.id.trim()
      : `object-${index + 1}`;
    const label = typeof object.name === "string" && object.name.trim()
      ? object.name.trim()
      : objectId;
    const baseLocalId = `entity:${cleanLocalIdPart(objectId, String(index + 1))}`;
    let localId = baseLocalId;
    let suffix = 2;
    while (usedLocalIds.has(localId)) {
      localId = `${baseLocalId}:${suffix}`;
      suffix += 1;
    }
    usedLocalIds.add(localId);
    subAssets.push({ localId, kind: "entity", name: label, sourceIndex: index });
    appendDependency(
      assetReference(object.assetRef ?? object.asset_ref ?? object.asset?.ref),
      objectId,
      "source",
    );
    appendDependency(
      assetReference(object.prefabLink?.prefabRef ?? object.prefab_link?.prefab_ref),
      objectId,
      "nested-prefab",
    );
  });
  return { dependencies, subAssets, diagnostics: [] };
}
