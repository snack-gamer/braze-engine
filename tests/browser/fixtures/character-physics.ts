import { rigidPlaybackBackend } from "/src/three/physics/rigid-playback-backend";
import { compileAuthoredPhysicsScene } from "/src/physics/authoring/scene-compiler";
import { compileRigidWorld } from "/src/physics/authoring/rigid-world-compiler";
import { defaultColliderForObject, defaultRigidbodyForObject } from "/src/physics/authoring/component-defaults";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "/src/physics/domain/world-settings";
import { makeObject } from "/src/lib/payload";
import { createCharacterControllerPatch } from "/src/character-controller/application/character-controller-authoring";
import { createCharacterMotorWorld } from "/src/character-controller/runtime/character-motor-world";
import { applyKinematicMotorDelta, initialKinematicObjectPoses, indexKinematicBindings } from "/src/three/physics/kinematic-character-motor";

async function run() {
  const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("WebGPU unavailable");
  const device = await adapter.requestDevice(), errors: string[] = [];
  device.addEventListener("uncapturederror", (event) => errors.push(event.error.message));
  device.pushErrorScope("validation");
  const box = (id: string, position: [number, number, number], size: [number, number, number]) => {
    const object = makeObject("cube", 0, { id, position }); object.colliders = [{ ...defaultColliderForObject(object), size }]; return object;
  };
  const hero = makeObject("cube", 0, { id: "hero", position: [0, 0, 0] }); Object.assign(hero, createCharacterControllerPatch(hero));
  const pushed = box("pushed", [1, 0.5, 4], [0.6, 1, 0.6]); pushed.rigidbody = defaultRigidbodyForObject(pushed);
  const pusher = makeObject("cube", 0, { id: "pusher", position: [0, 0, 4] }); Object.assign(pusher, createCharacterControllerPatch(pusher));
  const objects = [hero, box("floor", [0, -0.5, 0], [40, 1, 40]), box("step", [1.5, 0.1, 0], [1, 0.2, 2]), box("wall", [4, 2, 0], [0.2, 4, 3]), pusher, pushed];
  if (new URLSearchParams(location.search).has("large")) for (let i = 0; i < 65; i++) objects.push(box(`padding-${i}`, [100 + i * 2, 0, 0], [1, 1, 1]));
  const compiled = compileAuthoredPhysicsScene(objects, "character", DEFAULT_PHYSICS_WORLD_SETTINGS);
  const factory = await rigidPlaybackBackend.prepare(device), { runtime, bodyBindings } = factory.createWorld(compiled);
  const characters = createCharacterMotorWorld(objects, compileRigidWorld(compiled));
  const state = { runtime, bodyBindings, bodyIndices: indexKinematicBindings(bodyBindings), objectPoses: initialKinematicObjectPoses(bodyBindings), constrain: characters.constrain };
  const bytes = bodyBindings.length * 16;
  const position = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
  const orientation = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST });
  const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const read = async () => {
    const encoder = device.createCommandEncoder(); encoder.copyBufferToBuffer(position, 0, staging, 0, bytes); device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ); const values = Array.from(new Float32Array(staging.getMappedRange())); staging.unmap();
    return (id: string) => values.slice(bodyBindings.findIndex((b) => b.objectId === id) * 4, bodyBindings.findIndex((b) => b.objectId === id) * 4 + 3);
  };
  try {
    runtime.setPoseTargets({ position, orientation });
    const move = (id: string, translation: [number, number, number]) => applyKinematicMotorDelta(state, id, { translation, rotation: [0, 0, 0, 1] }, () => undefined);
    move("hero", [1.5, 0, 0]); runtime.runRigidSolverBatch(1); const step = (await read())("hero");
    const stepped = characters.result("hero");
    move("hero", [5, 0, 0]); runtime.runRigidSolverBatch(1); const wall = (await read())("hero");
    for (let i = 0; i < 30; i++) { move("pusher", [0.04, 0, 0]); runtime.runRigidSolverBatch(1); }
    const push = (await read())("pushed");
    const validation = await device.popErrorScope(); if (validation) errors.push(validation.message);
    return { status: "passed", step, wall, stepped, push, errors };
  } finally { await device.queue.onSubmittedWorkDone(); runtime.dispose(); position.destroy(); orientation.destroy(); staging.destroy(); device.destroy(); }
}
void run().then((result) => { document.querySelector("#result")!.textContent = JSON.stringify(result); }).catch((error) => { document.querySelector("#result")!.textContent = JSON.stringify({ status: "failed", error: String(error) }); });
