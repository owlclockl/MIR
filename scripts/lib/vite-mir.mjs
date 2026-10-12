/* Плагины сборки MIR.

   Зачем это здесь. Раньше однофайловый `mir.html` получался так: собрать
   Vite, прочитать `dist/index.html` с диска и переписать его регулярками.
   Работало, но держалось на хрупких допущениях — стоило Vite переставить
   атрибуты местами, и сборка тихо ломалась либо, что хуже, выдавала
   `mir.html` с модульным скриптом, который не открывается по file://.

   Технологичнее — делать то же самое там, где живёт разметка: в сборщике.
   Плагины работают с бандлом Rollup (`generateBundle`), сами встраивают
   скрипт и стили в HTML, сами пишут `sw.js`, и сами же проверяют результат.
   Никаких «прочитать диск и заменить строку»: сломанная сборка падает с
   понятным сообщением, а не превращается в битый файл у игрока.

   Три плагина:
     mirBuildInfo()   — версия сборки в разметке (диагностика и проверки);
     mirSingleFile()  — однофайловый mir.html: JS и CSS внутри HTML;
     mirServiceWorker() — dist/sw.js с автоключом кэша и списком оболочки. */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, posix } from 'node:path';

const log = (msg) => console.log(`  · ${msg}`);

/* Файл, по которому приложение узнаёт о новой сборке на сервере: страница
   сравнивает свою метку сборки с этой. Имя одно на весь проект — сборщик,
   src/sw.js и src/data/update.js должны говорить про один адрес. */
export const BUILD_INFO_FILE = 'mir-build.json';

/** Версия приложения: package.json — единственный источник правды. */
export const appVersion = () => JSON.parse(readFileSync('package.json', 'utf8')).version;

/** Восемь шестнадцатеричных знаков от содержимого сборки. */
const shortHash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 8);

const fileText = (source) =>
  typeof source === 'string' ? source : Buffer.from(source).toString('utf8');

/** Все файлы сборки, отсортированные по имени: хеш не зависит от порядка. */
const bundleFingerprint = (bundle) =>
  shortHash(
    Object.keys(bundle)
      .sort()
      .map((fileName) => {
        const item = bundle[fileName];
        return `${fileName}\n${fileText(item.type === 'chunk' ? item.code : item.source)}`;
      })
      .join('\n'),
  );

/** Файлы из public/ (иконки, манифест) — их Vite копирует мимо бандла. */
const publicFiles = (dir = 'public') => {
  const out = [];
  const walk = (current, prefix) => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full, posix.join(prefix, name));
      else out.push(posix.join(prefix, name));
    }
  };
  try {
    walk(dir, '');
  } catch {
    /* Нет public/ — сборке нечего копировать. */
  }
  return out.sort();
};

/* ---------- 1. Версия в разметке ----------------------------------- */

export function mirBuildInfo({ version }) {
  return {
    name: 'mir:build-info',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html.replace(
          '</head>',
          `  <meta name="mir-version" content="${version}" />\n  </head>`,
        ),
    },
  };
}

/* ---------- 2. Шрифты в веб-сборке --------------------------------- */

/* Шрифты интерфейса (src/assets/fonts/) грузятся из CSS, а CSS браузер
   сначала скачивает и разбирает — то есть первая буква ждёт два круга по
   сети. Предзагрузка начинает качать их сразу, вместе со стилями, и
   заголовок не мигает системным начертанием.

   Почему в однофайловой сборке этого нет: там woff2 вшиты в CSS как data:
   URL, качать нечего. Поэтому плагин просто ничего не находит в бандле —
   и это правильное поведение, а не пропущенный случай.

   `crossorigin` обязателен: шрифт по спецификации запрашивается в режиме
   CORS, и предзагрузка без него считается «другим» запросом — браузер
   скачает файл дважды. */
export function mirFontPreload() {
  return {
    name: 'mir:font-preload',
    apply: 'build',
    /* Файлы woff2 попадают в бандл только на этапе generateBundle (их
       emits Vite, разбирая CSS), поэтому плагин обязан идти после ядра —
       enforce: 'post'. Проверка `npm run test:build` ловит ситуацию, когда
       предзагрузки в разметке не оказалось. */
    enforce: 'post',

    generateBundle(_options, bundle) {
      const fonts = Object.keys(bundle)
        .filter((name) => name.endsWith('.woff2'))
        .sort();
      if (!fonts.length) return;

      const htmlName = Object.keys(bundle).find(
        (name) => name.endsWith('.html') && bundle[name].type === 'asset',
      );
      if (!htmlName) return;

      const tags = fonts
        .map((name) => `  <link rel="preload" as="font" type="font/woff2" crossorigin href="/${name}" />\n`)
        .join('');
      /* Ставим сразу после кодировки, а не перед ней: meta charset обязана
         попасть в первые 1024 байта документа. Заодно предзагрузка встаёт
         выше ссылки на стили — то есть раньше, чем браузер о них узнает. */
      const html = String(bundle[htmlName].source);
      const anchor = html.match(/[ \t]*<meta charset[^>]*>\n/);
      bundle[htmlName].source = anchor
        ? html.replace(anchor[0], `${anchor[0]}${tags}`)
        : html.replace('<head>', `<head>\n${tags}`);
      log(`шрифты: предзагрузка ${fonts.length} файлов`);
    },
  };
}

