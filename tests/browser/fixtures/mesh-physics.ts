import { rigidPlaybackBackend } from "/src/three/physics/rigid-playback-backend";
import { compileAuthoredPhysicsScene } from "/src/physics/authoring/scene-compiler";
import { defaultColliderForObject, defaultRigidbodyForObject } from "/src/physics/authoring/component-defaults";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "/src/physics/domain/world-settings";
import { makeObject } from "/src/lib/payload";

async function run() {
  const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("WebGPU unavailable");
  const device = await adapter.requestDevice(), errors: string[] = [];
  device.addEventListener("uncapturederror", (event) => errors.push(event.error.message)); device.pushErrorScope("validation");
  const mesh = makeObject("transform", 0, { id: "mesh" });
  // Two disconnected platforms: geometry inside the bounding box must remain empty.
  mesh.colliders = [{ ...defaultColliderForObject(mesh), shape: "mesh", geometry: {
    vertices: [-6,0,-3, -1,0,-3, -1,0,3, -6,0,3, 1,0,-3, 6,0,-3, 6,0,3, 1,0,3],
    indices: [0,2,1,0,3,2,4,6,5,4,7,6],
  } }];
  const objects = [mesh];
  for (const [id, x, z, shape] of [["box", -3, 0, "box"], ["ball", 3, -1, "sphere"], ["capsule", 3, 1, "capsule"], ["gap", 0, 0, "sphere"]] as const) {
    const body = makeObject("cube", 0, { id, position: [x, 3, z] }); body.rigidbody = defaultRigidbodyForObject(body);
    body.colliders = [{ ...defaultColliderForObject(body), shape, size: [1,1,1], radius: 0.5, length: 1, axis: "y" }]; objects.push(body);
  }
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
    for (let i = 0; i < 2; i++) runtime.runRigidSolverBatch(60);
    const encoder = device.createCommandEncoder(); encoder.copyBufferToBuffer(position, 0, staging, 0, bytes); device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ); const values = Array.from(new Float32Array(staging.getMappedRange())); staging.unmap();
    const positions = Object.fromEntries(bodyBindings.filter((b) => ["box", "ball", "capsule", "gap"].includes(b.objectId)).map((b) => {
      const index = bodyBindings.indexOf(b); return [b.objectId, values.slice(index * 4, index * 4 + 3)];
    }));
    const validation = await device.popErrorScope(); if (validation) errors.push(validation.message);
    return { status: "passed", bodyCount: bodyBindings.length, positions, errors };
  } finally { await device.queue.onSubmittedWorkDone(); runtime.dispose(); position.destroy(); orientation.destroy(); staging.destroy(); device.destroy(); }
}
void run().then((result) => { document.querySelector("#result")!.textContent = JSON.stringify(result); }).catch((error) => { document.querySelector("#result")!.textContent = JSON.stringify({ status: "failed", error: String(error) }); });
