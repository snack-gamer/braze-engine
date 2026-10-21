import { MeshColliderEditor } from "../../physics/components/MeshColliderEditor";
import {
  COLLIDER_SHAPE_OPTIONS,
  COLLIDER_AXIS_OPTIONS,
  defaultColliderForObject,
  normalizeCollider,
} from "../../physics/authoring/component-defaults";
import type { ColliderComponent, ColliderShape, SceneObject } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { InspectorNumberInput } from "../InspectorNumberInput";
import { InspectorRow } from "../InspectorRow";
import { InspectorSlider } from "../InspectorSlider";
import { InspectorToggle } from "../InspectorToggle";
import { VectorField } from "../VectorField";
import { SceneComponentSection } from "../scene/SceneComponentPresentation";
import {
  RemovePhysicsComponentButton,
  patchPhysicsVector,
  type UpdateObject,
} from "./physics-section-controls";

export function ColliderSection({ object, collider: value, updateObject, editing, onEdit }: {
  object: SceneObject;
  collider: ColliderComponent;
  updateObject: UpdateObject;
  editing: boolean;
  onEdit: (active: boolean) => void;
}) {
  const collider = normalizeCollider(value, object, value.id);
  const replace = (next: ColliderComponent) => updateObject(object.id, {
    colliders: (object.colliders ?? []).map((entry) => entry.id === collider.id ? next : entry),
  });
  const patch = (next: Partial<ColliderComponent>) =>
    replace(normalizeCollider({ ...collider, ...next }, object, collider.id));
  const applyShape = (shape: ColliderShape) => {
    const fitted = defaultColliderForObject(object, shape);
    patch({ shape, size: fitted.size, radius: fitted.radius, length: fitted.length, majorRadius: fitted.majorRadius, minorRadius: fitted.minorRadius });
  };
  const remove = () => {
    if (editing) onEdit(false);
    updateObject(object.id, {
      colliders: (object.colliders ?? []).filter((entry) => entry.id !== collider.id),
    });
  };

  return (
    <SceneComponentSection
      componentId="collider"
      id={`object.collider.${collider.id}`}
      title={`${collider.shape === "torus" ? "Advanced Torus" : collider.shape[0].toUpperCase() + collider.shape.slice(1)} Collider`}
      meta={collider.enabled ? collider.shape : "off"}
      defaultOpen
      enable={{
        checked: collider.enabled,
        onChange: (enabled) => patch({ enabled }),
        ariaLabel: "Enable Collider",
      }}
      actions={(
        <>
          {collider.shape !== "mesh" && <button className="ghost-button" type="button" title="Fit Collider to object" onClick={() => applyShape(collider.shape)}>Fit</button>}
          <RemovePhysicsComponentButton title="Remove Collider" onClick={remove} />
        </>
      )}
    >
      <InspectorRow label="Edit Collider">
        <button
          className={`ghost-button collider-edit-button ${editing ? "active" : ""}`}
          type="button"
          aria-label="Edit Collider in Scene view"
          aria-pressed={editing}
          onClick={() => onEdit(!editing)}
        >
          <EditorIcon name="editCollider" size="control" /> {editing ? "Editing" : "Edit"}
        </button>
      </InspectorRow>
      <InspectorRow label="Shape">
        <select value={collider.shape} aria-label="Collider shape" onChange={(event) => applyShape(event.target.value as ColliderShape)}>
          {COLLIDER_SHAPE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.id === "torus" ? `${option.label} (Advanced)` : option.label}</option>
          ))}
        </select>
      </InspectorRow>
      <InspectorRow label="Center" variant="vec">
        <VectorField values={collider.center} step={0.01} decimals={3} ariaLabel="Collider center" onChange={(axis, next) => patch({ center: patchPhysicsVector(collider.center, axis, next) })} />
      </InspectorRow>
      {collider.shape === "mesh" && <MeshColliderEditor objectId={object.id} collider={collider} onChange={patch} />}
      {collider.shape === "capsule" && (
        <InspectorRow label="Axis">
          <select
            value={collider.axis ?? "x"}
            aria-label="Capsule Collider axis"
            onChange={(event) => patch({ axis: event.target.value as ColliderComponent["axis"] })}
          >
            {COLLIDER_AXIS_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </InspectorRow>
      )}
      <InspectorRow label="Show Bounds">
        <InspectorToggle checked={collider.showGizmo} ariaLabel="Show Collider bounds" onChange={(showGizmo) => patch({ showGizmo })} />
      </InspectorRow>
      {collider.shape === "box" && (
        <InspectorRow label="Size" variant="vec">
          <VectorField values={collider.size} min={0.001} step={0.01} decimals={3} ariaLabel="Box Collider size" onChange={(axis, next) => patch({ size: patchPhysicsVector(collider.size, axis, next, 0.001) })} />
        </InspectorRow>
      )}
      {(collider.shape === "sphere" || collider.shape === "capsule") && (
        <InspectorRow label="Radius">
          <InspectorNumberInput value={collider.radius} min={0.001} step={0.01} decimals={3} ariaLabel="Collider radius" onChange={(radius) => patch({ radius })} />
        </InspectorRow>
      )}
      {collider.shape === "capsule" && (
        <InspectorRow label="Length">
          <InspectorNumberInput value={collider.length} min={0.001} step={0.01} decimals={3} ariaLabel="Capsule length" onChange={(length) => patch({ length })} />
        </InspectorRow>
      )}
      {collider.shape === "torus" && (
        <>
          <InspectorRow label="Major Radius"><InspectorNumberInput value={collider.majorRadius} min={0.001} step={0.01} decimals={3} ariaLabel="Torus major radius" onChange={(majorRadius) => patch({ majorRadius })} /></InspectorRow>
          <InspectorRow label="Minor Radius"><InspectorNumberInput value={collider.minorRadius} min={0.001} step={0.01} decimals={3} ariaLabel="Torus minor radius" onChange={(minorRadius) => patch({ minorRadius })} /></InspectorRow>
        </>
      )}
      <InspectorRow label="Friction">
        <InspectorSlider value={collider.friction} min={0} max={10} step={0.01} rangeMax={2} decimals={2} ariaLabel="Collider friction" onChange={(friction) => patch({ friction })} />
      </InspectorRow>
      <InspectorRow label="Is Trigger">
        <InspectorToggle checked={collider.isTrigger === true} ariaLabel="Collider is trigger" onChange={(isTrigger) => patch({ isTrigger })} />
      </InspectorRow>
      <InspectorRow label="Bounciness">
        <InspectorSlider value={collider.restitution ?? 0} min={0} max={1} step={0.01} decimals={2} ariaLabel="Collider restitution" onChange={(restitution) => patch({ restitution })} />
      </InspectorRow>
      <InspectorRow label="Collision Layer">
        <InspectorNumberInput value={collider.collisionLayer ?? 0} min={0} max={31} step={1} decimals={0} ariaLabel="Collider collision layer" onChange={(collisionLayer) => patch({ collisionLayer })} />
      </InspectorRow>
      <InspectorRow label="Collision Mask">
        <InspectorNumberInput value={collider.collisionMask ?? 0xffffffff} min={0} max={0xffffffff} step={1} decimals={0} ariaLabel="Collider collision mask" onChange={(collisionMask) => patch({ collisionMask })} />
      </InspectorRow>
    </SceneComponentSection>
  );
}
