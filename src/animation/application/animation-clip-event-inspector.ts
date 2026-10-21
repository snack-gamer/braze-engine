import type { ModelAnimationEventSettings } from "../../lib/model-import-settings";

export type AnimationClipEventInspectorOwner = Readonly<{
  filename: string;
  localId: string;
}>;

export type AnimationClipEventInspectorBinding = Readonly<{
  owner: AnimationClipEventInspectorOwner;
  event: ModelAnimationEventSettings;
  onRename: (name: string) => void;
  onDelete: () => void;
}>;

export type AnimationClipEventInspectorPort = Readonly<{
  focus: (binding: AnimationClipEventInspectorBinding) => void;
  sync: (binding: AnimationClipEventInspectorBinding) => void;
  clear: (owner: AnimationClipEventInspectorOwner) => void;
}>;

export function syncAnimationClipEventInspectorBinding(
  current: AnimationClipEventInspectorBinding | null,
  next: AnimationClipEventInspectorBinding,
): AnimationClipEventInspectorBinding | null {
  return current?.owner === next.owner && current.event.id === next.event.id ? next : current;
}

export function clearAnimationClipEventInspectorBinding(
  current: AnimationClipEventInspectorBinding | null,
  owner: AnimationClipEventInspectorOwner,
): AnimationClipEventInspectorBinding | null {
  return current?.owner === owner ? null : current;
}
