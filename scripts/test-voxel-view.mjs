/* Карта блоками в настоящем DOM: запуск `npm run test:voxel-view`.

Что проверяется и почему именно это: src/world/layers.js покрыт test:voxel,

картинку посмотрит человек, а между ними — mountWorldView(): разметка панели

ярусов, ползунок, пресеты, переключатели наложений, мышь и клавиатура, очередь

чанков в кадре, снятие вида. В jsdom нет холста 2D: полотно нельзя

перекрасить, но состояние вида — ярус, масштаб, центр, наложения — обязано

жить и обновляться без него. Ошибку «нет контекста» проверка считает

ожидаемым шумом.

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

const { LAYER_PRESETS, ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN } = await import('../src/world/layers.js');

/* Русское согласование числительного: «31 проверка», а не «31 проверок». */

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

/* Шаг опроса в мире (world-view.js) — четверть секунды; ждём вдвое больше,
   прежде чем утверждать, что таймер остановлен. */

const WAIT_PROBE = 600;

/* Холст в jsdom отсутствует по определению: считаем это ожидаемым шумом. */

const isCanvasNoise = (text) => /HTMLCanvasElement|getContext|Not implemented/i.test(text);

const page = `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head>

<body><div class="world-editor" data-role="world-editor-host">

<iframe class="world-editor-frame" data-role="world-editor"></iframe>

</div></body></html>`;

const consoleErrors = [];

const virtualConsole = new VirtualConsole();

virtualConsole.on('jsdomError', (error) => {
  if (!isCanvasNoise(error?.message)) consoleErrors.push(`jsdomError: ${error?.message}`);
});

virtualConsole.on('error', (message) => {
  if (!isCanvasNoise(String(message))) consoleErrors.push(`console.error: ${message}`);
});

const dom = new JSDOM(page, { pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole });

const { window } = dom;

/* Модули игры читают глобальный document — даём им окно jsdom тем же способом,

каким это делает test:ui, и только потом поднимаем сам вид. */

const VIEW_GLOBALS = [
  'window',
  'document',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'MutationObserver',
];

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

const { mountWorldView } = await import('../src/game/world-view.js');

const host = window.document.querySelector('[data-role="world-editor-host"]');

let exited = 0;

/* Кадр редактора: настоящий iframe в тестах заменён парой «окно + документ».

   Вид запоминает сам объект кадра — по нему экран карты понимает, что iframe

   пересоздали (новый seed, другой размер) и мир надо строить заново. */

const frame = { contentWindow: fakeEditorWindow() };

const view = mountWorldView(host, {
  frame,

  config: { seed: 'вид', width: FAKE_MAP.size, height: FAKE_MAP.size },

  onExit: () => {
    exited += 1;
  },
});

const canvas = view.element.querySelector('canvas');

const slider = view.element.querySelector('[data-role="voxel-level"]');

const hud = view.element.querySelector('[data-role="voxel-hud"]');

const levelValue = view.element.querySelector('[data-role="voxel-level-value"]');

const zoomValue = view.element.querySelector('[data-role="voxel-zoom-value"]');

const presets = [...view.element.querySelectorAll('[data-layer]')];

const overlays = [...view.element.querySelectorAll('[data-overlay]')];

const buttons = [...view.element.querySelectorAll('[data-voxel-action]')];

const action = (name) => view.element.querySelector(`[data-voxel-action="${name}"]`);

const key = (code, options = {}) => {
  const event = new window.KeyboardEvent('keydown', { bubbles: true, ...options });

  Object.defineProperty(event, 'code', { value: code });

  window.dispatchEvent(event);
};

add(view.element?.dataset.role === 'world-voxel', 'вид смонтирован в хост редактора');

add(!view.error, 'снимок карт прочитан без ошибки', view.error ?? '');

add(
  view.field?.width === FAKE_MAP.size * view.field?.scale && view.field?.height === FAKE_MAP.size * view.field?.scale,

  'поле = карта из окна редактора × масштаб',
  `${view.field?.width}×${view.field?.height}`,
);

