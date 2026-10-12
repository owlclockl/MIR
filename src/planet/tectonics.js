/* Тектоника плит: откуда берётся рельеф, если его не рисует шум.

   До этого модуля рельеф планеты был суммой октав шума, а «горные пояса» —
   хребтовым шумом, умноженным на маску регионов. Так получаются красивые, но
   физически пустые миры: горы стоят где угодно, океанское дно не имеет возраста,
   у берегов нет шельфа, а впадины не связаны с субдукцией.

   Здесь рельеф собирается по правилам, которые геология знает наизусть:

     • **Плиты двигаются как твёрдые тела.** В плоскости твёрдое движение — это
       поворот вокруг полюса (аналог полюса Эйлера): `v = ω × r`. Скорости
       выходят 5–60 мм/год — как у настоящих плит, и границы получаются
       гладкими, а не «звёздочкой» из центров.
     • **Тип границы — из относительной скорости.** Если проекция относительной
       скорости на нормаль границы сближает плиты — граница конвергентная,
       если разводит — дивергентная, а касательная составляющая даёт трансформную.
       Порог только один, и он в единицах скорости (мм/год).
     • **Возраст океанского дна — из расстояния до хребта.** Дно рождается на
       дивергентной границе и удаляется от неё со скоростью спрединга, поэтому
       `возраст ≈ расстояние / (половина скорости расхождения)`. Дальше работает
       связь глубины с возрастом (полупространственная модель охлаждения,
       Parsons & Sclater, 1977): `глубина = 2500 + 350·√t` м с насыщением около
       6,4 км — в точности форма реального океана.
     • **Высота суши — изостазия Эри.** Столб коры плавает на мантии, и высота
       почти линейна по толщине: щит (38 км) стоит на 200–400 м, коллизионное
       плато (70 км) — на 5 км, рифт (утонение) — ниже уровня моря. Это самая
       «объясняющая» формула модуля: высота не рисуется, а следует из толщины.
     • **Жёлоба — там, где тонут.** Конвергентная граница с океанской корой даёт
       жёлоб глубиной до 11 км на тонущей стороне, а вулканическая дуга стоит на
       200–350 км в сторону надвигающейся плиты — как в настоящих зонах
       субдукции, а не на самой границе.
     • **Горячие точки.** Несколько неподвижных плюмов дают цепочку островов
       вдоль следа движения плиты (Гавайи), а не случайные вулканы.
     • **Уровень моря выбирается по объёму воды.** Абсолютная высота условна:
       реально задан объём воды. Поэтому после сборки рельефа считается квантиль,
       при котором над водой оказывается заданная доля мира (`landTarget`), и всё
       поле сдвигается на эту величину. Отсюда и «свободный борт» материков:
       при 42 % континентальной коры над водой оказывается около 30 % — как на
       Земле, где шельфы и окраинные моря затоплены.

   Модель не претендует на численную геодинамику: это модель форм, а не мантийной
   конвекции, и время в ней свёрнуто. Её задача — чтобы рельеф **объяснялся**
   своими границами: хребты там, где сходятся, рифты там, где расходятся,
   глубокое дно — далеко от хребта. Ссылки на прототипы — в docs/planet-physics.md. */

import { clamp } from './scale.js';
import { createGrid, quantile } from './fields.js';
import { distanceField } from './flow.js';
import { fbm2, noise2 } from './noise.js';

/** Каналы поля тектоники: порядок — контракт для раскраски и проверок. */
export const TECT = {
  elevation: 0,
  crust: 1,
  age: 2,
  boundaryType: 3,
  convergence: 4,
  boundaryDist: 5,
  uplift: 6,
  seismicity: 7,
  volcanic: 8,
  craton: 9,
  hotspot: 10,
  trench: 11,
  arc: 12,
  rift: 13,
  plate: 14,
  shear: 15,
  thickness: 16,
  roughness: 17,
  belt: 18,
};
export const TECT_CHANNELS = 19;

/** Кора плиты: океанская (тонкая, плотная) или континентальная. */
export const CRUST = { OCEAN: 0, CONTINENT: 1 };
/** Тип границы. */
export const BOUNDARY = { INTERIOR: 0, DIVERGENT: 1, CONVERGENT: 2, TRANSFORM: 3 };
export const BOUNDARY_NAMES = ['внутри плиты', 'расхождение', 'схождение', 'сдвиг'];

/* ---------- параметры модели ---------- */

/** Изостазия Эри: плотность коры 2,8, мантии 3,3 г/см³ — метр толщины даёт
    0,1515 м высоты (Airy, 1855; стандартная формула изостазии). */
