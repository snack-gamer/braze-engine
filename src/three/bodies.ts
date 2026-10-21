import { PRIMITIVE_CUBE_SIZE, PRIMITIVE_SPHERE_RADIUS } from "../scene/domain/primitive-dimensions";
import * as THREE from "three";
import type { SceneObject } from "../types";
import { textureForMaterial } from "./texture-cache";

export function buildPrimitiveBody(object: SceneObject) {
  let geometry: THREE.BufferGeometry;
  if (object.primitive === "sphere") {
    geometry = new THREE.SphereGeometry(PRIMITIVE_SPHERE_RADIUS, 48, 32);
  } else if (object.primitive === "plane") {
    geometry = new THREE.PlaneGeometry(5, 5, 24, 24);
  } else {
    geometry = new THREE.BoxGeometry(PRIMITIVE_CUBE_SIZE, PRIMITIVE_CUBE_SIZE, PRIMITIVE_CUBE_SIZE);
  }
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = object.meshRenderer?.castShadows ?? object.primitive !== "plane";
  mesh.receiveShadow = object.meshRenderer?.receiveShadows ?? true;
  if (object.primitive === "plane") mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function buildImageBody(object: SceneObject) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  if (object.assetUrl) {
    material.map = textureForMaterial(material, object.assetUrl, THREE.SRGBColorSpace);
  }
  const mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material> = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.35),
    material,
  );
  mesh.userData.originalMaterial = material;
  group.add(mesh);
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(2.25, 1.4)),
    new THREE.LineBasicMaterial({ color: object.color }),
  );
  group.add(frame);
  return group;
}

export function buildPlaceholderBody() {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(PRIMITIVE_CUBE_SIZE, PRIMITIVE_CUBE_SIZE, PRIMITIVE_CUBE_SIZE);
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: "#888" }),
  );
  group.add(mesh, edges);
  return group;
}

export function buildAssetLoadingBody() {
  const group = new THREE.Group();
  group.userData.loadingPlaceholder = true;
  return group;
}

export function buildParticleBody(object: SceneObject) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: object.color,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 8, 48), material);
  ring.rotation.x = Math.PI / 2;
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), material.clone());
  const axis = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.9, 0),
    ]),
    new THREE.LineBasicMaterial({ color: object.color, transparent: true, opacity: 0.7 }),
  );
  group.add(ring, core, axis);
  return group;
}

// Lightweight Unity-like sun gizmo. This is editor chrome only: the actual
// Three.js DirectionalLight remains the shared world key light so shadows,
// water, godrays and the GI composite all consume one lighting authority.
export function buildDirectionalLightBody() {
  const group = new THREE.Group();
  group.name = "Directional Light Gizmo";
  group.userData.editorChrome = true;

  const color = 0xf3c44d;
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 10),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  );
  marker.castShadow = false;
  marker.receiveShadow = false;
  marker.userData.originalMaterial = marker.material;

  const points: THREE.Vector3[] = [];
  const radius = 0.2;
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    points.push(
      new THREE.Vector3(x, y, 0.05),
      new THREE.Vector3(x, y, 0.72),
    );
  }
  const rays = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, toneMapped: false }),
  );
  rays.frustumCulled = false;
  group.add(marker, rays);
  return group;
}
