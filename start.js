#!/usr/bin/env node
/**
 * ============================================================
 *  МИР — единый файл запуска
 * ============================================================
 *  Запуск:   node start.js
 *
 *  Этот файл сам:
 *   1. Проверит и установит зависимости (npm install), если их нет
 *   2. Запустит игровой сервер (server.js)
 *   3. Откроет сайт игры в браузере по умолчанию
 * ============================================================
 */

const { spawnSync, exec } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}`;

// ------------------------------------------------------------
// 1. Проверка и установка зависимостей
// ------------------------------------------------------------
function ensureDependencies() {
  const nodeModules = path.join(ROOT, 'node_modules');
  let needInstall = !fs.existsSync(nodeModules);

  if (!needInstall) {
    // Проверяем, что ключевые пакеты реально установлены
    const required = ['express', 'ws', 'better-sqlite3', 'bcryptjs', 'jsonwebtoken', 'cors', 'uuid'];
    needInstall = required.some((dep) => !fs.existsSync(path.join(nodeModules, dep)));
  }

  if (needInstall) {
    console.log('📦 Зависимости не найдены — устанавливаю (npm install)...');
    console.log('   Это нужно сделать только один раз, подождите...\n');
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (result.status !== 0) {
      console.error('\n❌ Не удалось установить зависимости. Проверьте, что установлен Node.js и npm.');
      process.exit(1);
    }
    console.log('\n✅ Зависимости установлены!\n');
  }
}

// ------------------------------------------------------------
// 2. Открытие браузера (Windows / macOS / Linux)
// ------------------------------------------------------------
function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  if (platform === 'win32') cmd = `start "" "${url}"`;
  else if (platform === 'darwin') cmd = `open "${url}"`;
  else cmd = `xdg-open "${url}"`;

  exec(cmd, (err) => {
    if (err) {
      console.log(`🌐 Не удалось открыть браузер автоматически. Откройте вручную: ${url}`);
    }
  });
}

// ------------------------------------------------------------
// 3. Ожидание, пока сервер начнёт отвечать, затем открыть сайт
// ------------------------------------------------------------
function waitForServer(url, attempts = 60) {
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    http
      .get(url, (res) => {
        res.resume();
        clearInterval(timer);
        console.log('');
        console.log('==================================================');
        console.log('  🎲 МИР — Ролевая онлайн-игра запущена!');
        console.log(`  🌐 Сайт игры:  ${URL}`);
        console.log('  ⏹  Остановить: Ctrl + C');
        console.log('==================================================');
        console.log('');
        openBrowser(url);
      })
      .on('error', () => {
        if (tries >= attempts) {
          clearInterval(timer);
          console.log(`⚠️  Сервер долго не отвечает. Попробуйте открыть вручную: ${url}`);
        }
      });
  }, 500);
}

// ------------------------------------------------------------
// Запуск
// ------------------------------------------------------------
console.log('');
console.log('🚀 Запуск игры «МИР»...');
console.log('');

ensureDependencies();
waitForServer(URL);

// Запускаем сервер прямо в этом же процессе
require(path.join(ROOT, 'server.js'));
