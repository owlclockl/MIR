/* Эрозия: реки вырезают долины в том, что подняла тектоника.

   Тектоника задаёт высоту, но не форму склонов: пока по поверхности не потечёт
   вода, она остаётся гладкой изостатической чашей. Настоящий горный рельеф
   делают реки — они врезаются в поднятие, собирают водосбор в ствол, а ствол
   врезается быстрее притоков. Отсюда и продольный профиль реки (вогнутый вверх,
   concave-up), и острые водоразделы, и осыпи на склонах.

   Модель — стандартная: **уравнение переноса с водосбором** (stream power,
   Howard & Kerby 1983; Whipple & Tucker 1999; Браун и Уиллетт 2013 показали,
   как решать его неявно за один линейный проход):

       ∂h/∂t = U − K·A^m·|∇h|^n + осыпи

   где `A` — площадь водосбора, `K` — размываемость породы, `m` и `n` —
   показатели. При `n = 1` схема неявная и устойчивая при любом шаге по времени:

       h_i = (h_i^старое + f_i·h_j) / (1 + f_i),   f_i = K·dt·A_i^m / dx,

   где `j` — клетка, куда стекает вода. Считать надо **вниз по течению** — тогда
   `h_j` уже новое, и решение не «размазывается» по шагам. Порядок обхода даёт
   priority flood (flow.js): он же гарантирует, что впадин в рельефе нет и вода
   везде находит путь к морю.

   Отдельно идёт **ограничение крутизны** («осыпи»): если склон круче угла
   естественного откоса, материал ссыпается вниз. Без него на грубой решётке
   остались бы вертикальные сбросы, которых в природе не бывает: даже самые
   крутые скалы держат 30–45° на масштабе больше километра.

   Эрозия считается на той же грубой решётке, что и тектоника (десятки
   километров). Это не компромисс: долины крупных рек и есть структуры такого
   масштаба, а вся мелкая деталь (борозды, русла ручьёв) дорисовывается октавами
   шума на уровнях пирамиды и идёт вдоль врезанных долин благодаря полю
   `dissection` — оно повышает детальность там, где вода поработала. */

import { clamp } from './scale.js';
import { createGrid } from './fields.js';
import { accumulateFromOrder, routeFlow, strahlerOrder } from './flow.js';
import { TECT, CRUST } from './tectonics.js';

/** Каналы поля эрозии: порядок — контракт для раскраски и проверок. */
export const ERO = {
  elevation: 0,
  drainage: 1,
  order: 2,
  incision: 3,
  sediment: 4,
  dissection: 5,
  slope: 6,
};
export const ERO_CHANNELS = 7;

/** Показатели уравнения переноса: m/n = 0,5 — классика (Whipple & Tucker). */
export const M_EXP = 0.5;
export const N_EXP = 1;
/* Размываемость породы, 1/год: при A = 10 000 км² и уклоне 1 ‰ даёт 0,04 мм/год.
   Значение занижено против «настоящих» 1e-6 намеренно: тектонический рельеф у
   нас — уже готовый итог поднятия, и эрозия здесь не строит мир заново, а
   прорезает в нём долины за несколько миллионов лет. */
export const ERODIBILITY = 4.0e-8;
/** Модельное время эрозии, млн лет: столько «работает» вода над рельефом. */
export const EROSION_MA = 3;
/** Сколько раз пересчитывается сеть стока за модель. */
export const ITERATIONS = 3;
/** Предельный склон (тангенс): 0,35 — около 19°, дальше материал осыпается. */
export const REPOSE_TAN = 0.35;
/** Ниже этой отметки вода не несёт: шельф и глубже — уже море. */
const SEA_EDGE_M = -180;
/* Водосбор, с которого клетка считается руслом, км². Порог не случаен: клетка
   грубой решётки сама по себе имеет площадь 2700 км², поэтому «ручьём» на таком
   масштабе считается бассейн в сотни тысяч квадратных километров (примерно
   бассейн Днепра), а не ручей в привычном смысле. */
const CHANNEL_KM2 = 80_000;

