#!/usr/bin/env node
/* Разбор готового MIR.apk: что внутри и почему он может не работать.

   Запуск:
     npm run apk:doctor               — разобрать MIR.apk в корне проекта
     npm run apk:doctor -- путь.apk   — разобрать любой другой файл
     npm run apk:doctor -- --verbose  — печатать весь разбор в консоль

   Скрипт ничего не собирает. Он открывает уже существующий файл и читает
   его так же, как это делает Android: ZIP → AndroidManifest → ресурсы →
   байт-код → подписи. Каждая проверка в журнале сопровождается тем, как
   её провал выглядит на телефоне: «Приложение не установлено», «Проблема
   при синтаксическом анализе пакета», мгновенное закрытие, чёрный экран.

   Результат: отчёт на экране, полный протокол в logs/apk-doctor.log и
   копия в logs/apk-report.txt (её удобно переслать целиком).
*/

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import './lib/root.mjs';
import { createLogger, human, sha256 } from './lib/log.mjs';
import { auditApk, PHONE_LOG_HELP, fingerprint } from './lib/apk-audit.mjs';
import { readZip } from './lib/apk-read.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const candidates = args.length ? args : ['MIR.apk', 'dist-app/MIR.apk'];
const target = candidates.find((p) => existsSync(p));

console.log('============================================================');
console.log('  The civilization of the sages — диагностика Android (.apk)');
console.log('============================================================');

if (!target) {
  console.log('');
  console.log('  Файл не найден. Искал:');
  for (const c of candidates) console.log(`    • ${c}`);
  console.log('');
  console.log('  Сначала соберите приложение: npm run build:apk');
  console.log('  Или укажите путь: npm run apk:doctor -- C:\\путь\\MIR.apk');
  process.exit(1);
}

const log = createLogger('apk-doctor', { title: `Разбор ${target}` });

try {
  const buf = readFileSync(target);
  const stat = statSync(target);

  log.section('Файл');
  log.detail('Путь', target);
  log.detail('Размер', human(buf.length));
  log.detail('Изменён', stat.mtime.toLocaleString('ru-RU'));
  log.detail('SHA-256', sha256(buf));
  log.check(buf.length > 10000, 'файл не обрезан', {
    fail: 'файл слишком мал — скорее всего сборка прервалась или файл не докачался',
  });

  const info = auditApk(buf, log);

  /* --- Свежесть: собран ли APK из того, что лежит в проекте сейчас --- */
  log.section('Свежесть сборки');
  if (existsSync('mir.html')) {
    const zip = readZip(buf);
    const inside = zip.byName.get('assets/mir.html');
    const outside = readFileSync('mir.html');
    const same = inside && inside.data.includes(outside.subarray(0, 2000));
    log.detail('mir.html в проекте', human(outside.length));
    log.detail('mir.html внутри APK', inside ? human(inside.data.length) : 'нет');
    if (!same) {
      log.warn(
        'игра внутри APK не совпадает с текущим mir.html',
        'APK собран из другой версии исходников — пересоберите: npm run build:apk',
      );
    } else {
      log.ok('внутри APK та же версия игры, что и в проекте');
    }
  }

  if (existsSync('data/apk-signing-key.json')) {
    try {
      const saved = JSON.parse(readFileSync('data/apk-signing-key.json', 'utf8'));
      const cert = Buffer.from(saved.certificate, 'base64');
      const same = sha256(cert) === info.signature?.certSha256;
      log.check(same, 'пакет подписан ключом из data/apk-signing-key.json', {
        fail: 'файл подписан другим ключом: поверх установленной игры он не встанет («Приложение не установлено»)',
      });
      new crypto.X509Certificate(cert);
      log.ok('сохранённый сертификат читается строгим разборщиком X.509');
    } catch (err) {
      log.fail(
        `сохранённый сертификат подписи испорчен: ${err.message}`,
        'удалите data/apk-signing-key.json, соберите заново и удалите старую версию игры с телефона',
      );
    }
  }

  /* --- Итог --------------------------------------------------------- */
  const ok = log.problems.length === 0;
  const verdict = [];
  verdict.push('============================================================');
  verdict.push(`  Разбор ${target}`);
  verdict.push('============================================================');
  verdict.push(`  Пакет:     ${info.package} (${info.label ?? 'без названия'})`);
  verdict.push(`  Версия:    ${info.versionName} (код ${info.versionCode})`);
  verdict.push(`  Android:   minSdk ${info.minSdk}, targetSdk ${info.targetSdk}`);
  verdict.push(`  Активность: ${info.activity}`);
  verdict.push(`  Запускает: ${info.startUrl ?? '—'}`);
  verdict.push(`  Размер:    ${human(info.size)}, файлов внутри ${info.entries}`);
  verdict.push(`  Подпись:   ${info.signature?.keyType ?? '?'} ${info.signature?.keyBits ?? ''} бит`);
  const print = fingerprint(info.signature?.certSha256);
  verdict.push(`  Отпечаток: ${print.slice(0, 48).replace(/:$/, '')}`);
  verdict.push(`             ${print.slice(48)}`);
  verdict.push('');
  if (ok) {
    verdict.push('  ✓ Проверки пройдены: по формату пакет корректен.');
    verdict.push('    Значит, если телефон его не ставит или не запускает,');
    verdict.push('    причина на стороне телефона — и её покажут логи:');
  } else {
    verdict.push('  ✗ Найдены проблемы — именно они и ломают установку/запуск:');
    for (const p of log.problems) verdict.push(`      • ${p}`);
  }
  if (log.warnings.length) {
    verdict.push('');
    verdict.push('  Предупреждения:');
    for (const w of log.warnings) verdict.push(`      ! ${w}`);
  }
  verdict.push('');
  verdict.push(PHONE_LOG_HELP);
  verdict.push('');
  verdict.push(`  Полный протокол разбора: ${log.file}`);

  const text = verdict.join('\n');
  console.log(`\n${text}`);
  writeFileSync('logs/apk-report.txt', `${text}\n`, 'utf8');
  log.raw(text);

  /* Отчёт сразу в буфер обмена — чтобы его можно было просто вставить в чат. */
  try {
    if (process.platform === 'win32') spawn('clip', { stdio: ['pipe', 'ignore', 'ignore'] }).stdin.end(Buffer.from(text, 'utf8'));
    else if (process.platform === 'darwin') spawn('pbcopy', { stdio: ['pipe', 'ignore', 'ignore'] }).stdin.end(Buffer.from(text, 'utf8'));
  } catch {
    /* нет буфера обмена — не страшно, отчёт лежит файлом */
  }
  console.log('\n  Отчёт сохранён в logs/apk-report.txt (и скопирован в буфер обмена).');

  log.finish({ silent: true });
  process.exit(ok ? 0 : 1);
} catch (err) {
  log.error(err, 'разбор APK');
  console.log('');
  console.log('  ✗ Файл не удалось разобрать целиком — он повреждён или это не APK.');
  console.log('    Подробности и стек — в журнале.');
  log.finish();
  process.exit(1);
}
