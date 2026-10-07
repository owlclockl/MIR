/* Звуки интерфейса: взять восемь откликов из библиотеки UI SFX.

   Запуск:

     npm run sounds            набор «Glass» (по умолчанию)
     npm run sounds -- zen     другой набор, здесь — «Zen»

   Зачем отдельный скрипт. Звуки не рисуются в коде, а берутся готовыми из
   библиотеки: 936 коротких файлов, 78 смысловых откликов (press, success,
   notification, error, open, toggle-on и так далее) в 12 наборах на любой
   характер интерфейса. Перебирать их руками в архиве утомительно, а без
   скрипта через месяц уже не вспомнить, откуда именно взялся click.mp3 и
   какой версии он был.

   Скрипт не зависит ни от чего, кроме Node: сам скачивает tgz-архив пакета
   с registry.npmjs.org, сам его разжимает (tar разбирается вручную — в
   системе не должно быть ни tar, ни архиватора) и раскладывает восемь
   файлов в src/assets/sounds/.

   Лицензия звуков — CC0 1.0 (общественное достояние): можно менять и
   использовать как угодно, без указания автора. Подробности, происхождение
   каждого файла и команда замены — в src/assets/sounds/LICENSE.txt. */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fromRoot } from './lib/root.mjs';

/* Откуда берём. Версию пакета и состав файлов менять только здесь:
   LICENSE.txt в папке звуков ссылается на эти же цифры. */
const PACKAGE = 'uisfx';
const VERSION = '0.4.0';

/* Наборы библиотеки. Первый в списке — наш по умолчанию: тёмное меню с
   волосяными линиями любит «топовый» звук — звонкий и короткий, без
   долгого хвоста, поэтому «хрустальный» Glass. */
const PACKS = [
  'glass',
  'minimal',
  'soft',
  'arcade',
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
];

const OUT_DIR = fromRoot('src', 'assets', 'sounds');
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} КБ`;

/* ---------- tar ---------------------------------------------------- */

/* Архив npm — это gzip поверх tar. tar устроен просто: 512-байтовый
   заголовок, затем данные, выровненные по 512 байт. Нам нужны только
   обычные файлы (тип '0' или пустой — старый формат), поэтому никаких
   ссылок, каталогов и длинных имён не разбираем. */
function untar(buffer) {
  const files = new Map();
  let offset = 0;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break; // конец архива: два пустых блока подряд

    const rawSize = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
    const size = rawSize ? parseInt(rawSize, 8) : 0;
    const type = String.fromCharCode(header[156]);
    const start = offset + 512;

    if (type === '0' || type === '\u0000') {
      files.set(name, buffer.subarray(start, start + size));
    }
    offset = start + Math.ceil(size / 512) * 512;
  }

  return files;
}

/* ---------- работа -------------------------------------------------- */

const pack = (process.argv[2] || PACKS[0]).trim().toLowerCase();

if (!PACKS.includes(pack)) {
  console.error(`Нет такого набора: ${pack}.`);
  console.error(`Доступные: ${PACKS.join(', ')}.`);
  process.exit(1);
}

const url = `https://registry.npmjs.org/${PACKAGE}/-/${PACKAGE}-${VERSION}.tgz`;
console.log(`Звуки интерфейса: ${PACKAGE} ${VERSION}, набор «${pack}»`);
console.log(`  скачиваю ${url}`);

let files;
try {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`сервер ответил ${response.status}`);
  files = untar(gunzipSync(Buffer.from(await response.arrayBuffer())));
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
