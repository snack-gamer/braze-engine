import { rigidPlaybackBackend } from "/src/three/physics/rigid-playback-backend";
import { compileAuthoredPhysicsScene } from "/src/physics/authoring/scene-compiler";
import { defaultColliderForObject, defaultRigidbodyForObject } from "/src/physics/authoring/component-defaults";
import { normalizePhysicsWorldSettings } from "/src/physics/domain/world-settings";
import type { PhysicsPlaybackFactory } from "/src/three/physics/playback-backend";
import type { SceneObject } from "/src/types";

export type PhysicsWebGpuFixtureResult = {
  status: "passed" | "failed" | "unsupported";
  validationErrors: string[];
  uncapturedErrors: string[];
  freeFall?: number[];
  settled?: number[];
  later?: number[];
  error?: string;
  scale?: { count: number; ticks: number; minimumHeight: number; maximumHeight: number; allFinite: boolean };
};
declare global { interface Window { __physicsWebGpuFixture?: PhysicsWebGpuFixtureResult } }

function object(id: string, position: [number, number, number], shape: "box" | "sphere" | "capsule", dynamic = true): SceneObject {
  const base: SceneObject = {
    id, name: id, primitive: "cube", color: "#fff", visible: true, locked: false,
    position, rotation: [0, 0, 0], scale: [1, 1, 1],
  };
  return { ...base,
    rigidbody: dynamic ? { ...defaultRigidbodyForObject(base), angularDamping: 0.1 } : undefined,
    colliders: [{ ...defaultColliderForObject(base), shape, size: [1, 1, 1], radius: 0.5 }],
  };
}

/** Readback exists only in this test fixture; production rendering stays GPU resident. */
async function simulate(device: GPUDevice, factory: PhysicsPlaybackFactory, objects: SceneObject[], gravity: [number, number, number], ticks: number, command?: (world: ReturnType<PhysicsPlaybackFactory["createWorld"]>) => void) {
  const compiled = compileAuthoredPhysicsScene(objects, "browser-impulse", normalizePhysicsWorldSettings({ gravity }));
  const { runtime, bodyBindings } = factory.createWorld(compiled);
  const bodyIndex = new Map(bodyBindings.map((binding, index) => [binding.objectId, index]));
  const bytes = objects.length * 16;
  const position = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
  const orientation = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST });
  const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const advance = async (count: number) => {
    for (let remaining = count; remaining > 0; remaining -= 60) runtime.runRigidSolverBatch(Math.min(60, remaining));
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(position, 0, staging, 0, bytes);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const result = Array.from(new Float32Array(staging.getMappedRange()));
    staging.unmap();
    return objects.flatMap((object) => result.slice(bodyIndex.get(object.id)! * 4, bodyIndex.get(object.id)! * 4 + 4));
  };
  try {
    runtime.setPoseTargets({ position, orientation });
    command?.({ runtime, bodyBindings });
    const first = await advance(ticks);
    const later = await advance(30);
    return { first, later };
  } finally {
    await device.queue.onSubmittedWorkDone();
    runtime.dispose(); position.destroy(); orientation.destroy(); staging.destroy();
  }
}

