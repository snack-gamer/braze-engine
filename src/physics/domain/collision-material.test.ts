import { expect, it } from "vitest";
import { collisionLayersMatch } from "./collision-material";
import { normalizeCollider } from "../authoring/component-defaults";
import { parsePhysicsComponents, serializeColliders } from "../serialization/codec";

it("uses reciprocal masks including the unsigned high layer bit", () => {
  expect(collisionLayersMatch({}, {})).toBe(true);
  expect(collisionLayersMatch({ collisionMask: 0x80000000 }, { collisionLayer: 31 })).toBe(true);
  expect(collisionLayersMatch({ collisionMask: 1 }, { collisionLayer: 31 })).toBe(false);
  expect(collisionLayersMatch({ collisionMask: 0x80000000 }, { collisionLayer: 31, collisionMask: 0 })).toBe(false);
});
it("round trips material and filter settings while keeping old collider defaults compatible", () => {
  const collider = normalizeCollider({ id: "solid", restitution: 0.8, collisionLayer: 31, collisionMask: 0x80000001 });
  expect(parsePhysicsComponents({ colliders: serializeColliders([collider]) }, { id: "body", primitive: "cube" }).colliders).toEqual([collider]);
  expect(normalizeCollider({ restitution: 5, collisionLayer: 80, collisionMask: -1 })).toMatchObject({ restitution: 1, collisionLayer: 31, collisionMask: 0 });
});
