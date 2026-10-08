// Полная сборка всех форматов: Web, Windows (.exe) и Android (.apk).
// Запуск: npm run build:all
//         node scripts/build-all.mjs --only=web,apk     (только нужное)
//
// Каждый формат собирается отдельным процессом: падение одного не мешает
// остальным (например, на компьютере без компилятора C# не соберётся .exe,
// зато .apk и веб-версия получатся). В конце — честный итог: что вышло,
// сколько весит, тот ли это файл (sha256) и прошла ли проверка сборки
// (scripts/lib/verify-build.mjs).

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { fromRoot } from './lib/root.mjs';
import { checkAll } from './lib/verify-build.mjs';

const steps = [
  {
    id: 'web',
    title: 'веб-версия (папка dist/)',
    script: 'build-web.mjs',
    artifacts: ['dist/index.html'],
    hint: 'её раздаёт сервер, хаб, хостинг и установщик .exe',
  },
  {
    id: 'single',
    title: 'автономная версия The civilization of the sages',
    script: 'build-single.mjs',
    artifacts: ['mir.html'],
    hint: 'двойной клик, флешка, вложение в мессенджере и .apk',
  },
  {
    id: 'exe',
    title: 'Windows — The civilization of the sages',
    script: 'build-exe.mjs',
    artifacts: ['MIR-Setup.exe'],
    hint: 'нужен csc.exe из .NET Framework (есть на Windows 10/11)',
  },
  {
    id: 'apk',
    title: 'Android — приложение Sages',
    script: 'build-apk.mjs',
    artifacts: ['MIR.apk'],
    hint: 'собирается без Android SDK: свой упаковщик подписи',
  },
];

/* ---------- аргументы --------------------------------------------- */

function parseArgs(argv) {
  const opts = { only: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--only=')) opts.only = arg.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--only') opts.only = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else {
      console.error(`Неизвестный флаг: ${arg}\nПодсказка: node scripts/build-all.mjs --help`);
      process.exit(2);
    }
  }
  return opts;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Сборка всех форматов The civilization of the sages.

  node scripts/build-all.mjs [--only=СПИСОК]

  --only=web,single,exe,apk   собрать только перечисленные форматы
  --help               эта справка

Форматы: ${steps.map((step) => step.id).join(', ')}`);
  process.exit(0);
}

const selected = args.only
  ? steps.filter((step) => args.only.includes(step.id))
  : steps;

if (!selected.length) {
  console.error(`Нечего собирать: неизвестные форматы «${args.only.join(', ')}». Доступны: ${steps.map((s) => s.id).join(', ')}.`);
  process.exit(2);
}

const human = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} МБ` : `${(bytes / 1024).toFixed(0)} КБ`;

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12);

/* ---------- сборка ------------------------------------------------- */

console.log('============================================================');
console.log('  The civilization of the sages');
console.log(`  Сборка: ${selected.map((step) => step.id).join(', ')}`);
console.log('============================================================');

const done = [];

selected.forEach((step, index) => {
  console.log(`\n[${index + 1}/${selected.length}] ${step.title}…`);
  if (step.hint) console.log(`      ${step.hint}`);
  const started = Date.now();
  const run = spawnSync('node', [fromRoot('scripts', step.script)], { stdio: 'inherit' });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  const found = step.artifacts.filter((path) => existsSync(path) && statSync(path).size > 0);
  const artifacts = found.map((path) => `${path} — ${human(statSync(path).size)}, sha256 ${sha256(path)}`);
  const ok = run.status === 0 && found.length === step.artifacts.length;

  if (run.status === 0 && !ok)
    console.log(`      Файлы не найдены: ${step.artifacts.filter((p) => !found.includes(p)).join(', ')}`);

  done.push({ ...step, ok, seconds, artifacts });
});

/* ---------- проверка результата ------------------------------------ */

const webBuilt = done.some((step) => step.id === 'web' && step.ok);
let checks = null;
if (webBuilt) {
  console.log('\nПроверка собранного (структура, версия, ссылки, бюджеты)…');
  checks = checkAll();
  const failed = checks.filter((check) => !check.ok);
  console.log(`      ${checks.length - failed.length} из ${checks.length} проверок пройдено`);
  for (const check of failed) console.log(`      × ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);
}

/* ---------- итог ---------------------------------------------------- */

const failedSteps = done.filter((step) => !step.ok);
const brokenChecks = checks ? checks.filter((check) => !check.ok) : [];

console.log('\n============================================================');
if (!failedSteps.length && !brokenChecks.length) {
  console.log('  ВСЕ СБОРКИ УСПЕШНО ЗАВЕРШЕНЫ');
  console.log('');
  for (const step of done) {
    console.log(`  ${step.title} — ${step.seconds} с`);
    for (const artifact of step.artifacts) console.log(`    • ${artifact}`);
  }
  console.log('');
  console.log('  Что отправить друзьям:');
  console.log('    • Windows:  The civilization of the sages (MIR-Setup.exe)');
  console.log('    • Android:  Sages (MIR.apk)');
  console.log('    • Браузер:  The civilization of the sages (mir.html или dist/)');
} else {
  console.log('  ИТОГ СБОРКИ — есть проблемы');
  for (const step of done) console.log(`    ${step.ok ? '✓' : '✗'}  ${step.title} — ${step.ok ? step.seconds + ' с' : 'не собралось'}`);
  if (brokenChecks.length) console.log(`    ✗  проверка сборки — не прошло: ${brokenChecks.map((c) => c.what).join('; ')}`);
  console.log('');
  console.log('  Что именно случилось — смотрите сообщения выше: там написана причина.');
}
console.log('============================================================\n');

process.exit(failedSteps.length || brokenChecks.length ? 1 : 0);
