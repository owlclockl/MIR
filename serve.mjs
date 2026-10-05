#!/usr/bin/env node
/**
 * Сервер показа сборки друзьям + хаб общих аккаунтов.
 *
 *   node serve.mjs                 # раздать ./dist на всех интерфейсах
 *   node serve.mjs . --port 8080   # другой каталог и порт
 *   node serve.mjs --public        # плюс публичная ссылка через localtunnel
 *   node serve.mjs --no-hub        # без общих аккаунтов, только статика
 *
 * По умолчанию вместе со статикой работает хаб (/api/*): друзья в той же
 * Wi-Fi видят общие аккаунты, списки друзей и коды-приглашения. Данные —
 * в data/mir-hub.json. Без зависимостей — только встроенные модули Node.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createHub } from './hub.mjs';

const MIME = {
  '.webmanifest': 'application/manifest+json',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map']);

/* ---------- аргументы ---------- */

function parseArgs(argv) {
  const opts = { dir: null, port: null, public: false, hub: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--public' || a === '-p') opts.public = true;
    else if (a === '--no-hub') opts.hub = false;
    else if (a === '--hub') opts.hub = true;
    else if (a === '--port') opts.port = Number(argv[++i]);
    else if (a.startsWith('--port=')) opts.port = Number(a.slice(7));
    else if (a.startsWith('-')) {
      console.error(`Неизвестный флаг: ${a}\nПодсказка: node serve.mjs --help`);
      process.exit(1);
    } else if (opts.dir === null) opts.dir = a;
  }
  return opts;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`
Статический сервер проекта.

  node serve.mjs [каталог] [--port N] [--public] [--no-hub]

  каталог    что раздавать (по умолчанию dist)
  --port N   порт (по умолчанию 4173 или PORT из окружения);
             если занят — берётся следующий свободный
  --public   поднять публичную https-ссылку через npx localtunnel
  --no-hub   не поднимать хаб общих аккаунтов (/api/*)
  --help     эта справка
`);
  process.exit(0);
}

const ROOT = resolve(args.dir ?? 'dist');
const BASE_PORT = Number.isFinite(args.port) && args.port > 0 ? args.port : Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';

if (!existsSync(ROOT) || !statSync(ROOT).isDirectory()) {
  console.error(`\n  Каталог «${ROOT}» не найден.\n`);
  console.error('  Сначала соберите проект:\n');
  console.error('    npm run build\n');
  console.error('  Либо запустите всё одной командой:\n');
  console.error('    npm run share\n');
  process.exit(1);
}

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error(`\n  В каталоге «${ROOT}» нет index.html — раздавать нечего.\n`);
  process.exit(1);
}

/* ---------- хаб общих аккаунтов ---------- */

const hub = args.hub
  ? createHub({ dbFile: fileURLToPath(new URL('./data/mir-hub.json', import.meta.url)) })
  : null;

/* ---------- сервер ---------- */

function resolveFile(urlPath) {
  // %-декодирование + защита от выхода за пределы каталога
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const candidate = resolve(join(ROOT, decoded));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return null;

  if (existsSync(candidate)) {
    const st = statSync(candidate);
    if (st.isDirectory()) {
      const index = join(candidate, 'index.html');
      return existsSync(index) ? index : null;
    }
    return candidate;
  }
  // путь без расширения — отдаём index.html (на случай будущих маршрутов)
  if (!extname(decoded)) {
    const index = join(ROOT, 'index.html');
    return existsSync(index) ? index : null;
  }
  return null;
}

const server = createServer((req, res) => {
  const started = Date.now();

  /* API хаба обслуживаем до статики и до фильтра методов (там POST). */
  if (hub && (req.url || '').startsWith('/api/')) {
    hub
      .handle(req, res)
      .then(() => log(req, res.statusCode || 200, started))
      .catch((err) => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Внутренняя ошибка хаба.' }));
        }
        console.error('  × хаб:', err.message);
        log(req, 500, started);
      });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('405 — поддерживаются только GET и HEAD');
    log(req, 405, started);
    return;
  }

  const file = resolveFile(req.url || '/');

  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>404</title>' +
      '<body style="background:#08080a;color:#8b8b94;font:14px system-ui;display:grid;place-items:center;height:100vh;margin:0">' +
      '<p>404 — страница не найдена. <a style="color:#ededf0" href="/">На главную</a></p>');
    log(req, 404, started);
    return;
  }

  const ext = extname(file).toLowerCase();
  const stat = statSync(file);
  const etag = `W/"${stat.size}-${stat.mtimeMs.toString(36)}"`;

  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Last-Modified': stat.mtime.toUTCString(),
    ETag: etag,
    // ассеты Vite содержат хеш в имени — их можно кэшировать надолго
    'Cache-Control': /\/assets\//.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    log(req, 304, started);
    return;
  }

  if (req.method === 'HEAD') {
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    res.end();
    log(req, 200, started);
    return;
  }

  const wantsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const stream = createReadStream(file);

  if (wantsGzip && COMPRESSIBLE.has(ext) && stat.size > 1024) {
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    pipeline(stream, createGzip(), res, () => {});
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    pipeline(stream, res, () => {});
  }
  log(req, 200, started);
});

