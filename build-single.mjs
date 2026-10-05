// Собирает весь проект в один самодостаточный HTML-файл (mir.html).
// Запуск: node build-single.mjs
//
// Проект модульный (src/main.js импортирует store.js и avatar.js), поэтому
// сначала прогоняем продакшн-сборку Vite, а потом встраиваем её JS и CSS
// прямо в dist/index.html. Шрифты остаются внешними (Google Fonts).
//
// Важно: встроенный скрипт сохраняется КЛАССИЧЕСКИМ (<script> без
// type="module") и переносится в конец <body>. Модульные скрипты браузеры
// грузят с проверкой CORS, и по протоколу file:// (двойной клик по mir.html,
// WebView внутри APK) такой файл просто не запускается. Классический скрипт
// в конце body работает везде: file://, http://, внутри приложения.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

/**
 * Прогоняет vite build и возвращает однофайловый HTML (он же пишется в mir.html).
 * Используется также сборщиками .exe и .apk, чтобы не дублировать логику.
 */
export async function buildSingleHtml({ write = true, logLevel = 'warn' } = {}) {
  await build({ logLevel });

  let html = readFileSync(join('dist', 'index.html'), 'utf8');

  let inlineScript = null;

  html = html.replace(
    /[ \t]*<script type="module" crossorigin src="\/(assets\/[^"]+\.js)"><\/script>\n?/,
    (match, path) => {
      inlineScript = readFileSync(join('dist', path), 'utf8')
        /* Встроенный скрипт не должен содержать "</script" даже в строках. */
        .replaceAll('</script', '<\\/script');
      return '';
    },
  );

  html = html.replace(
    /<link rel="stylesheet" crossorigin href="\/(assets\/[^"]+\.css)" ?\/?>/,
    (match, path) => `<style>\n${readFileSync(join('dist', path), 'utf8')}\n    </style>`,
  );

  if (inlineScript === null)
    throw new Error('build-single: не найден собранный JS в dist/index.html.');

  /* Классический скрипт в самом конце body: DOM уже разобран, CORS не нужен. */
  html = html.replace(
    /([ \t]*)<\/body>/,
    (match, indent) => `${indent}  <script>\n${inlineScript}\n${indent}  </script>\n${indent}</body>`,
  );

  if (html.includes('/assets/'))
    throw new Error('build-single: не все ресурсы встроены — проверьте dist/index.html.');
  if (html.includes('<script type="module"'))
    throw new Error('build-single: в mir.html остался модульный скрипт — он не работает по file://.');

  if (write) writeFileSync('mir.html', html);
  return html;
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  await buildSingleHtml();
  console.log('mir.html готов — откройте его двойным кликом в браузере.');
}
