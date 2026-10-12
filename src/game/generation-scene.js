/* Сцена создания карты — основной визуал, пока Azgaar строит мир.

   Накладка поверх редактора в хосте карты (.world-editor). Это не декоративная
   анимация: каждый этап показывает то, что конвейер только что посчитал. Рельеф
   появляется после высот, воды — после рек и биомов, державы — после государств,
   поселения — после городов. Сцена только читает данные `grid` и `pack` из
   iframe и ничего в них не меняет.

   Производительность: слои запекаются в офскрин-холсты один раз, когда данные
   готовы (и заново только при изменении размера окна). Кадр лишь переставляет
   готовые слои, рисует реки и поселения путями Path2D. Кадры — не чаще 30 в
   секунду: генерация идёт в том же потоке, и каждый кадр отнимает у неё время. */

import { icon } from '../ui/icons.js';

/** Пять глав конвейера. Каждый шаг Azgaar относится к одной из них. */
export const GENERATION_CHAPTERS = [
  {
    label: 'Рельеф',
    steps: ['grid', 'heightmap', 'markupGrid', 'depressionLakes', 'nearSeaLakes', 'mapSize', 'temperatures', 'precipitation'],
  },
  {
    label: 'Воды',
    steps: ['clearPack', 'clearGraphOverride', 'regraph', 'markupPack', 'defaultRuler', 'rivers', 'biomes'],
  },
  {
    label: 'Жизнь',
    steps: ['featureGroups', 'ice', 'goods', 'rankCells', 'cultures', 'culturesExpand', 'burgs'],
  },
  {
    label: 'Державы',
    steps: ['states', 'routes', 'religions', 'burgsSpecify', 'stateStatistics', 'stateForms', 'provinces', 'provincePoles', 'riversSpecify'],
  },
  {
    label: 'Имена',
    steps: ['featureNames', 'markets', 'production', 'taxes', 'military', 'markers', 'zones', 'addedLabels', 'journeys'],
  },
];

const CHAPTER_OF_STEP = new Map(
  GENERATION_CHAPTERS.flatMap((chapter, index) => chapter.steps.map((step) => [step, index])),
);

/** Индекс главы для id шага конвейера; -1, если шаг неизвестен. */
export const chapterOfStep = (stepId) => CHAPTER_OF_STEP.get(stepId) ?? -1;

const FRAME_MS = 1000 / 20;
/* Подпись шага и счётчик обновляются не чаще, чем раз в это время: шаги
   идут быстрее, и каждое обновление панели — это перерисовка поверх iframe. */
const TEXT_EVERY_MS = 150;
/* Сколько длится проявление каждого слоя. Кадры идут только в это время. */
const LAYER_FADE_MS = { relief: 1000, biomes: 700, states: 800, rivers: 600, burgs: 1100 };
const LAND_HEIGHT = 20;
/* Ширина растворения края рельефа, в клетках сетки. */
const FEATHER_CELLS = 7;
const PANEL_FADE_MS = 700;
const FINISH_HOLD_MS = 900;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeOutBack = (t) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

/* Цвета рельефа: вода — от глубокой бирюзы к отмели, суша — от луговой зелени к
   скалам и снегу. Палитра лесной ночи из брендбука, без ярких тонов. */
const hexToRgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
const LAND_STOPS = [
  [0, '#33503a'],
  [0.3, '#5d6c46'],
  [0.55, '#8c8152'],
  [0.75, '#b3a57e'],
  [0.9, '#d6cfb8'],
  [1, '#f1ede3'],
].map(([at, hex]) => [at, hexToRgb(hex)]);
const SEA_STOPS = [
  [0, hexToRgb('#0c2226')],
  [1, hexToRgb('#2a5a5e')],
];

const mix = (a, b, t) => a.map((value, index) => value + (b[index] - value) * t);

const colorForHeight = (h) => {
  if (h < LAND_HEIGHT) return mix(SEA_STOPS[0][1], SEA_STOPS[1][1], clamp(h / LAND_HEIGHT, 0, 1));
  const t = clamp((h - LAND_HEIGHT) / (100 - LAND_HEIGHT), 0, 1);
  for (let k = 1; k < LAND_STOPS.length; k += 1) {
    const [at, rgb] = LAND_STOPS[k];
    if (t <= at) {
      const [prevAt, prevRgb] = LAND_STOPS[k - 1];
      return mix(prevRgb, rgb, (t - prevAt) / (at - prevAt));
    }
  }
  return LAND_STOPS[LAND_STOPS.length - 1][1];
};

