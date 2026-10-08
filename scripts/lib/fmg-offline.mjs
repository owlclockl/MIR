/* Встроенный редактор Azgaar для однофайлового mir.html.

   Внутри mir.html редактор живёт не на сервере, а в iframe с srcdoc: у такого
   документа нет адреса, поэтому всё, что Azgaar иначе читал бы с диска или по
   сети, собирается в один HTML:

     • собственный скрипт Azgaar — классический IIFE (сборка vendor/ с
       конфигом fmg-offline.config.mjs), без import/export и без чанков;
     • стили и библиотеки libs/ — встроенными тегами, в исходном порядке;
     • картинки, карты высот, стили-пресеты и прочие ресурсы — в таблице
       base64 (#mir-fmg-assets); шим перед запуском редактора переписывает
       адреса src/href/fetch/XHR на blob: URL из этой таблицы.

   Параметры карты (seed, размер) передаются через MIR_FMG_HOST.query:
   плейсхолдер "__FMG_QUERY__" подставляет оболочка при каждом открытии.
   Результат кладётся в mir.html как JSON-строка: так текст шаблона не
   ломает разбор HTML (нет `</script`, нет `<!--`). */

import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fromRoot } from './root.mjs';

const VENDOR = fromRoot('vendor', 'azgaar-fantasy-map-generator');
const CONFIG = fileURLToPath(new URL('./fmg-offline.config.mjs', import.meta.url));

/** Заменяется в шаблоне на JSON-строку с параметрами карты при каждом открытии. */
export const QUERY_PLACEHOLDER = '"__FMG_QUERY__"';

/** id JSON-блока с шаблоном в mir.html. */
export const TEMPLATE_ID = 'mir-fmg-template';

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.txt': 'text/plain',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

/* Файлы сборки, которые в одном документе не нужны: сервис-воркер не работает
   в srcdoc, манифест и диалог Dropbox относятся к веб-версии, лицензия Lucide
   остаётся в репозитории. */
const SKIPPED = new Set(['index.html', 'app.js', 'sw.js', 'dropbox.html', 'manifest.webmanifest', 'LUCIDE-LICENSE.txt']);

/* Шим: переписывает адреса ресурсов на blob: URL из таблицы. Подменяются
   только свойства и методы, через которые Azgaar грузит файлы; всё прочее
   остаётся нативным. */
const SHIM = `(function () {
  var table = null, cache = Object.create(null);
  function assets() {
    if (!table) { var el = document.getElementById("mir-fmg-assets"); table = el ? JSON.parse(el.textContent) : {}; }
    return table;
  }
  function keyOf(url) {
    var s = String(url);
    if (/^(data:|blob:|about:|javascript:|#)/i.test(s)) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
      try { var u = new URL(s); if (u.protocol !== "file:") return null; s = u.pathname; } catch (e) { return null; }
    }
    s = s.replace(/[?#].*$/, "").replace(/^(\\.\\/|\\/)+/, "").replace(/^fmg\\//, "");
    return Object.prototype.hasOwnProperty.call(assets(), s) ? s : null;
  }
  function blobUrl(key) {
    if (cache[key]) return cache[key];
    var entry = assets()[key], bin = atob(entry[1]), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return (cache[key] = URL.createObjectURL(new Blob([bytes], { type: entry[0] })));
  }
  function resolve(url) { var key = keyOf(url); return key ? blobUrl(key) : url; }
  function patch(proto, prop) {
    var d = Object.getOwnPropertyDescriptor(proto, prop);
    if (!d || !d.set) return;
    Object.defineProperty(proto, prop, {
      configurable: true, enumerable: d.enumerable, get: d.get,
      set: function (v) { d.set.call(this, typeof v === "string" ? resolve(v) : v); }
    });
  }
  patch(HTMLImageElement.prototype, "src");
  patch(HTMLScriptElement.prototype, "src");
  patch(HTMLLinkElement.prototype, "href");
  var setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (/^(src|href|xlink:href)$/i.test(name) && typeof value === "string") value = resolve(value);
    return setAttr.call(this, name, value);
  };
  var setAttrNS = Element.prototype.setAttributeNS;
  Element.prototype.setAttributeNS = function (ns, name, value) {
    if (/^(src|href)$/i.test(name) && typeof value === "string") value = resolve(value);
    return setAttrNS.call(this, ns, name, value);
  };
  var NativeImage = window.Image;
  var FmgImage = function (w, h) {
    var img = document.createElement("img");
    if (w !== undefined) img.width = w;
    if (h !== undefined) img.height = h;
    return img;
  };
  FmgImage.prototype = NativeImage.prototype;
  window.Image = FmgImage;
  var nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === "string" || input instanceof URL) input = resolve(String(input));
    return nativeFetch.call(this, input, init);
  };
  var xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments);
    if (typeof url === "string" || url instanceof URL) args[1] = resolve(String(url));
    return xhrOpen.apply(this, args);
  };
})();`;

