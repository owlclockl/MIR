/* География планеты из карты Azgaar: снимок высот → базовое поле рельефа.

   Зачем. Карта планеты и карта генератора — один и тот же мир: материки,
   берега, озёра и долины должны совпадать, иначе «карта планеты» — это просто
   другой мир, на который приятно смотреть, но который ничего не описывает.
   Поэтому нулевые октавы рельефа (те, что рисуют континенты) берутся не из
   шума, а из высот самого Azgaar; шум остаётся тем, чем он и должен быть, —
   детастью мельче клетки генератора.

   Что берётся. Снимок делает `src/world/bridge.js` — он единственный в проекте
   знает, как у Azgaar разложены поля (`grid.cells.h`, `pack.cells.h` через
   `pack.cells.g`, уровень моря из `SEA_LEVEL`). Отдельного читалки для планеты
   не заводим: два reader'а разойдутся при первом же переименовании поля.

   Как совпадает берег. Высоты генератора переводятся в z-шкалу (`heightToZ`) и
   подкладываются под деталь *до* нелинейности, а не после: уровень `SEA_Z` в
   обеих картах означает одно и то же — берег. Два условия держат это ровно:

     • **деталь гаснет у берега** — множитель `fade` разгоняется от нуля на
       расстоянии ~0,35 клетки источника до единицы на ~двух клетках. Берега
       планеты — это берега источника, а не «похожая форма»;
     • **деталь не переносит клетку через берег** — тот же множитель режется по
       запасу высоты: `GUARD_SIGMAS σ` (4) не поднимают дно выше уровня моря и
       не топят сушу. Иначе на пологих шельфах из каждой десятой клетки моря
       вырастал бы остров, и «совпадение границ» начинало бы расходиться именно
       там, где берег самый плоский.

   Разрешение источника — клетка `grid` (для карты 1600 × 1000 это ~400 км при
   планете 1×), поэтому деталь начинается с октавы, чья длина волны вдвое
   короче клетки: октава крупнее клетки рисовала бы свой материк там, где его
   уже нарисовал генератор.
*/

import { clamp } from './scale.js';
import { RAW_MEAN, RAW_SIGMA, SEA_LEVEL, SEA_Z, heightToZ } from './zscale.js';

/* ---------- снимок из окна редактора ---------- */

/** Мост знает поле; здесь — только человеческий ответ «чего не хватает». */
export { mapsReady, missingMapsPart, readSource } from '../world/bridge.js';

/* ---------- параметры ---------- */

/** Узлов базовой решётки на одну клетку источника: 4 — берег гладкий, память копейки. */
const SUPER = 4;
/** Деталь включается на этом расстоянии от берега (в клетках источника). */
const FADE_FROM = 0.35;
const FADE_TO = 2;
/** На сколько σ детали меняем запас высоты до берега. Больше — берег целее,
    зато шире полоса «без деталя» вдоль воды; меньше — деталь начинает переливать
    клетки через уровень моря. Четыре σ измерены на самой карте: при них берег
    планеты и берег источника расходятся на ноль выборок из миллиона. */
export const GUARD_SIGMAS = 4;

/** Гладкий переход 0 → 1 между a и b. */
const smoothstep = (a, b, x) => {
  if (!(x > a)) return 0;
  if (x >= b) return 1;
  const t = (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/**
 * Расстояние до берега в клетках источника: chamfer-преобразование (Borgefors
 * 3-4) по восьмисоседней решётке. Два прохода по решётке 100 × 63 — микросекунды,
 * зато «у берега» перестаёт означать «в той же клетке, что и вода».
 */
const distanceToCoast = (land, cellsX, cellsY) => {
  const count = cellsX * cellsY;
  const INF = 1e6;
  const dist = new Float32Array(count);
  for (let cy = 0; cy < cellsY; cy += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      const i = cy * cellsX + cx;
      const self = land[i];
      let coast = false;
      for (let dy = -1; dy <= 1 && !coast; dy += 1) {
        const ny = cy + dy;
        if (ny < 0 || ny >= cellsY) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          if (nx < 0 || nx >= cellsX) continue;
          if (land[ny * cellsX + nx] !== self) {
            coast = true;
            break;
          }
        }
      }
      dist[i] = coast ? 0 : INF;
    }
  }
  /* Прямой и обратный проходы: веса 3 и 4 на 1/3 клетки дают евклидово
     расстояние с ошибкой меньше 10 %, и оно монотонно — чего и требует fade. */
  const step = 1 / 3;
  for (let cy = 0; cy < cellsY; cy += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      const i = cy * cellsX + cx;
      let best = dist[i];
      for (const [dx, dy, w] of [[-1, -1, 4], [0, -1, 3], [-1, 0, 3], [1, -1, 4]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= cellsX || ny < 0 || ny >= cellsY) continue;
        const value = dist[ny * cellsX + nx] + w * step;
        if (value < best) best = value;
      }
      dist[i] = best;
    }
  }
  for (let cy = cellsY - 1; cy >= 0; cy -= 1) {
    for (let cx = cellsX - 1; cx >= 0; cx -= 1) {
      const i = cy * cellsX + cx;
      let best = dist[i];
      for (const [dx, dy, w] of [[1, 1, 4], [0, 1, 3], [1, 0, 3], [-1, 1, 4]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= cellsX || ny < 0 || ny >= cellsY) continue;
        const value = dist[ny * cellsX + nx] + w * step;
        if (value < best) best = value;
      }
      dist[i] = best;
    }
  }
  return dist;
};

