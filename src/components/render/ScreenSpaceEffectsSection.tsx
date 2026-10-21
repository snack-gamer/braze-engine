import { EditorIcon } from "../../ui/EditorIcon";
import { InspectorSection } from "../scene/InspectorSection";
import { AmbientOcclusionGroup } from "./gi/AmbientOcclusionGroup";
import { ScreenSpaceReflectionsGroup } from "./gi/ScreenSpaceReflectionsGroup";
import type { EnvSetterProps } from "./section-props";

/** Screen-space effects that remain part of the active renderer. */
export function ScreenSpaceEffectsSection(props: EnvSetterProps) {
  return (
    <InspectorSection
      id="render.screenSpace"
      title="Screen-space Effects"
      icon={<EditorIcon name="globalIllumination" size="control" />}
      meta="Occlusion and reflections"
      defaultOpen
    >
      <AmbientOcclusionGroup {...props} />
      <ScreenSpaceReflectionsGroup {...props} />
    </InspectorSection>
  );
}
