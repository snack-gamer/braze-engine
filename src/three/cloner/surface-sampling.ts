import * as THREE from "three";
import type { ClonerSettings } from "../../types";
import type { Runtime } from "../runtime";
import { clonerRandomSigned, clonerRandomUnit } from "./random";

type SurfaceTriangle = {
  geometry: THREE.BufferGeometry;
  mesh: THREE.Mesh;
  ia: number;
  ib: number;
  ic: number;
  cumulativeArea: number;
};

export type SurfaceSampler = {
  triangles: SurfaceTriangle[];
  totalArea: number;
};

const dummy = new THREE.Object3D();
const upVector = new THREE.Vector3(0, 1, 0);
const surfacePoint = new THREE.Vector3();
const surfaceNormal = new THREE.Vector3();
const surfaceA = new THREE.Vector3();
const surfaceB = new THREE.Vector3();
const surfaceC = new THREE.Vector3();
const surfaceAB = new THREE.Vector3();
const surfaceAC = new THREE.Vector3();
const MIN_SCALE = 0.001;

function degrees(value: number): number {
  return THREE.MathUtils.degToRad(value);
}

function readVertex(
  geometry: THREE.BufferGeometry,
  index: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  return position ? target.fromBufferAttribute(position, index) : target.set(0, 0, 0);
}

function triangleIndex(
  geometry: THREE.BufferGeometry,
  triangleIndexValue: number,
  offset: 0 | 1 | 2,
): number {
  const index = geometry.index;
  return index ? index.getX(triangleIndexValue * 3 + offset) : triangleIndexValue * 3 + offset;
}

export function buildSurfaceSampler(runtime: Runtime, objectId: string | undefined): SurfaceSampler | null {
  if (!objectId) return null;
  const root = runtime.objectMap.get(objectId);
  if (!root) return null;

  const triangles: SurfaceTriangle[] = [];
  let totalArea = 0;
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.clonerOutput || !mesh.geometry) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    if (!position || position.count < 3) return;

    const triangleCount = geometry.index
      ? Math.floor(geometry.index.count / 3)
      : Math.floor(position.count / 3);
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const ia = triangleIndex(geometry, triangle, 0);
      const ib = triangleIndex(geometry, triangle, 1);
      const ic = triangleIndex(geometry, triangle, 2);
      readVertex(geometry, ia, surfaceA).applyMatrix4(mesh.matrixWorld);
      readVertex(geometry, ib, surfaceB).applyMatrix4(mesh.matrixWorld);
      readVertex(geometry, ic, surfaceC).applyMatrix4(mesh.matrixWorld);
      const area = surfaceAB.subVectors(surfaceB, surfaceA).cross(surfaceAC.subVectors(surfaceC, surfaceA)).length() * 0.5;
      if (area <= 1e-9) continue;
      totalArea += area;
      triangles.push({ geometry, mesh, ia, ib, ic, cumulativeArea: totalArea });
    }
  });

  return triangles.length > 0 ? { triangles, totalArea } : null;
}

function surfaceTriangleFor(sampler: SurfaceSampler, sample: number): SurfaceTriangle {
  let low = 0;
  let high = sampler.triangles.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (sample <= sampler.triangles[mid].cumulativeArea) high = mid;
    else low = mid + 1;
  }
  return sampler.triangles[low];
}

