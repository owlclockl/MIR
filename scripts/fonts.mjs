/* Шрифты интерфейса: Inter и Manrope рядом с кодом, а не на стороннем CDN.

   Запуск:

     npm run fonts

   Зачем. Раньше index.html подключал Inter и Manrope ссылкой на
   fonts.googleapis.com: без сети (офлайн-PWA, mir.html двойным кликом, APK,
   .exe) интерфейс рисовался системным шрифтом, а первый экран ждал чужой
   домен. Теперь четыре woff2 лежат в репозитории, раздаются со своего
   адреса и входят в офлайн-кэш; в однофайловых сборках они вшиты внутрь
   (см. src/assets/fonts/fonts.css).

   Что берём. Пакеты @fontsource-variable/* — это те же начертания Google
   Fonts, подготовленные для самостоятельного хостинга: вариативные
   `wght`-файлы, разбитые по подмножествам Unicode. Нам нужны два
   подмножества на семейство: latin (латиница, кавычки, тире, многоточие) и
   cyrillic (кириллица, включая ё). Расширенные подмножества (latin-ext,
   cyrillic-ext, греческое, вьетнамское) намеренно не берём: интерфейс
   русский, а каждое лишнее подмножество — это ещё один файл в офлайн-кэше.

   Скрипт не зависит ни от чего, кроме Node: сам скачивает tgz с
   registry.npmjs.org (разбор архива — scripts/lib/tar.mjs) и раскладывает
   файлы в src/assets/fonts/. Лицензии (SIL OFL 1.1) лежат рядом и
   обновляются вместе с файлами. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fetchPackage } from './lib/tar.mjs';
import { fromRoot } from './lib/root.mjs';

/* Версия пакетов и состав подмножеств. Менять только здесь: таблица в
   src/assets/fonts/LICENSE.txt ссылается на эти же цифры. */
const PACKAGES = [
  { name: '@fontsource-variable/inter', version: '5.3.0', family: 'Inter', slug: 'inter' },
  { name: '@fontsource-variable/manrope', version: '5.3.0', family: 'Manrope', slug: 'manrope' },
];

/* Подмножества: имя в пакете → подпись для человека. */
const SUBSETS = [
  ['cyrillic', 'кириллица'],
  ['latin', 'латиница и типографика'],
];

const OUT_DIR = fromRoot('src', 'assets', 'fonts');
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} КБ`;

console.log('Шрифты интерфейса: Inter и Manrope для самостоятельного хостинга');

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const written = [];
const writtenRanges = [];
for (const pack of PACKAGES) {
  console.log(`\n${pack.family}: ${pack.name} ${pack.version}`);
  let files;
  try {
    files = await fetchPackage(pack.name, pack.version);
  } catch (error) {
    console.error(`Не удалось скачать архив: ${error.message}.`);
    console.error('Проверьте интернет — шрифты берутся из сети один раз, дальше они лежат в репозитории.');
    process.exit(1);
  }

  /* unicode.json пакета — тот же список диапазонов, что отдаёт Google
     Fonts. Из него берутся значения для проверки fonts.css. */
  let ranges = {};
  try {
    ranges = JSON.parse(files.get('package/unicode.json').toString('utf8'));
  } catch {
    ranges = {};
  }
  writtenRanges.push(ranges);

  for (const [subset, label] of SUBSETS) {
    const path = `package/files/${pack.slug}-${subset}-wght-normal.woff2`;
    const data = files.get(path);
    if (!data) {
      console.error(`В архиве нет ${path} — возможно, в версии ${pack.version} изменились имена.`);
      process.exit(1);
    }
    const name = `${pack.slug}-${subset}-wght-normal.woff2`;
    writeFileSync(fromRoot('src', 'assets', 'fonts', name), data);
    written.push(name);
    console.log(`  ${name}  ${kb(data.length)}  (${label})`);
  }

  /* Лицензия семейства — копия из пакета, чтобы авторство и OFL ехали
     вместе со шрифтом, а не оставались в архиве на чужом сервере. */
  const license = files.get('package/LICENSE');
  if (!license) {
    console.error(`В архиве ${pack.name} нет LICENSE — лицензия не скопирована.`);
    process.exit(1);
  }
  writeFileSync(fromRoot('src', 'assets', 'fonts', `${pack.slug}-OFL.txt`), license);
  console.log(`  ${pack.slug}-OFL.txt  ${kb(license.length)}  (SIL OFL 1.1)`);
}

/* Проверка на выходе: замена файлов не должна разойтись с разметкой
   @font-face — иначе браузер молча не найдёт шрифт и возьмёт системный. */
const css = readFileSync(fromRoot('src', 'assets', 'fonts', 'fonts.css'), 'utf8');
const missing = written.filter((name) => !css.includes(name));
if (missing.length) {
  console.error(`\nВ fonts.css не описаны файлы: ${missing.join(', ')}.`);
  console.error('Допишите @font-face — без него шрифт не подключится.');
  process.exit(1);
}

/* Диапазоны Unicode сверяем с пакетом, а не с памятью: если обновление
   изменит состав подмножества, а fonts.css останется прежним, часть букв
   начнёт рисоваться системным шрифтом — посреди фирменного текста и
   незаметно. Молча это произойти не должно. */
const compact = (text) => text.replace(/\s+/g, '');
const drifted = [];
for (const ranges of writtenRanges) {
  for (const [subset] of SUBSETS) {
    const range = ranges[subset];
    if (!range) drifted.push(`${subset}: нет данных в unicode.json пакета`);
    else if (!compact(css).includes(compact(range))) drifted.push(`${subset}: ${range}`);
  }
}
if (drifted.length) {
  console.error('\nfonts.css разошёлся с пакетом — поправьте unicode-range:');
  for (const line of drifted) console.error(`  ${line}`);
  process.exit(1);
}

const total = written.reduce((sum, name) => sum + readFileSync(fromRoot('src', 'assets', 'fonts', name)).length, 0);
console.log(`\nГотово: ${written.length} файла, ${kb(total)} всего.`);
console.log('Лицензии — SIL OFL 1.1, сведения и происхождение — src/assets/fonts/LICENSE.txt.');
console.log('Дальше: npm run build и npm run single, чтобы шрифты попали в dist/ и mir.html.');
