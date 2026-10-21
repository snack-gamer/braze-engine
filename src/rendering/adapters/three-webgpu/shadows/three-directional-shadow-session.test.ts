import * as THREE from "three";
import { Node as ThreeNode, NodeUpdateType, TSL } from "three/webgpu";
import { describe, expect, it, vi } from "vitest";
import {
  createThreeDirectionalShadowSession,
} from "./three-directional-shadow-session";
import {
  THREE_DYNAMIC_SHADOW_CASTER_MASK,
  THREE_STATIC_SHADOW_CASTER_MASK,
} from "./three-shadow-caster-layers";
import type { ThreeCsmPublicSurface } from "./three-csm-public-binding";

type FakeCsm = ThreeCsmPublicSurface & ThreeNode & { dispose: () => void };

describe("Three directional shadow session", () => {
  it("retires caster materials once per cold batch while preserving initialized cascade depths", () => {
    const csm = fakeCsm(), light = new THREE.DirectionalLight(), camera = new THREE.PerspectiveCamera();
    const cascades = [new THREE.DirectionalLight(), new THREE.DirectionalLight(), new THREE.DirectionalLight()];
    csm.camera = camera; csm.lights = cascades;
    const session = createThreeDirectionalShadowSession({ renderer: fakeRenderer(), light, createCsm: () => csm });
    session.prepareFrame(camera); session.afterRender();
    const materials = [light, ...cascades].map((caster) => TSL.getShadowMaterial(caster));
    const disposal = materials.map((material) => vi.spyOn(material, "dispose"));
    const shadows = cascades.map((caster) => caster.shadow);
    const receiverNode = (light.shadow as unknown as { shadowNode: ThreeNode }).shadowNode;
    shadows.forEach((shadow) => { shadow.needsUpdate = false; });

    session.invalidateCasterMaterials(); session.invalidateCasterMaterials();
    disposal.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    expect(csm.dispose).not.toHaveBeenCalled();
    expect(cascades.map((caster) => caster.shadow)).toEqual(shadows);
    expect((light.shadow as unknown as { shadowNode: ThreeNode }).shadowNode).toBe(receiverNode);
    session.prepareFrame(camera);
    expect(shadows.every((shadow) => shadow.needsUpdate)).toBe(true);
    const replacement = cascades.map((caster) => TSL.getShadowMaterial(caster));
    replacement.forEach((material, index) => expect(material).not.toBe(materials[index + 1]));
    const replacementDisposal = replacement.map((material) => vi.spyOn(material, "dispose"));
    session.dispose(); session.dispose();
    replacementDisposal.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });

  it("carries the initial plan across Three's lazy CSM initialization", () => {
    const csm = fakeCsm();
    const light = new THREE.DirectionalLight();
    const renderer = fakeRenderer();
    const onInitialized = vi.fn();
    const session = createThreeDirectionalShadowSession({
      renderer,
      light,
      createCsm: () => csm,
      onInitialized,
    });
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 150);

    expect(csm.updateBeforeType).toBe(NodeUpdateType.NONE);

    session.prepareFrame(camera);
    expect(onInitialized).not.toHaveBeenCalled();
    expect(session.hasPendingRender()).toBe(true);
    expect(light.shadow.mapSize.toArray()).toEqual([512, 512]);
    expect(light.shadow.camera.layers.mask).toBe(
      THREE_STATIC_SHADOW_CASTER_MASK | THREE_DYNAMIC_SHADOW_CASTER_MASK,
    );

    const shadows = initialize(csm, camera);
    session.afterRender();
    expect(onInitialized).toHaveBeenCalledTimes(1);

    expect(shadows.map(({ mapSize }) => mapSize.width)).toEqual([2048, 1024, 512]);
    expect(shadows.map(({ camera: shadowCamera }) => shadowCamera.layers.mask)).toEqual([
      THREE_STATIC_SHADOW_CASTER_MASK | THREE_DYNAMIC_SHADOW_CASTER_MASK,
      THREE_STATIC_SHADOW_CASTER_MASK | THREE_DYNAMIC_SHADOW_CASTER_MASK,
      THREE_STATIC_SHADOW_CASTER_MASK,
    ]);
    expect(shadows.every(({ needsUpdate }) => needsUpdate)).toBe(true);
    expect(session.hasPendingRender()).toBe(true);

    session.prepareFrame(camera);
    session.afterRender();
    expect(session.hasPendingRender()).toBe(false);
    expect(onInitialized).toHaveBeenCalledTimes(1);
    expect(csm.lights.every((cascade) => (
      (cascade as THREE.Object3D).userData.shadowInfrastructure === true
    ))).toBe(true);
  });

  it("updates near and mid for dynamic motion while preserving the far history", () => {
    const csm = fakeCsm();
    const light = new THREE.DirectionalLight();
    const onInitialized = vi.fn();
    const session = createThreeDirectionalShadowSession({
      renderer: fakeRenderer(),
      light,
      createCsm: () => csm,
      onInitialized,
    });
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 150);
    const shadows = initialize(csm, camera);
    session.prepareFrame(camera);
    expect(onInitialized).toHaveBeenCalledTimes(1);
    session.afterRender();
    shadows.forEach((shadow) => { shadow.needsUpdate = false; });
    session.afterRender();

    session.invalidateDynamicCasters();
    session.prepareFrame(camera);

    expect(shadows.map(({ needsUpdate }) => needsUpdate)).toEqual([true, true, false]);
    expect(session.hasPendingRender()).toBe(true);
    session.afterRender();
    expect(session.hasPendingRender()).toBe(false);
    expect(onInitialized).toHaveBeenCalledTimes(1);
  });

  it("refreshes a cascade whenever Three moves its public snapped light camera", () => {
    const csm = fakeCsm();
    const light = new THREE.DirectionalLight();
    const session = createThreeDirectionalShadowSession({
      renderer: fakeRenderer(),
      light,
      createCsm: () => csm,
    });
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 150);
    const shadows = initialize(csm, camera);
    let offset = 0;
    csm.updateBefore = vi.fn(() => {
      offset += 0.01;
      (csm.lights[1] as THREE.Object3D).position.x = offset;
      return undefined;
    });
    session.prepareFrame(camera);
    session.afterRender();
    session.prepareFrame(camera);
    session.afterRender();
    shadows.forEach((shadow) => { shadow.needsUpdate = false; });

    camera.position.x += 0.001;
    session.prepareFrame(camera);

    expect(shadows[1].needsUpdate).toBe(true);
    expect(session.hasPendingRender()).toBe(true);
  });

  it("synchronizes cascade world and projection matrices before the shadow draw", () => {
    const csm = fakeCsm();
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 150);
    const cascades = Array.from({ length: 3 }, () => new THREE.DirectionalLight());
    csm.camera = camera;
    csm.lights = cascades;
    csm.updateBefore = vi.fn(() => {
      for (const light of cascades) {
        light.position.set(camera.position.x + 4, 20, 8);
        light.target.position.set(camera.position.x, 0, 0);
      }
      return undefined;
    });
    const session = createThreeDirectionalShadowSession({
      renderer: fakeRenderer(),
      light: new THREE.DirectionalLight(),
      createCsm: () => csm,
    });

    for (const x of [0, 12]) {
      camera.position.x = x;
      session.prepareFrame(camera);
      for (const light of cascades) {
        expect(new THREE.Vector3().setFromMatrixPosition(light.matrixWorld).toArray())
          .toEqual([x + 4, 20, 8]);
        expect(new THREE.Vector3().setFromMatrixPosition(light.target.matrixWorld).toArray())
          .toEqual([x, 0, 0]);
        expect(light.shadow.camera.position.toArray()).toEqual([x + 4, 20, 8]);
        expect(light.shadow.camera.coordinateSystem).toBe(THREE.WebGPUCoordinateSystem);
        expect(light.shadow.needsUpdate).toBe(true);
        light.shadow.needsUpdate = false;
      }
      session.afterRender();
    }
    session.dispose();
  });

  it("short-circuits thousands of unchanged frames before CSM command work", () => {
    const csm = fakeCsm();
    const light = new THREE.DirectionalLight();
    const session = createThreeDirectionalShadowSession({
      renderer: fakeRenderer(),
      light,
      createCsm: () => csm,
    });
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 150);
    const shadows = initialize(csm, camera);
    csm.updateBefore = vi.fn(() => undefined);
    const mapSizeWrites = shadows.map(({ mapSize }) => vi.spyOn(mapSize, "set"));

    session.prepareFrame(camera);
    session.afterRender();
    shadows.forEach((shadow) => { shadow.needsUpdate = false; });
    const splitCallback = csm.customSplitsCallback;
    const updateBeforeCalls = vi.mocked(csm.updateBefore).mock.calls.length;
    const frustumUpdates = vi.mocked(csm.updateFrustums).mock.calls.length;
    const mapSizeWriteCounts = mapSizeWrites.map(({ mock }) => mock.calls.length);

    for (let frame = 0; frame < 5_000; frame += 1) session.prepareFrame(camera);

    expect(csm.customSplitsCallback).toBe(splitCallback);
    expect(csm.updateBefore).toHaveBeenCalledTimes(updateBeforeCalls);
    expect(csm.updateFrustums).toHaveBeenCalledTimes(frustumUpdates);
    expect(mapSizeWrites.map(({ mock }) => mock.calls.length)).toEqual(mapSizeWriteCounts);
    expect(shadows.every(({ needsUpdate }) => !needsUpdate)).toBe(true);
    expect(session.hasPendingRender()).toBe(false);

    session.invalidateDynamicCasters();
    session.prepareFrame(camera);
    expect(csm.updateBefore).toHaveBeenCalledTimes(updateBeforeCalls + 1);
    expect(shadows.map(({ needsUpdate }) => needsUpdate)).toEqual([true, true, false]);
  });

  it("detaches and disposes the owned CSM node exactly once", () => {
    const csm = fakeCsm();
    const light = new THREE.DirectionalLight();
    const session = createThreeDirectionalShadowSession({
      renderer: fakeRenderer(),
      light,
      createCsm: () => csm,
    });
    const shadow = light.shadow as unknown as { shadowNode?: ThreeNode };
    expect(shadow.shadowNode).toBe(csm);

    session.dispose();
    session.dispose();

    expect(shadow.shadowNode).toBeUndefined();
    expect(csm.dispose).toHaveBeenCalledOnce();
    expect(session.hasPendingRender()).toBe(false);
  });
});

function fakeRenderer() {
  return {
    shadowMap: {
      enabled: false,
      type: THREE.PCFShadowMap,
    },
  };
}

function fakeCsm(): FakeCsm {
  return Object.assign(new ThreeNode(), {
    camera: null,
    customSplitsCallback: () => undefined,
    lights: [],
    maxFar: 1_000,
    mode: "practical" as const,
    updateFrustums: vi.fn(),
    dispose: vi.fn(() => undefined),
  });
}

function initialize(csm: FakeCsm, camera: THREE.PerspectiveCamera) {
  const shadows = [
    new THREE.DirectionalLight().shadow,
    new THREE.DirectionalLight().shadow,
    new THREE.DirectionalLight().shadow,
  ];
  csm.camera = camera;
  csm.lights = shadows.map((shadow) => Object.assign(new THREE.Object3D(), { shadow }));
  return shadows;
}
