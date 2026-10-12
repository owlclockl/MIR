/* Течение воды по решётке: единая машина для стока, эрозии и порядков рек.

   Раньше priority flood (Барнс, 2014) жил только в гидрологии. Но тот же самый
   расчёт нужен геоморфологии: чтобы река что-то вырезала, нужно знать, куда
   течёт вода, а чтобы «река вырезала долину, по которой потом течёт» — нужно,
   чтобы эрозия и сток считались **по одной и той же сети**. Две копии алгоритма
   разошлись бы при первой же правке, поэтому машина одна.

   Что здесь считается:

     • **Куда течёт клетка** (D8, восемь соседей) с заполнением впадин: вода
       ставится на отметку стока, а не остаётся в яме. Порядок выхода из очереди
       топологический — родитель всегда раньше ребёнка, поэтому накопление
       делается одним проходом в обратном порядке, без повторной сортировки.
     • **Площадь водосбора** — накопление вклада клеток вниз по течению.
     • **Порядок реки** (Стралер): исток — 1, слияние двух равных — +1.
     • **Расстояние до чего угодно** (chamfer-преобразованием), например до
       границы плит или до берега.

   Сеть считается по клетке, поэтому работает и на глобальной решётке (fields.js),
   и на детальной области 256 × 256 в гидрологии. */

/** Двоичная куча: ключ — отметка уровня, значение — индекс клетки. */
export const createHeap = (capacity) => {
  /* Клетка попадает в очередь до восьми раз: каждый сосед может улучшить её
     отметку. Переполнение тихо теряло бы данные, поэтому ёмкость — на все
     восемь, а не «с небольшим запасом». */
  const limit = Math.max(8, capacity) * 8 + 8;
  const keys = new Float64Array(limit);
  const values = new Int32Array(limit);
  let size = 0;
  return {
    get size() {
      return size;
    },
    push(key, value) {
      if (size + 1 >= limit) return;
      keys[++size] = key;
      values[size] = value;
      let i = size;
      while (i > 1) {
        const parent = i >> 1;
        if (keys[parent] <= keys[i]) break;
        const kk = keys[parent];
        keys[parent] = keys[i];
        keys[i] = kk;
        const vv = values[parent];
        values[parent] = values[i];
        values[i] = vv;
        i = parent;
      }
    },
    pop() {
      const top = values[1];
      keys[1] = keys[size];
      values[1] = values[size];
      size -= 1;
      let i = 1;
      for (;;) {
        const left = i << 1;
        if (left > size) break;
        const right = left + 1;
        let next = left;
        if (right <= size && keys[right] < keys[left]) next = right;
        if (keys[i] <= keys[next]) break;
        const kk = keys[next];
        keys[next] = keys[i];
        keys[i] = kk;
        const vv = values[next];
        values[next] = values[i];
        values[i] = vv;
        i = next;
      }
      return top;
    },
  };
};

/**
 * Заливка Барнса: куда течёт каждая клетка и где впадины.
 *
 * @returns {number} сколько клеток вышло из очереди
 */
