// Полная сборка всех форматов: Web, Windows (.exe) и Android (.apk).
// Запуск: node build-all.mjs

import { spawnSync } from 'node:child_process';

console.log('============================================================');
console.log('  MIR — The civilization of the sages');
console.log('  Сборка всех форматов (Web + Windows .exe + Android .apk)');
console.log('============================================================\n');

console.log('[1/3] Сборка веб-версии (dist/ и mir.html)...');
const r1 = spawnSync('node', ['build-single.mjs'], { stdio: 'inherit' });
if (r1.status !== 0) process.exit(r1.status || 1);

console.log('\n[2/3] Сборка Windows приложения (.exe установщик)...');
const r2 = spawnSync('node', ['build-exe.mjs'], { stdio: 'inherit' });
if (r2.status !== 0) process.exit(r2.status || 1);

console.log('\n[3/3] Сборка Android приложения (.apk установщик)...');
const r3 = spawnSync('node', ['build-apk.mjs'], { stdio: 'inherit' });
if (r3.status !== 0) process.exit(r3.status || 1);

console.log('\n============================================================');
console.log('  ВСЕ СБОРКИ УСПЕШНО ЗАВЕРШЕНЫ!');
console.log('  Файлы для отправки друзьям:');
console.log('    • Windows:  MIR-Setup.exe  (или dist-app/MIR-Setup.exe)');
console.log('    • Android:  MIR.apk        (или dist-app/MIR.apk)');
console.log('    • Браузер:  mir.html       (или папка dist/)');
console.log('============================================================\n');
