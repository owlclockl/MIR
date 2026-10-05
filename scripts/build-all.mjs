// Полная сборка всех форматов: Web, Windows (.exe) и Android (.apk).
// Запуск: npm run build:all
//
// Каждый формат собирается отдельным процессом. Если один не получился
// (например, на компьютере нет компилятора C# для .exe), остальные всё
// равно собираются — в конце печатается честный итог.

import { spawnSync } from 'node:child_process';
import { fromRoot } from './lib/root.mjs';

console.log('============================================================');
console.log('  MIR — The civilization of the sages');
console.log('  Сборка всех форматов (Web + Windows .exe + Android .apk)');
console.log('============================================================\n');

const steps = [
  { title: 'веб-версия (dist/ и mir.html)', script: 'build-single.mjs', result: 'mir.html и папка dist/' },
  { title: 'Windows — установщик .exe', script: 'build-exe.mjs', result: 'MIR-Setup.exe' },
  { title: 'Android — приложение .apk', script: 'build-apk.mjs', result: 'MIR.apk' },
];

const done = [];

steps.forEach((step, index) => {
  console.log(`\n[${index + 1}/${steps.length}] ${step.title}…`);
  const run = spawnSync('node', [fromRoot('scripts', step.script)], { stdio: 'inherit' });
  done.push({ ...step, ok: run.status === 0 });
});

const failed = done.filter((step) => !step.ok);

console.log('\n============================================================');
if (failed.length === 0) {
  console.log('  ВСЕ СБОРКИ УСПЕШНО ЗАВЕРШЕНЫ!');
  console.log('  Файлы для отправки друзьям:');
  console.log('    • Windows:  MIR-Setup.exe  (или dist-app/MIR-Setup.exe)');
  console.log('    • Android:  MIR.apk        (или dist-app/MIR.apk)');
  console.log('    • Браузер:  mir.html       (или папка dist/)');
} else {
  console.log('  ИТОГ СБОРКИ');
  for (const step of done) console.log(`    ${step.ok ? '✓' : '✗'}  ${step.title} — ${step.result}`);
  console.log('');
  console.log('  Что не собралось — смотрите сообщения выше: там написана причина.');
}
console.log('============================================================\n');

process.exit(failed.length ? 1 : 0);
