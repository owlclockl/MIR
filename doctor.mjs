#!/usr/bin/env node
/**
 * MIR Diagnostic Doctor — инструмент самодиагностики сети, туннелей и логов.
 * Запуск: node doctor.mjs (или через ЛОГИ-И-ДИАГНОСТИКА.bat / npm run doctor)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces, cpus, totalmem, freemem, platform, arch, release } from 'node:os';
import { createServer, get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { resolve, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { promises as dns } from 'node:dns';

console.log('============================================================');
console.log('   MIR — Диагностика системы, сети и туннелей (Doctor)    ');
console.log('============================================================\n');

const reportLines = [];
function add(line = '') {
  console.log(line);
  reportLines.push(line);
}

function copyClipboard(text) {
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

async function checkUrl(url, timeoutMs = 5000) {
  return new Promise((res) => {
    const isHttps = url.startsWith('https:');
    const getter = isHttps ? httpsGet : httpGet;
    const req = getter(url, { headers: { 'User-Agent': 'MIR-Doctor/1.0' } }, (response) => {
      response.resume();
      res({ ok: true, status: response.statusCode, error: null });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      res({ ok: false, status: 0, error: 'Таймаут соединения (более 5с)' });
    });
    req.on('error', (err) => {
      res({ ok: false, status: 0, error: err.message });
    });
  });
}

async function checkPortAvailable(port) {
  return new Promise((res) => {
    const s = createServer();
    s.once('error', (err) => {
      res({ available: false, error: err.code || err.message });
    });
    s.once('listening', () => {
      s.close(() => res({ available: true, error: null }));
    });
    s.listen(port, '0.0.0.0');
  });
}

// 1. Система
add('--- 1. СИСТЕМА И ОКРУЖЕНИЕ ---');
add(`  Дата и время (UTC): ${new Date().toISOString()}`);
add(`  ОС:                 ${platform()} ${release()} (${arch()})`);
add(`  Node.js:            ${process.version}`);
add(`  Память (RAM):       Всего ${(totalmem() / 1024 / 1024 / 1024).toFixed(1)} ГБ, Свободно ${(freemem() / 1024 / 1024 / 1024).toFixed(1)} ГБ`);
add(`  Процессор:          ${cpus().length} ядер`);
add(`  Рабочий каталог:    ${process.cwd()}`);

// 2. Локальная сеть
add('\n--- 2. ЛОКАЛЬНАЯ СЕТЬ И ИНТЕРФЕЙСЫ ---');
const ifaces = networkInterfaces();
const ipv4List = [];
for (const [name, list] of Object.entries(ifaces)) {
  for (const net of list || []) {
    if (net.family === 'IPv4') {
      const type = net.internal ? 'локальный' : net.address.startsWith('169.254.') ? 'link-local' : 'сетевой (Wi-Fi/Ethernet)';
      add(`  [${name}] ${net.address} (${type})`);
      if (!net.internal) ipv4List.push(net.address);
    }
  }
}
if (ipv4List.length === 0) {
  add('  [!] Сетевые интерфейсы Wi-Fi/Ethernet не найдены. Игра по локальной сети недоступна.');
} else {
  add(`  [OK] Доступно ${ipv4List.length} сетевых адресов для подключения друзей по Wi-Fi.`);
}

// 3. Проверка портов
add('\n--- 3. ПОРТЫ СЕРВЕРА ---');
for (const p of [4173, 4174, 8080]) {
  const pCheck = await checkPortAvailable(p);
  if (pCheck.available) {
    add(`  [OK] Порт ${p}: свободен`);
  } else {
    add(`  [!] Порт ${p}: занят (${pCheck.error}) — сервер автоматически переключится на следующий`);
  }
}

// 4. Проверка интернета и DNS
add('\n--- 4. ИНТЕРНЕТ И DNS ---');
const domains = ['cloudflare.com', 'trycloudflare.com', 'loca.lt', 'github.com'];
for (const d of domains) {
  try {
    const ips = await dns.resolve4(d);
    add(`  [OK] DNS резолв ${d}: ${ips.slice(0, 2).join(', ')}`);
  } catch (err) {
    add(`  [FAIL] DNS резолв ${d} НЕ УДАЛСЯ: ${err.message}`);
  }
}

// 5. Проверка доступности шлюзов туннелей
add('\n--- 5. ДОСТУПНОСТЬ СЕРВЕРОВ ТУННЕЛЕЙ ---');
const endpoints = [
  { name: 'Cloudflare HTTPS', url: 'https://cloudflare.com' },
  { name: 'Cloudflare 1.1.1.1', url: 'https://1.1.1.1' },
  { name: 'Localtunnel Gateway', url: 'https://loca.lt' },
];

for (const ep of endpoints) {
  const res = await checkUrl(ep.url);
  if (res.ok) {
    add(`  [OK] ${ep.name}: статус ${res.status}`);
  } else {
    add(`  [FAIL] ${ep.name}: недоступен (${res.error})`);
  }
}

// 6. Проверка постоянного токена Cloudflare
add('\n--- 6. ПОСТОЯННЫЙ ТОКЕН ТУННЕЛЯ ---');
const tokenFile = resolve('data/tunnel-token.txt');
const hasEnvToken = Boolean(process.env.CLOUDFLARE_TUNNEL_TOKEN || process.env.CLOUDFLARE_TOKEN);
const hasFileToken = existsSync(tokenFile);

if (hasEnvToken || hasFileToken) {
  add(`  [OK] Найден постоянный токен туннеля (${hasFileToken ? 'в data/tunnel-token.txt' : 'из переменной окружения'}).`);
  add('       Сервер будет использовать постоянный адрес, который никогда не меняется и защищён от Error 1033.');
} else {
  add('  [INFO] Постоянный токен не настроен (используется бесплатный Quick Tunnel trycloudflare).');
  add('         Подсказка: чтобы получить вечную ссылку, создайте бесплатный туннель на cloudflare.com');
  add('         и сохраните токен в файл data/tunnel-token.txt');
}

// 7. Последние записи логов сервера
add('\n--- 7. ПОСЛЕДНИЕ СОБЫТИЯ ИЗ ЖУРНАЛА (logs/mir-server.log) ---');
const logFile = resolve('logs/mir-server.log');
if (existsSync(logFile)) {
  const logContent = readFileSync(logFile, 'utf8');
  const lines = logContent.trim().split(/\r?\n/).filter(Boolean);
  const recent = lines.slice(-25);
  for (const l of recent) {
    add(`  ${l}`);
  }
} else {
  add('  Журнал логов пока пуст (сервер ещё не запускался).');
}

// 8. Рекомендации
add('\n============================================================');
add('   ИТОГИ И РЕКОМЕНДАЦИИ');
add('============================================================');
if (ipv4List.length > 0) {
  add('  1. Если друзья рядом в одной сети Wi-Fi:');
  add('     Используйте пункт [1] в ИГРАТЬ-С-ДРУЗЬЯМИ.bat — это самый надёжный способ (без интернета).');
}
add('  2. Если друзья играют через интернет:');
add('     • Запустите пункт [2] в ИГРАТЬ-С-ДРУЗЬЯМИ.bat.');
add('     • НЕ ЗАКРЫВАЙТЕ черное окно консоли во время игры — ссылка работает, пока окно открыто!');
add('     • Включена автозащита: протокол HTTP/2 и фоновое восстановление туннеля.');
add('  3. Если вы хотите отправить этот отчёт разработчику:');
add('     Отчёт уже автоматически скопирован в буфер обмена! Просто нажмите Ctrl+V в чате.');
add('============================================================\n');

// Сохранение отчёта в файл
if (!existsSync('logs')) mkdirSync('logs', { recursive: true });
const reportText = reportLines.join('\n');
writeFileSync('logs/diagnostic-report.txt', reportText, 'utf8');
copyClipboard(reportText);

console.log('✓ Отчёт сохранён в logs/diagnostic-report.txt и скопирован в буфер обмена (Ctrl+V).');
