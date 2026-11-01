import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { createApp } from '../server/app.mjs';

test('HTTP boundary rejects unsafe requests and completes a command through an authenticated test worker', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'warehouse-api-'));
  const server = createApp({ directory: dir, token: 'test-secret', staticDirectory: join(dir, 'absent') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = (path, data, headers = {}) => fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(data) });
  try {
    assert.equal((await fetch(origin + '/api/v1/health')).status, 200);
    assert.equal((await call('/api/v1/commands', {}, { origin: 'http://attacker.example' })).status, 403);
    const unsafeHostStatus = await new Promise((resolve, reject) => {
      const req = request(origin + '/api/v1/health', { headers: { host: 'attacker.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(unsafeHostStatus, 403);
    assert.equal((await call('/api/v1/commands', { id: randomUUID(), operation: 'eval', payload: {} })).status, 400);
    assert.equal((await call('/api/v1/commands', { id: randomUUID(), operation: 'catalog.save', payload: { entity: 'products', data: { name: 'Кабель', __unexpected: true } } })).status, 400);
    assert.equal((await call('/api/v1/commands', { id: randomUUID(), operation: 'document.save', payload: { entity: 'orders', id: randomUUID(), data: {} } })).status, 400);
    const command = { id: randomUUID(), operation: 'system.info', payload: {} };
    assert.equal((await call('/api/v1/commands', command)).status, 202);
    const worker = randomUUID();
    assert.equal((await call('/bridge/v1/pull', { worker })).status, 401);
    const workerHeaders = { authorization: 'Bearer test-secret' };
    const job = await (await call('/bridge/v1/pull', { worker }, workerHeaders)).json();
    assert.equal(job.id, command.id);
    assert.equal((await call('/bridge/v1/result', { worker, response: { id: job.id, attempt: job.attempt, status: 'succeeded', result: { platform: 'synthetic test worker' } } }, workerHeaders)).status, 200);
    const result = await (await fetch(origin + `/api/v1/commands/${command.id}`)).json();
    assert.equal(result.status, 'succeeded');
    assert.equal(result.result.platform, 'synthetic test worker');
    assert.equal((await call('/api/v1/commands', command)).status, 200);
    assert.equal((await call('/api/v1/commands', { ...command, operation: 'report.stock' })).status, 409);
    assert.equal((await call('/bridge/v1/release', { worker }, workerHeaders)).status, 200);
    assert.equal((await call('/api/v1/commands', { id: randomUUID(), operation: 'system.info', payload: { search: 'a'.repeat(1048576) } })).status, 413);
    assert.equal((await fetch(origin + '/server/index.mjs')).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