/**
 * Эрозия рельефа, поднятого тектоникой.
 *
 * @param {object} planet — геометрия из scale.js
 * @param {object} tectonics — результат createTectonics
 * @param {{iterations?: number, timeMa?: number, erodibility?: number}} [options]
 */
export const createErosion = (planet, tectonics, { iterations = ITERATIONS, timeMa = EROSION_MA, erodibility = ERODIBILITY } = {}) => {
  const source = tectonics.grid;
  const { w, h, stepX, stepY } = source;
  const count = w * h;
  const cellArea = stepX * stepY;
  const grid = createGrid(planet, { cells: source.w, channels: ERO_CHANNELS });

  const elevation = new Float32Array(count);
  const uplift = new Float32Array(count);
  const initial = new Float32Array(count);
  const land = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const metres = source.at(i, TECT.elevation);
    elevation[i] = metres;
    initial[i] = metres;
    uplift[i] = source.at(i, TECT.uplift);
    /* Материк — всё, что выше кромки шельфа: по шельфу реки ещё текут, глубже
       уже открытое море, и водосбор там не собирается. */
    land[i] = metres > SEA_EDGE_M ? 1 : 0;
  }

  const parent = new Int32Array(count);
  const resolved = new Float32Array(count);
  const lake = new Float32Array(count);
  const order = new Int32Array(count + 1);
  const contribution = new Float32Array(count);
  const drainage = new Float32Array(count);
  const queue = new Int32Array(count + 1);

  const dt = (timeMa * 1e6) / Math.max(1, iterations);
  const dtYears = timeMa * 1e6;

  /* Осыпи: выравнивание склонов круче угла откоса. Идём по решётке несколько
     раз, каждый раз снимая превышение у самой крутой клетки пары. */
  const talus = () => {
    const limit = REPOSE_TAN * stepX;
    for (let pass = 0; pass < 4; pass += 1) {
      let moved = 0;
      for (let gy = 0; gy < h; gy += 1) {
        for (let gx = 0; gx < w; gx += 1) {
          const index = gy * w + gx;
          if (!land[index]) continue;
          for (let k = 0; k < 4; k += 1) {
            const nx = gx + (k === 0 ? 1 : k === 1 ? -1 : 0);
            const ny = gy + (k === 2 ? 1 : k === 3 ? -1 : 0);
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const other = ny * w + nx;
            if (!land[other]) continue;
            const drop = elevation[index] - elevation[other];
            if (drop <= limit) continue;
            const move = (drop - limit) * 0.5;
            elevation[index] -= move;
            elevation[other] += move;
            moved += move;
          }
        }
      }
      if (moved < 1) break;
    }
  };

  /* Один шаг модели: разметить сток, посчитать водосбор, снять материал. */
  const step = (removedTotal) => {
    const filled = routeFlow({
      width: w,
      height: h,
      elevation,
      parent,
      resolved,
      lake,
      order,
      isOutlet: (i) => land[i] === 0,
    });
    /* Вклад клетки — её площадь: тогда водосбор выходит в м². */
    for (let i = 0; i < count; i += 1) contribution[i] = land[i] ? cellArea : 0;
    drainage.fill(0);
    accumulateFromOrder({ order, filled, parent, source: contribution, flux: drainage });

    /* Неявная схема: сначала вниз по течению (порядок очереди), потом отложения
       в замкнутых впадинах не нужны — их нет по построению. */
    for (let k = 0; k < filled; k += 1) {
      const index = order[k];
      if (!land[index]) continue;
      const to = parent[index];
      if (to < 0) continue;
      const area = Math.max(drainage[index], cellArea);
      const f = erodibility * dt * Math.sqrt(area) / stepX;
      const before = elevation[index];
      elevation[index] = (before + f * elevation[to]) / (1 + f);
      const removed = before - elevation[index];
      if (removed > 0) removedTotal[index] += removed;
    }
    talus();
    return filled;
  };

  const removedTotal = new Float32Array(count);
  let filled = 0;
  for (let it = 0; it < Math.max(1, iterations); it += 1) filled = step(removedTotal);

  /* Сеть для отчёта: порядок рек по Стралеру и русла. Считается по последнему
     состоянию рельефа — тому самому, который уйдёт в пирамиду. */
  const ranks = strahlerOrder({ order, filled, parent, mask: land });
  const drainageFinal = new Float32Array(count);
  contribution.fill(0);
  for (let i = 0; i < count; i += 1) contribution[i] = land[i] ? cellArea : 0;
  accumulateFromOrder({ order, filled, parent, source: contribution, flux: drainageFinal });

  /* Снос (денудация) и врезание: сколько материала снято эрозией и сколько
     из этого пришлось на крупные русла. Врезание — это глубина дна долины
     относительно того, что было до эрозии; оно и делает рельеф горным. */
  const denudation = new Float32Array(count);
  const incision = new Float32Array(count);
  const sediment = new Float32Array(count);
  const slopeField = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    denudation[i] = initial[i] - elevation[i];
  }
  /* Твёрдый сток: сколько материала проходит через клетку (м³ за модель). */
  for (let k = 0; k < filled; k += 1) {
    const index = order[k];
    if (!land[index]) continue;
    sediment[index] += denudation[index] * cellArea;
    const to = parent[index];
    if (to >= 0) sediment[to] += sediment[index];
  }
  for (let i = 0; i < count; i += 1) {
    const areaKm2 = drainageFinal[i] / 1e6;
    /* Река врезается тем глубже, чем больше водосбор: ручей — метры, большая
       река — сотни метров. Это и есть наблюдаемая зависимость. */
    incision[i] = land[i] && areaKm2 >= CHANNEL_KM2
      ? clamp(denudation[i] * 2.4, 0, 1500)
      : 0;
    const gx = i % w;
    const gy = (i / w) | 0;
    const right = gx + 1 < w ? elevation[i + 1] : elevation[i];
    const down = gy + 1 < h ? elevation[i + w] : elevation[i];
    slopeField[i] = Math.max(Math.abs(right - elevation[i]), Math.abs(down - elevation[i])) / stepX;
  }

  /* Расчленённость: где вода работала, там мелкая деталь рельефа крупная и
     направленная по долинам; на гладких щитах и абиссали — почти нет. */
  const dissection = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const areaKm2 = drainageFinal[i] / 1e6;
    const river = areaKm2 >= CHANNEL_KM2 ? clamp(Math.log10(1 + areaKm2 / CHANNEL_KM2), 0, 2.2) : 0;
    dissection[i] = clamp(0.3 * river + 0.9 * clamp(denudation[i] / 250, 0, 1), 0, 1.8);
  }

  for (let i = 0; i < count; i += 1) {
    grid.put(i, ERO.elevation, elevation[i]);
    grid.put(i, ERO.drainage, drainageFinal[i]);
    grid.put(i, ERO.order, ranks[i]);
    grid.put(i, ERO.incision, incision[i]);
    grid.put(i, ERO.sediment, sediment[i] / (cellArea * dtYears * 1e-9));
    grid.put(i, ERO.dissection, dissection[i]);
    grid.put(i, ERO.slope, slopeField[i]);
  }

  const maxOf = (field) => {
    let top = 0;
    for (let i = 0; i < count; i += 1) if (field[i] > top) top = field[i];
    return top;
  };
  let streams = 0;
  let landCells = 0;
  let landTop = -Infinity;
  for (let i = 0; i < count; i += 1) {
    if (drainageFinal[i] >= CHANNEL_KM2 * 1e6) streams += 1;
    if (land[i]) {
      landCells += 1;
      if (elevation[i] > landTop) landTop = elevation[i];
    }
  }

  return {
    planet,
    grid,
    channels: ERO,
    /** Поля одним массивом — для климата, раскраски и проверок. */
    fields: { elevation, drainage: drainageFinal, dissection, denudation, incision, sediment, slope: slopeField, order: ranks },
    elevationAt: (mx, my) => grid.sample1(mx, my, ERO.elevation),
    drainageAt: (mx, my) => grid.sample1(mx, my, ERO.drainage),
    stats: () => ({
      cells: count,
      cellM: stepX,
      timeMa,
      erodibility,
      landCells,
      landShare: landCells / count,
      streams,
      maxDenudation: maxOf(denudation),
      maxIncision: maxOf(incision),
      maxSlope: maxOf(slopeField),
      landTop,
    }),
  };
};
