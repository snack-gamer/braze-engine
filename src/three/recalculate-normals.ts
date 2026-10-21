import * as THREE from "three";
import type { ModelImportSettings, NormalCalculationMode } from "../lib/model-import-settings";

type FaceInfo = {
  normal: THREE.Vector3;
  area: number;
  angles: [number, number, number];
};

const keyFor = (x: number, y: number, z: number) => `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;

function vertexAngle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  return b.clone().sub(a).normalize().angleTo(c.clone().sub(a).normalize());
}

function weightFor(face: FaceInfo, corner: number, mode: NormalCalculationMode): number {
  if (mode === "unweighted") return 1;
  if (mode === "areaWeighted") return face.area;
  if (mode === "angleWeighted") return face.angles[corner];
  return face.area * face.angles[corner];
}

export function recalculateMeshNormals(mesh: THREE.Mesh, settings: ModelImportSettings): void {
  const source = mesh.geometry;
  if (!source.getAttribute("position")) return;
  const geometry = source.index ? source.toNonIndexed() : source;
  const position = geometry.getAttribute("position");
  const normals = new Float32Array(position.count * 3);
  const faces: FaceInfo[] = [];
  const buckets = new Map<string, number[]>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  for (let i = 0; i + 2 < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    const cross = new THREE.Vector3().crossVectors(ab, ac);
    const area = Math.max(cross.length() * 0.5, 0.000001);
    const normal = cross.normalize();
    faces.push({
      normal,
      area,
      angles: [vertexAngle(a, b, c), vertexAngle(b, c, a), vertexAngle(c, a, b)],
    });
    for (let corner = 0; corner < 3; corner++) {
      const index = i + corner;
      const key = keyFor(position.getX(index), position.getY(index), position.getZ(index));
      const bucket = buckets.get(key);
      if (bucket) bucket.push(index);
      else buckets.set(key, [index]);
    }
  }

  const cosine = Math.cos(THREE.MathUtils.degToRad(settings.smoothingAngle));
  const smoothByAngle = settings.smoothnessSource === "fromAngle";
  for (let index = 0; index < position.count; index++) {
    const face = faces[Math.floor(index / 3)];
    const key = keyFor(position.getX(index), position.getY(index), position.getZ(index));
    const bucket = buckets.get(key) ?? [index];
    const sum = new THREE.Vector3();
    for (const otherIndex of bucket) {
      const otherFace = faces[Math.floor(otherIndex / 3)];
      if (smoothByAngle && face.normal.dot(otherFace.normal) < cosine) continue;
      const corner = otherIndex % 3;
      sum.addScaledVector(otherFace.normal, weightFor(otherFace, corner, settings.normalCalculationMode));
    }
    if (sum.lengthSq() === 0) sum.copy(face.normal);
    sum.normalize();
    normals[index * 3] = sum.x;
    normals[index * 3 + 1] = sum.y;
    normals[index * 3 + 2] = sum.z;
  }

  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.attributes.normal.needsUpdate = true;
  if (geometry !== source) {
    mesh.geometry = geometry;
    source.dispose();
  }
}