export const AIRY = 1 - 2.8 / 3.3;
/** Толщина коры, стоящей ровно на уровне моря, км. */
export const REFERENCE_KM = 36.2;
/** Надбавка толщины старого щита, км: до +270 м высоты. */
const CRATON_BONUS_KM = 2.4;
/** Толщина океанской коры, км: базальтовый слой плюс серпентиниты. */
const OCEANIC_KM = 7;
/** Полускорость спрединга, ниже которой хребет считается медленным, мм/год. */
const MIN_HALF_RATE = 4;
/** Насыщение глубины океана: старше этого возраста дно не глубже, м. */
const ABYSS_MAX_M = 6400;
/** Порог, с которого граница считается границей движения, мм/год. */
const MOTION_EPS = 4;
/** Пределы угловой скорости плиты, рад/млн лет: 8–45 мм/год на 1000 км. */
const OMEGA_MIN = 8.0e-3;
const OMEGA_MAX = 4.5e-2;
/** Предел утолщения коры, км: выше кора растекается под собственным весом —
    поэтому и на Земле нет гор выше девяти километров. */
const MAX_THICKENING_KM = 34;

/** Сколько клеток брать по ширине мира: клетка ≈ 50 км — предел разрешения
    тектоники, мельче уже не тектоника, а рельеф. Ограничено сверху, чтобы
    планета 4× не стоила вчетверо дороже. */
export const defaultCells = (planet) => clamp(Math.round(planet.widthM / 52_000), 192, 1024);

