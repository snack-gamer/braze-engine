import { expect, it } from 'vitest';
import { ScriptBehavior, defineBehavior, defineGame } from './script-behavior';
import { registeredBehaviorFixture, savedBehavior } from '../../behaviors/testing/registered-behavior-fixture';
import { makeObject } from '../../lib/payload';
import type { EntityBehaviorDisposeReason } from '../../behaviors/domain/entity-behaviors';

it('runs independent class instances with bound private state, saved fields and owned cleanup through the real host', async () => {
  const observations: number[] = [], disposed: string[] = [];
  class Counter extends ScriptBehavior {
    #count = 0;
    start() { this.scope.defer(() => disposed.push(`cleanup:${this.scope.signal.aborted}`)); }
    fixedUpdate() { this.#count += Number(this.values.amount); observations.push(this.#count); }
    dispose(reason: EntityBehaviorDisposeReason) { disposed.push(`${reason}:${this.#count}`); }
  }
  const registration = defineBehavior({ id: 'example.counter', label: 'Counter', version: 1,
    fields: [{ key: 'amount', label: 'Amount', kind: 'number', default: 1, min: 0 }] }, Counter);
  const module = defineGame({ behaviors: [registration], create: () => ({ dispose() {} }) });
  const objects = [makeObject('transform', 0, { id: 'one', behaviors: savedBehavior('a', { amount: 2 }, registration.id) }),
    makeObject('transform', 1, { id: 'two', behaviors: savedBehavior('b', { amount: 3 }, registration.id) })];
  for (let run = 0; run < 2; run++) {
    const h = registeredBehaviorFixture({ registrations: module.behaviors!, create: module.create, objects });
    await h.session.start(); h.session.step(); h.session.step();
    const one = h.context().world.findByAuthoredId('one')!;
    h.context().behaviors.find(one, 'saved:a')!.setEnabled(false); h.session.step();
    h.session.dispose(); expect(h.diagnostics).toEqual([]);
  }
  expect(observations).toEqual([2, 3, 4, 6, 9, 2, 3, 4, 6, 9]);
  expect(disposed).toEqual(['world-ended:4', 'cleanup:true', 'world-ended:9', 'cleanup:true',
    'world-ended:4', 'cleanup:true', 'world-ended:9', 'cleanup:true']);
});

it('isolates a throwing class and rejects invalid saved values without constructing that instance', async () => {
  const counts: string[] = [];
  class Broken extends ScriptBehavior {
    fixedUpdate() { throw new Error('class failure'); }
    dispose() { counts.push('broken disposed'); }
  }
  class Healthy extends ScriptBehavior {
    fixedUpdate() { counts.push('healthy'); }
  }
  const bad = defineBehavior({ id: 'example.bad', label: 'Bad', version: 1, fields: [] }, Broken);
  const good = defineBehavior({ id: 'example.good', label: 'Good', version: 1,
    fields: [{ key: 'amount', label: 'Amount', kind: 'number', default: 1, min: 0 }] }, Healthy);
  const h = registeredBehaviorFixture({ registrations: [bad, good], objects: [makeObject('transform', 0, {
    id: 'owner', behaviors: { version: 1, entries: [
      ...savedBehavior('bad', {}, bad.id).entries,
      ...savedBehavior('invalid', { amount: -1 }, good.id).entries,
      ...savedBehavior('good', {}, good.id).entries,
    ] },
  })] });
  await h.session.start(); h.session.step(); h.session.step(); h.session.dispose();
  expect(counts).toEqual(['broken disposed', 'healthy', 'healthy']);
  expect(h.diagnostics.map((value) => value.message).join('\n')).toMatch(/permitted range[\s\S]*class failure/);
});
