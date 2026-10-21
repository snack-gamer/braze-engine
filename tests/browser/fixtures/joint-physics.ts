import { rigidPlaybackBackend } from "/src/three/physics/rigid-playback-backend";
import { compileAuthoredPhysicsScene } from "/src/physics/authoring/scene-compiler";
import { defaultColliderForObject, defaultRigidbodyForObject } from "/src/physics/authoring/component-defaults";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "/src/physics/domain/world-settings";
import { defaultJoint } from "/src/physics/domain/joint";
import { makeObject } from "/src/lib/payload";
import { rotateCharacterVector } from "/src/character/runtime/pose-math";

async function run() {
  const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("WebGPU unavailable");
  const device = await adapter.requestDevice(), errors: string[] = [];
  device.addEventListener("uncapturederror", (event) => errors.push(event.error.message)); device.pushErrorScope("validation");
  const body = (id: string, position: [number, number, number]) => {
    const b = makeObject("cube", 0, { id, position }); b.colliders = [{ ...defaultColliderForObject(b), size: [0.4, 1.4, 0.4] }];
    b.rigidbody = { ...defaultRigidbodyForObject(b), massMode: "manual", mass: 1 }; return b;
  };
  const distance = body("distance", [-4, 2, 0]); distance.joint = { ...defaultJoint(), kind: "distance", connectedAnchor: [-4, 4, 0], restLength: 2 };
  const ball = body("ball", [0, 3, 0]); ball.joint = { ...defaultJoint(), anchor: [0, 1, 0] };
  const fixed = body("fixed", [4, 3, 0]); fixed.joint = { ...defaultJoint(), kind: "fixed" };
  const hinge = body("hinge", [8, 3, 0]); hinge.joint = { ...defaultJoint(), kind: "hinge", anchor: [0, 1, 0], axis: [0, 0, 1], limitsEnabled: true, minAngle: -30, maxAngle: 30 };
  const chain = [0, 1, 2].map((i) => {
    const b = body(`chain-${i}`, [-8, 6 - i * 1.5, 0]);
    b.joint = i === 0 ? { ...defaultJoint(), kind: "fixed" } : { ...defaultJoint(), connectedObjectId: `chain-${i - 1}`, anchor: [0, 0.7, 0], connectedAnchor: [0, -0.8, 0] }; return b;
  });
  const objects = [distance, ball, fixed, hinge, ...chain];
  if (new URLSearchParams(location.search).has("large")) for (let i = 0; i < 65; i++) {
    const padding = makeObject("cube", i, { id: `padding-${i}`, position: [100 + i * 2, 0, 0] }); padding.colliders = [defaultColliderForObject(padding)]; objects.push(padding);
  }
  const factory = await rigidPlaybackBackend.prepare(device);
  const { runtime, bodyBindings } = factory.createWorld(compileAuthoredPhysicsScene(objects, "joints", DEFAULT_PHYSICS_WORLD_SETTINGS));
  const bytes = bodyBindings.length * 16;
  const position = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
  const orientation = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
  const staging = device.createBuffer({ size: bytes * 2, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  try {
    runtime.setPoseTargets({ position, orientation });
    for (const id of ["distance", "ball", "fixed", "hinge", "chain-2"]) runtime.queueBodyCommand!({ kind: "velocity", body: bodyBindings.findIndex((b) => b.objectId === id), linear: [2, 0, 0], angular: id === "fixed" ? [4, 2, 3] : id === "hinge" ? [3, 2, 5] : [0, 0, 0] });
    for (let i = 0; i < 4; i++) runtime.runRigidSolverBatch(60);
    const encoder = device.createCommandEncoder(); encoder.copyBufferToBuffer(position, 0, staging, 0, bytes); encoder.copyBufferToBuffer(orientation, 0, staging, bytes, bytes); device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ); const values = Array.from(new Float32Array(staging.getMappedRange())); staging.unmap();
    const poses = Object.fromEntries(bodyBindings.flatMap((b, i) => b.objectId.startsWith("padding") ? [] : [[b.objectId, { position: values.slice(i * 4, i * 4 + 3), orientation: values.slice(bytes / 4 + i * 4, bytes / 4 + i * 4 + 4) }]]));
    const anchor = (id: string, local: [number, number, number]) => rotateCharacterVector(poses[id].orientation, local).map((v, i) => v + poses[id].position[i]);
    const gap = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
    const chainGaps = [1, 2].map((i) => gap(anchor(`chain-${i}`, [0, .7, 0]), anchor(`chain-${i - 1}`, [0, -.8, 0])));
    const validation = await device.popErrorScope(); if (validation) errors.push(validation.message);
    return { status: "passed", poses, distance: gap(poses.distance.position, [-4, 4, 0]), ballGap: gap(anchor("ball", [0, 1, 0]), [0, 4, 0]), hingeGap: gap(anchor("hinge", [0, 1, 0]), [8, 4, 0]), chainGaps, errors };
  } finally { await device.queue.onSubmittedWorkDone(); runtime.dispose(); position.destroy(); orientation.destroy(); staging.destroy(); device.destroy(); }
}
void run().then((result) => { document.querySelector("#result")!.textContent = JSON.stringify(result); }).catch((error) => { document.querySelector("#result")!.textContent = JSON.stringify({ status: "failed", error: String(error) }); });
