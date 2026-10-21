import { ScriptBehavior, defineBehavior } from '@braze/game';

/** Saved settings are Inspector fields; each attachment owns its own instance. */
class Collectible extends ScriptBehavior {
  collected = false;
  /** @type {import('@braze/game').EntityBatch | undefined} */
  pending;

  /** @param {import('@braze/game').RegisteredBehaviorScope} scope
   * @param {import('@braze/game').BehaviorValues} values
   * @param {import('@braze/game').GameContext} context */
  constructor(scope, values, context) {
    super(scope, values, context);
    const authoredId = context.world.inspect(scope.entity).authoredId;
    this.position = context.entities.find((entity) => entity.id === authoredId)?.authoredPosition;
  }

  /** @param {import('@braze/game').GameTick} _tick */
  fixedUpdate(_tick) {
    if (this.collected || !this.context.input.action('collect').pressed) return;
    const player = this.scope.resolveEntity(
      /** @type {import('@braze/game').BehaviorEntityReference | null} */ (this.values.player),
    );
    if (!player) return;
    const pose = this.context.characters.snapshot(player);
    if (!pose || !this.position) return;
    const [x, , z] = this.position;
    if (Math.hypot(pose.position[0] - x, pose.position[2] - z) > Number(this.values.radius)) return;
    this.pending = this.context.world.destroy(this.scope.entity);
    this.collected = true;
  }

  /** @param {import('@braze/game').EntityBehaviorDisposeReason} reason */
  dispose(reason) {
    // Removal disposes this behavior before another tick; award only a committed removal.
    if (reason === 'entity-removed' && this.pending?.read().status === 'committed') {
      this.context.events.emit({ type: 'project.collected', payload: { points: Number(this.values.points) } });
    }
  }
}

export const collectible = defineBehavior({
  id: 'starter.collectible', label: 'Collectible', version: 1,
  fields: [
    { key: 'player', label: 'Player', kind: 'entity', default: null },
    { key: 'radius', label: 'Collect distance (m)', kind: 'number', default: 1.5, min: 0.1, max: 5 },
    { key: 'points', label: 'Points', kind: 'number', default: 1, min: 1, max: 100 },
  ],
}, Collectible);
