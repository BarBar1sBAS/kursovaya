// Public field vocabulary shared by forms and the transport boundary; accounting rules live only in 1C.
export const catalogs = [
  { key: 'products', title: 'Товары', singular: 'Товар', fields: [
    { key: 'name', label: 'Наименование', max: 150 }, { key: 'sku', label: 'Артикул', max: 40 }, { key: 'unit', label: 'Единица измерения', max: 20 },
  ] },
  { key: 'clients', title: 'Клиенты', singular: 'Клиент', fields: [
    { key: 'name', label: 'Наименование', max: 150 }, { key: 'phone', label: 'Телефон', max: 40 }, { key: 'email', label: 'Электронная почта', max: 150 }, { key: 'comment', label: 'Комментарий', max: 1000 },
  ] },
  { key: 'warehouses', title: 'Склады', singular: 'Склад', fields: [
    { key: 'name', label: 'Наименование', max: 150 }, { key: 'description', label: 'Описание', max: 1000 },
  ] },
];
export const documents = [
  { key: 'orders', title: 'Заказы клиентов', singular: 'Заказ клиента' },
  { key: 'receipts', title: 'Поступления товаров', singular: 'Поступление товаров' },
  { key: 'shipments', title: 'Отгрузки товаров', singular: 'Отгрузка товаров' },
];
export const operations = ['system.info', 'catalog.list', 'catalog.get', 'catalog.save', 'document.list', 'document.get', 'document.save', 'document.post', 'document.unpost', 'object.markDeletion', 'order.remaining', 'report.stock', 'report.orders'];
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
