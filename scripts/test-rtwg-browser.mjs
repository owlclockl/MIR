/* Настоящий Chromium: RTWG-движок (WASM + WebGL2) крутится прямо в браузере.
   Игровые экраны, из которых он раньше открывался кнопкой «Играть», удалены
   по запросу пользователя; сам движок остаётся исходником в `src/rtwg/` и
   проверяется сам по себе, без интерфейса.

   Нужен vite dev-сервер (`npm run dev`) и установленный Playwright Chromium
   либо SAGES_CHROMIUM_EXECUTABLE. Адрес можно задать аргументом:
   `npm run test:rtwg-browser -- http://127.0.0.1:5173/`. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { fromRoot } from './lib/root.mjs';
const { chromium } = await import(
  pathToFileURL(fromRoot('vendor/azgaar-fantasy-map-generator/node_modules/playwright/index.mjs'))
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.SAGES_CHROMIUM_EXECUTABLE || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  /* Движок берётся исходниками через dev-сервер: в собранной сборке его нет,
     и проверять там нечего — тогда честно говорим об этом, а не проходим молча. */
  assert.ok(
    await page.locator('script[src*="/@vite/client"]').count(),
    'нужен vite dev-сервер (`npm run dev`): в собранной сборке RTWG больше не подключается',
  );
  const result = await page.evaluate(async () => {
    const { createRtwgEngine } = await import('/src/rtwg/engine.js');
    const { encodeSnapshot, decodeSnapshot } = await import('/src/rtwg/snapshot.js');
    const c = document.createElement('canvas');
    c.width = 640; c.height = 320; document.body.append(c);
    const e = await createRtwgEngine(c, { seed: 'gpu-test', width: 64, height: 32 });
    try {
      for (let i = 0; i < 32; i++) e.step();
      const finite = Array.from({ length: 8 }, (_, i) => e.read(i).every(Number.isFinite));
      const snapshot = e.snapshot(), water = e.read(2);
      e.enabled.water = false; e.step();
      const waterAfter = e.read(2);
      const frozen = water.every((v, i) => v === waterAfter[i]);
      e.restore(snapshot);
      const equal = e.snapshot().fields.every((a, f) => a.every((v, i) => v === snapshot.fields[f][i]));
      const round = decodeSnapshot(encodeSnapshot(snapshot));
      e.restore(round);
      const json = e.read(0).every((v, i) => v === snapshot.fields[0][i]);
      e.setTectonic(true);
      for (let i = 0; i < 8; i++) e.step();
      e.setTectonic(false);
      const changed = e.read(0).some((v, i) => v !== snapshot.fields[0][i]);
      const waterDepth = e.read(2).filter((_, i) => i % 4 === 0).every((v) => v >= 0);
      for (let i = 0; i < 8; i++) e.render({ field: i });
      e.render({ threeD: true });
      return { finite, frozen, equal, json, changed, waterDepth, error: c.getContext('webgl2').getError(), width: e.width };
    } finally {
      e.dispose(); c.remove();
    }
  });
  assert.deepEqual(result.finite, Array(8).fill(true));
  for (const k of ['frozen', 'equal', 'json', 'changed', 'waterDepth']) assert.equal(result[k], true, k);
  assert.equal(result.error, 0);
  console.log('✓ WASM + восемь GPU-проходов, 2D/3D/тени, тектоника, заморозка и lossless snapshot');
  assert.deepEqual(errors, []);
  console.log('RTWG browser: all checks passed');
} finally {
  await browser.close();
}
