import { assetDiagnostic } from "./asset-diagnostics.mjs";
import {
  gltfAccessorFacts,
  semanticAccessorFacts,
  semanticLocalId,
  uniqueSemanticLocalId,
} from "./gltf-source-context.mjs";

const FLOAT = 5126;
const ANIMATION_PATHS = new Set(["translation", "rotation", "scale", "weights"]);
const INTERPOLATIONS = new Set(["LINEAR", "STEP", "CUBICSPLINE"]);

function validSamplerAccessors(input, output, path, interpolation) {
  if (!input.validReference || input.type !== "SCALAR" || input.componentType !== FLOAT) return false;
  if (!output.validReference || output.componentType !== FLOAT) return false;
  if (path === "rotation" && output.type !== "VEC4") return false;
  if ((path === "translation" || path === "scale") && output.type !== "VEC3") return false;
  if (path === "weights" && output.type !== "SCALAR") return false;
  if (path !== "weights" && Number.isInteger(input.count) && Number.isInteger(output.count)) {
    return output.count === input.count * (interpolation === "CUBICSPLINE" ? 3 : 1);
  }
  return true;
}

function jointTargetMap(avatars) {
  const targets = new Map();
  for (const avatar of avatars) {
    for (const bone of avatar.bones) {
      const current = targets.get(bone.sourceIndex) ?? { bone, avatars: [] };
      current.avatars.push(avatar.localId);
      targets.set(bone.sourceIndex, current);
    }
  }
  return targets;
}

function animationBindings(document, animation, clipRecord, graph, avatars, diagnostics) {
  const channels = Array.isArray(animation?.channels) ? animation.channels : [];
  const samplers = Array.isArray(animation?.samplers) ? animation.samplers : [];
  const jointTargets = jointTargetMap(avatars);
  const used = new Set();
  const bindings = channels.map((channel, sourceIndex) => {
    const samplerIndex = channel?.sampler;
    const sampler = Number.isInteger(samplerIndex) ? samplers[samplerIndex] : null;
    const targetNode = channel?.target?.node;
    const path = channel?.target?.path;
    const validNode = Number.isInteger(targetNode)
      && targetNode >= 0
      && targetNode < graph.nodes.length;
    const validPath = ANIMATION_PATHS.has(path);
    const interpolation = typeof sampler?.interpolation === "string"
      ? sampler.interpolation
      : "LINEAR";
    const input = gltfAccessorFacts(document, sampler?.input);
    const output = gltfAccessorFacts(document, sampler?.output);
    const valid = validNode
      && validPath
      && sampler && typeof sampler === "object"
      && INTERPOLATIONS.has(interpolation)
      && validSamplerAccessors(input, output, path, interpolation);
    if (!valid) {
      diagnostics.push(assetDiagnostic(
        "gltf-animation-binding-invalid",
        "error",
        `${clipRecord.name} contains an invalid animation channel.`,
        { localId: clipRecord.localId, channelIndex: sourceIndex },
      ));
    }
    const joint = validNode ? jointTargets.get(targetNode) : null;
    const targetLocalId = validNode
      ? joint?.bone.localId ?? graph.nodeLocalId(targetNode)
      : null;
    const semantics = {
      target: validNode ? graph.nodeKey(targetNode) : null,
      path: validPath ? path : null,
      interpolation,
      input: semanticAccessorFacts(input),
      output: semanticAccessorFacts(output),
    };
    return {
      localId: uniqueSemanticLocalId(
        semanticLocalId(
          "binding",
          validNode ? graph.nodeIdentityLabel(targetNode, "target") : "invalid",
          semantics,
        ),
        used,
        semantics,
      ),
      sourceIndex,
      path: validPath ? path : null,
      targetNodeIndex: validNode ? targetNode : null,
      targetLocalId,
      targetName: validNode ? graph.nodeName(targetNode) : null,
      targetPath: validNode ? graph.nodePath(targetNode) : null,
      skeletonBone: Boolean(joint),
      joint: joint?.bone.joint === true,
      avatarLocalIds: joint ? [...joint.avatars].sort() : [],
      sampler: {
        sourceIndex: Number.isInteger(samplerIndex) ? samplerIndex : null,
        interpolation,
        input,
        output,
      },
      valid: Boolean(valid),
    };
  });
  return bindings.sort((left, right) => left.localId.localeCompare(right.localId));
}

export function enrichGltfAnimationArtifacts(
  document,
  clipRecords,
  graph,
  avatars,
  diagnostics,
) {
  for (const clipRecord of clipRecords) {
    clipRecord.bindings = animationBindings(
      document,
      document.animations?.[clipRecord.sourceIndex],
      clipRecord,
      graph,
      avatars,
      diagnostics,
    );
  }
}
