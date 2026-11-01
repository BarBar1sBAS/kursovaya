export interface Row { productId: string; warehouseId: string; quantity: string; price?: string; amount?: string }
export const isPagesDemo = import.meta.env.MODE === 'pages';
export interface Item {
  id: string; version: string; name?: string; sku?: string; unit?: string;
  phone?: string; email?: string; description?: string; comment?: string;
  number?: string; date?: string; posted?: boolean; deleted?: boolean;
  clientId?: string; clientName?: string; orderId?: string; orderName?: string;
  rows?: Row[]; total?: string; state?: string;
}
export interface Failure { code: string; message: string; field?: string; row?: number; productId?: string; warehouseId?: string; requested?: string; available?: string }
export interface Command { id: string; operation: string; payload: Record<string, unknown> }
export interface Job { id: string; status: 'queued' | 'running' | 'succeeded' | 'failed'; result?: Result; error?: Failure }
export interface Result { item?: Item; items?: Item[]; rows?: Record<string, string>[]; platform?: string; [key: string]: unknown }
export interface Health { connected: boolean; lastSeen: string | null; pending: number }
export interface Field { key: string; label: string; max: number }
export interface Catalog { key: string; title: string; singular: string; fields: Field[] }
export const money = (value?: string) => value === undefined ? 'Нет данных' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(Number(value));
export const quantity = (value?: string) => value === undefined ? '' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(Number(value));
export const dateLabel = (value?: string) => value ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeZone: 'Europe/Moscow' }).format(new Date(value)) : '';
export const isMutation = (operation: string) => /\.(save|post|unpost|markDeletion)$/.test(operation);
