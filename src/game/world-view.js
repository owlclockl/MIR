/* Воксельный вид мира: GL-полотно поверх документа Azgaar.

   Экран карты уже держит iframe с генератором, и именно из его окна вид берёт
   карты (src/world/bridge.js). Поэтому режим переключается классом на .world-app,
   а не перерисовкой страницы: пересоздание iframe заново запустило бы генерацию
   Azgaar (секунды), и воксельный мир пришлось бы строить с нуля.

   Что здесь есть:
     • камера-орбита: перетаскивание — вращение, Shift+перетаскивание — сдвиг,
       колесо — приближение, WASD/стрелки — полёт, Space/C — вверх/вниз,
       Q/E — поворот, R — к точке появления, X — разрез (стены пещер);
     • очередь чанков с бюджетом кадра (src/world/world.js): первые кадры
       показывают ближние чанки, дальние догоняют;
     • HUD: чем мир засеян, сколько чанков и квадов, что под курсором
       (DDA-луч по блокам — тот же ответ, что понадобится для «копать сюда»);
     • если WebGL2 недоступен — не пустой экран, а растрельный вид сверху по
       тому же полю. */

import { blockName } from '../world/blocks.js';
import { CHUNK_SX, CHUNK_SZ, blockAt } from '../world/chunk.js';
import { buildField, sampleColumn, spawnPoint, surfaceY } from '../world/field.js';
import { VoxelSourceError, describeSource, readSource } from '../world/bridge.js';
import { createVoxelWorld, tilePeriodChunks } from '../world/world.js';
import { createRenderer, uploadChunkMesh } from '../world/render.js';
import { icon } from '../ui/icons.js';

const BUDGET_MS = 6;
const FOV = 66;
const MAX_LOOK = 460;
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyX', 'KeyC', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

/** Базис камеры в том же соглашении, что mat4View: yaw 0 = взгляд вдоль −Z. */
const basis = (yaw, pitch) => {
  const forward = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  let rx = -forward[2];
  let rz = forward[0];
  const length = Math.hypot(rx, rz);
  if (length < 1e-6) {
    rx = 1;
    rz = 0;
  } else {
    rx /= length;
    rz /= length;
  }
  const right = [rx, 0, rz];
  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  return { forward, right, up };
};

/**
 * Обход вокселей (Amanatides–Woo): первая занятая клетка на луче. Возвращает и
 * блок, и мировые координаты.
 */
export const raycast = (world, eye, dir, limit) => {
  let x = Math.floor(eye[0]);
  let y = Math.floor(eye[1]);
  let z = Math.floor(eye[2]);
  const stepX = dir[0] > 0 ? 1 : -1;
  const stepY = dir[1] > 0 ? 1 : -1;
  const stepZ = dir[2] > 0 ? 1 : -1;
  const delta = (value) => Math.abs(1 / (value || 1e-9));
  const tDeltaX = delta(dir[0]);
  const tDeltaY = delta(dir[1]);
  const tDeltaZ = delta(dir[2]);
  /* До границы ближайшей клетки по каждой оси — в единицах длины луча. */
  const toEdge = (origin, cell, step, tDelta) => {
    const edge = step > 0 ? cell + 1 : cell;
    const distance = Math.abs(edge - origin);
    return distance * tDelta;
  };
  let tMaxX = toEdge(eye[0], x, stepX, tDeltaX);
  let tMaxY = toEdge(eye[1], y, stepY, tDeltaY);
  let tMaxZ = toEdge(eye[2], z, stepZ, tDeltaZ);
  let t = 0;
  let record = null;
  let cacheKey = '';
  for (let guard = 0; guard < 4096 && t <= limit; guard += 1) {
    const cx = Math.floor(x / CHUNK_SX);
    const cz = Math.floor(z / CHUNK_SZ);
    const key = `${cx},${cz}`;
    if (key !== cacheKey) {
      record = world.get(cx, cz);
      cacheKey = key;
    }
    const chunk = record?.chunk;
    if (chunk && y >= 0 && y < chunk.height) {
      const id = blockAt(chunk, x - chunk.x0, y, z - chunk.z0);
      if (id) return { id, x, y, z };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
    }
  }
  return null;
};

