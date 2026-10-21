import type { ComponentProps, ReactNode } from "react";
import {
  sceneComponentPresentation,
  sceneComponentTone,
  type SceneComponentPresentationId,
} from "../../scene/presentation/scene-component-registry";
import { EditorIcon } from "../../ui/EditorIcon";
import type { EditorIconSize } from "../../ui/EditorIcon";
import { toneClassName } from "../../ui/tones";
import { InspectorSection } from "./InspectorSection";

type SceneComponentIdentityProps = {
  componentId: SceneComponentPresentationId;
  label?: ReactNode;
  details?: ReactNode;
  size?: EditorIconSize;
};

export function SceneComponentIdentity({
  componentId,
  label,
  details,
  size = "control",
}: SceneComponentIdentityProps) {
  const presentation = sceneComponentPresentation(componentId);
  const resolvedLabel = label ?? presentation.label;
  return (
    <>
      <EditorIcon
        name={presentation.componentIcon}
        size={size}
        className={`category-glyph ${toneClassName(sceneComponentTone(componentId))}`}
      />
      {details ? <span>{resolvedLabel}{details}</span> : resolvedLabel}
    </>
  );
}

type SceneComponentSectionProps = Omit<
  ComponentProps<typeof InspectorSection>,
  "icon" | "title"
> & {
  componentId: SceneComponentPresentationId;
  title?: ReactNode;
};

export function SceneComponentSection({
  componentId,
  title,
  ...props
}: SceneComponentSectionProps) {
  const presentation = sceneComponentPresentation(componentId);
  return (
    <InspectorSection
      {...props}
      className={`${toneClassName(sceneComponentTone(componentId))} ${props.className ?? ""}`.trim()}
      title={title ?? presentation.label}
      icon={<EditorIcon name={presentation.componentIcon} size="control" />}
    />
  );
}
