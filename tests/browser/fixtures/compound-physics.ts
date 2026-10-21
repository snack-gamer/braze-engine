import { rigidPlaybackBackend } from "/src/three/physics/rigid-playback-backend";
import { compileAuthoredPhysicsScene } from "/src/physics/authoring/scene-compiler";
import { defaultColliderForObject, defaultRigidbodyForObject } from "/src/physics/authoring/component-defaults";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "/src/physics/domain/world-settings";
import { makeObject } from "/src/lib/payload";

async function run() {
  const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("WebGPU unavailable");
  const device = await adapter.requestDevice(), errors: string[] = [];
  device.addEventListener("uncapturederror", (event) => errors.push(event.error.message)); device.pushErrorScope("validation");
  const floor = makeObject("cube", 0, { id: "floor", position: [0, -0.5, 0] }); floor.colliders = [{ ...defaultColliderForObject(floor), size: [30, 1, 30] }];
  const objects = [floor];
  for (const [id, y] of [["lower", 3], ["upper", 5]] as const) {
    const root = makeObject("transform", 0, { id, position: [0, y, 0] }); root.rigidbody = { ...defaultRigidbodyForObject(root), massMode: "manual", mass: 4 }; objects.push(root);
    for (const x of [-1, 1]) {
      const child = makeObject("cube", 0, { id: `${id}-${x}`, parentId: id, position: [x, 0, 0], rotation: [0, 15, 0] });
      child.colliders = [{ ...defaultColliderForObject(child), size: [1, 1, 1] }]; objects.push(child);
    }
  }
  const ball = makeObject("sphere", 0, { id: "gap", position: [0, 0.3, 0] }); ball.rigidbody = defaultRigidbodyForObject(ball); ball.colliders = [{ ...defaultColliderForObject(ball), radius: 0.25 }]; objects.push(ball);
  if (new URLSearchParams(location.search).has("large")) for (let i = 0; i < 65; i++) {
    const padding = makeObject("cube", i, { id: `padding-${i}`, position: [100 + i * 2, 0, 0] }); padding.colliders = [defaultColliderForObject(padding)]; objects.push(padding);
  }
  const factory = await rigidPlaybackBackend.prepare(device);
  const { runtime, bodyBindings } = factory.createWorld(compileAuthoredPhysicsScene(objects, "compound", DEFAULT_PHYSICS_WORLD_SETTINGS));
  const bytes = bodyBindings.length * 16;
  const position = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
  const orientation = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST });
  const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  try {
    runtime.setPoseTargets({ position, orientation });
    for (let i = 0; i < 4; i++) runtime.runRigidSolverBatch(60);
    const encoder = device.createCommandEncoder(); encoder.copyBufferToBuffer(position, 0, staging, 0, bytes); device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ); const values = Array.from(new Float32Array(staging.getMappedRange())); staging.unmap();
    const positions = Object.fromEntries(bodyBindings.filter((b) => ["lower", "upper", "gap"].includes(b.objectId)).map((b) => {
      const index = bodyBindings.indexOf(b); return [b.objectId, values.slice(index * 4, index * 4 + 3)];
    }));
    const validation = await device.popErrorScope(); if (validation) errors.push(validation.message);
    return { status: "passed", bodyCount: bodyBindings.length, positions, errors };
  } finally { await device.queue.onSubmittedWorkDone(); runtime.dispose(); position.destroy(); orientation.destroy(); staging.destroy(); device.destroy(); }
}
void run().then((result) => { document.querySelector("#result")!.textContent = JSON.stringify(result); }).catch((error) => { document.querySelector("#result")!.textContent = JSON.stringify({ status: "failed", error: String(error) }); });
