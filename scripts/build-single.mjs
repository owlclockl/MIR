// Собирает игру в один самодостаточный HTML-файл (mir.html).
// Запуск: npm run single
//
// Самодостаточность даёт Vite: плагин `mir:single-file` (scripts/lib/vite-mir.mjs)
// встраивает скрипт и стили прямо в разметку, а модули сборки собирает как
// обычный скрипт (формат IIFE). Такой файл запускается по file:// двойным
// кликом и внутри WebView в .apk, где модульные скрипты браузеры запрещают
// из-за CORS. Звуки и значки тоже внутри — внешними остаются только шрифты
// Google Fonts, без них интерфейс просто возьмёт системный шрифт.
//
// Папку dist/ эта сборка не трогает: её собирает `npm run build`.
// Логика — в scripts/lib/build.mjs.

import { statSync } from 'node:fs';
import { buildSingleHtml } from './lib/build.mjs';

const started = Date.now();
const html = await buildSingleHtml();
const kb = (statSync('mir.html').size / 1024).toFixed(0);
const seconds = ((Date.now() - started) / 1000).toFixed(1);

console.log(`mir.html готов — ${kb} КБ за ${seconds} с. Откройте двойным кликом в браузере.`);
