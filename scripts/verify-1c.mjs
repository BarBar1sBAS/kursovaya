import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createApp } from '../server/app.mjs';

// Each run owns a new base, queue and client. No existing operator data is changed.
const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const directory = resolve('runtime', `verification-${Date.now()}`);
const base = join(directory, 'base');
mkdirSync(directory, { recursive: true });
const readJSON = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const pause = ms => new Promise(r => setTimeout(r, ms));
const evidence = { startedAt: new Date().toISOString(), directory, checks: [], states: [] };
function check(name, actual) { evidence.checks.push({ name, passed: true, actual }); console.log(`OK: ${name}`); }
function cli(action, launch) {
  const result = spawnSync(process.execPath, ['scripts/onec.mjs', action, base, ...(launch ? [launch] : [])], { encoding: 'utf8', timeout: 90000 });
  writeFileSync(join(directory, `${action}-${Date.now()}.log`), result.stdout + '\n' + result.stderr);
  assert.equal(result.status, 0, `${action}: ${result.stdout}\n${result.stderr}`);
}
function hashSources(path = resolve('src'), hash = createHash('sha256')) {
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) hashSources(target, hash);
    else { hash.update(target.slice(root.length)); hash.update(readFileSync(target)); }
  }
  return hash;
}
evidence.sourceSHA256 = hashSources().digest('hex');
let server, client;
const token = randomBytes(32).toString('hex');
const tokenPath = join(directory, 'token');
writeFileSync(tokenPath, token, { mode: 0o600 });
let port, origin, loseNextResult = false, lostResult;
const queueDirectory = join(directory, 'queue');
async function startBridge() {
  server = createApp({ directory: queueDirectory, token, staticDirectory: resolve('dist') });
  const handler = server.listeners('request')[0];
  server.removeAllListeners('request');
  server.on('request', (request, response) => {
    if (loseNextResult && request.url === '/bridge/v1/result') {
      loseNextResult = false;
      let text = '';
      request.on('data', part => text += part);
      request.on('end', () => { lostResult = JSON.parse(text).response; response.destroy(); });
    } else handler(request, response);
  });
  await new Promise((r, reject) => { server.once('error', reject); server.listen(port ?? 0, '127.0.0.1', r); });
  port = server.address().port; origin = `http://127.0.0.1:${port}`;
}
async function request(path, data) {
  const response = await fetch(origin + path, data ? { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result)); return result;
}
async function submit(command) { return request('/api/v1/commands', command); }
async function waitJob(id) {
  for (let n = 0; n < 100; n++) {
    let job;
    try { job = await request('/api/v1/commands/' + id); } catch (error) { if (error.cause?.code !== 'ECONNRESET') throw error; }
    if (job && ['succeeded', 'failed'].includes(job.status)) return job;
    await pause(250);
  }
  throw Error(`1С не вернула результат ${id} за 25 с.`);
}
async function command(operation, payload = {}, expectedError) {
  const id = randomUUID(); await submit({ id, operation, payload });
  const job = await waitJob(id);
  if (expectedError) { assert.equal(job.status, 'failed', JSON.stringify(job)); assert.equal(job.error.code, expectedError, JSON.stringify(job)); return job.error; }
  assert.equal(job.status, 'succeeded', JSON.stringify(job)); return job.result;
}
let product, clientItem, warehouseA, warehouseB, receipt, order, shipment1, shipment2;
const row = (warehouse, quantity, price) => ({ productId: product.id, warehouseId: warehouse.id, quantity, ...(price ? { price } : {}) });
const documentData = (rows, extra = {}) => ({ date: new Date().toISOString(), comment: 'Проверка через настоящий обмен 1С', rows, ...extra });
const save = async (entity, data) => (await command('document.save', { entity, data })).item;
const post = async (entity, item, operation = 'document.post') => (await command(operation, { entity, id: item.id, version: item.version })).item;
async function state(name, qa, ra, qb, rb) {
  const report = await command('report.stock', { productId: product.id });
  const values = warehouse => { const r = report.rows.find(r => r.warehouseId === warehouse.id); return r ? [Number(r.physical), Number(r.reserved)] : [0,0]; };
  assert.deepEqual(values(warehouseA), [qa,ra]); assert.deepEqual(values(warehouseB), [qb,rb]);
  evidence.states.push({ name, rows: report.rows }); check(name, [[qa,ra],[qb,rb]]);
}
try {
  cli('create'); cli('load'); cli('check');
  check('Восстановление исходников в новую файловую базу и проверка сервер/клиент');
  const nativePath = join(directory, 'native.json'); cli('run', `selftest|${nativePath}`);
  const native = readJSON(nativePath); evidence.native = native; assert.equal(native.passed, true, JSON.stringify(native));
  check('TC-01–TC-18 в чистой базе', native.cases.length);
  const repeatPath = join(directory, 'idempotency.json'); cli('run', `api-selftest|${repeatPath}`);
  const repeat = readJSON(repeatPath); evidence.nativeIdempotency = repeat; assert.equal(repeat.passed, true, JSON.stringify(repeat));
  check('Журнал 1С: прежний UUID и конфликт другого содержимого');
  await startBridge();
  client = spawn(process.execPath, ['scripts/onec.mjs', 'run', base, `bridge|${tokenPath}|${port}`], { stdio: 'ignore' });
  for (let n = 0; n < 100; n++) { if ((await request('/api/v1/health')).connected) break; await pause(250); }
  const info = await command('system.info'); assert.equal(info.platform, '8.3.27.1606'); check('Исходящий HTTP из открытого сеанса', info);
  product = (await command('catalog.save', { entity: 'products', data: { name: 'Кабель USB (API)', sku: 'USB-API', unit: 'шт.' } })).item;
  clientItem = (await command('catalog.save', { entity: 'clients', data: { name: 'Учебный клиент (API)' } })).item;
  warehouseA = (await command('catalog.save', { entity: 'warehouses', data: { name: 'Склад А (API)' } })).item;
  warehouseB = (await command('catalog.save', { entity: 'warehouses', data: { name: 'Склад Б (API)' } })).item;
  await state('S0',0,0,0,0);
  receipt = await post('receipts', await save('receipts', documentData([row(warehouseA,'10'),row(warehouseB,'8')])));
  await state('S1',10,0,8,0);
  order = await save('orders', documentData([row(warehouseA,'6','100'),row(warehouseB,'5','100')], {clientId: clientItem.id}));
  assert.equal(Number(order.total),1100); assert.equal(Number(order.rows[0].amount),600); assert.equal(Number(order.rows[1].amount),500);
  order = await post('orders',order); await state('S2',10,6,8,5);
  const invalid = await save('orders', documentData([row(warehouseA,'1','100'),row(warehouseB,'4','100')], {clientId:clientItem.id}));
  const error = await command('document.post', {entity:'orders',id:invalid.id,version:invalid.version},'INSUFFICIENT_STOCK');
  assert.equal(Number(error.requested),4); assert.equal(Number(error.available),3); await state('Отказ целиком',10,6,8,5);
  const after = (await command('document.get',{entity:'orders',id:invalid.id})).item; assert.equal(after.posted,false); assert.equal(after.version,invalid.version);
  shipment1 = await post('shipments', await save('shipments', documentData([row(warehouseA,'2'),row(warehouseB,'3')],{orderId:order.id})));
  await state('S3',8,4,5,2);
  const remainder = await command('order.remaining',{id:order.id}); assert.deepEqual(remainder.rows.map(r=>Number(r.remaining)).sort(),[2,4]);
  const fulfillment = await command('report.orders',{orderId:order.id,clientId:clientItem.id}); assert.ok(fulfillment.rows.every(r=>r.state==='Частично отгружен'));
  order = await post('orders',order); await state('Неизменённое перепроведение частичного заказа',8,4,5,2);
  await command('document.unpost',{entity:'orders',id:order.id,version:order.version},'DEPENDENCY_EXISTS');
  shipment2 = await post('shipments', await save('shipments',documentData(remainder.rows.map(r=>({productId:r.productId,warehouseId:r.warehouseId,quantity:r.remaining})),{orderId:order.id})));
  await state('S4',4,0,3,0);
  assert.ok((await command('report.orders',{orderId:order.id})).rows.every(r=>r.state==='Отгружен'));
  const stale = clientItem;
  clientItem = (await command('catalog.save',{entity:'clients',id:clientItem.id,version:clientItem.version,data:{name:'Учебный клиент API — изменён'}})).item;
  await command('catalog.save',{entity:'clients',id:stale.id,version:stale.version,data:{name:'Устаревшая запись'}},'VERSION_CONFLICT');
  check('Конфликт устаревшей версии без перезаписи');
  const duplicate = {id:randomUUID(),operation:'catalog.save',payload:{entity:'clients',data:{name:'Проверка двойного запроса'}}};
  await Promise.all([submit(duplicate),submit(duplicate)]); const first = await waitJob(duplicate.id);
  assert.equal((await submit(duplicate)).result.item.id,first.result.item.id); check('Двойной запрос с одним UUID');
  const replay = {id:randomUUID(),operation:'catalog.save',payload:{entity:'clients',data:{name:'Проверка потерянного ответа'}}};
  loseNextResult = true; await submit(replay);
  for(let n=0;n<100&&!lostResult;n++) await pause(100);
  assert.ok(lostResult); assert.equal(lostResult.id,replay.id); assert.equal(lostResult.status,'succeeded');
  await new Promise(r=>server.close(r)); await startBridge();
  const recovered = await waitJob(replay.id);
  assert.equal(recovered.status,'succeeded',JSON.stringify(recovered)); assert.equal(recovered.result.item.id,lostResult.result.item.id);
  const matching = (await command('catalog.list',{entity:'clients',search:'Проверка потерянного ответа'})).items;
  assert.equal(matching.length,1); evidence.recovery={id:replay.id,oldAttempt:lostResult.attempt,newAttempt:recovered.attempt,itemId:recovered.result.item.id};
  check('Потерянный результат после записи 1С и перезапуск посредника: один объект');
  evidence.passed = true;
} catch(error) { evidence.passed = false; evidence.error = error.stack; console.error(error); process.exitCode = 1; }
finally {
  if (client) {
    // Kill only the process started for this isolated test base, including its child wrapper.
    const ps=spawnSync('pgrep',['-P',String(client.pid)],{encoding:'utf8'});
    for(const pid of ps.stdout.trim().split(/\s+/).filter(Boolean)) { try { process.kill(Number(pid),'SIGTERM'); } catch {} }
    client.kill('SIGTERM');
  }
  if(server?.listening) await new Promise(r=>server.close(r));
  evidence.finishedAt = new Date().toISOString(); writeFileSync(join(directory,'result.json'),JSON.stringify(evidence,null,2));
  console.log(`Протокол: ${join(directory,'result.json')}`);
}
