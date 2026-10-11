/* Тайлы кадра: готовим картинку и держим её в кэше.

   Пирамида высот считает «сырьё», раскраска превращает его в пиксели, а этот
   модуль отвечает за очередь: кадр не ждёт, пока посчитается всё, а показывает
   то, что есть.

   Правила простые:

     • **Сначала грубое, потом детальное.** В очереди приоритет у уровня: родитель
       всегда раньше ребёнка. Пока считается детальный тайл, на его месте нарисован
       родитель, растянутый вдвое — как в спутниковых картах, где при приближении
       картинка сначала расплывается, потом проясняется.
     • **Бюджет кадра.** За один кадр строится столько тайлов, сколько уложилось
       в отведённые миллисекунды; остальное дождётся следующего. Интерфейс не
       замирает ни на глубоком зуме, ни на обзорном.
     • **Реки — вторым проходом.** Область гидрологии весит область стока
       (десятки-сотни миллисекунд), и строить её в том же кадре, что и рельеф,
       значит потерять плавность. Тайл сначала рисуется без рек, а реки
       дорисовываются, когда очередь пуста.

   Кэш хранит готовые `ImageData` (256 КБ на тайл) и сбрасывается при смене слоя
   или настроек: пиксели слоя дешевле пересчитать, чем хранить двадцать вариантов
   одного и того же квадрата земли. */

import { levelPixels, levelTiles, mppAt, TILE } from './scale.js';
import { LAYERS, paintTile } from './paint.js';

/** Сколько миллисекунд в кадре можно тратить на постройку тайлов. */
export const FRAME_BUDGET_MS = 10;
/** Сколько тайлов в кэше: 256 КБ каждый, 240 штук — около 60 МБ. */
const CACHE_LIMIT = 240;
/** Предел на дорисовку рек: область стока считается целиком, её не разбить. */
const RIVER_BUDGET_MS = 60;

const key = (level, tx, ty) => `${level}:${tx}:${ty}`;

/**
 * Кэш картинок и очередь постройки.
 *
 * @param {object} deps — planet, elevation, climate, hydro
 */
