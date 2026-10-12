/* Блочная карта мира: 2D-вид поверх документа Azgaar.

   Экран карты уже держит iframe с генератором, и именно из его окна вид берёт
   карты (src/world/bridge.js). Поэтому режим переключается классом на .world-app,
   а не перерисовкой страницы: пересоздание iframe заново запустило бы генерацию
   Azgaar (секунды).

   Что здесь есть:
     • плоская карта: 1 блок = 1 пиксель, вид сверху, без камеры и без GL;
     • ползунок яруса: 20 слоёв по высоте, на карте только выбранный ярус;
     • пресеты: все слои, кроны, поверхность, вода, дно, пещеры, руды, основание;
     • зум 1× / 2× / 4×, перетаскивание мышью, стрелки для панорамы;
     • подсказка под курсором: координаты, ярус, блок;
     • очередь генерации: чанки считаются с бюджетом кадра, видимое появляется
       постепенно, а не замораживает страницу.

   Логика срезов — в src/world/layers.js, кэш чанков — в src/world/world.js. */

import { blockName, AIR } from '../world/blocks.js';
import { buildField } from '../world/field.js';
import { VoxelSourceError, describeSource, readSource } from '../world/bridge.js';
import { CHUNK_SX, CHUNK_SZ } from '../world/chunk.js';
import { blockColors } from '../world/atlas.js';
import { LAYER_COUNT, PRESETS, layerBand, layerOf, pickAt, presetById, sliceChunk } from '../world/layers.js';
import { createChunkCache, worldExtent } from '../world/world.js';
import { icon } from '../ui/icons.js';

const BUDGET_MS = 10;
const ZOOMS = [1, 2, 4];
const PAN_STEP = 16;

const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

/**
 * Положение окна по одной оси. Карта шире окна — окно держится в её пределах
 * (с запасом PAN_STEP). Карта уже окна — окно центрируется, иначе край карты
 * прижался бы к стороне и панорама не работала бы вовсе.
 */
const fitAxis = (value, span, viewSize) =>
  viewSize >= span + PAN_STEP * 2 ? (span - viewSize) / 2 : clamp(value, -PAN_STEP, span + PAN_STEP - viewSize);

/**
 * Номер яруса, в который попадает высота: при отсутствии поля — середина.
 * Используется для подписи и для начального положения ползунка.
 */
const startLayer = (field) => layerOf(field.worldHeight, field.seaY ?? 64);

const layerLabel = (worldHeight, layer) => {
  const band = layerBand(worldHeight, layer);
  return `Ярус ${band.index + 1} из ${LAYER_COUNT} · y ${band.lo}–${band.hi}`;
};

/**
 * @param {HTMLElement} host
 * @param {{frame?: HTMLElement, config?: object, onExit?: () => void}} options
 */
