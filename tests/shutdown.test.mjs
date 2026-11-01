import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { once } from 'node:events';

test('SIGTERM exits with a browser connection that has not sent HTTP', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'warehouse-shutdown-'));
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(r => probe.close(r));
  cpSync(new URL('../server', import.meta.url), join(directory, 'server'), { recursive: true });
  cpSync(new URL('../shared', import.meta.url), join(directory, 'shared'), { recursive: true });
  const child = spawn(process.execPath, [join(directory, 'server/index.mjs')], { env: { ...process.env, WAREHOUSE_PORT: String(port) }, stdio: ['ignore','pipe','pipe'] });
  let socket;
  try {
    await once(child.stdout, 'data');
    socket = connect({ host: '127.0.0.1', port }); await once(socket, 'connect');
    const exited = once(child, 'exit'); child.kill('SIGTERM');
    const result = await Promise.race([exited, new Promise(r => setTimeout(() => r(null), 2500))]);
    assert.notEqual(result, null, 'Shutdown remained blocked by the open connection');
    assert.equal(result[0], 0);
  } finally { socket?.destroy(); child.kill('SIGKILL'); rmSync(directory, { recursive: true, force: true }); }
});