/**
 * Catmull-Rom по решётке клеток: берег остаётся кривой, а не ступенями сетки.
 *
 * Сплайн проходит через сами узлы — в отличие от bilinear он не спрямляет
 * косой берег по диагонали клетки и, в отличие от гаусрова сглаживания, не
 * размывает границу суша/вода. Overshoot у Catmull-Rom есть, но он ограничен
 * перепадом между соседними клетками, а его как раз и сглаживает fade.
 */
const catmullRom = (array, cellsX, cellsY, gx, gy) => {
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const at = (x, y) => array[clamp(y, 0, cellsY - 1) * cellsX + clamp(x, 0, cellsX - 1)];
  /* separable: сначала четыре точки по строке, потом по столбцу — 16 выборок,
     две интерполяции, ни одного массива весов. */
  const rows = [];
  for (let j = -1; j <= 2; j += 1) {
    const y = y0 + j;
    const p0 = at(x0 - 1, y);
    const p1 = at(x0, y);
    const p2 = at(x0 + 1, y);
    const p3 = at(x0 + 2, y);
    rows.push(spline(p0, p1, p2, p3, gx - x0));
  }
  return spline(rows[0], rows[1], rows[2], rows[3], gy - y0);
};

/** Классическое ядро Catmull-Rom с половинным касательным масштабом. */
const spline = (p0, p1, p2, p3, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
};

/**
 * Базовое поле планеты по снимку карт Azgaar.
 *
 * @param {object} planet — геометрия из scale.js
 * @param {object} source — снимок из readSource (cellH, cellsX, cellsY, spacing, width, height, seaLevel)
 * @returns {object} поле: { sample, cellM, detailFrom, landShare, stats }
 */
