import type { ImportedCharacterAssetOption } from "../application/imported-character-assets";
import type { AuthoredAvatarMask } from "../domain/character-asset-library";
import type { AnimatorController } from "../domain/animator-controller";
import type { AnimatorPlaybackBinding } from "../application/playback/animator-playback-binding";
import type { ScenePlaybackMode } from "../../types";
import { AnimatorWorkspace } from "./animator-workspace/AnimatorWorkspace";

type AnimatorControllerEditorProps = Readonly<{
  controller: AnimatorController;
  masks: readonly AuthoredAvatarMask[];
  clips: readonly ImportedCharacterAssetOption[];
  objectId: string;
  playbackMode: ScenePlaybackMode;
  playbackBinding: AnimatorPlaybackBinding | null;
  active?: boolean;
  onChange: (controller: AnimatorController) => void;
}>;

export function AnimatorControllerEditor({
  controller,
  masks,
  clips,
  objectId,
  playbackMode,
  playbackBinding,
  active = true,
  onChange,
}: AnimatorControllerEditorProps) {
  return <AnimatorWorkspace
    controller={controller}
    masks={masks}
    clips={clips}
    objectId={objectId}
    playbackMode={playbackMode}
    playbackBinding={playbackBinding}
    active={active}
    onChange={onChange}
  />;
}
