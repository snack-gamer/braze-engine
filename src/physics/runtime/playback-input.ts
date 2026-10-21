import type { SceneObject, ScenePlaybackMode } from "../../types";
import type { PhysicsWorldSettings } from "../domain/world-settings";

/** Authored input and transport for one world, independent of its viewers. */
export type PhysicsPlaybackInput = Readonly<{
  objects: SceneObject[];
  worldSettings: PhysicsWorldSettings;
  mode: ScenePlaybackMode;
  stepToken: number;
}>;
