import type { SceneObject } from '../../types';

/** Memoizes the immutable authored-state query used before GPU admission. */
export class ParticleActivityObserver {
  private objects: SceneObject[] | null = null;
  private visible = false;
  private active = false;

  isActive(objects: SceneObject[], visible: boolean): boolean {
    if (objects !== this.objects || visible !== this.visible) {
      this.objects = objects;
      this.visible = visible;
      this.active = visible && hasRenderableParticles(objects);
    }
    return this.active;
  }
}

function hasRenderableParticles(objects: readonly SceneObject[]): boolean {
  for (const object of objects) {
    if (
      object.primitive === 'particle'
      && object.visible !== false
      && object.particle?.enabled !== false
    ) return true;
  }
  return false;
}
