import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('server termination waits for owned build children and closes its HTTP listener', { timeout: 10000 }, async () => {
  const script = `import { createServer } from 'node:http';
    import { spawn } from 'node:child_process';
    import { once } from 'node:events';
    import { installServerShutdown } from ${JSON.stringify(new URL('./server-shutdown.mjs', import.meta.url).href)};
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    const server = createServer();
    installServerShutdown(server, [async () => { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }]);
    server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ pid: child.pid, port: server.address().port })));
  `;
  const server = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
  let childPid;
  try {
    const [data] = await once(server.stdout, 'data'); const { pid, port } = JSON.parse(String(data)); childPid = pid;
    const exited = once(server, 'exit'); server.kill('SIGTERM');
    const [code] = await exited; assert.equal(code, 0);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    await assert.rejects(fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) }));
  } finally {
    if (server.exitCode === null) server.kill('SIGKILL');
    if (childPid) try { process.kill(childPid, 'SIGKILL'); } catch { /* already reaped */ }
  }
});
