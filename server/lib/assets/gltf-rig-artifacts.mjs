import { assetDiagnostic } from "./asset-diagnostics.mjs";
import {
  buildGltfNodeGraph,
  explicitLocalId,
  gltfAccessorFacts,
  gltfNodeRestTransform,
  semanticAccessorFacts,
  semanticFingerprint,
  semanticLocalId,
  sourceItemLabel,
} from "./gltf-source-context.mjs";

const FLOAT = 5126;

function isAncestor(graph, ancestor, descendant) {
  return graph.ancestry(descendant).includes(ancestor);
}

function commonRoot(graph, joints) {
  if (joints.length === 0) return null;
  return [...graph.ancestry(joints[0])].reverse()
    .find((candidate) => joints.every((joint) => isAncestor(graph, candidate, joint))) ?? null;
}

function inverseBindFacts(document, skin, jointCount, skinIndex, diagnostics) {
  if (skin.inverseBindMatrices === undefined) {
    return { present: false, identity: true, valid: true, count: jointCount };
  }
  const facts = gltfAccessorFacts(document, skin.inverseBindMatrices);
  const valid = facts.validReference
    && facts.type === "MAT4"
    && facts.componentType === FLOAT
    && Number.isInteger(facts.count)
    && facts.count === jointCount;
  if (!valid) {
    diagnostics.push(assetDiagnostic(
      "gltf-inverse-bind-accessor-invalid",
      "error",
      `${sourceItemLabel(skin, "Skin", skinIndex)} has an invalid inverse-bind matrix accessor.`,
      { skinIndex, accessorIndex: skin.inverseBindMatrices },
    ));
  }
  return { present: true, identity: false, valid, ...facts };
}

function validateSkinNodeBindings(document, diagnostics) {
  const skins = Array.isArray(document.skins) ? document.skins : [];
  const meshes = Array.isArray(document.meshes) ? document.meshes : [];
  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  nodes.forEach((node, sourceIndex) => {
    if (node?.skin === undefined) return;
    if (!Number.isInteger(node.skin) || node.skin < 0 || node.skin >= skins.length) {
      diagnostics.push(assetDiagnostic(
        "gltf-skin-node-invalid",
        "error",
        `${sourceItemLabel(node, "Node", sourceIndex)} references a missing skin.`,
        { sourceIndex, skinIndex: node.skin },
      ));
    }
    if (!Number.isInteger(node.mesh) || node.mesh < 0 || node.mesh >= meshes.length) {
      diagnostics.push(assetDiagnostic(
        "gltf-skin-node-mesh-invalid",
        "error",
        `${sourceItemLabel(node, "Node", sourceIndex)} uses a skin without a valid mesh.`,
        { sourceIndex, meshIndex: node.mesh ?? null },
      ));
    }
  });
}

