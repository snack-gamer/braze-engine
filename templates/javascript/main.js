import { createStockControlInputMap, defineGame } from '@braze/game';
import { collectible } from './Behaviors/Collectible.js';
import { ScoreSystem } from './Systems/ScoreSystem.js';

const starter = createStockControlInputMap();
export default defineGame({
  input: { version: 1, actions: [...starter.actions,
    { name: 'collect', kind: 'button', bindings: [{ device: 'keyboard', code: 'KeyE' }] },
  ] },
  behaviors: [collectible],
  create(context) { return new ScoreSystem(context); },
});
