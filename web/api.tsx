import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Command, Failure, Health, Job, Result } from './model';
import { isMutation, isPagesDemo } from './model';

export class CommandError extends Error {
  constructor(public details: Failure, public httpStatus = 200) { super(details.message); }
}
interface Pending { command: Command; path: string; draftKey: string }
interface OperationContext {
  health: Health | null; networkError: boolean; revision: number;
  pending: Pending | null; waiting: boolean; transportError: string;
  execute: (operation: string, payload: Record<string, unknown>, draftKey?: string) => Promise<Result>;
  resume: () => void; notice: string;
}
const Context = createContext<OperationContext | null>(null);
const pendingKey = 'warehouse.pending.v1';
function readPending(): Pending | null {
  try { return JSON.parse(localStorage.getItem(pendingKey) ?? 'null'); } catch { return null; }
}
async function request<T>(path: string, data?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: data === undefined ? 'GET' : 'POST', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), signal });
  const json = await response.json();
  if (!response.ok) throw new CommandError(json.error ?? { code: 'HTTP_ERROR', message: 'Не удалось выполнить запрос.' }, response.status);
  return json;
}
export async function submitAndWait(command: Command, signal?: AbortSignal): Promise<Result> {
  if (isPagesDemo) {
    signal?.throwIfAborted();
    return (await import('./demo')).readDemo(command);
  }
  let job = await request<Job>('/api/v1/commands', command, signal);
  while (job.status === 'queued' || job.status === 'running') {
    await new Promise<void>(resolve => setTimeout(resolve, 750));
    signal?.throwIfAborted();
    job = await request<Job>(`/api/v1/commands/${command.id}`, undefined, signal);
  }
  if (job.status === 'failed') throw new CommandError(job.error ?? { code: 'OPERATION_FAILED', message: 'Операция отклонена 1С.' });
  return job.result ?? {};
}

export function OperationProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<Health | null>(isPagesDemo ? { connected: true, lastSeen: null, pending: 0 } : null);
  const [networkError, setNetworkError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState<Pending | null>(() => isPagesDemo ? null : readPending());
  const currentPending = useRef(pending);
  const [waiting, setWaiting] = useState(false);
  const running = useRef(false);
  const [transportError, setTransportError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (isPagesDemo) return;
    let disposed = false;
    const controller = new AbortController();
    async function poll() {
      try { const result = await request<Health>('/api/v1/health', undefined, AbortSignal.any([controller.signal, AbortSignal.timeout(4000)])); if (!disposed) { setHealth(result); setNetworkError(false); } }
      catch { if (!disposed) setNetworkError(true); }
      if (!disposed) timer = window.setTimeout(poll, 2000);
    }
    let timer = window.setTimeout(poll, 0);
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, []);

  const savePending = (value: Pending | null) => {
    if (value) localStorage.setItem(pendingKey, JSON.stringify(value)); else localStorage.removeItem(pendingKey);
    currentPending.current = value; setPending(value);
  };
  const runMutation = useCallback(async (entry: Pending) => {
    if (running.current) throw new Error('Операция уже выполняется.');
    running.current = true; setWaiting(true); setTransportError(''); setNotice('');
    try {
      const result = await submitAndWait(entry.command);
      savePending(null);
      if (entry.draftKey) localStorage.removeItem(entry.draftKey);
      setRevision(value => value + 1);
      setNotice('Изменения подтверждены 1С.');
      if (result.item) window.dispatchEvent(new CustomEvent('warehouse:saved', { detail: { path: entry.path, entity: entry.command.payload.entity, id: result.item.id } }));
      return result;
    } catch (error) {
      if (error instanceof CommandError && ((error.httpStatus >= 400 && error.httpStatus < 500) || !['BRIDGE_ERROR', 'HTTP_ERROR'].includes(error.details.code))) savePending(null);
      setTransportError(error instanceof Error ? error.message : 'Связь прервалась. Проверьте результат команды.');
      throw error;
    } finally { running.current = false; setWaiting(false); }
  }, []);

  const execute = useCallback(async (operation: string, payload: Record<string, unknown>, draftKey = '') => {
    if (isPagesDemo && isMutation(operation)) throw new CommandError({ code: 'READ_ONLY', message: 'На GitHub Pages доступен только просмотр. Запись и проведение выполняются в локальной версии с 1С.' });
    const command = { id: crypto.randomUUID(), operation, payload };
    if (!isMutation(operation)) return submitAndWait(command);
    if (currentPending.current) throw new Error('Сначала дождитесь результата предыдущей операции или проверьте её результат.');
    const entry = { command, path: location.hash, draftKey };
    savePending(entry);
    return runMutation(entry);
  }, [runMutation]);
  const resume = useCallback(() => { if (currentPending.current && !running.current) void runMutation(currentPending.current).catch(() => {}); }, [runMutation]);

  return <Context.Provider value={{ health, networkError, revision, pending, waiting, transportError, execute, resume, notice }}>{children}</Context.Provider>;
}
export function useOperations() { const context = useContext(Context); if (!context) throw new Error('Нет контекста операций.'); return context; }

export function useData(operation: string, payload: Record<string, unknown>, enabled = true) {
  const { health, revision } = useOperations();
  const connected = health?.connected ?? false;
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshIndex, refresh] = useState(0);
  const serialized = JSON.stringify(payload);
  useEffect(() => {
    setData(null); setError('');
    if (!enabled || !connected) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    void submitAndWait({ id: crypto.randomUUID(), operation, payload: JSON.parse(serialized) }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); }).catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [operation, serialized, enabled, connected, revision, refreshIndex]);
  return { data, error, loading, refresh: () => refresh(value => value + 1) };
}