export const routeFlow = ({ width, height, elevation, parent, resolved, lake, isOutlet, order, mask }) => {
  const count = width * height;
  const heap = createHeap(count);
  const done = new Uint8Array(count);

  for (let i = 0; i < count; i += 1) {
    resolved[i] = elevation[i];
    parent[i] = -1;
    /* Клеток вне карты не существует: край мира — рамка, а не шов. */
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
        const nx = x + dx;
        /* За краем карты клеток нет: вода уходит за рамку, как за полюс.
           Замыкание по долготе здесь раньше не только соединяло берега на
           другой стороне мира — оно ещё и переносило сток с правого края
           области на левый, потому что той же функцией считаются области. */
        if (nx < 0 || nx >= width) continue;
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

/**
 * Накопление величины вниз по течению: `flux[клетка] = свой вклад + всё сверху`.
 * Порядок обхода — обратный к порядку выхода из очереди, поэтому одного прохода
 * достаточно. `flux` заполняется нулями внутри (в него уже мог быть добавлен
 * приток извне — например, через границу области стока).
 */
export const accumulateFromOrder = ({ order, filled, parent, source, flux }) => {
  for (let i = 0; i < filled; i += 1) flux[order[i]] += source[order[i]];
  for (let i = filled - 1; i >= 0; i -= 1) {
    const cell = order[i];
    const to = parent[cell];
    if (to >= 0) flux[to] += flux[cell];
  }
  return flux;
};

/**
 * Порядок реки по Стралеру — не украшение: по нему считаются законы Хортона
 * (число рек и средняя длина по порядку) и подписываются русла в интерфейсе.
 * Исток — 1; слияние двух рек одного порядка повышает порядок на единицу,
 * слияние разных — оставляет максимальный (правило Стралера).
 */
export const strahlerOrder = ({ order, filled, parent, mask }) => {
  const ranks = new Uint8Array(parent.length);
  const topChild = new Uint8Array(parent.length);
  for (let i = 0; i < filled; i += 1) {
    const cell = order[i];
    if (mask && !mask[cell]) continue;
    if (parent[cell] < 0) {
      if (!ranks[cell]) ranks[cell] = 1;
      continue;
    }
    if (ranks[cell] === 0) ranks[cell] = 1;
  }
  /* Родитель всегда раньше ребёнка в порядке очереди, значит идём с конца. */
  for (let i = filled - 1; i >= 0; i -= 1) {
    const cell = order[i];
    const to = parent[cell];
    if (to < 0) continue;
    const rank = ranks[cell];
    if (rank > ranks[to]) {
      ranks[to] = rank;
      topChild[to] = 1;
    } else if (rank === ranks[to] && topChild[to]) {
      ranks[to] = Math.min(255, rank + 1);
      topChild[to] = 0;
    }
  }
  return ranks;
};

/**
 * Chamfer-расстояние (квазиевклидово) от множества клеток-источников.
 * Источник задаётся функцией `isSeed(index, gx, gy)`; возвращается расстояние в
 * метрах. Два прохода вместо восьми — этого хватает, когда расстояние нужно
 * геологии (ширина орогена, шельф), а не для точной геометрии.
 */
export const distanceField = ({ width, height, cell, isSeed, mask }) => {
  const far = 1e12;
  const dist = new Float64Array(width * height);
  const a = cell; // по стороне
  const b = cell * Math.SQRT2; // по диагонали
  for (let gy = 0; gy < height; gy += 1) {
    for (let gx = 0; gx < width; gx += 1) {
      const i = gy * width + gx;
      dist[i] = mask && !mask[i] ? far : isSeed(i, gx, gy) ? 0 : far;
    }
  }
  const relax = (i, j, weight) => {
    const candidate = dist[j] + weight;
    if (candidate < dist[i]) dist[i] = candidate;
  };
  for (let gy = 0; gy < height; gy += 1) {
    for (let gx = 0; gx < width; gx += 1) {
      const i = gy * width + gx;
      if (gx > 0) relax(i, i - 1, a);
      if (gy > 0) relax(i, i - width, a);
      if (gx > 0 && gy > 0) relax(i, i - width - 1, b);
      if (gx < width - 1 && gy > 0) relax(i, i - width + 1, b);
    }
  }
  for (let gy = height - 1; gy >= 0; gy -= 1) {
    for (let gx = width - 1; gx >= 0; gx -= 1) {
      const i = gy * width + gx;
      if (gx < width - 1) relax(i, i + 1, a);
      if (gy < height - 1) relax(i, i + width, a);
      if (gx < width - 1 && gy < height - 1) relax(i, i + width + 1, b);
      if (gx > 0 && gy < height - 1) relax(i, i + width - 1, b);
    }
  }
  return dist;
};
