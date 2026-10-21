import type { AssetRef } from "../../assets/domain/asset-reference";
import { createAuthoredId } from "../../identity/authored-id";
import { createAnimatorController, type AnimatorController } from "../domain/animator-controller";
import { addAnimatorState, setAnimatorStateClip } from "./animator-controller-authoring";
import { uniqueAnimatorStateName } from "./animator-state-naming";

export type AnimatorControllerClipSeed = Readonly<{ ref: AssetRef; name: string }>;

/** Builds one playable state per imported clip without involving Project assets. */
export function createAnimatorControllerFromClips(
  clips: readonly AnimatorControllerClipSeed[],
  name = "Animator Controller",
  id = createAuthoredId("embedded-animator-controller"),
): AnimatorController {
  let controller = createAnimatorController(id, name);
  const layerId = controller.layers[0]!.id;
  for (const [index, clip] of clips.entries()) {
    controller = addAnimatorState(controller, layerId, {
      name: uniqueAnimatorStateName(
        controller.layers[0]!.states,
        clip.name,
        `Clip ${index + 1}`,
      ),
    });
    controller = setAnimatorStateClip(
      controller,
      layerId,
      controller.layers[0]!.states[controller.layers[0]!.states.length - 1]!.id,
      clip.ref,
    );
  }
  return controller;
}
