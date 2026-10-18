import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
/* Конфигурация сборки. Две сборки из одного кода:

   web    — `npm run build` → dist/: обычная модульная сборка с хешированными
            именами файлов; её раздаёт server/serve.mjs, хаб, Cloudflare и
            установщик .exe.
   single — `npm run single` → mir.html: один файл, где JS и стили внутри
            HTML; открывается двойным кликом, едет в .apk и на флешке.
            Редактор карт Azgaar вшивается в него отдельной сборкой
            (scripts/lib/fmg-offline.mjs), поэтому нужен `npm run fmg:install`.
            Запускается программно с `write: false` — см. scripts/lib/build.mjs.

   Никаких правил «допиши версию в четырёх местах»: версия берётся из
   package.json, имя кэша service worker — из неё и хеша содержимого. */

import { defineConfig } from 'vite';
import {
  appVersion,
  mirBuildInfo,
  mirServiceWorker,
  mirSingleFile,
} from './scripts/lib/vite-mir.mjs';

const version = appVersion();

export default defineConfig(({ mode }) => {
  const single = mode === 'single';

  return {
    /* Версия доступна коду как __APP_VERSION__. Карта мира — Azgaar в обеих
       сборках: в web/PWA он берётся из public/fmg, в mir.html вшит целиком. */
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },

    /* В однофайловой сборке каталога рядом нет: иконки и манифест там не
       нужны (по file:// они бесполезны), а значок вкладки плагин встраивает
       сам. Заодно сборка не может ничего «подмешать» из public/. */
    publicDir: single ? false : 'public',

    plugins: single
      ? [rtwgRawSources(), mirBuildInfo({ version }), mirSingleFile()]
      : [rtwgRawSources(), mirBuildInfo({ version }), mirServiceWorker({ version })],

    build: {
      /* Однофайловая сборка пишется в память (write: false), каталог нужен
         только на случай ручного `vite build --mode single`. */
      outDir: single ? 'node_modules/.mir-single' : 'dist',
      /* Старые хешированные файлы прошлых сборок не должны копиться в dist:
         их не удалить потом ни на хостинге, ни в установщике .exe. */
      emptyOutDir: true,
      cssCodeSplit: !single,
      /* В mir.html ресурсы должны лежать внутри, иначе file:// их не найдёт.
         Веб-версия держит даже маленькие звуки отдельными хешированными файлами:
         data URL аудио раздувает JS и мешает раздельному кешированию. */
      assetsInlineLimit: single ? () => true : 0,
      modulePreload: single ? false : undefined,
      sourcemap: false,
      reportCompressedSize: false,
      rollupOptions: single
        ? {
            output: {
              /* IIFE — гарантированно обычный скрипт без import/export. */
              format: 'iife',
              inlineDynamicImports: true,
              entryFileNames: 'app.js',
            },
          }
        : {
            input: {
              index: resolve(process.cwd(), 'index.html'),
              control: resolve(process.cwd(), 'control.html'),
            },
          },
    },

    server: {
      host: '0.0.0.0',
      allowedHosts: true,
    },
  };
});


// Keep upstream files byte-identical while avoiding trailing whitespace in
// generated JS template literals (including the standalone HTML patch).
function rtwgRawSources() {
  return { name: 'mir:rtwg-raw-sources', enforce: 'pre', load(id) {
    if (!id.endsWith('?raw') || !/\/vendor\/(rtwg|rtplatec|libnoise|rtwg-browser)\//.test(id)) return null;
    const source=readFileSync(id.slice(0,-4),'utf8').replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,'');
    return `export default ${JSON.stringify(source)};`;
  }};
}
