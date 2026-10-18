/* Chromium smoke test над собранной веб-версией. Требует `npm run build` и
   Chromium (`npx playwright install chromium`); сервер поднимается здесь. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = Number(process.env.SAGES_TEST_PORT || 4179);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/serve.mjs', 'dist', '--port', String(port), '--no-hub'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk; });
server.stderr.on('data', (chunk) => { serverLog += chunk; });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Веб-сервер завершился: ${serverLog}`);
    try {
      const response = await fetch(base);
      if (response.ok) { ready = true; break; }
    } catch { /* сервер ещё запускается */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, `Сервер не стартовал: ${serverLog}`);

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('#app').waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: /The civilization/i }).first().waitFor({ state: 'visible', timeout: 20_000 });

  await page.locator('[data-action="open-settings"]').first().click();
  const settings = page.getByRole('dialog', { name: 'Настройки' });
  await settings.waitFor({ state: 'visible' });
  assert.ok(await settings.locator('[data-setting="sound"]').count(), 'sound option is present');
  assert.ok(await settings.locator('[data-setting="motion"]').count(), 'motion option is present');
  await page.keyboard.press('Escape');
  await settings.waitFor({ state: 'detached' });

  /* Offline reload proves that the installed service worker serves the app
     shell, not merely that the page remains alive in memory. */
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
  });
  await page.waitForTimeout(700);
  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker?.controller));
  assert.ok(controlled, 'service worker should control the page after activation');
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /The civilization/i }).first().waitFor({ state: 'visible', timeout: 15_000 });
  await context.setOffline(false);
  assert.deepEqual(errors, [], `Browser console errors: ${errors.join(' | ')}`);
  console.log('Chromium: запуск, экран настроек, закрытие диалога и офлайн-перезагрузка прошли');
  await context.close();
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
