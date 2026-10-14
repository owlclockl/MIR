/* Основной процедурный вид в настоящем DOM: `npm run test:world-map`.
   Проверяем слой карты, панели, масштаб, панораму, материки, работу без
   интерфейса «блок-срез» и освобождение ресурсов. Сам генератор покрывает
   `test:gen`; здесь важен контракт компонента и его жизненный цикл.
   jsdom не рисует холст, поэтому подменяем только его 2D API и проверяем,
   что кадры действительно доходят до изображения.
   jsdom ставится разово: npm i --no-save jsdom (нужен и test:ui). */

import './lib/root.mjs';

let JSDOM;
let VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = await import('jsdom'));
} catch {
  console.error('Нет jsdom. Поставьте его разово: npm i --no-save jsdom');
  process.exit(1);
}

const SMALL = { width: 8_192_000, height: 5_120_000 };
const checks = [];
const add = (ok, what, detail = '') => checks.push({ ok: Boolean(ok), what, detail });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const page = `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head>
<body><div class="world-editor" data-role="world-editor-host"></div></body></html>`;

const consoleErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => consoleErrors.push(`jsdomError: ${error?.message}`));
virtualConsole.on('error', (message) => consoleErrors.push(`console.error: ${message}`));
const dom = new JSDOM(page, { pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole });
const { window } = dom;

/* Достаточный 2D-холст для карты: пиксельные данные и вызовы отрисовки. */
let imageWrites = 0;
const context = {
  createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
  putImageData() { imageWrites += 1; },
  clearRect() {}, drawImage() {}, fillRect() {}, fillText() {},
  beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, arc() {},
  stroke() {}, fill() {},
};
window.HTMLCanvasElement.prototype.getContext = function () {
  return this.__context ??= { ...context };
};

const VIEW_GLOBALS = [
  'window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent',
  'KeyboardEvent', 'WheelEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver',
];
for (const name of VIEW_GLOBALS) {
  if (window[name] === undefined) continue;
  try {
    Object.defineProperty(globalThis, name, { value: window[name], configurable: true, writable: true });
  } catch {
    void name;
  }
}

const { mountWorldMapView, LAYERS } = await import('../src/game/world-map-view.js');
const host = window.document.querySelector('[data-role="world-editor-host"]');
const view = mountWorldMapView(host, { config: { seed: 'витрина', ...SMALL } });
const root = view.element;
const canvas = root.querySelector('[data-role="world-map-canvas"]');
const hud = root.querySelector('[data-role="world-map-hud"]');
const note = root.querySelector('[data-role="world-map-note"]');
const waitBox = root.querySelector('[data-role="world-map-wait"]');
const layers = [...root.querySelectorAll('[data-layer]')];
const action = (name) => root.querySelector(`[data-map-action="${name}"]`);
const click = (element) => element?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const key = (value, options = {}) => {
  const event = new window.KeyboardEvent('keydown', { bubbles: true, ...options });
  Object.defineProperty(event, 'key', { value });
  canvas.dispatchEvent(event);
};

add(Boolean(root) && root.classList.contains('world-map-view'), 'основной вид смонтирован', root?.className ?? '');
add(root.dataset.role === 'world-map-view', 'корневой элемент помечен для интеграции', root.dataset.role);
add(Boolean(canvas), 'полотно поверхности на месте');
add(root.querySelectorAll('[data-map-action]').length === 4, 'на панели четыре действия: появление, весь мир и масштаб', String(root.querySelectorAll('[data-map-action]').length));
add(layers.length === LAYERS.length && LAYERS.length === 6, 'все шесть слоёв перечислены кнопками', `${layers.length} / ${LAYERS.length}`);
add(LAYERS.map(({ id }) => id).join(',') === 'biome,relief,continents,climate,rain,villages', 'список слоёв описывает основную карту');
add(!layers.some((chip) => chip.dataset.layer === 'blocks'), 'в списке слоёв нет слоя блоков');
add(root.querySelectorAll('[data-tier], [data-map-action*="tier"], [data-role*="level"]').length === 0, 'в основной карте нет управления ярусом или срезом');
add(root.querySelectorAll('[data-continent]').length === 0, 'материки появляются после расчёта решётки');
add(!!root.querySelector('[data-role="world-map-zoom-value"]'), 'масштаб отображается в метрах на пиксель');
add(typeof view.error === 'string' && view.error === '', 'контекст холста доступен в тесте', view.error || '2D-канвас включён');
add(consoleErrors.length === 0, 'вид не пишет ошибок в консоль', consoleErrors.join(' | '));

