import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Badge, Button, IconButton, Skeleton, Table, Theme } from '@radix-ui/themes';
import { ArrowClockwise, ArrowLeft, ArrowRight, BookOpen, Check, ClipboardText, Cube, Database, FileText, Moon, Package, PlugsConnected, Plus, Rows, Sun, Trash, Truck, WarningCircle } from '@phosphor-icons/react';
import { catalogs, documents } from '../shared/contract.mjs';
import { CommandError, useData, useOperations } from './api';
import { dateLabel, money, quantity, isPagesDemo, type Catalog, type Failure, type Item, type Row } from './model';

const catalogDefinitions: Catalog[] = catalogs;
const emptyRow = (): Row => ({ productId: '', warehouseId: '', quantity: '1', price: '0' });
const draftPrefix = 'warehouse.draft.v1.';
const labelFor = (entity: string) => [...catalogDefinitions, ...documents].find(item => item.key === entity)?.title ?? '';
const itemLabel = (item: Item) => item.name ?? `${item.number || 'Без номера'} от ${dateLabel(item.date)}`;
const valueOf = (item: Item, key: string) => String((item as unknown as Record<string, unknown>)[key] ?? '');

function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  const id = useId();
  const input = isValidElement<Record<string, unknown>>(children) ? cloneElement(children, { 'aria-label': label, 'aria-invalid': !!error, 'aria-describedby': [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined }) : children;
  return <label className="field"><span className="field-label">{label}</span>{input}{hint && <span id={`${id}-hint`} className="field-hint">{hint}</span>}{error && <span id={`${id}-error`} className="field-error">{error}</span>}</label>;
}
function ErrorMessage({ error }: { error: string }) { return error ? <div className="message error" role="alert"><WarningCircle size={20} /><span>{error}</span></div> : null; }
function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children: ReactNode }) {
  return <div className="empty"><div className="empty-icon">{icon ?? <Rows size={32} weight="light" />}</div><h2>{title}</h2><div className="empty-copy">{children}</div></div>;
}
function ConnectionRequired() {
  const { networkError, health } = useOperations();
  return <Empty icon={<PlugsConnected size={36} weight="light" />} title={networkError ? 'Посредник недоступен' : 'Подключите учебную базу'}>
    <p>{networkError ? 'Запустите локальный сервер и проверьте соединение.' : 'Данные появятся после подключения обработки обмена в 1С. Все документы и остатки хранятся в учебной базе.'}</p>
    <ol><li>Запустите базу в режиме «1С:Предприятие».</li><li>Откройте обработку обмена и укажите секрет.</li><li>Включите обмен и оставьте сеанс открытым.</li></ol>
    {health?.lastSeen && <p>Последний ответ: {new Date(health.lastSeen).toLocaleTimeString('ru-RU')}.</p>}
    <a className="text-link" href="#/help">Порядок подключения <ArrowRight size={16} /></a>
  </Empty>;
}
function LoadingTable() { return <div className="loading" aria-busy="true" aria-label="Загрузка данных из 1С">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i}><div className="skeleton-row">Загрузка строки документа</div></Skeleton>)}</div>; }
function Status({ item }: { item: Item }) {
  const text = item.deleted ? 'Пометка удаления' : item.state ?? (item.posted ? 'Проведён' : 'Черновик');
  return <Badge color={item.deleted ? 'gray' : item.posted ? 'green' : 'gray'} variant="soft">{text}</Badge>;
}
function PageHeader({ title, description, children, back }: { title: string; description?: string; children?: ReactNode; back?: string }) {
  return <header className="page-header"><div>{back && <a className="back-link" href={back}><ArrowLeft size={16} />{labelFor(back.slice(2)) || 'Назад'}</a>}<h1>{title}</h1>{description && <p>{description}</p>}</div><div className="page-actions">{children}</div></header>;
}
function CatalogTabs({ active }: { active: string }) { return <nav className="tabs" aria-label="Справочники">{catalogDefinitions.map(item => <a key={item.key} href={`#/${item.key}`} aria-current={active === item.key ? 'page' : undefined}>{item.title}</a>)}</nav>; }
function WarehouseTabs({ active }: { active: string }) { return <nav className="tabs" aria-label="Складские документы">{documents.filter(item => item.key !== 'orders').map(item => <a key={item.key} href={`#/${item.key}`} aria-current={active === item.key ? 'page' : undefined}>{item.title}</a>)}</nav>; }

