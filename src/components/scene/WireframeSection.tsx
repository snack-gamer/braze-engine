import type { SceneObject } from "../../types";
import { SceneComponentSection } from "./SceneComponentPresentation";

type WireframeSectionProps = {
  object: SceneObject;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
};

// Wireframe view component. Its presence on an object means "render this mesh
// as wireframe"; the header checkbox enables/disables it, and the trash action
// removes the component entirely.
export function WireframeSection({ object, updateObject }: WireframeSectionProps) {
  const wireframe = object.wireframe;
  if (!wireframe) return null;

  return (
    <SceneComponentSection
      componentId="wireframe"
      id="object.wireframe"
      defaultOpen
      enable={{
        checked: wireframe.enabled !== false,
        onChange: (checked) => updateObject(object.id, { wireframe: { ...wireframe, enabled: checked } }),
        ariaLabel: "Enable Wireframe",
      }}
      onRemove={() => updateObject(object.id, { wireframe: undefined })}
    >
      <p className="empty-note">Renders this mesh as wireframe in the viewport.</p>
    </SceneComponentSection>
  );
}
