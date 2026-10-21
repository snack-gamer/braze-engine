import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ScoreSystem } from '../../templates/javascript/Systems/ScoreSystem.js';

test('starter victory counts collected objects independently of configurable points', (t) => {
  const messages = [];
  t.mock.method(console, 'info', (message) => messages.push(message));
  let collect; const hud = new Map();
  const screen = { on: () => () => {}, update: (id, patch) => hud.set(id, { ...hud.get(id), ...patch }), tween() {} };
  new ScoreSystem({ ui: { screen: () => screen }, events: { subscribe(_name, callback) { collect = callback; return () => {}; } }, defer() {} });
  collect({ payload: { points: 5 } });
  assert.ok(messages.includes('[Game] Score: 5'));
  assert.ok(!messages.includes('[Game] All three collectibles found!'));
  assert.equal(hud.get('score').text, '5 points'); assert.notEqual(hud.get('notice')?.visible, true);
  collect({ payload: { points: 1 } });
  assert.ok(!messages.includes('[Game] All three collectibles found!'));
  collect({ payload: { points: 100 } });
  assert.ok(messages.includes('[Game] Score: 106'));
  assert.equal(hud.get('score').text, '106 points'); assert.equal(hud.get('progress').value, 3); assert.equal(hud.get('notice').visible, true);
  assert.equal(messages.filter((message) => message === '[Game] All three collectibles found!').length, 1);
});
