import type { SceneObject, Vec3 } from "../../types";

export type ObjectTransformPatch = Pick<SceneObject, "position" | "rotation" | "scale"> & {
  cameraTarget?: Vec3;
};

export type LiveObjectTransform = {
  objectId: string;
  transform: ObjectTransformPatch;
};

export type LiveTransformSubscription = (listener: (sample: LiveObjectTransform) => void) => () => void;

export type LiveTransformChannel = {
  publish: (objectId: string, transform: ObjectTransformPatch) => void;
  subscribe: LiveTransformSubscription;
};

/** Ephemeral editor-to-preview transport. It never mutates authored state. */
export function createLiveTransformChannel(): LiveTransformChannel {
  const listeners = new Set<(sample: LiveObjectTransform) => void>();
  return {
    publish: (objectId, transform) => {
      const sample = { objectId, transform };
      for (const listener of listeners) listener(sample);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
