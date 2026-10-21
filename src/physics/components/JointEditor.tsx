import type { SceneObject } from "../../scene/domain/scene-object";
import { SceneComponentSection } from "../../components/scene/SceneComponentPresentation";
import { InspectorRow } from "../../components/InspectorRow";
import { InspectorNumberInput } from "../../components/InspectorNumberInput";
import { InspectorToggle } from "../../components/InspectorToggle";
import { VectorField } from "../../components/VectorField";
import { JOINT_KINDS, type JointComponent } from "../domain/joint";
import { decodeJoint } from "../serialization/joint-codec";
import { RemovePhysicsComponentButton } from "../../components/physics/physics-section-controls";

export function JointEditor({ object, objects, updateObject }: {
  object: SceneObject; objects: SceneObject[]; updateObject: (id: string, patch: Partial<SceneObject>) => void;
}) {
  const joint = object.joint; if (!joint) return null;
  const patch = (values: Partial<JointComponent>) => updateObject(object.id, { joint: decodeJoint({ ...joint, ...values }) });
  return <SceneComponentSection componentId="joint" id="object.joint" defaultOpen
    enable={{ checked: joint.enabled, onChange: (enabled) => patch({ enabled }), ariaLabel: "Enable Joint" }}
    actions={<RemovePhysicsComponentButton title="Remove Joint" onClick={() => updateObject(object.id, { joint: undefined })} />}>
    <InspectorRow label="Type"><select aria-label="Joint type" value={joint.kind} onChange={(e) => patch({ kind: e.target.value as JointComponent["kind"] })}>
      {JOINT_KINDS.map((kind) => <option key={kind} value={kind}>{kind === "ball" ? "Ball Socket" : kind[0].toUpperCase() + kind.slice(1)}</option>)}
    </select></InspectorRow>
    <InspectorRow label="Connected Body"><select aria-label="Joint connected body" value={joint.connectedObjectId ?? ""} onChange={(e) => patch({ connectedObjectId: e.target.value || null, connectedAnchor: null })}>
      <option value="">World</option>
      {joint.connectedObjectId && !objects.some((o) => o.id === joint.connectedObjectId) && <option value={joint.connectedObjectId}>Missing: {joint.connectedObjectId}</option>}
      {objects.filter((o) => o.id !== object.id && (o.rigidbody?.enabled || o.colliders?.length)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select></InspectorRow>
    <InspectorRow label="Anchor" variant="vec"><VectorField values={joint.anchor} step={0.01} decimals={3} ariaLabel="Joint anchor" onChange={(axis, value) => { const anchor = [...joint.anchor] as typeof joint.anchor; anchor[axis] = value; patch({ anchor }); }} /></InspectorRow>
    <InspectorRow label="Auto Connected Anchor"><InspectorToggle checked={joint.connectedAnchor === null} ariaLabel="Joint auto connected anchor" onChange={(auto) => patch({ connectedAnchor: auto ? null : [0, 0, 0] })} /></InspectorRow>
    {joint.connectedAnchor && <InspectorRow label="Connected Anchor" variant="vec"><VectorField values={joint.connectedAnchor} step={0.01} decimals={3} ariaLabel="Joint connected anchor" onChange={(axis, value) => { const connectedAnchor = [...joint.connectedAnchor!] as typeof joint.anchor; connectedAnchor[axis] = value; patch({ connectedAnchor }); }} /></InspectorRow>}
    {joint.kind === "distance" && <>
      <InspectorRow label="Auto Length"><InspectorToggle checked={joint.restLength === null} ariaLabel="Joint auto length" onChange={(auto) => patch({ restLength: auto ? null : 1 })} /></InspectorRow>
      {joint.restLength !== null && <InspectorRow label="Length"><InspectorNumberInput value={joint.restLength} min={0} step={0.01} decimals={3} ariaLabel="Joint length" onChange={(restLength) => patch({ restLength })} /></InspectorRow>}
    </>}
    {joint.kind === "hinge" && <>
      <InspectorRow label="Axis" variant="vec"><VectorField values={joint.axis} step={0.1} decimals={2} ariaLabel="Joint hinge axis" onChange={(axis, value) => { const direction = [...joint.axis] as typeof joint.axis; direction[axis] = value; patch({ axis: direction }); }} /></InspectorRow>
      <InspectorRow label="Angle Limits"><InspectorToggle checked={joint.limitsEnabled} ariaLabel="Joint angle limits" onChange={(limitsEnabled) => patch({ limitsEnabled })} /></InspectorRow>
      {joint.limitsEnabled && <>
        <InspectorRow label="Minimum Angle"><InspectorNumberInput value={joint.minAngle} min={-180} max={joint.maxAngle} step={1} decimals={1} ariaLabel="Joint minimum angle" onChange={(minAngle) => patch({ minAngle })} /></InspectorRow>
        <InspectorRow label="Maximum Angle"><InspectorNumberInput value={joint.maxAngle} min={joint.minAngle} max={180} step={1} decimals={1} ariaLabel="Joint maximum angle" onChange={(maxAngle) => patch({ maxAngle })} /></InspectorRow>
      </>}
    </>}
    <InspectorRow label="Collide Connected"><InspectorToggle checked={joint.collideConnected} ariaLabel="Joint collide connected" onChange={(collideConnected) => patch({ collideConnected })} /></InspectorRow>
  </SceneComponentSection>;
}
