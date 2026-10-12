/* Вода планеты: сток, озёра, реки с шириной и меандрами.

   У Azgaar река — это клетки `pack.cells.r` и посчитанный накопленный сток
   `pack.cells.fl` плюс две функции: `Rivers.getOffset` (ширина по стоку и длине)
   и `Rivers.addMeandering` (меандры по руслу). Здесь то же самое, но решётка
   одна на всю планету, и посчитать её целиком нельзя: Земля километровыми
   клетками — это 800 миллионов клеток.

   Поэтому гидрология двухуровневая и масштабируемая:

     • **Грубая сеть** — уровень 0 пирамиды, вся планета целиком, около 12 тысяч
       клеток. Считается один раз на мир и отвечает за приток через границы
       детальных областей: без неё Амазонка на стыке областей каждый раз
       «начиналась бы заново» и река рассыпалась бы на куски разной ширины.
     • **Детальная область** — 256 × 256 клеток, уровень которых выбирается по
       масштабу кадра: на максимальном приближении клетка 1 км, на обзорном —
       настолько крупная, чтобы вся видимая площадь укладывалась в одну-четыре
       области. Область — ровно один тайл пирамиды, поэтому высоты берутся из
       уже готового кэша.

   Сток считается алгоритмом priority flood (Барнс, 2014): очередь от самых
   низких точек океана заливает сушу, попутно заполняя впадины — отсюда же
   озёра. Порядок выхода из очереди топологический (родитель всегда раньше
   ребёнка), поэтому сток накапливается одним проходом в обратном порядке, без
   повторной сортировки.

   Меандры — не геометрия, а поле: русло смещается по нормали на `A · noise(p/λ)`
   с λ и A, пропорциональными ширине реки. Смещение зависит только от координат
   мира, поэтому оно одинаково на любом приближении и на стыке областей.

   Перевод стока в расход: `Q = сток · площадь клетки · 0,942 м/год · 0,45 /
   3,156e7`, `ширина = 12√Q`. Калибровка по Амазонке: бассейн 6 млн км² даёт
   ≈120 тыс. м³/с и ≈4 км в устье. */

import { clamp, levelForMpp, levelPixels, mppAt } from './scale.js';
import { heightFromRaw, SEA_LEVEL } from './elevation.js';

/** Желаемая клетка детальной области на максимальном приближении: 1 км. */
export const FINE_M = 1024;
/** Сторона детальной области в клетках. */
export const REGION_N = 256;
/** Площадь водосбора, с которой вода собирается в русло: ≈8 км². */
const MIN_BASIN_M2 = 8_000_000;
/** Минимальная глубина впадины, которая считается озером (единицы шкалы). */
const LAKE_DEPTH = 0.15;
/** Ссылочные осадки для перевода стока в расход: 60 единиц Azgaar ≈ 942 мм. */
const REFERENCE_PREC_MM = 942;
const RUNOFF = 0.45;
const SECONDS_PER_YEAR = 3.156e7;

/** Расход из стока: м³/с. */
export const discharge = (flux, cellAreaM2) =>
  (flux * cellAreaM2 * (REFERENCE_PREC_MM / 1000) * RUNOFF) / SECONDS_PER_YEAR;

/** Ширина реки в метрах из расхода. */
export const riverWidth = (q) => 12 * Math.sqrt(Math.max(q, 0));

/** Минимальная ширина реки, которую стоит рисовать: не тоньше трети пикселя. */
export const visibleWidth = (mpp) => Math.max(mpp * 0.35, 5);

/* ---------- priority flood ---------- */

