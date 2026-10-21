import { useState } from "react";
import { useRenderSession } from "../../rendering/application/RenderSessionProvider";
import { physicsWorldForSession } from "../../three/physics/shared-physics-world";
import type { ColliderComponent } from "../domain/components";
import { InspectorRow } from "../../components/InspectorRow";

export function MeshColliderEditor({ objectId, collider, onChange }: {
  objectId: string; collider: ColliderComponent; onChange: (patch: Partial<ColliderComponent>) => void;
}) {
  const session = useRenderSession(), [error, setError] = useState("");
  const bake = () => {
    try {
      const world = physicsWorldForSession(session); if (!world) throw new Error("Open a scene viewport first.");
      const geometry = world.captureCollisionMesh(objectId);
      onChange({ geometry, center: [0, 0, 0] }); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <>
    <InspectorRow label="Collision Mesh">
      <button type="button" className="ghost-button" onClick={bake}>Bake Object Mesh</button>
    </InspectorRow>
    <InspectorRow label="Triangles"><span>{(collider.geometry?.indices.length ?? 0) / 3}</span></InspectorRow>
    <p className="inspector-hint">Static surfaces. Bake again after changing the source mesh.</p>
    {error && <p role="alert">{error}</p>}
  </>;
}
