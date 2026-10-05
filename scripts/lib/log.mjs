/* Журнал сборки и диагностики.

   Зачем: когда «файл собрался, а на телефоне не запускается», нужен не
   бодрый вывод «✓ готово», а подробный протокол: что именно собиралось,
   какие получились размеры и смещения, какие проверки прошли и какая
   именно упала. Поэтому каждый сборщик пишет два потока сразу:

     • консоль — короткий человеческий ход дела;
     • файл logs/<имя>.log — вообще всё, с временем, стадиями, байтами,
       хеш-суммами и полными стеками ошибок.

   Файл перезаписывается на каждом запуске, предыдущий остаётся рядом как
   <имя>.prev.log — чтобы можно было сравнить «было/стало».

   Использование:

     import { createLogger } from './lib/log.mjs';
     const log = createLogger('apk-build', { title: 'Сборка MIR.apk' });
     log.section('1. Исходники');
     log.step('Собираю mir.html');
     log.detail('Размер', '91 867 байт');
     log.check(true, 'mir.html собран', { fail: 'Android покажет пустой экран' });
     log.finish();
*/

import { appendFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { ROOT } from './root.mjs';

const LOG_DIR = join(ROOT, 'logs');

/** Человеко-читаемый размер: 1 234 567 → «1 234 567 Б (1.18 МБ)». */
export function human(bytes) {
  const group = String(bytes).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  if (bytes < 1024) return `${group} Б`;
  if (bytes < 1024 * 1024) return `${group} Б (${(bytes / 1024).toFixed(1)} КБ)`;
  return `${group} Б (${(bytes / 1024 / 1024).toFixed(2)} МБ)`;
}

/** Короткая SHA-256 для сверки «тот ли это файл». */
export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Hex-дамп первых байтов — удобно сверять сигнатуры (dex\n035, PK\x03\x04). */
export function hexHead(buf, count = 16) {
  const head = buf.subarray(0, count);
  const hex = [...head].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const ascii = [...head].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
  return `${hex}  |${ascii}|`;
}

const stamp = () => {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
};

/**
 * Создаёт журнал. name — имя файла в logs/ без расширения.
 * Опции: title — заголовок отчёта; verbose — печатать в консоль вообще всё
 * (включается ещё и флагом --verbose или переменной MIR_LOG=debug).
 */
export function createLogger(name, { title = name, verbose = false } = {}) {
  const wantVerbose =
    verbose ||
    process.argv.includes('--verbose') ||
    process.argv.includes('-v') ||
    String(process.env.MIR_LOG ?? '').toLowerCase() === 'debug';

  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  const file = join(LOG_DIR, `${name}.log`);
  const prev = join(LOG_DIR, `${name}.prev.log`);
  try {
    if (existsSync(file)) renameSync(file, prev);
  } catch {
    /* прошлый журнал мог быть открыт в блокноте — не повод падать */
  }

  const started = Date.now();
  const problems = [];
  const warnings = [];
  let checks = 0;
  let stage = 'старт';

  const writeFile = (line) => {
    try {
      appendFileSync(file, `${line}\n`, 'utf8');
    } catch {
      /* журнал не должен ломать сборку */
    }
  };

  const out = (consoleLine, fileLine = consoleLine, { onlyFile = false } = {}) => {
    writeFile(`[${stamp()}] [+${String(Date.now() - started).padStart(5)}мс] [${stage}] ${fileLine}`);
    if (!onlyFile) console.log(consoleLine);
    else if (wantVerbose) console.log(consoleLine);
  };

  try {
    writeFileSync(file, '', 'utf8');
  } catch {
    /* нет прав на запись — продолжаем без файла */
  }

  writeFile('='.repeat(78));
  writeFile(`  ${title}`);
  writeFile(`  ${new Date().toString()}`);
  writeFile('='.repeat(78));
  writeFile(`node        ${process.version}`);
  writeFile(`платформа   ${os.platform()} ${os.release()} ${os.arch()}`);
  writeFile(`машина      ${os.hostname()}, ядер ${os.cpus().length}, память ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} ГБ`);
  writeFile(`каталог     ${ROOT}`);
  writeFile(`команда     ${process.argv.join(' ')}`);
  writeFile(`журнал      ${file}`);
  writeFile('-'.repeat(78));

  const log = {
    /** Путь к файлу журнала — его печатают в конце и просят прислать. */
    file,
    /** Собранные за прогон ошибки (пустой массив = всё хорошо). */
    problems,
    warnings,

    /** Крупный раздел: «3. DEX» — заодно становится меткой стадии в файле. */
    section(label) {
      stage = label.replace(/^\d+\.\s*/, '').toLowerCase();
      writeFile('');
      writeFile('-'.repeat(78));
      writeFile(`### ${label}`);
      writeFile('-'.repeat(78));
      console.log(`\n${label}`);
    },

    /** Шаг внутри раздела. */
    step(text) {
      out(`  • ${text}`, `ШАГ    ${text}`);
    },

    /** Подробность «ключ: значение» — в консоль только в подробном режиме. */
    detail(key, value) {
      out(`      ${key}: ${value}`, `       ${key}: ${value}`, { onlyFile: true });
    },

    /** Строка только в файл (таблицы, дампы, дизассемблер). */
    raw(text = '') {
      for (const line of String(text).split('\n')) writeFile(`       ${line}`);
      if (wantVerbose) console.log(String(text).replace(/^/gm, '      '));
    },

    /** Таблица: массив объектов с одинаковыми ключами. */
    table(rows) {
      if (!rows.length) return;
      const cols = Object.keys(rows[0]);
      const width = Object.fromEntries(
        cols.map((c) => [c, Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length))]),
      );
      const line = (cells) => cols.map((c) => String(cells[c] ?? '').padEnd(width[c])).join('  ');
      log.raw(line(Object.fromEntries(cols.map((c) => [c, c]))));
      log.raw(cols.map((c) => '-'.repeat(width[c])).join('  '));
      for (const row of rows) log.raw(line(row));
    },

    /** Описание двоичного артефакта: размер, SHA-256, первые байты. */
    blob(label, buf) {
      log.detail(label, `${human(buf.length)}, sha256 ${sha256(buf).slice(0, 16)}…`);
      log.raw(`${label}: ${hexHead(buf)}`);
    },

    /** Информационная строка. */
    info(text) {
      out(`    ${text}`, `ИНФО   ${text}`);
    },

    /** Успешная проверка. */
    ok(text) {
      out(`    ✓ ${text}`, `ОК     ${text}`);
    },

    /** Предупреждение: сборка продолжается, но это стоит знать. */
    warn(text, why = '') {
      warnings.push(text);
      out(`    ! ${text}`, `ВНИМАНИЕ ${text}${why ? ` — ${why}` : ''}`);
      if (why) out(`      ${why}`, '', { onlyFile: true });
    },

    /** Ошибка: записывается в итог и в список проблем. */
    fail(text, why = '') {
      problems.push(why ? `${text} — ${why}` : text);
      console.log(`    ✗ ${text}`);
      if (why) console.log(`      ${why}`);
      writeFile(`[${stamp()}] [${stage}] ОШИБКА ${text}${why ? ` — ${why}` : ''}`);
    },

    /**
     * Проверка с объяснением. При провале в журнал уходит не только
     * «не сошлось», но и то, как это выглядит на телефоне.
     *
     *   log.check(cond, 'resources.arsc не сжат', {
     *     fail: 'Android 11+ откажет: INSTALL_PARSE_FAILED_RESOURCES_ARSC_COMPRESSED',
     *   });
     */
    check(condition, text, { fail = '', detail = '' } = {}) {
      checks++;
      if (condition) {
        out(`    ✓ ${text}`, `ПРОВЕРКА ОК  ${text}${detail ? ` (${detail})` : ''}`, { onlyFile: true });
      } else {
        log.fail(`не выполнено: ${text}`, fail);
        if (detail) writeFile(`       подробности: ${detail}`);
      }
      return Boolean(condition);
    },

    /** Полный разбор исключения: стадия, сообщение, стек, причина. */
    error(err, context = '') {
      const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      problems.push(context ? `${context}: ${text}` : text);
      console.log(`\n  ✗ ОШИБКА${context ? ` (${context})` : ''}: ${text}`);
      writeFile('');
      writeFile(`!!! ИСКЛЮЧЕНИЕ на стадии «${stage}»${context ? ` (${context})` : ''}`);
      writeFile(`    ${text}`);
      if (err instanceof Error && err.stack) writeFile(err.stack.replace(/^/gm, '    '));
      if (err && err.cause) writeFile(`    причина: ${err.cause}`);
      for (const key of ['code', 'errno', 'syscall', 'path']) {
        if (err && err[key] !== undefined) writeFile(`    ${key}: ${err[key]}`);
      }
    },

    /** Итог: сводка проверок, список проблем, путь к журналу. */
    finish({ silent = false } = {}) {
      writeFile('');
      writeFile('-'.repeat(78));
      writeFile(`Проверок выполнено: ${checks}`);
      writeFile(`Предупреждений: ${warnings.length}`);
      writeFile(`Ошибок: ${problems.length}`);
      for (const p of problems) writeFile(`  ✗ ${p}`);
      writeFile(`Длительность: ${((Date.now() - started) / 1000).toFixed(2)} с`);
      writeFile('='.repeat(78));
      if (silent) return problems.length === 0;

      if (problems.length) {
        console.log('\n  Что пошло не так:');
        for (const p of problems) console.log(`    ✗ ${p}`);
      }
      if (warnings.length) {
        console.log('\n  Предупреждения:');
        for (const w of warnings) console.log(`    ! ${w}`);
      }
      console.log(`\n  Подробный журнал: ${file.replace(`${ROOT}/`, '').replace(`${ROOT}\\`, '')}`);
      console.log(`  Проверок: ${checks}, предупреждений: ${warnings.length}, ошибок: ${problems.length}`);
      return problems.length === 0;
    },
  };

  /* Падение где угодно (в том числе в асинхронном коде) обязано попасть
     в журнал: иначе пользователь увидит огрызок стека в консоли и закроет окно. */
  const crash = (err, kind) => {
    log.error(err, kind);
    log.finish();
    process.exit(1);
  };
  process.on('uncaughtException', (err) => crash(err, 'необработанное исключение'));
  process.on('unhandledRejection', (err) => crash(err, 'необработанный отказ промиса'));

  return log;
}
