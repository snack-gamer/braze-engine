import type { WorldEntity } from "../../world/domain/entity-world";
import type { RigidBodyDescriptor } from "../../physics/runtime/rigid-world-descriptor";

/** One reserved solver slot owned by one exact runtime entity generation. */
export type RuntimeBodyRecord = {
  entity: WorldEntity;
  index: number;
  descriptor: RigidBodyDescriptor;
  reservation?: symbol;
  reused?: boolean;
};
