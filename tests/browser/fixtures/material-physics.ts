import { rigidPlaybackBackend } from "/src/three/physics/rigid-playback-backend";
import { compileAuthoredPhysicsScene } from "/src/physics/authoring/scene-compiler";
import { defaultColliderForObject, defaultRigidbodyForObject } from "/src/physics/authoring/component-defaults";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "/src/physics/domain/world-settings";
import { makeObject } from "/src/lib/payload";

async function run() {
  const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("WebGPU unavailable");
  const device = await adapter.requestDevice(), errors: string[] = [];
  device.addEventListener("uncapturederror", (event) => errors.push(event.error.message)); device.pushErrorScope("validation");
  const floor = makeObject("cube", 0, { id: "floor", position: [0, -0.5, 0] }); floor.colliders = [{ ...defaultColliderForObject(floor), size: [30, 1, 30], collisionLayer: 31 }];
  const objects = [floor];
  for (const [id, x, mask, restitution] of [["bounce", 0, 0xffffffff, 0.9], ["excluded", 4, 1, 0], ["included", 6, 0x80000000, 0], ["force", 10, 0, 0]] as const) {
    const body = makeObject("sphere", 0, { id, position: [x, 2, 0] });
    body.rigidbody = { ...defaultRigidbodyForObject(body), massMode: "manual", mass: 2, useGravity: id !== "force" };
    body.colliders = [{ ...defaultColliderForObject(body), radius: 0.5, collisionMask: mask, restitution }]; objects.push(body);
  }
  if (new URLSearchParams(location.search).has("large")) for (let i = 0; i < 65; i++) {
    const padding = makeObject("cube", i, { id: `padding-${i}`, position: [100 + i * 2, 0, 0] }); padding.colliders = [defaultColliderForObject(padding)]; objects.push(padding);
  }
  const factory = await rigidPlaybackBackend.prepare(device);
  const { runtime, bodyBindings } = factory.createWorld(compileAuthoredPhysicsScene(objects, "materials", DEFAULT_PHYSICS_WORLD_SETTINGS));
  const bytes = bodyBindings.length * 16, forceIndex = bodyBindings.findIndex((b) => b.objectId === "force");
  const position = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
  const orientation = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST });
  const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const read = async () => {
    const encoder = device.createCommandEncoder(); encoder.copyBufferToBuffer(position, 0, staging, 0, bytes); device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ); const values = Array.from(new Float32Array(staging.getMappedRange())); staging.unmap();
    return Object.fromEntries(bodyBindings.flatMap((b, i) => ["floor", "bounce", "excluded", "included", "force"].includes(b.objectId) ? [[b.objectId, values.slice(i * 4, i * 4 + 3)]] : []));
  };
  try {
    runtime.setPoseTargets({ position, orientation });
    runtime.queueBodyCommand!({ kind: "force", body: forceIndex, linear: [4, 0, 0], angular: [0, 0, 1] });
    runtime.runRigidSolverBatch(60); const first = await read();
    runtime.queueBodyCommand!({ kind: "force", body: forceIndex, linear: [0, 0, 0] });
    runtime.runRigidSolverBatch(60); const second = await read();
    const validation = await device.popErrorScope(); if (validation) errors.push(validation.message);
    return { status: "passed", first, second, errors };
  } finally { await device.queue.onSubmittedWorkDone(); runtime.dispose(); position.destroy(); orientation.destroy(); staging.destroy(); device.destroy(); }
}
void run().then((result) => { document.querySelector("#result")!.textContent = JSON.stringify(result); }).catch((error) => { document.querySelector("#result")!.textContent = JSON.stringify({ status: "failed", error: String(error) }); });
