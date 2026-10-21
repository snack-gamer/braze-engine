import { HudSystem } from './HudSystem.js';
/** A project-wide system, composed by main.js and disposed with the Play lifetime. */
export class ScoreSystem {
  score = 0;
  collected = 0;

  /** @param {import('@braze/game').GameContext} context */
  constructor(context) {
    const hud = new HudSystem(context);
    context.defer(context.events.subscribe('project.collected', ({ payload }) => {
      this.score += Number(payload?.points ?? 0);
      this.collected += 1;
      hud.update(this.score, this.collected);
      console.info(`[Game] Score: ${this.score}`);
      if (this.collected === 3) console.info('[Game] All three collectibles found!');
    }));
    console.info('[Game] WASD to move, Space to jump, E near an orange cube to collect. Find all three.');
  }

  dispose() {}
}
