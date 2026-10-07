/* Проверка артефактов сборки. Запуск: npm run build && npm run single && npm run test:build

   Смотреть на собранные файлы глазами бессмысленно (в mir.html двести
   килобайт кода в одну строку), а ошибка в сборке видна игроком, а не
   нами: чёрный экран вместо меню. Поэтому проверяем ровно то, что ломает
   сборка, — самодостаточность, версию, отсутствие модульного синтаксиса,
   живость ссылок и бюджеты веса. Подробности — в scripts/lib/verify-build.mjs. */

import { checkAll } from './lib/verify-build.mjs';
import './lib/root.mjs';

console.log('Проверка сборки: dist/ и mir.html\n');

const checks = checkAll();
let bad = 0;
for (const check of checks) {
  console.log(`${check.ok ? '  ✓' : '  ×'} ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);
  if (!check.ok) bad += 1;
}

console.log('');
if (bad) {
  console.log(`СБОРКА СЛОМАНА: не прошло проверок — ${bad} из ${checks.length}.`);
  console.log('Соберите заново: npm run build && npm run single');
  process.exit(1);
}
console.log(`ВСЁ ХОРОШО — ${checks.length} проверок сборки.`);
