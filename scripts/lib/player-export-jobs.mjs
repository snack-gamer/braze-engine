import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Local, bounded exports use the ordinary player compiler and budget gate.
 * Successful output belongs to the caller; failed/cancelled temporary output is removed. */
export function createPlayerExportJobs({ engineRoot, projectRoot, readScene, run = runProcess }) {
  const jobs = new Map(); let active = null, disposed = false;
  const inspect = (job) => { const { controller, done, ...receipt } = job; return { ...receipt }; };
  async function build(job) {
    try {
      const directory = await mkdtemp(join(tmpdir(), 'braze-player-export-'));
      job.outputDirectory = join(directory, 'dist-player');
      const options = { signal: AbortSignal.any([job.controller.signal, AbortSignal.timeout(180000)]), cwd: engineRoot,
        env: { ...process.env, NODE_ENV: 'production', BRAZE_ENGINE_ROOT: engineRoot, BRAZE_PROJECT_ROOT: projectRoot, BRAZE_PLAYER_SCENE_ID: job.sceneId },
        onOutput: (text) => { job.log = (job.log + text).slice(-65536); } };
      await run([join(engineRoot, 'node_modules/vite/bin/vite.js'), 'build', '--config', join(engineRoot, 'vite.player.config.ts'), '--outDir', job.outputDirectory], options);
      await run([join(engineRoot, 'scripts/check-player-build-budgets.mjs')], { ...options, cwd: directory });
      const scene = await readScene(job.sceneId);
      if (scene?.revision !== job.baseRevision) throw new Error('Scene changed during export. Inspect the saved revision and start a new export.');
      job.controller.signal.throwIfAborted(); job.status = 'succeeded';
    } catch (error) {
      job.status = job.controller.signal.aborted ? 'cancelled' : 'failed'; job.message = String(error.message);
      if (job.outputDirectory) await rm(job.outputDirectory, { recursive: true, force: true });
      job.outputDirectory = null;
    } finally { job.finishedAt = new Date().toISOString(); active = null; }
  }
  return {
    async execute(request) {
      if (disposed) throw new Error('Export service stopped.');
      if (request.operation === 'project.export.start') {
        if (active) throw new Error(`Export ${active.jobId} is still running. Inspect or cancel it first.`);
        // Reserve before asynchronous disk access, preventing concurrent starts.
        const job = { jobId: randomUUID(), status: 'running', sceneId: request.sceneId ?? 'current', baseRevision: request.baseRevision,
          outputDirectory: null, log: '', startedAt: new Date().toISOString(), controller: new AbortController() };
        active = job;
        try {
          if (typeof job.baseRevision !== 'string' || !job.baseRevision) throw new Error('Export requires the saved scene baseRevision from scene.inspect. Save live edits first.');
          const scene = await readScene(job.sceneId);
          if (!scene || scene.revision !== job.baseRevision) throw new Error('Saved scene revision does not match. Inspect before exporting.');
          if (disposed) throw new Error('Export service stopped.');
          while (jobs.size >= 16) jobs.delete(jobs.keys().next().value);
          jobs.set(job.jobId, job); job.done = build(job); return inspect(job);
        } catch (error) { active = null; throw error; }
      }
      const job = jobs.get(request.jobId); if (!job) throw new Error('Unknown export job. Receipts are server-local and retain the latest 16 jobs.');
      if (request.operation === 'project.export.cancel') { if (job.status === 'running') { job.controller.abort(new Error('Export cancelled.')); await job.done; } }
      else if (request.operation !== 'project.export.status') throw new Error('Unknown export command.');
      return inspect(job);
    },
    async dispose() { disposed = true; active?.controller.abort(new Error('Export server stopped.')); await active?.done; },
  };
}

function runProcess(args, { cwd, env, signal, onOutput }) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let forceTimer;
    const abort = () => { child.kill('SIGTERM'); forceTimer = setTimeout(() => child.kill('SIGKILL'), 1500); forceTimer.unref(); };
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
    child.stdout.on('data', (data) => onOutput(data.toString())); child.stderr.on('data', (data) => onOutput(data.toString()));
    child.once('error', reject);
    child.once('close', (code) => { clearTimeout(forceTimer); signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(signal.reason); else if (code !== 0) reject(new Error(`Player build/budget process exited ${code}. Inspect log.`)); else resolve(); });
  });
}
