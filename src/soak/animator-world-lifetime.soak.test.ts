import * as THREE from "three";
import { expect, it } from "vitest";
import { createDefaultAnimatorComponent } from "../character/domain/animator-component";
import { createAnimatorState } from "../character/domain/animator-controller";
import { createAnimatorIkGoalStore } from "../character/application/playback/animator-playback-ik";
import { createAnimatorRootMotionStore } from "../character/application/playback/animator-root-motion-port";
import { ThreeAnimatorWorldCoordinator } from "../character/adapters/three/three-animator-world-coordinator";
import { characterRuntimeSuccess } from "../character/runtime/diagnostics";
import type { SceneObject } from "../scene/domain/scene-object";
import type { Runtime } from "../three/runtime";

it("releases 1,000 world rigs through destroy, view replacement and Stop without retaining old sessions", async () => {
  let loaded = 0, released = 0;
  for (let cycle = 0; cycle < 250; cycle++) {
    const animator = createDefaultAnimatorComponent();
    animator.cullingMode = "alwaysAnimate";
    animator.controller!.layers[0]!.states = [createAnimatorState("idle", "Idle")];
    animator.controller!.layers[0]!.defaultStateId = "idle";
    const objects: SceneObject[] = Array.from({ length: 4 }, (_, index) => ({ id: `character-${index}`, name: "Character", primitive: "gltf", color: "#fff", visible: true, locked: false,
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], animator }));
    const ik = createAnimatorIkGoalStore(), motion = createAnimatorRootMotionStore();
    const world = new ThreeAnimatorWorldCoordinator({ objects, catalog: { library: { version: 1, animatorControllers: [], avatarMasks: [], extensions: {} }, importedAssets: [] },
      fixedStepSeconds: 1 / 60, ikStore: ik, rootMotionStore: motion, onEvent() {}, onChange() {}, onDiagnostics() {}, wake() {}, physicsMotorFor: () => undefined,
      assets: { async load() {
        loaded++; const node = new THREE.Group(), body = new THREE.Group(); node.add(body);
        let disposed = false;
        return characterRuntimeSuccess({ node, body, assets: { controller: animator.controller!, clips: [], masks: [] }, dispose() { if (!disposed) { disposed = true; released++; } } });
      }, dispose() {} },
    });
    await Promise.resolve(); await Promise.resolve();
    expect(world.liveSessionCount()).toBe(4);
    const view = () => ({ disposed: false, camera: new THREE.PerspectiveCamera(), objectMap: new Map(objects.map((object) => {
      const node = new THREE.Group(); node.userData.sceneObjectNode = true; node.userData.bodyKind = "asset"; node.add(new THREE.Group()); return [object.id, node];
    })), requestFrame() {} } as unknown as Runtime);
    const detach = world.attachView(view()); world.advance({ deltaSeconds: 0.1 }); detach();
    const state = world.runtimeState("character-1"); world.attachView(view());
    expect(world.runtimeState("character-1")).toBe(state);
    world.remove("character-0"); expect(world.liveSessionCount()).toBe(3);
    world.dispose(); world.dispose(); ik.dispose(); motion.dispose();
    expect(world.liveSessionCount()).toBe(0); expect(world.pendingCount()).toBe(0); expect(released).toBe(loaded);
  }
  expect(loaded).toBe(1_000);
});
