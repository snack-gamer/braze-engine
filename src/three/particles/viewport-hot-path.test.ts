import { describe, expect, it } from 'vitest';
import type { SceneObject } from '../../types';
import { ParticleActivityObserver } from './particle-activity-observer';

describe('particle viewport hot path', () => {
  it('does not rescan immutable authored state across unchanged frame observations', () => {
    let primitiveReads = 0;
    const particleObject = {
      get primitive() {
        primitiveReads++;
        return 'particle' as const;
      },
      visible: true,
      particle: { enabled: true },
    } as unknown as SceneObject;
    const objects = [particleObject];
    const activity = new ParticleActivityObserver();

    for (let index = 0; index < 5_000; index++) {
      expect(activity.isActive(objects, true)).toBe(true);
    }

    expect(primitiveReads).toBe(1);
    activity.isActive([...objects], true);
    expect(primitiveReads).toBe(2);
  });
});
