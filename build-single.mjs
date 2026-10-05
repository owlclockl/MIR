// Собирает весь проект в один самодостаточный HTML-файл (mir.html).
// Запуск: node build-single.mjs
//
// Проект модульный (src/main.js импортирует store.js и avatar.js), поэтому
// сначала прогоняем продакшн-сборку Vite, а потом встраиваем её JS и CSS
// прямо в dist/index.html. Шрифты остаются внешними (Google Fonts).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';

await build({ logLevel: 'warn' });

let html = readFileSync(join('dist', 'index.html'), 'utf8');

html = html.replace(
  /<script type="module" crossorigin src="\/(assets\/[^"]+\.js)"><\/script>/,
  (match, path) => {
    const js = readFileSync(join('dist', path), 'utf8')
      /* Встроенный скрипт не должен содержать "</script" даже в строках. */
      .replaceAll('</script', '<\\/script');
    return `<script type="module">\n${js}\n    </script>`;
  },
);

html = html.replace(
  /<link rel="stylesheet" crossorigin href="\/(assets\/[^"]+\.css)" ?\/?>/,
  (match, path) => `<style>\n${readFileSync(join('dist', path), 'utf8')}\n    </style>`,
);

if (html.includes('/assets/'))
  throw new Error('build-single: не все ресурсы встроены — проверьте dist/index.html.');

writeFileSync('mir.html', html);
console.log('mir.html готов — откройте его двойным кликом в браузере.');