function sampleSurface(
  sampler: SurfaceSampler,
  cloner: ClonerSettings,
  index: number,
  clonerWorldInverse: THREE.Matrix4,
): void {
  const triangle = surfaceTriangleFor(
    sampler,
    clonerRandomUnit(cloner.seed + index * 101 + 29) * sampler.totalArea,
  );
  let u = clonerRandomUnit(cloner.seed + index * 103 + 31);
  let v = clonerRandomUnit(cloner.seed + index * 107 + 37);
  if (u + v > 1) {
    u = 1 - u;
    v = 1 - v;
  }

  readVertex(triangle.geometry, triangle.ia, surfaceA).applyMatrix4(triangle.mesh.matrixWorld);
  readVertex(triangle.geometry, triangle.ib, surfaceB).applyMatrix4(triangle.mesh.matrixWorld);
  readVertex(triangle.geometry, triangle.ic, surfaceC).applyMatrix4(triangle.mesh.matrixWorld);
  surfaceAB.subVectors(surfaceB, surfaceA);
  surfaceAC.subVectors(surfaceC, surfaceA);
  surfaceNormal.copy(surfaceAB).cross(surfaceAC).normalize().transformDirection(clonerWorldInverse).normalize();
  surfacePoint.copy(surfaceA)
    .addScaledVector(surfaceAB, u)
    .addScaledVector(surfaceAC, v)
    .applyMatrix4(clonerWorldInverse);
  if (surfaceNormal.lengthSq() <= 1e-9) surfaceNormal.copy(upVector);
}

export function composeLegacyMatrix(
  cloner: ClonerSettings,
  index: number,
  surfaceSampler: SurfaceSampler | null,
  clonerWorldInverse: THREE.Matrix4,
): THREE.Matrix4 {
  dummy.position.set(0, 0, 0);
  dummy.rotation.set(degrees(cloner.cloneRotation[0]), degrees(cloner.cloneRotation[1]), degrees(cloner.cloneRotation[2]));
  dummy.scale.set(
    Math.max(MIN_SCALE, cloner.cloneScale[0]),
    Math.max(MIN_SCALE, cloner.cloneScale[1]),
    Math.max(MIN_SCALE, cloner.cloneScale[2]),
  );

  if (cloner.mode === "surface" && surfaceSampler) {
    sampleSurface(surfaceSampler, cloner, index, clonerWorldInverse);
    dummy.position.copy(surfacePoint);
    if (cloner.alignToSurface) {
      dummy.quaternion.setFromUnitVectors(upVector, surfaceNormal);
      dummy.rotateX(degrees(cloner.cloneRotation[0]));
      dummy.rotateY(degrees(cloner.cloneRotation[1]));
      dummy.rotateZ(degrees(cloner.cloneRotation[2]));
    }
  } else {
    dummy.position.set(
      clonerRandomSigned(cloner.seed + index * 31 + 1) * cloner.randomSize[0] * 0.5,
      clonerRandomSigned(cloner.seed + index * 31 + 2) * cloner.randomSize[1] * 0.5,
      clonerRandomSigned(cloner.seed + index * 31 + 3) * cloner.randomSize[2] * 0.5,
    );
  }

  dummy.translateX(cloner.clonePosition[0]);
  dummy.translateY(cloner.clonePosition[1]);
  dummy.translateZ(cloner.clonePosition[2]);
  dummy.position.x += clonerRandomSigned(cloner.seed + index * 59 + 7) * cloner.jitterPosition[0];
  dummy.position.y += clonerRandomSigned(cloner.seed + index * 59 + 8) * cloner.jitterPosition[1];
  dummy.position.z += clonerRandomSigned(cloner.seed + index * 59 + 9) * cloner.jitterPosition[2];
  dummy.rotation.x += degrees(clonerRandomSigned(cloner.seed + index * 67 + 11) * cloner.jitterRotation[0]);
  dummy.rotation.y += degrees(clonerRandomSigned(cloner.seed + index * 67 + 12) * cloner.jitterRotation[1]);
  dummy.rotation.z += degrees(clonerRandomSigned(cloner.seed + index * 67 + 13) * cloner.jitterRotation[2]);
  dummy.scale.set(
    Math.max(MIN_SCALE, dummy.scale.x * (1 + clonerRandomSigned(cloner.seed + index * 71 + 17) * cloner.jitterScale[0])),
    Math.max(MIN_SCALE, dummy.scale.y * (1 + clonerRandomSigned(cloner.seed + index * 71 + 18) * cloner.jitterScale[1])),
    Math.max(MIN_SCALE, dummy.scale.z * (1 + clonerRandomSigned(cloner.seed + index * 71 + 19) * cloner.jitterScale[2])),
  );
  dummy.updateMatrix();
  return dummy.matrix.clone();
}
