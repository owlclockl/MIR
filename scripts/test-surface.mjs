import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { sampleSurface, rasterizeSurface, createMapCamera, mapRect, screenToMap, zoomMap, clampCamera, scaleBar, maxMapZoom } from '../src/map/raster.js';
import { readSource } from '../src/world/bridge.js';

let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks += 1; console.log(`✓ ${label}`); };
const gridH = Uint8Array.from({ length: 64 }, (_, i) => i % 8 < 4 ? 10 : 30 + Math.floor(i / 8) * 3);
const biome = Uint8Array.from(gridH, (h) => h < 20 ? 0 : 6);
const fixture = () => ({
  GenerationPipeline: { steps: [], run: async () => {} },
  options: { map: { graph: { width: 64, height: 64 }, seed: 'surface-fixture', units: { distance: { unit: 'km', scale: 1 } } } },
  grid: { cellsX: 8, cellsY: 8, spacing: 8, cells: { h: gridH.slice() } },
  pack: { cells: { h: gridH.slice(), g: Uint16Array.from({ length: 64 }, (_, i) => i), biome: biome.slice(), p: Array.from({ length: 64 }, (_, i) => [i % 8 * 8 + 4, Math.floor(i / 8) * 8 + 4]) }, features: [], rivers: [{ i: 1, cells: [5, 13, 21] }] },
});
const win = fixture(); const snapshot = readSource(win, { seed: 'surface-fixture' });
check(!sampleSurface(snapshot, 0.1, 0.5).land, 'океан берётся из исходных высот');
check(sampleSurface(snapshot, 0.8, 0.5).land, 'суша берётся из тех же исходных высот');
check(sampleSurface(snapshot, 0.8, 0.5).biome === 6, 'биом не заменён собственным климатом');
check(snapshot.rivers.length === 1 && snapshot.rivers[0].points.length === 3, 'река приходит из моста Azgaar');
const before = gridH.slice();
const colored = rasterizeSurface(snapshot, { width: 128 });
const repeat = rasterizeSurface(snapshot, { width: 128 });
check(Buffer.from(colored.data).equals(Buffer.from(repeat.data)), 'повторная раскраска детерминирована');
check(colored.data.every((v, i) => i % 4 !== 3 || v === 255), 'нет прозрачных дыр в поверхности');
check(Buffer.from(gridH).equals(Buffer.from(before)) && Buffer.from(win.grid.cells.h).equals(Buffer.from(before)), 'отрисовка не меняет исходный рельеф');
const noRelief = rasterizeSurface(snapshot, { width: 128, relief: false });
check(!Buffer.from(colored.data).equals(Buffer.from(noRelief.data)), 'переключатель светотени реально меняет растр');
const packed = { ...snapshot, packHeight: new Uint8Array(64 * 64).fill(5), packBiome: new Uint8Array(64 * 64).fill(0), packLake: new Uint16Array(64 * 64) };
check(!sampleSurface(packed, 0.8, 0.5).land, 'точный pack-берег приоритетнее grid');
packed.packHeight.fill(50); packed.packLake.fill(1); packed.features = [{ i: 1, subtype: 'freshwater' }];
check(!sampleSurface(packed, 0.8, 0.5).land && !!sampleSurface(packed, 0.8, 0.5).lake, 'озеро выше моря не превращается в лес');
check(rasterizeSurface(snapshot, { width: 99999 }).width === 2048, 'растр ограничен, физические метры не размер Canvas');

