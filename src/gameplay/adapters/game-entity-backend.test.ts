import { expect, it, vi } from "vitest";
import { createGameEntityBackend } from "./game-entity-backend";
import { playSceneLifetimeFor } from "./play-scene-lifetime";
import { createEntityWorld } from "../../world/runtime/entity-world";
import { makeObject } from "../../lib/payload";
import { defaultColliderForObject, defaultRigidbodyForObject } from "../../physics/authoring/component-defaults";
import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";

vi.mock("../../three/physics/shared-physics-world", () => ({ physicsWorldForSession: () => undefined }));

it("destroys pure render objects without a physics world or reserve and restores the shared presentation on Stop", () => {
  const session = {} as BrowserThreeWebGpuRenderSession;
  const objects = [makeObject("cube", 0, { id: "parent" }), makeObject("sphere", 1, { id: "child", parentId: "parent" })];
  const lifetime = playSceneLifetimeFor(session);
  const world = createEntityWorld({ authored: objects, backend: createGameEntityBackend(session, false, objects) });
  const receipt = world.port.destroy(world.port.findByAuthoredId("parent")!); world.flush(1);
  expect(receipt.read()).toMatchObject({ status: "committed", removed: 2 });
  expect(lifetime.objects(objects)).toEqual([]); world.dispose(); expect(lifetime.objects(objects)).toBe(objects);
});

it("rejects deleting a collider child separately from its Rigidbody owner before changing any presentation", () => {
  const session = {} as BrowserThreeWebGpuRenderSession;
  const owner = makeObject("transform", 0, { id: "owner" }), child = makeObject("cube", 1, { id: "child", parentId: "owner" });
  owner.rigidbody = defaultRigidbodyForObject(owner); child.colliders = [defaultColliderForObject(child)];
  const objects = [owner, child];
  const world = createEntityWorld({ authored: objects, backend: createGameEntityBackend(session, true, objects) });
  const receipt = world.port.destroy(world.port.findByAuthoredId("child")!); world.flush(1);
  expect(receipt.read()).toMatchObject({ status: "rejected", code: "missing-dependency" });
  expect(world.port.stats().alive).toBe(2); expect(playSceneLifetimeFor(session).objects(objects)).toBe(objects); world.dispose();
});
