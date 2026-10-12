/* Вид планеты в настоящем DOM: запуск `npm run test:planet-view`.

   Проверяется то, что между «модули считают правильно» (test:planet) и
   «глазами видно красиво»: монтирование вида в тот же хост, где жил редактор,
   ползунок слоёв, переключатели, приближение колёсом и кнопками, перенос
   мышью, смена размера планеты и снятие вида без утечки кадрового цикла.

   jsdom не умеет рисовать: ни WebGL, ни холста 2D. Поэтому в тесте подложен
   черновой 2D-контекст — ровно с теми вызовами, которые вид делает. Так
   проверяется не картинка, а конвейер: тайлы реально считаются, кладутся в
   кэш и отдаются в холст; насколько они красивы — решит человек.

   jsdom ставится разово: npm i --no-save jsdom (он нужен и test:ui). */

import './lib/root.mjs';

let JSDOM;
let VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = await import('jsdom'));
} catch {
  console.error('Нет jsdom. Поставьте его разово: npm i --no-save jsdom');
  process.exit(1);
}

/* Русское согласование числительного: «61 проверка», а не «61 проверок». */
const plural = (n, one, few, many) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const checks = [];
const add = (ok, what, detail = '') => checks.push({ ok: Boolean(ok), what, detail });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const page = `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head>
  <body><div class="world-editor" data-role="world-editor-host">
    <iframe class="world-editor-frame" data-role="world-editor"></iframe>
  </div></body></html>`;

const consoleErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => consoleErrors.push(`jsdomError: ${error?.message}`));
virtualConsole.on('error', (message) => consoleErrors.push(`console.error: ${message}`));

const dom = new JSDOM(page, { pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole });
const { window } = dom;

/* Вид читает глобальные document, requestAnimationFrame, ImageData… Даём ему
   окно jsdom тем же способом, что и test:ui, и только потом поднимаем вид. */
if (typeof globalThis.ImageData !== 'function') {
  globalThis.ImageData = class ImageData {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  };
}
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  disconnect() {}
};

/* Черновой 2D-контекст: запоминает вызовы, чтобы проверять не пиксели, а то,
   что вид вообще дошёл до рисования. */
const canvasCalls = { fillRect: 0, drawImage: 0, putImageData: 0 };
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  return {
    canvas: this,
    fillStyle: '#000',
    fillRect: () => {
      canvasCalls.fillRect += 1;
    },
    drawImage: () => {
      canvasCalls.drawImage += 1;
    },
    putImageData: () => {
      canvasCalls.putImageData += 1;
    },
    setTransform: () => {},
    save: () => {},
    restore: () => {},
    clearRect: () => {},
  };
};
window.HTMLCanvasElement.prototype.getBoundingClientRect = function rect() {
  return { x: 0, y: 0, left: 0, top: 0, width: 1200, height: 700, right: 1200, bottom: 700 };
};

const GLOBALS = [
  'window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event',
  'MouseEvent', 'KeyboardEvent', 'requestAnimationFrame', 'cancelAnimationFrame',
  'MutationObserver', 'ResizeObserver', 'ImageData',
];
for (const name of GLOBALS) {
  if (window[name] === undefined) continue;
  /* navigator в Node — только чтение, поэтому его не трогаем. */
  Object.defineProperty(globalThis, name, { value: window[name], configurable: true, writable: true });
}

const { mountPlanetView } = await import('../src/planet/view.js');
const { LAYERS } = await import('../src/planet/paint.js');

const host = window.document.querySelector('[data-role="world-editor-host"]');
const frame = host.querySelector('.world-editor-frame');

let view = null;
try {
  view = mountPlanetView(host, { seed: 'mir-2026', size: 1, onExit: () => {} });
  add(!view.error, 'вид монтируется без ошибки', view.error ?? '');
} catch (error) {
  add(false, 'вид монтируется без ошибки', error instanceof Error ? error.message : String(error));
}

