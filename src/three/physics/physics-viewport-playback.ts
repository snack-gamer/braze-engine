import type { RootMotionSink } from "../../character/runtime/root-motion";
import type { PhysicsPlaybackInput } from "../../physics/runtime/playback-input";
import type { DeviceRenderOpportunity } from "../../rendering/adapters/three-webgpu-render-session-contract";
import type { Runtime } from "../runtime";
import type { PhysicsPlaybackDiagnostics } from "./physics-playback-diagnostics";

/** A viewport consumes a world; disposing this lease only detaches that view. */
export type PhysicsViewportPlayback = {
  prepare: (runtime: Runtime) => void;
  present: (args: { runtime: Runtime; mode: PhysicsPlaybackInput["mode"]; frameDeltaSeconds: number }) => boolean;
  /** Supplies fallback world input; the shared engine participant advances time. */
  schedule: (args: PhysicsPlaybackInput & {
    runtime: Runtime;
    frameDeltaSeconds: number;
    opportunity: DeviceRenderOpportunity;
  }) => boolean;
  hasPendingAdmission: () => boolean;
  hasPendingDeviceWork: () => boolean;
  diagnostics: () => PhysicsPlaybackDiagnostics;
  characterMotorFor: (objectId: string) => RootMotionSink;
  dispose: () => void;
};