const camera = createMapCamera(40_075_017, 20_003_932, 1000, 700);
const rect = mapRect(camera);
check(Math.abs(rect.width - 1000) < 1e-6 && rect.height < 700, 'Земля помещается в обзор без растяжения сторон');
const anchor = screenToMap(camera, 600, 400); zoomMap(camera, 2, 600, 400);
const afterZoom = screenToMap(camera, 600, 400);
check(Math.abs(anchor.u - afterZoom.u) < 1e-10 && Math.abs(anchor.v - afterZoom.v) < 1e-10, 'зум сохраняет точку под курсором');
zoomMap(camera, 1e6); check(camera.zoom === maxMapZoom(camera), 'максимальный зум ограничен физическим метровым масштабом');
zoomMap(camera, 1e-9); check(camera.zoom === 1, 'минимальный зум — весь мир');
camera.x = -100; camera.y = 100; clampCamera(camera);
check(Math.abs(camera.x - 0.5) < 1e-10 && Math.abs(camera.y - 0.5) < 1e-10, 'камера не теряет мир за границами');
check(scaleBar(20000).label.includes('км') && scaleBar(0.5).label.includes('м'), 'линейка переводит метры в реальные единицы');

const dom = new JSDOM('<!doctype html><div id="host"><iframe></iframe></div>', { pretendToBeVisual: true, url: 'https://sages.test/' });
const window = dom.window;
for (const name of ['window', 'document', 'Node', 'HTMLElement']) globalThis[name] = window[name];
globalThis.localStorage = window.localStorage;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
let draws = 0;
window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({
    createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    drawImage() { draws += 1; },
  }, { get(target, key) { return target[key] ?? (() => {}); }, set(target, key, value) { target[key] = value; return true; } });
};
const { mountSurfaceView } = await import('../src/map/view.js');
const store = await import('../src/data/store.js');
store.saveSurfacePins('bad', [{ u: NaN, v: 0.5 }, { u: -1, v: 0 }, { u: 0.2, v: 0.4, name: 'x'.repeat(80) }]);
check(store.loadSurfacePins('bad').length === 1 && store.loadSurfacePins('bad')[0].name.length === 40, 'хранилище валидирует координаты и имена');
store.saveSurfacePins('limit', Array.from({ length: 100 }, () => ({ u: 0.5, v: 0.5, name: 'Метка' })));
check(store.loadSurfacePins('limit').length === 64, 'не больше 64 личных меток на мир');
check(store.loadSurfacePins('other-seed').length === 0, 'метки другого seed не протекают в мир');
const host = document.querySelector('#host'); const frame = document.querySelector('iframe');
Object.assign(frame.contentWindow, fixture());
const opts = { frame, config: { seed: 'surface-fixture', width: 40_075_017, height: 20_003_932 }, loadPins: store.loadSurfacePins, savePins: store.saveSurfacePins, loadDrawings: store.loadSurfaceDrawings, saveDrawings: store.saveSurfaceDrawings, loadSettings: store.loadSurfaceSettings, saveSettings: store.saveSurfaceSettings };
let view = mountSurfaceView(host, opts);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(180); await wait(40);
check(view.getState().ready && draws > 0, 'DOM-конвейер строит растр и рисует в Canvas');
check(document.querySelector('iframe') === frame && frame.isConnected, 'iframe Azgaar остаётся в DOM');
const click = (selector) => document.querySelector(selector).click();
click('[data-surface-action="in"]'); await wait(30);
check(view.getState().camera.zoom > 1 && document.querySelector('[data-role="resolution"]').textContent.includes('1.5'), 'кнопка зума меняет камеру и подпись');
const canvas = document.querySelector('.surface-canvas');
canvas.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'm', bubbles: true }));
check(view.getState().pins.length === 1, 'M ставит личную метку в центре камеры');
click('[data-pin-go="0"]');
check(view.getState().camera.zoom >= 4, 'выбор метки приближает её');
const savedCamera = view.getState().camera;
view.dispose();
check(!document.querySelector('.surface-view') && frame.isConnected, 'dispose снимает поверхность, не редактор');
view = mountSurfaceView(host, { ...opts, initialCamera: savedCamera }); await wait(180); await wait(40);
check(view.getState().pins.length === 1, 'метка переживает перемонтирование');
check(view.getState().camera.zoom === savedCamera.zoom, 'камера переживает переключение режима');
click('[data-pin-remove="0"]'); check(view.getState().pins.length === 0, 'метку можно удалить');
click('[data-surface-action="fit"]');
function pointer(type, x, y, extra = {}) {
  const event = new window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, ...extra });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  document.querySelector('.surface-canvas').dispatchEvent(event);
}
click('[data-drawing-mode="line"]');
pointer('pointerdown', 200, 200); pointer('pointermove', 700, 400); pointer('pointerup', 700, 400);
check(view.getState().annotations.length === 1 && view.getState().annotations[0].type === 'line', 'линия использует перенесённую геометрию XaeroPlus');
click('[data-drawing-mode="ellipse"]');
pointer('pointerdown', 500, 300); pointer('pointermove', 800, 450); pointer('pointerup', 800, 450);
check(view.getState().annotations.length === 2 && view.getState().annotations[1].type === 'ellipse', 'эллипс добавляется в слой рисунков');
click('[data-drawing-action="undo"]');
check(view.getState().annotations.length === 1, 'отмена убирает последнюю операцию рисования');
click('[data-drawing-mode="measure"]');
pointer('pointerdown', 200, 200); pointer('pointermove', 700, 400); pointer('pointerup', 700, 400); await wait(40);
check(view.getState().measurement && document.querySelector('[data-role="measurement"]').textContent.includes('км'), 'линейка XaeroPlus измеряет в физических километрах');
check(view.getState().annotations.length === 1, 'измерение временное, не сохраняется как рисунок');
click('[data-drawing-mode="line"]');
pointer('pointerdown', 250, 250); pointer('pointermove', 600, 350); pointer('pointercancel', 600, 350);
check(view.getState().annotations.length === 1, 'отмена указателя не сохраняет черновую линию');
view.dispose(); view = mountSurfaceView(host, opts); await wait(180); await wait(40);
check(view.getState().annotations.length === 1, 'рисунки сохраняются после переключения режима');
click('[data-drawing-action="clear"]'); check(view.getState().annotations.length === 0, 'очистка удаляет рисунки');
click('[data-drawing-action="undo"]'); check(view.getState().annotations.length === 1, 'очистку можно отменить');

