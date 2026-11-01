import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { Queue, QueueError } from './queue.mjs';
import { validateCommand, validateResult } from './protocol.mjs';
import { uuidPattern } from '../shared/contract.mjs';

async function body(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) throw new QueueError('Нужен Content-Type application/json.', 415);
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const parts = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size > 1048576) { parts.length = 0; reject(new QueueError('Запрос превышает 1 МБ.', 413)); }
      else parts.push(chunk);
    });
    request.on('error', reject);
    request.on('end', () => {
      if (size > 1048576) return;
      try { resolveBody(JSON.parse(Buffer.concat(parts).toString('utf8'))); }
      catch { reject(new QueueError('Не удалось прочитать JSON.', 400)); }
    });
  });
}

function json(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(data));
}

function authenticate(request, token) {
  const actual = Buffer.from(request.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new QueueError('Неверный секрет подключения 1С.', 401);
}

function workerBody(data, withResponse) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => !['worker', ...(withResponse ? ['response'] : [])].includes(key)) || !uuidPattern.test(data.worker ?? '')) throw new QueueError('Неверный идентификатор сеанса.', 400);
  return data;
}

function serveFile(response, path, directory, method) {
  const base = resolve(directory);
  const pathname = decodeURIComponent(path);
  let target = resolve(base, `.${pathname}`);
  if (target !== base && !target.startsWith(base + sep)) throw new QueueError('Недопустимый путь.', 403);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
  if (!extname(pathname) || pathname === '/') target = resolve(base, 'index.html');
  let file;
  try {
    if (!statSync(target).isFile() || !types[extname(target)]) throw new Error('not static');
    file = readFileSync(target);
  } catch {
    if (target === resolve(base, 'index.html')) return json(response, 503, { error: { message: 'Веб-интерфейс ещё не собран. Выполните npm run build.' } });
    throw new QueueError('Файл не найден.', 404);
  }
  response.writeHead(200, { 'content-type': types[extname(target)], 'cache-control': extname(target) === '.html' ? 'no-cache' : 'public, max-age=3600' });
  response.end(method === 'HEAD' ? undefined : file);
}

export function createApp({ directory, token, staticDirectory }) {
  const queue = new Queue(directory);
  return createServer(async (request, response) => {
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const port = request.socket.localPort;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!hosts.includes(request.headers.host)) throw new QueueError('Доступ разрешён только по локальному адресу.', 403);
      const origin = `http://${request.headers.host}`;
      const url = new URL(request.url, origin);
      const path = url.pathname;
      if (path.startsWith('/bridge/')) {
        authenticate(request, token);
        if (request.method !== 'POST') throw new QueueError('Метод не поддерживается.', 405);
        const data = workerBody(await body(request), path === '/bridge/v1/result');
        if (path === '/bridge/v1/pull') return json(response, 200, queue.pull(data.worker));
        if (path === '/bridge/v1/result') return json(response, 200, queue.finish(data.worker, validateResult(data.response)));
        if (path === '/bridge/v1/release') { queue.release(data.worker); return json(response, 200, { released: true }); }
      }
      if (path.startsWith('/api/')) {
        if (request.headers.origin && request.headers.origin !== origin) throw new QueueError('Запрос с другого сайта отклонён.', 403);
        if (request.method === 'GET' && path === '/api/v1/health') {
          const connected = queue.lastSeen !== null && Date.now() - Date.parse(queue.lastSeen) < 5000;
          return json(response, 200, { service: 'warehouse-bridge', connected, lastSeen: queue.lastSeen, pending: queue.jobs.filter(job => ['queued', 'running'].includes(job.status)).length });
        }
        if (request.method === 'POST' && path === '/api/v1/commands') {
          if (request.headers.origin !== origin) throw new QueueError('Для команды нужен локальный Origin.', 403);
          const job = queue.add(validateCommand(await body(request)));
          return json(response, ['succeeded', 'failed'].includes(job.status) ? 200 : 202, job);
        }
        if (request.method === 'GET' && path.startsWith('/api/v1/commands/')) {
          const job = queue.get(path.slice('/api/v1/commands/'.length));
          if (!job) throw new QueueError('Команда не найдена.', 404);
          return json(response, 200, job);
        }
        throw new QueueError('Маршрут не найден.', 404);
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new QueueError('Метод не поддерживается.', 405);
      serveFile(response, path, staticDirectory, request.method);
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      if (!(error instanceof QueueError)) console.error('Ошибка посредника:', error.message);
      json(response, error.status ?? 500, { error: { code: 'BRIDGE_ERROR', message: error.status ? error.message : 'Ошибка сохранения или обработки запроса. Проверьте журнал посредника; не создавайте повторную операцию с новым UUID.' } });
    }
  });
}