add(
  view.source?.stats.rivers === 1 && view.source?.stats.lakes === 1,

  'реки и озёра дошли до вида',
  `${view.source?.stats.rivers} рек, ${view.source?.stats.lakes} озёр`,
);

add(typeof view.dispose === 'function', 'у вида есть dispose');

add(
  buttons.length === 6 && presets.length === LAYER_PRESETS.length && overlays.length === 4,

  'панель: шесть кнопок, пресеты и четыре наложения',

  `${buttons.length} (${buttons.map((b) => b.dataset.voxelAction).join(', ')}), ${presets.length} пресетов, ${overlays.length} наложений`,
);

add(
  [...buttons, ...presets, ...overlays].every((node) => node.type === 'button'),

  'каждый контрол — button, а не submit',
);

add(
  buttons.every((node) => node.getAttribute('aria-label')),
  'у кнопок шага есть доступное имя',
);

add(hud !== null && hud.getAttribute('role') === 'status', 'HUD объявлен живым блоком');

add(canvas?.tabIndex === 0, 'полотно получает фокус клавиатуры');

/* Полотно живёт в разрешении блоков: 1 px = 1 блок, растягивает его CSS. */

add(
  canvas.width === view.cells.x && canvas.height === view.cells.z && view.cells.x > 0,

  'полотно = размер кадра в блоках',
  `${canvas.width}×${canvas.height} при блоке ${view.zoom} px`,
);

add(
  slider.min === '1' && slider.step === '1' && Number(slider.max) === view.field.worldHeight - 1,

  'ползунок ходит по ярусам мира',
  `1…${slider.max}`,
);

add(
  view.level === view.field.worldHeight - 1 && Number(slider.value) === view.level,

  'при открытии срез не задел рельеф',
  `ярус ${view.level}, потолок ${view.field.worldHeight}`,
);

add(
  view.preset === 'surface' && view.element.querySelector('[data-layer="surface"]').classList.contains('is-on'),

  'пресет «Поверхность» подсвечен при открытии',
);

add(view.zoom === ZOOM_DEFAULT, 'масштаб по умолчанию — три пикселя на блок', `${view.zoom} px/блок`);

add(
  view.overlays.arrows && view.overlays.coast && view.overlays.labels && view.overlays.shade,

  'наложения включены сразу',
  overlays.map((node) => `${node.dataset.overlay}=${node.getAttribute('aria-pressed')}`).join(' '),
);

add(
  view.world?.stats().queued > 0 && view.world?.stats().ready === 0,

  'мир поставил чанки в очередь, не строя их заранее',
  `${view.world?.stats().queued} в очереди`,
);

const expectedRadius = Math.min(Math.max(Math.floor(Math.min(view.field.width, view.field.height) / 32), 2), 7);

add(view.world?.radius === expectedRadius, 'радиус обзора растёт с картой, не больше 7 чанков', `радиус ${view.world?.radius} чанка`);

add(
  view.sliceInfo === null,
  'без 2D-канваса вид не красит кадр и не падает',

  `контекст: ${canvas.getContext('2d')}`,
);

await wait(200);

const lived = view.world.stats();

add(
  lived.ready > 0 && lived.bytes > 0,
  'очередь двигается в кадрах',

  `${lived.ready} готово, ${(lived.bytes / 1024).toFixed(0)} КиБ блоков, ${lived.queued} в очереди`,
);

add(hud?.textContent.includes('чанков'), 'HUD показывает состояние мира', hud?.textContent.slice(0, 56) ?? '');

action('level-down').click();

add(
  view.level === view.field.worldHeight - 2 && Number(slider.value) === view.level,

  'кнопка «−» опускает ярус на блок и двигает ползунок',
  `ярус ${view.level}`,
);

add(
  view.preset === null && !view.element.querySelector('[data-layer="surface"]').classList.contains('is-on'),

  'ручной сдвиг яруса снимает подсветку пресета',
);

slider.value = '100';

