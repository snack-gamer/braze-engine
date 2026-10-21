import * as THREE from "three";
import { expect, it, vi } from "vitest";
import type { SceneObject } from "../scene/domain/scene-object";
import type { Runtime } from "../three/runtime";
import type { EntityHandle } from "../world/domain/entity-world";
import type { ThreeAnimatorWorldRig } from "../character/adapters/three/three-animator-world-assets";
import { ThreeAnimatorWorldCoordinator } from "../character/adapters/three/three-animator-world-coordinator";
import { createThreeAnimatorPoseBackend } from "../character/adapters/three/three-animator-pose-applier";
import { createAnimatorIkGoalStore } from "../character/application/playback/animator-playback-ik";
import { createAnimatorRootMotionStore } from "../character/application/playback/animator-root-motion-port";
import { animatorPreviewParameters } from "../character/application/playback/animator-preview-parameter-store";

const controllerGuid = "a".repeat(32), modelGuid = "b".repeat(32);
function descriptor(id: string): SceneObject {
  return { id, name: id, primitive: "gltf", color: "#fff", visible: true, locked: false,
    position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], assetRef: { guid: modelGuid, localId: "main" },
    animator: { version: 1, enabled: true, controllerRef: { guid: controllerGuid, localId: "main" }, updateMode: "normal", cullingMode: "alwaysAnimate", parameterOverrides: [],
      rootMotion: { mode: "disabled", source: "clip", translationAxes: { x: true, y: true, z: true }, rotation: "yaw", bakeIntoPose: false } } };
}
function retainedSource() {
  const source = new THREE.Group(), animated = new THREE.Object3D(); animated.name = "Animated"; source.add(animated);
  const clip = new THREE.AnimationClip("Move", 1, [new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 1, 0, 0])]);
  let created = 0, disposed = 0, rigDisposeCalls = 0, posesCreated = 0, posesDisposed = 0, poseDisposeCalls = 0;
  const prepare = (): ThreeAnimatorWorldRig => {
    const body = source.clone(true), node = new THREE.Group(); node.add(body); created++;
    let ended = false;
    return { body, node, dispose() { rigDisposeCalls++; expect(ended).toBe(false); ended = true; disposed++; node.clear(); }, assets: {
      controller: { version: 1, id: controllerGuid, name: "Soak", revision: "r1", parameters: [{ id: "speed", name: "Speed", kind: "float", defaultValue: 0 }], layers: [{
        id: "base", name: "Base", weight: 1, blendingMode: "override", ikPass: false, defaultStateId: "idle", anyStateTransitions: [], states: [{
          id: "idle", name: "Idle", speed: 1, cycleOffset: 0, mirror: false, footIk: false, writeDefaults: true, transitions: [], events: [],
          motion: { kind: "clip", clipRef: { guid: modelGuid, localId: "clip:move" }, speed: 1 },
        }],
      }] }, masks: [], clips: [{ id: `${modelGuid}:clip:move`, resource: { bindings: [{ root: body, clip }] },
        metadata: { durationSeconds: 1, looping: true, events: [{ id: "beat", name: "Beat", timeSeconds: 0.1, payload: {} }] } }],
    } };
  };
  const backend: typeof createThreeAnimatorPoseBackend = (...args) => {
    const result = createThreeAnimatorPoseBackend(...args);
    if (result.value) {
      posesCreated++; const dispose = result.value.pose.dispose; let ended = false;
      result.value.pose.dispose = () => { poseDisposeCalls++; expect(ended).toBe(false); ended = true; posesDisposed++; dispose(); };
    }
    return result;
  };
  const target = () => {
    const body = source.clone(true), node = new THREE.Group(); node.add(body);
    const runtime = { disposed: false, objectMap: new Map(), requestFrame: vi.fn(), framesSinceSceneChange: 0 } as unknown as Runtime;
    return { runtime, node, body, animated: body.children[0]! };
  };
  return { source, prepare, backend, target, stats: () => ({ created, disposed, rigDisposeCalls, posesCreated, posesDisposed, poseDisposeCalls }) };
}