function deriveSkinRecords(document, graph, meshByIndex, diagnostics) {
  if (document.skins !== undefined && !Array.isArray(document.skins)) {
    diagnostics.push(assetDiagnostic("gltf-skins-invalid", "error", "glTF skins must be an array."));
    return [];
  }
  validateSkinNodeBindings(document, diagnostics);
  const skins = Array.isArray(document.skins) ? document.skins : [];
  return skins.flatMap((skin, sourceIndex) => {
    if (!skin || typeof skin !== "object" || !Array.isArray(skin.joints) || skin.joints.length === 0) {
      diagnostics.push(assetDiagnostic(
        "gltf-skin-joints-invalid",
        "error",
        `${sourceItemLabel(skin, "Skin", sourceIndex)} must define at least one joint.`,
        { skinIndex: sourceIndex },
      ));
      return [];
    }
    const referencedJoints = skin.joints.filter(
      (joint) => Number.isInteger(joint)
        && joint >= 0
        && joint < graph.nodes.length
        && graph.nodes[joint]
        && typeof graph.nodes[joint] === "object",
    );
    const joints = [...new Set(referencedJoints)];
    if (referencedJoints.length !== skin.joints.length || joints.length !== referencedJoints.length) {
      diagnostics.push(assetDiagnostic(
        "gltf-skin-joints-invalid",
        "error",
        `${sourceItemLabel(skin, "Skin", sourceIndex)} contains missing or duplicate joints.`,
        { skinIndex: sourceIndex },
      ));
    }
    if (joints.length === 0) return [];
    const computedRoot = commonRoot(graph, joints);
    const declaredRoot = skin.skeleton;
    const declaredRootValid = declaredRoot === undefined
      || (Number.isInteger(declaredRoot)
        && declaredRoot >= 0
        && declaredRoot < graph.nodes.length
        && joints.every((joint) => isAncestor(graph, declaredRoot, joint)));
    if (!declaredRootValid || computedRoot === null) {
      diagnostics.push(assetDiagnostic(
        "gltf-skeleton-root-invalid",
        "error",
        `${sourceItemLabel(skin, "Skin", sourceIndex)} does not have a valid common skeleton root.`,
        { skinIndex: sourceIndex, skeletonNodeIndex: declaredRoot ?? null },
      ));
    }
    const root = declaredRootValid && Number.isInteger(declaredRoot) ? declaredRoot : computedRoot;
    const hierarchyNodes = [];
    const hierarchySet = new Set();
    for (const joint of joints) {
      const ancestry = graph.ancestry(joint);
      const rootOffset = Number.isInteger(root) ? ancestry.indexOf(root) : 0;
      for (const nodeIndex of ancestry.slice(Math.max(0, rootOffset))) {
        if (hierarchySet.has(nodeIndex)) continue;
        hierarchySet.add(nodeIndex);
        hierarchyNodes.push(nodeIndex);
      }
    }
    const boneKeys = new Map(hierarchyNodes.map(
      (nodeIndex) => [nodeIndex, semanticFingerprint(graph.nodeKey(nodeIndex))],
    ));
    const edges = hierarchyNodes.map((nodeIndex) => {
      const parentBone = graph.ancestry(nodeIndex).slice(0, -1).reverse()
        .find((candidate) => hierarchySet.has(candidate));
      return {
        bone: boneKeys.get(nodeIndex),
        parent: Number.isInteger(parentBone) ? boneKeys.get(parentBone) : null,
      };
    }).sort((left, right) => left.bone.localeCompare(right.bone));
    const skeletonSemantics = {
      root: Number.isInteger(root) ? graph.nodeKey(root) : null,
      bones: [...boneKeys.values()].sort(),
      joints: joints.map((joint) => boneKeys.get(joint)).sort(),
      edges,
    };
    const skeletonSignature = semanticFingerprint(skeletonSemantics);
    const bindings = graph.nodes.flatMap((node, nodeIndex) => node?.skin === sourceIndex ? [{
      nodeIndex,
      nodeLocalId: graph.nodeLocalId(nodeIndex),
      nodeName: graph.nodeName(nodeIndex),
      nodePath: graph.nodePath(nodeIndex),
      meshIndex: Number.isInteger(node.mesh) ? node.mesh : null,
      meshLocalId: Number.isInteger(node.mesh) ? meshByIndex.get(node.mesh)?.localId ?? null : null,
    }] : []);
    const inverseBindMatrices = inverseBindFacts(
      document,
      skin,
      skin.joints.length,
      sourceIndex,
      diagnostics,
    );
    const label = sourceItemLabel(skin, "Skin", sourceIndex);
    const identityLabel = typeof skin.name === "string" && skin.name.trim()
      ? skin.name.trim()
      : "skin";
    const skinSemantics = {
      skeletonSignature,
      label: typeof skin.name === "string" ? skin.name : null,
      inverseBindMatrices: semanticAccessorFacts(inverseBindMatrices),
      bindings: bindings.map((binding) => ({
        nodeLocalId: binding.nodeLocalId,
        meshLocalId: binding.meshLocalId,
      })).sort((left, right) => left.nodeLocalId.localeCompare(right.nodeLocalId)),
    };
    return [{
      sourceIndex,
      localId: explicitLocalId("skin", skin)
        ?? semanticLocalId("skin", identityLabel, skinSemantics),
      name: label,
      joints,
      hierarchyNodes,
      root,
      skeletonSignature,
      skeletonSemantics,
      inverseBindMatrices,
      bindings,
    }];
  });
}

