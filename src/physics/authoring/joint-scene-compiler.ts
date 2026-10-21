import type { SceneObject } from "../../scene/domain/scene-object";
import type { CompiledJointAuthoring, PhysicsCompileDiagnostic } from "../runtime/contracts";
import type { HierarchyWorldTransform } from "./hierarchy-world";
import type { PhysicsVec3 as Vec } from "../domain/components";
import { rotateCharacterVector } from "../../character/runtime/pose-math";
import { decodeJoint } from "../serialization/joint-codec";

export function compileAuthoredJoints(objects: readonly SceneObject[], transforms: Map<string, HierarchyWorldTransform>, diagnostics: PhysicsCompileDiagnostic[]): CompiledJointAuthoring[] {
  const joints: CompiledJointAuthoring[] = [];
  const point = (transform: HierarchyWorldTransform, local: Vec): Vec => {
    const rotated = rotateCharacterVector(transform.orientation, local.map((v, i) => v * transform.scale[i]) as Vec);
    return rotated.map((v, i) => v + transform.position[i]) as Vec;
  };
  for (const object of objects) {
    const component = decodeJoint(object.joint); if (!component?.enabled) continue;
    const transform = transforms.get(object.id), connected = component.connectedObjectId ? transforms.get(component.connectedObjectId) : null;
    let issue = "";
    if (!object.rigidbody?.enabled || object.rigidbody.bodyType !== "dynamic") issue = "Joint owner needs an enabled Dynamic Rigidbody.";
    else if (component.connectedObjectId === object.id) issue = "A joint cannot connect a body to itself.";
    else if (component.connectedObjectId && !connected) issue = `Joint connected object ${component.connectedObjectId} is missing.`;
    else if (component.kind === "hinge" && Math.hypot(...component.axis) < 1e-6) issue = "Hinge axis cannot be zero.";
    if (issue || !transform) { diagnostics.push({ objectId: object.id, severity: "error", code: "invalid-joint", message: issue || "Joint transform is unavailable." }); continue; }
    joints.push({ objectId: object.id, component, anchor: point(transform, component.anchor),
      connectedAnchor: component.connectedAnchor ? connected ? point(connected, component.connectedAnchor) : [...component.connectedAnchor] : null,
      axis: [...rotateCharacterVector(transform.orientation, component.axis)] });
  }
  return joints;
}
