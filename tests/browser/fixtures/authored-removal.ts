import { rigidPlaybackBackend } from "/src/three/physics/rigid-playback-backend";
import { compileAuthoredPhysicsScene } from "/src/physics/authoring/scene-compiler";
import { defaultColliderForObject, defaultRigidbodyForObject } from "/src/physics/authoring/component-defaults";
import { DEFAULT_PHYSICS_WORLD_SETTINGS as settings } from "/src/physics/domain/world-settings";
import { defaultJoint } from "/src/physics/domain/joint";
import { makeObject } from "/src/lib/payload";

async function run() {
  const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("WebGPU unavailable");
  const device = await adapter.requestDevice(), errors: string[] = [];
  device.addEventListener("uncapturederror", (event) => errors.push(event.error.message)); device.pushErrorScope("validation");
  const body = (id: string, position: [number, number, number], dynamic = false) => {
    const object = makeObject("cube", 0, { id, position });
    object.colliders = [{ ...defaultColliderForObject(object), size: [1, 1, 1] }];
    if (dynamic) object.rigidbody = { ...defaultRigidbodyForObject(object), useGravity: id === "resting", linearDamping: 0, angularDamping: 0 };
    return object;
  };
  const floor = body("floor", [0, -0.5, 0]); floor.colliders![0].size = [10, 1, 10];
  const anchor = body("anchor", [20, 2, 0], true); anchor.rigidbody!.bodyType = "kinematic";
  const tethered = body("tethered", [22, 2, 0], true);
  tethered.joint = { ...defaultJoint(), kind: "distance", connectedObjectId: "anchor", restLength: 2 };
  const objects = [floor, body("resting", [0, 0.5, 0], true), body("runner", [-20, 8, 0], true), anchor, tethered];
  if (new URLSearchParams(location.search).has("large")) for (let i = 0; i < 65; i++) objects.push(body(`padding-${i}`, [100 + i * 2, 0, 0]));
  const factory = await rigidPlaybackBackend.prepare(device);
  const compiled = compileAuthoredPhysicsScene(objects, "authored-removal", settings);
  const baseline = factory.createWorld(compiled), changed = factory.createWorld(compiled);
  const worlds = [baseline, changed], owned: GPUBuffer[] = [];
  const targets = worlds.map(({ runtime }) => {
    const size = runtime.capacity.bodyCount * 16;
    const position = device.createBuffer({ size, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    const orientation = device.createBuffer({ size, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    owned.push(position, orientation); runtime.setPoseTargets({ position, orientation }); return { position, orientation };
  });
  const index = (id: string) => changed.bodyBindings.findIndex((binding) => binding.objectId === id);
  const sample = async (buffer: GPUBuffer) => {
    const staging = device.createBuffer({ size: buffer.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      const encoder = device.createCommandEncoder(); encoder.copyBufferToBuffer(buffer, 0, staging, 0, buffer.size); device.queue.submit([encoder.finish()]);
      await staging.mapAsync(GPUMapMode.READ); const result = Array.from(new Float32Array(staging.getMappedRange())); staging.unmap(); return result;
    } finally { staging.destroy(); }
  };
  const step = (ticks: number) => worlds.forEach(({ runtime }) => runtime.runRigidSolverBatch(ticks));
  try {
    for (const { runtime } of worlds) runtime.queueBodyCommand!({ kind: "velocity", body: index("runner"), linear: [1, 0.3, 0], angular: [0.2, 0.3, 0.4] });
    step(60);
    changed.runtime.bodySlots!.prepare([{ index: index("floor"), body: null }, { index: index("anchor"), body: null }]).publish();
    for (const { runtime } of worlds) runtime.queueBodyCommand!({ kind: "velocity", body: index("tethered"), linear: [2, 0, 0], angular: [0, 0, 0] });
    step(60);
    const [expected, actual, expectedQ, actualQ] = await Promise.all([
      sample(targets[0].position), sample(targets[1].position), sample(targets[0].orientation), sample(targets[1].orientation),
    ]);
    let preservedError = 0;
    for (let lane = index("runner") * 4; lane < index("runner") * 4 + 4; lane++) {
      preservedError = Math.max(preservedError, Math.abs(actual[lane] - expected[lane]), Math.abs(actualQ[lane] - expectedQ[lane]));
    }
    const events = await changed.runtime.readEvents!();
    const validation = await device.popErrorScope(); if (validation) errors.push(validation.message);
    return { status: "passed", errors, preservedError, count: changed.runtime.bodySlots!.activeCount(), initial: objects.length,
      floorRemoved: changed.runtime.bodySlots!.generation(index("floor")) === -1,
      restingY: actual[index("resting") * 4 + 1], baselineY: expected[index("resting") * 4 + 1],
      releasedX: actual[index("tethered") * 4], tetheredX: expected[index("tethered") * 4],
      staleEvents: events.events.filter((event) => [event.a, event.b].some((body) => body === index("floor") || body === index("anchor"))) };
  } finally {
    await device.queue.onSubmittedWorkDone(); worlds.forEach(({ runtime }) => runtime.dispose()); owned.forEach((buffer) => buffer.destroy()); device.destroy();
  }
}
void run().then((result) => { document.querySelector("#result")!.textContent = JSON.stringify(result); })
  .catch((error) => { document.querySelector("#result")!.textContent = JSON.stringify({ status: "failed", error: String(error) }); });