function rigSubAssets(skinRecords, graph, displayName) {
  const groups = new Map();
  for (const skin of skinRecords) {
    const group = groups.get(skin.skeletonSignature) ?? [];
    group.push(skin);
    groups.set(skin.skeletonSignature, group);
  }
  const groupsWithArtifacts = [...groups.entries()].map(([skeletonSignature, skins]) => {
    skins.sort((left, right) => left.localId.localeCompare(right.localId));
    const first = skins[0];
    const joints = [...new Set(skins.flatMap((skin) => skin.joints))];
    const jointSet = new Set(joints);
    const hierarchyNodes = [...new Set(skins.flatMap((skin) => skin.hierarchyNodes))];
    const hierarchySet = new Set(hierarchyNodes);
    const boneIds = new Map();
    const usedBoneIds = new Map();
    for (const sourceIndex of hierarchyNodes) {
      const base = graph.nodeLocalId(sourceIndex, "bone");
      const occurrence = (usedBoneIds.get(base) ?? 0) + 1;
      usedBoneIds.set(base, occurrence);
      boneIds.set(sourceIndex, occurrence === 1 ? base : `${base}:${occurrence}`);
    }
    const bones = hierarchyNodes.map((sourceIndex) => {
      const parent = graph.ancestry(sourceIndex).slice(0, -1).reverse()
        .find((candidate) => hierarchySet.has(candidate));
      return {
        localId: boneIds.get(sourceIndex),
        name: graph.nodeName(sourceIndex),
        sourceIndex,
        path: graph.nodePath(sourceIndex),
        parentLocalId: Number.isInteger(parent) ? boneIds.get(parent) : null,
        joint: jointSet.has(sourceIndex),
        restTransform: gltfNodeRestTransform(graph.nodes[sourceIndex]),
      };
    }).sort((left, right) => left.localId.localeCompare(right.localId));
    const rootLabel = Number.isInteger(first.root) ? graph.nodeName(first.root) : displayName;
    const rootIdentityLabel = Number.isInteger(first.root)
      ? graph.nodeIdentityLabel(first.root, "rig")
      : displayName;
    const name = skins.length === 1 && !/^Skin \d+$/.test(first.name)
      ? `${first.name} Avatar`
      : `${rootLabel} Avatar`;
    const sourceIndex = Math.min(...skins.map((skin) => skin.sourceIndex));
    const skeletonLocalId = semanticLocalId(
      "skeleton",
      rootIdentityLabel,
      first.skeletonSemantics,
    );
    const skeletonRoot = Number.isInteger(first.root) ? {
      localId: boneIds.get(first.root) ?? graph.nodeLocalId(first.root),
      name: graph.nodeName(first.root),
      sourceIndex: first.root,
      path: graph.nodePath(first.root),
    } : null;
    const skinFacts = skins.map((skin) => ({
      localId: skin.localId,
      name: skin.name,
      sourceIndex: skin.sourceIndex,
      jointCount: skin.joints.length,
      joints: skin.joints.map((joint) => boneIds.get(joint)),
      inverseBindMatrices: skin.inverseBindMatrices,
      bindings: skin.bindings,
    }));
    const skeleton = {
      localId: skeletonLocalId,
      kind: "skeleton",
      name: `${rootLabel} Skeleton`,
      sourceIndex,
      compatibilitySignature: skeletonSignature,
      skeletonSignature,
      skeletonRoot,
      bones,
      skins: skinFacts,
    };
    const avatar = {
      localId: semanticLocalId("avatar", rootIdentityLabel, first.skeletonSemantics),
      kind: "avatar",
      name,
      sourceIndex,
      rigType: "generic",
      skeletonLocalId,
      skeletonSignature,
      skeletonRoot,
      // Compatibility mirror for existing editor/runtime consumers. The
      // standalone Skeleton subasset above is the durable catalog identity.
      bones,
      skins: skinFacts,
    };
    return { avatar, skeleton };
  });
  groupsWithArtifacts.sort((left, right) => (
    left.skeleton.localId.localeCompare(right.skeleton.localId)
  ));
  return {
    skeletons: groupsWithArtifacts.map(({ skeleton }) => skeleton),
    avatars: groupsWithArtifacts.map(({ avatar }) => avatar),
  };
}

export function deriveGltfRigArtifacts(
  document,
  meshByIndex,
  displayName,
  diagnostics,
  sourceGraph,
) {
  const graph = sourceGraph ?? buildGltfNodeGraph(document, diagnostics);
  const skins = deriveSkinRecords(document, graph, meshByIndex, diagnostics);
  return { graph, ...rigSubAssets(skins, graph, displayName) };
}
