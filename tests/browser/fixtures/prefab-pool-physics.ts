import { rigidPlaybackBackend } from "/src/three/physics/rigid-playback-backend";
import { compileAuthoredPhysicsScene } from "/src/physics/authoring/scene-compiler";
import { defaultColliderForObject, defaultRigidbodyForObject } from "/src/physics/authoring/component-defaults";
import { DEFAULT_PHYSICS_WORLD_SETTINGS as settings } from "/src/physics/domain/world-settings";
import { makeObject } from "/src/lib/payload";
import { createEntityWorld } from "/src/world/runtime/entity-world";
import { createRuntimeEntityBodies } from "/src/three/physics/runtime-entity-bodies";
import { PhysicsPoseBuffers } from "/src/three/physics/gpu-pose";
import { compileRuntimePrefabLibrary } from "/src/prefabs/adapters/runtime-prefab-compiler";
import { createRuntimePrefabs } from "/src/prefabs/runtime/runtime-prefabs";
import prefab from "/tests/gameplay/fixtures/runtime-duo.braze-prefab.json";

async function run() {
  const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw Error("WebGPU unavailable");
  const device = await adapter.requestDevice(), errors: string[] = [];
  device.addEventListener("uncapturederror", (event) => errors.push(event.error.message)); device.pushErrorScope("validation");
  const body = (id: string, position: number[], dynamic = false) => {
    const object = makeObject("cube", 0, { id, position }); object.colliders = [{ ...defaultColliderForObject(object), size: [1, 1, 1] }];
    if (dynamic) object.rigidbody = { ...defaultRigidbodyForObject(object), useGravity: false }; return object;
  };
  const floor = body("floor", [0, -0.5, 0]); floor.colliders[0].size = [40, 1, 40];
  const objects = [floor, body("unchanged", [-10, 10, 0], true)];
  if (new URLSearchParams(location.search).has("large")) for (let i = 0; i < 65; i++) objects.push(body(`padding-${i}`, [100 + i * 2, 0, 0]));
  const compiled = compileAuthoredPhysicsScene(objects, "pool-reset", settings), factory = await rigidPlaybackBackend.prepare(device);
  const changing = factory.createWorld(compiled, 2), baseline = factory.createWorld(compiled, 2), fresh = factory.createWorld(compiled, 2);
  const physics = [changing, baseline, fresh], buffers: GPUBuffer[] = [];
  const targets = physics.map(({ runtime }) => {
    const size = runtime.capacity.bodyCount * 16;
    const make = () => { const buffer = device.createBuffer({ size, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }); buffers.push(buffer); return buffer; };
    const target = { position: make(), orientation: make() }; runtime.setPoseTargets(target); return target;
  });
  const hosts = [changing, fresh].map((physical) => {
    const owner = createRuntimeEntityBodies({ ...physical, poseBuffers: new PhysicsPoseBuffers(physical.runtime.capacity.bodyCount) }, settings, () => device.queue.onSubmittedWorkDone());
    const world = createEntityWorld({ backend: owner.backend }), asset = { guid: "a".repeat(32) };
    const templates = compileRuntimePrefabLibrary([{ asset, name: "Duo", revision: "test", document: prefab }]);
    const prefabs = createRuntimePrefabs(world.port, templates, world.reservations);
    return { owner, world, pool: prefabs.createPool(asset, { capacity: 1 }) };
  });
  const sample = async (buffer: GPUBuffer) => {
    const staging = device.createBuffer({ size: buffer.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      const encoder = device.createCommandEncoder(); encoder.copyBufferToBuffer(buffer, 0, staging, 0, buffer.size); device.queue.submit([encoder.finish()]);
      await staging.mapAsync(GPUMapMode.READ); const result = Array.from(new Float32Array(staging.getMappedRange())); staging.unmap(); return result;
    } finally { staging.destroy(); }
  };
  const step = (count: number) => { changing.runtime.runRigidSolverBatch(count); baseline.runtime.runRigidSolverBatch(count); };
  const lease = (ticket: ReturnType<typeof hosts[0]["pool"]["acquire"]>) => { const result = ticket.read(); if (result.status !== "committed") throw Error(JSON.stringify(result)); return result.instance; };
  const start = changing.runtime.bodySlots!.start;
  try {
    for (const { runtime, bodyBindings } of [changing, baseline]) runtime.queueBodyCommand!({ kind: "velocity", body: bodyBindings.findIndex((binding) => binding.objectId === "unchanged"), linear: [0.7, 0.5, 0], angular: [0.2, 0.1, 0.3] });
    const first = hosts[0].pool.acquire({ position: [0, 3, 0] }); hosts[0].world.flush(1); const a = lease(first); step(1);
    for (let i = 0; i < 2; i++) {
      changing.runtime.queueBodyCommand!({ kind: "velocity", body: start + i, linear: [0.5, -2, 0], angular: [3, 2, 1] });
      changing.runtime.queueBodyCommand!({ kind: "force", body: start + i, linear: [2, 0, 0], angular: [1, 2, 3] });
    }
    step(60); step(60); hosts[0].pool.release(a); hosts[0].world.flush(2); step(1);
    await device.queue.onSubmittedWorkDone(); for (let i = 0; i < 12; i++) await Promise.resolve();
    const idle = hosts[0].pool.stats(), activeAfterReturn = changing.runtime.bodySlots!.activeCount();
    const placement = { position: [4, 6, -2] as const, rotation: [0, 45, 0] as const };
    const reused = hosts[0].pool.acquire(placement), virgin = hosts[1].pool.acquire(placement);
    hosts[0].world.flush(3); hosts[1].world.flush(1); const b = lease(reused); lease(virgin);
    step(10); fresh.runtime.runRigidSolverBatch(10);
    const actual = await sample(targets[0].position), expected = await sample(targets[2].position), stable = await sample(targets[1].position);
    const actualQ = await sample(targets[0].orientation), expectedQ = await sample(targets[2].orientation), stableQ = await sample(targets[1].orientation);
    let resetError = 0, preservedError = 0;
    for (let i = 0; i < actual.length; i++) {
      if (i < start * 4) preservedError = Math.max(preservedError, Math.abs(actual[i] - stable[i]), Math.abs(actualQ[i] - stableQ[i]));
      else resetError = Math.max(resetError, Math.abs(actual[i] - expected[i]), Math.abs(actualQ[i] - expectedQ[i]));
    }
    const validation = await device.popErrorScope(); if (validation) errors.push(validation.message);
    return { status: "passed", errors, idle, activeAfterReturn, start, resetError, preservedError,
      sameSlot: a.root.slot === b.root.slot, stale: !hosts[0].pool.isAlive(a), generation: b.root.generation,
      physicalGeneration: changing.runtime.bodySlots!.generation(start), stats: hosts[0].world.port.stats() };
  } finally {
    hosts.forEach(({ world }) => world.dispose()); await device.queue.onSubmittedWorkDone();
    physics.forEach(({ runtime }) => runtime.dispose()); buffers.forEach((buffer) => buffer.destroy()); device.destroy();
  }
}
void run().then((result) => { document.querySelector("#result")!.textContent = JSON.stringify(result); })
  .catch((error) => { document.querySelector("#result")!.textContent = JSON.stringify({ status: "failed", error: String(error) }); });