slider.dispatchEvent(new window.Event('input', { bubbles: true }));

action('level-up').dispatchEvent(new window.MouseEvent('click', { bubbles: true, shiftKey: true }));

add(view.level === 110, 'Shift на кнопке шага даёт десять блоков', `ярус ${view.level}`);

action('level-down').dispatchEvent(new window.MouseEvent('click', { bubbles: true, shiftKey: true }));

add(view.level === 100, 'и вниз на десять', `ярус ${view.level}`);

slider.value = String(view.field.seaY);

slider.dispatchEvent(new window.Event('input', { bubbles: true }));

add(view.level === view.field.seaY && view.preset === null, 'ползунок задаёт ярус напрямую', `ярус ${view.level}`);

key('PageDown');

add(view.level === view.field.seaY - 1, 'PageDown опускает ярус', `ярус ${view.level}`);

key('PageUp', { shiftKey: true });

add(view.level === view.field.seaY + 9, 'PageUp с Shift поднимает на десять', `ярус ${view.level}`);

for (let n = 0; n < 40; n += 1) key('PageUp', { shiftKey: true });

add(view.level === view.field.worldHeight - 1, 'ярус не вылезаёт за потолок мира', `ярус ${view.level}`);

for (let n = 0; n < 40; n += 1) key('PageDown', { shiftKey: true });

add(view.level === 1, 'и за пол мира снизу', `ярус ${view.level}`);

const seaPreset = view.element.querySelector('[data-layer="sea"]');

seaPreset.click();

add(view.level === view.field.seaY && view.preset === 'sea', 'пресет «Вода» ставит уровень моря', `ярус ${view.level}`);

add(
  seaPreset.getAttribute('aria-pressed') === 'true' && levelValue.textContent.includes('Вода'),

  'подпись под ползунком называет пресет и зону',
  levelValue.textContent.slice(0, 72),
);

const canopy = view.element.querySelector('[data-layer="canopy"]');

canopy.click();

add(
  view.level > view.field.seaY && view.level < view.field.worldHeight - 1,

  'пресет «Кроны» режет верхушки',
  `ярус ${view.level} между морем ${view.field.seaY} и потолком ${view.field.worldHeight - 1}`,
);

action('zoom-in').click();

add(
  view.zoom === ZOOM_DEFAULT + 1 && zoomValue.textContent.startsWith(String(view.zoom)),

  'кнопка «+» укрупняет блок',
  `${view.zoom} px · ${zoomValue.textContent}`,
);

for (let n = 0; n < 12; n += 1) action('zoom-in').click();

add(view.zoom === ZOOM_MAX, 'масштаб зажат сверху', `${view.zoom} px/блок`);

const cellsAtMax = { ...view.cells };

for (let n = 0; n < 12; n += 1) action('zoom-out').click();

add(view.zoom === ZOOM_MIN, 'масштаб зажат снизу', `${view.zoom} px/блок`);

add(
  view.cells.x > cellsAtMax.x,
  'при укрупнении блока кадр в блоках уменьшается',

  `${cellsAtMax.x} → ${view.cells.x} колонок`,
);

const centerBefore = [...view.center];

const mouse = (type, x, y) => {
  const event = new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });

  Object.defineProperty(event, 'pointerId', { value: 1 });

  canvas.dispatchEvent(event);
};

mouse('pointerdown', 100, 100);

mouse('pointermove', 190, 140);

mouse('pointerup', 190, 140);

add(
  view.center[0] < centerBefore[0] && view.center[1] < centerBefore[1],

  'перетаскивание двигает карту за курсором',

  `X ${centerBefore[0].toFixed(1)} → ${view.center[0].toFixed(1)}, Z ${centerBefore[1].toFixed(1)} → ${view.center[1].toFixed(1)}`,
);

add(
  Math.abs(view.center[0] - (centerBefore[0] - 90 / view.zoom)) < 0.51 &&
    Math.abs(view.center[1] - (centerBefore[1] - 40 / view.zoom)) < 0.51,

  'сдвиг считается в блоках: экранные пиксели делятся на масштаб',

  `ΔX ${(view.center[0] - centerBefore[0]).toFixed(2)} при 90 px`,
);