/** 2D-запас, если WebGL2 недоступен: вид сверху по тому же полю. */
const createHeightmapFallback = (canvas, field) => {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const work = document.createElement('canvas');
  const workContext = work.getContext('2d');
  if (!workContext) return null;
  let image = null;
  return {
    draw(target, span) {
      const rect = canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = Math.max(1, Math.floor(rect.height));
      const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
      const pixelsW = Math.max(1, Math.floor(cssWidth * dpr));
      const pixelsH = Math.max(1, Math.floor(cssHeight * dpr));
      if (canvas.width !== pixelsW || canvas.height !== pixelsH) {
        canvas.width = pixelsW;
        canvas.height = pixelsH;
      }
      /* Одна выборка поля на пиксель экрана — это ~800 000 выборок на кадр, и
         браузер встанет. Сетка ограничена сверху, растягивается без сглаживания:
         вид остаётся «блочным», что для запаса даже уместно. */
      const cells = clamp(Math.round(cssWidth / 4), 24, 240);
      if (!image || work.width !== cells) {
        work.width = cells;
        work.height = Math.max(1, Math.round((cells * cssHeight) / cssWidth));
        image = workContext.createImageData(work.width, work.height);
      }
      const cx = Math.round(target[0]);
      const cz = Math.round(target[2]);
      const data = image.data;
      for (let py = 0; py < work.height; py += 1) {
        for (let px = 0; px < work.width; px += 1) {
          const column = sampleColumn(
            field,
            Math.round(cx - span / 2 + (px / work.width) * span),
            Math.round(cz - span / 2 + (py / work.height) * span),
          );
          const shade = clamp(0.24 + (column.y / field.worldHeight) * 0.8, 0, 1);
          const wet = column.waterY > column.y;
          const offset = (py * work.width + px) * 4;
          data[offset] = Math.round(wet ? 34 + shade * 40 : 60 + shade * 130);
          data[offset + 1] = Math.round(wet ? 84 + shade * 70 : 88 + shade * 110);
          data[offset + 2] = Math.round(wet ? 132 + shade * 90 : 48 + shade * 80);
          data[offset + 3] = 255;
        }
      }
      workContext.putImageData(image, 0, 0);
      context.imageSmoothingEnabled = false;
      context.drawImage(work, 0, 0, pixelsW, pixelsH);
      context.fillStyle = 'rgba(12, 18, 15, 0.78)';
      context.fillRect(0, 0, pixelsW, Math.round(22 * dpr));
      context.fillStyle = '#dbe8df';
      context.font = `${Math.round(11 * dpr)}px system-ui, sans-serif`;
      context.fillText(`2D · X ${cx} · Z ${cz} · охват ${span} колонок`, Math.round(8 * dpr), Math.round(15 * dpr));
    },
  };
};

