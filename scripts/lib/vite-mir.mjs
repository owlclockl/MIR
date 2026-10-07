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

/* ---------- 2. Однофайловая сборка --------------------------------- */

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

      const buildId = bundleFingerprint(bundle);
      const cacheName = `mir-app-${version}-${buildId}`;

      /* Список оболочки: документ, манифест, собранные файлы и содержимое
         public/. Имя кэша меняется вместе с содержимым сборки, поэтому
         устаревший офлайн-кэш физически невозможен. */
      const files = Object.keys(bundle)
        .filter((name) => name !== 'index.html' && !name.endsWith('.map'))
        .map((name) => `/${name}`);
      const precache = [...new Set(['/', '/manifest.webmanifest', ...publicFiles().map((name) => `/${name}`), ...files])];

      const template = readFileSync('src/sw.js', 'utf8');
      const source = template
        .replace('__MIR_CACHE__', cacheName)
        .replace('__MIR_PRECACHE__', JSON.stringify(precache, null, 2));
      if (/__MIR_[A-Z_]+__/.test(source))
        throw new Error('[mir:service-worker] в src/sw.js остались метки — проверьте шаблон.');

      bundle['sw.js'] = {
        type: 'asset',
        fileName: 'sw.js',
        name: 'sw.js',
        source,
        needsCodeReferenceDependencyInstallation: false,
      };
      log(`sw.js: кэш ${cacheName}, файлов оболочки ${precache.length}`);
    },
  };
}
