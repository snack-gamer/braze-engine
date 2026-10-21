import { useMemo } from "react";
import type { SceneObject } from "../../../types";
import type { ScenePlaybackMode } from "../../../types";
import type { AnimatorPlaybackBinding } from "../../application/playback/animator-playback-binding";
import {
  useCharacterAssetAuthoring,
} from "../../application/CharacterAssetLibraryProvider";
import { useCharacterPlaybackAssetCatalog } from "../../application/CharacterPlaybackAssetProvider";
import { embedAnimatorController } from "../../application/animator-component-authoring";
import type { AnimatorWorkspaceTarget } from "../../application/useAnimatorWorkspaceSession";
import { importedAnimationClipOptions } from "../../application/imported-character-assets";
import { AnimatorControllerEditor } from "../AnimatorControllerEditor";

type AnimatorObjectSource = Readonly<{
  objects: readonly SceneObject[];
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
}>;

export type AnimatorDockPaneProps = Readonly<{
  target: AnimatorWorkspaceTarget | null;
  active: boolean;
  playbackMode: ScenePlaybackMode;
  playbackBinding: AnimatorPlaybackBinding | null;
  scene: AnimatorObjectSource;
  prefab: (AnimatorObjectSource & Readonly<{ assetFilename: string }>) | null;
}>;

/** Resolves a pinned authored object into the reusable Behavior Map editor. */
export function AnimatorDockPane({
  target,
  active,
  playbackMode,
  playbackBinding,
  scene,
  prefab,
}: AnimatorDockPaneProps) {
  const authoring = useCharacterAssetAuthoring();
  const playbackAssets = useCharacterPlaybackAssetCatalog();
  const clips = useMemo(
    () => importedAnimationClipOptions(playbackAssets.importedAssets),
    [playbackAssets.importedAssets],
  );
  const source = target?.scope === "scene"
    ? scene
    : target?.scope === "prefab" && prefab?.assetFilename === target.prefabAssetFilename
      ? prefab
      : null;
  const object = target && source
    ? source.objects.find((candidate) => candidate.id === target.objectId)
    : undefined;
  const component = object?.animator;
  const controller = component?.controller;

  if (!target) return <AnimatorDockEmpty>Open a scene Animator Controller to begin authoring.</AnimatorDockEmpty>;
  if (!source || !object) return <AnimatorDockEmpty>The pinned character is no longer available.</AnimatorDockEmpty>;
  if (!component || !controller) return <AnimatorDockEmpty>The pinned character no longer has an embedded Animator Controller.</AnimatorDockEmpty>;

  return (
    <AnimatorControllerEditor
      key={`${target.scope}:${target.objectId}:${controller.id}`}
      controller={controller}
      masks={authoring.avatarMasks}
      clips={clips}
      objectId={object.id}
      playbackMode={playbackMode}
      playbackBinding={playbackBinding}
      active={active}
      onChange={(next) => source.updateObject(object.id, {
        animator: embedAnimatorController(component, next),
      })}
    />
  );
}

function AnimatorDockEmpty({ children }: Readonly<{ children: string }>) {
  return <div className="animator-workspace animator-workspace--empty" role="status">{children}</div>;
}