export const createSourceField = (planet, source) => {
  const cellsX = Math.max(2, source.cellsX | 0);
  const cellsY = Math.max(2, source.cellsY | 0);
  const spacing = Math.max(1e-3, source.spacing || 16);
  const seaLevel = Number.isFinite(source.seaLevel) ? source.seaLevel : SEA_LEVEL;
  const count = cellsX * cellsY;

  /* Высоты генератора → z и маска суши. Всё, что дальше, работает с ними. */
  const zCell = new Float32Array(count);
  const land = new Uint8Array(count);
  let landCells = 0;
  const heights = source.cellH;
  for (let i = 0; i < count; i += 1) {
    const h = Number.isFinite(heights?.[i]) ? heights[i] : seaLevel;
    zCell[i] = heightToZ(h);
    const dry = h > seaLevel ? 1 : 0;
    land[i] = dry;
    landCells += dry;
  }
  const coast = distanceToCoast(land, cellsX, cellsY);

  /* Сколько метров в планете стоит клетка источника — по каждой оси отдельно:
     прямоугольник карты генератора растянут на весь прямоугольник проекции, и
     для стандартных 1600 × 1000 расхождение по осям меньше процента. */
  const cellXM = (planet.widthM / source.width) * spacing;
  const cellYM = (planet.heightM / source.height) * spacing;
  const cellM = Math.sqrt(cellXM * cellYM);

  /* Мелкая решётка, с которой работает каждый пиксель тайла: шаг — четверть
     клетки. Строится один раз на мир, выборка — билинейная. */
  const stepX = spacing / SUPER;
  const stepY = spacing / SUPER;
  const w = Math.max(2, Math.ceil(cellsX * SUPER));
  const h = Math.max(2, Math.ceil(cellsY * SUPER));
  const data = new Float32Array(w * h * 2);
  const rawCoast = RAW_MEAN + RAW_SIGMA * SEA_Z;
  for (let gy = 0; gy < h; gy += 1) {
    const cellY = (gy + 0.5) / SUPER - 0.5;
    for (let gx = 0; gx < w; gx += 1) {
      const cellX = (gx + 0.5) / SUPER - 0.5;
      const z = catmullRom(zCell, cellsX, cellsY, cellX, cellY);
      const d = catmullRom(coast, cellsX, cellsY, cellX, cellY);
      const base = RAW_MEAN + RAW_SIGMA * clamp(z, -6, 4);
      const fade = smoothstep(FADE_FROM, FADE_TO, d);
      const at = (gy * w + gx) * 2;
      data[at] = base;
      data[at + 1] = fade;
    }
  }

  /* Обратные шаги: умножение вместо деления. */
  const scaleX = w / planet.widthM;
  const scaleY = h / planet.heightM;
  /** Одноразовая выборка для landAt: общий массив, чтобы не плодить аллокации. */
  const scratch = new Float32Array(2);

  return {
    /** Шаг решётки источника в метрах планеты — по нему elevation.js решает, с
        какой октавы начинается деталь. */
    cellM,
    cellXM,
    cellYM,
    /** Сырое значение уровня моря: деталь обязана оставаться по свою сторону. */
    rawCoast,
    /**
     * [0] — база рельефа в сырых единицах, [1] — множитель детали у берега.
     * Координаты за краем прижимаются к краю: мир не замкнут, за рамкой карты
     * земли нет.
     */
    sample(mx, my, target) {
      let fx = mx * scaleX - 0.5;
      let fy = my * scaleY - 0.5;
      if (fx < 0) fx = 0;
      else if (fx > w - 1) fx = w - 1;
      if (fy < 0) fy = 0;
      else if (fy > h - 1) fy = h - 1;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, w - 1);
      const y1 = Math.min(y0 + 1, h - 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const a = (y0 * w + x0) * 2;
      const b = (y0 * w + x1) * 2;
      const c = (y1 * w + x0) * 2;
      const d = (y1 * w + x1) * 2;
      for (let k = 0; k < 2; k += 1) {
        const top = data[a + k] + (data[b + k] - data[a + k]) * tx;
        const bottom = data[c + k] + (data[d + k] - data[c + k]) * tx;
        target[k] = top + (bottom - top) * ty;
      }
      return target;
    },
    /** База рельефа в точке, в raw-единицах: что сказала карта Azgaar, без
        детали. Нужна проверкам («насколько высота ушла от карты») и слоям,
        которым нужно показать сам источник. */
    baseAt(mx, my) {
      this.sample(mx, my, scratch);
      return scratch[0];
    },
    /** Суша источника в точке: та же интерполяция и тот же уровень, что у
        рельефа, — иначе «берег не совпал» будет означать просто разницу выборок. */
    landAt(mx, my) {
      return this.baseAt(mx, my) > rawCoast;
    },
    stats: () => ({
      cells: count,
      cellsX,
      cellsY,
      spacing,
      landShare: landCells / count,
      cellM,
      nodes: w * h,
      bytes: data.byteLength,
    }),
  };
};

/**
 * С какой октавы начинается деталь: с той, чья длина волны вдвое короче клетки
 * источника. Октава крупнее клетки рисовала бы свой материк там, где его уже
 * нарисовал генератор.
 */
export const detailFirstOctave = (baseWavelength, cellM) => {
  if (!(cellM > 0) || !(baseWavelength > 0)) return 0;
  return Math.max(0, Math.ceil(Math.log2(baseWavelength / (cellM / 2))));
};

/** Записка для интерфейса: чем именно планета «засеяна» — по одному снимку. */
export const describeSource = (source) => {
  const cellsX = Math.max(1, source.cellsX | 0);
  const cellsY = Math.max(1, source.cellsY | 0);
  const seaLevel = Number.isFinite(source.seaLevel) ? source.seaLevel : SEA_LEVEL;
  const heights = source.cellH;
  let land = 0;
  for (let i = 0; i < cellsX * cellsY; i += 1) if (Number(heights?.[i]) > seaLevel) land += 1;
  return (
    `карта Azgaar: ${cellsX} × ${cellsY} клеток, ` +
    `суша ${((land / (cellsX * cellsY)) * 100).toFixed(0)} %, море на уровне ${seaLevel}`
  );
};