if (view) {
  const el = host.querySelector('.planet-view');
  add(Boolean(el), 'разметка вида лежит в хосте редактора');
  add(frame?.isConnected === true, 'документ Azgaar остался в DOM (не пересоздаётся)');
  add(Boolean(el.querySelector('canvas')), 'холст на месте');

  const range = el.querySelector('[data-role="layer-range"]');
  add(range?.max === String(LAYERS.length - 1), `ползунок слоёв: ${LAYERS.length} положений`, range?.max ?? '—');
  add(el.querySelector('[data-role="layer-name"]')?.textContent?.includes(LAYERS[0].name) === true,
    'подпись называет первый слой', el.querySelector('[data-role="layer-name"]')?.textContent ?? '—');

  /* Слой: крутим ползунок на пятый слой. */
  range.value = '4';
  range.dispatchEvent(new window.Event('input', { bubbles: true }));
  add(el.querySelector('[data-role="layer-name"]')?.textContent?.includes(LAYERS[4].name) === true,
    'ползунок переключает слой', el.querySelector('[data-role="layer-name"]')?.textContent ?? '—');

  /* Переключатели. */
  const rivers = el.querySelector('[data-toggle="rivers"]');
  rivers.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  add(rivers.getAttribute('aria-pressed') === 'false', 'переключатель рек снимается');

  /* Размер планеты. */
  const size4 = el.querySelector('[data-action="size"][data-size="4"]');
  size4?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  add(size4?.classList.contains('is-active') === true, 'кнопка 4× становится активной');
  const stats4 = view.stats?.();
  add(stats4 && Math.round(stats4.widthM / 1000) === Math.round(40075 * 4), 'планета 4×: экватор 160 300 км',
    stats4 ? `${Math.round(stats4.widthM / 1000)} тыс. км` : 'нет статистики');

  /* Возврат на 1× — на нём тайлы считаются быстрее. */
  el.querySelector('[data-action="size"][data-size="1"]')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);

  /* Приближение кнопкой: уровень обязан вырасти. */
  const before = view.stats?.().level ?? -1;
  el.querySelector('[data-action="zoom-in"]')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(30);
  const after = view.stats?.().level ?? -1;
  add(after === before + 1, 'кнопка «Приблизить» повышает уровень', `${before} → ${after}`);

  /* Приближение колёсом: точку под курсором держим, уровень меняем. */
  const canvas = el.querySelector('canvas');
  canvas.dispatchEvent(new window.WheelEvent('wheel', { deltaY: -120, clientX: 300, clientY: 200, bubbles: true, cancelable: true }));
  await wait(30);
  add(view.stats?.().level === after + 1, 'колесо приближает', `${after} → ${view.stats?.().level}`);

  /* Перенос мышью. */
  canvas.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 600, clientY: 350, button: 0 }));
  canvas.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 500, clientY: 300 }));
  canvas.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 500, clientY: 300 }));
  await wait(30);
  add(Boolean(el.querySelector('[data-role="readout"]')?.textContent), 'показания под курсором заполняются',
    el.querySelector('[data-role="readout"]')?.textContent ?? '—');

  /* Кадры: ждём, пока очередь тайлов прокрутится. */
  await wait(1500);
  const stats = view.stats?.() ?? {};
  add(stats.cached > 0, 'тайлы считаются и попадают в кэш', `в кэше ${stats.cached}, в очереди ${(stats.queue ?? 0) + (stats.rivers ?? 0)}`);
  add(canvasCalls.fillRect > 0 && canvasCalls.drawImage > 0, 'кадр рисуется: холст получает прямоугольники и тайлы',
    `fillRect ${canvasCalls.fillRect}, drawImage ${canvasCalls.drawImage}, putImageData ${canvasCalls.putImageData}`);
  add(Number.isFinite(stats.mpp) && stats.mpp > 0, 'масштаб кадра известен', `${stats.mpp} м/пиксель`);
  add(Boolean(el.querySelector('[data-role="status"]')?.textContent?.includes('/пиксель')), 'строка состояния показывает масштаб',
    el.querySelector('[data-role="status"]')?.textContent ?? '—');

  /* Снятие вида. */
  view.dispose();
  add(host.querySelector('.planet-view') === null, 'снятие вида убирает разметку из DOM');
  const drawn = canvasCalls.drawImage;
  await wait(120);
  add(canvasCalls.drawImage === drawn, 'после снятия вида кадры не считаются');
  add(consoleErrors.length === 0, 'в консоль не падает ничего неожиданного', consoleErrors.slice(0, 2).join(' | '));
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? '✓' : '×'} ${check.what}${check.ok || !check.detail ? '' : ` — ${check.detail}`}`);
}
console.log(`\n${checks.length} ${plural(checks.length, 'проверка', 'проверки', 'проверок')}: ${checks.length - failed.length} удачно, ${failed.length} ${plural(failed.length, 'падение', 'падения', 'падений')}.`);
dom.window.close();
process.exit(failed.length ? 1 : 0);
