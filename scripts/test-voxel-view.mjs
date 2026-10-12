/* Блочная карта в настоящем DOM: запуск `npm run test:voxel-view`.

   Что проверяется и почему именно это: src/world/* покрыт test:voxel, а между
   ними — mountWorldView(): разметка, ползунок яруса, пресеты, зум, панорама
   мышью и стрелками, подсказка под курсором, очередь чанков в кадре и снятие
   вида. Холст 2D в jsdom отсутствует, поэтому подставляем минимальный контекст
   (fillRect, drawImage, putImageData, createImageData): путь рисования
   выполняется, а пиксели здесь не проверяются — это делает test:voxel.

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

const { fakeEditorWindow, FAKE_MAP } = await import('./lib/fake-fmg.mjs');

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

/* Модули игры читают глобальный document — даём им окно jsdom тем же способом,
   каким это делает test:ui, и только потом поднимаем сам вид. */
const VIEW_GLOBALS = ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver'];
for (const name of VIEW_GLOBALS) {
  if (window[name] === undefined) continue;
  /* В Node 22 часть глобалей (navigator, performance) — геттеры: только
     defineProperty, и молча, если переопределить нельзя. */
  try {
    Object.defineProperty(globalThis, name, { value: window[name], configurable: true, writable: true });
  } catch {
    void name;
  }
}

/* Минимальный 2D-контекст: рисование не проверяем, только вызовы не падают. */
const fakeContext = () => ({
  imageSmoothingEnabled: true,
  fillStyle: '',
  fillRect() {},
  clearRect() {},
  drawImage() {},
  putImageData() {},
  createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
});
window.HTMLCanvasElement.prototype.getContext = fakeContext;
/* Окно 320 × 240 css px: при 4× видно 80 × 60 блоков, карта — 96 × 96, то есть
   есть что прокручивать. Окно больше карты центрируется — это отдельный случай. */
Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 320 });
Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 240 });
globalThis.OffscreenCanvas = undefined;

const { mountWorldView } = await import('../src/game/world-view.js');
const { layerOf } = await import('../src/world/layers.js');

const host = window.document.querySelector('[data-role="world-editor-host"]');
let exited = 0;
const view = mountWorldView(host, {
  frame: { contentWindow: fakeEditorWindow() },
  config: { seed: 'вид', width: FAKE_MAP.size, height: FAKE_MAP.size },
  onExit: () => {
    exited += 1;
  },
});

add(view.element?.dataset.role === 'world-voxel', 'вид смонтирован в хост редактора');
add(!view.error, 'снимок карт прочитан без ошибки', view.error ?? '');
add(view.field?.width === FAKE_MAP.size && view.field?.height === FAKE_MAP.size,
  'поле взято из окна редактора', `${view.field?.width}×${view.field?.height}`);
add(view.source?.stats.rivers === 1 && view.source?.stats.lakes === 1,
  'реки и озёра дошли до вида', `${view.source?.stats.rivers} рек, ${view.source?.stats.lakes} озёр`);
add(typeof view.dispose === 'function', 'у вида есть dispose');

const canvas = view.element.querySelector('canvas');
add(Boolean(canvas) && canvas.tabIndex === 0, 'полотно получает фокус клавиатуры');
add(view.element.querySelector('[role="status"]') !== null, 'HUD объявлен живым блоком');

const slider = view.element.querySelector('[data-role="voxel-layer"]');
add(slider?.min === '0' && slider?.max === '19', 'ползунок: 20 ярусов, 0…19', `min ${slider?.min}, max ${slider?.max}`);
const startLayer = layerOf(view.field.worldHeight, view.field.seaY);
add(Number(slider?.value) === startLayer && view.layer === startLayer, 'ползунок стартует на ярусе уровня моря', `ярус ${startLayer + 1}`);
const label = view.element.querySelector('[data-role="voxel-layer-label"]');
add(/Ярус \d+ из 20 · y \d+–\d+/.test(label?.textContent ?? ''), 'подпись яруса показывает номер и высоты', label?.textContent ?? '');

const presets = [...view.element.querySelectorAll('[data-voxel-preset]')];
add(presets.length === 8, 'восемь пресетов слоя', presets.map((b) => b.textContent).join(' · '));
const zooms = [...view.element.querySelectorAll('[data-voxel-zoom]')];
add(zooms.map((b) => b.dataset.voxelZoom).join(',') === '1,2,4', 'масштабы 1×, 2×, 4×');
const buttons = [...view.element.querySelectorAll('[data-voxel-action]')];
add(buttons.length === 1 && buttons[0].dataset.voxelAction === 'exit', 'панель: кнопка «К карте»');
add([...presets, ...zooms, ...buttons].every((b) => b.type === 'button' && (b.getAttribute('aria-label') || b.textContent.trim())),
  'у каждой кнопки доступное имя и type=button');

