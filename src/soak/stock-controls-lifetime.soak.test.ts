import { expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { createEntityWorld } from "../world/runtime/entity-world";
import { createEntityBehaviors } from "../behaviors/runtime/entity-behaviors";
import { resolveBehaviorValues } from "../behaviors/domain/behavior-registry";
import { STOCK_CHARACTER_CONTROL_REGISTRATIONS } from "../character-controller/adapters/stock-character-control-registrations";
import { createGameCharacterCommands } from "../character-controller/adapters/game-character-commands";
import { createGameCameraCommands } from "../camera/adapters/game-camera-commands";
import { createGameCameraSurface } from "../gameplay/adapters/game-camera-surface";
import { createStockControlInputMap } from "../input/domain/stock-control-input-map";
import { createActionInput } from "../input/runtime/action-input";
import type { GameInput } from "../input/domain/action-map";
import type { GameContext } from "../gameplay/domain/game-module";
import type { GameCameraLease } from "../camera/domain/game-camera";
import type { GameCharacterMovementLease } from "../character-controller/domain/game-character-commands";
import type { RootMotionPose } from "../character/runtime/root-motion";
import type { Runtime } from "../three/runtime";

it("reclaims 1,000 stock control attachments with exclusive writers, gesture release and fresh re-enable state", () => {
  let attachments = 0, gestures = 0, gestureCleanups = 0, cameraClaims = 0, cameraClears = 0;
  for (let run = 0; run < 20; run++) {
    const abort = new AbortController(), world = createEntityWorld({ authored: [{ id: "hero", name: "Hero" }] });
    const hero = world.port.findByAuthoredId("hero")!, diagnostics: unknown[] = [];
    const behaviors = createEntityBehaviors({ world: world.port, report: (value) => diagnostics.push(value) });
    let inTick = false, index = 0, activeGestures = 0;
    let pose: RootMotionPose & { grounded: boolean } = { position: [0, 0.72, 0], rotation: [0, 0, 0, 1], grounded: true };
    const commands = createGameCharacterCommands({ entities: world.port, authoredCharacters: new Set(["hero"]),
      signal: abort.signal, inFixedTick: () => inTick,
      physics: () => ({ snapshotCharacter: () => pose, snapshotRuntimeCharacter: () => undefined,
        moveRuntimeCharacter() { throw new Error("This soak has one captured authored motor."); },
        moveCharacter(_id, displacement, yawDegrees) {
          const position = [Math.min(2.53, pose.position[0] + displacement[0]), Math.max(0.72, pose.position[1] + displacement[1]), pose.position[2] + displacement[2]] as const;
          const halfYaw = (yawDegrees ?? 0) * Math.PI / 360;
          pose = { position, rotation: [0, Math.sin(halfYaw), 0, Math.cos(halfYaw)], grounded: position[1] === 0.72 };
          return { position, grounded: pose.grounded, scope: "static" };
        },
      }),
    });
    const cameraSurface = createGameCameraSurface(), camera = new PerspectiveCamera(50);
    camera.position.set(0, 4, 7);
    const view = { camera, controls: { target: new Vector3(0, 0.9, 0) }, disposed: false, framesSinceSceneChange: 0 } as Runtime;
    const detachView = cameraSurface.attach(view);
    const cameraPort = createGameCameraCommands({ signal: abort.signal, surface: {
      ...cameraSurface, clear() { cameraClears++; cameraSurface.clear(); },
    }, sweep: () => null });
    const actionInput = createActionInput(createStockControlInputMap());
    actionInput.rebind("lookRateX", [{ device: "keyboard", code: "KeyL" }]);
    const input: GameInput = { action: actionInput.action, bindings: actionInput.bindings, rebind: actionInput.rebind,
      async requestPointerLock() {}, releasePointerLock() {}, pointerLockStatus: () => ({ status: "unlocked" }),
      capturePointerLock(enabled) {
        if (!enabled) throw new Error("Stock capture requests must enable a gesture owner.");
        gestures++; activeGestures++;
        let released = false;
        return () => { if (!released) { released = true; activeGestures--; gestureCleanups++; } };
      },
    };
    let movementLease!: GameCharacterMovementLease, cameraLease!: GameCameraLease;
    const context = { signal: abort.signal, world: world.port, behaviors: behaviors.port, input,
      characters: { ...commands.port, acquire(target, label) { movementLease = commands.port.acquire(target, label); return movementLease; } },
      camera: { ...cameraPort, acquire(label) { cameraClaims++; cameraLease = cameraPort.acquire(label); return cameraLease; } },
    } as GameContext;
    const tick = () => {
      const value = { index: ++index, deltaSeconds: 1 / 60, elapsedSeconds: index / 60 };
      inTick = true;
      try { commands.beginTick(); actionInput.advance(); behaviors.beginTick(value); behaviors.fixedUpdate(value); }
      finally { inTick = false; }
    };
    for (let cycle = 0; cycle < 50; cycle++) {
      pose = { position: [0, 0.72, 0], rotation: [0, 0, 0, 1], grounded: true };
      actionInput.reset();
      const style = (run * 50 + cycle) % 3, registration = STOCK_CHARACTER_CONTROL_REGISTRATIONS[style];
      const values = resolveBehaviorValues(registration, { speed: 3, sharpness: 0 });
      const attachment = behaviors.port.attach(hero, { name: "stock", create(scope) {
        return registration.create({ ...scope, resolveEntity: () => undefined }, values, context);
      } });
      attachments++; tick();
      expect(attachment.read()).toMatchObject({ status: "active", started: true });
      expect(behaviors.port.stats()).toMatchObject({ attached: 1, pending: 0, enabled: 1 });
      expect(commands.port.snapshot(hero)!.position).toEqual([0, 0.72, 0]);
      expect(cameraPort.snapshot()?.fov).toBe(60);
      expect(activeGestures).toBe(style === 2 ? 0 : 1);
      expect(() => commands.port.acquire(hero, "competing motor")).toThrow(/owned/);
      expect(() => cameraPort.acquire("competing camera")).toThrow(/owned/);
      const oldMovement = movementLease, oldCamera = cameraLease;
      actionInput.pointer(100, 0); actionInput.key("KeyW", true); tick();
      expect(commands.port.snapshot(hero)!.position[0]).toBeGreaterThan(0);
      expect(commands.port.snapshot(hero)!.position[2]).toBeGreaterThan(0);
      expect(commands.port.snapshot(hero)!.yawDegrees).toBeCloseTo(12, 8);
      actionInput.key("Space", true); actionInput.key("Space", false); tick();
      const airborneY = commands.port.snapshot(hero)!.position[1]; expect(airborneY).toBeGreaterThan(0.72);
      attachment.setEnabled(false); tick();
      expect(attachment.read().status).toBe("disabled"); expect(activeGestures).toBe(0);
      expect(cameraPort.snapshot()).toBeNull(); expect(camera.position.toArray()).toEqual([0, 4, 7]); expect(camera.fov).toBe(50);
      expect(() => oldMovement.snapshot()).toThrow(/ended/); expect(() => oldCamera.snapshot()).toThrow(/released/);
      const replacement = commands.port.acquire(hero, "temporary replacement"); replacement.release(); replacement.release();
      const replacementCamera = cameraPort.acquire("temporary replacement"); replacementCamera.release();
      attachment.setEnabled(true); tick();
      expect(attachment.read().status).toBe("active");
      expect(commands.port.snapshot(hero)!.position[1]).toBeLessThan(airborneY);
      expect(movementLease).not.toBe(oldMovement); expect(cameraLease).not.toBe(oldCamera);
      oldMovement.release(); oldCamera.release();
      expect(() => commands.port.acquire(hero, "competing after old release")).toThrow(/owned/);
      expect(cameraPort.snapshot()).not.toBeNull();
      attachment.detach(); tick();
      expect(attachment.read()).toMatchObject({ status: "disposed", reason: "detached" });
      expect(behaviors.port.stats()).toMatchObject({ attached: 0, pending: 0, enabled: 0 });
      expect(activeGestures).toBe(0); expect(cameraPort.snapshot()).toBeNull();
      expect(() => movementLease.snapshot()).toThrow(/ended/);
      const free = commands.port.acquire(hero, "next controller"); free.release();
    }
    expect(diagnostics).toEqual([]);
    abort.abort(); behaviors.dispose(); world.dispose(); cameraSurface.dispose(); detachView();
    expect(behaviors.port.stats()).toMatchObject({ attached: 0, pending: 0, enabled: 0, ended: true });
    expect(world.port.stats()).toMatchObject({ runtime: 0, ended: true });
    expect(() => movementLease.snapshot()).toThrow(/ended/);
  }
  expect(attachments).toBe(1_000); expect(gestures).toBe(gestureCleanups);
  expect(cameraClaims).toBe(2_000); expect(cameraClears).toBe(3_000);
});
