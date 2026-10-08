/* Проверка артефактов сборки.

   Зачем. Сборка — единственный шаг, который нельзя перепроверить на глаз:
   сломанный `mir.html` открывается чёрным экраном, а лишний файл в `dist/`
   на хостинге замечают через неделю. Здесь мы разбираем готовые файлы и
   отвечаем на вопросы, которые иначе всплывают у игрока:

     • самодостаточен ли `mir.html` (нет ли ссылок на файлы вне себя);
     • запустится ли его скрипт по file:// (обычный скрипт, а не модуль);
     • та ли версия в разметке, что в package.json;
     • все ли файлы, на которые ссылается `dist/index.html` и список
       оболочки service worker, реально существуют;
     • не вырос ли вес за бюджеты (щёлкнули не тот ассет — видно сразу).

   Модуль ничего не печатает: он отдаёт список проверок, а показывают его
   `npm run test:build` и `npm run build:all`. */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import vm from 'node:vm';
import { BUILD_INFO_FILE } from './vite-mir.mjs';

const ROOT_FILES = ['dist', 'mir.html'];

/* Бюджеты веса — сигнал о случайно попавших ресурсах, не запрет на продуктовые
   функции. Процедурный мир добавил детерминированный генератор чанков и
   воксельный обзор без внешнего 3D-движка; процедурный атлас и камера RTS
   используют ту же лёгкую Canvas-отрисовку. Звуки web-версии по-прежнему
   отдельными файлами, не в JS. */
export const BUDGETS = {
  js: 232 * 1024,
  css: 84 * 1024,
  fmgCss: 260 * 1024,
  single: 390 * 1024,
};

const version = () => JSON.parse(readFileSync('package.json', 'utf8')).version;

/* Звуки игрового меню: файлы из src/assets/sounds/ (mp3 из библиотеки UI SFX,
   см. scripts/sounds.mjs). Список читается с диска, а не прошивается числом:
   набор звуков меняется командой `npm run sounds`, и проверка обязана
   подхватить новый состав сама. */