it("repeats 1,000 pooled Animator lifetimes with fresh state, bounded retained ownership and clockless late views", () => {
  for (let run = 0; run < 20; run++) {
    const shared = retainedSource(), events = vi.fn(), sources = { load: vi.fn(), dispose: vi.fn() }, world = Symbol("soak-world");
    const coordinator = new ThreeAnimatorWorldCoordinator({ objects: [], catalog: { importedAssets: [], library: { version: 1, animatorControllers: [], avatarMasks: [], extensions: {} } },
      fixedStepSeconds: 1 / 60, ikStore: createAnimatorIkGoalStore(), rootMotionStore: createAnimatorRootMotionStore(),
      onEvent: events, onChange: vi.fn(), onDiagnostics: vi.fn(), wake: vi.fn(), physicsMotorFor: () => undefined, assets: sources, createPoseBackend: shared.backend,
    });
    let previous: EntityHandle | undefined;
    for (let cycle = 0; cycle < 50; cycle++) {
      const id = `runtime:${run}:${cycle}`, entity = { world, slot: 0, generation: cycle + 1 }, object = descriptor(id);
      animatorPreviewParameters.set(`${id}\u0000${controllerGuid}`, { speed: 99 });
      if (cycle % 7 === 0) {
        const abandoned = coordinator.prepareRuntimeChange([{ object, rig: shared.prepare(), entity }], []);
        expect(coordinator.reservedSessionCount()).toBe(1); abandoned.rollback();
        expect(coordinator.reservedSessionCount()).toBe(0); expect(coordinator.runtimeAnimatorId(entity)).toBeUndefined();
      }
      const change = coordinator.prepareRuntimeChange([{ object, rig: shared.prepare(), entity }], []), a = shared.target(), b = shared.target();
      const detachA = coordinator.attachRuntimeView(id, a.runtime, a.node, a.body), detachB = coordinator.attachRuntimeView(id, b.runtime, b.node, b.body);
      expect(coordinator.liveSessionCount()).toBe(0); expect(coordinator.runtimeAnimatorId(entity)).toBeUndefined();
      change.publish(); change.retire();
      expect(coordinator.liveSessionCount()).toBe(1); expect(coordinator.reservedSessionCount()).toBe(0);
      expect(coordinator.runtimeState(id)!.parameters.speed).toBe(0); expect(coordinator.runtimeState(id)!.layers[0]!.stateTimeSeconds).toBe(0);
      expect(coordinator.runtimeAnimatorId(entity)).toBe(id); if (previous) expect(coordinator.runtimeAnimatorId(previous)).toBeUndefined();
      coordinator.commands.setFloat(id, "speed", cycle + 1); coordinator.advance({ deltaSeconds: 0.15 });
      expect(events).toHaveBeenCalledTimes(cycle + 1); expect(a.animated.position.x).toBeCloseTo(0.15); expect(b.animated.position.x).toBeCloseTo(0.15);
      const late = shared.target(), detachLate = coordinator.attachRuntimeView(id, late.runtime, late.node, late.body);
      expect(late.animated.position.x).toBeCloseTo(0.15); expect(events).toHaveBeenCalledTimes(cycle + 1); detachLate();
      expect(late.animated.position.x).toBe(0);
      if (cycle % 10 === 0) {
        const snapshot = coordinator.runtimeState(id), reversible = coordinator.prepareRuntimeChange([], [id]); reversible.publish();
        expect(coordinator.runtimeAnimatorId(entity)).toBeUndefined(); reversible.rollback();
        expect(coordinator.runtimeState(id)).toBe(snapshot); expect(coordinator.runtimeState(id)!.parameters.speed).toBe(cycle + 1);
        expect(a.animated.position.x).toBeCloseTo(0.15);
      }
      const removal = coordinator.prepareRuntimeChange([], [id]); removal.publish();
      expect(coordinator.liveSessionCount()).toBe(0); expect(coordinator.runtimeState(id)).toBeNull(); expect(coordinator.runtimeEntity(id)).toBeUndefined();
      const beforeRetirement = shared.stats(); expect(beforeRetirement.created - beforeRetirement.disposed).toBe(1);
      coordinator.advance({ deltaSeconds: 1 }); expect(events).toHaveBeenCalledTimes(cycle + 1);
      removal.retire(); detachA(); detachB();
      expect(a.animated.position.x).toBe(0); expect(b.animated.position.x).toBe(0);
      const settled = shared.stats(); expect(settled.created).toBe(settled.disposed); expect(settled.created).toBe(settled.rigDisposeCalls);
      expect(settled.posesCreated).toBe(settled.posesDisposed); expect(settled.posesCreated).toBe(settled.poseDisposeCalls);
      expect(shared.source.children[0]!.position.x).toBe(0); expect(sources.load).not.toHaveBeenCalled(); previous = entity;
      animatorPreviewParameters.delete(`${id}\u0000${controllerGuid}`);
    }
    coordinator.dispose(); coordinator.dispose(); expect(sources.dispose).toHaveBeenCalledOnce();
    expect(coordinator.liveSessionCount()).toBe(0); expect(coordinator.reservedSessionCount()).toBe(0);
  }
});
