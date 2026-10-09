#!/usr/bin/env node
/**
 * Сервер показа сборки друзьям + хаб общих аккаунтов.
 *
 *   node serve.mjs                 # раздать ./dist на всех интерфейсах
 *   node serve.mjs . --port 8080   # другой каталог и порт
 *   node serve.mjs --public        # плюс публичная ссылка через Cloudflare / localtunnel
 *   node serve.mjs --no-hub        # без общих аккаунтов, только статика
 *   node serve.mjs --token TOKEN   # постоянный туннель Cloudflare по токену
 *
 * По умолчанию вместе со статикой работает хаб (/api/*): друзья в той же
 * Wi-Fi видят общие аккаунты, списки друзей и коды-приглашения. Данные —
 * в data/mir-hub.json.
 */
import { createServer, get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  appendFileSync,
  writeFileSync,
} from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream';
import { fromRoot } from '../scripts/lib/root.mjs';
import { createHub } from './hub.mjs';
import { checkDns, explainDns } from '../scripts/lib/net-check.mjs';

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
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map']);

/* ---------- логирование в файл logs/mir-server.log ---------- */

const LOG_DIR = resolve('logs');
const LOG_FILE = join(LOG_DIR, 'mir-server.log');

function logToFile(level, category, message) {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    if (existsSync(LOG_FILE)) {
      const st = statSync(LOG_FILE);
      if (st.size > 2 * 1024 * 1024) {
        // Ротация: оставляем последнюю половину файла при превышении 2 МБ
        const content = readFileSync(LOG_FILE, 'utf8');
        const half = content.slice(content.length / 2);
        writeFileSync(LOG_FILE, half, 'utf8');
      }
    }
    const iso = new Date().toISOString();
    const line = `[${iso}] [${level.toUpperCase()}] [${category}] ${message}\n`;
    appendFileSync(LOG_FILE, line, 'utf8');
  } catch { }
}

function copyToClipboard(text) {
  try {
    if (process.platform === 'win32') {
      const p = spawn('clip', { stdio: ['pipe', 'ignore', 'ignore'] });
      p.stdin.end(Buffer.from(text, 'utf8'));
    } else if (process.platform === 'darwin') {
      const p = spawn('pbcopy', { stdio: ['pipe', 'ignore', 'ignore'] });
      p.stdin.end(Buffer.from(text, 'utf8'));
    }
  } catch { }
}

/* Открыть игру в браузере. Важно звать уже после listen(): порт может
   оказаться не 4173, если он занят, — и тогда ссылка была бы битой. */
function openInBrowser(url) {
  try {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* Браузер не открылся — ссылка всё равно напечатана выше. */
  }
}

/* ---------- аргументы ---------- */