const wheel = new window.Event('wheel', { bubbles: true });

Object.defineProperty(wheel, 'deltaY', { value: -100 });

Object.defineProperty(wheel, 'clientX', { value: 40 });

Object.defineProperty(wheel, 'clientY', { value: 40 });

const zoomBeforeWheel = view.zoom;

canvas.dispatchEvent(wheel);

add(
  view.zoom !== zoomBeforeWheel || view.zoom === ZOOM_MIN,
  'колесо меняет масштаб',
  `${zoomBeforeWheel} → ${view.zoom}`,
);

key('ArrowRight');

const panned = view.center[0];

add(
  Math.abs(panned - (view.makeView().x0 + view.cells.x / 2)) < 1.5,

  'кадр центрируется там, куда смотрит вид',
  `x0 ${view.makeView().x0} при центре ${view.center[0].toFixed(1)}`,
);

key('ArrowLeft', { shiftKey: true });

add(
  Math.abs(view.center[0] - (panned - 96)) < 0.51,
  'Shift+стрелка — широкий шаг по карте',

  `${panned.toFixed(1)} → ${view.center[0].toFixed(1)}`,
);

overlays[0].click();

add(
  view.overlays[Object.keys(view.overlays)[0]] === false || view.overlays.arrows === false,

  'клик по наложению выключает его',
  overlays[0].dataset.overlay,
);

add(
  overlays[0].getAttribute('aria-pressed') === 'false' && !overlays[0].classList.contains('is-on'),

  'выключенное наложение помечено в разметке',
);

overlays[0].click();

add(view.overlays.arrows === true, 'второй клик включает наложение обратно');

view.element.querySelector('[data-voxel-action="reset"]').click();

await wait(60);

add(
  Math.abs(view.center[0] - view.spawn.x) < 1 && Math.abs(view.center[1] - view.spawn.z) < 1,

  '«Появление» возвращает центр к точке появления',
  `X ${view.center[0].toFixed(1)} при спавне ${view.spawn.x}`,
);

add(
  view.level === view.field.worldHeight - 1 && view.zoom === ZOOM_DEFAULT && view.preset === 'surface',

  'сброс возвращает и ярус, и масштаб',
  `ярус ${view.level}, блок ${view.zoom}`,
);

key('KeyR');

add(view.center[0] === view.spawn.x, 'R работает с клавиатуры');

view.element.querySelector('[data-voxel-action="exit"]').click();

add(exited === 1, 'кнопка «К карте» зовёт onExit — за закрытие режима отвечает вызывающий');

/* ---------- ожидание генератора ----------

   Карта блоков берётся из живого документа Azgaar, а тот считает мир
   секундами. Проверяется то, что было сломано: если открыть карту раньше,
   чем генератор договорил, вид должен дождаться и появиться сам, а не
   остаться пустой сценой до второго нажатия кнопки. */

const slowHost = window.document.createElement('div');

window.document.body.append(slowHost);

const slowWindow = fakeEditorWindow();

const slowFrame = { contentWindow: slowWindow };

/* Окно редактора, у которого карты появляются не сразу: без высот сетки
   мост честно отказывается строить мир. */

const notReadyWindow = { options: slowWindow.options };

slowFrame.contentWindow = notReadyWindow;

const waiting = mountWorldView(slowHost, {

  frame: slowFrame,

  config: { seed: 'ожидание', width: FAKE_MAP.size, height: FAKE_MAP.size },

});

add(waiting.waiting === true, 'неготовый генератор — это ожидание, а не отказ', waiting.error ?? '');

add(waiting.error === '', 'в ожидании ошибки нет: человеку показывают, чего ждут', waiting.error ?? '');

add(/Считаю карту генератора/.test(waiting.element.textContent ?? ''), 'на сцене сказано, что идёт счёт',

  (waiting.element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60));

