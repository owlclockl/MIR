#!/usr/bin/env node
/**
 * Собирает автономный одностраничный файл index.html (в корне проекта):
 * все стили и скрипты из public/ встраиваются внутрь одного файла,
 * чтобы дизайн можно было открыть и посмотреть двойным кликом,
 * без сервера. Полный функционал (лобби, WebSocket) — через `node start.js`.
 *
 * Запуск: node build-preview.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="\/([^"]+)"\s*\/?>/g, (m, rel) => {
  const css = fs.readFileSync(path.join(PUB, rel), 'utf8');
  return `<style>\n/* ${rel} */\n${css}\n</style>`;
});

html = html.replace(/<script src="\/([^"]+)"><\/script>/g, (m, rel) => {
  const js = fs.readFileSync(path.join(PUB, rel), 'utf8');
  return `<script>\n/* ${rel} */\n${js}\n</script>`;
});

fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log('index.html собран (одиночный файл для просмотра дизайна).');