/** Детерминированный ГПСЧ: один и тот же seed — один и тот же мир. */
const createRandom = (seed) => {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Зародыши плит: разреженные (farthest point), а не случайные кучки — иначе
    половина плит оказывается микроплитами, а «крупных» не хватает. */
const farthestSeeds = (planet, wanted, rand) => {
  const candidates = [];
  for (let i = 0; i < wanted * 24; i += 1) {
    candidates.push({ x: rand() * planet.widthM, y: rand() * planet.heightM });
  }
  const seeds = [candidates.shift()];
  while (seeds.length < wanted && candidates.length) {
    let bestAt = 0;
    let bestDistance = -1;
    for (let i = 0; i < candidates.length; i += 1) {
      const point = candidates[i];
      let nearest = Infinity;
      for (const seed of seeds) {
        const dx = point.x - seed.x;
        const dy = point.y - seed.y;
        const d = dx * dx + dy * dy;
        if (d < nearest) nearest = d;
      }
      if (nearest > bestDistance) {
        bestDistance = nearest;
        bestAt = i;
      }
    }
    seeds.push(candidates.splice(bestAt, 1)[0]);
  }
  return seeds;
};

/* Восемь соседей: по сторонам вес 1, по диагоналям 1/√2 — сумма по границе
   тогда не зависит от того, как линия легла на решётку. */
const OFFSET_X = new Int8Array([1, -1, 0, 0, 1, -1, 1, -1]);
const OFFSET_Y = new Int8Array([0, 0, 1, -1, 1, -1, -1, 1]);
const OFFSET_W = new Float32Array([1, 1, 1, 1, Math.SQRT1_2, Math.SQRT1_2, Math.SQRT1_2, Math.SQRT1_2]);

/**
 * Плиты и рельеф из них.
 *
 * @param {object} planet — геометрия из scale.js
 * @param {{cells?: number, landTarget?: number, continentalTarget?: number}} [options]
 *   `landTarget` — доля мира над водой (калибруется сдвигом поля),
 *   `continentalTarget` — доля площади под континентальной корой
 */
export const createTectonics = (planet, { cells = 0, landTarget = 0.3, continentalTarget = 0.42 } = {}) => {
  const rand = createRandom(planet.seedNumber);
  const grid = createGrid(planet, { cells: cells || defaultCells(planet), channels: TECT_CHANNELS });
  const { w, h, data, stepX, stepY } = grid;
  const count = w * h;
  const channel = (index, c) => data[index * TECT_CHANNELS + c];
  const put = (index, c, value) => {
    data[index * TECT_CHANNELS + c] = value;
  };
  const crustOf = (index) => channel(index, TECT.crust);

  /* ---------- 1. плиты ---------- */

  /* Число плит — свойство мира, а не его размера: на Земле семь крупных и
     десятки мелких. Мелкие получаются сами: зародыш, попавший в чужую область,
     становится микроплитой. */
  const plateCount = clamp(Math.round(9 + rand() * 6), 6, 18);
  const seeds = farthestSeeds(planet, plateCount, rand);
  const noiseSeed = (planet.seedNumber ^ 0x5bf03635) >>> 0;

  /* Принадлежность клетки: ближайший зародыш, но расстояние искажено шумом —
     иначе границы плит выходят идеально прямыми линиями Вороного. */
  const plateOf = new Uint8Array(count);
  const warpF = 1.6 / planet.widthM;
  for (let gy = 0; gy < h; gy += 1) {
    const y = (gy + 0.5) * stepY;
    for (let gx = 0; gx < w; gx += 1) {
      const x = (gx + 0.5) * stepX;
      const bend = 1 + 0.12 * noise2(x * warpF, y * warpF, noiseSeed);
      let best = 0;
      let bestDistance = Infinity;
      for (let p = 0; p < seeds.length; p += 1) {
        const dx = x - seeds[p].x;
        const dy = y - seeds[p].y;
        const d = (dx * dx + dy * dy) * bend;
        if (d < bestDistance) {
          bestDistance = d;
          best = p;
        }
      }
      plateOf[gy * w + gx] = best;
    }
  }

  const areas = new Float64Array(seeds.length);
  for (let i = 0; i < count; i += 1) areas[plateOf[i]] += stepX * stepY;
  const totalArea = planet.widthM * planet.heightM;

  /* Континентальной корой наделяем крупнейшие плиты, пока она не займёт
     заданную долю площади: так возникает главное свойство Земли — континенты
     собраны в немногие большие массивы, а не размазаны ровным слоем.
     Плита добавляется, только если не перебирает долю: иначе одна огромная
     плита уводила бы континентальную кору к половине мира. */
  const byArea = [...areas.keys()].sort((a, b) => areas[b] - areas[a]);
  const continental = new Uint8Array(seeds.length);
  let continentalArea = 0;
  for (const plate of byArea) {
    const grown = (continentalArea + areas[plate]) / totalArea;
    if (grown > continentalTarget + 0.04 && continentalArea > 0) continue;
    continental[plate] = 1;
    continentalArea += areas[plate];
    if (continentalArea / totalArea >= continentalTarget) break;
  }

  /* ---------- 2. движение плит ---------- */

  const plates = seeds.map((seed, id) => {
    /* Полюс поворота — внутри плиты: тогда на одном конце границы плиты
       сходятся, а на другом расходятся, без всякой подгонки. */
    const jitter = 0.35 * Math.sqrt(areas[id] / Math.PI);
    const pivot = {
      x: clamp(seed.x + (rand() - 0.5) * 2 * jitter, 0, planet.widthM),
      y: clamp(seed.y + (rand() - 0.5) * 2 * jitter, 0, planet.heightM),
    };
    const omega = (OMEGA_MIN + rand() * (OMEGA_MAX - OMEGA_MIN)) * (rand() < 0.5 ? -1 : 1);
    return { id, seed, pivot, omega, continental: continental[id] === 1, area: areas[id], areaShare: areas[id] / totalArea };
  });

  /* Скорость в мм/год: ω (рад/млн лет) × радиус (м) даёт м/млн лет, а это
     ровно 10⁻³ мм/год (1 м/млн лет = 1 мм/тыс. лет = 10⁻³ мм/год). Скорости
     разных точек одной плиты разные — это и есть твёрдое вращение. */
  const speedAt = (plate, x, y) => {
    const vx = -plate.omega * (y - plate.pivot.y) * 1e-3;
    const vy = plate.omega * (x - plate.pivot.x) * 1e-3;
    return { vx, vy };
  };

  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  const speed = new Float32Array(count);
  for (let gy = 0; gy < h; gy += 1) {
    const y = (gy + 0.5) * stepY;
    for (let gx = 0; gx < w; gx += 1) {
      const x = (gx + 0.5) * stepX;
      const index = gy * w + gx;
      const plate = plates[plateOf[index]];
      put(index, TECT.crust, plate.continental ? CRUST.CONTINENT : CRUST.OCEAN);
      put(index, TECT.plate, plate.id);
      const v = speedAt(plate, x, y);
      vx[index] = v.vx;
      vy[index] = v.vy;
      speed[index] = Math.hypot(v.vx, v.vy);
    }
  }

  /* ---------- 3. границы: тип из относительной скорости ---------- */

  const boundaryType = new Uint8Array(count);
  const isConvergent = new Uint8Array(count);
  const isDivergent = new Uint8Array(count);
  const convergentStrength = new Float32Array(count);

  for (let gy = 0; gy < h; gy += 1) {
    for (let gx = 0; gx < w; gx += 1) {
      const index = gy * w + gx;
      const plate = plateOf[index];
      let conv = 0;
      let div = 0;
      let slip = 0;
      let weight = 0;
      for (let k = 0; k < 8; k += 1) {
        const nx = gx + OFFSET_X[k];
        const ny = gy + OFFSET_Y[k];
        /* За рамкой карты соседей нет: край мира — это рамка, а не шов. */
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const other = ny * w + nx;
        weight += OFFSET_W[k];
        if (plateOf[other] === plate) continue;
        const rvx = vx[index] - vx[other];
        const rvy = vy[index] - vy[other];
        /* Нормаль смотрит в сторону соседа: сближение — это когда
           относительная скорость направлена против неё. */
        const nxu = OFFSET_X[k] * OFFSET_W[k] / Math.hypot(OFFSET_X[k], OFFSET_Y[k]);
        const nyu = OFFSET_Y[k] * OFFSET_W[k] / Math.hypot(OFFSET_X[k], OFFSET_Y[k]);
        const along = rvx * nxu + rvy * nyu;
        const closing = -along;
        if (closing > 0) conv += closing;
        else div += -closing;
        slip += Math.hypot(rvx - along * nxu, rvy - along * nyu);
      }
      if (weight === 0) continue;
      conv /= weight;
      div /= weight;
      slip /= weight;
      if (conv === 0 && div === 0 && slip === 0) continue;
      put(index, TECT.convergence, conv - div);
      put(index, TECT.shear, slip);
      const type = conv >= div * 1.15 && conv > MOTION_EPS
        ? BOUNDARY.CONVERGENT
        : div >= conv * 1.15 && div > MOTION_EPS
          ? BOUNDARY.DIVERGENT
          : BOUNDARY.TRANSFORM;
      boundaryType[index] = type;
      put(index, TECT.boundaryType, type);
      if (type === BOUNDARY.CONVERGENT) {
        isConvergent[index] = 1;
        convergentStrength[index] = conv;
      } else if (type === BOUNDARY.DIVERGENT) {
        isDivergent[index] = 1;
      }
    }
  }

  /* ---------- 4. расстояния до границ — по классам ---------- */

  /* Классы разведены не для порядка: жёлоб встаёт на **тонущую** (океанскую)
     сторону, а утолщение коры и вулканическая дуга — на **надвигающуюся**
     (континентальную). Общее расстояние «до ближайшей границы» для этого не
     годится: у берега с субдукцией океан и континент рядом, и знак можно
     перепутать. Поэтому расстояний несколько, и они считаются отдельно. */
  const distanceAny = distanceField({ width: w, height: h, cell: stepX, isSeed: (i) => boundaryType[i] !== BOUNDARY.INTERIOR });
  const distanceConvCont = distanceField({
    width: w, height: h, cell: stepX,
    isSeed: (i) => isConvergent[i] === 1 && crustOf(i) === CRUST.CONTINENT,
  });
  const distanceConvOcean = distanceField({
    width: w, height: h, cell: stepX,
    isSeed: (i) => isConvergent[i] === 1 && crustOf(i) === CRUST.OCEAN,
  });
  /* Хребты внутри большой океанской плиты. У реальной Земли хребет режет
     плиту почти пополам (Восточно-Тихоокеанское поднятие), и именно поэтому
     средний возраст дна — около 60 млн лет, а не 200: будь хребет только на
     краю плиты, вся её середина была бы древней. Ось рисуется через зародыш
     плиты случайным направлением. */
  const internalRidge = new Uint8Array(count);
  const ridgeAxes = [];
  for (const plate of plates) {
    if (plate.continental || plate.areaShare < 0.05) continue;
    const angle = rand() * Math.PI;
    ridgeAxes.push([plate.seed.x, plate.seed.y, Math.cos(angle), Math.sin(angle)]);
  }
  const axisHalfWidth = stepX * 0.6;
  for (let gy = 0; gy < h; gy += 1) {
    const y = (gy + 0.5) * stepY;
    for (let gx = 0; gx < w; gx += 1) {
      const index = gy * w + gx;
      if (crustOf(index) !== CRUST.OCEAN) continue;
      const x = (gx + 0.5) * stepX;
      for (const axis of ridgeAxes) {
        /* Расстояние до прямой оси: перпендикуляр от точки до неё. */
        const along = (x - axis[0]) * axis[3] - (y - axis[1]) * axis[2];
        if (Math.abs(along) < axisHalfWidth) {
          internalRidge[index] = 1;
          break;
        }
      }
    }
  }

  const distanceRidgeOcean = distanceField({
    width: w, height: h, cell: stepX,
    isSeed: (i) => internalRidge[i] === 1 || (isDivergent[i] === 1 && crustOf(i) === CRUST.OCEAN),
  });
  const distanceRidgeCont = distanceField({
    width: w, height: h, cell: stepX,
    isSeed: (i) => isDivergent[i] === 1 && crustOf(i) === CRUST.CONTINENT,
  });
  /* Расстояние до края своей коры: у пассивной окраины должны быть шельф и
     континентальный склон, а не обрыв платформы в абиссаль. */
  const distanceCrustEdge = distanceField({
    width: w, height: h, cell: stepX,
    isSeed: (i, gx, gy) => {
      const crust = crustOf(i);
      if (gx > 0 && crustOf(i - 1) !== crust) return true;
      if (gx < w - 1 && crustOf(i + 1) !== crust) return true;
      if (gy > 0 && crustOf(i - w) !== crust) return true;
      if (gy < h - 1 && crustOf(i + w) !== crust) return true;
      return false;
    },
  });
  for (let i = 0; i < count; i += 1) put(i, TECT.boundaryDist, distanceAny[i]);

  /* Скорость сближения ближайшей границы разносится волной (BFS): chamfer
     умеет только расстояние, а нужен ещё и «характер» границы — от него зависят
     и высота орогена, и глубина жёлоба. */
  const queue = new Int32Array(count + 1);
  const spreadStrength = (seedTest) => {
    const out = new Float32Array(count);
    const seen = new Uint8Array(count);
    let head = 0;
    let tail = 0;
    for (let i = 0; i < count; i += 1) {
      if (!isConvergent[i] || !seedTest(i)) continue;
      out[i] = convergentStrength[i];
      seen[i] = 1;
      queue[tail] = i;
      tail += 1;
    }
    while (head < tail) {
      const index = queue[head];
      head += 1;
      const gx = index % w;
      const gy = (index / w) | 0;
      for (let k = 0; k < 8; k += 1) {
        const nx = gx + OFFSET_X[k];
        const ny = gy + OFFSET_Y[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const other = ny * w + nx;
        if (seen[other]) continue;
        seen[other] = 1;
        out[other] = out[index];
        queue[tail] = other;
        tail += 1;
      }
    }
    return out;
  };
  const strengthConvCont = spreadStrength((i) => crustOf(i) === CRUST.CONTINENT);
  const strengthConvOcean = spreadStrength((i) => crustOf(i) === CRUST.OCEAN);

  /* Скорость расхождения разносится так же: от неё зависит возраст дна, а он
     не может быть «расстояние делить на что попало». Настоящие полускорости
     спрединга — 10–50 мм/год (полная 20–100). */
  const spreadDivergence = (() => {
    const out = new Float32Array(count);
    const seen = new Uint8Array(count);
    let head = 0;
    let tail = 0;
    for (let i = 0; i < count; i += 1) {
      if (!isDivergent[i] || crustOf(i) !== CRUST.OCEAN) continue;
      out[i] = Math.abs(channel(i, TECT.convergence));
      seen[i] = 1;
      queue[tail] = i;
      tail += 1;
    }
    while (head < tail) {
      const index = queue[head];
      head += 1;
      const gx = index % w;
      const gy = (index / w) | 0;
      for (let k = 0; k < 8; k += 1) {
        const nx = gx + OFFSET_X[k];
        const ny = gy + OFFSET_Y[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const other = ny * w + nx;
        if (seen[other] || crustOf(other) !== CRUST.OCEAN) continue;
        seen[other] = 1;
        out[other] = out[index];
        queue[tail] = other;
        tail += 1;
      }
    }
    return out;
  })();

  /* ---------- 5. шум коры: щиты, шероховатость ---------- */

  /* Щит — старая, холодная, всплывшая кора вдали от границ. Он и толще, и
     ровнее: на платформе нет гор. Нужен и как поле (слой «породы»), и как
     множитель рельефа. */
  /* Характерные скорости и возрасты плит: скорость спрединга там, где рядом нет
     границы, и предельный возраст коры — он не больше возраста самой плиты. */
  const plateHalfRate = plates.map((plate) => (plate.continental ? 0 : 7 + rand() * 22));
  const plateAge = plates.map((plate) => (plate.continental ? 0 : 30 + rand() * 140));

  const cratonNoise = new Float32Array(count);
  for (let gy = 0; gy < h; gy += 1) {
    const y = (gy + 0.5) * stepY;
    for (let gx = 0; gx < w; gx += 1) {
      const x = (gx + 0.5) * stepX;
      cratonNoise[gy * w + gx] = clamp(
        0.5 + 0.5 * fbm2(x, y, { seed: noiseSeed + 77, octaves: 3, frequency: 3.2 / planet.widthM, gain: 0.55 }),
        0,
        1,
      );
    }
  }

  /* ---------- 6. высота: изостазия, охлаждение дна, жёлоба ---------- */

  const elevation = new Float32Array(count);
  const age = new Float32Array(count);
  const thickness = new Float32Array(count);
  const uplift = new Float32Array(count);
  const trench = new Float32Array(count);
  const arc = new Float32Array(count);
  const rift = new Float32Array(count);
  const volcanic = new Float32Array(count);
  const seismic = new Float32Array(count);
  const craton = new Float32Array(count);
  const belt = new Float32Array(count);
  const roughness = new Float32Array(count);

  const UPLIFT_BACKGROUND = 0.04;
  for (let i = 0; i < count; i += 1) {
    const continentalCell = crustOf(i) === CRUST.CONTINENT;
    const dAny = distanceAny[i];
    /* Щит: старая, холодная, всплывшая кора вдали от границ. Он и толще, и
       ровнее — на платформе нет гор. */
    const cratonValue = continentalCell ? clamp(cratonNoise[i] * 1.15 + dAny / 4_000_000 - 0.35, 0, 1) : 0;
    craton[i] = cratonValue;
    put(i, TECT.craton, cratonValue);

    let thick = continentalCell ? REFERENCE_KM + CRATON_BONUS_KM * (cratonValue - 0.4) : OCEANIC_KM;
    let u = UPLIFT_BACKGROUND * (1 + 1.6 * (1 - cratonValue));
    let beltHere = 0;
    let volcanicHere = 0;

    /* Возраст океанского дна считается до всего остального: от него зависит и
       глубина жёлоба (холодная кора тонет глубже), и высота дна. */
    let ageNow = 0;
    if (!continentalCell) {
      const dRidge = distanceRidgeOcean[i] / 1000; // км
      const spread = spreadDivergence[i];
      const halfRate = spread > 0 ? clamp(spread * 0.5, MIN_HALF_RATE, 60) : plateHalfRate[plateOf[i]];
      /* Возраст дна не растёт бесконечно: кора моложе самой плиты быть не может,
         а старая успевает уйти в жёлоб. Поэтому возраст насыщается по
         (1 − e^{-d/(v·T)}): у хребта он линеен по расстоянию, как и должно
         быть, а в глубине бассейна выходит на возраст плиты. */
      const cap = plateAge[plateOf[i]];
      ageNow = cap * (1 - Math.exp(-dRidge / (halfRate * cap)));
    }
    age[i] = ageNow;
    put(i, TECT.age, ageNow);

    /* --- сходящиеся границы --- */
    if (continentalCell) {
      const conv = strengthConvCont[i];
      const dConv = distanceConvCont[i];
      if (conv > MOTION_EPS && dConv < 1_600_000) {
        const rate = Math.min(conv, 120);
        /* Сближение идёт волной от самой границы: узкий пик в ядре пояса и
           широкое плато вокруг — так выглядят Гималаи с Тибетом. */
        const narrow = Math.exp(-((dConv / 450_000) ** 2));
        const broad = Math.exp(-((dConv / 1300_000) ** 2));
        const shape = 0.55 * narrow + 0.45 * broad;
        thick += 24 * Math.min(rate / 55, 1.25) * shape;
        u += 0.6 * Math.min(rate / 60, 1.2) * shape;
        beltHere = clamp(narrow * 1.4, 0, 1);
        volcanicHere = 0.55 * Math.exp(-(((dConv - 230_000) / 120_000) ** 2));
      }
    } else {
      const conv = strengthConvOcean[i];
      const dConv = distanceConvOcean[i];
      if (conv > MOTION_EPS && dConv < 1_400_000) {
        const rate = Math.min(conv, 120);
        /* Жёлоб: впадина на тонущей плите, узкая (первые сотни километров) и
           глубокая — до 11 км, если кора старая и холодная. Так устроены все
           настоящие жёлоба: чем холоднее тонущая плита, тем глубже впадина. */
        const trenchShape = Math.exp(-((dConv / 90_000) ** 2));
        trench[i] = Math.min(9000, trenchShape * Math.min(rate / 12, 9) * (150 + 4.5 * rate + 1.2 * ageNow));
        /* Вулканическая дуга — на 200–350 км в глубину надвигающейся плиты:
           там, где тонущая плита отдаёт воду и плавится. */
        const arcShape = Math.exp(-(((dConv - 260_000) / 150_000) ** 2));
        arc[i] = arcShape * Math.min(3200, 600 + 22 * rate);
        volcanicHere = arcShape;
        beltHere = clamp(arcShape * 1.2, 0, 1);
      }
    }

    /* --- расходящиеся границы --- */
    if (continentalCell) {
      const dRidge = distanceRidgeCont[i];
      if (dRidge < 1_100_000) {
        const rate = Math.abs(channel(i, TECT.convergence));
        const axis = Math.exp(-((dRidge / 70_000) ** 2));
        const shoulder = Math.exp(-(((dRidge - 140_000) / 110_000) ** 2));
        /* Рифт — это утонение коры: ось оседает, плечи всплывают (Байкал,
           Восточно-Африканский рифт). */
        const amount = Math.min(rate / 40, 1.5);
        rift[i] = clamp(axis * amount, 0, 1);
        thick -= axis * 9 * amount;
        thick += shoulder * 1.5 * amount;
        u += 0.3 * shoulder * Math.min(rate, 60) / 60;
        volcanicHere = Math.max(volcanicHere, 0.35 * shoulder);
      }
    }

    thickness[i] = clamp(thick, OCEANIC_KM, REFERENCE_KM + MAX_THICKENING_KM);
    put(i, TECT.thickness, thickness[i]);
    put(i, TECT.trench, trench[i]);
    put(i, TECT.arc, arc[i]);
    put(i, TECT.rift, rift[i]);
    uplift[i] = u;
    put(i, TECT.uplift, u);
    belt[i] = beltHere;
    put(i, TECT.belt, beltHere);

    /* Сейсмика: у сходящихся границ широкая зона (субдукционные пояса тянутся
       вглубь материка на сотни километров), у сдвигов и рифтов — узкая линия. */
    const convWindow = continentalCell ? distanceConvCont[i] : distanceConvOcean[i];
    const convStrength = continentalCell ? strengthConvCont[i] : strengthConvOcean[i];
    const convWave = convStrength > MOTION_EPS ? Math.exp(-convWindow / 380_000) * (0.35 + Math.min(convStrength, 80) / 60) : 0;
    const anyWave = Math.exp(-dAny / 90_000) * (0.25 + speed[i] / 90);
    seismic[i] = clamp(0.72 * convWave + 0.42 * anyWave, 0, 1);
    put(i, TECT.seismicity, seismic[i]);
    volcanic[i] = clamp(volcanicHere, 0, 1);
    put(i, TECT.volcanic, volcanic[i]);

    /* Высота: суша — изостазия Эри (высота почти линейна по толщине коры),
       океан — остывание литосферы (глубина растёт как √t). Две разные физики
       на одной карте — так и на Земле: материки плавают, дно оседает. */
    if (continentalCell) {
      elevation[i] = (thickness[i] - REFERENCE_KM) * AIRY * 1000 + (cratonNoise[i] - 0.5) * 260;
    } else {
      /* Полупространственная модель (√t, Parsons & Sclater 1977) верна только до
         ~70 млн лет; дальше работает плитная модель (Stein & Stein, 1992):
         глубина выходит на 5,8–6,1 км и почти не растёт. Без этого насыщения
         весь старый океан лежал бы на одной предельной глубине. */
      const floor = -(2500 + 3650 * (1 - Math.exp(-Math.max(ageNow, 0) / 62.8)));
      elevation[i] = Math.max(-ABYSS_MAX_M, floor) + arc[i] - trench[i];
    }
  }

  /* ---------- 7. горячие точки ---------- */

  /* Плюм стоит на месте (в мантии), плита едет — остаётся цепочка островов:
     направление следа поэтому противоположно скорости плиты. Острова по следу
     стареют и оседают: Гавайи моложе и выше, чем подводные горы на их конце. */
  const hotspotCount = 3 + Math.floor(rand() * 4);
  const hotspots = [];
  for (let k = 0; k < hotspotCount; k += 1) {
    const x = rand() * planet.widthM;
    const y = rand() * planet.heightM;
    const cellIndex = grid.cellOf(x, y);
    const plate = plates[plateOf[cellIndex]];
    const v = speedAt(plate, x, y);
    const vlen = Math.hypot(v.vx, v.vy) || 1;
    hotspots.push({
      x, y,
      plate: plate.id,
      strength: 0.55 + rand() * 0.45,
      vx: v.vx / vlen,
      vy: v.vy / vlen,
      speed: vlen,
    });
  }
  const hotspotField = new Float32Array(count);
  for (const spot of hotspots) {
    /* След длиной до 2500 км: за это время плита уезжает на сотни километров,
       и постройки вдоль следа успевают осесть под воду. */
    const trailLength = clamp(spot.speed * 1000 * 40, 400_000, 2_500_000);
    const steps = 16;
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const px = spot.x - spot.vx * trailLength * t;
      const py = spot.y - spot.vy * trailLength * t;
      /* Затухание ∝ (1 − t)^1,4 и рост радиуса: старые постройки ниже и шире. */
      const fade = (1 - t) ** 1.4 * spot.strength;
      const radius = 90_000 + 150_000 * t;
      const before = clamp(Math.floor((px - radius) / stepX), 0, w - 1);
      const after = clamp(Math.ceil((px + radius) / stepX), 0, w - 1);
      const up = clamp(Math.floor((py - radius) / stepY), 0, h - 1);
      const down = clamp(Math.ceil((py + radius) / stepY), 0, h - 1);
      for (let yy = up; yy <= down; yy += 1) {
        for (let xx = before; xx <= after; xx += 1) {
          const index = yy * w + xx;
          const mx = (xx + 0.5) * stepX - px;
          const my = (yy + 0.5) * stepY - py;
          const bump = Math.exp(-((Math.hypot(mx, my) / radius) ** 2)) * fade;
          if (bump <= 0.01) continue;
          hotspotField[index] = Math.max(hotspotField[index], bump);
        }
      }
    }
  }
  for (let i = 0; i < count; i += 1) {
    put(i, TECT.hotspot, hotspotField[i]);
    volcanic[i] = clamp(Math.max(volcanic[i], hotspotField[i] * 1.1), 0, 1);
    put(i, TECT.volcanic, volcanic[i]);
    /* Океанские острова выше континентальных лав: над водой их поднимает
       только вулкан, а не кора. */
    elevation[i] += hotspotField[i] * (crustOf(i) === CRUST.CONTINENT ? 1200 : 3200);
    if (hotspotField[i] > 0.35) belt[i] = Math.max(belt[i], hotspotField[i] * 0.8);
  }

  /* ---------- 8. пассивные окраины ---------- */

  /* Шельф (первые 260 км от края коры), континентальный склон и подножие.: шельф (до 250 км), континентальный склон и подножие.
     Без этого берег был бы обрывом с платформы в абиссаль, а на Земле между
     ними 200–300 км — и именно там стоят шельфовые моря. */
  const SHELF_WIDTH = 260_000;
  const RISE_WIDTH = 220_000;
  for (let i = 0; i < count; i += 1) {
    const d = distanceCrustEdge[i];
    if (crustOf(i) === CRUST.CONTINENT && d < SHELF_WIDTH) {
      const t = clamp(d / SHELF_WIDTH, 0, 1);
      const smooth = t * t * (3 - 2 * t);
      const shelf = -190;
      elevation[i] = shelf + (elevation[i] - shelf) * smooth;
    } else if (crustOf(i) === CRUST.OCEAN && d < RISE_WIDTH) {
      const t = clamp(d / RISE_WIDTH, 0, 1);
      const smooth = t * t * (3 - 2 * t);
      const slope = -2400;
      elevation[i] = Math.max(-4600, slope + (elevation[i] - slope) * smooth);
    }
  }

  /* ---------- 9. уровень моря: объём воды ---------- */

  /* Уровень моря задан физикой: он и есть ноль шкалы (высота щита выведена из
     Airy, глубина дна — из остывания литосферы, и оба отсчёта — от воды).
     Калибровка остаётся ровно на одну неопределённость — **объём воды**: у
     мира, где воды больше, берег заливает платформы. Сдвиг поэтому ограничен
     четырьмястами метрами: это правка объёма океана, а не замена гипсометрии
     подгонкой. Доля суши получается следствием, а не входным числом. */
  for (let i = 0; i < count; i += 1) put(i, TECT.elevation, elevation[i]);
  const rawOffset = quantile(grid, TECT.elevation, 1 - landTarget);
  const seaLevelOffset = clamp(rawOffset, -400, 400);
  let landCells = 0;
  for (let i = 0; i < count; i += 1) {
    elevation[i] -= seaLevelOffset;
    put(i, TECT.elevation, elevation[i]);
    if (elevation[i] > 0) landCells += 1;
  }

  /* Шероховатость для детали рельефа: в орогенах и на вулканических плато
     мелкая деталь крупная, на щитах и абиссали — почти нет. Это не украшение:
     реальный рельеф тоже растёт вместе с поднятием, и «гладкая равнина рядом с
     рублеными горами» — первый признак нарисованной, а не посчитанной карты. */
  for (let i = 0; i < count; i += 1) {
    const roughnessHere = clamp(
      0.25 + 1.15 * belt[i] + 0.5 * volcanic[i] + 0.45 * clamp(uplift[i] / 0.8, 0, 1) - 0.35 * craton[i],
      0.12,
      1.6,
    );
    roughness[i] = roughnessHere;
    put(i, TECT.roughness, roughnessHere);
  }

  const maxOf = (field) => {
    let top = 0;
    for (let i = 0; i < count; i += 1) if (field[i] > top) top = field[i];
    return top;
  };
  const meanOf = (field) => {
    let sum = 0;
    for (let i = 0; i < count; i += 1) sum += field[i];
    return sum / count;
  };

  return {
    planet,
    grid,
    channels: TECT,
    plates,
    hotspots,
    /** Сдвиг, которым уровень моря подогнан под заданную долю суши, м. */
    seaLevelOffset,
    stats: () => ({
      cells: count,
      cellM: stepX,
      plates: plates.length,
      continentalShare: continentalArea / totalArea,
      landShare: landCells / count,
      seaLevelOffset,
      maxThicknessKm: maxOf(thickness),
      minThicknessKm: 4,
      maxTrenchM: maxOf(trench),
      meanUplift: meanOf(uplift),
      maxUplift: maxOf(uplift),
      meanAgeMa: meanOf(age),
    }),
    elevationAt: (mx, my) => grid.sample1(mx, my, TECT.elevation),
    thicknessAt: (mx, my) => grid.sample1(mx, my, TECT.thickness),
    ageAt: (mx, my) => grid.sample1(mx, my, TECT.age),
    upliftAt: (mx, my) => grid.sample1(mx, my, TECT.uplift),
    /** Поля одним массивом — для эрозии, климата и проверок. */
    fields: {
      elevation,
      uplift,
      age,
      thickness,
      trench,
      arc,
      rift,
      craton,
      belt,
      roughness,
      volcanic,
      seismic,
      hotspot: hotspotField,
      plate: plateOf,
      boundaryType,
    },
  };
};