function parseArgs(argv) {
  const opts = { dir: null, port: null, public: false, hub: true, token: null, help: false, open: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--public' || a === '-p') opts.public = true;
    else if (a === '--open') opts.open = true;
    else if (a === '--no-hub') opts.hub = false;
    else if (a === '--hub') opts.hub = true;
    else if (a === '--port') opts.port = Number(argv[++i]);
    else if (a.startsWith('--port=')) opts.port = Number(a.slice(7));
    else if (a === '--token') opts.token = argv[++i];
    else if (a.startsWith('--token=')) opts.token = a.slice(8);
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
Статический сервер проекта с поддержкой хаба и защищённых туннелей.

  node serve.mjs [каталог] [--port N] [--public] [--token TOKEN] [--no-hub]

  каталог        что раздавать (по умолчанию dist)
  --port N       порт (по умолчанию 4173 или PORT из окружения)
  --public       публичная https-ссылка для друзей из интернета:
                 авто-переподключение, HTTP/2, сторожевой таймер от сбоев
  --token TOKEN  токен постоянного Cloudflare Tunnel (вечная неизменная ссылка)
  --open         открыть игру в браузере на том порту, который реально занят
  --no-hub       не поднимать хаб общих аккаунтов (/api/*)
  --help         эта справка
`);
  process.exit(0);
}

const ROOT = resolve(args.dir ?? 'dist');
const BASE_PORT = Number.isFinite(args.port) && args.port > 0 ? args.port : Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';

logToFile('info', 'server', `Starting The civilization of the sages server (dir: ${ROOT}, port: ${BASE_PORT}, public: ${args.public})`);

if (!existsSync(ROOT) || !statSync(ROOT).isDirectory()) {
  const msg = `Каталог «${ROOT}» не найден. Сначала соберите проект: npm run build`;
  console.error(`\n  ${msg}\n`);
  logToFile('error', 'server', msg);
  process.exit(1);
}

if (!existsSync(join(ROOT, 'index.html'))) {
  const msg = `В каталоге «${ROOT}» нет index.html — раздавать нечего.`;
  console.error(`\n  ${msg}\n`);
  logToFile('error', 'server', msg);
  process.exit(1);
}

/* ---------- хаб общих аккаунтов ---------- */

const hub = args.hub
  ? createHub({ dbFile: fromRoot('data', 'mir-hub.json') })
  : null;

/* ---------- сервер ---------- */

function resolveFile(urlPath) {
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
  if (!extname(decoded)) {
    const index = join(ROOT, 'index.html');
    return existsSync(index) ? index : null;
  }
  return null;
}

const server = createServer((req, res) => {
  const started = Date.now();

  // Служебный эндпоинт проверки здоровья для сторожевого таймера
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), time: Date.now() }));
    log(req, 200, started);
    return;
  }

  /* API хаба */
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
        logToFile('error', 'hub', `${req.url} error: ${err.message}`);
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
  const duration = Date.now() - started;
  /* Метод в строке обязателен: 404 GET /api/invite/use («нет такого
     метода») и 404 POST /api/invite/use («код не найден») — два
     совершенно разных диагноза. */
  console.log(`  ${mark} ${status}  ${req.method} ${path}  ${duration}ms`);
  if (status >= 400) {
    logToFile('warn', 'http', `${status} ${req.method} ${path} (${duration}ms)`);
  }
}

/* ---------- запуск с подбором свободного порта ---------- */

/* Живой канал лобби: обновление соединения отдаём хабу; всё, что не /api/ws, рвём. */
server.on('upgrade', (req, socket, head) => {
  const path = (req.url || '').split('?')[0];
  if (hub && path === '/api/ws') {
    hub.upgrade(req, socket, head);
    return;
  }
  socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
});

function listen(port, attemptsLeft = 10) {
  const onError = (err) => {
    server.off('listening', onListening);
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.log(`  порт ${port} занят, пробую ${port + 1}…`);
      logToFile('warn', 'port', `Port ${port} in use, trying ${port + 1}`);
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error('\n  Не удалось занять порт:', err.message, '\n');
      logToFile('error', 'port', `Failed to bind port: ${err.message}`);
      process.exit(1);
    }
  };
  const onListening = () => {
    server.off('error', onError);
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
  return out.sort((a, b) => Number(a.startsWith('169.254.')) - Number(b.startsWith('169.254.')));
}

function onReady(port) {
  const lan = lanAddresses();
  const name = 'The civilization of the sages';

  logToFile('info', 'server', `Server ready on port ${port}. LAN addresses: ${lan.join(', ') || 'none'}`);

  console.log('');
  console.log(`  ============================================================`);
  console.log(`  ${name} — сервер запущен (раздаю ${ROOT})`);
  console.log(`  ============================================================`);
  console.log('');
  console.log(`  На этом компьютере   http://localhost:${port}/`);
  if (lan.length) {
    console.log(`  Для друзей в той же сети Wi-Fi:`);
    for (const ip of lan) {
      console.log(`                       http://${ip}:${port}/`);
    }
    // Автокопирование первого Wi-Fi адреса, если не public
    if (!args.public && lan[0]) {
      copyToClipboard(`http://${lan[0]}:${port}/`);
      console.log(`  ✓ Ссылка Wi-Fi скопирована в буфер обмена (Ctrl+V)`);
    }
  } else {
    console.log('  Сетевой адрес не найден — доступно только локально.');
  }
  if (hub) {
    console.log('');
    console.log(`  Общий хаб включён: аккаунты, друзья и приглашения общие`);
    console.log(`  для всех в этой сети. Данные: ${hub.dbFile}`);
    /* Ключ панели админа владелец должен видеть: без него он не войдёт.
       При заводском ключе подсказываем, как сменить — в панели или
       переменной окружения. */
    console.log('');
    console.log(`  Панель админа: знак игры слева вверху — 7 быстрых касаний за 2,8 с`);
    console.log(`  (или Ctrl+Shift+Alt+A). Ключ: ${hub.adminKey}`);
    if (hub.adminKeyIsDefault && args.public)
      console.log(
        '  ⚠ Публичная ссылка открыта наружу, а ключ панели — заводской.\n' +
          '    Смените его в панели (Система → Ключ администратора) или задайте\n' +
          '    свой: MIR_ADMIN_KEY=свой-ключ node serve.mjs --public',
      );
    else if (hub.adminKeyIsDefault)
      console.log('  Свой ключ: в панели (Система → Ключ администратора) или MIR_ADMIN_KEY=свой-ключ');
  }
  console.log('');
  if (!args.public) {
    console.log('  Нужны друзья из интернета? Запустите с флагом --public');
    console.log('');
  }
  console.log('  Журнал логов: logs/mir-server.log');
  console.log('  Ctrl+C — остановить');
  console.log('');

  if (args.open) openInBrowser(`http://localhost:${port}/`);

  if (args.public) {
    openTunnel(port).catch((error) => {
      logToFile('error', 'tunnel', `openTunnel failed: ${error.message}`);
      console.log(`  Публичную ссылку поднять не удалось: ${error.message}`);
      console.log('  Локальный сервер продолжает работать.');
    });
  }
}