export const mountWorldView = (host, { frame, config, onExit } = {}) => {
  const cleanups = [];
  /* Объявлен до всего: dispose обязан работать и на отказе чтения карт, когда
     до цикла кадров дело не дошло. */
  let raf = 0;
  const root = document.createElement('div');
  root.className = 'world-voxel';
  root.dataset.role = 'world-voxel';
  root.innerHTML = `
    <canvas class="world-voxel-canvas" data-role="voxel-canvas" tabindex="0" aria-label="Блочная карта: блоки одного яруса, 1 пиксель — 1 блок"></canvas>
    <div class="world-voxel-hud" data-role="voxel-hud" role="status" aria-live="off"></div>
    <div class="world-voxel-toolbar">
      <div class="world-voxel-group" role="group" aria-label="Масштаб">
        ${ZOOMS.map((z) => `<button class="world-voxel-button" type="button" data-voxel-zoom="${z}" aria-pressed="${z === 1}" title="Масштаб ${z}×">${z}×</button>`).join('')}
      </div>
      <button class="world-voxel-button" type="button" data-voxel-action="exit" aria-label="К карте" title="К карте (Esc)">${icon('map', 'icon--xs')}<span>К карте</span></button>
    </div>
    <div class="world-voxel-layers">
      <div class="world-voxel-presets" role="group" aria-label="Пресет слоя">
        ${PRESETS.map((p) => `<button class="world-voxel-chip" type="button" data-voxel-preset="${p.id}" aria-pressed="${p.id === 'all'}">${p.label}</button>`).join('')}
      </div>
      <label class="world-voxel-slider">
        <span class="world-voxel-slider-label" data-role="voxel-layer-label">—</span>
        <input type="range" min="0" max="${LAYER_COUNT - 1}" step="1" value="0" data-role="voxel-layer" aria-label="Ярус" />
      </label>
    </div>
    <p class="world-voxel-note" data-role="voxel-note"></p>`;
  host.append(root);

  const canvas = root.querySelector('[data-role="voxel-canvas"]');
  const hud = root.querySelector('[data-role="voxel-hud"]');
  const note = root.querySelector('[data-role="voxel-note"]');
  const slider = root.querySelector('[data-role="voxel-layer"]');
  const layerText = root.querySelector('[data-role="voxel-layer-label"]');
  const setNote = (text) => {
    note.textContent = text || '';
    note.hidden = !text;
  };
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };

  const view = {
    element: root,
    error: '',
    field: null,
    cache: null,
    layer: 0,
    preset: 'all',
    zoom: 1,
    x: 0,
    z: 0,
    dirty: true,
    hover: null,
    drag: null,
    dispose: null,
  };

  view.dispose = () => {
    view.running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    for (const cleanup of cleanups.splice(0)) cleanup();
    view.cache?.clear();
    view.cache = null;
    root.remove();
  };

  /* Отказ до построения вида: показываем причину и оставляем рабочий dispose. */
  const stop = (message) => {
    view.error = message;
    setNote(message);
    hud.textContent = 'Карта не построена — данные недоступны.';
    return view;
  };

  /* ---------- снимок карт → поле ---------- */
  let source;
  try {
    source = readSource(frame?.contentWindow, { seed: config?.seed, width: config?.width, height: config?.height });
  } catch (error) {
    const message = error instanceof VoxelSourceError ? error.message : error?.message ?? String(error);
    return stop(`Блочная карта: ${message}`);
  }
  setNote(`Снимаю карты: ${describeSource(source)}…`);
  const field = buildField(source, { profile: 2, detail: 1 });
  view.field = field;
  view.source = source;
  const extent = worldExtent(field);
  view.cache = createChunkCache(field, { limit: 256 });

  /* Цвета блоков — из процедурного атласа, один раз на вид. */
  const colors = blockColors();

  /* Срезы чанков на текущие ярус и пресет. Сбрасываются при смене того и другого. */
  let slices = new Map();
  const invalidate = () => {
    slices = new Map();
    view.dirty = true;
  };

  view.layer = startLayer(field);
  slider.max = String(LAYER_COUNT - 1);
  slider.value = String(view.layer);

  /* Холст и буферы: 1 css px = 1 блок × зум × dpr. */
  const offscreen = document.createElement('canvas');
  const offctx = offscreen.getContext('2d');
  const ctx = canvas.getContext('2d');
  if (!ctx || !offctx) {
    return stop('Блочная карта: двумерный холст недоступен в этом браузере.');
  }
  let buffer = null;

  const sizeCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      view.dirty = true;
    }
    return { w, h, dpr };
  };

  const centerOn = (bx, bz) => {
    const { w, h, dpr } = sizeCanvas();
    const scale = view.zoom * dpr;
    view.x = fitAxis(bx - w / scale / 2, extent.width, w / scale);
    view.z = fitAxis(bz - h / scale / 2, extent.height, h / scale);
  };

  /* Начальный вид — центр карты. Центрируем в первом кадре: до layout холст
     ещё не имеет размера. */
  let centered = false;
  layerText.textContent = layerLabel(field.worldHeight, view.layer);
  setNote(`Карта готова: ${describeSource(source)}. 1 пиксель — 1 блок.`);

  /* ---------- срез одного чанка ---------- */
  const sliceFor = (cx, cz, budget) => {
    const id = `${cx},${cz}`;
    const hit = slices.get(id);
    if (hit) return hit;
    if (!view.cache.has(cx, cz) && budget.spent() >= BUDGET_MS && budget.made > 0) return null;
    const chunk = view.cache.get(cx, cz);
    budget.made += 1;
    const band = layerBand(field.worldHeight, view.layer);
    const px = sliceChunk(chunk, band, view.preset, colors);
    slices.set(id, px);
    return px;
  };

  /* ---------- рисование ---------- */
  const draw = () => {
    const { w: cw, h: ch, dpr } = sizeCanvas();
    if (!centered && cw > 1 && ch > 1) {
      centered = true;
      centerOn(extent.width / 2, extent.height / 2);
    }
    const scale = view.zoom * dpr;
    view.x = fitAxis(view.x, extent.width, cw / scale);
    view.z = fitAxis(view.z, extent.height, ch / scale);
    const x0 = Math.floor(view.x);
    const z0 = Math.floor(view.z);
    const bw = Math.ceil(cw / scale) + 1;
    const bh = Math.ceil(ch / scale) + 1;
    if (!buffer || buffer.width !== bw || buffer.height !== bh) {
      buffer = offctx.createImageData(bw, bh);
      offscreen.width = bw;
      offscreen.height = bh;
    }
    buffer.data.fill(0);

    const budget = { made: 0, start: performance.now(), spent: () => performance.now() - budget.start };
    let pending = 0;
    const cx0 = Math.max(0, Math.floor(x0 / CHUNK_SX));
    const cz0 = Math.max(0, Math.floor(z0 / CHUNK_SZ));
    const cx1 = Math.min(extent.chunksX - 1, Math.floor((x0 + bw - 1) / CHUNK_SX));
    const cz1 = Math.min(extent.chunksZ - 1, Math.floor((z0 + bh - 1) / CHUNK_SZ));
    for (let cz = cz0; cz <= cz1; cz += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        const px = sliceFor(cx, cz, budget);
        if (!px) {
          pending += 1;
          continue;
        }
        for (let lz = 0; lz < CHUNK_SZ; lz += 1) {
          const gz = cz * CHUNK_SZ + lz;
          const by = gz - z0;
          if (by < 0 || by >= bh || gz >= extent.height) continue;
          for (let lx = 0; lx < CHUNK_SX; lx += 1) {
            const gx = cx * CHUNK_SX + lx;
            const bx = gx - x0;
            if (bx < 0 || bx >= bw || gx >= extent.width) continue;
            const from = (lz * CHUNK_SX + lx) * 4;
            if (px[from + 3] === 0) continue;
            const to = (by * bw + bx) * 4;
            buffer.data[to] = px[from];
            buffer.data[to + 1] = px[from + 1];
            buffer.data[to + 2] = px[from + 2];
            buffer.data[to + 3] = 255;
          }
        }
      }
    }
    offctx.putImageData(buffer, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0c1114';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(offscreen, 0, 0, bw, bh, -(view.x - x0) * scale, -(view.z - z0) * scale, bw * scale, bh * scale);
    view.dirty = pending > 0;
    if (pending === 0 && !view.building) setNote('');
    return { pending, made: budget.made };
  };

  /* ---------- управление ---------- */
  const pointerAt = (event) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const px = (event.clientX - rect.left) * dpr;
    const py = (event.clientY - rect.top) * dpr;
    const scale = view.zoom * dpr;
    return { gx: Math.floor(view.x + px / scale), gz: Math.floor(view.z + py / scale) };
  };

  listen(canvas, 'pointerdown', (event) => {
    view.drag = { id: event.pointerId, x: event.clientX, z: event.clientY, vx: view.x, vz: view.z };
    canvas.setPointerCapture?.(event.pointerId);
  });
  listen(canvas, 'pointermove', (event) => {
    if (view.drag && view.drag.id === event.pointerId) {
      const dpr = window.devicePixelRatio || 1;
      const scale = view.zoom * dpr;
      const { w, h } = sizeCanvas();
      view.x = fitAxis(view.drag.vx - (event.clientX - view.drag.x) * dpr / scale, extent.width, w / scale);
      view.z = fitAxis(view.drag.vz - (event.clientY - view.drag.z) * dpr / scale, extent.height, h / scale);
      view.dirty = true;
    }
    view.hover = pointerAt(event);
  });
  const endDrag = (event) => {
    if (view.drag && view.drag.id === event.pointerId) view.drag = null;
  };
  listen(canvas, 'pointerup', endDrag);
  listen(canvas, 'pointercancel', endDrag);
  listen(canvas, 'pointerleave', () => {
    view.hover = null;
  });

  const setZoom = (zoom) => {
    const { w, h, dpr } = sizeCanvas();
    const scale = view.zoom * dpr;
    const cx = view.x + w / scale / 2;
    const cz = view.z + h / scale / 2;
    view.zoom = zoom;
    centerOn(cx, cz);
    for (const button of root.querySelectorAll('[data-voxel-zoom]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.voxelZoom) === zoom));
    }
    view.dirty = true;
  };

  const setLayer = (layer) => {
    const next = clamp(Math.round(layer), 0, LAYER_COUNT - 1);
    if (next === view.layer) return;
    view.layer = next;
    slider.value = String(next);
    layerText.textContent = layerLabel(field.worldHeight, next);
    invalidate();
  };

  const setPreset = (id) => {
    if (view.preset === id) return;
    view.preset = id;
    for (const button of root.querySelectorAll('[data-voxel-preset]')) {
      button.setAttribute('aria-pressed', String(button.dataset.voxelPreset === id));
    }
    invalidate();
  };

  listen(slider, 'input', () => setLayer(Number(slider.value)));

  listen(root, 'click', (event) => {
    const zoomButton = event.target.closest?.('[data-voxel-zoom]');
    if (zoomButton) return setZoom(Number(zoomButton.dataset.voxelZoom));
    const presetButton = event.target.closest?.('[data-voxel-preset]');
    if (presetButton) return setPreset(presetButton.dataset.voxelPreset);
    const action = event.target.closest?.('[data-voxel-action]');
    if (action?.dataset.voxelAction === 'exit') onExit?.();
  });

  listen(canvas, 'keydown', (event) => {
    const step = PAN_STEP / view.zoom;
    const keys = {
      ArrowLeft: () => { view.x -= step; },
      ArrowRight: () => { view.x += step; },
      ArrowUp: () => { view.z -= step; },
      ArrowDown: () => { view.z += step; },
      PageUp: () => setLayer(view.layer + 1),
      PageDown: () => setLayer(view.layer - 1),
      '+': () => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(view.zoom) + 1)]),
      '-': () => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(view.zoom) - 1)]),
    };
    const act = keys[event.key];
    if (!act) return;
    event.preventDefault();
    act();
    view.dirty = true;
  });

  listen(window, 'resize', () => {
    view.dirty = true;
  });

  /* ---------- кадр ---------- */
  let hudText = '';
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (view.dirty) {
      const result = draw();
      view.building = result.pending > 0;
      if (view.building) setNote(`Строю слой: ${result.pending} участков ждут очереди…`);
    }
    if (!view.hover) {
      const idle = `Карта ${extent.width}×${extent.height} · ${layerLabel(field.worldHeight, view.layer)} · ${presetById(view.preset).label}`;
      if (idle !== hudText) {
        hudText = idle;
        hud.textContent = idle;
      }
    } else if (view.cache) {
      const { gx, gz } = view.hover;
      const cx = Math.floor(gx / CHUNK_SX);
      const cz = Math.floor(gz / CHUNK_SZ);
      let text = `X ${gx} · Z ${gz} · ${layerLabel(field.worldHeight, view.layer)}`;
      if (gx >= 0 && gz >= 0 && gx < extent.width && gz < extent.height && view.cache.has(cx, cz)) {
        const chunk = view.cache.get(cx, cz);
        const id = pickAt(chunk, gx - cx * CHUNK_SX, gz - cz * CHUNK_SZ, layerBand(field.worldHeight, view.layer), view.preset);
        text += ` · ${id === AIR ? 'пусто в ярусе' : blockName(id)}`;
      }
      text += ` · ${presetById(view.preset).label}`;
      if (text !== hudText) {
        hudText = text;
        hud.textContent = text;
      }
    }
  };

  view.running = true;
  raf = requestAnimationFrame(tick);
  return view;
};