export const createTiles = ({ planet, elevation, climate, hydro }) => {
  const cache = new Map(); // key → { image: ImageData, rivers: boolean }
  const queue = new Map(); // key → приоритет (меньше — раньше)
  const riverQueue = new Set();
  let layer = LAYERS[0];
  let options = { shading: true, rivers: true, graticule: true };
  let center = { x: planet.widthM / 2, y: planet.heightM / 2 };

  const reset = () => {
    cache.clear();
    queue.clear();
    riverQueue.clear();
  };

  /** Есть ли под этим прямоугольником области стока, или их придётся считать. */
  const riversReady = (level, tx, ty) => {
    if (!options.rivers) return true;
    const mpp = mppAt(planet, level);
    return hydro.hasRegions(mpp, tx * TILE * mpp, ty * TILE * mpp, (tx + 1) * TILE * mpp, (ty + 1) * TILE * mpp);
  };

  const paint = (level, tx, ty, withRivers) => {
    const image = new ImageData(TILE, TILE);
    const frame = image.data;
    paintTile(frame, TILE, TILE, 0, 0, { level, tx, ty, elevation, climate, hydro }, layer, {
      ...options,
      rivers: withRivers,
    });
    return image;
  };

  /**
   * Построить один тайл. Возвращает запись кэша; при `withRivers === false`
   * тайл рисуется без рек и попадает в очередь дорисовки.
   */
  const build = (name, level, tx, ty, withRivers) => {
    const record = { image: paint(level, tx, ty, withRivers), rivers: withRivers };
    cache.set(name, record);
    if (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
    if (!withRivers) riverQueue.add(name);
    return record;
  };

  const parse = (name) => {
    const [level, tx, ty] = name.split(':').map(Number);
    return { level, tx, ty };
  };

  /** Приоритет: сначала грубые уровни, потом ближние к центру кадра. */
  const priority = (level, tx, ty) => {
    const mpp = mppAt(planet, level);
    const dx = (tx + 0.5) * TILE * mpp - center.x;
    const dy = (ty + 0.5) * TILE * mpp - center.y;
    return level * 1e6 + Math.hypot(dx, dy) / mpp / 256;
  };

  return {
    planet,
    get layer() {
      return layer;
    },
    get options() {
      return { ...options };
    },

    /** Слой: меняем — кэш картинок выбрасываем, очередь перестраиваем. */
    setLayer(id) {
      const next = LAYERS.find((entry) => entry.id === id) ?? LAYERS[0];
      if (next === layer) return;
      layer = next;
      reset();
    },

    setOptions(patch) {
      const next = { ...options, ...patch };
      if (next.shading === options.shading && next.rivers === options.rivers && next.graticule === options.graticule) return;
      options = next;
      reset();
      if (!next.rivers) riverQueue.clear();
    },

    /** Центр кадра — им задаётся порядок очереди. */
    setCenter(x, y) {
      center = { x, y };
    },

    /** Заказать тайл и все его предки: предки нужны, чтобы было что показать. */
    request(level, tx, ty, weight = 0) {
      for (let l = 0; l <= level; l += 1) {
        const px = tx >> (level - l);
        const py = ty >> (level - l);
        const name = key(l, px, py);
        if (cache.has(name)) continue;
        const value = priority(l, px, py) + weight;
        if (!queue.has(name) || queue.get(name) > value) queue.set(name, value);
      }
    },

    /** Есть ли готовая картинка ровно этого тайла (без подмены родителем). */
    has(level, tx, ty) {
      const name = key(level, tx, ty);
      const record = cache.get(name);
      return Boolean(record && (record.rivers || !options.rivers || !riversReady(level, tx, ty)));
    },

    /**
     * Лучшая готовая картинка для тайла: сам тайл или ближайший готовый предок.
     * Возвращает `{ image, scale }` — scale = во сколько раз растягивать.
     */
    best(level, tx, ty) {
      for (let back = 0; back <= level; back += 1) {
        const ax = tx >> back;
        const ay = ty >> back;
        const record = cache.get(key(level - back, ax, ay));
        if (record) return { image: record.image, scale: 2 ** back, tx: ax, ty: ay };
      }
      return null;
    },

    /** Сколько тайлов ждут постройки (для индикатора загрузки). */
    pending: () => queue.size + riverQueue.size,
    stats: () => ({
      cached: cache.size,
      queue: queue.size,
      rivers: riverQueue.size,
      bytes: cache.size * TILE * TILE * 4,
    }),

    /**
     * Построить сколько успеем за бюджет. Возвращает число построенных тайлов.
     */
    work(budgetMs = FRAME_BUDGET_MS) {
      const started = performance.now();
      let built = 0;
      /* Реки дорисовываются, только когда основной очереди нечего делать:
         иначе кадр, в котором появилась новая область стока, подвиснет. */
      if (!queue.size && riverQueue.size) {
        for (const name of [...riverQueue].slice(0, 1)) {
          const { level, tx, ty } = parse(name);
          riverQueue.delete(name);
          if (riversReady(level, tx, ty)) {
            build(name, level, tx, ty, true);
            built += 1;
          }
        }
        return built;
      }
      const sorted = [...queue.entries()].sort((a, b) => a[1] - b[1]);
      for (const [name] of sorted) {
        const { level, tx, ty } = parse(name);
        queue.delete(name);
        if (cache.has(name)) continue;
        const withRivers = !options.rivers || riversReady(level, tx, ty);
        build(name, level, tx, ty, withRivers);
        built += 1;
        if (performance.now() - started > budgetMs) break;
      }
      return built;
    },

    /**
     * Нарисовать кадр: для каждого видимого тайла — готовая картинка или
     * родитель, растянутый в нужное число раз.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} view — { level, centerX, centerY, width, height }
     * @param {HTMLCanvasElement} scratch — холст 256 × 256 для перекладки
     * @returns {object} сколько тайлов нарисовано и сколько подменено родителем
     */
    draw(ctx, view, scratch) {
      const { level, centerX, centerY, width, height } = view;
      const mpp = mppAt(planet, level);
      const tiles = levelTiles(planet, level);
      const pixels = levelPixels(planet, level);
      const left = centerX - (width / 2) * mpp;
      const top = centerY - (height / 2) * mpp;
      const tx0 = Math.floor(left / (TILE * mpp));
      const tx1 = Math.floor((left + width * mpp) / (TILE * mpp));
      const ty0 = Math.floor(top / (TILE * mpp));
      const ty1 = Math.floor((top + height * mpp) / (TILE * mpp));
      const scratchCtx = scratch.getContext('2d', { willReadFrequently: false });
      let drawn = 0;
      let fallback = 0;
      for (let ty = ty0; ty <= ty1; ty += 1) {
        for (let tx = tx0; tx <= tx1; tx += 1) {
          /* Мир не замкнут: тайлы за рамкой карты не повторяются с другого
             края, их вовсе нет. Кадр, выехавший за рамку, показывает фон. */
          if (ty < 0 || ty >= tiles.ty || tx < 0 || tx >= tiles.tx) continue;
          const found = this.best(level, tx, ty);
          if (!found) {
            this.request(level, tx, ty);
            continue;
          }
          const dx = (tx * TILE * mpp - left) / mpp;
          const dy = (ty * TILE * mpp - top) / mpp;
          /* Обрезаем по краю мира: за полюсом пикселей нет. Граница считается
             в пикселях того уровня, откуда взята картинка, поэтому тайл
             берётся номером предка, а не номером кадра. */
          const visibleW = Math.min(TILE, pixels.w / found.scale - found.tx * TILE);
          if (visibleW <= 0) continue;
          const visibleH = Math.min(TILE, pixels.h / found.scale - found.ty * TILE);
          if (visibleH <= 0) continue;
          scratchCtx.putImageData(found.image, 0, 0);
          ctx.drawImage(
            scratch,
            0,
            0,
            visibleW,
            visibleH,
            Math.round(dx),
            Math.round(dy),
            visibleW * found.scale,
            visibleH * found.scale,
          );
          drawn += 1;
          if (found.scale > 1) fallback += 1;
        }
      }
      return { drawn, fallback };
    },
  };
};