/* ---------- публичная ссылка с авто-восстановлением ---------- */

const HUB_NOTE = `  По этой же ссылке работает и общий хаб: аккаунты, друзья и
  приглашения у всех гостей — одни и те же. Отсюда же меню
  устанавливается на телефон как приложение (кнопка «Установить»).`;

const CLOUDFLARED_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const LOCALTUNNEL_RE = /https:\/\/[^\s]+\.loca\.lt/;

function spawnTunnel(command, cmdArgs) {
  return spawn(command, cmdArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
}

let activeChildProcess = null;
let watchdogTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

function stopTunnelWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

function startTunnelWatchdog(url, port, onFail) {
  stopTunnelWatchdog();
  let failureCount = 0;

  watchdogTimer = setInterval(async () => {
    try {
      const isHttps = url.startsWith('https:');
      const getter = isHttps ? httpsGet : httpGet;
      const pingUrl = `${url}/api/health`;

      const req = getter(pingUrl, { headers: { 'User-Agent': 'MIR-Watchdog/1.0' } }, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 500) {
          if (failureCount > 0) {
            logToFile('info', 'watchdog', `Health recovered (status ${res.statusCode})`);
          }
          failureCount = 0;
        } else if (res.statusCode === 502 || res.statusCode === 503 || res.statusCode === 1033) {
          failureCount++;
          logToFile('warn', 'watchdog', `Health ping returned ${res.statusCode}, failure count: ${failureCount}`);
        }
      });

      req.setTimeout(8000, () => {
        req.destroy();
        failureCount++;
        logToFile('warn', 'watchdog', `Health ping timeout, failure count: ${failureCount}`);
      });

      req.on('error', (err) => {
        failureCount++;
        logToFile('warn', 'watchdog', `Health ping error: ${err.message}, failure count: ${failureCount}`);
      });

      if (failureCount >= 3) {
        logToFile('error', 'watchdog', `Tunnel ${url} unresponsive 3 times in a row. Restarting connection...`);
        console.log('');
        console.log('  [Watchdog] Обнаружен сбой связи туннеля (Error 1033 / таймаут).');
        console.log('  Автоматически перезапускаю соединение…');
        console.log('');
        failureCount = 0;
        if (activeChildProcess && !activeChildProcess.killed) {
          activeChildProcess.kill();
        }
      }
    } catch (err) {
      logToFile('error', 'watchdog', `Watchdog tick error: ${err.message}`);
    }
  }, 25_000);

  if (watchdogTimer.unref) watchdogTimer.unref();
}