/**
 * @param {HTMLElement} host элемент .world-editor: в нём лежит iframe с картой
 * @param {{ frame?: HTMLIFrameElement, config?: object, onExit?: () => void }} [options]
 * @returns {object} view — element, stats, hit, dispose
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
    <canvas class="world-voxel-canvas" data-role="voxel-canvas" tabindex="0" aria-label="Воксельный мир: блок за блоком"></canvas>
    <div class="world-voxel-hud" data-role="voxel-hud" role="status" aria-live="off"></div>
    <div class="world-voxel-toolbar">
      <button class="world-voxel-button" type="button" data-voxel-action="reset" aria-label="К точке появления" title="К точке появления (R)">${icon('crosshair', 'icon--xs')}<span>Появление</span></button>
      <button class="world-voxel-button" type="button" data-voxel-action="cut" aria-label="Разрез" title="Разрез: показать стены пещер (X)">${icon('layers', 'icon--xs')}<span>Разрез</span></button>
      <button class="world-voxel-button" type="button" data-voxel-action="exit" aria-label="К карте" title="К карте (Esc)">${icon('map', 'icon--xs')}<span>К карте</span></button>
    </div>
    <p class="world-voxel-note" data-role="voxel-note"></p>`;
  host.append(root);

  const canvas = root.querySelector('[data-role="voxel-canvas"]');
  const hud = root.querySelector('[data-role="voxel-hud"]');
  const note = root.querySelector('[data-role="voxel-note"]');
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
    cutaway: false,
    hit: null,
    pointer: null,
    keys: new Set(),
    camera: { target: [0, 0, 0], yaw: 0.7, pitch: -0.5, dist: 120 },
    world: null,
    renderer: null,
    fallback: null,
    field: null,
    source: null,
    spawn: null,
    running: false,
  };

  view.dispose = () => {
    view.running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    for (const cleanup of cleanups.splice(0)) cleanup();
    view.world?.dispose();
    view.renderer?.dispose();
    root.remove();
  };

  /* Отказ до построения мира: показываем причину и оставляем рабочий dispose. */
  const stop = (message) => {
    view.error = message;
    setNote(message);
    hud.textContent = 'Мир не построен — данные карты недоступны.';
    return view;
  };

  /* ---------- снимок карт → поле ---------- */
  let source;
  try {
    source = readSource(frame?.contentWindow, { seed: config?.seed, width: config?.width, height: config?.height });
  } catch (error) {
    const message = error instanceof VoxelSourceError ? error.message : error?.message ?? String(error);
    return stop(`Воксельный мир: ${message}`);
  }
  setNote(`Снимаю карты: ${describeSource(source)}…`);
  const field = buildField(source, { profile: 2, detail: 1 });
  view.field = field;
  view.source = source;
  const spawn = spawnPoint(field);
  view.spawn = spawn;
  const period = tilePeriodChunks(field);

  /* ---------- рендерер или запас ---------- */
  let renderer = null;
  try {
    renderer = createRenderer(canvas, {});
  } catch (error) {
    renderer = null;
    view.fallback = createHeightmapFallback(canvas, field);
    setNote(`${error.message} — показан вид сверху по тому же полю. Нужен браузер с WebGL2.`);
  }
  view.renderer = renderer;

  /* Радиус обзора не должен превышать размер тайла: чанки за тайлом — те же
     самые чанки в зеркальном замощении, и просить их означало бы в четыре раза
     больше геометрии при той же картинке (на маленьких картах это видно). */
  const reviewRadius = clamp(
    Math.floor(Math.min(field.width, field.height) / (CHUNK_SX * 2)),
    2,
    7,
  );
  const world = createVoxelWorld(field, {
    radius: reviewRadius,
    upload: renderer ? (chunk, mesh) => uploadChunkMesh(renderer.gl, mesh) : null,
    release: renderer ? (handle) => handle.dispose() : null,
    mesh: { openOnly: true },
  });
  view.world = world;

  const focusSpawn = () => {
    view.camera.target = [spawn.x + 0.5, spawn.y + 6, spawn.z + 0.5];
    view.camera.dist = 120;
    view.camera.pitch = -0.5;
    world.focus(spawn.x, spawn.z);
  };
  focusSpawn();
  setNote(
    `Мир ${field.width} × ${field.height} колонок, повтор через ${period.x} × ${period.y} чанков. ` +
      'Перетаскивание — поворот, Shift+перетаскивание — сдвиг, колесо — зум, WASD — полёт.',
  );

  /* ---------- управление ---------- */
  const rotate = (dx, dy) => {
    view.camera.yaw -= dx * 0.006;
    view.camera.pitch = clamp(view.camera.pitch + dy * 0.006, -1.5, 0.3);
  };
  const dolly = (factor) => {
    view.camera.dist = clamp(view.camera.dist * factor, 14, 460);
  };
  /* Смещение точки, вокруг которой крутится камера, в мировых единицах
     (1 единица = 1 пиксель карты = 1 блок по горизонтали). */
  const pan = (right, forward, up) => {
    const { right: rx, forward: fx } = basis(view.camera.yaw, view.camera.pitch);
    const target = view.camera.target;
    target[0] += rx[0] * right + fx[0] * forward;
    target[2] += rx[2] * right + fx[2] * forward;
    target[1] = clamp(target[1] + up, 1, field.worldHeight + 160);
    world.focus(target[0], target[2]);
  };

  let drag = null;
  listen(canvas, 'pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    canvas.setPointerCapture?.(event.pointerId);
    drag = { x: event.clientX, y: event.clientY, pan: event.shiftKey || event.button === 1 };
    canvas.focus({ preventScroll: true });
  });
  listen(canvas, 'pointermove', (event) => {
    view.pointer = { x: event.clientX, y: event.clientY };
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (drag.pan) {
      const grab = (view.camera.dist / 120) * 0.6;
      pan(-dx * grab, -dy * grab, 0);
    }
    else rotate(dx, dy);
  });
  const endDrag = (event) => {
    drag = null;
    if (event?.pointerId !== undefined) canvas.releasePointerCapture?.(event.pointerId);
  };
  listen(canvas, 'pointerup', endDrag);
  listen(canvas, 'pointercancel', endDrag);
  listen(canvas, 'wheel', (event) => {
    event.preventDefault();
    dolly(event.deltaY > 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  const toggleCutaway = () => {
    view.cutaway = !view.cutaway;
    world.setMeshOptions({ openOnly: !view.cutaway });
    root.classList.toggle('is-cutaway', view.cutaway);
    root.querySelector('[data-voxel-action="cut"]')?.classList.toggle('is-on', view.cutaway);
  };

  listen(root, 'click', (event) => {
    const button = event.target.closest?.('[data-voxel-action]');
    if (!button) return;
    const { voxelAction } = button.dataset;
    if (voxelAction === 'reset') focusSpawn();
    else if (voxelAction === 'cut') toggleCutaway();
    else if (voxelAction === 'exit') onExit?.();
  });

  const editable = (node) => /^(INPUT|TEXTAREA|SELECT)$/.test(node?.tagName || '') || node?.isContentEditable;
  listen(window, 'keydown', (event) => {
    if (editable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === 'KeyR') {
      focusSpawn();
      return;
    }
    if (event.code === 'KeyX') {
      toggleCutaway();
      return;
    }
    if (!MOVE_KEYS.includes(event.code)) return;
    view.keys.add(event.code);
    event.preventDefault();
  });
  listen(window, 'keyup', (event) => view.keys.delete(event.code));
  listen(window, 'blur', () => view.keys.clear());

  /* ---------- цикл ---------- */
  const eye = [0, 0, 0];
  let last = performance.now();
  let hudAt = 0;
  let hudText = '';
  let noteCleared = false;
  let canvasSize = '';

  const sizeCanvas = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const signature = `${Math.round(rect.width)}×${Math.round(rect.height)}×${dpr}`;
    if (signature === canvasSize) return rect;
    canvasSize = signature;
    renderer.resize({ width: rect.width, height: rect.height, dpr });
    return rect;
  };

  const lookHit = (rect) => {
    if (!view.pointer || !rect.width || !rect.height) return null;
    const ndcX = ((view.pointer.x - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((view.pointer.y - rect.top) / rect.height) * 2 - 1);
    const tan = Math.tan(((FOV * Math.PI) / 180) / 2);
    const { forward, right, up } = basis(view.camera.yaw, view.camera.pitch);
    const dx = ndcX * tan * (rect.width / rect.height);
    const dy = ndcY * tan;
    const dir = [
      forward[0] + right[0] * dx + up[0] * dy,
      forward[1] + right[1] * dx + up[1] * dy,
      forward[2] + right[2] * dx + up[2] * dy,
    ];
    const length = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    return raycast(world, eye, [dir[0] / length, dir[1] / length, dir[2] / length], MAX_LOOK);
  };

  const tick = (now) => {
    if (!view.running) return;
    raf = requestAnimationFrame(tick);
    const dt = clamp((now - last) / 1000, 0, 0.1);
    last = now;

    const keys = view.keys;
    if (keys.size) {
      /* Скорость летит вместе с удалённостью камеры — иначе с орбиты в 400
         блоков WASD ползёт, а в 20 — вырывается. */
      const speed = 90 * dt * clamp(view.camera.dist / 120, 0.3, 4);
      let right = 0;
      let forward = 0;
      let up = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) right -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) right += 1;
      if (keys.has('Space')) up += 1;
      if (keys.has('KeyC')) up -= 1;
      if (keys.has('KeyQ')) rotate(-70 * dt * 60, 0);
      if (keys.has('KeyE')) rotate(70 * dt * 60, 0);
      if (right || forward || up) pan(right * speed, forward * speed, up * speed);
    }

    const gen = world.step(BUDGET_MS);
    world.remeshStep(2);

    const camera = view.camera;
    const { forward } = basis(camera.yaw, camera.pitch);
    eye[0] = camera.target[0] - forward[0] * camera.dist;
    eye[1] = camera.target[1] - forward[1] * camera.dist;
    eye[2] = camera.target[2] - forward[2] * camera.dist;

    let rect = null;
    if (renderer) {
      rect = sizeCanvas();
      const chunks = world.visible().map((record) => ({
        x0: record.chunk.x0,
        y0: 0,
        z0: record.chunk.z0,
        handle: record.handle,
      }));
      renderer.render({
        chunks,
        eye,
        yaw: camera.yaw,
        pitch: camera.pitch,
        fov: FOV,
        radius: world.radius * CHUNK_SX,
        time: now / 1000,
        sky: [[0.32, 0.53, 0.81], [0.7, 0.83, 0.93]],
        fog: [0.7, 0.83, 0.93],
        water: { tint: [0.82, 0.92, 1], alpha: 0.72 },
      });
    } else if (view.fallback) {
      view.fallback.draw(camera.target, Math.max(64, Math.round(camera.dist * 1.6)));
    }

    if (now - hudAt > 240) {
      hudAt = now;
      const stats = world.stats();
      const target = camera.target;
      const surface = surfaceY(field, Math.round(target[0]), Math.round(target[2]));
      view.hit = renderer ? lookHit(rect) : null;
      const bits = [
        `X ${Math.round(target[0])} · Z ${Math.round(target[2])} · Y ${Math.round(target[1])}`,
        `поверхность ${surface}`,
        `чанков ${stats.ready}${stats.queued ? ` + ${stats.queued} в очереди` : ''}`,
        `квадов ${stats.quads.toLocaleString('ru-RU')}`,
        `${(stats.bytes / 1024 / 1024).toFixed(1)} МиБ`,
        renderer ? `${stats.triangles.toLocaleString('ru-RU')} треуг. · ${gen.ms.toFixed(1)} мс` : 'вид сверху',
      ];
      if (view.hit) bits.push(`под курсором: ${blockName(view.hit.id)} ${view.hit.x}/${view.hit.y}/${view.hit.z}`);
      const text = bits.join(' · ');
      if (text !== hudText) {
        hudText = text;
        hud.textContent = text;
      }
      if (stats.ready > 0 && gen.done && !noteCleared) {
        noteCleared = true;
        setNote('');
      }
    }
  };

  view.running = true;
  raf = requestAnimationFrame(tick);
  return view;
};
