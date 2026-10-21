import { describe, expect, it } from 'vitest';
import {
  ParticleMeshFramePlan,
  type ParticleMeshConfig,
} from '../../../vendor/particles/packages/gpu/src/particle-mesh-frame-plan';

describe('ParticleMeshFramePlan', () => {
  it('reuses bounded slot and weight storage across thousands of frames', () => {
    const config: ParticleMeshConfig = {
      meshSource: 'custom',
      meshSlots: [
        { id: 'cube', name: 'Cube', weight: 2, builtin: 'cube' },
        { id: 'shard', name: 'Shard', weight: 3, builtin: 'shard' },
      ],
    };
    const plan = new ParticleMeshFramePlan();
    plan.update(config);
    const slots = plan.slots;
    const weights = plan.weights;
    const firstSlot = slots[0];

    for (let index = 0; index < 5_000; index++) plan.update(config);

    expect(plan.slots).toBe(slots);
    expect(plan.weights).toBe(weights);
    expect(plan.slots[0]).toBe(firstSlot);
    expect([...plan.weights]).toEqual([2, 3, 0, 0]);
    expect(plan.totalWeight).toBe(5);
  });

  it('keeps one mutable fallback slot instead of allocating primitive records', () => {
    const plan = new ParticleMeshFramePlan();
    plan.update({ meshSource: 'primitive', mesh: 'cube' });
    const fallback = plan.slots[0];

    plan.update({ meshSource: 'primitive', mesh: 'diamond' });

    expect(plan.slots[0]).toBe(fallback);
    expect(plan.slots[0]).toMatchObject({ name: 'diamond', builtin: 'diamond', weight: 1 });
    expect(plan.totalWeight).toBe(1);
  });
});