/* ---------- 3. Политика безопасности разметки ---------------------- */

/* CSP для страницы игры. Смысл — запретить исполнять чужой скрипт, если он
   когда-нибудь попадёт в разметку: `script-src 'self'` закрывает инлайновые
   <script> и обработчики-атрибуты, а `object-src 'none'` и `base-uri 'self'`
   убирают известные обходы. Всё остальное, что приложению нужно, разрешено
   явно и с объяснением:

     style-src 'unsafe-inline'  — цвета аватарок ставятся атрибутом style;
     img-src data: blob:        — аватарки (data:) и выбранные файлы (blob:);
     media-src data: blob:      — звуки в однофайловой версии приходят data:;
     connect-src http(s)/ws(s)  — адрес хаба выбирает игрок (`?hub=`), какой
                                  угодно; WebRTC политика не ограничивает;
     frame-src 'self' data:     — редактор карт Azgaar живёт в iframe /fmg/,
                                  в однофайловых сборках — в srcdoc.

   Почему это только веб-сборка. В mir.html редактор открывается через
   `srcdoc`, а такой документ наследует политику родителя — CSP на страницу
   означает CSP и на редактор Azgaar, который писался без оглядки на неё.
   Ломать редактор ради заголовка нельзя, поэтому в однофайловых сборках
   политики нет; разметка /fmg/ тоже раздаётся без неё (свой документ). */
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' http: https: ws: wss:",
  "frame-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export function mirSecurityPolicy() {
  return {
    name: 'mir:security-policy',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html.replace(
          '</head>',
          `  <meta http-equiv="Content-Security-Policy" content="${APP_CSP}" />\n  </head>`,
        ),
    },
  };
}

/* ---------- 4. Однофайловая сборка --------------------------------- */

const stripTags = (html, pattern) => html.replace(pattern, '');

/* Кеш последней собранной однофайловой разметки. Нужен для сборок с
   `write: false` (mir.html и .apk): файл на диск не пишется, а результат
   сборщик забирает отсюда.

   Состояние живёт в globalThis, а не в переменной модуля: Vite собирает
   конфиг вместе с его импортами в отдельный временный файл, и модуль
   внутри сборки — уже не тот же самый объект, что импортирует
   scripts/lib/build.mjs. Через globalThis они видят одно состояние. */
const BUILD_STATE = Symbol.for('mir.build.state');
const buildState = (globalThis[BUILD_STATE] ??= { singleHtml: null });

/** Итог последней однофайловой сборки — готовый HTML. */
export const singleFileHtml = () => buildState.singleHtml;

