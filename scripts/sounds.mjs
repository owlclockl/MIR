/* Звуки игрового меню: взять тринадцать коротких откликов из UI SFX.

   Запуск:

     npm run sounds            набор «Arcade» (по умолчанию)
     npm run sounds -- glass   другой набор, здесь — «Glass»

   Библиотека содержит 936 коротких файлов: 78 смысловых откликов (press,
   success, notification, error, open, select, back, unlock и так далее) в 12
   наборах. Для MIR выбраны звуки, которые покрывают щелчки, окна, навигацию,
   переключатели, подключение и скрытый вход администратора.

   Скрипт не зависит ни от чего, кроме Node: сам скачивает tgz-архив пакета
   с registry.npmjs.org (разбор архива — общий с scripts/fonts.mjs модуль
   scripts/lib/tar.mjs: ни tar, ни архиватора в системе быть не должно) и
   раскладывает тринадцать файлов в src/assets/sounds/.

   Лицензия звуков — CC0 1.0 (общественное достояние): можно менять и
   использовать как угодно, без указания автора. Подробности, происхождение
   каждого файла и команда замены — в src/assets/sounds/LICENSE.txt. */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fetchPackage } from './lib/tar.mjs';
import { fromRoot } from './lib/root.mjs';

/* Откуда берём. Версию пакета и состав файлов менять только здесь:
   LICENSE.txt в папке звуков ссылается на эти же цифры. */
const PACKAGE = 'uisfx';
const VERSION = '0.4.0';

/* Наборы библиотеки. Первый — наш по умолчанию: Arcade добавляет меню
   узнаваемый игровой отклик, не превращая фон в навязчивую музыку. */
const PACKS = [
  'arcade',
  'glass',
  'minimal',
  'soft',
  'mechanical',
  'organic',
  'dreamy',
  'scifi',
  'rubber',
  'cinematic',
  'studio',
  'zen',
];

/* Отклик библиотеки → имя файла в проекте. Имена файлов совпадают с тем,
   что передаёт playSound() в src/ui/sound.js, — менять их надо вместе. */
const CUES = [
  ['press', 'click'],
  ['success', 'success'],
  ['notification', 'message'],
  ['error', 'error'],
  ['open', 'open'],
  ['close', 'close'],
  ['toggle-on', 'toggle-on'],
  ['toggle-off', 'toggle-off'],
  ['select', 'select'],
  ['back', 'back'],
  ['unlock', 'unlock'],
  ['connect', 'connect'],
  ['volume-change', 'volume-change'],
];

const OUT_DIR = fromRoot('src', 'assets', 'sounds');
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} КБ`;

/* ---------- работа -------------------------------------------------- */

const pack = (process.argv[2] || PACKS[0]).trim().toLowerCase();

if (!PACKS.includes(pack)) {
  console.error(`Нет такого набора: ${pack}.`);
  console.error(`Доступные: ${PACKS.join(', ')}.`);
  process.exit(1);
}

console.log(`Звуки игрового меню: ${PACKAGE} ${VERSION}, набор «${pack}»`);

let files;
try {
  files = await fetchPackage(PACKAGE, VERSION);
} catch (error) {
  console.error(`Не удалось скачать архив: ${error.message}.`);
  console.error('Проверьте интернет — звуки берутся из сети один раз, дальше они лежат в репозитории.');
  process.exit(1);
}

if (!files.size) {
  console.error('Архив пуст или не разобрался. Обновите версию пакета в scripts/sounds.mjs.');
  process.exit(1);
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

let total = 0;
for (const [cue, name] of CUES) {
  const path = `package/sounds/${pack}/${cue}.mp3`;
  const data = files.get(path);
  if (!data) {
    console.error(`В архиве нет ${path} — возможно, в версии ${VERSION} изменились имена.`);
    process.exit(1);
  }
  writeFileSync(fromRoot('src', 'assets', 'sounds', `${name}.mp3`), data);
  total += data.length;
  console.log(`  ${name}.mp3  ${kb(data.length)}  (${cue}.mp3)`);
}

console.log(`\nГотово: ${CUES.length} файла, ${kb(total)} всего.`);
console.log('Лицензия звуков — CC0 1.0, происхождение — src/assets/sounds/LICENSE.txt.');
console.log('Дальше: npm run build и npm run single, чтобы звуки попали в dist/ и mir.html.');