/** Двоичная куча: ключ — отметка уровня, значение — индекс клетки. */
const createHeap = (capacity) => {
  const keys = new Float64Array(capacity + 1);
  const values = new Int32Array(capacity + 1);
  /* Клетка попадает в очередь до восьми раз: каждый сосед может улучшить её
     отметку. Переполнение тихо теряло бы данные, поэтому ёмкость — на все
     восемь, а не «с небольшим запасом». */
  const limit = capacity * 8 + 8;
  const big = new Float64Array(limit);
  const bigValues = new Int32Array(limit);
  let size = 0;
  return {
    get size() {
      return size;
    },
    push(key, value) {
      if (size + 1 >= limit) return;
      big[++size] = key;
      bigValues[size] = value;
      let i = size;
      while (i > 1) {
        const parent = i >> 1;
        if (big[parent] <= big[i]) break;
        const kk = big[parent];
        big[parent] = big[i];
        big[i] = kk;
        const vv = bigValues[parent];
        bigValues[parent] = bigValues[i];
        bigValues[i] = vv;
        i = parent;
      }
    },
    pop() {
      const top = bigValues[1];
      big[1] = big[size];
      bigValues[1] = bigValues[size];
      size -= 1;
      let i = 1;
      for (;;) {
        const left = i << 1;
        if (left > size) break;
        const right = left + 1;
        let next = left;
        if (right <= size && big[right] < big[left]) next = right;
        if (big[i] <= big[next]) break;
        const kk = big[next];
        big[next] = big[i];
        big[i] = kk;
        const vv = bigValues[next];
        bigValues[next] = bigValues[i];
        bigValues[i] = vv;
        i = next;
      }
      keys[0] = top;
      return top;
    },
  };
};

/**
 * Заливка Барнса: куда течёт каждая клетка и где впадины.
 *
 * @returns {number} сколько клеток вышло из очереди
 */
const routeCells = ({ width, height, elevation, parent, resolved, lake, isOutlet, order, mask }) => {
  const count = width * height;
  const heap = createHeap(count);
  const done = new Uint8Array(count);

  for (let i = 0; i < count; i += 1) {
    resolved[i] = elevation[i];
    parent[i] = -1;
    /* Клетки вне планеты не существуют: по долготе мир замкнут, а по широте
       область на грубом уровне может выйти за полюс. */
    if ((mask && !mask[i]) || !isOutlet(i)) continue;
    heap.push(resolved[i], i);
  }

  let orderAt = 0;
  let guard = 0;
  while (heap.size && guard < count * 10) {
    guard += 1;
    const cell = heap.pop();
    if (done[cell]) continue;
    done[cell] = 1;
    order[orderAt] = cell;
    orderAt += 1;
    const x = cell % width;
    const y = (cell / width) | 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = (x + dx + width) % width; // мир замкнут по долготе
        const index = ny * width + nx;
        if (done[index] || (mask && !mask[index])) continue;
        /* Впадины заливаются: вода стоит на отметке стока, а не дна. */
        const level = Math.max(elevation[index], resolved[cell]);
        if (parent[index] === -1 || level < resolved[index]) {
          resolved[index] = level;
          parent[index] = cell;
          heap.push(level, index);
        }
      }
    }
  }

  for (let i = 0; i < count; i += 1) {
    if (mask && !mask[i]) {
      lake[i] = 0;
      continue;
    }
    lake[i] = Math.max(resolved[i] - elevation[i], 0);
  }
  return orderAt;
};

/* ---------- гидрология ---------- */