function ListPage({ entity }: { entity: string }) {
  const { health, pending } = useOperations();
  const catalog = catalogDefinitions.find(item => item.key === entity);
  const definition = catalog ?? documents.find(item => item.key === entity)!;
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const { data, loading, error, refresh } = useData(catalog ? 'catalog.list' : 'document.list', { entity, search: appliedSearch });
  const items = data?.items ?? [];
  const createLabel = catalog ? `Добавить ${entity === 'products' ? 'товар' : entity === 'clients' ? 'клиента' : 'склад'}` : entity === 'orders' ? 'Создать заказ' : entity === 'receipts' ? 'Создать поступление' : 'Создать отгрузку';
  return <>
    <PageHeader title={definition.title} description={entity === 'orders' ? 'Резервирование товаров и исполнение заказов по складам.' : catalog ? 'Общие данные для документов складского учёта.' : 'Движение физического остатка и исполнение заказов.'}>
      <Button disabled={isPagesDemo || !health?.connected || !!pending} onClick={() => { location.hash = `/${entity}/new`; }}><Plus size={18} />{createLabel}</Button>
    </PageHeader>
    {catalog && <CatalogTabs active={entity} />}{!catalog && entity !== 'orders' && <WarehouseTabs active={entity} />}
    <section className="data-panel" aria-label={definition.title}>
      <div className="table-toolbar"><form className="search" onSubmit={event => { event.preventDefault(); setAppliedSearch(search); }}><input aria-label="Поиск по наименованию или номеру" placeholder={catalog ? 'Наименование' : 'Номер документа'} value={search} onChange={event => setSearch(event.target.value)} /><Button variant="soft" type="submit" disabled={!health?.connected}>Найти</Button></form><IconButton variant="ghost" title="Обновить" aria-label="Обновить список" onClick={refresh} disabled={!health?.connected || loading}><ArrowClockwise size={20} /></IconButton></div>
      <ErrorMessage error={error} />
      {!health?.connected ? <ConnectionRequired /> : loading ? <LoadingTable /> : !items.length ? <Empty title={appliedSearch ? 'Совпадений нет' : catalog ? 'Справочник пока пуст' : 'Документов пока нет'}><p>{appliedSearch ? 'Измените поисковый запрос.' : `Начните с команды «${createLabel}».`}</p></Empty> : <div className="table-scroll"><Table.Root variant="surface"><Table.Header><Table.Row>
        <Table.ColumnHeaderCell>{catalog ? 'Наименование' : 'Номер и дата'}</Table.ColumnHeaderCell>
        {catalog ? catalog.fields.filter(field => field.key !== 'name').map(field => <Table.ColumnHeaderCell key={field.key}>{field.label}</Table.ColumnHeaderCell>) : <><Table.ColumnHeaderCell>{entity === 'shipments' ? 'Заказ клиента' : entity === 'receipts' ? 'Комментарий' : 'Клиент'}</Table.ColumnHeaderCell><Table.ColumnHeaderCell>Состояние</Table.ColumnHeaderCell>{entity === 'orders' && <Table.ColumnHeaderCell justify="end">Сумма</Table.ColumnHeaderCell>}</>}
      </Table.Row></Table.Header><Table.Body>{items.map(item => <Table.Row key={item.id}>
        <Table.RowHeaderCell><a className="record-link" href={`#/${entity}/${item.id}`}>{catalog ? item.name : item.number || 'Без номера'}<ArrowRight size={14} /></a>{!catalog && <span className="cell-secondary">{dateLabel(item.date)}</span>}{catalog && item.deleted && <Badge color="gray">Пометка удаления</Badge>}</Table.RowHeaderCell>
        {catalog ? catalog.fields.filter(field => field.key !== 'name').map(field => <Table.Cell key={field.key}>{valueOf(item, field.key) || 'Не указано'}</Table.Cell>) : <><Table.Cell>{entity === 'shipments' ? item.orderName : entity === 'receipts' ? item.comment || 'Без комментария' : item.clientName || 'Не указан'}</Table.Cell><Table.Cell><Status item={item} /></Table.Cell>{entity === 'orders' && <Table.Cell justify="end" className="numeric">{money(item.total)}</Table.Cell>}</>}
      </Table.Row>)}</Table.Body></Table.Root></div>}
      <div className="table-footer"><span>{data ? `Записей: ${items.length}` : 'Источник данных: 1С:Предприятие'}</span><span>Учебная файловая база</span></div>
    </section>
  </>;
}

