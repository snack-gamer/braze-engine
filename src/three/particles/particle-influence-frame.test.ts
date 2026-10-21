import { ParticleCollider, ParticleEffector } from '../../../vendor/particles/packages/core/src';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ParticleInfluenceFrame } from '../../../vendor/particles/packages/gpu/src/particle-influence-frame';

describe('ParticleInfluenceFrame', () => {
  it('keeps active arrays, records, and vector tuples stable across unchanged frames', () => {
    const effector = new ParticleEffector({
      id: 'wind',
      strength: 3,
      direction: [0, 1, 0],
      transform: { position: [1, 2, 3], rotation: [0, 0, 0], scale: [2, 2, 2] },
    });
    const collider = new ParticleCollider({
      id: 'ground',
      type: 'box',
      transform: { position: [4, 5, 6], rotation: [0, 0, 0], scale: [1, 2, 3] },
    });
    const frame = new ParticleInfluenceFrame();
    const matrixWorld = new THREE.Matrix4();
    const effectorsInput = [effector];
    const collidersInput = [collider];
    frame.update(effectorsInput, collidersInput, 'emitter', 'world', matrixWorld);

    const effectors = frame.fieldEffectors;
    const colliders = frame.colliders;
    const colliderIds = frame.colliderIds;
    const effectorRecord = effectors[0]!;
    const effectorPosition = effectorRecord.position;
    const colliderRecord = colliders[0]!;
    const colliderPosition = colliderRecord.position;
    const colliderAxisX = colliderRecord.axisX;

    for (let index = 0; index < 5_000; index++) {
      frame.update(effectorsInput, collidersInput, 'emitter', 'world', matrixWorld);
    }

    expect(frame.fieldEffectors).toBe(effectors);
    expect(frame.colliders).toBe(colliders);
    expect(frame.colliderIds).toBe(colliderIds);
    expect(frame.fieldEffectors[0]).toBe(effectorRecord);
    expect(frame.fieldEffectors[0]?.position).toBe(effectorPosition);
    expect(frame.colliders[0]).toBe(colliderRecord);
    expect(frame.colliders[0]?.position).toBe(colliderPosition);
    expect(frame.colliders[0]?.axisX).toBe(colliderAxisX);
  });

  it('reuses pooled records after filtering and reflects live authored values', () => {
    const effector = new ParticleEffector({ id: 'wind', affectedEmitterIds: ['target'] });
    const collider = new ParticleCollider({ id: 'ground', affectedEmitterIds: ['target'] });
    const frame = new ParticleInfluenceFrame();
    const matrixWorld = new THREE.Matrix4();
    const effectorsInput = [effector];
    const collidersInput = [collider];
    frame.update(effectorsInput, collidersInput, 'target', 'world', matrixWorld);
    const effectorRecord = frame.fieldEffectors[0];
    const colliderRecord = frame.colliders[0];

    frame.update(effectorsInput, collidersInput, 'other', 'world', matrixWorld);
    expect(frame.fieldEffectors).toHaveLength(0);
    expect(frame.colliders).toHaveLength(0);

    effector.strength = 19;
    collider.bounce = 0.75;
    frame.update(effectorsInput, collidersInput, 'target', 'world', matrixWorld);
    expect(frame.fieldEffectors[0]).toBe(effectorRecord);
    expect(frame.colliders[0]).toBe(colliderRecord);
    expect(frame.fieldEffectors[0]?.strength).toBe(19);
    expect(frame.colliders[0]?.bounce).toBe(0.75);
    expect(frame.colliderIds).toEqual(['ground']);
  });

  it('bounds staging to the uniform capacity', () => {
    const frame = new ParticleInfluenceFrame();
    const effectors = Array.from({ length: 12 }, (_, index) => new ParticleEffector({ id: `e-${index}` }));
    const colliders = Array.from({ length: 12 }, (_, index) => new ParticleCollider({ id: `c-${index}` }));

    frame.update(effectors, colliders, 'target', 'world', new THREE.Matrix4());

    expect(frame.fieldEffectors).toHaveLength(8);
    expect(frame.colliders).toHaveLength(8);
    expect(frame.colliderIds).toHaveLength(8);
  });
});
