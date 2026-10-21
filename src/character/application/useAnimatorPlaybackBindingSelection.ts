import { useState } from "react";
import type { AnimatorPlaybackBinding } from "./playback/animator-playback-binding";
import type { AnimatorPlaybackCommandPort } from "./playback/animator-playback-commands";

type AnimatorPlaybackCommand = (...args: never[]) => unknown;

/** Publishes one preview binding that follows every concurrently live viewport. */
export function useAnimatorPlaybackBindingSelection() {
  const [sceneBinding, setSceneBinding] = useState<AnimatorPlaybackBinding | null>(null);
  const [gameBinding, setGameBinding] = useState<AnimatorPlaybackBinding | null>(null);
  return {
    binding: combineAnimatorPlaybackBindings(sceneBinding, gameBinding),
    setSceneBinding,
    setGameBinding,
  };
}

/** Fans preview commands out while reading telemetry from the first ready viewport. */
export function combineAnimatorPlaybackBindings(
  sceneBinding: AnimatorPlaybackBinding | null,
  gameBinding: AnimatorPlaybackBinding | null,
): AnimatorPlaybackBinding | null {
  if (!sceneBinding || !gameBinding) return gameBinding ?? sceneBinding;
  if (sceneBinding === gameBinding) return gameBinding;
  return {
    ...gameBinding,
    commands: new Proxy(gameBinding.commands, {
      get: (commands, key) => (...args: never[]) => {
        const result = (commands[key as keyof AnimatorPlaybackCommandPort] as AnimatorPlaybackCommand)(...args);
        (sceneBinding.commands[key as keyof AnimatorPlaybackCommandPort] as AnimatorPlaybackCommand)(...args);
        return result;
      },
    }),
  };
}