function Lookup({ label, value, items, onChange, required, disabled, error }: { label: string; value: string; items: Item[]; onChange: (value: string) => void; required?: boolean; disabled?: boolean; error?: string }) {
  return <Field label={label} error={error}><select value={value} required={required} disabled={disabled} aria-invalid={!!error} onChange={event => onChange(event.target.value)}><option value="">Выберите значение</option>{items.filter(item => !item.deleted || item.id === value).map(item => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}</select></Field>;
}
function readDraft(key: string): Item | null { if (isPagesDemo) return null; try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; } }
function defaultItem(): Item { return { id: '', version: '', date: new Date().toISOString(), comment: '', clientId: '', orderId: '', rows: [emptyRow()] }; }
function dateInput(value?: string) { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

function EditorPage({ entity, id, onDirty }: { entity: string; id: string; onDirty: (dirty: boolean) => void }) {
  const catalog = catalogDefinitions.find(item => item.key === entity);
  const definition = catalog ?? documents.find(item => item.key === entity)!;
  const isNew = id === 'new';
  const { health, pending, execute, revision } = useOperations();
  const key = draftPrefix + entity + '.' + id;
  const [item, setItem] = useState<Item>(() => {
    const initial = readDraft(key) ?? defaultItem();
    if (entity === 'shipments' && isNew && !initial.orderId) initial.orderId = new URLSearchParams(location.hash.split('?')[1] ?? '').get('order') ?? '';
    return initial;
  });
  const [dirty, setDirty] = useState(() => !!readDraft(key));
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const loadedRevision = useRef(revision);
  const discardDraft = useRef(false);
  const existing = useData(catalog ? 'catalog.get' : 'document.get', { entity, id }, !isNew);
  const products = useData('catalog.list', { entity: 'products' }, !catalog);
  const warehouses = useData('catalog.list', { entity: 'warehouses' }, !catalog);
  const clients = useData('catalog.list', { entity: 'clients' }, entity === 'orders');
  const orders = useData('document.list', { entity: 'orders' }, entity === 'shipments');
  const availability = useData('report.stock', {}, entity === 'orders');
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => {
    if (existing.data?.item && (!dirty || loadedRevision.current !== revision || discardDraft.current)) {
      setItem(existing.data.item); setDirty(false); localStorage.removeItem(key); loadedRevision.current = revision; discardDraft.current = false;
    }
  }, [existing.data, dirty, revision, key]);
  const change = (patch: Partial<Item>) => {
    const next = { ...item, ...patch }; setItem(next); setDirty(true); localStorage.setItem(key, JSON.stringify(next)); setFailure(null);
  };
  const locked = isPagesDemo || !health?.connected || busy || !!pending || (!isNew && !existing.data && !dirty);
  const fieldError = (field: string, row?: number) => failure?.field === field && (row === undefined || failure.row === row) ? failure.message : undefined;
  async function perform(operation: string) {
    setBusy(true); setFailure(null);
    try {
      let data: Record<string, unknown> | undefined;
      if (operation.endsWith('.save')) {
        if (catalog) data = Object.fromEntries(catalog.fields.map(field => [field.key, valueOf(item, field.key)]));
        else data = { date: item.date, comment: item.comment ?? '', ...(entity === 'orders' ? { clientId: item.clientId ?? '' } : {}), ...(entity === 'shipments' ? { orderId: item.orderId ?? '' } : {}), rows: (item.rows ?? []).map(row => ({ productId: row.productId, warehouseId: row.warehouseId, quantity: row.quantity || '0', ...(entity === 'orders' ? { price: row.price || '0' } : {}) })) };
      }
      if (operation === 'object.markDeletion') data = { deleted: !item.deleted };
      const result = await execute(operation, { entity, ...(item.id ? { id: item.id, version: item.version } : {}), ...(data ? { data } : {}) }, key);
      if (result.item) setItem(result.item);
      setDirty(false); localStorage.removeItem(key); existing.refresh();
    } catch (error) { setFailure(error instanceof CommandError ? error.details : { code: 'CLIENT_ERROR', message: error instanceof Error ? error.message : 'Не удалось выполнить операцию.' }); }
    finally { setBusy(false); }
  }
  async function pickRemaining() {
    setBusy(true); setFailure(null);
    try {
      const result = await execute('order.remaining', { id: item.orderId });
      change({ rows: (result.rows ?? []).map(row => ({ productId: row.productId, warehouseId: row.warehouseId, quantity: row.remaining })) });
    } catch (error) { setFailure({ code: 'PICK_ERROR', message: error instanceof Error ? error.message : 'Не удалось подобрать остаток заказа.' }); }
    finally { setBusy(false); }
  }
  const rowChange = (index: number, patch: Partial<Row>) => change({ rows: (item.rows ?? []).map((row, i) => i === index ? { ...row, ...patch } : row) });
  function save(event: FormEvent) { event.preventDefault(); void perform(catalog ? 'catalog.save' : 'document.save'); }
  const lookupError = [products.error, warehouses.error, clients.error, orders.error, availability.error].filter(Boolean).join(' ');
  return <>
    <PageHeader title={isNew ? `Новый ${catalog ? entity === 'products' ? 'товар' : entity === 'clients' ? 'клиент' : 'склад' : entity === 'orders' ? 'заказ' : entity === 'receipts' ? 'документ поступления' : 'документ отгрузки'}` : `${definition.singular}${item.number ? ` № ${item.number}` : item.name ? `: ${item.name}` : ''}`} back={`#/${entity}`}>
      {!catalog && !isNew && <Status item={item} />}
      <Button type="submit" form="object-form" disabled={locked}><Check size={18} />{busy ? 'Ожидание 1С' : 'Сохранить'}</Button>
      {!catalog && <Button variant="soft" disabled={locked || dirty || !item.id || item.deleted} onClick={() => void perform(item.posted ? 'document.unpost' : 'document.post')}>{item.posted ? 'Отменить проведение' : 'Провести'}</Button>}
    </PageHeader>
    <ErrorMessage error={failure?.message ?? existing.error} /><ErrorMessage error={lookupError} />
    {failure?.code === 'VERSION_CONFLICT' && <Button className="reload-conflict" variant="soft" disabled={locked} onClick={() => {
      if (confirm('Загрузить актуальную версию из 1С? Локальные изменения будут заменены после успешного чтения.')) { discardDraft.current = true; existing.refresh(); setFailure(null); }
    }}><ArrowClockwise size={18} />Перечитать объект</Button>}
    {!health?.connected && <div className="message warning"><PlugsConnected size={20} /><span>1С не подключена. Введённые данные остаются в этом браузере; сохранение в базу пока недоступно.</span></div>}
    {!isNew && existing.loading && !dirty ? <LoadingTable /> : <form id="object-form" onSubmit={save}>
      <fieldset disabled={locked} className="form-body"><legend className="sr-only">{definition.singular}</legend>
        {catalog ? <section className="form-section"><h2>Основные сведения</h2><div className="form-grid">{catalog.fields.map(field => <Field key={field.key} label={field.label} error={fieldError(field.key)} hint={field.key === 'unit' ? 'Одна базовая единица для всех операций с товаром.' : undefined}><input required={field.key === 'name'} type={field.key === 'email' ? 'email' : 'text'} maxLength={field.max} value={valueOf(item, field.key)} aria-invalid={!!fieldError(field.key)} onChange={event => change({ [field.key]: event.target.value })} /></Field>)}</div></section> : <>
          <section className="form-section"><h2>Реквизиты документа</h2><div className="form-grid">
            <Field label="Дата и время" hint="Время на этом компьютере" error={fieldError('date')}><input type="datetime-local" required value={dateInput(item.date)} onChange={event => { if (event.target.value) change({ date: new Date(event.target.value).toISOString() }); }} /></Field>
            {entity === 'orders' && <Lookup label="Клиент" items={clients.data?.items ?? []} value={item.clientId ?? ''} onChange={value => change({ clientId: value })} error={fieldError('clientId')} />}
            {entity === 'shipments' && <Lookup label="Заказ клиента" items={orders.data?.items ?? []} value={item.orderId ?? ''} onChange={value => change({ orderId: value, rows: [] })} disabled={!!item.posted} error={fieldError('orderId')} />}
            <Field label="Комментарий"><input maxLength={1000} value={item.comment ?? ''} onChange={event => change({ comment: event.target.value })} /></Field>
          </div></section>
          <section className="form-section lines-section"><div className="section-heading"><div><h2>Товары</h2><p>{entity === 'orders' ? 'Укажите склад в каждой строке. Заказ резервируется целиком.' : entity === 'shipments' ? 'Количество ограничено оставшимся резервом выбранного заказа.' : 'Каждая строка увеличивает наличие на указанном складе.'}</p></div>{entity === 'shipments' && <Button type="button" variant="soft" disabled={locked || !item.orderId} onClick={() => void pickRemaining()}>Подобрать из заказа</Button>}</div>
            <div className="table-scroll"><Table.Root><Table.Header><Table.Row><Table.ColumnHeaderCell>Товар</Table.ColumnHeaderCell><Table.ColumnHeaderCell>Склад</Table.ColumnHeaderCell>{entity === 'orders' && <Table.ColumnHeaderCell justify="end">Доступно</Table.ColumnHeaderCell>}<Table.ColumnHeaderCell>Количество</Table.ColumnHeaderCell>{entity === 'orders' && <><Table.ColumnHeaderCell>Цена, ₽</Table.ColumnHeaderCell><Table.ColumnHeaderCell justify="end">Сумма, ₽</Table.ColumnHeaderCell></>}<Table.ColumnHeaderCell><span className="sr-only">Действия со строкой</span></Table.ColumnHeaderCell></Table.Row></Table.Header><Table.Body>
              {(item.rows ?? []).map((row, index) => <Table.Row key={index} className={failure?.row === index ? 'invalid-row' : ''}>
                <Table.Cell><Lookup label={`Товар, строка ${index + 1}`} items={products.data?.items ?? []} value={row.productId} onChange={value => rowChange(index, { productId: value })} error={fieldError('productId', index)} /></Table.Cell>
                <Table.Cell><Lookup label={`Склад, строка ${index + 1}`} items={warehouses.data?.items ?? []} value={row.warehouseId} onChange={value => rowChange(index, { warehouseId: value })} error={fieldError('warehouseId', index)} /></Table.Cell>
                {entity === 'orders' && <Table.Cell justify="end" className="numeric">{quantity(availability.data?.rows?.find(value => value.productId === row.productId && value.warehouseId === row.warehouseId)?.available) || 'Нет данных'}</Table.Cell>}
                <Table.Cell><Field label={`Количество, строка ${index + 1}`} error={fieldError('quantity', index)}><input className="number-input" type="number" min="0" step="0.001" value={row.quantity} onChange={event => rowChange(index, { quantity: event.target.value })} /></Field></Table.Cell>
                {entity === 'orders' && <><Table.Cell><Field label={`Цена, строка ${index + 1}`} error={fieldError('price', index)}><input className="number-input" type="number" min="0" step="0.01" value={row.price ?? '0'} onChange={event => rowChange(index, { price: event.target.value })} /></Field></Table.Cell><Table.Cell justify="end" className="numeric">{dirty ? 'После сохранения' : row.amount === undefined ? 'Нет данных' : money(row.amount)}</Table.Cell></>}
                <Table.Cell><IconButton type="button" color="gray" variant="ghost" aria-label={`Удалить строку ${index + 1}`} onClick={() => change({ rows: item.rows?.filter((_, i) => i !== index) })}><Trash size={18} /></IconButton></Table.Cell>
              </Table.Row>)}
            </Table.Body></Table.Root></div>
            {!item.rows?.length && <p className="inline-empty">Добавьте строку{entity === 'shipments' ? ' или подберите оставшиеся позиции заказа' : ''}.</p>}
            <div className="lines-footer"><Button type="button" variant="soft" onClick={() => change({ rows: [...(item.rows ?? []), emptyRow()] })}><Plus size={18} />Добавить строку</Button>{entity === 'orders' && <span className="total">Итого <strong>{dirty ? 'После сохранения' : money(item.total)}</strong></span>}</div>
          </section>
        </>}
      </fieldset>
      <div className="editor-footer"><p>{isPagesDemo ? 'Снимок документа доступен только для просмотра.' : dirty ? 'Есть несохранённые изменения. Черновик сохранён только в этом браузере.' : 'Запись и проведение выполняются в 1С.'}{!isPagesDemo && item.posted && ' При сохранении проведённый документ перепроводится.'}</p>{item.id && <Button type="button" color="gray" variant="ghost" disabled={locked || dirty} onClick={() => { if (confirm(item.deleted ? 'Снять пометку удаления?' : 'Пометить объект на удаление? Связанные данные сохранятся.')) void perform('object.markDeletion'); }}>{item.deleted ? 'Снять пометку удаления' : 'Пометить на удаление'}</Button>}</div>
    </form>}
    {!isPagesDemo && entity === 'orders' && item.posted && !dirty && <div className="next-action"><Truck size={22} /><div><strong>Исполнение заказа</strong><p>Создайте отгрузку и подберите оставшийся резерв этого заказа.</p></div><Button asChild variant="soft"><a href={`#/shipments/new?order=${item.id}`}>Создать отгрузку <ArrowRight size={16} /></a></Button></div>}
  </>;
}

