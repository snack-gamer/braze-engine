import type { SceneObject } from "../../../scene/domain/scene-object";
import type { ThreeAnimatorWorldRig } from "./three-animator-world-assets";
import type { EntityHandle } from "../../../world/domain/entity-world";
import type { RootMotionSink } from "../../runtime/root-motion";

/** A prepared rig transfers to the animation world when preparation is called. */
export type RuntimeAnimatorCreation = Readonly<{
  object: SceneObject;
  rig: ThreeAnimatorWorldRig;
  entity?: EntityHandle;
  /** Explicit runtime motor mapping; Animator IDs are not physics body IDs. */
  rootMotionSink?: RootMotionSink;
}>;

/** Publication is reversible; retirement releases removed controller state. */
export type PreparedRuntimeAnimatorChange = Readonly<{
  publish: () => void;
  rollback: () => void;
  retire: () => void;
}>;