async function run(): Promise<PhysicsWebGpuFixtureResult> {
  const result: PhysicsWebGpuFixtureResult = { status: "unsupported", validationErrors: [], uncapturedErrors: [] };
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) return result;
  const device = await adapter.requestDevice();
  device.addEventListener("uncapturederror", (event) => result.uncapturedErrors.push(event.error.message));
  device.pushErrorScope("validation");
  try {
    const factory = await rigidPlaybackBackend.prepare(device);
    if (new URLSearchParams(location.search).has("overflow")) {
      await simulate(device, factory, Array.from({ length: 65 }, (_, i) => object(`overlap-${i}`, [0, 1, 0], "sphere")), [0, -10, 0], 1);
      throw new Error("Expected a contact-capacity diagnostic.");
    }
    if (new URLSearchParams(location.search).has("capsules")) {
      const floor = object("floor", [0, -0.5, 0], "box", false); floor.colliders![0].size = [40, 1, 40];
      const capsule = (id: string, x: number, y: number, axis: "x" | "y", dynamic = true) => {
        const body = object(id, [x, y, 0], "capsule", dynamic);
        body.colliders![0].axis = axis; body.colliders![0].length = 1; return body;
      };
      const padding = new URLSearchParams(location.search).has("large")
        ? Array.from({ length: 65 }, (_, i) => object(`padding-${i}`, [100 + i * 2, 0, 0], "box", false)) : [];
      const state = await simulate(device, factory, [floor,
        capsule("upright", 0, 3, "y"), capsule("horizontal", 3, 3, "x"),
        capsule("capsule-platform", -4, 0.5, "x", false), object("sphere-on-capsule", [-4, 3, 0], "sphere"),
        capsule("capsule-base", 7, 0.5, "x", false), capsule("capsule-on-capsule", 7, 3, "x"),
        ...padding], [0, -10, 0], 180);
      result.settled = state.first; result.later = state.later; result.status = "passed"; return result;
    }
    if (new URLSearchParams(location.search).has("commands")) {
      const dynamic = object("impulse", [0, 2, 0], "box");
      dynamic.rigidbody!.massMode = "manual"; dynamic.rigidbody!.mass = 2;
      const kinematic = object("kinematic", [0, 5, 0], "box"); kinematic.rigidbody!.bodyType = "kinematic";
      const padding = new URLSearchParams(location.search).has("large")
        ? Array.from({ length: 65 }, (_, i) => object(`padding-${i}`, [100 + i * 2, 0, 0], "box", false)) : [];
      const state = await simulate(device, factory, [dynamic, kinematic, ...padding], [0, 0, 0], 60, ({ runtime, bodyBindings }) => {
        const dynamicIndex = bodyBindings.findIndex((body) => body.objectId === "impulse");
        const kinematicIndex = bodyBindings.findIndex((body) => body.objectId === "kinematic");
        runtime.queueBodyCommand!({ kind: "impulse", body: dynamicIndex, linear: [4, 0, 0] });
        runtime.writeKinematicBodyPose(kinematicIndex, [1, 5, 0], [0, 0, 0, 1]);
      });
      result.settled = state.first; result.later = state.later; result.status = "passed"; return result;
    }
    if (new URLSearchParams(location.search).has("fast")) {
      const wall = object("wall", [0, 0, 0], "box", false); wall.colliders![0].size = [0.05, 20, 20];
      const sphere = object("projectile", [-3, 0, 0], "sphere");
      const padding = new URLSearchParams(location.search).has("large")
        ? Array.from({ length: 65 }, (_, i) => object(`padding-${i}`, [100 + i * 2, 0, 0], "box", false)) : [];
      const state = await simulate(device, factory, [wall, sphere, ...padding], [0, 0, 0], 5, ({ runtime, bodyBindings }) => {
        runtime.queueBodyCommand!({ kind: "velocity", body: bodyBindings.findIndex((body) => body.objectId === "projectile"), linear: [1000, 0, 0] });
      });
      result.settled = state.first; result.later = state.later; result.status = "passed"; return result;
    }
    const requestedCount = Number(new URLSearchParams(location.search).get("bodies"));
    if (requestedCount > 0) {
      const floor = object("floor", [0, -0.5, 0], "box", false);
      floor.colliders![0].size = [400, 1, 400];
      const bodies = Array.from({ length: requestedCount }, (_, i) => object(`sphere-${i}`, [(i % 100) * 1.5 - 75, 1.5, Math.floor(i / 100) * 1.5 - 75], "sphere"));
      const state = await simulate(device, factory, [floor, ...bodies], [0, -10, 0], 60);
      const heights = bodies.map((_, i) => state.later[(i + 1) * 4 + 1]);
      result.scale = { count: requestedCount, ticks: 90, minimumHeight: Math.min(...heights), maximumHeight: Math.max(...heights), allFinite: state.later.every(Number.isFinite) };
      result.status = "passed";
      return result;
    }
    const falling = object("fall", [0, 5, 0], "sphere");
    const floating = object("float", [10, 5, 0], "box");
    floating.rigidbody!.useGravity = false;
    const damped = object("damped", [20, 5, 0], "sphere");
    damped.rigidbody!.linearDamping = 10;
    result.freeFall = (await simulate(device, factory, [falling, floating, damped], [2, -10, 0], 30)).first;

    const floor = object("floor", [0, -0.5, 0], "box", false);
    floor.colliders![0].size = [30, 1, 30];
    const rotated = object("rotated", [4, 2, 0], "box");
    rotated.rotation = [10, 25, 10];
    const padding = new URLSearchParams(location.search).has("large")
      ? Array.from({ length: 65 }, (_, i) => object(`padding-${i}`, [100 + i * 2, 0, 0], "box", false)) : [];
    const contact = await simulate(device, factory, [floor,
      object("sphere", [-4, 2, 0], "sphere"),
      object("bottom", [0, 0.5, 0], "box"),
      object("middle", [0, 1.5, 0], "box"),
      object("top", [0, 2.5, 0], "box"), rotated, ...padding,
    ], [0, -10, 0], 240);
    result.settled = contact.first;
    result.later = contact.later;
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = String(error);
  } finally {
    const validation = await device.popErrorScope();
    if (validation) result.validationErrors.push(validation.message);
    device.destroy();
  }
  return result;
}

void run().then((result) => {
  window.__physicsWebGpuFixture = result;
  document.querySelector("#result")!.textContent = JSON.stringify(result, null, 2);
}).catch((error) => {
  window.__physicsWebGpuFixture = { status: "failed", error: String(error), validationErrors: [], uncapturedErrors: [] };
});
