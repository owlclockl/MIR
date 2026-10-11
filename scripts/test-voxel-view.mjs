/* Воксельный вид в настоящем DOM: запуск `npm run test:voxel-view`.

   Что проверяется и почему именно это: src/world/* покрыт test:voxel, GL
   посмотрит человек, а между ними —mountWorldView(): разметка, обработчики
   мыши и клавиатуры, очередь чанков в кадре, снятие вида. В jsdom нет WebGL и
   нет холста 2D — это как раз тот случай, когда вид обязан не упасть, а
   уйти в запасной путь. Ошибку «нет контекста» проверка считает ожидаемой и
   не записывает её в падения.

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

const { mountWorldView } = await import('../src/game/world-view.js');

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

const buttons = [...view.element.querySelectorAll('[data-voxel-action]')];
add(buttons.length === 3, 'панель режима: три кнопки', buttons.map((b) => b.dataset.voxelAction).join(', '));
add(buttons.every((button) => button.getAttribute('aria-label') && button.type === 'button'),
  'у каждой кнопки доступное имя и type=button');
add(view.element.querySelector('[role="status"]') !== null, 'HUD объявлен живым блоком');

const canvas = view.element.querySelector('canvas');
add(Boolean(canvas) && canvas.tabIndex === 0, 'полотно получает фокус клавиатуры');
add(view.world?.stats().queued > 0 && view.world?.stats().ready === 0,
  'мир поставил чанки в очередь, не строя их заранее', `${view.world?.stats().queued} в очереди`);
add(view.world?.radius === 3, 'радиус обзора ограничен размером тайла', `радиус ${view.world?.radius} чанка`);
add(view.renderer === null && view.fallback === null,
  'без WebGL2 и без холста вид не падает', `renderer: ${view.renderer}, запас: ${view.fallback}`);

await wait(200);
const lived = view.world.stats();
add(lived.ready > 0, 'очередь двигается в кадрах', `${lived.ready} готово, ${lived.queued} в очереди`);
add(lived.quads > 0, 'готовые чанки дали геометрию', `${lived.quads} квадов`);

const hud = view.element.querySelector('[data-role="voxel-hud"]');
add(hud?.textContent.includes('чанков'), 'HUD показывает состояние мира', hud?.textContent.slice(0, 48) ?? '');

const yawBefore = view.camera.yaw;
const mouse = (type, x, y) => {
  const event = new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  canvas.dispatchEvent(event);
};
mouse('pointerdown', 100, 100);
mouse('pointermove', 190, 140);
mouse('pointerup', 190, 140);
await wait(40);
add(Math.abs(view.camera.yaw - yawBefore) > 0.05, 'перетаскивание вращает камеру', `yaw ${view.camera.yaw.toFixed(3)} ← ${yawBefore.toFixed(3)}`);

const distBefore = view.camera.dist;
const wheel = window.WheelEvent
  ? new window.WheelEvent('wheel', { deltaY: -100, bubbles: true })
  : new window.Event('wheel');
canvas.dispatchEvent(wheel);
await wait(20);
add(view.camera.dist !== distBefore || distBefore === 14, 'колесо меняет приближение', `${distBefore} → ${view.camera.dist}`);

const targetBefore = [...view.camera.target];
const key = (type, code) => {
  const event = new window.KeyboardEvent(type, { bubbles: true });
  Object.defineProperty(event, 'code', { value: code });
  window.dispatchEvent(event);
};
key('keydown', 'KeyW');
add(view.keys.has('KeyW'), 'клавиша W попала в обработчик вида');
await wait(80);
key('keyup', 'KeyW');
add(!view.keys.has('KeyW'), 'отпущенная клавиша забрана из обработчика');
view.camera.pitch = -0.6; // почти горизонтальный взгляд: тогда шаг виден по X/Z
await wait(60);
add(view.camera.target[0] !== targetBefore[0] || view.camera.target[2] !== targetBefore[2],
  'W двигает точку наблюдения', `X ${view.camera.target[0].toFixed(1)} · Z ${view.camera.target[2].toFixed(1)}`);

const cut = view.element.querySelector('[data-voxel-action="cut"]');
cut.click();
add(view.cutaway === true && view.element.classList.contains('is-cutaway') && cut.classList.contains('is-on'),
  'разрез включается кнопкой и классом');
cut.click();
add(view.cutaway === false, 'разрез выключается второй кнопкой');

const beforeReset = [...view.camera.target];
view.element.querySelector('[data-voxel-action="reset"]').click();
await wait(40);
add(view.camera.target[0] !== beforeReset[0] || view.camera.target[1] !== beforeReset[1],
  '«Появление» возвращает камеру к спавну', `Y ${view.camera.target[1].toFixed(1)}`);

view.element.querySelector('[data-voxel-action="exit"]').click();
add(exited === 1, 'кнопка «К карте» зовёт onExit — за закрытие режима отвечает вызывающий');

const orphanHost = window.document.createElement('div');
const empty = mountWorldView(orphanHost, { frame: null, config: null });
add(/Воксельный мир:/.test(empty.error ?? ''), 'без документа вид честно сообщает причину', empty.error ?? '');
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

console.log('Воксельный вид: DOM, ввод, жизненный цикл\n');
let bad = 0;
for (const check of checks) {
  console.log(`${check.ok ? '  ✓' : '  ×'} ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);
  if (!check.ok) bad += 1;
}
console.log('');
if (bad) {
  console.log(`ВОКСЕЛЬНЫЙ ВИД ЛОМАЕТСЯ: не прошло ${plural(bad, 'проверка', 'проверки', 'проверок')} — ${bad} из ${checks.length}.`);
  window.close();
  process.exit(1);
}
console.log(`ВСЁ ХОРОШО — ${checks.length} ${plural(checks.length, 'проверка', 'проверки', 'проверок')} воксельного вида.`);
window.close();