/* Таблица цветов по высоте 0..100: один раз, а не на каждую клетку. */
const HEIGHT_LUT = Array.from({ length: 101 }, (_, h) => colorForHeight(h));

/** Запекает рельеф из сетки `grid`: по клетке — цвет высоты и светотень с северо-запада. */
const bakeRelief = (grid) => {
  const cols = grid.cellsX;
  const rows = grid.cellsY;
  const heights = grid.cells.h;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(cols, rows);
  const at = (x, y) => heights[clamp(y, 0, rows - 1) * cols + clamp(x, 0, cols - 1)];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const h = heights[y * cols + x];
      const slope = (at(x + 1, y) - at(x - 1, y)) + (at(x, y + 1) - at(x, y - 1));
      const shade = clamp(1 - slope * 0.009, 0.8, 1.16);
      const rgb = HEIGHT_LUT[clamp(Math.round(h), 0, 100)];
      const p = (y * cols + x) * 4;
      // Край сетки растворяется в фоне, а не обрывается прямоугольником.
      const edge = clamp(Math.min(x, cols - 1 - x, y, rows - 1 - y) / FEATHER_CELLS, 0, 1);
      image.data[p] = clamp(rgb[0] * shade, 0, 255);
      image.data[p + 1] = clamp(rgb[1] * shade, 0, 255);
      image.data[p + 2] = clamp(rgb[2] * shade, 0, 255);
      image.data[p + 3] = Math.round(255 * edge * edge * (3 - 2 * edge));
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
};

/** Пути клеток `pack`, сгруппированные по цвету (в координатах карты). */
const groupCellPaths = (pack, include, colorOf) => {
  const groups = new Map();
  const { v: cellVertices } = pack.cells;
  const points = pack.vertices.p;
  for (const i of pack.cells.i) {
    if (!include(i)) continue;
    const key = colorOf(i);
    if (key == null) continue;
    let group = groups.get(key);
    if (!group) {
      group = { color: key, path: new Path2D() };
      groups.set(key, group);
    }
    const ring = cellVertices[i];
    if (!ring || ring.length < 3) continue;
    const [x0, y0] = points[ring[0]];
    group.path.moveTo(x0, y0);
    for (let k = 1; k < ring.length; k += 1) {
      const [x, y] = points[ring[k]];
      group.path.lineTo(x, y);
    }
    group.path.closePath();
  }
  return [...groups.values()];
};

/** Общие рёбра между соседними клетками разных государств — границы. */
const stateBorderPath = (pack) => {
  const path = new Path2D();
  const points = pack.vertices.p;
  const { v: cellVertices, c: neighbors, state } = pack.cells;
  for (const i of pack.cells.i) {
    if (!state[i]) continue;
    for (const n of neighbors[i] || []) {
      if (n <= i || state[n] === state[i]) continue;
      const mine = cellVertices[i] || [];
      const theirs = cellVertices[n] || [];
      const shared = mine.filter((vertex) => theirs.includes(vertex));
      if (shared.length !== 2) continue;
      const [ax, ay] = points[shared[0]];
      const [bx, by] = points[shared[1]];
      path.moveTo(ax, ay);
      path.lineTo(bx, by);
    }
  }
  return path;
};

/** Путь реки по клеткам `pack.rivers[k].cells` и её относительная толщина. */
const riverPaths = (pack) => {
  const rivers = [];
  for (const river of pack.rivers || []) {
    const cells = river.cells || [];
    if (cells.length < 2) continue;
    const path = new Path2D();
    const [x0, y0] = pack.cells.p[cells[0]];
    path.moveTo(x0, y0);
    for (let k = 1; k < cells.length; k += 1) {
      const [x, y] = pack.cells.p[cells[k]];
      path.lineTo(x, y);
    }
    const width = clamp(0.35 + Math.log10(1 + (river.discharge || 1)) * 0.3, 0.45, 2.2);
    rivers.push({ path, width });
  }
  return rivers;
};

/** Поселения (без удалённых) с координатами и флагом столицы. */
const burgPoints = (pack) =>
  (pack.burgs || [])
    .filter((burg) => burg && burg.i && !burg.removed && Number.isFinite(burg.x) && Number.isFinite(burg.y))
    .map((burg) => ({ x: burg.x, y: burg.y, capital: Boolean(burg.capital) }));

/* Разметка панели. Текст шагов — из `event.label`, заголовки глав — из
   GENERATION_CHAPTERS, так что подписи совпадают с конвейером. */