const deadline = Date.now() + 20_000;
while (!view.world.ready && Date.now() < deadline) await wait(50);
add(view.world.ready, 'генератор доведён до готовности', `ступень ${view.world.stage}`);
await wait(300);
add(waitBox.hidden === true && view.waiting === false, 'плашка ожидания убрана после готовности');
add(/[А-ЯЁ]/.test(hud.textContent) && hud.textContent.includes('высота') && hud.textContent.includes('м'), 'HUD показывает русскую географию и высоту в метрах', hud.textContent.slice(0, 100));
add(!hud.textContent.includes('ярус'), 'высота не отображается игровым ярусом');
add(view.world.summary().includes('материки'), 'сводка мира называет материки', view.world.summary());
add(root.querySelectorAll('[data-continent]').length > 0, 'кнопки материков появились после решётки', `${root.querySelectorAll('[data-continent]').length} шт.`);
add(imageWrites > 0, 'кадры карты записываются в холст', `${imageWrites} обновлений`);

/* Слои сохраняют один мир, меняется только карта и её легенда. */
const reliefChip = layers.find((chip) => chip.dataset.layer === 'relief');
click(reliefChip);
add(view.layer === 'relief' && reliefChip.classList.contains('is-on') && reliefChip.getAttribute('aria-pressed') === 'true', 'слой рельефа выбирается доступно', view.layer);
const continentsChip = layers.find((chip) => chip.dataset.layer === 'continents');
click(continentsChip);
add(view.layer === 'continents' && root.querySelector('[data-role="world-map-legend"]').textContent.includes('цвет'), 'легенда объясняет цвета материков');

/* Выбор материка центрирует и масштабирует вид на этот объект. */
const firstContinent = view.world.grid.continents[0];
const continentChip = root.querySelector('[data-continent]');
click(continentChip);
add(view.center[0] === firstContinent.centerX && view.center[1] === firstContinent.centerZ, 'кнопка материка центрирует карту', `${Math.round(view.center[0])}, ${Math.round(view.center[1])}`);
add(note.hidden === false && note.textContent.includes(firstContinent.name), 'выбранный материк подписан');

/* Zoom buttons, keys and wheel share the same bounded scale. */
const level = view.level;
click(action('zoom-in'));
add(view.level === Math.min(level + 1, view.world.planet.maxLevel), 'кнопка плюса приближает карту', `${level} → ${view.level}`);
click(action('zoom-out'));
add(view.level === level, 'кнопка минуса возвращает масштаб', String(view.level));
key('+');
add(view.level === level + 1, 'клавиша плюс приближает', `${level} → ${view.level}`);
key('-');
add(view.level === level, 'клавиша минус отдаляет', String(view.level));
const wheel = new window.Event('wheel', { bubbles: true, cancelable: true });
Object.defineProperty(wheel, 'deltaY', { value: 120 });
canvas.dispatchEvent(wheel);
add(view.level === Math.max(0, level - 1), 'колесо меняет масштаб без выхода за пределы', String(view.level));

/* Появление, полный обзор и панорама остаются доступны с клавиатуры. */
click(action('spawn'));
const spawn = view.world.spawn();
add(Math.abs(view.center[0] - spawn.x) < 1 && Math.abs(view.center[1] - spawn.z) < 1, 'кнопка «Появление» ведёт к точке появления');
click(action('earth'));
add(view.center[0] === view.world.planet.width / 2 && view.center[1] === view.world.planet.height / 2, '«Весь мир» центрирует полный обзор');
add(note.textContent.includes('Весь мир') && note.textContent.includes('км'), 'полный обзор подписан реальным размером');
const beforePan = [...view.center];
key('ArrowLeft');
add(view.center[0] < beforePan[0], 'стрелка сдвигает карту');
for (let i = 0; i < 100; i += 1) key('ArrowLeft');
add(view.center[0] >= 0 && view.center[0] < view.world.planet.width, 'панорама не уходит за край мира', String(Math.round(view.center[0])));

/* Снятие вида останавливает кадры и чистит DOM. */
view.dispose();
add(!host.querySelector('[data-role="world-map-view"]'), 'dispose удаляет основную карту с хоста');
const previousLayer = view.layer;
click(reliefChip);
add(view.layer === previousLayer, 'снятый вид больше не слушает кнопки');
add(consoleErrors.length === 0, 'после действий ошибок в консоли нет', consoleErrors.join(' | '));
window.close();

for (const check of checks) {
  console.log(`${check.ok ? '  ✓' : '  ×'} ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);
}
const failed = checks.filter(({ ok }) => !ok);
console.log(`\n${failed.length ? 'ПЛОХО' : 'ВСЁ ХОРОШО'} · ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