// Expanded browser cartography: all modes, editing, history and preferences.
click('[data-drawing-action="redo"]'); check(view.getState().annotations.length === 0, 'redo повторяет очистку');
// canvas was replaced during remount, use the live element for shortcuts.
const key = (name, extra = {}) => document.querySelector('.surface-canvas').dispatchEvent(new window.KeyboardEvent('keydown', { key: name, bubbles: true, ...extra }));
key('z', { ctrlKey: true }); check(view.getState().annotations.length === 1, 'Ctrl+Z отменяет действие на карте');
click('[data-drawing-mode="infinite"]'); pointer('pointerdown', 400, 300); pointer('pointermove', 650, 400); pointer('pointerup', 650, 400);
click('[data-drawing-mode="highlight"]'); pointer('pointerdown', 400, 300); pointer('pointermove', 650, 400); pointer('pointerup', 650, 400);
document.querySelector('[data-role="drawing-text"]').value = 'Надпись <img src=x>';
click('[data-drawing-mode="text"]'); pointer('pointerdown', 700, 320); pointer('pointerup', 700, 320);
check(view.getState().annotations.length === 4 && view.getState().annotations.slice(1).map((s) => s.type).join(',') === 'infinite,highlight,text', 'прямая, выделение и текст сохраняются как настоящие объекты');
const change = (selector, value) => { const field = document.querySelector(selector); if (field.type === 'checkbox') field.checked = value; else field.value = value; field.dispatchEvent(new window.Event('change', { bubbles: true })); };
change('[data-role="object-list"]', 'drawing:3');
document.querySelector('[data-edit="name"]').value = 'Изменённый текст';
change('[data-setting="color"]', '#00cc99'); change('[data-setting="fontSize"]', 24);
click('[data-drawing-action="apply"]');
check(view.getState().annotations[3].text === 'Изменённый текст' && view.getState().annotations[3].fontSize === 24, 'правка меняет текст, цвет и размер');
check(!document.querySelector('.surface-edit img'), 'имена и надписи не вставляются как HTML');
click('[data-drawing-action="delete"]'); check(view.getState().annotations.length === 3, 'выбранный объект удаляется');
key('z', { ctrlKey: true }); key('y', { ctrlKey: true }); check(view.getState().annotations.length === 3, 'Ctrl+Z / Ctrl+Y отменяют и повторяют удаление');
key('z', { ctrlKey: true });
click('[data-drawing-mode="edit"]');
const oldPosition = { ...view.getState().annotations[2] };
pointer('pointerdown', 520, 350); pointer('pointermove', 560, 370); pointer('pointerup', 560, 370);
check(view.getState().annotations[2].u1 > oldPosition.u1, 'инструмент правки перемещает выделение перетаскиванием');
key('z', { ctrlKey: true }); check(view.getState().annotations[2].u1 === oldPosition.u1, 'перетаскивание отменяется одним действием');
pointer('pointerdown', 520, 350); pointer('pointermove', 560, 370); pointer('pointercancel', 560, 370);
check(view.getState().annotations[2].u1 === oldPosition.u1, 'pointercancel восстанавливает объект до перетаскивания');
key('m'); check(view.getState().pins.length === 1, 'метка добавляется в общую историю');
key('z', { ctrlKey: true }); check(view.getState().pins.length === 0, 'undo метки атомарен с рисунками');
key('Z', { ctrlKey: true, shiftKey: true }); check(view.getState().pins.length === 1, 'Ctrl+Shift+Z восстанавливает метку');
change('[data-role="object-list"]', 'pin:0'); document.querySelector('[data-edit="name"]').value = 'Новый дом'; click('[data-drawing-action="apply"]');
check(view.getState().pins[0].name === 'Новый дом', 'метку можно переименовать через правку');
change('[data-setting="gridMode"]', 'mapart'); change('[data-setting="gridZoom"]', 3); change('[data-setting="minimap"]', false);
change('[data-layer="rivers"]', false); click('[data-layer-move="pins"][data-direction="-1"]');
check(view.getState().settings.gridMode === 'mapart' && !view.getState().settings.layers.rivers && document.querySelector('.surface-minimap').hidden, 'сетка, миникарта и видимость слоёв управляются настройками');
const remembered = view.getState().settings;
view.dispose(); view = mountSurfaceView(host, opts); await wait(180); await wait(40);
check(JSON.stringify(view.getState().settings) === JSON.stringify(remembered) && view.getState().annotations.length === 4, 'настройки, порядок слоёв и все новые режимы переживают перемонтирование');
check(view.getState().measurement === null, 'линейка не попадает в постоянное хранение');