const sceneMarkup = () => `
  <canvas class="world-gen-scene__canvas" aria-hidden="true"></canvas>
  <div class="world-gen-scene__shade" aria-hidden="true"></div>
  <div class="world-gen-scene__top">
    <span class="world-gen-scene__sigil" aria-hidden="true">${icon('sigil')}</span>
    <span class="world-gen-scene__brand">The civilization of the sages</span>
  </div>
  <div class="world-gen-scene__panel">
    <p class="world-gen-scene__eyebrow">Создание карты</p>
    <h2 class="world-gen-scene__chapter">Подготовка</h2>
    <p class="world-gen-scene__step">Запуск редактора</p>
    <ol class="world-gen-scene__chapters">
      ${GENERATION_CHAPTERS.map((chapter) => `<li>${chapter.label}</li>`).join('')}
    </ol>
    <div class="world-gen-scene__track" aria-hidden="true"><i class="world-gen-scene__fill"></i></div>
    <p class="world-gen-scene__count"></p>
  </div>`;

/**
 * Монтирует сцену поверх `frame` в его хосте и возвращает управление ею.
 * Методы: start(event), step(event), finish(), dispose().
 */
export const mountGenerationScene = (frame) => {
  const host = frame.parentElement;
  if (!host) return null;

  const root = document.createElement('div');
  root.className = 'world-gen-scene';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = sceneMarkup();
  host.append(root);

  const canvas = root.querySelector('.world-gen-scene__canvas');
  const ctx = canvas.getContext?.('2d');
  if (!ctx) {
    // Среда без 2D-холста: сцену не показываем, генерация идёт как обычно.
    root.remove();
    return null;
  }
  const chapterTitle = root.querySelector('.world-gen-scene__chapter');
  const stepText = root.querySelector('.world-gen-scene__step');
  const countText = root.querySelector('.world-gen-scene__count');
  const fill = root.querySelector('.world-gen-scene__fill');
  const chapterItems = [...root.querySelectorAll('.world-gen-scene__chapters li')];
  const sigil = root.querySelector('.world-gen-scene__sigil');

  const state = {
    total: 0,
    chapter: -1,
    lastTextAt: 0,
    phase: 'boot',
    width: 0,
    height: 0,
    dpr: 1,
    k: 1,
    ox: 0,
    oy: 0,
    mapW: 1280,
    mapH: 800,
    layers: {},
    raf: 0,
    lastFrame: 0,
    disposed: false,
    timers: new Set(),
  };
  const now = () => performance.now();

  /* Раскладка карты в холсте: сверху место под печать, снизу — под панель. */
  const layoutMap = () => {
    const region = {
      x: state.width * 0.06,
      y: state.height * 0.16,
      w: state.width * 0.88,
      h: state.height * 0.56,
    };
    const scale = Math.min(region.w / state.mapW, region.h / state.mapH);
    state.k = scale * state.dpr;
    state.ox = (region.x + (region.w - state.mapW * scale) / 2) * state.dpr;
    state.oy = (region.y + (region.h - state.mapH * scale) / 2) * state.dpr;
  };

  const resize = () => {
    const rect = root.getBoundingClientRect();
    state.width = Math.max(1, rect.width);
    state.height = Math.max(1, rect.height);
    state.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    layoutMap();
    // Запечённые слои зависят от масштаба: пересобираем их из сохранённых данных.
    for (const layer of Object.values(state.layers)) layer.rebake?.();
  };

  /* Размер в экранных пикселях CSS -> единицы карты при текущем масштабе. */
  const pxToMap = (px) => (px * state.dpr) / state.k;

  /* Запечённый слой: группы заливок и обводок в координатах карты. Холст
     пересобирается при смене размера окна, а данные для этого хранятся тут же. */
  const makeBakedLayer = (groups) => {
    const layer = {
      t0: now(),
      canvas: null,
      rebake() {
        const canvasLayer = document.createElement('canvas');
        canvasLayer.width = Math.max(1, Math.round(state.mapW * state.k));
        canvasLayer.height = Math.max(1, Math.round(state.mapH * state.k));
        const c = canvasLayer.getContext('2d');
        c.setTransform(state.k, 0, 0, state.k, 0, 0);
        for (const group of groups) {
          c.globalAlpha = group.alpha ?? 1;
          if (group.stroke) {
            c.strokeStyle = group.color;
            c.lineWidth = pxToMap(group.widthPx ?? 1);
            c.stroke(group.path);
          } else {
            c.fillStyle = group.color;
            c.fill(group.path);
          }
        }
        layer.canvas = canvasLayer;
      },
    };
    layer.rebake();
    return layer;
  };

  const progressOf = (layer, duration) => {
    if (!layer || !layer.t0) return 0;
    return clamp((now() - layer.t0) / duration, 0, 1);
  };

  /* Размер карты берём из настроек Azgaar; до старта конвейера он неизвестен. */
  const readMapSize = () => {
    const graph = frame.contentWindow?.options?.map?.graph;
    if (graph?.width && graph?.height) {
      state.mapW = graph.width;
      state.mapH = graph.height;
    }
    layoutMap();
    for (const layer of Object.values(state.layers)) layer.rebake?.();
  };

  /* Данные появляются вместе с завершением шага. Каждый обработчик читает уже
     готовые `grid`/`pack` и ничего в них не пишет. */
  const onStepDone = (stepId) => {
    const win = frame.contentWindow;
    if (!win) return;
    const { grid, pack } = win;
    try {
      if (stepId === 'heightmap' && grid?.cells?.h && grid.cellsX && grid.cellsY) {
        state.layers.relief = { t0: now(), canvas: bakeRelief(grid) };
      } else if (stepId === 'biomes' && pack?.cells?.biome && pack.biomes) {
        const biomes = pack.biomes;
        const groups = groupCellPaths(
          pack,
          (i) => pack.cells.h[i] >= LAND_HEIGHT,
          (i) => biomes[pack.cells.biome[i]]?.color ?? null,
        ).map((group) => ({ ...group, alpha: 0.5 }));
        state.layers.biomes = makeBakedLayer(groups);
      } else if (stepId === 'states' && pack?.cells?.state && pack.states) {
        const colorOf = (i) => pack.states[pack.cells.state[i]]?.color ?? null;
        const groups = groupCellPaths(pack, (i) => pack.cells.state[i] > 0, colorOf).map((group) => ({ ...group, alpha: 0.4 }));
        groups.push({ path: stateBorderPath(pack), color: '#d8c184', stroke: true, widthPx: 0.9, alpha: 0.5 });
        state.layers.states = makeBakedLayer(groups);
      } else if (stepId === 'rivers' && pack?.rivers) {
        state.layers.rivers = { t0: now(), rivers: riverPaths(pack) };
      } else if (stepId === 'burgs' && pack?.burgs) {
        state.layers.burgs = { t0: now(), burgs: burgPoints(pack) };
      }
    } catch (error) {
      // Визуал не должен ломать генерацию: данные карты уже посчитаны.
      console.warn('[MIR] Сцена генерации пропустила слой:', error);
    }
    kick();
  };

  /* Кадр: слои в порядке наслоения. */
  const draw = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { k, ox, oy, mapW, mapH } = state;
    ctx.setTransform(k, 0, 0, k, ox, oy);

    const relief = state.layers.relief;
    if (relief) {
      const p = progressOf(relief, LAYER_FADE_MS.relief);
      if (p > 0) {
        const radius = easeOut(p) * Math.hypot(mapW, mapH) * 0.62;
        ctx.save();
        ctx.beginPath();
        ctx.arc(mapW / 2, mapH / 2, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(relief.canvas, 0, 0, mapW, mapH);
        ctx.restore();
      }
    }

    for (const name of ['biomes', 'states']) {
      const layer = state.layers[name];
      if (!layer?.canvas) continue;
      const p = progressOf(layer, LAYER_FADE_MS[name]);
      if (p <= 0) continue;
      ctx.save();
      ctx.globalAlpha = easeOut(p);
      ctx.drawImage(layer.canvas, 0, 0, mapW, mapH);
      ctx.restore();
    }

    const rivers = state.layers.rivers;
    if (rivers) {
      const p = progressOf(rivers, LAYER_FADE_MS.rivers);
      if (p > 0) {
        ctx.save();
        ctx.globalAlpha = 0.9 * easeOut(p);
        ctx.strokeStyle = '#7fc4c8';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([pxToMap(4), pxToMap(9)]);
        for (const river of rivers.rivers) {
          ctx.lineWidth = pxToMap(river.width);
          ctx.stroke(river.path);
        }
        ctx.restore();
      }
    }

    const burgs = state.layers.burgs;
    if (burgs) {
      const count = burgs.burgs.length || 1;
      ctx.save();
      burgs.burgs.forEach((burg, index) => {
        const local = clamp((now() - (burgs.t0 + (index / count) * 650)) / 420, 0, 1);
        if (local <= 0) return;
        const radius = pxToMap((burg.capital ? 4.6 : 2.8) * easeOutBack(local));
        ctx.globalAlpha = clamp(local * 1.4, 0, 1);
        ctx.fillStyle = burg.capital ? '#d8c184' : '#c2d9c9';
        ctx.beginPath();
        ctx.arc(burg.x, burg.y, radius, 0, Math.PI * 2);
        ctx.fill();
        if (burg.capital) {
          ctx.strokeStyle = 'rgba(216, 193, 132, 0.55)';
          ctx.lineWidth = pxToMap(1);
          ctx.beginPath();
          ctx.arc(burg.x, burg.y, radius * 1.9, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
      ctx.restore();
    }
  };

  /* Кадры нужны только пока какой-то слой проявляется. Между шагами холст не
     перерисовывается, поэтому его стоимость не растёт вместе с длительностью
     генерации. Цикл останавливается, как только все проявления закончились. */
  const isAnimating = () => {
    const at = now();
    return Object.entries(state.layers).some(([name, layer]) => layer.t0 && at < layer.t0 + LAYER_FADE_MS[name]);
  };

  const kick = () => {
    if (state.raf || state.disposed) return;
    state.raf = requestAnimationFrame(loop);
  };

  function loop(time) {
    state.raf = 0;
    if (state.disposed) return;
    if (!root.isConnected) {
      dispose();
      return;
    }
    if (time - state.lastFrame < FRAME_MS) {
      kick();
      return;
    }
    state.lastFrame = time;
    // Последний кадр рисуем уже после конца проявления: финальное состояние точное.
    const more = isAnimating();
    draw();
    if (more) kick();
  }

  const setChapter = (index) => {
    if (index < 0 || index === state.chapter) return;
    state.chapter = index;
    chapterTitle.textContent = GENERATION_CHAPTERS[index].label;
    chapterItems.forEach((item, at) => {
      item.classList.toggle('is-done', at < index);
      item.classList.toggle('is-current', at === index);
    });
    // Перезапуск короткого импульса печати у заголовка главы.
    chapterTitle.classList.remove('is-entering');
    void chapterTitle.offsetWidth;
    chapterTitle.classList.add('is-entering');
  };

  const setProgress = (done, total) => {
    const ratio = total ? clamp(done / total, 0, 1) : 0;
    fill.style.transform = `scaleX(${ratio})`;
    countText.textContent = total ? `${done} / ${total}` : '';
  };

  /* Таймеры, которые сцена должна отменить при удалении. */
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      state.timers.delete(id);
      fn();
    }, ms);
    state.timers.add(id);
    return id;
  };

  function dispose() {
    if (state.disposed) return;
    state.disposed = true;
    cancelAnimationFrame(state.raf);
    ro?.disconnect();
    window.removeEventListener('resize', onResize);
    for (const id of state.timers) clearTimeout(id);
    state.timers.clear();
    root.remove();
    state.layers = {};
  }

  const onResize = () => {
    if (!state.disposed) {
      resize();
      kick();
    }
  };
  // ResizeObserver есть во всех поддерживаемых браузерах; без него — событие окна.
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
  if (!ro) window.addEventListener('resize', onResize);

  /* Пошаговые данные: `step` приходит ДО запуска шага, значит предыдущий шаг уже
     закончен и его слой можно показать. */
  let previousStepId = null;

  ro?.observe(root);

  const controller = {
    start(event) {
      readMapSize();
      state.total = event.total || 0;
      state.phase = 'run';
      chapterTitle.textContent = GENERATION_CHAPTERS[0].label;
      setChapter(0);
      stepText.textContent = 'Подготовка рельефа';
      setProgress(0, state.total);
    },
    step(event) {
      if (state.disposed) return;
      if (previousStepId != null) onStepDone(previousStepId);
      previousStepId = event.id;
      const chapter = chapterOfStep(event.id);
      const changed = chapter >= 0 && chapter !== state.chapter;
      if (changed) setChapter(chapter);
      const at = now();
      if (!changed && at - state.lastTextAt < TEXT_EVERY_MS) return;
      state.lastTextAt = at;
      stepText.textContent = event.label || '';
      setProgress(event.index, state.total || event.total || 0);
    },
    finish() {
      if (state.disposed) return;
      if (previousStepId != null) onStepDone(previousStepId);
      previousStepId = null;
      state.phase = 'done';
      setChapter(GENERATION_CHAPTERS.length - 1);
      chapterItems.forEach((item) => {
        item.classList.add('is-done');
        item.classList.remove('is-current');
      });
      chapterTitle.textContent = 'Карта готова';
      stepText.textContent = 'Мир создан';
      setProgress(state.total, state.total);
      sigil?.classList.add('is-done');
      root.classList.add('is-finished');
      later(() => {
        root.classList.add('is-leaving');
        later(dispose, PANEL_FADE_MS + 120);
      }, FINISH_HOLD_MS);
    },
    dispose,
  };

  resize();
  return controller;
};
