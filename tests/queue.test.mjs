import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Queue } from '../server/queue.mjs';

test('durable queue preserves identity, rejects changed retries and recovers an interrupted command', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warehouse-queue-'));
  try {
    let queue = new Queue(dir);
    const command = { id: randomUUID(), operation: 'system.info', payload: {} };
    assert.equal(queue.add(command).status, 'queued');
    assert.equal(queue.add(command).id, command.id);
    assert.throws(() => queue.add({ ...command, payload: { changed: true } }), /UUID/);
    const first = queue.pull('worker');
    assert.equal(first.id, command.id);
    assert.equal(queue.pull('worker').id, first.id);
    assert.throws(() => queue.pull('other'), /сеанс/);
    queue = new Queue(dir);
    assert.equal(queue.get(command.id).status, 'queued');
    const recovered = queue.pull('worker');
    assert.equal(recovered.id, command.id);
    assert.throws(() => queue.finish('worker', { id: command.id, attempt: first.attempt, status: 'succeeded', result: {} }), error => error.status === 409);
    queue.finish('worker', { id: command.id, attempt: recovered.attempt, status: 'succeeded', result: { platform: 'test' } });
    assert.equal(new Queue(dir).get(command.id).result.platform, 'test');
    assert.equal(queue.add(command).status, 'succeeded');
    assert.equal(queue.pull('worker'), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
