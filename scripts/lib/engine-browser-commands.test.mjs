import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBrowserSteps, executeBrowserCommand } from './engine-browser-commands.mjs';

test('native playtests reject global shortcuts, unbounded input and malformed UI targets before connecting', async () => {
  for (const steps of [[], Array(33).fill({ kind: 'focus' }), [{ kind: 'key', key: 'Meta' }], [{ kind: 'key', key: 'KeyW', durationMs: 2001 }],
    Array(3).fill({ kind: 'key', key: 'KeyW', durationMs: 2000 }), [{ kind: 'pointer', action: 'click', x: -1, y: 0 }], [{ kind: 'ui', action: 'fill', screenId: 'x', nodeId: 'y' }]]) assert.throws(() => validateBrowserSteps(steps));
  assert.equal(validateBrowserSteps([{ kind: 'focus' }, { kind: 'key', key: 'KeyW', durationMs: 100 }]).length, 2);
  await assert.rejects(executeBrowserCommand({ operation: 'browser.capture' }, { engineUrl: 'http://127.0.0.1:5179' }), /explicit editor sessionId/);
  await assert.rejects(executeBrowserCommand({ operation: 'browser.inspect' }, { engineUrl: 'https://remote.example' }), /local|loopback/);
});
