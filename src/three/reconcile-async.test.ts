import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { Material, SceneObject } from "../types";
import type { AssetCache, LoadedAsset } from "./assets";
import { disposeObject } from "./dispose";
import {
  createNode,
  findBody,
  invalidateNodeAssetLoad,
  syncNode,
} from "./reconcile";
import type { Runtime } from "./runtime";

const stubLoads = new WeakMap<AssetCache, Map<string, Promise<LoadedAsset>>>();
const stubReleases = new WeakMap<AssetCache, Map<string, ReturnType<typeof vi.fn>>>();

function stubAssetCache(): AssetCache {
  const loads = new Map<string, Promise<LoadedAsset>>();
  const releases = new Map<string, ReturnType<typeof vi.fn>>();
  const cache: AssetCache = {
    acquire: (assetUrl) => {
      const value = loads.get(assetUrl);
      if (!value) throw new Error(`Missing stub asset load: ${assetUrl}`);
      const release = vi.fn();
      releases.set(assetUrl, release);
      return { value, release };
    },
    dispose: vi.fn(),
  };
  stubLoads.set(cache, loads);
  stubReleases.set(cache, releases);
  return cache;
}

function setAssetLoad(runtime: Runtime, assetUrl: string, promise: Promise<LoadedAsset>): void {
  stubLoads.get(runtime.assetCache)?.set(assetUrl, promise);
}

