import * as THREE from 'three';

export type ParticleCameraAxis = [number, number, number];

/** Camera data captured once and reused by every particle emitter in an effect. */
export class ParticleCameraFrame {
  readonly viewProjection = new Float32Array(16);
  readonly right: ParticleCameraAxis = [1, 0, 0];
  readonly up: ParticleCameraAxis = [0, 1, 0];

  private readonly viewProjectionMatrix = new THREE.Matrix4();

  capture(camera: THREE.Camera): void {
    camera.updateWorldMatrix(true, false);
    this.viewProjectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.viewProjection.set(this.viewProjectionMatrix.elements);

    const elements = camera.matrixWorld.elements;
    writeNormalizedAxis(this.right, elements[0]!, elements[1]!, elements[2]!, 1, 0, 0);
    writeNormalizedAxis(this.up, elements[4]!, elements[5]!, elements[6]!, 0, 1, 0);
  }
}

function writeNormalizedAxis(
  target: ParticleCameraAxis,
  x: number,
  y: number,
  z: number,
  fallbackX: number,
  fallbackY: number,
  fallbackZ: number,
): void {
  const length = Math.hypot(x, y, z);
  if (length <= Number.EPSILON) {
    target[0] = fallbackX;
    target[1] = fallbackY;
    target[2] = fallbackZ;
    return;
  }
  const inverseLength = 1 / length;
  target[0] = x * inverseLength;
  target[1] = y * inverseLength;
  target[2] = z * inverseLength;
}
