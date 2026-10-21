import { rigidPlaybackBackend } from "/src/three/physics/rigid-playback-backend";
import { compileAuthoredPhysicsScene } from "/src/physics/authoring/scene-compiler";
import { compileRigidWorld } from "/src/physics/authoring/rigid-world-compiler";
import { defaultColliderForObject, defaultRigidbodyForObject } from "/src/physics/authoring/component-defaults";
import { DEFAULT_PHYSICS_WORLD_SETTINGS as settings } from "/src/physics/domain/world-settings";
import { makeObject } from "/src/lib/payload";

async function run() {
  const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("WebGPU unavailable");
  const device = await adapter.requestDevice(), errors: string[] = [];
  device.addEventListener("uncapturederror", (event) => errors.push(event.error.message)); device.pushErrorScope("validation");
  const body = (id: string, position: number[], dynamic = true) => {
    const object = makeObject("cube", 0, { id, position });
    object.colliders = [{ ...defaultColliderForObject(object), size: [1, 1, 1] }];
    if (dynamic) object.rigidbody = { ...defaultRigidbodyForObject(object), useGravity: id !== "runner", linearDamping: 0, angularDamping: 0 };
    return object;
  };
  const floor = body("floor", [0, -0.5, 0], false); floor.colliders[0].size = [30, 1, 30];
  const objects = [floor, body("runner", [-5, 10, 0]), body("resting", [-8, 1.5, 0])];
  if (new URLSearchParams(location.search).has("large")) for (let i = 0; i < 65; i++) objects.push(body(`padding-${i}`, [100 + i * 2, 0, 0], false));
  const compiled = compileAuthoredPhysicsScene(objects, "entity-lifecycle", settings);
  const factory = await rigidPlaybackBackend.prepare(device);
  const baseline = factory.createWorld(compiled, 2), changing = factory.createWorld(compiled, 2);
  const worlds = [baseline, changing];
  const owned: GPUBuffer[] = [];
  const positions = worlds.map(({ runtime }) => {
    const size = runtime.capacity.bodyCount * 16;
    const position = device.createBuffer({ size, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    const orientation = device.createBuffer({ size, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    runtime.setPoseTargets({ position, orientation }); owned.push(position, orientation); return { position, orientation };
  });
  const sample = async (buffer: GPUBuffer) => {
    const staging = device.createBuffer({ size: buffer.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      const encoder = device.createCommandEncoder(); encoder.copyBufferToBuffer(buffer, 0, staging, 0, buffer.size); device.queue.submit([encoder.finish()]);
      await staging.mapAsync(GPUMapMode.READ); const result = Array.from(new Float32Array(staging.getMappedRange())); staging.unmap(); return result;
    } finally { staging.destroy(); }
  };
  const step = (ticks: number) => worlds.forEach(({ runtime }) => runtime.runRigidSolverBatch(ticks));
  const slots = changing.runtime.bodySlots!, slot = slots.start;
  const descriptor = (id: string, position: number[]) => compileRigidWorld(compileAuthoredPhysicsScene([body(id, position)], id, settings)).bodies[0];
  try {
    for (const world of worlds) {
      const runner = world.bodyBindings.findIndex((binding) => binding.objectId === "runner");
      world.runtime.queueBodyCommand!({ kind: "velocity", body: runner, linear: [0.75, 0.5, 0], angular: [0.2, 0.3, 0.4] });
      world.runtime.queueBodyCommand!({ kind: "force", body: runner, linear: [0.1, 0.2, 0] });
    }
    step(30);
    slots.prepare([{ index: slot, body: descriptor("spawned", [5, 3.5, 0]) }]).publish();
    step(1); const first = (await sample(positions[1].position))[slot * 4 + 1];
    step(60); const landed = (await sample(positions[1].position))[slot * 4 + 1];
    // Reuse before another solver step: old contact impulses and events must not attach to generation 2.
    slots.prepare([{ index: slot, body: null }]).publish();
    slots.prepare([{ index: slot, body: descriptor("replacement", [5, 7, 0]), velocity: [0, 0, 0] }]).publish();
    const eventsBefore = await changing.runtime.readEvents!();
    step(1); const replaced = (await sample(positions[1].position))[slot * 4 + 1];
    // Both slots can be live, and a failed transaction must preserve them.
    slots.prepare([{ index: slot + 1, body: descriptor("second", [7, 6, 0]) }]).publish();
    let rejected = false;
    try { slots.prepare([{ index: slot, body: null }, { index: slot + 5, body: null }]); } catch { rejected = true; }
    const activeBeforeRemoval = slots.activeCount(); step(30);
    slots.prepare([{ index: slot, body: null }, { index: slot + 1, body: null }]).publish(); step(1);
    const actual = await sample(positions[1].position), expected = await sample(positions[0].position);
    const actualQ = await sample(positions[1].orientation), expectedQ = await sample(positions[0].orientation);
    let preservedError = 0;
    for (let i = 0; i < slot * 4; i++) preservedError = Math.max(preservedError, Math.abs(actual[i] - expected[i]), Math.abs(actualQ[i] - expectedQ[i]));
    const empty = factory.createWorld(compileAuthoredPhysicsScene([], "empty", settings), 2);
    empty.runtime.bodySlots!.prepare([{ index: 0, body: descriptor("first-body", [0, 4, 0]) }]).publish(); empty.runtime.runRigidSolverBatch(1);
    await device.queue.onSubmittedWorkDone(); empty.runtime.dispose();
    const validation = await device.popErrorScope(); if (validation) errors.push(validation.message);
    return { status: "passed", first, landed, replaced, rejected, activeBeforeRemoval, activeAfterRemoval: slots.activeCount(), authored: slot,
      staleEvents: eventsBefore.events.filter((event) => event.a === slot || event.b === slot), preservedError, errors };
  } finally {
    await device.queue.onSubmittedWorkDone(); worlds.forEach(({ runtime }) => runtime.dispose()); owned.forEach((buffer) => buffer.destroy()); device.destroy();
  }
}
void run().then((result) => { document.querySelector("#result")!.textContent = JSON.stringify(result); })
  .catch((error) => { document.querySelector("#result")!.textContent = JSON.stringify({ status: "failed", error: String(error) }); });
