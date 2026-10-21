import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ParticleCameraFrame } from '../../../vendor/particles/packages/gpu/src/particle-camera-frame';

describe('ParticleCameraFrame', () => {
  it('reuses every camera payload across thousands of unchanged frames', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1_000);
    camera.position.set(2, 3, 7);
    camera.lookAt(0, 1, 0);
    const frame = new ParticleCameraFrame();
    frame.capture(camera);

    const projection = frame.viewProjection;
    const right = frame.right;
    const up = frame.up;
    for (let index = 0; index < 5_000; index++) frame.capture(camera);

    expect(frame.viewProjection).toBe(projection);
    expect(frame.right).toBe(right);
    expect(frame.up).toBe(up);
    expect(Math.hypot(...frame.right)).toBeCloseTo(1);
    expect(Math.hypot(...frame.up)).toBeCloseTo(1);
  });
});
