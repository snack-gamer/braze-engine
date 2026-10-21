import { useSyncExternalStore } from "react";
import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import type { SceneObject, ScenePlaybackMode } from "../../types";
import { playSceneLifetimeFor } from "./play-scene-lifetime";

/** Structural notifications only; frame ticks do not scan or copy the scene. */
export function usePlaySceneObjects(session: BrowserThreeWebGpuRenderSession, objects: SceneObject[], mode: ScenePlaybackMode) {
  const lifetime = playSceneLifetimeFor(session);
  useSyncExternalStore(lifetime.subscribe, lifetime.snapshot);
  return mode === "edit" ? objects : lifetime.objects(objects);
}
