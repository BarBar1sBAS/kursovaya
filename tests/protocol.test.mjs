import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateCommand, validateResult } from '../server/protocol.mjs';

test('command boundary preserves decimals and rejects malformed object changes before queuing', () => {
  const draft = { id: randomUUID(), operation: 'document.save', payload: { entity: 'orders', data: { date: '2026-11-01T12:00:00+03:00', rows: [{ productId: randomUUID(), warehouseId: randomUUID(), quantity: '0.125', price: '0.00' }] } } };
  assert.equal(validateCommand(draft).payload.data.rows[0].quantity, '0.125');
  for (const value of ['-1', '1.0001', '1e3', 'NaN', 1, '1234567890123']) {
    const invalid = structuredClone(draft); invalid.payload.data.rows[0].quantity = value;
    assert.throws(() => validateCommand(invalid), error => error.status === 400);
  }
  assert.throws(() => validateCommand({ id: randomUUID(), operation: 'system.info', payload: { entity: 'orders' } }), error => error.status === 400);
  assert.throws(() => validateCommand({ id: randomUUID(), operation: 'document.post', payload: { entity: 'orders', id: randomUUID() } }), error => error.status === 400);
  const invalidDate = structuredClone(draft); invalidDate.payload.data.date = '2026-11-01';
  assert.throws(() => validateCommand(invalidDate), error => error.status === 400);
  const invalidShape = structuredClone(draft); invalidShape.payload.data.rows[0].amount = '100';
  assert.throws(() => validateCommand(invalidShape), error => error.status === 400);
  assert.throws(() => validateResult({ id: randomUUID(), attempt: randomUUID(), status: 'succeeded' }), error => error.status === 400);
});