function runCloudflared(port, onFail) {
  const token = args.token || process.env.CLOUDFLARE_TUNNEL_TOKEN || process.env.CLOUDFLARE_TOKEN || (() => {
    try {
      const tf = resolve('data/tunnel-token.txt');
      return existsSync(tf) ? readFileSync(tf, 'utf8').trim() : null;
    } catch {
      return null;
    }
  })();

  const cmdArgs = token
    ? ['--yes', 'cloudflared', 'tunnel', 'run', '--token', token]
    : ['--yes', 'cloudflared', 'tunnel', '--url', `http://127.0.0.1:${port}`, '--protocol', 'http2', '--no-autoupdate'];

  console.log('  Поднимаю публичную https-ссылку через Cloudflare Tunnel…');
  logToFile('info', 'tunnel', `Starting cloudflared (hasToken: ${Boolean(token)}, protocol: http2, port: ${port})`);

  const child = spawnTunnel('npx', cmdArgs);
  activeChildProcess = child;

  let announced = false;

  const initialWatchdog = setTimeout(() => {
    if (!announced) {
      logToFile('warn', 'tunnel', 'Cloudflare startup timed out after 60s');
      console.log('');
      console.log('  Cloudflare Tunnel молчит больше минуты (сеть не пустила или');
      console.log('  не скачался cloudflared). Пробую запасной вариант — localtunnel…');
      console.log('');
      if (!child.killed) child.kill();
      onFail();
    }
  }, 60_000);

  const onData = (buf) => {
    const text = buf.toString();
    logToFile('debug', 'cloudflared', text.trim());
    if (announced) return;

    const urlMatch = text.match(CLOUDFLARED_RE);
    if (urlMatch) {
      announced = true;
      clearTimeout(initialWatchdog);
      const url = urlMatch[0];
      reconnectAttempts = 0;

      logToFile('info', 'tunnel', `Cloudflare Tunnel established: ${url}`);

      console.log('');
      console.log(`  ============================================================`);
      console.log(`  ✓ ПУБЛИЧНАЯ ССЫЛКА ДЛЯ ДРУЗЕЙ:`);
      console.log(`    ${url}`);
      console.log(`  ============================================================`);
      console.log('  ✓ Ссылка скопирована в буфер обмена (Ctrl+V в чат с друзьями)');
      console.log('  Пароль не нужен — скидывайте друзьям как есть.');
      console.log(HUB_NOTE);
      console.log('');
      console.log('  [i] Защита от сбоев: авто-проверка здоровья и протокол HTTP/2 активны.');
      console.log('  [!] НЕ ЗАКРЫВАЙТЕ ЭТО ОКНО — пока оно открыто, ссылка работает.');
      console.log('');

      copyToClipboard(url);
      startTunnelWatchdog(url, port, onFail);
    }
  };

  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('error', (err) => {
    logToFile('error', 'cloudflared', `Process error: ${err.message}`);
    clearTimeout(initialWatchdog);
    if (!announced) onFail();
  });

  child.on('exit', (code, signal) => {
    clearTimeout(initialWatchdog);
    stopTunnelWatchdog();
    logToFile('warn', 'cloudflared', `Process exited (code: ${code}, signal: ${signal})`);

    if (announced) {
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 8000);
        console.log('');
        console.log(`  [!] Связь с туннелем прервалась. Выполняю авто-восстановление (попытка ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) через ${delay / 1000}с…`);
        logToFile('info', 'tunnel', `Auto-reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
        setTimeout(() => runCloudflared(port, onFail), delay);
      } else {
        console.log('');
        console.log('  [!] Не удалось восстановить Cloudflare Tunnel после нескольких попыток.');
        console.log('  Переключаюсь на резервный вариант (localtunnel)…');
        logToFile('warn', 'tunnel', 'Cloudflare retries exhausted. Failing over to localtunnel.');
        onFail();
      }
    } else {
      console.log('');
      console.log(`  Cloudflare Tunnel не поднялся${code ? ` (код ${code})` : ''}.`);
      console.log('  Пробую запасной вариант — localtunnel…');
      logToFile('warn', 'tunnel', `Cloudflare failed on start (code ${code}). Failing over to localtunnel.`);
      onFail();
    }
  });
}

function runLocaltunnel(port) {
  console.log('  Поднимаю публичную ссылку через npx localtunnel…');
  logToFile('info', 'localtunnel', `Starting localtunnel on port ${port}`);

  const child = spawnTunnel('npx', ['--yes', 'localtunnel', '--port', String(port)]);
  activeChildProcess = child;

  let announced = false;

  const watchdog = setTimeout(() => {
    if (announced) return;
    console.log('');
    console.log('  localtunnel молчит больше 30 секунд. Обычно это значит, что');
    console.log('  сеть или файрвол не пускают наружу. Локальный сервер работает.');
    console.log('  Запустите диагностику: npm run doctor');
    console.log('');
    logToFile('warn', 'localtunnel', 'Localtunnel timeout after 30s');
  }, 30_000);
  watchdog.unref();

  const onData = (buf) => {
    const text = buf.toString();
    logToFile('debug', 'localtunnel', text.trim());
    const url = text.match(LOCALTUNNEL_RE);
    if (url && !announced) {
      announced = true;
      clearTimeout(watchdog);
      const publicUrl = url[0];
      logToFile('info', 'localtunnel', `Localtunnel established: ${publicUrl}`);

      console.log('');
      console.log(`  ============================================================`);
      console.log(`  ✓ ПУБЛИЧНАЯ ССЫЛКА (localtunnel):`);
      console.log(`    ${publicUrl}`);
      console.log(`  ============================================================`);
      console.log('  ✓ Ссылка скопирована в буфер обмена (Ctrl+V в чат с друзьями)');
      console.log('');
      console.log('  Важно: при первом заходе localtunnel просит ввести пароль —');
      console.log('  это ваш внешний IP, посмотреть можно на https://loca.lt/mytunnelpassword');
      console.log('  После ввода пароля страницу стоит обновить, чтобы включился общий хаб.');
      console.log(HUB_NOTE);
      console.log('');

      copyToClipboard(publicUrl);
    } else if (!url) {
      process.stdout.write('  localtunnel: ' + text);
    }
  };

  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('error', (err) => {
    clearTimeout(watchdog);
    logToFile('error', 'localtunnel', `Process error: ${err.message}`);
    console.log('');
    console.log('  Не удалось запустить localtunnel:', err.message);
    console.log('  Локальный сервер продолжает работать.');
    console.log('');
  });

  child.on('exit', (code) => {
    clearTimeout(watchdog);
    logToFile('warn', 'localtunnel', `Process exited with code ${code}`);
    if (code !== 0 && code !== null) {
      console.log('');
      console.log(`  localtunnel завершился с кодом ${code}. Публичной ссылки не будет,`);
      console.log('  но локальный сервер работает.');
      console.log('  Запустите диагностику: npm run doctor (или ЛОГИ-И-ДИАГНОСТИКА.bat)');
      console.log('');
    }
  });
}

async function openTunnel(port) {
  /* Сначала смотрим, работает ли DNS. Cloudflare Tunnel без SRV-записи
     не стартует вообще, и ждать его минуту бессмысленно: лучше сразу
     объяснить причину и уйти на localtunnel, которому хватает обычного
     разрешения имён. */
  console.log('  Проверяю сеть перед публикацией ссылки…');
  const report = await checkDns();
  logToFile(
    'info',
    'tunnel',
    `DNS check: verdict=${report.verdict} lookup=${report.lookup.ok} resolve4=${report.resolve4.ok} ` +
      `srv=${report.srv.ok} srvPublic=${report.srvPublic.ok} servers=${report.servers.join(',')}`,
  );

  if (report.verdict === 'ok') {
    runCloudflared(port, () => runLocaltunnel(port));
    return;
  }

  console.log('');
  for (const line of explainDns(report)) console.log(`  ${line}`);
  console.log('');

  if (report.verdict === 'offline') {
    console.log('  Публичную ссылку пропускаю: без интернета её негде разместить.');
    console.log('  Адреса для друзей в этой же сети Wi-Fi напечатаны выше.');
    console.log('');
    return;
  }

  if (!report.cloudflareWillWork) {
    console.log('  Cloudflare пропускаю — он без SRV-записи не запустится.');
    console.log('  Пробую localtunnel: ему хватает обычного разрешения имён.');
    console.log('');
    runLocaltunnel(port);
    return;
  }

  console.log('  Пробую Cloudflare — SRV-запись всё-таки отвечает.');
  console.log('');
  runCloudflared(port, () => runLocaltunnel(port));
}

const cleanup = () => {
  stopTunnelWatchdog();
  if (activeChildProcess && !activeChildProcess.killed) {
    activeChildProcess.kill();
  }
};

process.on('exit', cleanup);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    logToFile('info', 'server', `Server stopped by signal ${sig}`);
    console.log('\n  Сервер остановлен.\n');
    cleanup();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  });
}

listen(BASE_PORT);
