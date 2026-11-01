import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export class QueueError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

// ponytail: one local server owns this JSON file; use a transactional store before allowing multiple server processes.
export class Queue {
  constructor(directory) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = join(directory, 'commands.json');
    this.directory = directory;
    this.owner = null;
    this.lastSeen = null;
    try { this.jobs = JSON.parse(readFileSync(this.file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; this.jobs = []; }
    if (!Array.isArray(this.jobs)) throw new Error('Файл очереди повреждён. Восстановите его из резервной копии.');
    this.commit(this.jobs.map(job => job.status === 'running' ? { ...job, status: 'queued', attempt: undefined } : job));
  }

  commit(jobs) {
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(jobs), { mode: 0o600, flush: true });
    renameSync(temporary, this.file);
    const fd = openSync(this.directory, 'r');
    try { fsyncSync(fd); } finally { closeSync(fd); }
    this.jobs = jobs;
  }

  get(id) { return this.jobs.find(job => job.id === id) ?? null; }

  add(command) {
    const previous = this.get(command.id);
    if (previous) {
      if (JSON.stringify(canonical(previous.command)) !== JSON.stringify(canonical(command))) throw new QueueError('Этот UUID уже принадлежит другой команде.');
      return previous;
    }
    const normalized = canonical(command);
    const job = { id: command.id, command: normalized, fingerprint: createHash('sha256').update(JSON.stringify(normalized)).digest('hex'), status: 'queued', createdAt: new Date().toISOString() };
    this.commit([...this.jobs, job]);
    return job;
  }

  connect(worker) {
    if (this.owner && this.owner !== worker) throw new QueueError('Обмен уже выполняет другой сеанс 1С. Закройте его корректно или перезапустите посредник после остановки 1С.');
    this.owner = worker;
    this.lastSeen = new Date().toISOString();
  }

  pull(worker) {
    this.connect(worker);
    const running = this.jobs.find(job => job.status === 'running');
    if (running) return running;
    const job = this.jobs.find(job => job.status === 'queued');
    if (!job) return null;
    const next = { ...job, status: 'running', attempt: randomUUID(), startedAt: new Date().toISOString() };
    this.commit(this.jobs.map(item => item.id === next.id ? next : item));
    return next;
  }

  finish(worker, response) {
    this.connect(worker);
    const job = this.get(response.id);
    if (!job || job.attempt !== response.attempt) throw new QueueError('Результат относится к другой выдаче команды. Повторите получение команды.');
    if (['succeeded', 'failed'].includes(job.status)) return job;
    const next = { ...job, status: response.status, result: response.result ?? null, error: response.error ?? null, finishedAt: new Date().toISOString() };
    this.commit(this.jobs.map(item => item.id === job.id ? next : item));
    return next;
  }

  release(worker) {
    if (worker !== this.owner) throw new QueueError('Сеанс не владеет соединением.');
    if (this.jobs.some(job => job.status === 'running')) throw new QueueError('Сначала передайте результат выполняемой команды.');
    this.owner = null;
    this.lastSeen = null;
  }
}
