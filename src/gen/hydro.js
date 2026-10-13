/* Гидрология: куда течёт вода и где стоят озёра.

   Реки — то, по чему мир читается как настоящий, поэтому они считаются, а не
   рисуются. Порядок классический (O'Callaghan & Mark, 1984; заполнение впадин
   по Barnes et al., 2014):

     1. **Заполнение впадин** — очередь с приоритетом от клеток океана внутрь
        материка: вода находит выход, а бессточные низины получают ровную
        гладь на уровне перелива. Это и есть озёра.
     2. **Направление стока** — D8: из клетки вода идёт к самому низкому из
        восьми соседей по заполненной поверхности.
     3. **Накопление стока** — обход от высоких клеток к низким (сортировка
        подсчётом по ярусам, без сравнений): площадь водосбора складывается
        вниз по течению. Крупные реки — там, где водосбор большой.

   Дальше остаётся связать решётку с блоками: у реки есть ширина и глубина от
   водосбора, а её русло — отрезок от центра клетки к низовью. Точка в блоке
   получает, близко ли она к руслу (src/gen/terrain.js вычитает дно долины).

   Шаг решётки у Земли около 39 км — это масштаб континентального стока.
   Мелкая река в один блок шириной не моделируется: на карте такие реки не
   видны, а в разрезе они появляются как долина. */

import { clamp, KM } from './scale.js';

/** Во сколько раз шаг решётки меньше минимальной длины реки, чтобы её считать. */
const MIN_RIVER_KM2 = 30_000;
/* Озеро должно быть глубоким, а не всякой впадиной: глубина в блоках.
   На ярусе это 30 м на блок, то есть порог в шесть блоков — сто восемьдесят
   метров: мельче настоящих озёр не бывает, а впадин в рельефе сколько угодно.
   Без этого порога «озером» становилась каждая клетка, что ниже соседей. */
const LAKE_MIN_DEPTH = 6;
/** Гладкость глади: добавка к заполненной высоте, чтобы сток не был «плоским». */
const EPSILON = 1e-3;

/**
 * @param {{planet: object, grid: object}} options
 */
export const createHydro = ({ planet, grid }) => {
  const count = grid.count;
  const cols = grid.cols;
  const rows = grid.rows;
  const cellW = grid.cellW;
  const cellH = grid.cellH;
  const cellKm2 = grid.cellKm2;
  const seaLevel = planet.seaLevel;
  const base = grid.heights;

  /** Расстояние от точки до отрезка в блоках: так русло связано с колонкой. */
const segmentDistance = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0) return Math.sqrt((px - ax) ** 2 + (pz - az) ** 2);
  let t = ((px - ax) * dx + (pz - az) * dz) / lengthSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.sqrt((px - (ax + dx * t)) ** 2 + (pz - (az + dz * t)) ** 2);
};

