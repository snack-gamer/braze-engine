import { assetDiagnostic } from "./asset-diagnostics.mjs";
import {
  gltfAccessorFacts,
  semanticAccessorFacts,
  semanticLocalId,
  uniqueSemanticLocalId,
} from "./gltf-source-context.mjs";

const FLOAT = 5126;
const UNSIGNED_BYTE = 5121;
const UNSIGNED_SHORT = 5123;

function morphTargetsForMesh(document, mesh, meshRecord, diagnostics) {
  if (!Array.isArray(mesh?.primitives)) return [];
  const counts = mesh.primitives.map(
    (primitive) => Array.isArray(primitive?.targets) ? primitive.targets.length : 0,
  );
  const targetCount = counts.length > 0 ? Math.max(...counts) : 0;
  if (counts.some((count) => count !== targetCount)) {
    diagnostics.push(assetDiagnostic(
      "gltf-morph-targets-invalid",
      "error",
      `${meshRecord.name} has inconsistent morph-target counts across its primitives.`,
      { localId: meshRecord.localId },
    ));
  }
  const targetNames = Array.isArray(mesh?.extras?.targetNames) ? mesh.extras.targetNames : [];
  if (targetNames.length > 0 && targetNames.length !== targetCount) {
    diagnostics.push(assetDiagnostic(
      "gltf-morph-target-names-invalid",
      "warning",
      `${meshRecord.name} has ${targetNames.length} morph names for ${targetCount} targets.`,
      { localId: meshRecord.localId },
    ));
  }
  const used = new Set();
  return Array.from({ length: targetCount }, (_, targetIndex) => {
    const name = typeof targetNames[targetIndex] === "string" && targetNames[targetIndex].trim()
      ? targetNames[targetIndex].trim()
      : `Morph ${targetIndex + 1}`;
    const identityName = typeof targetNames[targetIndex] === "string"
      && targetNames[targetIndex].trim()
      ? targetNames[targetIndex].trim()
      : "morph";
    const primitiveBindings = mesh.primitives.flatMap((primitive, primitiveIndex) => {
      const target = primitive?.targets?.[targetIndex];
      if (!target || typeof target !== "object") return [];
      const attributes = Object.entries(target).sort(([left], [right]) => left.localeCompare(right))
        .map(([semantic, accessorIndex]) => {
          const accessor = gltfAccessorFacts(document, accessorIndex);
          const base = gltfAccessorFacts(document, primitive?.attributes?.[semantic]);
          const coreVector = semantic === "POSITION"
            || semantic === "NORMAL"
            || semantic === "TANGENT";
          const validShape = coreVector
            ? accessor.type === "VEC3" && accessor.componentType === FLOAT
            : accessor.type === base.type;
          const valid = accessor.validReference
            && base.validReference
            && accessor.count === base.count
            && validShape;
          return { semantic, accessor, baseAccessor: base, valid };
        });
      if (attributes.some(({ valid }) => !valid)) {
        diagnostics.push(assetDiagnostic(
          "gltf-morph-target-accessor-invalid",
          "error",
          `${meshRecord.name} morph target ${name} references a missing accessor.`,
          { localId: meshRecord.localId, primitiveIndex, targetIndex },
        ));
      }
      return [{ primitiveIndex, attributes }];
    });
    const semantics = {
      mesh: meshRecord.localId,
      name: targetNames[targetIndex] ?? null,
      bindings: primitiveBindings.map((binding) => ({
        primitiveIndex: binding.primitiveIndex,
        attributes: binding.attributes.map(({ semantic, accessor }) => ({
          semantic,
          accessor: semanticAccessorFacts(accessor),
        })),
      })),
    };
    return {
      localId: uniqueSemanticLocalId(
        semanticLocalId("morph", `${meshRecord.name}-${identityName}`, semantics),
        used,
        semantics,
      ),
      name,
      sourceIndex: targetIndex,
      primitiveBindings,
    };
  });
}

function validJointsAccessor(facts) {
  return facts.validReference
    && facts.type === "VEC4"
    && (facts.componentType === UNSIGNED_BYTE || facts.componentType === UNSIGNED_SHORT);
}

function validWeightsAccessor(facts) {
  return facts.validReference
    && facts.type === "VEC4"
    && (facts.componentType === FLOAT
      || ((facts.componentType === UNSIGNED_BYTE || facts.componentType === UNSIGNED_SHORT)
        && facts.normalized));
}

