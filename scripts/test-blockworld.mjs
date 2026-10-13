/* Блочный мир в настоящем DOM: запуск `npm run test:blockworld`.
   Что проверяется и почему именно это: сам генератор покрыт `test:gen`,
   картинку смотрит человек, а между ними — mountBlockWorldView(): разметка
   панелей, слои и ярусы, ползунок и пресеты, мышь и клавиатура, ступени
   готовности мира и снятие вида. В jsdom нет холста 2D: полотно нельзя
   перекрасить, но состояние вида — слой, ярус, масштаб, центр, подписи —
   обязано жить и обновляться без него. Ошибку «нет контекста» проверка
   считает ожидаемым шумом, а вид — обязан пережить её молча.
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

/* Мир для проверки — малый: тот же генератор, но решётка считается мгновенно,
   а ступени проходятся за кадры, а не за секунды. */
const SMALL = { width: 8_192_000, height: 5_120_000 };

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

/* Холст в jsdom отсутствует по определению: это ожидаемый шум, а не ошибка. */
const isCanvasNoise = (text) => /HTMLCanvasElement|getContext|Not implemented/i.test(text);
const page = `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head>
<body><div class="world-editor" data-role="world-editor-host"></div></body></html>`;

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

const { mountBlockWorldView, LAYERS, TIER_PRESETS } = await import('../src/game/mc-world-view.js');
const host = window.document.querySelector('[data-role="world-editor-host"]');

let exits = 0;
const view = mountBlockWorldView(host, {
  mode: 'map',
  config: { seed: 'витрина', ...SMALL },
  onExit: () => {
    exits += 1;
  },
});

const root = view.element;
const canvas = root.querySelector('[data-role="voxel-canvas"]');
const hud = root.querySelector('[data-role="voxel-hud"]');
const note = root.querySelector('[data-role="voxel-note"]');
const slider = root.querySelector('[data-role="voxel-level"]');
const levelValue = root.querySelector('[data-role="voxel-level-value"]');
const zoomValue = root.querySelector('[data-role="voxel-zoom-value"]');
const tierRow = root.querySelector('[data-role="voxel-tier-row"]');
const legend = root.querySelector('[data-role="voxel-legend"]');
const waitBox = root.querySelector('[data-role="voxel-wait"]');
const layers = [...root.querySelectorAll('[data-layer]')];
const presets = [...root.querySelectorAll('[data-tier]')];
const action = (name) => root.querySelector(`[data-voxel-action="${name}"]`);
const click = (element) => element?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const key = (value, options = {}) => {
  const event = new window.KeyboardEvent('keydown', { bubbles: true, ...options });
  Object.defineProperty(event, 'key', { value });
  canvas.dispatchEvent(event);
};

add(Boolean(root) && root.classList.contains('world-voxel'), 'вид встал на хост', root?.className ?? '');
add(root.dataset.mode === 'map', 'режим карты помечен в разметке', root.dataset.mode);
add(Boolean(canvas), 'полотно на месте');
add(root.querySelectorAll('.world-voxel-toolbar [data-voxel-action]').length === 3, 'в панели три кнопки: появление, весь мир, к карте',
  String(root.querySelectorAll('.world-voxel-toolbar [data-voxel-action]').length));
add(root.querySelectorAll('.world-voxel-layers [data-voxel-action]').length === 4, 'у яруса и масштаба свои шаги',
  String(root.querySelectorAll('.world-voxel-layers [data-voxel-action]').length));
add(layers.length === LAYERS.length, 'все слои перечислены кнопками', `${layers.length} из ${LAYERS.length}`);
add(presets.length === TIER_PRESETS.length, 'все пресеты ярусов перечислены', `${presets.length} из ${TIER_PRESETS.length}`);
add(tierRow.hidden === true, 'ярус скрыт на слое биомов — он нужен только срезу');
add(legend.textContent.trim().length > 0, 'легенда объясняет цвета', legend.textContent.trim().slice(0, 40) + '…');
add(typeof view.error === 'string', 'вид говорит о холсте: либо пусто, либо причина', view.error || 'холст есть');
add(consoleErrors.length === 0, 'вид не пишет ошибок в консоль', consoleErrors.join(' | '));