function assetRelease(runtime: Runtime, assetUrl: string): ReturnType<typeof vi.fn> | undefined {
  return stubReleases.get(runtime.assetCache)?.get(assetUrl);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function assetObject(id: string, assetUrl: string): SceneObject {
  return {
    id,
    name: id,
    primitive: "gltf",
    assetUrl,
    color: "#ffffff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

function material(id: string, roughness: number): Material {
  return {
    id,
    name: id,
    color: "#ffffff",
    roughness,
    metalness: 0,
    specularIntensity: 1,
    clearcoat: 0,
    clearcoatRoughness: 0,
    ior: 1.5,
    transmission: 0,
    emissive: "#000000",
    emissiveIntensity: 0,
    opacity: 1,
    normalScale: 1,
    bumpScale: 1,
    aoIntensity: 1,
    alphaCutoff: 0,
    envMapIntensity: 1,
    thickness: 0,
    sheen: 0,
    sheenRoughness: 0,
    sheenColor: "#ffffff",
    side: "front",
    wireframe: false,
  };
}

function runtimeFor(object: SceneObject, node: THREE.Group): Runtime {
  const objectRoot = new THREE.Group();
  objectRoot.add(node);
  return {
    objectRoot,
    objectMap: new Map([[object.id, node]]),
    assetCache: stubAssetCache(),
    motionMixers: new Map(),
    editorPosePreviewObjectIds: new Set(),
    pendingAssetLoads: new Set(),
    failedAssetLoads: new Map(),
    environmentReady: true,
    framesSinceSceneChange: 3,
    lastRenderStatusKey: "",
    onRenderStatusChange: vi.fn(),
    clonersDirty: false,
    labelsDirty: false,
  } as unknown as Runtime;
}

function beginLoad(
  runtime: Runtime,
  node: THREE.Group,
  object: SceneObject,
  onAnimations = vi.fn(),
) {
  syncNode(runtime, node, object, true, null, [], undefined, onAnimations);
  return onAnimations;
}

function removeNode(runtime: Runtime, node: THREE.Group, objectId: string): void {
  invalidateNodeAssetLoad(runtime, node);
  runtime.objectRoot.remove(node);
  disposeObject(node);
  runtime.objectMap.delete(objectId);
}

describe("async scene asset reconciliation", () => {
  it("does not clone, attach, or publish animations after the owning node is removed", async () => {
    const object = assetObject("removed-model", "/tests/removed-model.glb");
    const node = createNode(object);
    const runtime = runtimeFor(object, node);
    const load = deferred<LoadedAsset>();
    setAssetLoad(runtime, object.assetUrl!, load.promise);
    const onAnimations = beginLoad(runtime, node, object);
    const loadingBody = findBody(node);
    const source = new THREE.Group();
    const clone = vi.spyOn(source, "clone");

    expect(runtime.pendingAssetLoads.size).toBe(1);
    removeNode(runtime, node, object.id);
    expect(runtime.pendingAssetLoads.size).toBe(0);
    expect(assetRelease(runtime, object.assetUrl!)).toHaveBeenCalledOnce();

    load.resolve({
      object: source,
      animations: [new THREE.AnimationClip("Idle", 1, [])],
    });
    await load.promise;
    await Promise.resolve();

    expect(clone).not.toHaveBeenCalled();
    expect(findBody(node)).toBe(loadingBody);
    expect(onAnimations).not.toHaveBeenCalled();
    expect(runtime.failedAssetLoads.size).toBe(0);
  });

  it("disposes clone-owned materials without freeing leased source geometry when ownership changes", async () => {
    const object = assetObject("disposed-model", "/tests/disposed-model.glb");
    const node = createNode(object);
    const runtime = runtimeFor(object, node);
    const load = deferred<LoadedAsset>();
    setAssetLoad(runtime, object.assetUrl!, load.promise);
    const onAnimations = beginLoad(runtime, node, object);
    const loadingBody = findBody(node);

    const sourceGeometry = new THREE.BoxGeometry(1, 1, 1);
    const sourceMaterial = new THREE.MeshStandardMaterial();
    const disposedMaterial = new THREE.MeshStandardMaterial();
    const geometryDispose = vi.spyOn(sourceGeometry, "dispose");
    const materialDispose = vi.spyOn(disposedMaterial, "dispose");
    vi.spyOn(sourceMaterial, "clone").mockReturnValue(disposedMaterial);

    const source = new THREE.Group();
    source.add(new THREE.Mesh(sourceGeometry, sourceMaterial));
    const originalClone = source.clone.bind(source);
    let producedClone: THREE.Group | null = null;
    vi.spyOn(source, "clone").mockImplementation((recursive = true) => {
      producedClone = originalClone(recursive);
      removeNode(runtime, node, object.id);
      return producedClone;
    });

    load.resolve({
      object: source,
      animations: [new THREE.AnimationClip("Run", 1, [])],
    });
    await load.promise;
    await Promise.resolve();

    expect(producedClone).not.toBeNull();
    expect(producedClone!.parent).toBeNull();
    const producedMesh = producedClone!.children[0] as THREE.Mesh;
    expect(producedMesh.geometry).toBe(sourceGeometry);
    expect(producedMesh.userData.sharedGeometry).toBe(true);
    expect(findBody(node)).toBe(loadingBody);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(onAnimations).not.toHaveBeenCalled();
    expect(runtime.pendingAssetLoads.size).toBe(0);
  });

  it("keeps a newer replacement load pending when an older load resolves", async () => {
    const first = assetObject("replaced-model", "/tests/replaced-model-a.glb");
    const second = { ...first, assetUrl: "/tests/replaced-model-b.glb" };
    const node = createNode(first);
    const runtime = runtimeFor(first, node);
    const firstLoad = deferred<LoadedAsset>();
    const secondLoad = deferred<LoadedAsset>();
    setAssetLoad(runtime, first.assetUrl!, firstLoad.promise);
    setAssetLoad(runtime, second.assetUrl!, secondLoad.promise);
    const onAnimations = vi.fn();

    beginLoad(runtime, node, first, onAnimations);
    beginLoad(runtime, node, second, onAnimations);
    const firstSource = new THREE.Group();
    const firstClone = vi.spyOn(firstSource, "clone");
    firstLoad.resolve({
      object: firstSource,
      animations: [new THREE.AnimationClip("Old", 1, [])],
    });
    await firstLoad.promise;
    await Promise.resolve();

    expect(firstClone).not.toHaveBeenCalled();
    expect(runtime.pendingAssetLoads).toEqual(new Set([`${second.id}:gltf:${second.assetUrl}`]));
    expect(onAnimations).not.toHaveBeenCalled();

    const secondSource = new THREE.Group();
    secondLoad.resolve({
      object: secondSource,
      animations: [new THREE.AnimationClip("Current", 1, [])],
    });
    await secondLoad.promise;
    await Promise.resolve();

    expect(runtime.pendingAssetLoads.size).toBe(0);
    expect(findBody(node)).not.toBe(secondSource);
    expect(findBody(node)?.userData.animationClipInfos?.[0]?.name).toBe("Current");
    expect(onAnimations).toHaveBeenCalledOnce();
    expect(onAnimations).toHaveBeenCalledWith(second.id, [
      expect.objectContaining({ name: "Current", sourceUrl: second.assetUrl }),
    ]);
  });

  it("applies the latest material state when a deferred asset load completes", async () => {
    const initialMaterial = material("surface", 0.9);
    const latestMaterial = { ...initialMaterial, roughness: 0.15 };
    const object = { ...assetObject("material-model", "/tests/material-model.glb"), materialId: "surface" };
    const node = createNode(object);
    const runtime = runtimeFor(object, node);
    const load = deferred<LoadedAsset>();
    setAssetLoad(runtime, object.assetUrl!, load.promise);

    syncNode(runtime, node, object, true, initialMaterial, [initialMaterial]);
    syncNode(runtime, node, object, true, latestMaterial, [latestMaterial]);
    const sourceMaterial = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(), sourceMaterial));
    load.resolve({ object: source, animations: [] });
    await load.promise;
    await Promise.resolve();

    const body = findBody(node)!;
    const mesh = body.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
    expect(mesh.material.roughness).toBe(0.15);
    expect(assetRelease(runtime, object.assetUrl!)).not.toHaveBeenCalled();
    expect(runtime.pendingAssetLoads.size).toBe(0);
  });

  it("preserves a dynamic runtime transform when a deferred load finishes in Play mode", async () => {
    const object = {
      ...assetObject("dynamic-model", "/tests/dynamic-model.glb"),
      rigidbody: {
        enabled: true,
        bodyType: "dynamic" as const,
        massMode: "automatic" as const,
        mass: 1,
        density: 1,
        useGravity: true,
        linearDamping: 0,
        angularDamping: 0,
        interpolation: "none" as const,
      },
    };
    const node = createNode(object);
    const runtime = runtimeFor(object, node);
    runtime.scenePlaybackMode = "edit";
    const load = deferred<LoadedAsset>();
    setAssetLoad(runtime, object.assetUrl!, load.promise);
    beginLoad(runtime, node, object);
    runtime.scenePlaybackMode = "playing";
    node.position.set(99, 12, -4);

    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    load.resolve({ object: source, animations: [] });
    await load.promise;
    await Promise.resolve();

    expect(node.position.toArray()).toEqual([99, 12, -4]);
    expect(runtime.pendingAssetLoads.size).toBe(0);
  });
});
