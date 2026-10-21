import { PRIMITIVE_CUBE_SIZE, PRIMITIVE_SPHERE_RADIUS } from "../../scene/domain/primitive-dimensions";
import * as THREE from "three";
import type { SceneObject } from "../../types";
import { textureForMaterial } from "../../three/texture-cache";

/** Player geometry excludes the editor-only particle and light markers. */
export function buildPrimitiveBody(object: SceneObject): THREE.Mesh {
  const geometry = object.primitive === "sphere"
    ? new THREE.SphereGeometry(PRIMITIVE_SPHERE_RADIUS, 48, 32)
    : object.primitive === "plane"
      ? new THREE.PlaneGeometry(5, 5, 24, 24)
      : new THREE.BoxGeometry(PRIMITIVE_CUBE_SIZE, PRIMITIVE_CUBE_SIZE, PRIMITIVE_CUBE_SIZE);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.castShadow = object.meshRenderer?.castShadows ?? object.primitive !== "plane";
  mesh.receiveShadow = object.meshRenderer?.receiveShadows ?? true;
  if (object.primitive === "plane") mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function buildImageBody(object: SceneObject): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  if (object.assetUrl) material.map = textureForMaterial(material, object.assetUrl, THREE.SRGBColorSpace);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.35), material);
  mesh.userData.originalMaterial = material;
  group.add(mesh);
  return group;
}

export function buildPlaceholderBody(): THREE.Group {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(PRIMITIVE_CUBE_SIZE, PRIMITIVE_CUBE_SIZE, PRIMITIVE_CUBE_SIZE);
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

export function buildAssetLoadingBody(): THREE.Group {
  const group = new THREE.Group();
  group.userData.loadingPlaceholder = true;
  return group;
}

export function buildParticleBody(): THREE.Group {
  return new THREE.Group();
}

export function buildDirectionalLightBody(): THREE.Group {
  return new THREE.Group();
}