/** Классический скрипт внутри HTML: закрывающий тег и комментарий не должны его обрывать. */
const escapeScript = (code) => code.replace(/<!--/g, '<\\!--').replace(/<\/script/gi, '<\\/script');

const walkFiles = (dir) => {
  const files = new Map();
  const visit = (current) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) visit(path);
      else files.set(relative(dir, path).split(sep).join('/'), path);
    }
  };
  visit(dir);
  return files;
};

const stripQuery = (url) => url.replace(/[?#].*$/, '').replace(/^\.\//, '');

/**
 * Собирает Azgaar для встраивания и возвращает HTML-шаблон.
 * Шаблон содержит QUERY_PLACEHOLDER; документ для конкретной карты получается через
 * documentForQuery() в клиенте (см. src/game/azgaar-frame.js).
 * @param {{ logLevel?: string }} [options]
 * @returns {Promise<{ template: string, files: number, bytes: number }>}
 */
export async function buildEmbeddedEditor({ logLevel = 'error' } = {}) {
  if (!existsSync(join(VENDOR, 'node_modules', 'vite', 'package.json')))
    throw new Error('Зависимости Azgaar не установлены. Сначала выполните: npm run fmg:install');

  /* Vite берём из vendor/: конфиг Azgaar собран под его версию. */
  const requireFromVendor = createRequire(join(VENDOR, 'package.json'));
  const { build } = await import(pathToFileURL(requireFromVendor.resolve('vite')).href);

  const dir = mkdtempSync(join(tmpdir(), 'mir-fmg-'));
  try {
    await build({ configFile: CONFIG, mode: 'electron', logLevel, build: { outDir: dir, emptyOutDir: true } });
    return assembleTemplate(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Из результата сборки Vite делает один HTML: см. заголовок файла. */
export function assembleTemplate(dir) {
  const files = walkFiles(dir);
  let html = readFileSync(join(dir, 'index.html'), 'utf8');

  /* Лицензия MIT требует сохранить уведомление в каждой копии: текст кладём
     в комментарий сразу после doctype (он не меняет режим разбора). */
  const license = readFileSync(join(VENDOR, 'LICENSE'), 'utf8').replace(/--/g, '- -').trim();
  html = html.replace(/<!doctype html>/i, (match) => `${match}\n<!--\n${license}\n-->`);
  const inlined = new Set();
  const scripts = [];
  const appScripts = [];

  /* 1. Стили: обычные <link rel="stylesheet"> и preload-ссылки, которые Azgaar
        переключает в stylesheet в onload, — все становятся <style> на месте. */
  const styleTags = [...html.matchAll(/<link\b[^>]*>/g)]
    .map((match) => match[0])
    .filter((tag) => /rel="stylesheet"/.test(tag) || (/rel="preload"/.test(tag) && /as="style"/.test(tag)));
  for (const tag of styleTags) {
    const key = stripQuery(tag.match(/href="([^"]+)"/)[1]);
    if (!files.has(key)) throw new Error(`[fmg-offline] нет файла стилей ${key}`);
    inlined.add(key);
    const css = readFileSync(files.get(key), 'utf8').replace(/url\(\s*(["']?)([^"')#][^"')]*)\1\s*\)/g, (whole, _q, target) => {
      if (/^(data:|https?:|blob:)/.test(target)) return whole;
      const dataKey = posix.normalize(posix.join(posix.dirname(key), stripQuery(target)));
      return files.has(dataKey) ? `url("${dataUri(files.get(dataKey), dataKey)}")` : whole;
    });
    html = html.replace(tag, () => `<style>${css}</style>`);
  }

  /* 2. Скрипты с src: библиотеки в исходном порядке, приложение — последним,
        как и раньше (модуль приложения в исходном HTML стоит в head и грузится
        отложенно). Все они уходят в конец body единым блоком. */
  html = html.replace(/<script\b([^>]*)\ssrc="([^"]+)"([^>]*)>\s*<\/script>/g, (_whole, _a, src) => {
    const key = stripQuery(src);
    if (!files.has(key)) throw new Error(`[fmg-offline] нет файла скрипта ${key}`);
    inlined.add(key);
    (key === 'app.js' ? appScripts : scripts).push(readFileSync(files.get(key), 'utf8'));
    return '';
  });

  /* 3. Иконки и манифест нужны только веб-версии. */
  html = html.replace(/<link\b[^>]*rel="(icon|apple-touch-icon|manifest)"[^>]*>\s*/g, '');

  /* 4. Таблица ресурсов: всё, что не встроено напрямую, грузится шимом. */
  const table = {};
  for (const [key, path] of files) {
    if (inlined.has(key) || SKIPPED.has(key)) continue;
    table[key] = [mimeOf(key), readFileSync(path).toString('base64')];
  }

  /* 5. Статические ссылки в разметке (например, <image href> в SVG-шаблонах)
        разбирает парсер раньше шима, поэтому их заменяем data URI сразу. */
  html = html.replace(/(\s(?:href|src|xlink:href))="((?!data:|https?:|#)[^"]+)"/g, (whole, attr, target) => {
    const key = posix.normalize(stripQuery(target));
    return table[key] ? `${attr}="data:${table[key][0]};base64,${table[key][1]}"` : whole;
  });

  const head = [
    `<script type="application/json" id="mir-fmg-assets">${JSON.stringify(table)}</script>`,
    `<script>${escapeScript(SHIM)}</script>`,
    `<script>globalThis.MIR_FMG_HOST = { query: ${QUERY_PLACEHOLDER} };</script>`,
  ].join('\n');
  html = html.replace(/<head>/i, (match) => `${match}\n${head}`);

  const bodyScripts = [...scripts, ...appScripts].map((code) => `<script>${escapeScript(code)}</script>`).join('\n');
  html = html.replace(/<\/body>/i, () => `${bodyScripts}\n</body>`);

  if (!html.includes('</body>') || /<script[^>]*\ssrc=/.test(html))
    throw new Error('[fmg-offline] в шаблоне остались внешние скрипты: документ не самодостаточен.');
  return { template: html, files: files.size, bytes: Buffer.byteLength(html) };
}

const mimeOf = (key) => MIME[extname(key)] ?? 'application/octet-stream';

const dataUri = (path, key) => `data:${mimeOf(key)};base64,${readFileSync(path).toString('base64')}`;

/**
 * Вставляет шаблон в mir.html как JSON-строку. JSON экранирует кавычки и
 * переводы строк, а `<` заменяется на \u003c: текст шаблона не может закрыть
 * элемент <script> и не меняет разбор страницы.
 */
export function embedTemplate(html, template) {
  const json = JSON.stringify(template).replace(/</g, '\\u003c');
  const block = `<script type="application/json" id="${TEMPLATE_ID}">${json}</script>\n`;
  if (html.includes(`id="${TEMPLATE_ID}"`)) throw new Error('[fmg-offline] шаблон уже встроен в HTML.');
  return html.replace(/<\/body>/i, () => `${block}</body>`);
}