click('[data-surface-action="blocks"]'); await wait(40);
check(view.getState().blockLOD === 1 && document.querySelector('[data-role="resolution"]').textContent.startsWith('1 блок = 1 м'), 'кнопка блоков достигает метрового LOD');
key('Home'); key('b'); await wait(40);
check(view.getState().blockLOD === 1 && view.getState().blockCache.cached <= 128, 'B приближает до метров, кэш ограничен');
key('Home'); await wait(40);
check(view.getState().camera.zoom === 1 && view.getState().blockLOD > 1, 'Home возвращает глобальный LOD без метрового массива планеты');

const newFixture = fixture(); newFixture.options.map.seed = 'changed-seed';
Object.assign(frame.contentWindow, newFixture); await view.refresh(); await wait(40);
check(view.getState().ready && view.getState().pins.length === 0, 'новая карта читается без пересоздания iframe');
view.dispose(); const stopped = draws; await wait(100);
check(draws === stopped, 'после dispose нет оставшихся кадров');
const emptyFrame = document.createElement('iframe'); host.append(emptyFrame);
emptyFrame.contentWindow.GenerationPipeline = { steps: [], run: async () => {} };
const waiting = mountSurfaceView(host, { ...opts, frame: emptyFrame }); await wait(30);
check(!waiting.getState().ready && !document.querySelector('.surface-status').hidden, 'без источника честное ожидание, не чужой процедурный мир');
waiting.dispose(); window.close();
console.log(`\n${checks} проверок поверхности: всё хорошо.`);