export function mirSingleFile() {
  return {
    name: 'mir:single-file',
    enforce: 'post',
    apply: 'build',

    /* Иконки и манифест по file:// бесполезны (браузер их не найдёт), зато
       ломать ничего не должны: манифест и apple-иконки убираем, а значок
       вкладки встраиваем как data URL — он работает и без сервера. */
    transformIndexHtml: {
      order: 'post',
      handler: (html) => {
        let out = html;
        out = stripTags(out, /^[ \t]*<link rel="manifest"[^>]*>\n?/m);
        out = stripTags(out, /^[ \t]*<link rel="icon"[^>]*>\n?/m);
        out = stripTags(out, /^[ \t]*<link rel="apple-touch-icon"[^>]*>\n?/m);

        const tags = [];
        try {
          const icon = readFileSync('public/icons/icon-192.png').toString('base64');
          tags.push({
            tag: 'link',
            attrs: { rel: 'icon', type: 'image/png', href: `data:image/png;base64,${icon}` },
            injectTo: 'head',
          });
        } catch {
          this.warn('нет public/icons/icon-192.png — значок вкладки в mir.html будет пустым');
        }
        return { html: out, tags };
      },
    },

    generateBundle(_options, bundle) {
      const htmlName = Object.keys(bundle).find(
        (name) => name.endsWith('.html') && bundle[name].type === 'asset',
      );
      if (!htmlName) throw new Error('[mir:single-file] в сборке нет HTML — нечего встраивать.');

      const entry = Object.values(bundle).find((item) => item.type === 'chunk' && item.isEntry);
      if (!entry) throw new Error('[mir:single-file] в сборке нет входного модуля.');

      /* Формат IIFE обязателен: собранный код должен быть обычным скриптом.
         Модульный по file:// не запускается — это главная причина, по
         которой однофайловая версия вообще существует. */
      if (/^\s*(import|export)[\s{*]/m.test(entry.code))
        throw new Error(
          '[mir:single-file] во входном модуле остались import/export: ' +
            'однофайловая сборка должна идти с build.rollupOptions.output.format = "iife".',
        );
      if (entry.dynamicImports.length)
        throw new Error('[mir:single-file] в сборке есть динамические импорты — нужен inlineDynamicImports.');

      /* Стили при cssCodeSplit = false лежат в сборке отдельным файлом.
         Как именно Vite сообщает о нём (`viteMetadata.importedCss`), от
         версии к версии меняется, поэтому берём его из метаданных, а если
         их нет — находим единственный CSS-ресурс сборки. */
      const cssFiles = [...(entry.viteMetadata?.importedCss ?? [])].filter(
        (name) => bundle[name]?.type === 'asset',
      );
      for (const name of Object.keys(bundle))
        if (!cssFiles.includes(name) && name.endsWith('.css') && bundle[name].type === 'asset')
          cssFiles.push(name);
      if (!cssFiles.length)
        throw new Error(
          `[mir:single-file] в сборке нет стилей (файлы: ${Object.keys(bundle).join(', ')}).`,
        );

      let html = bundle[htmlName].source;
      const code = entry.code;
      const css = cssFiles.map((name) => fileText(bundle[name].source)).join('\n');

      /* Скрипт — классический и в конце body: DOM уже разобран, CORS не
         нужен, работает file://, http:// и WebView внутри APK. */
      html = html.replace(
        /[ \t]*<script type="module"[\s\S]*?<\/script>\n?/,
        '',
      );
      html = stripTags(html, /[ \t]*<link rel="modulepreload"[^>]*>\n?/g);
      html = html.replace(
        /([ \t]*)<\/body>/,
        (_m, indent) =>
          `${indent}  <script>\n${code.replaceAll('</script', '<\\/script')}\n${indent}  </script>\n${indent}</body>`,
      );

      /* Стили — на место ссылки на файл стилей. */
      let cssPlaced = false;
      html = html.replace(
        /[ \t]*<link rel="stylesheet"[^>]*href="[^"]*\.css"[^>]*>\n?/,
        () => {
          cssPlaced = true;
          return `<style>\n${css}\n    </style>\n`;
        },
      );
      if (!cssPlaced) throw new Error('[mir:single-file] в HTML не нашлось ссылки на стили.');

      bundle[htmlName].source = html;
      delete bundle[entry.fileName];
      for (const name of cssFiles) delete bundle[name];

      /* Проверки на выходе: однофайловая версия обязана быть самодостаточной. */
      const problems = [];
      if (/<script[^>]*type="module"/.test(html)) problems.push('остался модульный скрипт');
      if (/modulepreload/.test(html)) problems.push('осталась предзагрузка модулей');
      if (/\/assets\//.test(html)) problems.push('остались ссылки на /assets/');
      if (/__MIR_[A-Z_]+__/.test(html)) problems.push('остались неподставленные метки сборки');
      if (!html.includes('<script>')) problems.push('нет встроенного скрипта');
      if (!html.includes('<style>')) problems.push('нет встроенных стилей');
      if (problems.length)
        throw new Error(`[mir:single-file] mir.html не самодостаточен: ${problems.join(', ')}.`);

      buildState.singleHtml = html;
      log(`mir.html: встроено ${(code.length / 1024).toFixed(1)} КБ кода и ${(css.length / 1024).toFixed(1)} КБ стилей`);
    },
  };
}

/* ---------- 3. Service worker -------------------------------------- */

export function mirServiceWorker({ version }) {
  return {
    name: 'mir:service-worker',
    enforce: 'post',
    apply: 'build',

    generateBundle(_options, bundle) {
      if (bundle['sw.js']) return; // уже собран (несколько сборок в одном процессе)

      const publicPaths = publicFiles();
      /* Фиксированные public-файлы тоже входят в отпечаток. Это особенно
         важно для встроенного Azgaar: его статический редактор живёт под
         /fmg/, а изменения в нём обязаны менять ключ офлайн-кэша, даже если
         основной JS-бандл MIR остался прежним. */
      const publicFingerprint = publicPaths
        .map((name) => `${name}\n${createHash('sha256').update(readFileSync(join('public', name))).digest('hex')}`)
        .join('\n');
      const serviceWorkerFingerprint = createHash('sha256').update(readFileSync('src/sw.js')).digest('hex');
      const buildId = shortHash(`${bundleFingerprint(bundle)}\n${publicFingerprint}\n${serviceWorkerFingerprint}`);
      const cacheName = `mir-app-${version}-${buildId}`;

      /* Список оболочки: документ, манифест, собранные файлы и содержимое
         public/. Имя кэша меняется вместе с содержимым сборки, поэтому
         устаревший офлайн-кэш физически невозможен.

         Новостей о версии (mir-build.json) в списке нет намеренно: это
         единственный файл, который обязан быть свежим всегда. В кэше он
         означал бы «сравниваем старую сборку со старой же» — приложение
         никогда не увидело бы новую (service worker знает про него
         отдельно, см. src/sw.js). */
      const files = Object.keys(bundle)
        .filter((name) => name !== 'index.html' && name !== BUILD_INFO_FILE && !name.endsWith('.map'))
        .map((name) => `/${name}`);
      /* Cloudflare Workers Static Assets metadata controls response headers;
         it is not a public asset and must not enter the offline precache. */
      const staticMetadata = new Set(['_headers', '_redirects']);
      const all = [
        ...new Set([
          '/',
          '/manifest.webmanifest',
          ...publicPaths.filter((name) => !staticMetadata.has(name)).map((name) => `/${name}`),
          ...files,
        ]),
      ];

      /* Оболочка и редактор карт — два разных обещания. Без оболочки игра
         не откроется, и её кладём в кэш при установке worker'а. Редактор
         Azgaar — это двадцать с лишним мегабайт картинок и библиотек,
         которые игроку нужны далеко не в первый же запуск: качать их на
         первом экране значит соревноваться за сеть с самой игрой и жечь
         мобильный трафик молча. Поэтому редактор едет во второй список:
         его догружает отдельный проход по просьбе страницы, уже после
         старта, и только когда сеть не «экономная». Обещание офлайна при
         этом остаётся: полностью прогретый кэш содержит и карту. */
      const isEditor = (url) => url.startsWith('/fmg/');
      const precache = all.filter((url) => !isEditor(url));
      const warm = all.filter(isEditor);

      const template = readFileSync('src/sw.js', 'utf8');
      const source = template
        .replace('__MIR_CACHE__', cacheName)
        .replace('__MIR_PRECACHE__', JSON.stringify(precache, null, 2))
        .replace('__MIR_WARM__', JSON.stringify(warm, null, 2))
        .replace('__MIR_BUILD__', buildId)
        .replace('__MIR_VERSION__', version);
      if (/__MIR_[A-Z_]+__/.test(source))
        throw new Error('[mir:service-worker] в src/sw.js остались метки — проверьте шаблон.');

      bundle['sw.js'] = {
        type: 'asset',
        fileName: 'sw.js',
        name: 'sw.js',
        source,
        needsCodeReferenceDependencyInstallation: false,
      };

      /* Метка сборки в разметке и файл новостей для проверки обновлений
         (src/data/update.js): страница сравнивает своё с серверным. Метка
         в разметке — тот же buildId, что в имени кэша, поэтому «на сервере
         то же самое» и «worker уже обновился» — про одно и то же. */
      const htmlName = Object.keys(bundle).find(
        (name) => name.endsWith('.html') && bundle[name].type === 'asset',
      );
      if (htmlName) {
        bundle[htmlName].source = String(bundle[htmlName].source).replace(
          '</head>',
          `  <meta name="mir-build" content="${buildId}" />\n  </head>`,
        );
      } else {
        this.warn('в сборке нет index.html — проверка обновлений по серверу работать не будет');
      }

      const buildInfo = { version, build: buildId, builtAt: new Date().toISOString() };
      bundle[BUILD_INFO_FILE] = {
        type: 'asset',
        fileName: BUILD_INFO_FILE,
        name: BUILD_INFO_FILE,
        source: `${JSON.stringify(buildInfo, null, 2)}\n`,
        needsCodeReferenceDependencyInstallation: false,
      };

      log(`sw.js: кэш ${cacheName}, файлов оболочки ${precache.length}`);
      log(`новости о сборке: /${BUILD_INFO_FILE} (${buildInfo.version}, метка ${buildId})`);
    },
  };
}
