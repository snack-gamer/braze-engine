import {
  composeRootMotionDeltas,
  type RootMotionDelta,
  type RootMotionSink,
} from "../../character/runtime/root-motion";
import {
  flushPendingKinematicMotorDeltas,
  resetKinematicMotorSession,
  type KinematicCharacterMotorState,
} from "./kinematic-character-motor";

export type PhysicsPlaybackMotorBuffer = Readonly<{
  sinkFor: (objectId: string) => RootMotionSink;
  flush: (state: KinematicCharacterMotorState, onChanged: () => void) => void;
  hasPending: () => boolean;
  forget: (objectId: string) => void;
  diagnostics: () => Readonly<{ sinks: number; pending: number }>;
  reset: () => void;
}>;

/** Coalesces root motion until the viewport's admitted GPU task writes kinematic buffers. */
export function createPhysicsPlaybackMotorBuffer(onQueued: () => void): PhysicsPlaybackMotorBuffer {
  const pending = new Map<string, RootMotionDelta>();
  const sinks = new Map<string, RootMotionSink>();
  let generation = 0;
  const inertSink: RootMotionSink = { applyRootMotion: () => undefined };

  return {
    sinkFor(objectId) {
      const existing = sinks.get(objectId);
      if (existing) return existing;
      if (!objectId) return inertSink;
      const ownedGeneration = generation;
      const sink: RootMotionSink = {
        applyRootMotion: ({ delta }) => {
          if (ownedGeneration !== generation || sinks.get(objectId) !== sink) return;
          const accumulated = pending.get(objectId);
          pending.set(objectId, accumulated
            ? composeRootMotionDeltas(accumulated, delta)
            : delta);
          onQueued();
        },
      };
      sinks.set(objectId, sink);
      return sink;
    },
    flush: (state, onChanged) => {
      flushPendingKinematicMotorDeltas(state, pending, onChanged);
    },
    hasPending: () => pending.size > 0,
    forget(objectId) {
      sinks.delete(objectId); pending.delete(objectId);
    },
    diagnostics: () => ({ sinks: sinks.size, pending: pending.size }),
    reset: () => { generation++; resetKinematicMotorSession(pending, sinks); },
  };
}