/* Ступени мира проходятся по кадрам: ждём готовности и только потом судим. */
const deadline = Date.now() + 20_000;
while (!view.world.ready && Date.now() < deadline) await wait(50);
add(view.world.ready, 'мир доведён до готовности', `ступень ${view.world.stage}`);
add(waitBox.hidden === true, 'плашка ожидания убрана после готовности');
add(hud.textContent.length > 20, 'строка состояния рассказывает о точке', hud.textContent.slice(0, 80) + '…');
add(/[А-ЯЁ]/.test(hud.textContent), 'строка состояния по-русски');
add(view.world.summary().includes('материки'), 'сводка мира называет материки', view.world.summary());

const continentChips = [...root.querySelectorAll('[data-continent]')];
add(continentChips.length > 0, 'кнопки материков появились после решётки', `${continentChips.length} шт.`);

/* Слои: переключение меняет вопрос к миру, но не сам мир. */
const reliefChip = layers.find((chip) => chip.dataset.layer === 'relief');
click(reliefChip);
add(view.layer === 'relief', 'слой переключился на рельеф', view.layer);
add(reliefChip.classList.contains('is-on'), 'выбранный слой помечен');
const blocksChip = layers.find((chip) => chip.dataset.layer === 'blocks');
click(blocksChip);
add(view.layer === 'blocks', 'слой переключился на блоки', view.layer);
add(tierRow.hidden === false, 'на срезе ярус показан');
add(legend.textContent.includes('вода'), 'легенда среза называет блоки', legend.textContent.slice(0, 60) + '…');
click(layers.find((chip) => chip.dataset.layer === 'biome'));
add(view.layer === 'biome', 'слой вернулся к биомам', view.layer);

/* Пресеты ярусов: каждый ставит свой ярус, и это видно в разметке. */
click(presets.find((chip) => chip.dataset.tier === 'ores'));
add(view.tier === 12 && view.tierPreset === 'ores', 'пресет руд ставит 12-й ярус', String(view.tier));
click(presets.find((chip) => chip.dataset.tier === 'bedrock'));
add(view.tier === 2, 'пресет основания ставит 2-й ярус', String(view.tier));
click(presets.find((chip) => chip.dataset.tier === 'sea'));
add(view.tier === 63, 'пресет моря ставит 63-й ярус', String(view.tier));

/* Ползунок: ручной ярус отменяет пресет — так и должно быть. */
slider.value = '40';
slider.dispatchEvent(new window.Event('input', { bubbles: true }));
add(view.tier === 40 && view.tierPreset === 'custom', 'ползунок ставит свой ярус', `${view.tier} / ${view.tierPreset}`);
add(levelValue.textContent.includes('40'), 'подпись яруса обновилась', levelValue.textContent);

/* Масштаб и панорама: клавиши и колесо, с прижимом к краю мира. */
const level0 = view.level;
key('+');
add(view.level === level0 + 1, 'клавиша «плюс» приближает', `${level0} → ${view.level}`);
key('-');
add(view.level === level0, 'клавиша «минус» отдаляет', String(view.level));
for (let i = 0; i < 40; i += 1) key('+');
add(view.level === view.world.planet.maxLevel, 'ближе блока не приблизиться', `уровень ${view.level} из ${view.world.planet.maxLevel}`);
const centerBefore = [...view.center];
key('ArrowLeft');
add(view.center[0] < centerBefore[0], 'стрелка сдвигает карту', `${Math.round(centerBefore[0])} → ${Math.round(view.center[0])}`);
for (let i = 0; i < 80; i += 1) key('ArrowLeft');
add(view.center[0] >= 0, 'за край мира камера не уходит', String(Math.round(view.center[0])));
const wheel = new window.Event('wheel', { bubbles: true, cancelable: true });
Object.defineProperty(wheel, 'deltaY', { value: 120 });
canvas.dispatchEvent(wheel);
add(view.level === view.world.planet.maxLevel - 1, 'колесо мыши меняет масштаб', String(view.level));
add(zoomValue.textContent.length > 0, 'подпись масштаба заполнена', zoomValue.textContent);

/* Кнопки: появление, весь мир, выход. */
click(action('spawn'));
const spawn = view.world.spawn();
add(Math.abs(view.center[0] - spawn.x) < 1 && Math.abs(view.center[1] - spawn.z) < 1, '«Появление» ведёт к точке появления',
  `${Math.round(view.center[0])}, ${Math.round(view.center[1])}`);