export const createHydro = (planet, elevation, climate, { regions: regionLimit = 8 } = {}) => {
  /* Грубая сеть: уровень 0 пирамиды, вся планета. */
  const coarseLevel = 0;
  const coarseM = mppAt(planet, coarseLevel);
  const gw = Math.max(2, Math.ceil(planet.widthM / coarseM));
  const gh = Math.max(2, Math.ceil(planet.heightM / coarseM));
  const coarseCount = gw * gh;

  const coarseHeight = new Float32Array(coarseCount);
  const coarseParent = new Int32Array(coarseCount);
  const coarseResolved = new Float32Array(coarseCount);
  const coarseLake = new Float32Array(coarseCount);
  const coarseFlux = new Float32Array(coarseCount);
  const coarseOrder = new Int32Array(coarseCount);
  const coarsePrec = new Float32Array(coarseCount);
  let coarseReady = false;

  const solveCoarse = () => {
    if (coarseReady) return;
    for (let gy = 0; gy < gh; gy += 1) {
      for (let gx = 0; gx < gw; gx += 1) {
        const index = gy * gw + gx;
        coarseHeight[index] = heightFromRaw(elevation.rawPixel(coarseLevel, gx, gy));
        coarsePrec[index] = clamp(
          climate.approximatePrec((gx + 0.5) * coarseM, (gy + 0.5) * coarseM, coarseLevel) / 60,
          0.08,
          4,
        );
      }
    }
    const filled = routeCells({
      width: gw,
      height: gh,
      elevation: coarseHeight,
      parent: coarseParent,
      resolved: coarseResolved,
      lake: coarseLake,
      order: coarseOrder,
      isOutlet: (i) => coarseHeight[i] < SEA_LEVEL,
    });
    coarseFlux.fill(0);
    for (let i = filled - 1; i >= 0; i -= 1) {
      const cell = coarseOrder[i];
      const flux = coarseFlux[cell] + coarsePrec[cell];
      coarseFlux[cell] = flux;
      const to = coarseParent[cell];
      if (to >= 0) coarseFlux[to] += flux;
    }
    coarseReady = true;
  };

  /* ---------- детальные области ---------- */

  const regions = new Map();

  /**
   * Уровень пирамиды, на котором считается сток для кадра с разрешением mpp:
   * клетка не мельче километра и не мельче восьмой доли пикселя, иначе область
   * покрывает меньше кадра и областей приходится строить десятки.
   */
  const levelForView = (mpp) => levelForMpp(planet, Math.max(FINE_M * planet.size, mpp * 8));

  const buildRegion = (level, rx, ry) => {
    solveCoarse();
    const mpp = mppAt(planet, level);
    const cell = mpp;
    const count = REGION_N * REGION_N;
    const originX = rx * REGION_N;
    const originY = ry * REGION_N;
    const height = new Float32Array(count);
    const weight = new Float32Array(count);
    /* Маска существования: по долготе мир замкнут, по широте область может
       выйти за полюс — такие клетки не маршрутизируются и не считаются. */
    const pixels = levelPixels(planet, level);
    const mask = new Uint8Array(count);
    for (let y = 0; y < REGION_N; y += 1) {
      const row = originY + y >= 0 && originY + y < pixels.h ? 1 : 0;
      for (let x = 0; x < REGION_N; x += 1) mask[y * REGION_N + x] = row;
    }

    /* Осадки меняются плавно, поэтому вес считается на сетке 32 × 32: 65 тысяч
       оценок климата на область — это секунды, тысяча — незаметно. */
    const WEIGHT_SUB = 32;
    const step = REGION_N / WEIGHT_SUB;
    const weightGrid = new Float32Array(WEIGHT_SUB * WEIGHT_SUB);
    for (let sy = 0; sy < WEIGHT_SUB; sy += 1) {
      for (let sx = 0; sx < WEIGHT_SUB; sx += 1) {
        const mx = (originX + (sx + 0.5) * step) * mpp;
        const my = (originY + (sy + 0.5) * step) * mpp;
        weightGrid[sy * WEIGHT_SUB + sx] = clamp(climate.approximatePrec(mx, my, level) / 60, 0.08, 4);
      }
    }

    for (let y = 0; y < REGION_N; y += 1) {
      const fy = clamp((y + 0.5) / step - 0.5, 0, WEIGHT_SUB - 1);
      const y0 = Math.floor(fy);
      const y1 = Math.min(y0 + 1, WEIGHT_SUB - 1);
      const wy = fy - y0;
      for (let x = 0; x < REGION_N; x += 1) {
        const index = y * REGION_N + x;
        if (!mask[index]) {
          height[index] = 0;
          continue;
        }
        height[index] = heightFromRaw(elevation.rawPixel(level, originX + x, originY + y));
        const fx = clamp((x + 0.5) / step - 0.5, 0, WEIGHT_SUB - 1);
        const x0 = Math.floor(fx);
        const x1 = Math.min(x0 + 1, WEIGHT_SUB - 1);
        const wx = fx - x0;
        const top = weightGrid[y0 * WEIGHT_SUB + x0] + (weightGrid[y0 * WEIGHT_SUB + x1] - weightGrid[y0 * WEIGHT_SUB + x0]) * wx;
        const bottom = weightGrid[y1 * WEIGHT_SUB + x0] + (weightGrid[y1 * WEIGHT_SUB + x1] - weightGrid[y1 * WEIGHT_SUB + x0]) * wx;
        weight[index] = top + (bottom - top) * wy;
      }
    }

    const parent = new Int32Array(count);
    const resolved = new Float32Array(count);
    const lake = new Float32Array(count);
    const order = new Int32Array(count);
    const flux = new Float32Array(count);

    /* Приток извне. Граничная клетка получает сток той клетки грубой сети,
       которая в неё впадает снаружи области: сток грубой клетки переводится в
       детальные (отношение площадей) и делится на число граничных клеток на
       этой стороне (отношение линейных размеров). */
    const inflow = new Float32Array(count);
    const ratio = coarseM / cell; // сколько детальных клеток на одну грубую
    const addInflow = (x, y, dx, dy) => {
      const cgx = Math.floor((originX + x) / ratio);
      const cgy = Math.floor((originY + y) / ratio);
      const nx = cgx + dx;
      const ny = cgy + dy;
      if (ny < 0 || ny >= gh) return;
      const nIndex = (((ny % gh) + gh) % gh) * gw + (((nx % gw) + gw) % gw);
      const cIndex = cgy * gw + cgx;
      if (coarseParent[nIndex] === cIndex) inflow[y * REGION_N + x] += coarseFlux[nIndex] * ratio;
    };
    if (ratio >= 1) {
      for (let x = 0; x < REGION_N; x += 1) {
        addInflow(x, 0, 0, -1);
        addInflow(x, REGION_N - 1, 0, 1);
      }
      for (let y = 0; y < REGION_N; y += 1) {
        addInflow(0, y, -1, 0);
        addInflow(REGION_N - 1, y, 1, 0);
      }
    }

    /* Заливка начинается с моря и с рамки области. Только моря мало: область
       в глубине материка не содержит ни одной морской клетки, и без рамки
       очередь осталась бы пустой — сток был бы нулевым на всей суше. */
    const filled = routeCells({
      width: REGION_N,
      height: REGION_N,
      elevation: height,
      parent,
      resolved,
      lake,
      order,
      mask,
      isOutlet: (i) => {
        if (height[i] < SEA_LEVEL) return true;
        const x = i % REGION_N;
        const y = (i / REGION_N) | 0;
        return x === 0 || y === 0 || x === REGION_N - 1 || y === REGION_N - 1;
      },
    });

    for (let i = 0; i < count; i += 1) flux[i] = inflow[i];
    for (let i = filled - 1; i >= 0; i -= 1) {
      const cellIndex = order[i];
      const value = flux[cellIndex] + weight[cellIndex];
      flux[cellIndex] = value;
      const to = parent[cellIndex];
      if (to >= 0) flux[to] += value;
    }

    /* Сегменты рек: из центра клетки в центр той, куда течёт. */
    const cellArea = cell * cell;
    const minFlux = MIN_BASIN_M2 / cellArea;
    const segments = [];
    const lakeCells = [];
    let riverCells = 0;
    for (let y = 0; y < REGION_N; y += 1) {
      for (let x = 0; x < REGION_N; x += 1) {
        const index = y * REGION_N + x;
        /* Озеро — впадина, которую не удаётся слить: мельче двух-трёх метров
           это просто шероховатость рельефа, и заливать её не надо. */
        if (lake[index] > LAKE_DEPTH && flux[index] > minFlux) {
          lakeCells.push((originX + x + 0.5) * cell, (originY + y + 0.5) * cell, cell * 0.5, lake[index]);
          continue;
        }
        if (flux[index] < minFlux) continue;
        const to = parent[index];
        if (to < 0) continue;
        if (height[to] < SEA_LEVEL) continue; // устье: дальше море
        riverCells += 1;
        const tx = to % REGION_N;
        const ty = (to / REGION_N) | 0;
        segments.push(
          (originX + x + 0.5) * cell,
          (originY + y + 0.5) * cell,
          (originX + tx + 0.5) * cell,
          (originY + ty + 0.5) * cell,
          riverWidth(discharge(flux[index], cellArea)),
        );
      }
    }

    /* Вёдра 16 × 16: кадр берёт сегменты только из своих вёдер. */
    const BUCKETS = 16;
    const regionX0 = rx * REGION_N * cell;
    const regionY0 = ry * REGION_N * cell;
    const bucketSize = (REGION_N * cell) / BUCKETS;
    const segCount = segments.length / 5;
    const lists = [];
    for (let s = 0; s < segCount; s += 1) {
      const offset = s * 5;
      const pad = Math.max(segments[offset + 4], cell);
      const bx0 = clamp(Math.floor((Math.min(segments[offset], segments[offset + 2]) - pad - regionX0) / bucketSize), 0, BUCKETS - 1);
      const bx1 = clamp(Math.floor((Math.max(segments[offset], segments[offset + 2]) + pad - regionX0) / bucketSize), 0, BUCKETS - 1);
      const by0 = clamp(Math.floor((Math.min(segments[offset + 1], segments[offset + 3]) - pad - regionY0) / bucketSize), 0, BUCKETS - 1);
      const by1 = clamp(Math.floor((Math.max(segments[offset + 1], segments[offset + 3]) + pad - regionY0) / bucketSize), 0, BUCKETS - 1);
      for (let by = by0; by <= by1; by += 1) {
        for (let bx = bx0; bx <= bx1; bx += 1) {
          const bucket = by * BUCKETS + bx;
          while (lists.length <= bucket) lists.push(null);
          (lists[bucket] ??= []).push(s);
        }
      }
    }
    const starts = new Int32Array(BUCKETS * BUCKETS + 1);
    for (let b = 0; b < BUCKETS * BUCKETS; b += 1) starts[b + 1] = starts[b] + (lists[b]?.length ?? 0);
    const items = new Int32Array(starts[BUCKETS * BUCKETS]);
    const fillAt = new Int32Array(BUCKETS * BUCKETS);
    for (let b = 0; b < BUCKETS * BUCKETS; b += 1) {
      for (const s of lists[b] ?? []) {
        items[starts[b] + fillAt[b]] = s;
        fillAt[b] += 1;
      }
    }

    return {
      level,
      rx,
      ry,
      cell,
      x0: regionX0,
      y0: regionY0,
      size: REGION_N * cell,
      segments: new Float32Array(segments),
      lakes: new Float32Array(lakeCells),
      flux,
      height,
      riverCells,
      buckets: { n: BUCKETS, size: bucketSize, starts, items },
    };
  };

  const regionAt = (level, rx, ry) => {
    const name = `${level}:${rx}:${ry}`;
    let region = regions.get(name);
    if (!region) {
      region = buildRegion(level, rx, ry);
      regions.set(name, region);
      /* Область весит около мегабайта: больше восьми не держим. */
      if (regions.size > regionLimit) regions.delete(regions.keys().next().value);
    }
    return region;
  };

  /**
   * Обойти сегменты рек в прямоугольнике карты (метры) для кадра с разрешением mpp.
   */
  const forEachSegment = (mpp, minX, minY, maxX, maxY, visit) => {
    const level = levelForView(mpp);
    const cell = mppAt(planet, level);
    const size = REGION_N * cell;
    const minWidth = visibleWidth(mpp);
    const rx0 = Math.floor(minX / size);
    const rx1 = Math.floor(maxX / size);
    const ry0 = Math.floor(minY / size);
    const ry1 = Math.floor(maxY / size);
    for (let ry = ry0; ry <= ry1; ry += 1) {
      for (let rx = rx0; rx <= rx1; rx += 1) {
        const region = regionAt(level, rx, ry);
        const { segments, buckets } = region;
        const bx0 = clamp(Math.floor((minX - region.x0) / buckets.size), 0, buckets.n - 1);
        const bx1 = clamp(Math.floor((maxX - region.x0) / buckets.size), 0, buckets.n - 1);
        const by0 = clamp(Math.floor((minY - region.y0) / buckets.size), 0, buckets.n - 1);
        const by1 = clamp(Math.floor((maxY - region.y0) / buckets.size), 0, buckets.n - 1);
        for (let by = by0; by <= by1; by += 1) {
          for (let bx = bx0; bx <= bx1; bx += 1) {
            const bucket = by * buckets.n + bx;
            for (let i = buckets.starts[bucket]; i < buckets.starts[bucket + 1]; i += 1) {
              const s = buckets.items[i];
              const offset = s * 5;
              const width = segments[offset + 4];
              if (width < minWidth) continue;
              visit(segments[offset], segments[offset + 1], segments[offset + 2], segments[offset + 3], width);
            }
          }
        }
      }
    }
  };

  /** Озёра в прямоугольнике: центр, полуразмер клетки, глубина в единицах шкалы. */
  const forEachLake = (mpp, minX, minY, maxX, maxY, visit) => {
    const level = levelForView(mpp);
    const cell = mppAt(planet, level);
    const size = REGION_N * cell;
    const rx0 = Math.floor(minX / size);
    const rx1 = Math.floor(maxX / size);
    const ry0 = Math.floor(minY / size);
    const ry1 = Math.floor(maxY / size);
    for (let ry = ry0; ry <= ry1; ry += 1) {
      for (let rx = rx0; rx <= rx1; rx += 1) {
        const { lakes } = regionAt(level, rx, ry);
        for (let i = 0; i < lakes.length; i += 4) {
          if (lakes[i] < minX || lakes[i] > maxX || lakes[i + 1] < minY || lakes[i + 1] > maxY) continue;
          visit(lakes[i], lakes[i + 1], lakes[i + 2], lakes[i + 3]);
        }
      }
    }
  };

  /**
   * Построены ли области стока под этим прямоугольником. Раскраска спрашивает
   * перед тем, как рисовать реки: если нет — тайл рисуется без них и
   * дорисовывается, когда очередь кадров пуста.
   */
  const hasRegions = (mpp, minX, minY, maxX, maxY) => {
    const level = levelForView(mpp);
    const cell = mppAt(planet, level);
    const size = REGION_N * cell;
    const rx0 = Math.floor(minX / size);
    const rx1 = Math.floor(maxX / size);
    const ry0 = Math.floor(minY / size);
    const ry1 = Math.floor(maxY / size);
    for (let ry = ry0; ry <= ry1; ry += 1) {
      for (let rx = rx0; rx <= rx1; rx += 1) {
        if (!regions.has(`${level}:${rx}:${ry}`)) return false;
      }
    }
    return true;
  };

  /** Сток в точке: для слоя «Водосбор» и подписи под курсором. */
  const fluxAt = (mpp, mx, my) => {
    const level = levelForView(mpp);
    const cell = mppAt(planet, level);
    const size = REGION_N * cell;
    const region = regionAt(level, Math.floor(mx / size), Math.floor(my / size));
    const x = clamp(Math.floor(mx / cell - region.rx * REGION_N), 0, REGION_N - 1);
    const y = clamp(Math.floor(my / cell - region.ry * REGION_N), 0, REGION_N - 1);
    return region.flux[y * REGION_N + x];
  };

  return {
    planet,
    levelForView,
    /** Грубая сеть считается лениво: до первого запроса рек её нет. */
    ready: () => coarseReady,
    step: () => {
      solveCoarse();
      return coarseReady;
    },
    forEachSegment,
    forEachLake,
    hasRegions,
    fluxAt,
    /** Ширина реки в точке — для подписи под курсором. */
    widthAt: (mpp, mx, my) => {
      const level = levelForView(mpp);
      const cell = mppAt(planet, level);
      return riverWidth(discharge(fluxAt(mpp, mx, my), cell * cell));
    },
    stats: () => ({
      coarse: coarseCount,
      ready: coarseReady,
      regions: regions.size,
      rivers: [...regions.values()].reduce((sum, region) => sum + region.riverCells, 0),
    }),
    coarse: () => ({
      width: gw,
      height: gh,
      cell: coarseM,
      height: coarseHeight,
      parent: coarseParent,
      flux: coarseFlux,
      lake: coarseLake,
      resolved: coarseResolved,
    }),
    clear: () => {
      regions.clear();
    },
  };
};
