// Run with browser_run_code_unsafe({filename: absolute path to this file}).
// Synthetic responses below verify the web only. They are not 1C acceptance results.
async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = 'http://127.0.0.1:4318';
  // Test reload recovery without blocking the harness on a native browser dialog.
  await page.addInitScript(() => {
    window.confirm = () => true;
    window.addEventListener('beforeunload', event => event.stopImmediatePropagation(), { capture: true });
  });
  await page.unroute('**/api/v1/**');
  await page.goto(origin);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('heading', { name: 'Подключите учебную базу' }).waitFor();
  check(await page.getByRole('button', { name: 'Создать заказ', exact: true }).isDisabled(), 'Offline create must be disabled');
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'Desktop overflow');

  const product = { id: '10000000-0000-4000-8000-000000000001', version: 'test-1', name: 'Тест: кабель USB', sku: 'TEST', unit: 'шт.' };
  const warehouse = { id: '10000000-0000-4000-8000-000000000002', version: 'test-1', name: 'Тест: склад А' };
  const client = { id: '10000000-0000-4000-8000-000000000003', version: 'test-1', name: 'Тест: клиент' };
  const orderId = '10000000-0000-4000-8000-000000000004';
  const records = { products: [product], warehouses: [warehouse], clients: [client], orders: [], receipts: [], shipments: [] };
  const jobs = new Map();
  const mutations = [];
  let declinePost = true;
  let loseNextResponse = false;
  let conflictNextSave = false;
  await page.route('**/api/v1/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const send = body => route.fulfill({ json: body });
    if (url.pathname.endsWith('/health')) return send({ connected: true, lastSeen: new Date().toISOString(), pending: 0 });
    if (req.method() === 'GET') return send(jobs.get(url.pathname.split('/').at(-1)));
    const command = req.postDataJSON();
    if (jobs.has(command.id)) return send(jobs.get(command.id));
    const p = command.payload;
    let result = {};
    let error;
    if (command.operation.endsWith('.list')) result = { items: records[p.entity] };
    else if (command.operation.endsWith('.get')) result = { item: records[p.entity].find(item => item.id === p.id) };
    else if (command.operation === 'report.stock') result = { rows: [{ productId: product.id, productName: product.name, warehouseId: warehouse.id, warehouseName: warehouse.name, unit: 'шт.', physical: '10.000', reserved: '6.000', available: '4.000' }] };
    else if (command.operation === 'order.remaining') result = { rows: [{ productId: product.id, warehouseId: warehouse.id, remaining: '4.000' }] };
    else if (command.operation.endsWith('.save') && conflictNextSave) {
      conflictNextSave = false;
      const item = records[p.entity].find(item => item.id === p.id);
      item.version = 'changed-in-1c'; item.sku = 'TEST-NEW';
      error = { code: 'VERSION_CONFLICT', message: 'Тестовый конфликт версии. Перечитайте объект из 1С.' };
    } else if (command.operation.endsWith('.save')) {
      mutations.push(command);
      const item = { ...p.data, id: p.id || (p.entity === 'orders' ? orderId : crypto.randomUUID()), version: 'test-2', number: 'ТЕСТ-001', posted: false, total: '1100.00', clientName: client.name, rows: p.data.rows?.map(row => ({ ...row, amount: '1100.00' })) };
      records[p.entity] = [...records[p.entity].filter(value => value.id !== item.id), item];
      result = { item };
    } else if (command.operation === 'document.post' && declinePost) {
      error = { code: 'INSUFFICIENT_STOCK', message: 'Тестовый отказ 1С: товар на складе А, запрошено 6, доступно 4.', field: 'quantity', row: 0, requested: '6.000', available: '4.000' };
      declinePost = false;
    } else if (command.operation === 'document.post') {
      const item = records[p.entity].find(item => item.id === p.id);
      item.posted = true; item.version = 'test-3'; item.state = 'Зарезервирован'; result = { item };
    }
    const job = { id: command.id, status: error ? 'failed' : 'succeeded', result, error };
    jobs.set(command.id, job);
    if (loseNextResponse && command.operation.endsWith('.save')) { loseNextResponse = false; return route.abort('failed'); }
    return send(job);
  });
  await page.reload();
  await page.getByText('1С подключена', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Создать заказ', exact: true }).click();
  await page.getByLabel('Клиент', { exact: true }).selectOption(client.id);
  await page.getByLabel('Товар, строка 1', { exact: true }).selectOption(product.id);
  await page.getByLabel('Склад, строка 1', { exact: true }).selectOption(warehouse.id);
  await page.getByLabel('Количество, строка 1', { exact: true }).fill('6');
  await page.getByLabel('Цена, строка 1', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).dblclick();
  await page.waitForURL(`**/#/orders/${orderId}`);
  await page.getByRole('button', { name: 'Провести', exact: true }).waitFor();
  check(mutations.length === 1, 'Double click created more than one save');
  await page.getByRole('button', { name: 'Провести', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Тестовый отказ 1С' }).waitFor();
  check(await page.getByLabel('Количество, строка 1', { exact: true }).inputValue() === '6', 'Failure lost form values');
  check(await page.getByLabel('Количество, строка 1', { exact: true }).getAttribute('aria-invalid') === 'true', 'Field error is not associated with input');
  await page.getByRole('button', { name: 'Провести', exact: true }).click();
  await page.getByRole('button', { name: 'Отменить проведение', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Создать отгрузку', exact: true }).click();
  await page.waitForFunction(id => document.querySelector('[aria-label="Заказ клиента"]').value === id, orderId);
  check(await page.getByLabel('Заказ клиента', { exact: true }).inputValue() === orderId, 'Shipment did not inherit order');
  await page.getByRole('button', { name: 'Подобрать из заказа', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Количество, строка 1"]').value === '4.000');
  check(await page.getByLabel('Количество, строка 1', { exact: true }).inputValue() === '4.000', 'Remaining reservation not picked');
  await page.getByRole('link', { name: 'Справочники', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить товар', exact: true }).click();
  await page.getByLabel('Наименование', { exact: true }).fill('Тест: восстановление после потери ответа');
  await page.getByLabel('Единица измерения', { exact: true }).fill('шт.');
  loseNextResponse = true;
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('button', { name: 'Проверить результат', exact: true }).waitFor();
  const pendingId = await page.evaluate(() => JSON.parse(localStorage.getItem('warehouse.pending.v1')).command.id);
  await page.reload();
  await page.getByRole('button', { name: 'Проверить результат', exact: true }).click();
  await page.waitForURL(/#\/products\/[0-9a-f-]{36}$/);
  check(mutations.filter(command => command.id === pendingId).length === 1, 'Recovery created a second save');
  check(await page.evaluate(() => localStorage.getItem('warehouse.pending.v1')) === null, 'Completed mutation remained pending');
  await page.getByLabel('Артикул', { exact: true }).fill('Local edit');
  conflictNextSave = true;
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('button', { name: 'Перечитать объект', exact: true }).waitFor();
  check(await page.getByLabel('Артикул', { exact: true }).inputValue() === 'Local edit', 'Conflict discarded local edit without confirmation');
  await page.getByRole('button', { name: 'Перечитать объект', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Артикул"]').value === 'TEST-NEW');
  await page.getByRole('button', { name: 'Включить тёмную тему', exact: true }).click();
  await page.locator('.radix-themes.dark').waitFor();
  check(await page.locator('.radix-themes.dark').count() === 1, 'Dark theme absent');
  await page.setViewportSize({ width: 390, height: 844 });
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'Mobile document overflow');
  await page.getByRole('link', { name: 'Отчёты', exact: true }).click();
  await page.getByRole('cell', { name: product.name, exact: true }).waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('tab', { name: 'Выполнение заказов', exact: true }).click();
  await page.getByRole('button', { name: 'Сформировать', exact: true }).waitFor();
  check(errors.length === 0, errors.join('\n'));
  await page.unroute('**/api/v1/**');
  await page.evaluate(() => localStorage.clear());
  await page.goto(origin);
  await page.setViewportSize({ width: 1440, height: 1000 });
  return { passed: true, scope: 'Synthetic UI responses only; no 1C tests', checks: ['offline', 'save', 'double click', 'server refusal', 'posting controls', 'shipment order and pickup', 'lost response and reload', 'version conflict and reread', 'dark theme', 'mobile', 'reduced motion'], mutations: mutations.length };
}
