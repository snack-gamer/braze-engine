import { rigidPlaybackBackend } from "/src/three/physics/rigid-playback-backend";
import { compileAuthoredPhysicsScene } from "/src/physics/authoring/scene-compiler";
import { defaultColliderForObject, defaultRigidbodyForObject } from "/src/physics/authoring/component-defaults";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "/src/physics/domain/world-settings";
import { makeObject } from "/src/lib/payload";

async function run() {
  const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("WebGPU unavailable");
  const device = await adapter.requestDevice(), errors: string[] = [];
  device.addEventListener("uncapturederror", (event) => errors.push(event.error.message)); device.pushErrorScope("validation");
  const zone = makeObject("cube", 0, { id: "zone", position: [0, 0, 0] }); zone.colliders = [{ ...defaultColliderForObject(zone), isTrigger: true, size: [1, 4, 2] }];
  const floor = makeObject("cube", 0, { id: "floor", position: [5, -0.5, 0] }); floor.colliders = [{ ...defaultColliderForObject(floor), size: [2, 1, 2] }];
  const objects = [zone, floor];
  for (const [id, position] of [["mover", [-2, 1, 0]], ["kinematic", [-2, -0.5, 0]], ["fall", [5, 2, 0]]] as const) {
    const b = makeObject("sphere", 0, { id, position: [...position] }); b.colliders = [{ ...defaultColliderForObject(b), radius: 0.2 }];
    b.rigidbody = { ...defaultRigidbodyForObject(b), bodyType: id === "kinematic" ? "kinematic" : "dynamic", useGravity: id === "fall" }; objects.push(b);
  }
  if (new URLSearchParams(location.search).has("large")) for (let i = 0; i < 65; i++) {
    const padding = makeObject("cube", i, { id: `padding-${i}`, position: [100 + i * 2, 0, 0] }); padding.colliders = [defaultColliderForObject(padding)]; objects.push(padding);
  }
  const factory = await rigidPlaybackBackend.prepare(device);
  const { runtime, bodyBindings } = factory.createWorld(compileAuthoredPhysicsScene(objects, "events", DEFAULT_PHYSICS_WORLD_SETTINGS));
  const index = (id: string) => bodyBindings.findIndex((b) => b.objectId === id);
  try {
    runtime.queueBodyCommand!({ kind: "velocity", body: index("mover"), linear: [4, 0, 0] });
    runtime.queueBodyCommand!({ kind: "kinematic-target", body: index("kinematic"), position: [2, -.5, 0], orientation: [0, 0, 0, 1] });
    runtime.runRigidSolverBatch(60);
    const batch = await runtime.readEvents!();
    const events = batch.events.map((event) => ({ ...event, a: bodyBindings[event.a].objectId, b: bodyBindings[event.b].objectId }));
    const empty = await runtime.readEvents!();
    let overflow = null;
    if (new URLSearchParams(location.search).has("overflow")) {
      for (let i = 0; i < 600; i++) {
        runtime.queueBodyCommand!({ kind: "kinematic-target", body: index("kinematic"), position: [i % 2 ? 2 : -2, -.5, 0], orientation: [0, 0, 0, 1] }); runtime.runRigidSolverBatch(1);
      }
      const full = await runtime.readEvents!(); overflow = { count: full.events.length, capacity: full.capacity, dropped: full.dropped };
    }
    const validation = await device.popErrorScope(); if (validation) errors.push(validation.message);
    return { status: "passed", events, tick: batch.tick, dropped: batch.dropped, empty: empty.events.length, overflow, errors };
  } finally { await device.queue.onSubmittedWorkDone(); runtime.dispose(); device.destroy(); }
}
void run().then((result) => { document.querySelector("#result")!.textContent = JSON.stringify(result); }).catch((error) => { document.querySelector("#result")!.textContent = JSON.stringify({ status: "failed", error: String(error) }); });