function log(req, status, started) {
  const mark = status >= 400 ? '×' : '·';
  const path = (req.url || '/').slice(0, 60);
  console.log(`  ${mark} ${status}  ${path}  ${Date.now() - started}ms`);
}

/* ---------- запуск с подбором свободного порта ---------- */

function listen(port, attemptsLeft = 10) {
  const onError = (err) => {
    server.off('listening', onListening);
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.log(`  порт ${port} занят, пробую ${port + 1}…`);
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error('\n  Не удалось занять порт:', err.message, '\n');
      process.exit(1);
    }
  };
  const onListening = () => {
    server.off('error', onError);
    // именно address().port, а не port: при подборе номер мог измениться
    onReady(server.address().port);
  };
  server.once('error', onError);
  server.once('listening', onListening);
  server.listen(port, HOST);
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  // 169.254.x.x — link-local, по такому адресу друг не зайдёт: в конец списка
  return out.sort((a, b) => Number(a.startsWith('169.254.')) - Number(b.startsWith('169.254.')));
}

function onReady(port) {
  const lan = lanAddresses();
  const name = (() => {
    try {
      return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).name;
    } catch {
      return 'сайт';
    }
  })();

  console.log('');
  console.log(`  ${name} — раздаю ${ROOT}`);
  console.log('');
  console.log(`  На этом компьютере   http://localhost:${port}/`);
  if (lan.length) {
    console.log(`  Для друзей в той же сети Wi-Fi:`);
    for (const ip of lan) console.log(`                       http://${ip}:${port}/`);
  } else {
    console.log('  Сетевой адрес не найден — доступно только локально.');
  }
  if (hub) {
    console.log('');
    console.log(`  Общий хаб включён: аккаунты, друзья и приглашения общие`);
    console.log(`  для всех в этой сети. Данные: ${hub.dbFile}`);
  }
  console.log('');
  if (!args.public) {
    console.log('  Нужна ссылка для друзей из интернета? Запустите с флагом --public');
    console.log('  или в соседнем терминале: npx localtunnel --port ' + port);
    console.log('');
  }
  console.log('  Ctrl+C — остановить');
  console.log('');

  if (args.public) openTunnel(port);
}

/* ---------- публичная ссылка ---------- */

function openTunnel(port) {
  console.log('  Поднимаю публичную ссылку через npx localtunnel…');
  console.log('');

  const child = spawn('npx', ['--yes', 'localtunnel', '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  let announced = false;

  // Если за полминуты ссылки нет — почти всегда это заблокированная сеть.
  const watchdog = setTimeout(() => {
    if (announced) return;
    console.log('');
    console.log('  localtunnel молчит больше 30 секунд. Обычно это значит, что');
    console.log('  сеть или файрвол не пускают наружу. Локальный сервер работает,');
    console.log('  а для постоянной ссылки смотрите раздел про GitHub Pages в README.');
    console.log('');
  }, 30_000);
  watchdog.unref();

  const onData = (buf) => {
    const text = buf.toString();
    const url = text.match(/https:\/\/[^\s]+\.loca\.lt/);
    if (url && !announced) {
      announced = true;
      clearTimeout(watchdog);
      console.log('');
      console.log(`  Публичная ссылка   ${url[0]}`);
      console.log('');
      console.log('  Важно: при первом заходе localtunnel просит ввести пароль —');
      console.log('  это ваш внешний IP, посмотреть можно на https://loca.lt/mytunnelpassword');
      console.log('');
    } else if (!url) {
      process.stdout.write('  localtunnel: ' + text);
    }
  };

  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('error', (err) => {
    clearTimeout(watchdog);
    console.log('');
    console.log('  Не удалось запустить localtunnel:', err.message);
    console.log('  Локальный сервер продолжает работать.');
    console.log('');
  });

  child.on('exit', (code) => {
    clearTimeout(watchdog);
    if (code !== 0 && code !== null) {
      console.log('');
      console.log(`  localtunnel завершился с кодом ${code}. Публичной ссылки не будет,`);
      console.log('  но локальный сервер работает. Альтернатива — выложить на GitHub Pages,');
      console.log('  см. README.');
      console.log('');
    }
  });

  const stop = () => {
    if (!child.killed) child.kill();
  };
  process.on('exit', stop);
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\n  Остановлено.\n');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  });
}

listen(BASE_PORT);
