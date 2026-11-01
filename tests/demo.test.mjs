import test from 'node:test';
import assert from 'node:assert/strict';
import { readDemo } from '../web/demo.ts';

const read = (operation, payload = {}) => readDemo({ id: 'demo-test', operation, payload });

test('Pages snapshot preserves the real demo totals, filters and immutable reads', () => {
  const order = read('document.list', { entity: 'orders' }).items[0];
  assert.equal(order.total, '1100.00');
  assert.equal(order.state, 'Отгружен');
  const stock = read('report.stock').rows;
  assert.deepEqual(stock.map(row => Number(row.physical)).sort(), [3, 4]);
  assert.ok(stock.every(row => Number(row.reserved) === 0));
  assert.equal(read('report.stock', { warehouseId: stock[0].warehouseId }).rows.length, 1);
  assert.equal(read('report.orders', { clientId: 'missing' }).rows.length, 0);
  assert.equal(read('report.orders', { orderId: order.id, clientId: order.clientId }).rows.length, 2);
  assert.equal(read('catalog.list', { entity: 'products', search: 'КАБЕЛЬ' }).items.length, 1);
  order.total = '0';
  assert.equal(read('document.get', { entity: 'orders', id: order.id }).item.total, '1100.00');
});

test('Pages rejects every mutation and never simulates a successful write', () => {
  for (const operation of ['catalog.save', 'document.save', 'document.post', 'document.unpost', 'object.markDeletion']) {
    assert.throws(() => read(operation, { entity: 'orders' }), /только просмотр/);
  }
  assert.throws(() => read('document.get', { entity: 'orders', id: 'missing' }), /отсутствует/);
});