add(note.hidden === false && note.textContent.includes('Точка появления'), 'вид сказал, где точка появления', note.textContent.slice(0, 60));
click(action('earth'));
add(view.center[0] === view.world.planet.width / 2, '«Весь мир» ставит центр карты в середину', String(Math.round(view.center[0])));
add(view.level <= 6, '«Весь мир» отдаляет камеру', String(view.level));
add(note.textContent.includes('км'), 'вид сказал размеры мира', note.textContent.slice(0, 70));
click(action('exit'));
add(exits === 1, 'кнопка выхода зовёт обработчик', String(exits));

/* Срез мира — второй режим того же вида. */
const heavy = mountBlockWorldView(host, { mode: 'blocks', config: { seed: 'витрина', ...SMALL } });
add(heavy.mode === 'blocks', 'режим среза помечен', heavy.mode);
add(heavy.layer === 'blocks', 'срез открывается слоем блоков', heavy.layer);
add(heavy.element.querySelector('[data-role="voxel-tier-row"]').hidden === false, 'на срезе ярус показан сразу');
add(heavy.world.planet.maxLevel === view.world.planet.maxLevel, 'оба режима — один и тот же мир',
  `${heavy.world.planet.maxLevel} уровней`);

/* Детерминизм вида: тот же seed — тот же мир. */
const second = mountBlockWorldView(host, { mode: 'map', config: { seed: 'витрина', ...SMALL } });
const seedDeadline = Date.now() + 20_000;
while (!second.world.ready && Date.now() < seedDeadline) await wait(50);
const sameSeed = second.world.ready && second.world.summary() === view.world.summary()
  && second.world.planet.width === view.world.planet.width;
add(sameSeed, 'тот же seed — тот же мир', second.world.summary());

/* Картинка без браузера: холст подменяется заглушкой, но правила окраски,
   строки и наложения считаются по-настоящему. Так проверяется то, чего не
   видно в состоянии вида, — что кадр вообще рисуется и что цвета приходят
   из мира, а не остаются нулями. */
const madeContexts = [];
const mockContext = () => {
  const context = {
    imageSmoothingEnabled: true,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textBaseline: '',
    fillRect() {},
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    arc() {},
    fillText() {},
    drawImage() {},
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData(image) {
      context.lastImage = image;
    },
  };
  madeContexts.push(context);
  return context;
};
window.HTMLCanvasElement.prototype.getContext = mockContext;

const painted = mountBlockWorldView(host, { mode: 'blocks', config: { seed: 'картинка', ...SMALL } });
const paintedHud = painted.element.querySelector('[data-role="voxel-hud"]');
const paintDeadline = Date.now() + 30_000;
let paintedDone = false;
while (Date.now() < paintDeadline) {
  await wait(100);
  if (painted.world.ready && paintedHud.textContent && !paintedHud.textContent.includes('рисую')) {
    paintedDone = true;
    break;
  }
}
add(paintedDone, 'кадр доведён до конца без холста браузера', paintedHud.textContent.slice(0, 70) + '…');
const image = madeContexts.map((context) => context.lastImage).filter((value) => value && value.data.some((channel) => channel !== 0)).pop();
add(Boolean(image), 'в полотно записаны цвета, а не нули');
if (image) {
  const colors = new Set();
  for (let index = 0; index < image.data.length; index += 4) {
    colors.add((image.data[index] << 16) | (image.data[index + 1] << 8) | image.data[index + 2]);
  }
  add(colors.size >= 8, 'в кадре не одна заливка, а разные цвета', `${colors.size} цветов`);
  const opaque = image.data[3] === 255;
  add(opaque, 'пиксели кадра непрозрачны');
}
add(painted.error === '', 'заглушка холста принимается без жалоб', painted.error || 'холст есть');
painted.dispose();

/* Снятие вида: разметка уходит, мир освобождается. */
heavy.dispose();
second.dispose();
view.dispose();
add(!root.isConnected, 'снятие вида убирает разметку из документа');
add(host.querySelectorAll('.world-voxel').length === 0, 'на хосте не осталось чужих видов', String(host.querySelectorAll('.world-voxel').length));
add(consoleErrors.length === 0, 'за всю проверку в консоль не попало лишнего', consoleErrors.join(' | '));

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? '  ✓' : '  ×'} ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);
}
console.log('');
if (failed.length) {
  console.log(`БЛОЧНЫЙ ВИД ЛОМАЕТСЯ: не прошло ${failed.length} ${plural(failed.length, 'проверка', 'проверки', 'проверок')} из ${checks.length}.`);
  process.exit(1);
}
console.log(`ВСЁ ХОРОШО — ${checks.length} ${plural(checks.length, 'проверка', 'проверки', 'проверок')} блочного вида.`);
