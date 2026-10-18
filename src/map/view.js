import { canonicalUV, geodesicRoute } from '../world/geodesy.js';
import geodesyLicense from '../world/geodesy-license.js';
import { createBlockField, createBlockRenderer, blockLOD } from './blocks.js';
import { cleanDrawings, cleanPins, cleanSettings, LAYERS, EditHistory } from './xaeroplus/schema.js';
import { paintGrid } from './xaeroplus/grids.js';
import { makeProject, makeGeoJSON, parseProject, MAX_IMPORT_BYTES } from './xaeroplus/files.js';
import { XAEROPLUS_LICENSE } from './xaeroplus/license.js';
import { getColor, colorCSS } from './xaeroplus/geometry.js';
import { createAnnotation, paintAnnotations, measurementLength, infiniteEndpoints, annotationBounds } from './xaeroplus/drawing.js';
import { icon } from '../ui/icons.js';
import { escapeHtml } from '../ui/dom.js';
import { mapsReady, missingMapsPart, readSource } from '../world/bridge.js';
import { attachGenerationStage } from '../game/generation-stage.js';
import { BIOME_NAMES, sampleSurface, rasterizeSurface, createMapCamera, mapRect, screenToMap, zoomMap, clampCamera, scaleBar } from './raster.js';

/** A surface VIEW over Azgaar. Never falls back to unrelated generated terrain. */
export function mountSurfaceView(host, { frame, config, sourceSnapshot, unified = false, freezeSource = false, showWorkbench = true, onSource = () => {}, loadPins = () => [], savePins = () => {}, loadDrawings = () => [], saveDrawings = () => {}, loadSettings = () => ({}), saveSettings = () => {}, initialCamera, onExit = () => {} } = {}) {
  const el = document.createElement('section');
  el.className = 'surface-view'; el.dataset.role = 'surface-view'; el.dataset.unified = String(unified);
  el.setAttribute('aria-label', unified ? 'Единая карта планеты' : 'Пиксельная карта поверхности');
  const button = (action, symbol, label) => `<button type="button" data-surface-action="${action}" title="${label}" aria-label="${label}">${icon(symbol, 'icon--sm')}</button>`;
  el.innerHTML = `<canvas class="surface-canvas" tabindex="0" aria-label="Карта: колесо или плюс и минус — масштаб, стрелки — перемещение, M — метка"></canvas>
    <div class="surface-heading"><strong>${unified ? config.width >= 1_000_000 ? 'Планета' : 'Архивная карта' : 'Поверхность'}</strong><span>${unified ? 'Единая география · метровые координаты' : '1 блок = 1 м · вид сверху'}</span></div>
    <div class="surface-tools" role="toolbar" aria-label="Инструменты карты">
      ${button('in', 'plus', 'Приблизить')}${button('out', 'minus', 'Отдалить')}${button('fit', 'crosshair', 'Показать весь мир')}
      ${button('relief', 'mountain', 'Светотень рельефа')}${button('grid', 'globe', 'Координатная сетка')}${button('refresh', 'refresh', 'Обновить карту')}
      ${showWorkbench ? button('editor', 'map', 'Открыть Azgaar') : ''}${button('blocks', 'search', 'Блоки 1 м: приблизить центр (B)')}
    </div>
    <details class="surface-drawing"><summary>${unified ? 'Картография' : 'Инструменты XaeroPlus'} <span data-role="drawing-count">0/256</span></summary>
      <p>Перенесённые алгоритмы · MIT</p><button type="button" data-surface-action="river-blocks">К блочному берегу реки</button><p>Блоки 1 м — B или кнопка лупы. Издали клетки объединены (LOD). Рельеф интерполирован из Azgaar; вода рек — клетки, не линии. Метровая адресация не означает измеренную точность исходных высот. У полюсов проекция растянута; замыкающая клетка широтного ряда может быть короче метра.</p>
      <div class="surface-drawing-modes" role="group" aria-label="Рисование на карте">
        <button type="button" data-drawing-mode="pan" aria-pressed="true">Обзор</button>
        <button type="button" data-drawing-mode="line" aria-pressed="false">Линия</button>
        <button type="button" data-drawing-mode="infinite" aria-pressed="false">Прямая ∞</button>
        <button type="button" data-drawing-mode="highlight" aria-pressed="false">Выделение</button>
        <button type="button" data-drawing-mode="text" aria-pressed="false">Текст</button>
        <button type="button" data-drawing-mode="edit" aria-pressed="false">Правка</button>
        <button type="button" data-drawing-mode="ellipse" aria-pressed="false">Эллипс</button>
        <button type="button" data-drawing-mode="measure" aria-pressed="false">Линейка</button>
      </div>
      <label>Цвет <input type="color" data-setting="color" value="#ff0000" aria-label="Цвет рисунка" /></label>
      <label>Непрозрачность <input type="range" data-setting="alpha" min="20" max="255" aria-label="Непрозрачность рисунка" /></label>
      <label>Толщина <input type="number" data-setting="lineWidth" min="1" max="8" aria-label="Толщина линии" /></label>
      <label>Размер текста <input type="number" data-setting="fontSize" min="8" max="40" aria-label="Размер текста" /></label>
      <label>Надпись <input data-role="drawing-text" maxlength="160" placeholder="Текст на карте" /></label>
      <div class="surface-drawing-modes"><button type="button" data-drawing-action="undo">Отменить</button><button type="button" data-drawing-action="redo">Повторить</button><button type="button" data-drawing-action="clear">Очистить</button></div>
      <details class="surface-edit"><summary>Объекты · правка</summary>
        <label>Объект <select data-role="object-list" aria-label="Объект карты"></select></label>
        <p>Выберите объект здесь или инструментом «Правка» на карте. Перетаскивание перемещает объект.</p>
        <label>Текст / имя <input data-edit="name" maxlength="160" /></label>
        <div class="surface-edit-coordinates">${['u1', 'v1', 'u2', 'v2'].map((k) => `<label>${k} <input type="number" data-edit="${k}" min="0" max="1" step="0.001" /></label>`).join('')}</div>
        <p>Координаты 0…1; у эллипса первая точка — центр, вторая задаёт радиусы. Цвет и размер берутся из полей выше.</p>
        <div class="surface-drawing-modes"><button type="button" data-drawing-action="apply">Применить</button><button type="button" data-drawing-action="delete">Удалить объект</button></div>
      </details>
      <details><summary>Слои · сетки · настройки</summary>
        <label>Сетка <select data-setting="gridMode"><option value="none">Нет</option><option value="coordinates">Координатная</option><option value="regions">Регионы 512</option><option value="mapart">Map Art 128</option></select></label>
        <label>Зум Map Art <input type="number" data-setting="gridZoom" min="0" max="4" /></label>
        <label>Подписи <input type="checkbox" data-setting="labels" /></label>
        <label>Миникарта <input type="checkbox" data-setting="minimap" /></label>
        <p>512 и 128 — единицы исходной карты, не блоки Minecraft. Слои ниже рисуются поверх предыдущих.</p>
        <div data-role="layer-list"></div>
      </details>
      <details><summary>${unified ? 'Рисунки и изображения · файлы' : 'Импорт · экспорт'}</summary>
        <div class="surface-drawing-modes">${[['json', 'JSON рисунков'], ['geojson', 'GeoJSON'], ['png-view', 'PNG вида'], ['png-world', 'PNG мира'], ['import', 'Импорт']].map(([a, t]) => `<button type="button" data-file-action="${a}">${t}</button>`).join('')}</div>
        <input type="file" data-role="map-import" accept=".json,.geojson,application/json,application/geo+json" hidden />
        <p>Импорт заменяет личные объекты (можно отменить). JSON — для того же seed и размера. GeoJSON: точки, линии, контуры полигонов; долготы и широты условные. До 2 МиБ. PNG мира — до 4096 px, не физические метры.</p>
      </details>
      <p data-role="cartography-message" role="status" aria-live="polite"></p>
      <p>Тяните по карте. Alt отключает привязку. Линейка — временная. Рисунки личные, хранятся на устройстве.</p>
      <details><summary>Что перенесено · лицензия</summary><p>Шесть режимов Drawing, геометрия Line/Ellipse, ColorHelper, RegionGrid, MapArtGrid и DrawOrderHelper из XaeroPlus. Браузерная адаптация с собственными миникартой и файлами. Не полный мод Minecraft.</p><pre>${escapeHtml(XAEROPLUS_LICENSE)}</pre><pre>${escapeHtml(geodesyLicense)}</pre></details>
    </details>
    <details class="surface-pins"><summary>Личные метки <span data-role="pin-count">0/64</span></summary>
      <div class="surface-pin-form"><input aria-label="Название метки" maxlength="40" placeholder="Название места" />${button('mark', 'plus', 'Поставить метку касанием карты')}</div>
      <p>Метки хранятся на этом устройстве</p><div data-role="pin-list"></div>
    </details>
    <canvas class="surface-minimap" tabindex="0" aria-label="Миникарта: касание перемещает обзор, стрелки перемещают камеру"></canvas>
    <div class="surface-status" role="status" aria-live="polite">Ожидаем географию Azgaar…</div>
    <div class="surface-footer"><span data-role="coordinates">Север ↑ · перетащите карту</span><span data-role="scale"></span><span data-role="resolution"></span><span data-role="measurement" aria-live="polite"></span></div>`;
  host.append(el);
  const canvas = el.querySelector('canvas');
  let ctx;
  try { ctx = canvas.getContext('2d'); } catch { ctx = null; }
  const status = el.querySelector('.surface-status');
  const coordinates = el.querySelector('[data-role="coordinates"]');
  const bar = el.querySelector('[data-role="scale"]');
  const resolution = el.querySelector('[data-role="resolution"]');
  const input = el.querySelector('.surface-pin-form input');
  const measurementText = el.querySelector('[data-role="measurement"]');
  const listeners = [];
  const listen = (node, type, fn, options) => { node.addEventListener(type, fn, options); listeners.push(() => node.removeEventListener(type, fn, options)); };
  let disposed = false; let busy = false; let refreshing = false; let refreshAgain = false;
  let hoverPoint; let blockField; let blockRenderer; let timer; let drawFrame; let source; let raster; let camera; let refs = []; let pins = []; let pinKey = '';
  let annotations = []; const history = new EditHistory(); let selection = null; let editDrag = null; let draft = null; let measurement = null; let drawingMode = 'pan';
  let settings = cleanSettings(loadSettings()); let relief = settings.relief; let grid = settings.gridMode !== 'none'; let marking = false; let dragging; let worldWidth; let worldHeight;
  const pressed = (name, value) => el.querySelector(`[data-surface-action="${name}"]`)?.setAttribute('aria-pressed', String(value));
  pressed('relief', relief); pressed('grid', grid); pressed('mark', marking);

  const minimap = el.querySelector('.surface-minimap');
  const message = (text) => { if (!disposed) el.querySelector('[data-role="cartography-message"]').textContent = text; };
  function editState() { return { drawings: annotations.map((a) => ({ ...a })), pins: pins.map((p) => ({ ...p })) }; }
  function commitAll() { saveDrawings(pinKey, annotations); commitPins(); }
  function travelHistory(direction) {
    cancelEditDrag();
    const state = history[direction](editState());
    if (!state) return;
    annotations = state.drawings; pins = state.pins; selection = null; commitAll();
  }
  function selectedObject() { return selection ? (selection.kind === 'pin' ? pins : annotations)[selection.index] : null; }
  function renderObjects() {
    const list = el.querySelector('[data-role="object-list"]');
    list.innerHTML = '<option value="">Выберите объект</option>' + annotations.map((s, i) => `<option value="drawing:${i}">${i + 1}. ${escapeHtml(s.type === 'text' ? s.text : s.type)}</option>`).join('')
      + pins.map((p, i) => `<option value="pin:${i}">Метка: ${escapeHtml(p.name)}</option>`).join('');
    list.value = selection ? `${selection.kind}:${selection.index}` : '';
    const obj = selectedObject();
    el.querySelectorAll('[data-edit]').forEach((field) => {
      field.disabled = !obj;
      const key = field.dataset.edit;
      field.value = !obj ? '' : key === 'name' ? obj.text || obj.name || '' : selection.kind === 'pin' ? (key === 'u1' || key === 'u2' ? obj.u : obj.v) : obj[key];
      if (obj && selection.kind === 'pin' && (key === 'u2' || key === 'v2')) field.disabled = true;
    });
    for (const action of ['apply', 'delete']) el.querySelector(`[data-drawing-action="${action}"]`).disabled = !obj;
  }
  function selectObject(next) {
    selection = next;
    const obj = selectedObject();
    if (obj && selection.kind === 'drawing') {
      settings.color = `#${((obj.color >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`;
      settings.alpha = Math.max(20, obj.color >>> 24); settings.lineWidth = obj.width || 2; settings.fontSize = obj.fontSize || settings.fontSize;
      syncSettings();
    }
    renderObjects(); scheduleDraw();
  }
  function deleteSelected() {
    if (!selectedObject()) return;
    history.record(editState()); (selection.kind === 'pin' ? pins : annotations).splice(selection.index, 1); selection = null; commitAll();
  }
  function applySelected() {
    if (!selectedObject()) return;
    const value = (key) => el.querySelector(`[data-edit="${key}"]`).value;
    if (['u1', 'v1', ...(selection.kind === 'drawing' ? ['u2', 'v2'] : [])].some((k) => value(k).trim() === '')) { message('Введите координаты 0…1'); return; }
    let next;
    if (selection.kind === 'pin') next = cleanPins([{ u: Number(value('u1')), v: Number(value('v1')), name: value('name') }])[0];
    else {
      const rgb = settings.color;
      const color = getColor(parseInt(rgb.slice(1, 3), 16), parseInt(rgb.slice(3, 5), 16), parseInt(rgb.slice(5, 7), 16), settings.alpha);
      next = cleanDrawings([{ ...selectedObject(), ...Object.fromEntries(['u1', 'v1', 'u2', 'v2'].map((k) => [k, Number(value(k))])), text: value('name'), color, width: settings.lineWidth, fontSize: settings.fontSize }])[0];
    }
    if (!next) { message('Неверные координаты, пустой текст или нулевой размер'); return; }
    history.record(editState()); (selection.kind === 'pin' ? pins : annotations)[selection.index] = next; commitAll(); message('Объект изменён');
  }
  function hitObject(uv) {
    const r = mapRect(camera); const px = uv.u * r.width; const py = uv.v * r.height;
    const hitLine = (a, b, tolerance) => {
      const dx = (b[0] - a[0]) * r.width; const dy = (b[1] - a[1]) * r.height;
      const x = a[0] * r.width; const y = a[1] * r.height;
      const t = Math.max(0, Math.min(1, ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(px - x - t * dx, py - y - t * dy) <= tolerance;
    };
    for (const layer of [...settings.order].reverse()) {
      if (!settings.layers[layer]) continue;
      if (layer === 'pins') for (let i = pins.length - 1; i >= 0; i -= 1) if (Math.hypot((uv.u - pins[i].u) * r.width, (uv.v - pins[i].v) * r.height) <= 12) return { kind: 'pin', index: i };
      if (layer === 'drawings') for (let i = annotations.length - 1; i >= 0; i -= 1) {
        const s = annotations[i]; let hit = false;
        if (s.type === 'line' || s.type === 'infinite') { const [a, b] = s.type === 'infinite' ? infiniteEndpoints(s) : [[s.u1, s.v1], [s.u2, s.v2]]; hit = hitLine(a, b, 8 + (s.width || 2) / 2); }
        else if (s.type === 'ellipse') hit = ((uv.u - s.u1) / Math.abs(s.u2 - s.u1)) ** 2 + ((uv.v - s.v1) / Math.abs(s.v2 - s.v1)) ** 2 <= 1.15;
        else if (s.type === 'text') hit = px >= s.u1 * r.width - 6 && px <= s.u1 * r.width + s.text.length * (s.fontSize || 16) * 0.7 + 6 && Math.abs(py - s.v1 * r.height) <= (s.fontSize || 16);
        else { const b = annotationBounds(s); hit = uv.u >= b[0] && uv.u <= b[2] && uv.v >= b[1] && uv.v <= b[3]; }
        if (hit) return { kind: 'drawing', index: i };
      }
    }
    return null;
  }
  function moveSelected(uv) {
    if (!editDrag || !selectedObject()) return;
    const s = editDrag.original; const pin = selection.kind === 'pin';
    const us = pin ? [s.u] : [s.u1, s.u2]; const vs = pin ? [s.v] : [s.v1, s.v2];
    const du = Math.max(-Math.min(...us), Math.min(1 - Math.max(...us), uv.u - editDrag.start.u));
    const dv = Math.max(-Math.min(...vs), Math.min(1 - Math.max(...vs), uv.v - editDrag.start.v));
    const next = pin ? { ...s, u: s.u + du, v: s.v + dv } : { ...s, u1: s.u1 + du, u2: s.u2 + du, v1: s.v1 + dv, v2: s.v2 + dv };
    (pin ? pins : annotations)[selection.index] = next;
  }
  function cancelEditDrag() {
    if (!editDrag) return;
    annotations = editDrag.before.drawings.map((s) => ({ ...s })); pins = editDrag.before.pins.map((p) => ({ ...p })); editDrag = null; renderObjects(); scheduleDraw();
  }
  function syncSettings() {
    relief = settings.relief; grid = settings.gridMode !== 'none'; pressed('relief', relief); pressed('grid', grid);
    el.querySelectorAll('[data-setting]').forEach((field) => { if (field.type === 'checkbox') field.checked = settings[field.dataset.setting]; else field.value = settings[field.dataset.setting]; });
    minimap.hidden = !settings.minimap;
  }
  function persistSettings() { settings = cleanSettings(settings); saveSettings(settings); syncSettings(); renderLayers(); scheduleDraw(); }
  function renderLayers() {
    const order = settings.order;
    el.querySelector('[data-role="layer-list"]').innerHTML = order.map((id, i) => `<div class="surface-layer-row"><label><input type="checkbox" data-layer="${id}" ${settings.layers[id] ? 'checked' : ''} />${LAYERS[id]}</label><button type="button" data-layer-move="${id}" data-direction="-1" aria-label="${LAYERS[id]}: раньше" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-layer-move="${id}" data-direction="1" aria-label="${LAYERS[id]}: позже" ${i === order.length - 1 ? 'disabled' : ''}>↓</button></div>`).join('');
  }
  function moveLayer(id, direction) {
    const at = settings.order.indexOf(id); const to = at + direction;
    if (at < 0 || to < 0 || to >= settings.order.length) return;
    [settings.order[at], settings.order[to]] = [settings.order[to], settings.order[at]]; persistSettings();
  }
  listen(el, 'change', (event) => {
    const field = event.target;
    if (field.dataset.setting) {
      const key = field.dataset.setting; const previousRelief = settings.relief;
      settings[key] = field.type === 'checkbox' ? field.checked : field.type === 'number' || field.type === 'range' ? Number(field.value) : field.value;
      persistSettings(); if (previousRelief !== settings.relief) refresh(true);
    }
    if (field.dataset.layer) { settings.layers[field.dataset.layer] = field.checked; persistSettings(); }
    if (field.dataset.role === 'object-list') { cancelEditDrag(); const [kind, index] = field.value.split(':'); selectObject(field.value ? { kind, index: Number(index) } : null); }
  });
  function paintMinimap() {
    if (!settings.minimap || !raster || !camera) return;
    minimap.width = 160; minimap.height = Math.max(48, Math.round(160 * worldHeight / worldWidth));
    const m = minimap.getContext('2d'); if (!m) return;
    m.drawImage(raster, 0, 0, minimap.width, minimap.height);
    const r = mapRect(camera); const x = Math.max(0, -r.x / r.width); const y = Math.max(0, -r.y / r.height);
    const endX = Math.min(1, (camera.width - r.x) / r.width); const endY = Math.min(1, (camera.height - r.y) / r.height);
    m.strokeStyle = '#ffffff'; m.lineWidth = 2; m.strokeRect(x * minimap.width + 1, y * minimap.height + 1, Math.max(2, (endX - x) * minimap.width - 2), Math.max(2, (endY - y) * minimap.height - 2));
  }
  listen(minimap, 'pointerdown', (event) => {
    if (!camera || event.button > 0) return; event.preventDefault(); minimap.focus(); const b = minimap.getBoundingClientRect();
    camera.x = (event.clientX - b.left) / b.width; camera.y = (event.clientY - b.top) / b.height;
    camera.zoom = Math.max(2, camera.zoom); clampCamera(camera); scheduleDraw();
  });
  listen(minimap, 'keydown', (event) => {
    if (!camera || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', '+', '-'].includes(event.key)) return;
    event.preventDefault();
    camera.x += (event.key === 'ArrowRight' ? 0.1 : event.key === 'ArrowLeft' ? -0.1 : 0) / camera.zoom;
    camera.y += (event.key === 'ArrowDown' ? 0.1 : event.key === 'ArrowUp' ? -0.1 : 0) / camera.zoom;
    if (event.key === 'Home') { camera.zoom = 1; camera.x = camera.y = 0.5; }
    if (event.key === '+') zoomMap(camera, 1.5); if (event.key === '-') zoomMap(camera, 1 / 1.5);
    clampCamera(camera); scheduleDraw();
  });
  const worldInfo = () => ({ key: pinKey, widthM: worldWidth, heightM: worldHeight });
  function download(blob, name) {
    if (disposed) return;
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; el.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function fileAction(action) {
    if (!raster || !camera || busy) { message('Дождитесь карты'); return; }
    if (action === 'import') { el.querySelector('[data-role="map-import"]').click(); return; }
    if (action === 'json' || action === 'geojson') {
      const data = action === 'json' ? makeProject(worldInfo(), annotations, pins, settings) : makeGeoJSON(annotations, pins);
      download(new Blob([JSON.stringify(data, null, 2)], { type: action === 'geojson' ? 'application/geo+json' : 'application/json' }), `sages-map.${action}`); message('Файл экспортирован'); return;
    }
    if (!['png-view', 'png-world'].includes(action)) return;
    try {
      const image = document.createElement('canvas'); let view;
      if (action === 'png-world') {
        const factor = 4096 / Math.max(worldWidth, worldHeight); image.width = Math.max(1, Math.round(worldWidth * factor)); image.height = Math.max(1, Math.round(worldHeight * factor));
        view = createMapCamera(worldWidth, worldHeight, image.width, image.height);
      } else { image.width = Math.round(camera.width); image.height = Math.round(camera.height); view = { ...camera }; }
      const context = image.getContext('2d'); if (!context) throw new Error('Canvas недоступен');
      renderMap(context, view, false); image.toBlob((blob) => { if (blob) { download(blob, `sages-${action}.png`); message('PNG экспортирован'); } else message('Не удалось создать PNG'); }, 'image/png');
    } catch (error) { message(error.message); }
  }
  listen(el.querySelector('[data-role="map-import"]'), 'change', async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    const key = pinKey;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('Файл больше 2 МиБ');
      const text = await file.text(); if (disposed || busy || key !== pinKey) return;
      const data = parseProject(text, worldInfo());
      cancelEditDrag(); history.record(editState()); annotations = data.drawings; pins = data.pins; selection = null; measurement = draft = null;
      if (data.settings) { const changedRelief = data.settings.relief !== settings.relief; settings = data.settings; persistSettings(); if (changedRelief) refresh(true); }
      commitAll(); message('Объекты импортированы. Отмена доступна.');
    } catch (error) { message(`Импорт отклонён: ${error.message}`); }
  });

  function scheduleDraw() {
    if (disposed || drawFrame) return;
    drawFrame = requestAnimationFrame(() => { drawFrame = null; draw(); });
  }
  function resize() {
    const bounds = el.getBoundingClientRect();
    const width = Math.max(320, bounds.width || host.clientWidth || 1000);
    const height = Math.max(240, bounds.height || host.clientHeight || 600);
    hoverPoint = null;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (camera) { camera.width = width; camera.height = height; clampCamera(camera); }
    scheduleDraw();
  }
  function mapPoint(camera, x, y) {
    const p = screenToMap(camera, x, y);
    if (camera.topology === 'ellipsoid') p.u = canonicalUV(p.u, .5).u;
    return p;
  }
  function draw() {
    renderMap(ctx, camera);
    paintMinimap();
  }
  const routes = new WeakMap();
  function paintMeasurement(ctx, shape, r, camera) {
    if (!shape) return;
    if (!blockField?.geometry) { paintAnnotations(ctx, [shape], r, camera); return; }
    let points = routes.get(shape);
    if (!points) { points = geodesicRoute(blockField.geometry, shape); routes.set(shape, points); }
    ctx.save(); ctx.strokeStyle = '#f5d785'; ctx.lineWidth = 2;
    for (const shift of [-1, 0, 1]) {
      ctx.beginPath();
      points.forEach(([u, v], i) => ctx[i ? 'lineTo' : 'moveTo'](r.x + (u + shift) * r.width, r.y + v * r.height));
      ctx.stroke();
    }
    ctx.restore();
  }
  function renderMap(ctx, camera, transient = true) {
    if (!ctx || !camera || !raster || disposed) return;
    let r = mapRect(camera);
    ctx.fillStyle = '#101919'; ctx.fillRect(0, 0, camera.width, camera.height);
    ctx.imageSmoothingEnabled = false;
    // The overview bitmap remains for the minimap; the map itself uses
    // bounded world-aligned metre/LOD tiles, never an enlarged source pixel.
    ctx.save(); ctx.beginPath(); ctx.rect(0, r.y, camera.width, r.height); ctx.clip();
    const originalCamera = camera;
    for (const offset of camera.topology === 'ellipsoid' && camera.zoom > 1 ? [-1, 0, 1] : [0]) {
    camera = { ...originalCamera, x: originalCamera.x - offset };
    r = mapRect(camera);
    if (r.x > camera.width || r.x + r.width < 0) continue;
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.width, r.height); ctx.clip();
    blockRenderer?.paint(ctx, camera, relief);
    const layers = {
      rivers() {
        blockRenderer?.paint(ctx, camera, relief, 'rivers');
      },
      grid() { paintGrid(ctx, settings, source, r, camera); },
      drawings() { paintAnnotations(ctx, annotations, r, camera); },
      pins() {
    for (const pin of pins) {
      const x = r.x + pin.u * r.width; const y = r.y + pin.v * r.height;
      ctx.fillStyle = colorCSS(getColor(245, 215, 133, 255)); ctx.strokeStyle = '#19201c'; ctx.lineWidth = 2;
      ctx.fillRect(x - 4, y - 4, 8, 8); ctx.strokeRect(x - 4, y - 4, 8, 8);
      ctx.font = '12px Inter, sans-serif'; ctx.lineWidth = 3;
      if (settings.labels) { ctx.strokeText(pin.name, x + 9, y + 4); ctx.fillText(pin.name, x + 9, y + 4); }
    }
      },
    };
    for (const id of settings.order) if (settings.layers[id]) layers[id]();
    if (transient) {
      paintMeasurement(ctx, measurement, r, camera);
      if (draft?.shape?.type === 'measure') paintMeasurement(ctx, draft.shape, r, camera);
      else paintAnnotations(ctx, [draft?.shape], r, camera, true);
      const selected = selectedObject();
      if (selected && settings.layers[selection.kind === 'pin' ? 'pins' : 'drawings']) {
        const bounds = selection.kind === 'pin' ? [selected.u, selected.v, selected.u, selected.v] : annotationBounds(selected);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.strokeRect(r.x + bounds[0] * r.width - 6, r.y + bounds[1] * r.height - 6, (bounds[2] - bounds[0]) * r.width + 12, (bounds[3] - bounds[1]) * r.height + 12); ctx.setLineDash([]);
      }
    }
    ctx.restore();
    }
    camera = originalCamera; r = mapRect(camera);
    ctx.restore();
    if (!transient) return;
    const measured = draft?.shape?.type === 'measure' ? draft.shape : measurement;
    const geometry = blockField?.geometry;
    const distance = measured ? geometry ? geometry.distance(measured.u1, measured.v1, measured.u2, measured.v2) : measurementLength(measured, worldWidth, worldHeight) : 0;
    measurementText.textContent = measured ? `≈${(distance < 1000 ? distance : distance / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ${distance < 1000 ? 'м' : 'км'} · ${geometry ? 'по эллипсоиду' : 'по проекции'}` : '';
    const scale = scaleBar(worldWidth / r.width * (geometry ? Math.max(.000001, geometry.parallelScale(camera.y)) : 1));
    bar.innerHTML = `<i style="width:${scale.pixels.toFixed(1)}px"></i>${escapeHtml(scale.label)}`;
    updateCoordinates(hoverPoint || { x: camera.width / 2, y: camera.height / 2 });
    const lod = blockLOD(camera);
    resolution.textContent = `${lod === 1 ? geometry ? 'Адресация 1 м · проекция' : '1 блок = 1 м' : `LOD: клетка ${lod.toLocaleString('ru-RU')} м`} · источник ≈${Math.round(source.spacing / source.width * worldWidth / 1000)} км · зум ${camera.zoom.toFixed(1)}×`;
  }
  function updateCoordinates(p) {
    if (!camera || !source || !blockField) return;
    const uv = mapPoint(camera, p.x, p.y);
    if (uv.u < 0 || uv.v < 0 || uv.u > 1 || uv.v > 1) return;
    const s = sampleSurface(source, uv.u, uv.v); const c = blockField.column(uv.u * worldWidth, uv.v * worldHeight);
    const name = c.material === 'river' ? 'Река' : s.lake ? 'Озеро' : s.land ? BIOME_NAMES[s.biome] || 'Суша' : 'Океан';
    coordinates.textContent = `${blockField.geometry ? `${(90 - uv.v * 180).toFixed(6)}° / ${(uv.u * 360 - 180).toFixed(6)}° · ` : ''}${(uv.u * worldWidth / 1000).toFixed(1)} / ${(uv.v * worldHeight / 1000).toFixed(1)} км · ${name} · блок X=${c.x} Z=${c.z} · Y=${c.groundY} м${c.waterY !== null ? ` · вода Y=${c.waterY} м` : ''}`;
  }
  function renderPins() {
    el.querySelector('[data-role="pin-count"]').textContent = `${pins.length}/64`;
    el.querySelector('[data-role="pin-list"]').innerHTML = pins.map((pin, i) => `<div class="surface-pin-row"><button type="button" data-pin-go="${i}">${escapeHtml(pin.name)}</button><button type="button" data-pin-remove="${i}" aria-label="Удалить метку ${escapeHtml(pin.name)}">${icon('x', 'icon--xs')}</button></div>`).join('');
  }
  function drawingControls() {
    el.querySelector('[data-role="drawing-count"]').textContent = `${annotations.length}/256`;
    el.querySelector('[data-drawing-action="undo"]').disabled = !history.past.length;
    el.querySelector('[data-drawing-action="redo"]').disabled = !history.future.length;
    el.querySelector('[data-drawing-action="clear"]').disabled = !annotations.length;
    renderObjects();
  }
  function changeDrawings(next) {
    history.record(editState()); annotations = cleanDrawings(next); selection = null; commitAll();
  }
  function setDrawingMode(mode) {
    cancelEditDrag(); drawingMode = mode; draft = null;
    marking = false; pressed('mark', false);
    canvas.classList.toggle('is-marking', mode !== 'pan');
    el.querySelectorAll('[data-drawing-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.drawingMode === mode)));
    scheduleDraw();
  }
  function updateDraft(p, altKey) {
    const uv = mapPoint(camera, p.x, p.y);
    uv.u = Math.max(0, Math.min(1, uv.u)); uv.v = Math.max(0, Math.min(1, uv.v));
    const rgb = settings.color;
    const color = getColor(parseInt(rgb.slice(1, 3), 16), parseInt(rgb.slice(3, 5), 16), parseInt(rgb.slice(5, 7), 16), settings.alpha);
    draft.shape = createAnnotation(drawingMode, draft.start, uv, { width: worldWidth, height: worldHeight }, color, mapRect(camera).width / worldWidth, !altKey, { width: settings.lineWidth, fontSize: settings.fontSize, text: el.querySelector('[data-role="drawing-text"]').value });
  }
  function commitPins() { savePins(pinKey, pins); renderPins(); drawingControls(); scheduleDraw(); }
  function place(u, v) {
    if (!source || !raster || busy || pins.length >= 64 || u < 0 || v < 0 || u > 1 || v > 1) return;
    history.record(editState());
    pins.push({ u, v, name: input.value.trim().slice(0, 40) || `Метка ${pins.length + 1}` });
    input.value = ''; marking = false; pressed('mark', false); canvas.classList.remove('is-marking'); commitPins();
  }
  async function refresh(force = false) {
    if (disposed || busy) return;
    if (refreshing) { refreshAgain ||= force; return; }
    let win;
    try { win = frame?.contentWindow; if (!sourceSnapshot && !mapsReady(win)) { status.hidden = false; status.textContent = `Подготавливаем единую географию: ${missingMapsPart(win)}.`; return; } }
    catch { status.hidden = false; status.textContent = 'Источник географии недоступен. Повторите вход в карту.'; return; }
    const next = sourceSnapshot ? [sourceSnapshot.cellH, sourceSnapshot.packHeight, sourceSnapshot.cellBiome, sourceSnapshot.rivers, config.seed] : [win.grid?.cells?.h, win.pack?.cells?.h, win.pack?.cells?.biome, win.pack?.rivers, win.options?.map?.seed];
    if (!force && next.every((v, i) => v === refs[i])) return;
    refreshing = true; status.hidden = false; status.textContent = 'Читаем рельеф и рисуем поверхность…';
    await new Promise((resolve) => setTimeout(resolve, 20));
    try {
      if (disposed || busy) return;
      if (!ctx) throw new Error('Браузер не предоставил Canvas 2D. Попробуйте другой браузер.');
      const snapshot = sourceSnapshot || readSource(win, config);
      if (unified && config.width >= 1_000_000) snapshot.topology = 'ellipsoid';
      const pixels = rasterizeSurface(snapshot, { relief });
      const bitmap = document.createElement('canvas'); bitmap.width = pixels.width; bitmap.height = pixels.height;
      const bitmapContext = bitmap.getContext('2d');
      const image = bitmapContext.createImageData(pixels.width, pixels.height); image.data.set(pixels.data); bitmapContext.putImageData(image, 0, 0);
      if (disposed) return;
      source = snapshot; raster = bitmap; refs = next;
      const units = win?.options?.map?.units?.distance;
      const kmPerUnit = Number(units?.scale) || 1;
      const factor = units?.unit === 'mi' ? 1609.344 : units?.unit === 'm' ? 1 : 1000;
      worldWidth = source.physicalWidth || (config.width >= 1_000_000 ? config.width : source.width * kmPerUnit * factor);
      worldHeight = worldWidth * source.height / source.width;
      if (config.width >= 1_000_000) worldHeight = config.height;
      worldHeight = source.physicalHeight || worldHeight;
      source.physicalWidth = worldWidth; source.physicalHeight = worldHeight;
      blockRenderer?.clear();
      blockField = createBlockField(source, worldWidth, worldHeight); blockRenderer = createBlockRenderer(blockField);
      const key = `${next[4] || config.seed}|${Math.round(worldWidth)}x${Math.round(worldHeight)}`;
      if (pinKey !== key) { pinKey = key; pins = loadPins(pinKey).map((p) => ({ ...p })); renderPins(); annotations = loadDrawings(pinKey).map((a) => ({ ...a })); history.clear(); selection = editDrag = null; measurement = draft = null; drawingControls(); }
      if (!camera || camera.worldWidth !== worldWidth || camera.worldHeight !== worldHeight) {
        camera = createMapCamera(worldWidth, worldHeight, 1000, 600);
        if (initialCamera?.worldWidth === worldWidth && initialCamera?.worldHeight === worldHeight) {
          camera.x = initialCamera.x; camera.y = initialCamera.y; camera.zoom = initialCamera.zoom;
          initialCamera = null;
        }
      }
      camera.topology = source.topology;
      if (freezeSource) { sourceSnapshot = source; refs = [source.cellH, source.packHeight, source.cellBiome, source.rivers, config.seed]; }
      onSource(source);
      status.hidden = true; resize();
    } catch (error) { status.hidden = false; status.textContent = `Поверхность не построена: ${error.message}`; }
    finally { refreshing = false; if (refreshAgain && !disposed) { refreshAgain = false; refresh(true); } }
  }
  function poll() { if (disposed) return; refresh(); if (!sourceSnapshot) timer = setTimeout(poll, 1200); }
  const unstage = frame ? attachGenerationStage(frame, { onEvent(event) {
    if (event.type === 'start') { cancelEditDrag(); dragging = null; selection = null; busy = true; refs = []; raster = null; blockRenderer?.clear(); draft = measurement = null; ctx?.clearRect(0, 0, canvas.width, canvas.height); status.hidden = false; status.textContent = 'Azgaar создаёт географию…'; }
    if (event.type === 'step') status.textContent = `${event.label} · ${event.index + 1}/${event.total}`;
    if (event.type === 'done') { busy = false; refresh(true); }
    if (event.type === 'error') { busy = true; status.hidden = false; status.textContent = `Ошибка географии: ${event.message}. Попробуйте создать мир заново.`; }
  } }) : () => {};
  function focusBlocks() {
    if (!camera) return;
    const pixelsPerMeter = mapRect(camera).width / worldWidth;
    zoomMap(camera, 8 / pixelsPerMeter); scheduleDraw();
  }
  function focusRiver() {
    if (!camera || !source?.rivers.length) { message('В этой карте нет рек'); return; }
    let river; let i;
    for (const candidate of source.rivers) {
      for (let j = 1; j < candidate.points.length; j += 1) {
        const a = candidate.points[j - 1]; const b = candidate.points[j];
        if (sampleSurface(source, (a[0] + b[0]) / 2 / source.width, (a[1] + b[1]) / 2 / source.height).land) { river = candidate; i = j; break; }
      }
      if (river) break;
    }
    if (!river) { message('Не найден сухопутный участок реки в снимке'); return; }
    const a = river.points[i - 1]; const b = river.points[i];
    const x = (a[0] + b[0]) / 2 / source.width * worldWidth; const z = (a[1] + b[1]) / 2 / source.height * worldHeight;
    const dx = (b[0] - a[0]) / source.width * worldWidth; const dz = (b[1] - a[1]) / source.height * worldHeight;
    const length = Math.hypot(dx, dz) || 1; const radius = blockField.riverAt(x, z)?.radiusM || 4;
    camera.x = (x - dz / length * (radius + 3)) / worldWidth; camera.y = (z + dx / length * (radius + 3)) / worldHeight;
    focusBlocks(); clampCamera(camera); scheduleDraw();
  }
  function point(event) { const b = canvas.getBoundingClientRect(); return { x: event.clientX - b.left, y: event.clientY - b.top }; }
  listen(canvas, 'wheel', (event) => { if (!camera) return; event.preventDefault(); const p = point(event); zoomMap(camera, Math.exp(-Math.max(-200, Math.min(200, event.deltaY)) * 0.004), p.x, p.y); scheduleDraw(); }, { passive: false });
  const pointers = new Map(); let pinch;
  listen(canvas, 'pointerdown', (event) => {
    if (!camera || event.button > 0) return;
    canvas.focus(); canvas.setPointerCapture?.(event.pointerId);
    const p = point(event); pointers.set(event.pointerId, p);
    if (pointers.size === 2) { cancelEditDrag(); draft = null; const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); dragging = null; return; }
    dragging = { id: event.pointerId, ...p, startX: p.x, startY: p.y, moved: false, shift: event.shiftKey };
    if (source && raster && !busy && drawingMode === 'edit' && !marking && !event.shiftKey) {
      const uv = mapPoint(camera, p.x, p.y); selectObject(hitObject(uv));
      if (selection) editDrag = { start: uv, original: { ...selectedObject() }, before: editState() };
    }
    if (source && raster && !busy && !['pan', 'edit'].includes(drawingMode) && !marking && !event.shiftKey) {
      const start = mapPoint(camera, p.x, p.y);
      if (start.u >= 0 && start.u <= 1 && start.v >= 0 && start.v <= 1) draft = { start, shape: null };
    }
    canvas.classList.add('is-dragging');
  });
  listen(canvas, 'pointermove', (event) => {
    if (!camera) return;
    const p = point(event); if (pointers.has(event.pointerId)) pointers.set(event.pointerId, p);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]; const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) zoomMap(camera, distance / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = distance; scheduleDraw(); return;
    }
    const uv = mapPoint(camera, p.x, p.y);
    hoverPoint = p; updateCoordinates(p);
    if (dragging?.id === event.pointerId) {
      const r = mapRect(camera);
      if (Math.hypot(p.x - dragging.startX, p.y - dragging.startY) > 5) dragging.moved = true;
      if (editDrag) moveSelected(uv);
      else if (draft) updateDraft(p, event.altKey);
      else if (drawingMode === 'pan' && !marking && !dragging.shift) { camera.x -= (p.x - dragging.x) / r.width; camera.y -= (p.y - dragging.y) / r.height; clampCamera(camera); }
      dragging.x = p.x; dragging.y = p.y; scheduleDraw();
    }
  });
  function release(event, cancelled = false) {
    const p = point(event);
    if (editDrag) {
      if (cancelled) cancelEditDrag();
      else { moveSelected(mapPoint(camera, p.x, p.y)); if (JSON.stringify(editState()) !== JSON.stringify(editDrag.before)) history.record(editDrag.before); editDrag = null; commitAll(); }
    }
    if (draft && dragging?.id === event.pointerId) {
      if (!cancelled) {
        updateDraft(p, event.altKey);
        if (draft.shape?.type === 'measure') measurement = draft.shape;
        else if (draft.shape && annotations.length < 256) { settings.layers.drawings = true; persistSettings(); changeDrawings([...annotations, draft.shape]); }
        else if (drawingMode === 'text' && !draft.shape) message('Введите надпись в поле «Надпись», затем коснитесь карты');
        else if (annotations.length >= 256) message('Лимит: 256 рисунков на мир');
      }
      draft = null; scheduleDraw();
    }
    if (!cancelled && dragging?.id === event.pointerId && !dragging.moved && (marking || dragging.shift)) { const uv = mapPoint(camera, p.x, p.y); place(uv.u, uv.v); }
    pointers.delete(event.pointerId); dragging = null; pinch = null; canvas.classList.remove('is-dragging');
  }
  listen(canvas, 'pointerup', (event) => release(event)); listen(canvas, 'pointercancel', (event) => release(event, true));
  listen(canvas, 'keydown', (event) => {
    if (!camera) return;
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); travelHistory(event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo'); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); return; }
    if (event.key === 'Escape') { cancelEditDrag(); draft = null; selection = null; measurement = null; setDrawingMode('pan'); drawingControls(); return; }
    if (['+', '=', '-', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'm', 'M', 'b', 'B'].includes(event.key)) event.preventDefault();
    if (event.key === '+' || event.key === '=') zoomMap(camera, 1.5);
    if (event.key === '-') zoomMap(camera, 1 / 1.5);
    if (event.key === 'Home') { camera.zoom = 1; camera.x = camera.y = 0.5; }
    if (event.key.startsWith('Arrow')) { const r = mapRect(camera); camera.x += (event.key === 'ArrowRight' ? 80 : event.key === 'ArrowLeft' ? -80 : 0) / r.width; camera.y += (event.key === 'ArrowDown' ? 80 : event.key === 'ArrowUp' ? -80 : 0) / r.height; clampCamera(camera); }
    if (event.key.toLowerCase() === 'b') focusBlocks();
    if (event.key.toLowerCase() === 'm') place(camera.x, camera.y);
    scheduleDraw();
  });
  listen(el, 'click', (event) => {
    const target = event.target.closest('button'); if (!target) return;
    if (target.hasAttribute('data-pin-remove')) { history.record(editState()); pins.splice(Number(target.dataset.pinRemove), 1); selection = null; commitPins(); return; }
    if (target.hasAttribute('data-pin-go') && camera) { const pin = pins[Number(target.dataset.pinGo)]; camera.x = pin.u; camera.y = pin.v; camera.zoom = Math.max(4, camera.zoom); clampCamera(camera); scheduleDraw(); return; }
    if (target.dataset.drawingMode) { setDrawingMode(target.dataset.drawingMode); return; }
    if (target.dataset.drawingAction === 'undo' || target.dataset.drawingAction === 'redo') { travelHistory(target.dataset.drawingAction); return; }
    if (target.dataset.drawingAction === 'delete') { deleteSelected(); return; }
    if (target.dataset.drawingAction === 'apply') { applySelected(); return; }
    if (target.dataset.drawingAction === 'clear') { if (annotations.length) changeDrawings([]); return; }
    if (target.dataset.layerMove) { moveLayer(target.dataset.layerMove, Number(target.dataset.direction)); return; }
    if (target.dataset.fileAction) { fileAction(target.dataset.fileAction); return; }
    const action = target.dataset.surfaceAction;
    if (action === 'editor' && showWorkbench) { onExit(); return; }
    if (action === 'refresh') { refs = []; refresh(true); return; }
    if (action === 'relief') { settings.relief = !settings.relief; persistSettings(); refresh(true); return; }
    if (action === 'grid') { settings.gridMode = grid ? 'none' : 'coordinates'; settings.layers.grid = true; persistSettings(); return; }
    if (action === 'mark') { const was = marking; setDrawingMode('pan'); marking = !was; pressed('mark', marking); canvas.classList.toggle('is-marking', marking); return; }
    if (!camera) return;
    if (action === 'blocks') focusBlocks();
    if (action === 'river-blocks') focusRiver();
    if (action === 'in') zoomMap(camera, 1.5);
    if (action === 'out') zoomMap(camera, 1 / 1.5);
    if (action === 'fit') { camera.x = camera.y = 0.5; camera.zoom = 1; }
    scheduleDraw();
  });
  listen(window, 'resize', resize);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(el); syncSettings(); renderLayers(); drawingControls(); resize(); poll();
  return {
    element: el,
    refresh: () => refresh(true),
    getSource: () => source,
    getState: () => ({ blockLOD: camera && blockLOD(camera), blockCache: blockRenderer?.stats(), ready: !!raster, camera: camera && { ...camera }, pins: pins.map((p) => ({ ...p })), annotations: annotations.map((a) => ({ ...a })), settings: cleanSettings(settings), selection: selection && { ...selection }, drawingMode, measurement: measurement && { ...measurement }, busy }),
    dispose() { if (disposed) return; disposed = true; clearTimeout(timer); if (drawFrame) cancelAnimationFrame(drawFrame); observer?.disconnect(); unstage(); listeners.forEach((stop) => stop()); blockRenderer?.clear(); blockRenderer = blockField = null; source = raster = draft = measurement = null; annotations = []; history.clear(); editDrag = selection = null; pointers.clear(); el.remove(); },
  };
}