function ReportsPage() {
  const { health } = useOperations();
  const [view, setView] = useState('stock');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const products = useData('catalog.list', { entity: 'products' });
  const warehouses = useData('catalog.list', { entity: 'warehouses' });
  const clients = useData('catalog.list', { entity: 'clients' });
  const orders = useData('document.list', { entity: 'orders' });
  const report = useData(view === 'stock' ? 'report.stock' : 'report.orders', applied);
  const columns = view === 'stock' ? [['productName', 'Товар'], ['unit', 'Ед.'], ['warehouseName', 'Склад'], ['physical', 'Физический остаток'], ['reserved', 'Резерв'], ['available', 'Доступно']] : [['orderName', 'Заказ'], ['clientName', 'Клиент'], ['productName', 'Товар'], ['warehouseName', 'Склад'], ['ordered', 'Заказано'], ['shipped', 'Отгружено'], ['remaining', 'Осталось'], ['state', 'Состояние']];
  const numberKeys = ['physical', 'reserved', 'available', 'ordered', 'shipped', 'remaining'];
  return <><PageHeader title="Отчёты" description={isPagesDemo ? 'Сохранённые результаты отчётов демонстрационной базы.' : 'Текущее состояние документов и регистров учебной базы.'} />
    <div className="tabs" role="tablist" aria-label="Вид отчёта">{[['stock', 'Остатки и доступность'], ['orders', 'Выполнение заказов']].map(([key, title]) => <button key={key} role="tab" aria-selected={view === key} onClick={() => { setView(key); setFilters({}); setApplied({}); }}>{title}</button>)}</div>
    <section className="data-panel"><form className="report-filters" onSubmit={event => { event.preventDefault(); setApplied(Object.fromEntries(Object.entries(filters).filter(([, value]) => value))); report.refresh(); }}>
      {view === 'stock' ? <><Lookup label="Товар" value={filters.productId ?? ''} items={products.data?.items ?? []} onChange={value => setFilters({ ...filters, productId: value })} /><Lookup label="Склад" value={filters.warehouseId ?? ''} items={warehouses.data?.items ?? []} onChange={value => setFilters({ ...filters, warehouseId: value })} /></> : <><Lookup label="Клиент" value={filters.clientId ?? ''} items={clients.data?.items ?? []} onChange={value => setFilters({ ...filters, clientId: value })} /><Lookup label="Заказ" value={filters.orderId ?? ''} items={orders.data?.items ?? []} onChange={value => setFilters({ ...filters, orderId: value })} /></>}
      <Button type="submit" disabled={!health?.connected || report.loading}>Сформировать</Button>
    </form><ErrorMessage error={[report.error, products.error, warehouses.error, clients.error, orders.error].filter(Boolean).join(' ')} />
    {!health?.connected ? <ConnectionRequired /> : report.loading ? <LoadingTable /> : !report.data?.rows?.length ? <Empty title="Нет данных для отчёта"><p>Проверьте отборы и документы в учебной базе.</p></Empty> : <div className="table-scroll"><Table.Root><Table.Header><Table.Row>{columns.map(([key, label]) => <Table.ColumnHeaderCell key={key} justify={numberKeys.includes(key) ? 'end' : 'start'}>{label}</Table.ColumnHeaderCell>)}</Table.Row></Table.Header><Table.Body>{report.data.rows.map((row, index) => <Table.Row key={index}>{columns.map(([key]) => <Table.Cell key={key} justify={numberKeys.includes(key) ? 'end' : 'start'} className={numberKeys.includes(key) ? 'numeric' : ''}>{numberKeys.includes(key) ? quantity(row[key]) : row[key]}</Table.Cell>)}</Table.Row>)}</Table.Body></Table.Root></div>}
    <div className="table-footer">Количества разных товаров и единиц измерения не суммируются.</div></section>
  </>;
}