/* Генератор договорил: высоты, упаковка и связь pack → grid появились. */

Object.assign(notReadyWindow, slowWindow);

/* Настоящий iframe в браузере остаётся тем же объектом: у него появляется
   содержимое, а не новый кадр. Здесь так же — окно наполняется. */

await wait(600);

add(waiting.waiting === false, 'вид дождался генератора сам, без второго нажатия');

add(waiting.element?.dataset.role === 'world-voxel' && waiting.element.querySelector('canvas') !== null,

  'на месте ожидания появилась настоящая сцена');

add(waiting.element.isConnected && slowHost.childElementCount === 1, 'сцена одна: ожидание убрало свою разметку');

add(Boolean(waiting.error) === false, 'построенный мир ошибок не оставил', waiting.error ?? '');

add(waiting.element.querySelector('[data-voxel-action="exit"]') !== null, 'из построенной сцены есть выход к карте');

/* Построенный вид помнит кадр, из которого взят снимок: по нему экран карты

   понимает, что iframe пересоздали (новый seed, другой размер) и мир надо

   строить заново, а не показывать прежний. */

add(waiting.frame === slowFrame && view.frame === frame, 'вид помнит свой кадр редактора',

  `${waiting.frame === slowFrame ? 'ожидание' : '—'} / ${view.frame === frame ? 'сцена' : '—'}`);

waiting.dispose();

add(slowHost.childElementCount === 0, 'dispose снимает построенную сцену с хоста');

/* Отказ до генератора: если карту так и не построили, ручка обязана звать
   dispose у того, что успела создать, и не оставлять таймеров. */

const goneHost = window.document.createElement('div');

window.document.body.append(goneHost);

const gone = mountWorldView(goneHost, { frame: slowFrame, config: null });

gone.dispose();

await wait(WAIT_PROBE);

add(goneHost.childElementCount === 0, 'ожидание снимается до появления карты');

const orphanHost = window.document.createElement('div');

const empty = mountWorldView(orphanHost, { frame: null, config: null });

/* Кадра нет вовсе — это не ожидание: ждать нечего, и вид говорит причину

   сразу, как и раньше. */

add(/Карта блоками:/.test(empty.error ?? ''), 'без документа вид честно сообщает причину', empty.error ?? '');

add(typeof empty.dispose === 'function', 'у отказавшего вида тоже есть dispose');

empty.dispose();

add(orphanHost.childElementCount === 0, 'отказ снимает разметку с хоста');

const chunksAlive = view.world.stats().chunks;

view.dispose();

await wait(60);

add(view.element.isConnected === false, 'dispose убирает полотно из страницы');

add(view.world.stats().chunks === 0, 'dispose закрывает хранилище чанков', `${chunksAlive} → 0`);

add(view.running === false, 'после dispose кадры не идут');

add(consoleErrors.length === 0, 'страница не сообщила об ошибках', consoleErrors.slice(0, 2).join(' | '));

const ZOOM_RANGE = ZOOM_MIN < ZOOM_DEFAULT && ZOOM_DEFAULT < ZOOM_MAX;

add(ZOOM_RANGE, 'шкала масштаба согласована с видом', `${ZOOM_MIN}…${ZOOM_MAX}, по умолчанию ${ZOOM_DEFAULT}`);

console.log('Карта блоками: DOM, ярусы, ввод, жизненный цикл\n');

let bad = 0;

for (const check of checks) {
  console.log(`${check.ok ? ' ✓' : ' ×'} ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);

  if (!check.ok) bad += 1;
}

console.log('');

if (bad) {
  console.log(
    `КАРТА БЛОКАМИ ЛОМАЕТСЯ: не прошло ${plural(bad, 'проверка', 'проверки', 'проверок')} — ${bad} из ${checks.length}.`,
  );

  window.close();

  process.exit(1);
}

console.log(
  `ВСЁ ХОРОШО — ${checks.length} ${plural(checks.length, 'проверка', 'проверки', 'проверок')} вида карты блоками.`,
);

window.close();
