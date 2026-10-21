import { REVISION } from "three";
import { AssignNode, StackNode, SubBuildNode, type Node } from "three/webgpu";
import { Fn } from "../tsl";

/**
 * r184 SkinningNode/MorphNode setup appends its statements after NodeMaterial's
 * already queued positionNode assignment. World placement must consume those
 * completed local deformations, including when Three copies this node into its
 * shadow override material. Keep this correction inside shader construction.
 * Remove it when a Three upgrade emits morph -> skin -> positionNode natively;
 * the real-model main/shadow codegen tests are the upgrade acceptance check.
 */
export function gpuPosePositionAfterDeformation(position: Node): Node {
  if (REVISION !== "184") throw new Error("Re-audit GPU pose deformation ordering before changing Three revisions.");
  const placed = Fn((builder) => {
    const scope = builder.getContext().position;
    if (!(scope instanceof StackNode)) throw new Error("GPU pose requires Three's local-position stack.");
    const placement = scope.nodes.findIndex((entry) => {
      if (!(entry instanceof AssignNode)) return false;
      // @types/three omits AssignNode.sourceNode, present in the pinned r184 API.
      const source = (entry as AssignNode & { sourceNode: Node }).sourceNode;
      return source instanceof SubBuildNode && source.name === "POSITION" && source.node === placed;
    });
    if (placement < 0) throw new Error("GPU pose requires its own POSITION assignment.");
    // Only this local-position stack's late deformation statements move. Their
    // order stays intact, so morphs still precede skinning and world placement.
    const deformation = scope.nodes.splice(placement + 1);
    scope.nodes.splice(placement, 0, ...deformation);
    return position;
  })();
  return placed;
}