await wait(250);
add(view.cache.size > 0, 'очередь чанков строит видимое в кадрах', `${view.cache.size} чанков в кэше, сгенерировано ${view.cache.stats.generated}`);
const hud = view.element.querySelector('[data-role="voxel-hud"]');
add(hud?.textContent.length > 0, 'HUD показывает состояние', hud?.textContent.slice(0, 48) ?? '');

/* Ползунок: перемещение меняет ярус и подпись. */
slider.value = '10';
slider.dispatchEvent(new window.Event('input', { bubbles: true }));
add(view.layer === 10, 'ползунок переключает ярус', `ярус ${view.layer + 1}`);
add(label.textContent.startsWith('Ярус 11 из 20'), 'подпись обновилась вместе с ползунком', label.textContent);

/* Пресет: кнопка нажата, aria-pressed переставлен. */
const crowns = presets.find((b) => b.dataset.voxelPreset === 'crowns');
crowns.click();
add(view.preset === 'crowns' && crowns.getAttribute('aria-pressed') === 'true', 'пресет «Кроны» включается кнопкой');
add(presets.find((b) => b.dataset.voxelPreset === 'all').getAttribute('aria-pressed') === 'false', 'прежний пресет отжат');

/* Зум: 4× меняет масштаб и отмечает кнопку. */
zooms.find((b) => b.dataset.voxelZoom === '4').click();
add(view.zoom === 4 && zooms.find((b) => b.dataset.voxelZoom === '4').getAttribute('aria-pressed') === 'true', 'масштаб 4× включается кнопкой');

/* Панорама мышью. */
const mouse = (type, x, y) => {
  const event = new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  canvas.dispatchEvent(event);
};
const xBefore = view.x;
mouse('pointerdown', 300, 200);
mouse('pointermove', 260, 200);
mouse('pointerup', 260, 200);
await wait(30);
add(view.x !== xBefore, 'перетаскивание двигает карту', `x ${view.x.toFixed(1)} ← ${xBefore.toFixed(1)}`);

/* Стрелки панорамы. */
const key = (type, k) => {
  const event = new window.KeyboardEvent(type, { bubbles: true, key: k });
  canvas.dispatchEvent(event);
};
const xKey = view.x;
key('keydown', 'ArrowRight');
add(view.x > xKey, 'стрелка вправо сдвигает карту');

/* Подсказка под курсором: мышь над холстом пишет координаты. */
mouse('pointermove', 320, 240);
await wait(40);
add(hud.textContent.includes('X ') && hud.textContent.includes('Z '), 'подсказка показывает координаты под курсором', hud.textContent.slice(0, 60));

/* Кнопка выхода — onExit. Esc обрабатывает страница, не вид. */
view.element.querySelector('[data-voxel-action="exit"]').click();
add(exited === 1, 'кнопка «К карте» зовёт onExit — за закрытие режима отвечает вызывающий');

const orphanHost = window.document.createElement('div');
const empty = mountWorldView(orphanHost, { frame: null, config: null });
add(/Блочная карта:/.test(empty.error ?? ''), 'без документа вид честно сообщает причину', empty.error ?? '');
add(typeof empty.dispose === 'function', 'у отказавшего вида тоже есть dispose');
empty.dispose();
add(orphanHost.childElementCount === 0, 'отказ снимает разметку с хоста');

const cachedBefore = view.cache.size;
view.dispose();
await wait(60);
add(view.element.isConnected === false, 'dispose убирает вид из страницы');
add(view.cache === null && cachedBefore > 0, 'dispose освобождает кэш чанков', `${cachedBefore} чанков до закрытия`);
add(view.running === false, 'после dispose кадры не идут');

add(consoleErrors.length === 0, 'страница не сообщила об ошибках', consoleErrors.slice(0, 2).join(' | '));

console.log('Блочная карта: DOM, ввод, жизненный цикл\n');
let bad = 0;
for (const check of checks) {
  console.log(`${check.ok ? '  ✓' : '  ×'} ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);
  if (!check.ok) bad += 1;
}
console.log('');
if (bad) {
  console.log(`БЛОЧНАЯ КАРТА ЛОМАЕТСЯ: не прошло ${plural(bad, 'проверка', 'проверки', 'проверок')} — ${bad} из ${checks.length}.`);
  window.close();
  process.exit(1);
}
console.log(`ВСЁ ХОРОШО — ${checks.length} ${plural(checks.length, 'проверка', 'проверки', 'проверок')} блочной карты.`);
window.close();
