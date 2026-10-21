import { rigidPlaybackBackend } from "/src/three/physics/rigid-playback-backend";
import { createPhysicsPlaybackController } from "/src/three/physics/playback-controller";
import { createGameSession } from "/src/gameplay/runtime/game-session";
import { createEntityWorld } from "/src/world/runtime/entity-world";
import { defaultColliderForObject, defaultRigidbodyForObject } from "/src/physics/authoring/component-defaults";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "/src/physics/domain/world-settings";
import { makeObject } from "/src/lib/payload";

async function run() {
  const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("WebGPU unavailable");
  const device = await adapter.requestDevice(), errors: string[] = [];
  device.addEventListener("uncapturederror", (event) => errors.push(event.error.message));
  device.pushErrorScope("validation");
  const factory = await rigidPlaybackBackend.prepare(device);
  const box = (id: string, x: number) => {
    const object = makeObject("cube", 0, { id, position: [x, 0, 0] });
    object.colliders = [defaultColliderForObject(object)]; return object;
  };
  const dynamic = box("dynamic", 0), kinematic = box("kinematic", 10);
  dynamic.rigidbody = { ...defaultRigidbodyForObject(dynamic), useGravity: false, massMode: "manual", mass: 1 };
  kinematic.rigidbody = { ...defaultRigidbodyForObject(kinematic), bodyType: "kinematic", useGravity: false };
  const objects = [dynamic, kinematic];
  if (new URLSearchParams(location.search).has("large")) for (let i = 0; i < 65; i++) objects.push(box(`padding-${i}`, 100 + i * 3));
  const runs = [];
  try {
    for (const cadence of [30, 144]) {
      const bytes = objects.length * 16;
      const position = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
      const orientation = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST });
      const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const renderer = { backend: { device, isWebGPUBackend: true,
        get: (attribute: { name: string }) => ({ buffer: attribute.name.endsWith("position") ? position : orientation }),
      } };
      let admitted: (() => void) | null = null, tickCount = 0, ready = false;
      let dynamicIndex = 0, kinematicIndex = 0;
      const trackedFactory = { createWorld(compiled) {
        const world = factory.createWorld(compiled);
        dynamicIndex = world.bodyBindings.findIndex((body) => body.objectId === "dynamic");
        kinematicIndex = world.bodyBindings.findIndex((body) => body.objectId === "kinematic");
        return world;
      } };
      const controller = createPhysicsPlaybackController({
        name: "timing-regression", dispose() { admitted = null; },
        request(_opportunity, submit) {
          // Delayed admission simulates device backpressure without GPU readback.
          admitted = () => {
            let retire!: (status: "completed") => void;
            const retirement = new Promise<"completed">((resolve) => { retire = resolve; });
            submit(renderer, { retirement });
            void device.queue.onSubmittedWorkDone().then(() => retire("completed"));
          };
          return "queued";
        },
      }, () => undefined, { id: "impulse", prepare: async () => trackedFactory });
      const flush = () => { const next = admitted; admitted = null; next?.(); };
      const entities = createEntityWorld();
      const game = createGameSession({ version: 1, create: () => ({
        fixedUpdate(tick) {
          tickCount = tick.index;
          controller.queueBodyCommand("dynamic", { kind: "impulse", body: 0, linear: [tick.deltaSeconds, 0, 0] });
          controller.queueBodyCommand("kinematic", { kind: "kinematic-target", body: 0, position: [10 + tick.index * 0.05, 0, 0], orientation: [0, 0, 0, 1] });
        }, dispose() {},
      }) }, {
        beforeTick: entities.flush, report(diagnostic) { errors.push(diagnostic.message); },
        context: () => ({ entities: [], world: entities.port, camera: { setPose() {} }, characters: { move() { throw new Error("unused"); } }, input: {} }),
      });
      const detach = controller.attachFixedStepDriver({ ready: () => ready, beforeStep: game.fixedTick });
      let opportunity = 0;
      const schedule = (delta: number, mode: "playing" | "paused" = "playing", stepToken = 0) => controller.schedule({
        objects, renderer, worldSettings: DEFAULT_PHYSICS_WORLD_SETTINGS, mode, stepToken,
        frameDeltaSeconds: delta, opportunity: ++opportunity,
      });
      try {
        schedule(0); flush(); await Promise.resolve(); await Promise.resolve();
        schedule(0); flush();
        if (controller.diagnostics().status !== "running") throw new Error("Physics did not initialize");
        schedule(0.25); flush(); // Async gameplay startup must not accumulate time.
        const heldAtStartup = controller.diagnostics().submittedStepId;
        await game.start(); ready = true;
        for (let frame = 1; frame <= cadence * 2; frame++) {
          schedule(1 / cadence);
          if (frame % 2 === 0) flush();
        }
        flush();
        const playingTick = tickCount;
        schedule(1 / cadence); // Work is queued, then the transport pauses before admission.
        controller.refreshTransport({ objects, worldSettings: DEFAULT_PHYSICS_WORLD_SETTINGS, mode: "paused", stepToken: 0 });
        flush();
        const pausedTick = tickCount;
        schedule(0, "paused", 1); flush();
        const steppedTick = tickCount;
        const submittedTick = controller.diagnostics().submittedStepId;
        // Explicit test-only GPU readback; production command stepping never maps poses.
        const encoder = device.createCommandEncoder(); encoder.copyBufferToBuffer(position, 0, staging, 0, bytes); device.queue.submit([encoder.finish()]);
        await staging.mapAsync(GPUMapMode.READ);
        const values = Array.from(new Float32Array(staging.getMappedRange())); staging.unmap();
        runs.push({ cadence, heldAtStartup, playingTick, pausedTick, steppedTick, submittedTick,
          dynamicX: values[dynamicIndex * 4], kinematicX: values[kinematicIndex * 4] });
      } finally {
        game.dispose(); entities.dispose(); detach(); await device.queue.onSubmittedWorkDone(); controller.dispose();
        await Promise.resolve(); await Promise.resolve(); staging.destroy();
      }
    }
    const validation = await device.popErrorScope(); if (validation) errors.push(validation.message);
    return { status: "passed", runs, errors };
  } finally { await device.queue.onSubmittedWorkDone(); device.destroy(); }
}
void run().then((result) => { document.querySelector("#result")!.textContent = JSON.stringify(result); })
  .catch((error) => { document.querySelector("#result")!.textContent = JSON.stringify({ status: "failed", error: String(error) }); });
