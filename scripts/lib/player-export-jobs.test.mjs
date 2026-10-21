import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createPlayerExportJobs } from './player-export-jobs.mjs';

test('exports reserve one job, reject stale revisions, use isolated output and check budgets', async () => {
  let revision = 'saved', calls = [], release;
  const jobs = createPlayerExportJobs({ engineRoot: '/engine', projectRoot: '/project', readScene: async () => ({ revision }),
    run: async (args, options) => { calls.push({ args, cwd: options.cwd, env: options.env }); options.onOutput('x'.repeat(70000)); if (calls.length === 1) await new Promise((resolve) => { release = resolve; }); } });
  try {
    await assert.rejects(jobs.execute({ operation: 'project.export.start', baseRevision: 'old' }), /revision/);
    const start = await jobs.execute({ operation: 'project.export.start', sceneId: 'arena', baseRevision: revision });
    await assert.rejects(jobs.execute({ operation: 'project.export.start', baseRevision: revision }), /still running/);
    while (!release) await delay(1); release();
    let result; do { await delay(1); result = await jobs.execute({ operation: 'project.export.status', jobId: start.jobId }); } while (result.status === 'running');
    assert.equal(result.status, 'succeeded'); assert.equal(result.log.length, 65536); assert.equal(calls.length, 2);
    assert.equal(calls[0].env.BRAZE_PLAYER_SCENE_ID, 'arena'); assert.equal(calls[0].env.BRAZE_PROJECT_ROOT, '/project'); assert.equal(calls[0].env.NODE_ENV, 'production');
    assert.equal(calls[1].cwd, dirname(result.outputDirectory)); assert.match(calls[1].args[0], /check-player-build-budgets/);
    assert.equal((await jobs.execute({ operation: 'project.export.cancel', jobId: start.jobId })).status, 'succeeded');
    await rm(dirname(result.outputDirectory), { recursive: true, force: true });
  } finally { await jobs.dispose(); }
});

test('cancellation waits for the runner and removes unfinished output; a changed scene cannot succeed', async () => {
  let revision = 'r', began = false, output, stopped = false;
  const jobs = createPlayerExportJobs({ engineRoot: '/engine', projectRoot: '/project', readScene: async () => ({ revision }),
    run: async (args, { signal }) => { began = true; output = args.at(-1); try { await delay(10000, undefined, { signal }); } finally { stopped = true; } } });
  const start = await jobs.execute({ operation: 'project.export.start', baseRevision: revision });
  while (!began) await delay(1);
  const cancelled = await jobs.execute({ operation: 'project.export.cancel', jobId: start.jobId });
  assert.equal(cancelled.status, 'cancelled'); assert.equal(stopped, true); assert.equal(cancelled.outputDirectory, null);
  await assert.rejects(access(output)); await rm(dirname(output), { recursive: true, force: true }); await jobs.dispose();
  const changed = createPlayerExportJobs({ engineRoot: '/engine', projectRoot: '/project', readScene: async () => ({ revision }), run: async () => { revision = 'new'; } });
  const second = await changed.execute({ operation: 'project.export.start', baseRevision: revision });
  let end; do { await delay(1); end = await changed.execute({ operation: 'project.export.status', jobId: second.jobId }); } while (end.status === 'running');
  assert.equal(end.status, 'failed'); assert.match(end.message, /changed during export/); await changed.dispose();
});