function HelpPage() {
  const { health, execute } = useOperations();
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (isPagesDemo) return <><PageHeader title="О демонстрации" description="Склад и заказы на GitHub Pages" /><article className="help-content">
    <p>Здесь опубликован снимок собственной демонстрационной базы 1С от 1 ноября 2026 года. Можно просматривать справочники, документы, искать записи и задавать отборы в отчётах.</p>
    <h2>Демонстрационный пример</h2><p>Поступление: 10 единиц на склад А и 8 на склад Б. Заказ: 6 и 5 единиц по 100 рублей, всего 1 100 рублей. Две отгрузки: 2/3 и 4/2. Остаток: 4/3, резерв: 0/0, заказ отгружен.</p>
    <h2>Запись и проведение</h2><p>Эти операции доступны в локальной версии с посредником Node.js и открытым сеансом 1С. GitHub Pages показывает сохранённые данные без подключения к учебной базе. Изменение справочников и документов здесь отключено.</p>
    <a className="text-link" href="https://github.com/BarBar1sBAS/kursovaya">Исходники и порядок запуска <ArrowRight size={16} /></a>
  </article></>;
  return <><PageHeader title="Подключение 1С" description="Локальный обмен работает, пока открыта обработка в учебной базе." /><article className="help-content">
    <p>Документы, остатки и резервы хранятся в базе 1С. Оставьте сеанс обмена открытым, пока работаете в браузере.</p>
    <h2>Подготовьте среду</h2><p>Используйте учебную платформу 1С 8.3.27.1606 и базу «Склад и заказы» из комплекта проекта. Порядок установки и восстановления приведён в руководстве docs/quickstart.md.</p>
    <h2>Подключите обработку обмена</h2><ol><li>Запустите посредник командой <code>npm start</code> из каталога проекта.</li><li>В 1С откройте обработку «ВебОбмен». Укажите порт посредника и секрет из файла <code>runtime/bridge/token</code>.</li><li>Включите обмен. Не закрывайте обработку и не завершайте сеанс 1С во время работы из браузера.</li></ol>
    <p>Если 1С аварийно завершилась, сначала убедитесь, что старый процесс остановлен, затем перезапустите посредник и подключите новый сеанс. Незавершённые команды сохраняют UUID.</p>
    <h2>Проверьте соединение</h2><p>Проверка ниже запрашивает версию непосредственно у подключённой 1С. Наличие ответа посредника само по себе не подтверждает работу конфигурации.</p>
    <Button disabled={!health?.connected || busy} onClick={() => { setBusy(true); setError(''); void execute('system.info', {}).then(result => setInfo(String(result.platform ?? 'Ответ получен без версии платформы.'))).catch(error => setError(error.message)).finally(() => setBusy(false)); }}>{busy ? 'Ожидание ответа' : 'Запросить версию 1С'}</Button>{info && <p role="status">Ответ платформы: {info}</p>}<ErrorMessage error={error} />
    <h2>Если операция ожидает ответа</h2><p>Не создавайте тот же документ повторно. После восстановления связи нажмите «Проверить результат» в уведомлении. Команда будет повторена с прежним UUID.</p>
    <h2>Демонстрация для защиты</h2><p>Создайте товар «Кабель USB», клиента и склады А и Б. Проведите поступление 10/8, заказ 6/5 и две отгрузки 2/3 и 4/2. В конце физический остаток составит 4/3, резерв 0/0. Демонстрационная база из комплекта уже содержит этот пример. Для повторения создайте отдельную учебную базу.</p>
    <a className="text-link" href="#/orders">К заказам клиентов <ArrowRight size={16} /></a>
  </article></>;
}

