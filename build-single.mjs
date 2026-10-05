// Собирает весь проект в один самодостаточный HTML-файл (mir.html).
// Запуск: node build-single.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const css = readFileSync('src/style.css', 'utf8');
const js = readFileSync('src/main.js', 'utf8').replace(/^\s*import\s+['"]\.\/style\.css['"];?\s*\n/m, '');
const html = readFileSync('index.html', 'utf8')
  .replace('</head>', `  <style>\n${css}\n    </style>\n  </head>`)
  .replace(/\s*<script type="module" src="\/src\/main\.js"><\/script>/, `\n    <script type="module">\n${js}\n    </script>`);

writeFileSync('mir.html', html);
console.log('mir.html готов — откройте его двойным кликом в браузере.');
