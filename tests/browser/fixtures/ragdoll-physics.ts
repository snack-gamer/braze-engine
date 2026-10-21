import recipe from "../../../skills/braze-game-developer/examples/jointed-ragdoll.json";
import { executeSceneCommands } from "/src/automation/application/scene-commands";
import { parseSceneObjects } from "/src/scene/serialization/scene-object-decoder";
import { compileRigidWorld } from "/src/physics/authoring/rigid-world-compiler";
import { rotate } from "/src/physics/runtime/queries/static-shape-query";
import { rigidPlaybackBackend } from "/src/three/physics/rigid-playback-backend";
import { compileAuthoredPhysicsScene } from "/src/physics/authoring/scene-compiler";
import { defaultColliderForObject } from "/src/physics/authoring/component-defaults";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "/src/physics/domain/world-settings";
import { makeObject } from "/src/lib/payload";

async function run() {
  const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("WebGPU unavailable");
  const device = await adapter.requestDevice(), errors: string[] = [];
  device.addEventListener("uncapturederror", (event) => errors.push(event.error.message)); device.pushErrorScope("validation");
  const authored = executeSceneCommands({ version: "braze-engine/scene-v1", objects: [] }, recipe);
  if (!authored.valid) throw new Error(authored.diagnostics.join("\n"));
  const objects = parseSceneObjects(authored.scene.objects);
  const floor = makeObject("cube", 0, { id: "floor", position: [25, -0.5, -8] }); floor.colliders = [{ ...defaultColliderForObject(floor), size: [30,1,30] }]; objects.push(floor);
  if (new URLSearchParams(location.search).has("large")) for (let i = 0; i < 65; i++) {
    const padding = makeObject("cube", i, { id: `padding-${i}`, position: [100 + i * 2, 0, 0] }); padding.colliders = [defaultColliderForObject(padding)]; objects.push(padding);
  }
  const factory = await rigidPlaybackBackend.prepare(device);
  const compiled = compileAuthoredPhysicsScene(objects, "ragdoll", DEFAULT_PHYSICS_WORLD_SETTINGS);
  const descriptor = compileRigidWorld(compiled);
  const { runtime, bodyBindings } = factory.createWorld(compiled);
  const bytes = bodyBindings.length * 16;
  const position = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
  const orientation = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
  const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const rotationReadback = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  try {
    runtime.setPoseTargets({ position, orientation });
    runtime.queueBodyCommand({ kind: "impulse", body: bodyBindings.findIndex(b=>b.objectId === "agent-ragdoll-torso"), linear: [0,0,6], angular: [1,0,0] });
    for (let i = 0; i < 4; i++) runtime.runRigidSolverBatch(60);
    const encoder = device.createCommandEncoder(); encoder.copyBufferToBuffer(position, 0, staging, 0, bytes); encoder.copyBufferToBuffer(orientation, 0, rotationReadback, 0, bytes); device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ); const values = Array.from(new Float32Array(staging.getMappedRange())); staging.unmap();
    await rotationReadback.mapAsync(GPUMapMode.READ); const rotations = Array.from(new Float32Array(rotationReadback.getMappedRange())); rotationReadback.unmap();
    const point = (index, local) => rotate(local, rotations.slice(index*4,index*4+4)).map((v,i)=>v+values[index*4+i]);
    const gaps = descriptor.joints.map(j=>Math.hypot(...point(j.a,j.anchorA).map((v,i)=>v-point(j.b,j.anchorB)[i])));
    const ys = descriptor.bodies.flatMap((body,i)=>body.mass>0?[values[i*4+1]]:[]);
    const validation = await device.popErrorScope(); if (validation) errors.push(validation.message);
    return { status: "passed", bodyCount: bodyBindings.length, gaps, ys, errors };
  } finally { await device.queue.onSubmittedWorkDone(); runtime.dispose(); position.destroy(); orientation.destroy(); staging.destroy(); rotationReadback.destroy(); device.destroy(); }
}
void run().then((result) => { document.querySelector("#result")!.textContent = JSON.stringify(result); }).catch((error) => { document.querySelector("#result")!.textContent = JSON.stringify({ status: "failed", error: String(error) }); });