function influenceSetsForMesh(document, mesh, meshRecord, diagnostics) {
  if (!Array.isArray(mesh?.primitives)) return [];
  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  return mesh.primitives.flatMap((primitive, primitiveIndex) => {
    const attributes = primitive?.attributes;
    if (!attributes || typeof attributes !== "object") return [];
    const sets = new Set();
    for (const semantic of Object.keys(attributes)) {
      const match = /^(?:JOINTS|WEIGHTS)_(\d+)$/.exec(semantic);
      if (match) sets.add(Number(match[1]));
    }
    const skinSourceIndices = nodes.flatMap(
      (node) => node?.mesh === meshRecord.sourceIndex && Number.isInteger(node.skin) ? [node.skin] : [],
    );
    if (sets.size === 0) {
      if (skinSourceIndices.length > 0) {
        diagnostics.push(assetDiagnostic(
          "gltf-skin-influences-missing",
          "error",
          `${meshRecord.name} primitive ${primitiveIndex + 1} is bound to a skin but has no joint influences.`,
          { localId: meshRecord.localId, primitiveIndex },
        ));
      }
      return [];
    }
    const ordered = [...sets].sort((left, right) => left - right);
    if (ordered.some((set, index) => set !== index)) {
      diagnostics.push(assetDiagnostic(
        "gltf-influence-sets-invalid",
        "error",
        `${meshRecord.name} primitive ${primitiveIndex + 1} has non-consecutive skin influence sets.`,
        { localId: meshRecord.localId, primitiveIndex },
      ));
    }
    const position = gltfAccessorFacts(document, attributes.POSITION);
    const sourceSkins = Array.isArray(document.skins) ? document.skins : [];
    const details = ordered.map((set) => {
      const jointsIndex = attributes[`JOINTS_${set}`];
      const weightsIndex = attributes[`WEIGHTS_${set}`];
      const joints = gltfAccessorFacts(document, jointsIndex);
      const weights = gltfAccessorFacts(document, weightsIndex);
      const paired = Number.isInteger(jointsIndex) && Number.isInteger(weightsIndex);
      const validCounts = position.validReference
        && joints.count === weights.count
        && joints.count === position.count;
      const valid = paired
        && validJointsAccessor(joints)
        && validWeightsAccessor(weights)
        && validCounts;
      if (!valid) {
        diagnostics.push(assetDiagnostic(
          "gltf-influence-accessors-invalid",
          "error",
          `${meshRecord.name} primitive ${primitiveIndex + 1} has invalid JOINTS_${set}/WEIGHTS_${set} accessors.`,
          { localId: meshRecord.localId, primitiveIndex, influenceSet: set },
        ));
      }
      const maximumJoint = Array.isArray(joints.max)
        ? Math.max(...joints.max.filter(Number.isFinite))
        : null;
      if (Number.isFinite(maximumJoint) && skinSourceIndices.some(
        (skinIndex) => maximumJoint >= (sourceSkins[skinIndex]?.joints?.length ?? 0),
      )) {
        diagnostics.push(assetDiagnostic(
          "gltf-joint-index-out-of-range",
          "error",
          `${meshRecord.name} primitive ${primitiveIndex + 1} contains a joint index outside its skin.`,
          { localId: meshRecord.localId, primitiveIndex, influenceSet: set, maximumJoint },
        ));
      }
      return { set, joints, weights, valid };
    });
    if (ordered.some((set) => set > 0)) {
      const maximumInfluences = (ordered.at(-1) + 1) * 4;
      diagnostics.push(assetDiagnostic(
        "gltf-influences-over-four",
        "warning",
        `${meshRecord.name} primitive ${primitiveIndex + 1} uses more than four joint influences; the current Three.js loader consumes only JOINTS_0/WEIGHTS_0.`,
        { localId: meshRecord.localId, primitiveIndex, maximumInfluences },
      ));
    }
    return [{
      primitiveIndex,
      vertexCount: position.validReference ? position.count : null,
      skinSourceIndices,
      setCount: ordered.length,
      maximumInfluences: (ordered.at(-1) + 1) * 4,
      runtimeSupportedInfluences: 4,
      sets: details,
    }];
  });
}

export function enrichGltfDeformationArtifacts(document, meshRecords, diagnostics) {
  for (const meshRecord of meshRecords) {
    const mesh = document.meshes?.[meshRecord.sourceIndex];
    meshRecord.morphTargets = morphTargetsForMesh(document, mesh, meshRecord, diagnostics);
    meshRecord.skinInfluences = influenceSetsForMesh(document, mesh, meshRecord, diagnostics);
  }
}
