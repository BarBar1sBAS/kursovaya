import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const binary = process.env.ONEC_BIN ?? '/opt/1cv8t/8.3.27.1606/1cv8t.app/Contents/MacOS/1cv8';
const [action, relativeBase = 'runtime/warehouse-demo', launch = ''] = process.argv.slice(2);
const base = resolve(root, relativeBase);
const actions = {
  create: ['CREATEINFOBASE', `File="${base}";`],
  load: ['DESIGNER', '/F', base, '/LoadConfigFromFiles', resolve(root, 'src'), '/UpdateDBCfg'],
  check: ['DESIGNER', '/F', base, '/CheckConfig', '-Server', '-ClientManagedApplication', '-ThinClient'],
  dump: ['DESIGNER', '/F', base, '/DumpConfigToFiles', resolve(root, 'src')],
  backup: ['DESIGNER', '/F', base, '/DumpIB', resolve(root, 'runtime/warehouse-demo.dt')],
  run: ['ENTERPRISE', '/F', base, ...(launch ? ['/C', launch] : [])],
};
if (!(action in actions)) throw new Error('Действие: create, load, check, dump, backup, run. Затем каталог базы и необязательный параметр запуска.');
mkdirSync(resolve(root, 'runtime/logs'), { recursive: true });
const logfile = resolve(root, `runtime/logs/${action}.log`);
const args = [...actions[action], '/L', 'ru', '/Out', logfile, '/DisableStartupDialogs', '/DisableStartupMessages'];
const executable = action === 'run' && binary.endsWith('/1cv8') ? `${binary}t` : binary;
const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit' });
if (existsSync(logfile)) console.log(readFileSync(logfile, 'utf8').replace(/^\uFEFF/, ''));
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
