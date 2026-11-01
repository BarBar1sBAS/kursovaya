import snapshot from './demo-data.json' with { type: 'json' };
import type { Command, Item, Result } from './model';

// These are saved responses from our demo base, not a second accounting engine.
export function readDemo({ operation, payload }: Command): Result {
  let result: Result;
  const records: Record<string, Item[]> = snapshot.records;
  const items = records[String(payload.entity)];
  if (operation === 'catalog.list' || operation === 'document.list') {
    if (!items) throw new Error('Раздел отсутствует в демонстрационном снимке.');
    const search = String(payload.search ?? '').trim().toLocaleLowerCase('ru');
    result = { items: items.filter(item => (item.name ?? item.number ?? '').toLocaleLowerCase('ru').includes(search)) };
  } else if (operation === 'catalog.get' || operation === 'document.get') {
    const item = items?.find(item => item.id === payload.id);
    if (!item) throw new Error('Объект отсутствует в демонстрационном снимке.');
    result = { item };
  } else if (operation === 'report.stock' || operation === 'report.orders') {
    const rows: Record<string, string>[] = operation === 'report.stock' ? snapshot.stock : snapshot.fulfillment;
    const keys = operation === 'report.stock' ? ['productId', 'warehouseId'] : ['clientId', 'orderId'];
    result = { rows: rows.filter(row => keys.every(key => !payload[key] || row[key] === payload[key])) };
  } else {
    throw new Error('На GitHub Pages доступен только просмотр снимка. Для этой операции запустите локальную версию с 1С.');
  }
  return structuredClone(result);
}
