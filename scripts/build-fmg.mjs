/* Собрать встроенную копию Azgaar's Fantasy Map Generator в public/fmg.
   Веб-сборка MIR раздаёт её как часть PWA и включает все файлы в офлайн-кэш.
   Исходники и точная upstream-зависимость лежат в vendor/azgaar-fantasy-map-generator.
   Запуск: npm run fmg:build (один раз перед этим — npm run fmg:install). */

import { existsSync, readFileSync, rmSync, statSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fromRoot } from './lib/root.mjs';

const vendor = fromRoot('vendor', 'azgaar-fantasy-map-generator');
const vite = join(vendor, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
const output = fromRoot('public', 'fmg');

if (!existsSync(vite)) {
  console.error('Зависимости Azgaar не установлены. Сначала выполните: npm run fmg:install');
  process.exit(1);
}

/* Русский интерфейс подставляется плагином vite на этапе сборки, но словарь надо
   проверить заранее: битый или рассинхронизированный ru.tsv не должен уехать в public/fmg. */
const localeCheck = spawnSync(process.execPath, [join(vendor, 'locale', 'extract.mjs'), '--check'], {
  cwd: vendor,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (localeCheck.error) throw localeCheck.error;
if (localeCheck.status !== 0) throw new Error('Проверка перевода Azgaar не пройдена, см. vendor/azgaar-fantasy-map-generator/locale/ru.tsv.');

rmSync(output, { recursive: true, force: true });
const result = spawnSync(
  vite,
  ['build', '--mode', 'electron', '--base=/fmg/', '--outDir', output, '--emptyOutDir'],
  { cwd: vendor, stdio: 'inherit', shell: process.platform === 'win32' },
);
if (result.error) throw result.error;
if (result.status !== 0)
  throw new Error(`Сборка Azgaar завершилась с кодом ${result.status ?? result.signal}.`);

/* MIR уже обслуживает /fmg/ корневым service worker и прекэширует все файлы.
   Вложенный upstream-worker использует внешний Workbox CDN и перехватил бы
   этот же путь, поэтому он не публикуется. */
rmSync(join(output, 'sw.js'), { force: true });

const html = readFileSync(join(output, 'index.html'), 'utf8');
if (!html.includes('/fmg/') || !/src="\/fmg\/[^\"]+\.js"/.test(html))
  throw new Error('Сборка Azgaar не использует ожидаемую базу /fmg/ или не содержит входной скрипт.');
if (/googletagmanager\.com|storage\.googleapis\.com/.test(html))
  throw new Error('В HTML Azgaar осталась внешняя аналитика или CDN-загрузка.');
if (existsSync(join(output, 'sw.js')))
  throw new Error('Не удалось убрать вложенный service worker Azgaar.');

const files = [];
const walk = (directory) => {
  for (const name of readdirSync(directory)) {
    const file = join(directory, name);
    if (statSync(file).isDirectory()) walk(file);
    else files.push(file);
  }
};
walk(output);
const bytes = files.reduce((sum, file) => sum + statSync(file).size, 0);
console.log(`Azgaar собран: ${files.length} файлов, ${(bytes / 1024 / 1024).toFixed(1)} МиБ → public/fmg/`);