/** Шаг между клетками решётки в километрах: из него складывается длина реки. */
  const stepKm = (index, next) => {
    const cx1 = index % cols;
    const cy1 = (index - cx1) / cols;
    const cx2 = next % cols;
    const cy2 = (next - cx2) / cols;
    const dx = ((cx2 - cx1) * cellW) / KM;
    const dy = ((cy2 - cy1) * cellH) / KM;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const filled = new Float32Array(count);
  let state = new Uint8Array(count);
  const down = new Int32Array(count).fill(-1);
  const area = new Float32Array(count);
  let lengthKm = new Float32Array(count);
  const depth = new Float32Array(count);
  const width = new Float32Array(count);
  const isRiver = new Uint8Array(count);
  const isLake = new Uint8Array(count);

  /* ---- 1. Заполнение впадин: очередь с приоритетом по уровню ---- */
  let heapLevel = new Float32Array(count + 1);
  let heapIndex = new Int32Array(count + 1);
  let heapSize = 0;
  const heapPush = (index, level) => {
    let i = heapSize;
    heapSize += 1;
    heapLevel[i] = level;
    heapIndex[i] = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heapLevel[parent] <= heapLevel[i]) break;
      const li = heapLevel[parent];
      const ii = heapIndex[parent];
      heapLevel[parent] = heapLevel[i];
      heapIndex[parent] = heapIndex[i];
      heapLevel[i] = li;
      heapIndex[i] = ii;
      i = parent;
    }
  };
  const heapPop = () => {
    const top = heapIndex[0];
    heapSize -= 1;
    heapLevel[0] = heapLevel[heapSize];
    heapIndex[0] = heapIndex[heapSize];
    let i = 0;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < heapSize && heapLevel[left] < heapLevel[smallest]) smallest = left;
      if (right < heapSize && heapLevel[right] < heapLevel[smallest]) smallest = right;
      if (smallest === i) break;
      const li = heapLevel[smallest];
      const ii = heapIndex[smallest];
      heapLevel[smallest] = heapLevel[i];
      heapIndex[smallest] = heapIndex[i];
      heapLevel[i] = li;
      heapIndex[i] = ii;
      i = smallest;
    }
    return top;
  };

  let outlets = 0;
  for (let index = 0; index < count; index += 1) {
    if (base[index] >= seaLevel) continue;
    filled[index] = seaLevel;
    state[index] = 1;
    heapPush(index, seaLevel);
    outlets += 1;
  }
  if (outlets === 0) {
    /* Мир без океана (маленькая проверочная карта): выходом становится самая
       низкая клетка — иначе вода не нашла бы путь и весь мир стал бы озером. */
    let lowest = 0;
    for (let index = 1; index < count; index += 1) if (base[index] < base[lowest]) lowest = index;
    filled[lowest] = base[lowest];
    state[lowest] = 1;
    heapPush(lowest, base[lowest]);
  }

  /* Обход восьми соседей: сначала прямые, потом диагонали — так при равных
     уровнях вода выбирает прямого соседа, и русло не «дрожит». */
  const NEIGHBOURS = new Int32Array(16);
  const neighbourCount = (cx, cy) => {
    let n = 0;
    if (cx > 0) { NEIGHBOURS[n] = -1; n += 1; }
    if (cx < cols - 1) { NEIGHBOURS[n] = 1; n += 1; }
    if (cy > 0) { NEIGHBOURS[n] = -cols; n += 1; }
    if (cy < rows - 1) { NEIGHBOURS[n] = cols; n += 1; }
    if (cx > 0 && cy > 0) { NEIGHBOURS[n] = -cols - 1; n += 1; }
    if (cx < cols - 1 && cy > 0) { NEIGHBOURS[n] = -cols + 1; n += 1; }
    if (cx > 0 && cy < rows - 1) { NEIGHBOURS[n] = cols - 1; n += 1; }
    if (cx < cols - 1 && cy < rows - 1) { NEIGHBOURS[n] = cols + 1; n += 1; }
    return n;
  };

  while (heapSize > 0) {
    const index = heapPop();
    const level = filled[index];
    const cx = index % cols;
    const cy = (index - cx) / cols;
    const n = neighbourCount(cx, cy);
    for (let k = 0; k < n; k += 1) {
      const neighbour = index + NEIGHBOURS[k];
      if (state[neighbour]) continue;
      state[neighbour] = 1;
      const level2 = Math.max(base[neighbour], level) + EPSILON;
      filled[neighbour] = level2;
      heapPush(neighbour, level2);
    }
  }
  /* Океанские клетки — тоже «закрытые», но их гладь уже равна уровню моря. */

  /* ---- 2. Направление стока: D8 по заполненной поверхности ---- */
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const index = cy * cols + cx;
      if (base[index] < seaLevel) {
        down[index] = -1; // устье: вода ушла в океан
        continue;
      }
      let best = -1;
      let bestLevel = filled[index] - EPSILON * 0.5;
      const n = neighbourCount(cx, cy);
      for (let k = 0; k < n; k += 1) {
        const neighbour = index + NEIGHBOURS[k];
        const level = filled[neighbour];
        if (level < bestLevel) {
          bestLevel = level;
          best = neighbour;
        }
      }
      down[index] = best;
    }
  }

  /* ---- 3. Накопление стока ---- */
  /* Порядок обхода — топологическая сортировка потока (алгоритм Кана): каждая
     клетка отдаёт воду низовью, когда её собственный водосбор уже собран. Так
     порядок не зависит от ярусов и «плоских» участков: в озере, где гладь
     ровная, счётчик входящих рёбер сам расставит клетки по течению. */
  let incoming = new Int32Array(count);
  for (let index = 0; index < count; index += 1) {
    const next = down[index];
    if (next >= 0) incoming[next] += 1;
  }
  let queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < count; index += 1) {
    area[index] = cellKm2;
    lengthKm[index] = 0;
    if (incoming[index] === 0) {
      queue[tail] = index;
      tail += 1;
    }
  }
  let maxArea = cellKm2;
  let longestKm = 0;
  let longestAt = -1;
  let processed = 0;
  while (head < tail) {
    const index = queue[head];
    head += 1;
    processed += 1;
    const next = down[index];
    if (next < 0) continue;
    area[next] += area[index];
    const candidate = lengthKm[index] + stepKm(index, next);
    if (candidate > lengthKm[next]) lengthKm[next] = candidate;
    if (area[next] > maxArea) maxArea = area[next];
    incoming[next] -= 1;
    if (incoming[next] === 0) {
      queue[tail] = next;
      tail += 1;
    }
  }
  /* Страховка: если в графе остался цикл (его быть не должно — сток строго
     вниз), оставшиеся клетки всё равно считаются, чтобы длина рек не пропала. */
  if (processed < count) {
    for (let index = 0; index < count; index += 1) {
      if (incoming[index] <= 0) continue;
      const next = down[index];
      if (next < 0) continue;
      if (lengthKm[index] + stepKm(index, next) > lengthKm[next]) lengthKm[next] = lengthKm[index] + stepKm(index, next);
    }
  }
  for (let index = 0; index < count; index += 1) {
    if (lengthKm[index] > longestKm) {
      longestKm = lengthKm[index];
      longestAt = index;
    }
  }

  /* Русла и озёра. */
  let riverCells = 0;
  let lakeCells = 0;
  for (let index = 0; index < count; index += 1) {
    if (base[index] < seaLevel) continue;
    if (filled[index] - base[index] > LAKE_MIN_DEPTH) {
      isLake[index] = 1;
      lakeCells += 1;
      continue;
    }
    if (area[index] >= MIN_RIVER_KM2) {
      isRiver[index] = 1;
      riverCells += 1;
      const q = area[index];
      width[index] = clamp(6 + 130 * (q / 2_000_000) ** 0.45, 4, 170);
      depth[index] = clamp(1.5 + 26 * (q / 2_000_000) ** 0.4, 1, 32);
    }
  }

  /* Озёра: считаем их число — связные куски глади. */
  let lakeSeen = new Uint8Array(count);
  let lakeQueue = new Int32Array(count);
  let lakeCount = 0;
  let biggestLakeKm2 = 0;
  for (let start = 0; start < count; start += 1) {
    if (!isLake[start] || lakeSeen[start]) continue;
    lakeCount += 1;
    let head = 0;
    let tail = 0;
    lakeQueue[tail] = start;
    tail += 1;
    lakeSeen[start] = 1;
    let cells = 0;
    while (head < tail) {
      const index = lakeQueue[head];
      head += 1;
      cells += 1;
      const cx = index % cols;
      const cy = (index - cx) / cols;
      const n = neighbourCount(cx, cy);
      for (let k = 0; k < n; k += 1) {
        const neighbour = index + NEIGHBOURS[k];
        if (!isLake[neighbour] || lakeSeen[neighbour]) continue;
        lakeSeen[neighbour] = 1;
        lakeQueue[tail] = neighbour;
        tail += 1;
      }
    }
    const km2 = cells * cellKm2;
    if (km2 > biggestLakeKm2) biggestLakeKm2 = km2;
  }

  /* Отрезки русел для рисования карты на грубых уровнях: у реки в 170 блоков
     ширины на шаге в десятки километров пиксель не попадёт в русло, поэтому
     крупные масштабы рисуют сеть линиями. */
  const segments = [];
  for (let index = 0; index < count; index += 1) {
    if (!isRiver[index]) continue;
    const cx = index % cols;
    const cy = (index - cx) / cols;
    const next = down[index];
    const nx = next >= 0 ? next % cols : cx;
    const ny = next >= 0 ? (next - (next % cols)) / cols : cy;
    segments.push({
      x0: grid.cellX(cx),
      z0: grid.cellZ(cy),
      x1: grid.cellX(nx),
      z1: grid.cellZ(ny),
      area: area[index],
      width: width[index],
      depth: depth[index],
      level: filled[index],
    });
  }

  /* Освобождаем то, что больше не нужно: состояние обхода, очередь и порядок. */
  const bilinear = (array, x, z) => {
    const gx = clamp(x / cellW - 0.5, 0, cols - 1);
    const gz = clamp(z / cellH - 0.5, 0, rows - 1);
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(cols - 1, x0 + 1);
    const z1 = Math.min(rows - 1, z0 + 1);
    const tx = gx - x0;
    const tz = gz - z0;
    const v00 = array[z0 * cols + x0];
    const v10 = array[z0 * cols + x1];
    const v01 = array[z1 * cols + x0];
    const v11 = array[z1 * cols + x1];
    return (v00 * (1 - tx) + v10 * tx) * (1 - tz) + (v01 * (1 - tx) + v11 * tx) * tz;
  };

  /** Глубина озера в точке: гладко, потому что поле берётся билинейно. */
  const lakeDepthAt = (x, z) => {
    const depthField = filled;
    const level = bilinear(depthField, x, z);
    const ground = bilinear(base, x, z);
    return level - ground;
  };
  const lakeLevelAt = (x, z) => bilinear(filled, x, z);

  /**
   * Что в этой точке от воды: русло реки или озёрная гладь.
   * Пишет в out: kind (0 нет, 1 река, 2 озеро), waterY, width, area, depth.
   */
  const sample = (x, z, out) => {
    const cx = clamp(Math.floor(x / cellW), 0, cols - 1);
    const cy = clamp(Math.floor(z / cellH), 0, rows - 1);
    let bestIndex = -1;
    let bestRatio = Infinity;
    let bestDistance = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      const ny = cy + dy;
      if (ny < 0 || ny >= rows) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = cx + dx;
        if (nx < 0 || nx >= cols) continue;
        const index = ny * cols + nx;
        if (!isRiver[index]) continue;
        const ax = grid.cellX(nx);
        const az = grid.cellZ(ny);
        const next = down[index];
        let bx = ax;
        let bz = az;
        if (next >= 0) {
          const mx = next % cols;
          const my = (next - mx) / cols;
          bx = grid.cellX(mx);
          bz = grid.cellZ(my);
        }
        const distance = segmentDistance(x, z, ax, az, bx, bz);
        const half = Math.max(2, width[index] * 0.5);
        const ratio = distance / half;
        if (ratio < bestRatio) {
          bestRatio = ratio;
          bestIndex = index;
          bestDistance = distance;
        }
      }
    }
    if (bestIndex >= 0 && bestRatio <= 1) {
      out[0] = 1;
      out[1] = filled[bestIndex];
      out[2] = width[bestIndex];
      out[3] = area[bestIndex];
      /* Дно долины — парабола по ширине: у берега мелко, на середине глубоко. */
      out[4] = depth[bestIndex] * (1 - bestRatio * bestRatio) + 0.4;
      return out;
    }
    /* Озеро — только на суше: в океане filled и base расходятся на глубину, и
       без этой проверки весь океан отвечал «озеро». */
    const ground = bilinear(base, x, z);
    const lakeDepth = bilinear(filled, x, z) - ground;
    if (ground >= seaLevel && lakeDepth > LAKE_MIN_DEPTH) {
      out[0] = 2;
      out[1] = bilinear(filled, x, z);
      out[2] = 0;
      out[3] = 0;
      out[4] = lakeDepth;
      return out;
    }
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    return out;
  };

  /* После расчёта служебные массивы не нужны: оставляем только то, из чего вид
     строит картинку и колонку. Это десяток мегабайт на земной решётке. */
  state = null;
  heapLevel = null;
  heapIndex = null;
  incoming = null;
  queue = null;
  lakeSeen = null;
  lakeQueue = null;
  lengthKm = null;

  return {
    ready: true,
    cols,
    rows,
    cellW,
    cellH,
    filled,
    down,
    area,
    isRiver,
    isLake,
    depth,
    width,
    segments,
    sample,
    lakeDepthAt,
    lakeLevelAt,
    riverCells,
    lakeCount,
    lakeCells,
    biggestLakeKm2,
    riverMinKm2: MIN_RIVER_KM2,
    maxDischargeKm2: maxArea,
    longestRiverKm: longestKm,
    longestRiverAt: longestAt >= 0
      ? { x: grid.cellX(longestAt % cols), z: grid.cellZ((longestAt - (longestAt % cols)) / cols) }
      : null,
    stats: {
      rivers: riverCells,
      lakes: lakeCount,
      lakeCells,
      biggestLakeKm2,
      maxDischargeKm2: maxArea,
      longestRiverKm: longestKm,
      riverMinKm2: MIN_RIVER_KM2,
    },
  };
};