export default function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || '/orders');
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const routeRef = useRef(route); routeRef.current = route;
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('warehouse.theme') === 'dark' ? 'dark' : localStorage.getItem('warehouse.theme') === 'light' ? 'light' : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const { health, networkError, pending, waiting, resume, transportError, notice } = useOperations();
  useEffect(() => {
    const change = () => {
      const next = location.hash.slice(1) || '/orders';
      if (dirtyRef.current && !confirm('Перейти со страницы? Черновик останется в этом браузере, но изменения ещё не записаны в 1С.')) { history.replaceState(null, '', `#${routeRef.current}`); return; }
      setDirty(false); setRoute(next);
    };
    const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) event.preventDefault(); };
    const saved = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string; entity: string; id: string }>).detail;
      if (location.hash === detail.path) { dirtyRef.current = false; setDirty(false); location.hash = `/${detail.entity}/${detail.id}`; }
    };
    addEventListener('hashchange', change); addEventListener('beforeunload', unload);
    addEventListener('warehouse:saved', saved);
    return () => { removeEventListener('hashchange', change); removeEventListener('beforeunload', unload); removeEventListener('warehouse:saved', saved); };
  }, []);
  const parts = route.split('?')[0].split('/').filter(Boolean);
  const [entity = 'orders', id] = parts;
  const known = [...catalogDefinitions, ...documents].some(item => item.key === entity);
  useEffect(() => { document.title = `${labelFor(entity) || (entity === 'help' ? 'Подключение 1С' : entity === 'reports' ? 'Отчёты' : 'Страница не найдена')} | Склад и заказы`; }, [entity]);
  useEffect(() => { document.documentElement.style.colorScheme = theme; }, [theme]);
  const mainNav = [{ title: 'Заказы', key: 'orders', href: '#/orders', icon: ClipboardText }, { title: 'Склад', key: 'warehouse', href: '#/receipts', icon: Package }, { title: 'Справочники', key: 'catalogs', href: '#/products', icon: Database }, { title: 'Отчёты', key: 'reports', href: '#/reports', icon: FileText }];
  const active = catalogDefinitions.some(item => item.key === entity) ? 'catalogs' : ['receipts', 'shipments'].includes(entity) ? 'warehouse' : entity;
  return <Theme appearance={theme} accentColor="green" grayColor="sage" radius="medium" scaling="100%"><a className="skip-link" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>Перейти к содержимому</a><div className="app-shell">
    <aside className="sidebar"><a className="brand" href="#/orders"><span className="brand-mark"><Cube size={25} weight="bold" /></span><span>Склад и заказы<small>Учебный проект</small></span></a>
      <div className="nav-label">Рабочее место</div><nav className="main-nav" aria-label="Основные разделы">{mainNav.map(link => <a key={link.key} href={link.href} aria-current={active === link.key ? 'page' : undefined}><link.icon size={21} />{link.title}</a>)}</nav>
      <div className="sidebar-bottom"><a href="#/help" aria-current={entity === 'help' ? 'page' : undefined}><BookOpen size={20} />Подключение и помощь</a><p>1С:Предприятие 8.3<br />Один оператор, несколько складов</p></div>
    </aside>
    <div className="workspace"><div className="topbar"><span className="workspace-label">Учёт товаров и заказов клиентов</span><div className="topbar-actions"><a className={`connection ${!isPagesDemo && health?.connected && !networkError ? 'connected' : ''}`} href="#/help"><PlugsConnected size={18} />{isPagesDemo ? 'Демонстрация' : networkError ? 'Посредник недоступен' : health?.connected ? '1С подключена' : 'Ожидание 1С'}</a><IconButton variant="ghost" color="gray" title={theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'} aria-label={theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'} onClick={() => { const next = theme === 'light' ? 'dark' : 'light'; localStorage.setItem('warehouse.theme', next); setTheme(next); }}>{theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}</IconButton></div></div>
      <main id="main" tabIndex={-1}>
        {isPagesDemo && <div className="message warning" role="note"><BookOpen size={20} /><span>Демонстрация: снимок базы от 01.11.2026, только просмотр. Для записи и проведения нужна локальная версия с 1С. <a className="text-link" href="#/help">Подробнее</a></span></div>}
        {pending && <div className="message warning operation-status" role="status"><ArrowClockwise size={20} /><div><strong>{waiting ? 'Ожидаем результат операции' : 'Результат операции пока не подтверждён'}</strong><p>{transportError || 'Не отправляйте операцию повторно с новым UUID. После восстановления связи используйте эту же команду.'}</p><small>UUID: {pending.command.id}</small></div><Button variant="soft" disabled={waiting} onClick={resume}>Проверить результат</Button></div>}
        {!pending && notice && <p className="success-notice" role="status"><Check size={18} />{notice}</p>}
        {entity === 'help' ? <HelpPage /> : entity === 'reports' ? <ReportsPage /> : known ? id ? <EditorPage key={route} entity={entity} id={id} onDirty={setDirty} /> : <ListPage key={entity} entity={entity} /> : <Empty title="Страница не найдена"><p>Проверьте адрес или вернитесь в рабочее место.</p><a className="text-link" href="#/orders">Открыть заказы <ArrowRight size={16} /></a></Empty>}
      </main><footer className="workspace-footer"><span>Учебная информационная система</span><span>{isPagesDemo ? 'Сохранённые данные демонстрационной базы' : 'Остатки и резервы рассчитывает 1С'}</span></footer>
    </div>
  </div></Theme>;
}
