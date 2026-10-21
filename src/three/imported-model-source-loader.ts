import type * as THREE from "three";
import type { PrimitiveKind } from "../types";
import {
  stampGltfSubAssetBindings,
  stampTraversalSubAssetBindings,
} from "./imported-subasset-bindings";

export type ImportedModelSource = Readonly<{
  object: THREE.Object3D;
  animations: THREE.AnimationClip[];
  stampSubAssetBindings: () => void;
}>;

type LoaderCallbacks<T> = Readonly<{
  load: (
    url: string,
    onLoad: (value: T) => void,
    onProgress: undefined,
    onError: (error: unknown) => void,
  ) => void;
}>;

function loadSource<T>(loader: LoaderCallbacks<T>, url: string): Promise<T> {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

/** Loads only the format adapter requested by the authored scene object. */
export async function loadImportedModelSource(
  assetUrl: string,
  primitive: PrimitiveKind,
  manager?: THREE.LoadingManager,
): Promise<ImportedModelSource> {
  if (primitive === "fbx") {
    const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
    const object = await loadSource(new FBXLoader(manager), assetUrl);
    return {
      object,
      animations: object.animations ?? [],
      stampSubAssetBindings: () => stampTraversalSubAssetBindings(object),
    };
  }
  if (primitive === "usdz") {
    const { USDZLoader } = await import("three/examples/jsm/loaders/USDZLoader.js");
    const object = await loadSource(new USDZLoader(manager), assetUrl);
    return {
      object,
      animations: object.animations ?? [],
      stampSubAssetBindings: () => stampTraversalSubAssetBindings(object),
    };
  }
  if (primitive === "gltf") {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const gltf = await loadSource(new GLTFLoader(manager), assetUrl);
    return {
      object: gltf.scene,
      animations: gltf.animations,
      stampSubAssetBindings: () => stampGltfSubAssetBindings(gltf.parser.associations),
    };
  }
  throw new Error(`unsupported asset primitive: ${primitive}`);
}
