import { catalogs, documents, operations, uuidPattern } from '../shared/contract.mjs';
import { QueueError } from './queue.mjs';

function requireValue(condition, message) { if (!condition) throw new QueueError(message, 400); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keys(value, allowed) { requireValue(object(value) && Object.keys(value).every(key => allowed.includes(key)), 'Неверная структура данных или неизвестное поле.'); }
function text(value, max) { requireValue(typeof value === 'string' && value.length <= max, `Ожидается строка длиной до ${max} символов.`); }
function uuid(value) { requireValue(typeof value === 'string' && uuidPattern.test(value), 'Ожидается UUID ссылки.'); }
function decimal(value, scale) { requireValue(typeof value === 'string' && new RegExp(`^\\d{1,${15 - scale}}(\\.\\d{1,${scale}})?$`).test(value), `Ожидается неотрицательное десятичное число с точностью ${scale}.`); }

export function validateCommand(command) {
  keys(command, ['id', 'operation', 'payload']);
  uuid(command.id);
  requireValue(operations.includes(command.operation), 'Операция не поддерживается.');
  const p = command.payload;
  const op = command.operation;
  let allowed = [];
  if (op.endsWith('.list')) allowed = ['entity', 'search'];
  else if (op.endsWith('.get')) allowed = ['entity', 'id'];
  else if (op.endsWith('.save') || op === 'object.markDeletion') allowed = ['entity', 'id', 'version', 'data'];
  else if (['document.post', 'document.unpost'].includes(op)) allowed = ['entity', 'id', 'version'];
  else if (op === 'order.remaining') allowed = ['id'];
  else if (op === 'report.stock') allowed = ['productId', 'warehouseId'];
  else if (op === 'report.orders') allowed = ['clientId', 'orderId'];
  keys(p, allowed);
  const possible = op.startsWith('catalog.') ? catalogs : op.startsWith('document.') ? documents : [...catalogs, ...documents];
  if (op.startsWith('catalog.') || op.startsWith('document.') || op === 'object.markDeletion') requireValue(possible.some(item => item.key === p.entity), 'Неизвестный вид объекта.');
  for (const key of ['id', 'productId', 'warehouseId', 'clientId', 'orderId']) if (p[key] !== undefined && p[key] !== '') uuid(p[key]);
  if (p.version !== undefined) text(p.version, 512);
  if (p.search !== undefined) text(p.search, 150);
  const existing = /\.(get|post|unpost)$/.test(op) || op === 'object.markDeletion' || op === 'order.remaining';
  if (existing) uuid(p.id);
  const mutation = /\.(save|post|unpost|markDeletion)$/.test(op);
  if (mutation && p.id) requireValue(typeof p.version === 'string' && p.version.length > 0, 'Для изменения объекта нужна версия прочитанных данных.');
  if (op === 'catalog.save') {
    const definition = catalogs.find(item => item.key === p.entity);
    keys(p.data, definition.fields.map(field => field.key));
    for (const field of definition.fields) if (p.data[field.key] !== undefined) text(p.data[field.key], field.max);
    requireValue(typeof p.data.name === 'string' && p.data.name.trim().length > 0, 'Укажите наименование.');
    if (p.data.email) requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.data.email), 'Проверьте электронную почту.');
  }
  if (op === 'document.save') {
    keys(p.data, ['date', 'comment', 'clientId', 'orderId', 'rows']);
    requireValue(typeof p.data.date === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(p.data.date) && Number.isFinite(Date.parse(p.data.date)), 'Нужна дата ISO 8601 с часовым поясом.');
    if (p.data.comment !== undefined) text(p.data.comment, 1000);
    for (const key of ['clientId', 'orderId']) if (p.data[key]) uuid(p.data[key]);
    requireValue(Array.isArray(p.data.rows) && p.data.rows.length <= 1000, 'Допустимо до 1000 строк документа.');
    for (const row of p.data.rows) {
      keys(row, ['productId', 'warehouseId', 'quantity', 'price']);
      if (row.productId) uuid(row.productId);
      if (row.warehouseId) uuid(row.warehouseId);
      decimal(row.quantity, 3);
      if (row.price !== undefined) decimal(row.price, 2);
    }
  }
  if (op === 'object.markDeletion') { keys(p.data, ['deleted']); requireValue(typeof p.data.deleted === 'boolean', 'Ожидается признак удаления.'); }
  return command;
}

export function validateResult(response) {
  keys(response, ['id', 'attempt', 'status', 'result', 'error']);
  uuid(response.id); uuid(response.attempt);
  requireValue(['succeeded', 'failed'].includes(response.status), 'Неверное состояние результата.');
  if (response.status === 'succeeded') requireValue(object(response.result), 'Успешный результат должен быть объектом JSON.');
  if (response.status === 'failed') {
    keys(response.error, ['code', 'message', 'field', 'row', 'requested', 'available', 'productId', 'warehouseId']);
    text(response.error.code, 100); text(response.error.message, 4000);
    if (response.error.field !== undefined) text(response.error.field, 150);
    if (response.error.row !== undefined) requireValue(Number.isInteger(response.error.row) && response.error.row >= 0, 'Неверный номер строки ошибки.');
  }
  return response;
}
