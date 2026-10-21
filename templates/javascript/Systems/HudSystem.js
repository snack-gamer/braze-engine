import { collectLayout } from '../UI/collect-layout.js';

/** One reusable presenter; saved layout values stay independent from this Play state. */
export class HudSystem {
  /** @param {import('@braze/game').GameContext} context */
  constructor(context) {
    this.screen = context.ui.screen('hud') ?? context.ui.create('hud', collectLayout);
    context.defer(this.screen.on('help', () => this.showNotice(false)));
    context.defer(this.screen.on('close', () => this.screen.update('notice', { visible: false })));
  }
  /** @param {number} score @param {number} count */
  update(score, count) {
    this.screen.update('score', { text: `${score} points`, style: { scale: 1.16 } });
    this.screen.tween('score', { scale: 1 }, { duration: 0.3, easing: 'ease-out' });
    this.screen.update('progress', { value: Math.min(count, 3), label: `${count} / 3 found` });
    if (count === 3) this.showNotice(true);
  }
  /** @param {boolean} won */
  showNotice(won) {
    this.screen.update('noticeTitle', { text: won ? 'All three. Well explored.' : 'Your next discovery' });
    this.screen.update('noticeText', { text: won ? 'You found every collectible. Stop and Play to try again, or change the scene and make a new challenge.' : 'Find three orange cubes. Move close, then press E. Jump onto the raised platform with Space.' });
    this.screen.update('notice', { visible: true, style: { opacity: 0, y: 18 } });
    this.screen.tween('notice', { opacity: 1, y: 0 }, { duration: 0.35, easing: 'ease-out' });
  }
}
