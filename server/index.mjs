import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createApp } from './app.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(root, 'runtime/bridge');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const lock = resolve(directory, 'server.lock');
try {
  const fd = openSync(lock, 'wx', 0o600);
  writeFileSync(fd, String(process.pid)); closeSync(fd);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  const pid = Number(readFileSync(lock, 'utf8'));
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Проверьте повреждённый runtime/bridge/server.lock.');
  try { process.kill(pid, 0); throw new Error('Посредник уже работает. Второй процесс не запущен.'); }
  catch (check) { if (check.code !== 'ESRCH') throw check; }
  unlinkSync(lock);
  const fd = openSync(lock, 'wx', 0o600);
  writeFileSync(fd, String(process.pid)); closeSync(fd);
}
process.on('exit', () => { try { if (readFileSync(lock, 'utf8') === String(process.pid)) unlinkSync(lock); } catch {} });
const tokenPath = resolve(directory, 'token');
let token;
try { token = readFileSync(tokenPath, 'utf8').trim(); }
catch (error) { if (error.code !== 'ENOENT') throw error; token = randomBytes(32).toString('hex'); writeFileSync(tokenPath, token, { mode: 0o600, flag: 'wx' }); }
if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Файл секрета повреждён. Остановите 1С и восстановите runtime/bridge/token.');
chmodSync(tokenPath, 0o600);
const port = Number(process.env.WAREHOUSE_PORT ?? 4318);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('WAREHOUSE_PORT должен быть от 1024 до 65535.');
const server = createApp({ directory, token, staticDirectory: resolve(root, 'dist') });
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Складской учёт: http://127.0.0.1:${port}\nФайл секрета для обработки 1С: ${tokenPath}\nПока обработка 1С не подключена, учётные операции ожидают её ответа.`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(() => process.exit(0));
  // Browsers may preconnect without sending HTTP; those sockets otherwise block shutdown.
  setTimeout(() => server.closeAllConnections(), 1000).unref();
});
