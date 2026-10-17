/* Мини-сервер для бренд-страницы: открыть книгу без Vite и без сборки.

   Запуск: npm run brand → http://localhost:5180/

   Зачем отдельный сервер. brand/index.html — статическая страница, но
   логотипы лежат в public/ и подключены абсолютными путями (/logo.svg):
   так же их раздаёт dev-сервер и хостинг. Двойной клик по файлу такие
   пути не находит, а полноценный Vite ради документа поднимать долго.
   Здесь ровно одна задача: раздать репозиторий с корня и открыть /brand/.

   Отличия от server/serve.mjs намеренные: нет API, хаба, сжатия и
   service worker — это документация, а не приложение. */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve('.');
const PORT = Number(process.env.PORT) || 5180;
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/' || url.pathname === '/brand') {
    response.writeHead(302, { location: '/brand/' });
    response.end();
    return;
  }

  /* Путь нормализуется и проверяется: за пределы репозитория сервер
     не отдаёт ничего, даже если в адресе стоит «..». */
  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');

  /* public/ раздаётся с корня — так же, как у Vite и хостинга: логотип
     лежит в public/logo.svg, а страница просит /logo.svg. Остальные
     файлы (brand/, docs/, шрифты) берутся из корня репозитория. */
  const findFile = (base) => {
    const target = join(base, relative);
    if (!target.startsWith(base) || !existsSync(target)) return null;
    const stat = statSync(target);
    const file = stat.isDirectory() ? join(target, 'index.html') : target;
    return existsSync(file) ? file : null;
  };

  const file = findFile(join(ROOT, 'public')) || findFile(ROOT);
  if (!file) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('404 — файла нет');
    return;
  }

  response.writeHead(200, {
    'content-type': TYPES[extname(file)] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
});

server.listen(PORT, HOST, () => {
  console.log(`Бренд-система: http://localhost:${PORT}/brand/ (Ctrl+C — остановить)`);
});
