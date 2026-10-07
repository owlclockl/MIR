/* Сборка веб-версии в dist/. Запуск: npm run build

   Это то, что раздаёт сервер (`npm run share`), хаб, установщик .exe и
   хостинг: index.html, хешированные скрипт и стили, иконки, манифест и
   собранный service worker. После сборки сразу проверяются её артефакты
   (ссылки, версия, имя кэша, бюджеты веса) — сломанная сборка падает здесь,
   а не у игрока в виде чёрного экрана. */

import { statSync } from 'node:fs';
import { buildWeb } from './lib/build.mjs';
import { checkWeb } from './lib/verify-build.mjs';

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} КБ`;
const started = Date.now();

const output = await buildWeb({ logLevel: 'warn' });
const files = output.filter((item) => typeof item.fileName === 'string');
const total = files.reduce((sum, item) => sum + (item.type === 'chunk' ? item.code.length : 0), 0);
const seconds = ((Date.now() - started) / 1000).toFixed(1);

const js = files.find((item) => item.type === 'chunk');
console.log(`dist готов — ${files.length} файлов, ${kb(total)} кода за ${seconds} с`);
if (js) console.log(`  скрипт: dist/${js.fileName} (${kb(statSync(`dist/${js.fileName}`).size)})`);

const problems = checkWeb().filter((check) => !check.ok);
if (problems.length) {
  console.log('\nПроверка сборки не прошла:');
  for (const problem of problems) console.log(`  × ${problem.what}${problem.detail ? ` — ${problem.detail}` : ''}`);
  process.exit(1);
}
console.log('  проверка сборки: всё сходится');