const SOUND_FILES = existsSync('src/assets/sounds')
  ? readdirSync('src/assets/sounds').filter((name) => name.endsWith('.mp3'))
  : [];

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} КБ`;

/** Локальные ссылки разметки (/assets/…, /icons/…) и их наличие в dist. */
const localRefs = (html) =>
  [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)]
    .map((match) => match[1])
    .filter((ref) => !ref.startsWith('/api/'));

const walk = (dir, base = dir) => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full).split(sep).join('/'));
  }
  return out;
};

/** Проверки веб-сборки (dist/). */
export function checkWeb() {
  const checks = [];
  const add = (ok, what, detail = '') => checks.push({ ok, what, detail });

  if (!existsSync('dist/index.html')) {
    add(false, 'dist/index.html на месте');
    return checks;
  }
  add(true, 'dist/index.html на месте');

  const files = walk('dist');
  const html = readFileSync('dist/index.html', 'utf8');
  const fmgHtmlPath = 'dist/fmg/index.html';
  const fmgHtml = existsSync(fmgHtmlPath) ? readFileSync(fmgHtmlPath, 'utf8') : '';
  const fmgFiles = files.filter((name) => name.startsWith('fmg/'));
  const fmgEntry = fmgHtml.match(/src="(\/fmg\/[^\"]+\.js)"/)?.[1];
  add(
    Boolean(fmgHtml) && fmgFiles.length > 100 && Boolean(fmgEntry) && existsSync(join('dist', fmgEntry)),
    'полный Azgaar FMG встроен в веб-сборку',
    fmgHtml ? `${fmgFiles.length} файлов, входной модуль ${fmgEntry ?? 'не найден'}` : 'dist/fmg/index.html отсутствует',
  );
  add(
    Boolean(fmgHtml) && !/googletagmanager\.com|storage\.googleapis\.com/.test(fmgHtml) && !existsSync('dist/fmg/sw.js'),
    'FMG не запускает внешнюю аналитику или вложенный service worker',
    'аналитика удалена, офлайн-кэш обслуживает MIR',
  );

  const missing = localRefs(html).filter((ref) => !existsSync(join('dist', ref)));
  add(
    missing.length === 0,
    'все ссылки index.html ведут на существующие файлы',
    missing.length ? `нет: ${missing.join(', ')}` : `${localRefs(html).length} ссылок`,
  );

  const expected = version();
  const meta = html.match(/<meta name="mir-version" content="([^"]+)"/);
  add(
    meta?.[1] === expected,
    'версия в разметке совпадает с package.json',
    `разметка: ${meta?.[1] ?? '—'}, package.json: ${expected}`,
  );

  const jsFiles = files.filter((name) => /^assets\/.*\.js$/.test(name));
  add(jsFiles.length > 0, 'в dist есть скрипт приложения', jsFiles.join(', ') || 'не найден');
  const appCode = jsFiles.map((name) => readFileSync(join('dist', name), 'utf8')).join('\n');
  add(
    appCode.includes('world-fmg-open') && appCode.includes('world-fmg-back') && appCode.includes('world-fmg-overlay') && appCode.includes('<iframe') && appCode.includes('/fmg/index.html?seed=') && appCode.includes('Azgaar'),
    'атлас открывает полноэкранный Azgaar overlay с тем же seed',
    'кнопки, iframe, same-seed и возврат присутствуют в веб-бандле',
  );

  const jsBytes = jsFiles.reduce((sum, name) => sum + statSync(join('dist', name)).size, 0);
  add(
    jsBytes > 0 && jsBytes <= BUDGETS.js,
    `скрипт приложения в бюджете (${kb(BUDGETS.js)})`,
    kb(jsBytes),
  );

  const webSoundAssets = files.filter((name) => name.startsWith('assets/') && name.endsWith('.mp3'));
  const inlineAudio = jsFiles.some((name) =>
    readFileSync(join('dist', name), 'utf8').includes('data:audio/mpeg;base64'),
  );
  add(
    SOUND_FILES.length > 0 && webSoundAssets.length >= SOUND_FILES.length && !inlineAudio,
    'звуки веб-версии — отдельные хешированные ресурсы',
    `${webSoundAssets.length} файлов; base64 в JS: ${inlineAudio ? 'да' : 'нет'}`,
  );

  const assetFiles = files.filter((name) => name.startsWith('assets/'));
  const unhashedAssets = assetFiles.filter((name) => !/^assets\/[^/]+-[A-Za-z0-9_-]{8}\.[^/]+$/.test(name));
  const headersFile = existsSync('dist/_headers') ? readFileSync('dist/_headers', 'utf8') : '';
  const immutableCacheRule = /(?:^|\n)\/assets\/\*\s*\n\s*Cache-Control:\s*public,\s*max-age=31536000,\s*immutable(?:\s|$)/m.test(headersFile);
  add(
    immutableCacheRule && assetFiles.length > 0 && unhashedAssets.length === 0,
    'все хешированные ассеты получают годовой immutable-кеш',
    `${assetFiles.length} файлов; нехешированные: ${unhashedAssets.join(', ') || 'нет'}`,
  );

  const mirCssBytes = files
    .filter((name) => name.startsWith('assets/') && name.endsWith('.css'))
    .reduce((sum, name) => sum + statSync(join('dist', name)).size, 0);
  add(mirCssBytes > 0 && mirCssBytes <= BUDGETS.css, `стили MIR в бюджете (${kb(BUDGETS.css)})`, kb(mirCssBytes));
  const fmgCssBytes = files
    .filter((name) => name.startsWith('fmg/') && name.endsWith('.css'))
    .reduce((sum, name) => sum + statSync(join('dist', name)).size, 0);
  add(
    fmgCssBytes > 0 && fmgCssBytes <= BUDGETS.fmgCss,
    `стили Azgaar в бюджете (${kb(BUDGETS.fmgCss)})`,
    kb(fmgCssBytes),
  );

  /* Service worker: имя кэша и список оболочки. */
  if (!existsSync('dist/sw.js')) {
    add(false, 'dist/sw.js собран');
  } else {
    const sw = readFileSync('dist/sw.js', 'utf8');
    const cache = sw.match(/const CACHE = '([^']+)'/);
    add(
      Boolean(cache) && cache[1].startsWith(`mir-app-${expected}-`) && /-[0-9a-f]{8}$/.test(cache[1]),
      'имя кэша service worker привязано к версии и сборке',
      cache?.[1] ?? 'не найдено',
    );

    const listMatch = sw.match(/const PRECACHE = (\[[\s\S]*?\]);/);
    let precache = [];
    try {
      precache = JSON.parse(listMatch?.[1] ?? '[]');
    } catch {
      precache = [];
    }
    const broken = precache.filter((url) => url !== '/' && !existsSync(join('dist', url)));
    add(
      precache.length > 2 && broken.length === 0,
      'список оболочки service worker существует целиком',
      broken.length ? `нет: ${broken.join(', ')}` : `${precache.length} файлов`,
    );
    const missingFmgPrecache = fmgFiles.filter((name) => !precache.includes(`/${name}`));
    add(
      fmgFiles.length > 100 && precache.includes('/fmg/index.html') && missingFmgPrecache.length === 0,
      'весь редактор Azgaar включён в офлайн-кэш MIR',
      missingFmgPrecache.length ? `вне precache: ${missingFmgPrecache.slice(0, 6).join(', ')}` : `${fmgFiles.length} файлов`,
    );
    add(
      new Set(precache).size === precache.length,
      'в списке оболочки нет повторов',
      `${precache.length - new Set(precache).size} лишних`,
    );
    add(
      !precache.includes('/_headers') && !precache.includes('/_redirects'),
      'метаданные Workers Assets не попали в офлайн-кэш',
      '/_headers и /_redirects исключены',
    );

    /* Новости о версии из кэша не отдаются: иначе приложение сравнивало бы
       старую сборку со старой же и никогда не увидело новую. */
    add(
      !precache.includes(`/${BUILD_INFO_FILE}`),
      `/${BUILD_INFO_FILE} не попал в офлайн-кэш`,
      `файлов оболочки: ${precache.length}`,
    );
    add(
      /mir:skip-waiting/.test(sw) && /\bskipWaiting\b/.test(sw),
      'service worker принимает просьбу «обновить сейчас»',
    );
  }

  /* Новости о сборке: по этому файлу приложение узнаёт, что на сервере
     появилась новая версия. Метка одна на все три места — разметку,
     имя кэша и сам файл: разойдутся — игрок либо не увидит обновление,
     либо будет видеть его вечно. */
  if (!existsSync(`dist/${BUILD_INFO_FILE}`)) {
    add(false, `dist/${BUILD_INFO_FILE} записан сборкой`);
  } else {
    let buildInfo = null;
    try {
      buildInfo = JSON.parse(readFileSync(`dist/${BUILD_INFO_FILE}`, 'utf8'));
    } catch {
      buildInfo = null;
    }
    add(
      buildInfo?.version === expected && /^[0-9a-f]{8}$/.test(buildInfo?.build ?? ''),
      'новости о сборке: версия и метка на месте',
      buildInfo ? `${buildInfo.version}, ${buildInfo.build}` : 'файл не разобран',
    );

    const buildMeta = html.match(/<meta name="mir-build" content="([^"]+)"/);
    add(
      buildMeta?.[1] === buildInfo?.build,
      'метка сборки в разметке совпадает с новостями о сборке',
      `разметка: ${buildMeta?.[1] ?? '—'}, файл: ${buildInfo?.build ?? '—'}`,
    );

    const sw = existsSync('dist/sw.js') ? readFileSync('dist/sw.js', 'utf8') : '';
    const swBuild = sw.match(/const BUILD = '([^']+)'/);
    add(
      swBuild?.[1] === buildInfo?.build,
      'метка сборки в service worker совпадает с новостями о сборке',
      `worker: ${swBuild?.[1] ?? '—'}, файл: ${buildInfo?.build ?? '—'}`,
    );
  }

  /* Манифест и иконки установки приложения. */
  if (existsSync('dist/manifest.webmanifest')) {
    let manifest = null;
    try {
      manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'));
    } catch {
      manifest = null;
    }
    const icons = (manifest?.icons ?? []).map((icon) => icon.src);
    const missingIcons = icons.filter((src) => !existsSync(join('dist', src)));
    add(
      Array.isArray(manifest?.icons) && manifest.icons.length > 0 && missingIcons.length === 0,
      'иконки манифеста на месте',
      missingIcons.length ? `нет: ${missingIcons.join(', ')}` : `${icons.length} иконок`,
    );
  } else {
    add(false, 'манифест установки существует');
  }

  /* Переезд звуков из public/ в бандл не должен оставить старых путей. */
  const staleSounds = files.filter(
    (name) => name.endsWith('.html') || name.endsWith('.js') || name.endsWith('.css'),
  ).filter((name) => readFileSync(join('dist', name), 'utf8').includes('/sounds/'));
  add(staleSounds.length === 0, 'в dist нет ссылок на старые /sounds/', staleSounds.join(', '));

  return checks;
}

/** Проверки однофайловой сборки (mir.html). */
export function checkSingle() {
  const checks = [];
  const add = (ok, what, detail = '') => checks.push({ ok, what, detail });

  if (!existsSync('mir.html')) {
    add(false, 'mir.html собран');
    return checks;
  }
  const html = readFileSync('mir.html', 'utf8');
  const bytes = Buffer.byteLength(html);
  add(true, 'mir.html собран', kb(bytes));

  const forbidden = [
    ['<script[^>]*type="module"', 'модульный скрипт'],
    ['modulepreload', 'предзагрузка модулей'],
    ['/assets/', 'ссылки на каталог сборки'],
    ['/sounds/', 'ссылки на звуки файлами'],
    [/__MIR_[A-Z_]+__/.source, 'неподставленные метки сборщика'],
  ];
  for (const [pattern, what] of forbidden)
    add(!new RegExp(pattern).test(html), `в mir.html нет: ${what}`);

  const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  const allowed = external.every(
    (url) => url.startsWith('https://fonts.googleapis.com') || url.startsWith('https://fonts.gstatic.com'),
  );
  add(
    allowed,
    'из внешнего в mir.html только шрифты',
    external.filter((url) => !allowed || !/fonts\.g/.test(url)).join(', ') || `${external.length} ссылок`,
  );

  const expected = version();
  add(
    html.includes(`<meta name="mir-version" content="${expected}"`),
    'версия mir.html совпадает с package.json',
    expected,
  );

  const embeddedSounds = (html.match(/data:audio\/mpeg;base64/g) ?? []).length;
  add(
    embeddedSounds >= SOUND_FILES.length,
    'все звуки интерфейса встроены',
    `${embeddedSounds} из ${SOUND_FILES.length}`,
  );
  add(/rel="icon"[^>]*href="data:image\/png;base64,/.test(html), 'значок вкладки встроен');

  add(bytes <= BUDGETS.single, `mir.html в бюджете (${kb(BUDGETS.single)})`, kb(bytes));

  /* Главная проверка: скрипт из файла — обычный скрипт. Разбираем его как
     классический код: модульный синтаксис (import/export) здесь не пройдёт,
     а значит по file:// игра запустится. */
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  add(scripts.length === 1, 'в mir.html ровно один скрипт', `${scripts.length}`);
  let parsed = false;
  let parseError = '';
  try {
    new vm.Script(scripts[0] ?? '');
    parsed = true;
  } catch (error) {
    parseError = error.message;
  }
  add(parsed, 'скрипт mir.html разбирается как обычный (не модульный)', parseError);

  add(
    html.indexOf('<script>') > html.indexOf('<div id="app">'),
    'скрипт подключён после разметки (DOM уже готов)',
  );

  return checks;
}

/** Проверки всего, что собирает `npm run build:all`. */
export function checkAll() {
  return [...checkWeb(), ...checkSingle()];
}

export const buildInputsExist = () => ROOT_FILES.every((path) => existsSync(path));
