/* Океан: течения и температура воды.

   Океан в климате — не декорация. Он испаряет влагу, переносит тепло на тысячи
   километров и делает берега либо тёплыми (Гольфстрим у Норвегии), либо
   холодными и сухими (Бенгела у Намиба, Перуанское течение у Атакамы). Без
   течений пустыни встают не там, где они есть на Земле.

   Модель — двухслойная по смыслу, но одномерная по стоимости:

     • **Ветер гонит воду.** Напряжение ветра берётся из атмосферы; под
       действием силы Кориолиса поток отклоняется вправо в северном полушарии и
       влево в южном (спираль Экмана, угол 45°).
     • **Берега замыкают круговороты.** Векторное поле течений релаксируется
       диффузией с условием «не течь в берег»: нормальная составляющая у берега
       снимается. Это то же условие непротекания, что и в океанографии, и
       именно оно превращает прямолинейный дрейф в замкнутые субтропические
       круговороты — по часовой стрелке в северном полушарии, против — в южном.
     • **Температура воды — адвекция и диффузия.** Аномалия температуры
       переносится течением, перемешивается и уходит в атмосферу: тёплая вода
       остывает, холодная греется. Плюс источник холода у восточных берегов
       (апвеллинг: ветер сгоняет воду от берега, и поднимается холодная из
       глубины).
     • **Апвеллинг и есть причина береговых пустынь.** Холодная вода не
       испаряет влагу (испарение падает с температурой воды), и дождь над таким
       берегом не выпадает, даже если ветер приносит воздух с моря.

   Как всегда, всё считается один раз на грубой решётке и опрашивается
   билинейно: значение в точке не зависит от уровня приближения. */

import { clamp, metersToGeo } from './scale.js';
import { annualSeaTemperature } from './atmosphere.js';

export const OCEAN = {
  currentX: 0,
  currentY: 1,
  speed: 2,
  sst: 3,
  anomaly: 4,
  upwelling: 5,
  ice: 6,
  gyre: 7,
};
export const OCEAN_CHANNELS = 8;

/** Угол Экмана, радианы: 45° — классическая оценка для однородного слоя. */
const EKMAN_ANGLE = Math.PI / 4;
/** Сколько шагов релаксации делает поле течений. */
const RELAX_STEPS = 48;
/** Глубина перемешивания и время переноса тепла: τ аномалии, шагов модели. */
const ANOMALY_STEPS = 90;
/** Холод апвеллинга, °C; тёплое течение добавляет столько же с обратным знаком. */
const UPWELL_DROP = 7;
/** Сколько градусов снимает с температуры воды сам апвеллинг. У Перу и
   Бенгелы вода на 4–8 °C холоднее той же широты в открытом океане — это и
   есть береговая пустыня. */
const UPWELL_SST = 6;
/** Аномалия течения: сколько градусов приносит течение в точку. */
const ADVECT_MIX = 0.35;

/**
 * Течения и температура воды.
 *
 * @param {object} planet — геометрия
 * @param {object} grid — грубая решётка в метрах (эрозия поверх тектоники)
 * @param {object} masks — `{ land, continentality, heightM }`
 * @param {object} atmosphere — сезонная атмосфера (`createSeasonAtmosphere`)
 * @param {object} [options]
 */
export const createOcean = (planet, grid, masks, atmosphere, { } = {}) => {
  const { w, h } = grid;
  const count = w * h;
  const land = masks.land;
  /* Широта — свойство строки: считаем раз на строку, а не на клетку. */
  const rowLat = new Float64Array(h);
  for (let gy = 0; gy < h; gy += 1) rowLat[gy] = metersToGeo(planet, 0, (gy + 0.5) * grid.stepY).lat;
  const u = new Float32Array(count);
  const v = new Float32Array(count);
  const oceanMask = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) oceanMask[i] = land[i] ? 0 : 1;

  const neighbour = (index, dx, dy) => {
    const gx = index % w;
    const gy = (index / w) | 0;
    const nx = gx + dx;
    const ny = gy + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) return -1;
    return ny * w + nx;
  };

  /* ---------- 1. ветровой дрейф ---------- */

  for (let i = 0; i < count; i += 1) {
    if (!oceanMask[i]) continue;
    const lat = rowLat[(i / w) | 0];
    /* Отклонение Экмана: вправо в северном полушарии, влево в южном. */
    const angle = lat >= 0 ? EKMAN_ANGLE : -EKMAN_ANGLE;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const wx = atmosphere.windU[i];
    const wy = atmosphere.windV[i];
    u[i] = wx * ca - wy * sa;
    v[i] = wx * sa + wy * ca;
  }

  /* ---------- 2. релаксация с непротеканием ---------- */

  /* Диффузия размывает дрейф в гладкое поле, а условие непротекания у берега
     закручивает его в круговороты: вода упирается в материк и идёт вдоль него. */
  const nextU = new Float32Array(count);
  const nextV = new Float32Array(count);
  const landNormal = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    if (oceanMask[i]) continue;
    /* Нормаль к берегу: градиент маски суши. */
    let nx = 0;
    let ny = 0;
    const e = neighbour(i, 1, 0);
    const west = neighbour(i, -1, 0);
    const s = neighbour(i, 0, 1);
    const n = neighbour(i, 0, -1);
    if (e >= 0 && oceanMask[e]) nx += 1;
    if (west >= 0 && oceanMask[west]) nx -= 1;
    if (s >= 0 && oceanMask[s]) ny += 1;
    if (n >= 0 && oceanMask[n]) ny -= 1;
    const length = Math.hypot(nx, ny);
    if (length > 0) {
      landNormal[i * 2] = nx / length;
      landNormal[i * 2 + 1] = ny / length;
    }
  }
  /* Смещения соседей — плоскими массивами, а обход — по индексам: сорок восемь
     шагов по трёхсоттысячной решётке не прощают ни выделения массива пар в
     клетке, ни лишнего деления. */
  const DX8 = [1, -1, 0, 0, 1, -1, 1, -1];
  const DY8 = [0, 0, 1, -1, 1, -1, -1, 1];
  const K8 = [1, 1, 1, 1, 0.5, 0.5, 0.5, 0.5];
  for (let step = 0; step < RELAX_STEPS; step += 1) {
    for (let gy = 0; gy < h; gy += 1) {
      const base = gy * w;
      for (let gx = 0; gx < w; gx += 1) {
        const i = base + gx;
        if (!oceanMask[i]) {
          nextU[i] = 0;
          nextV[i] = 0;
          continue;
        }
        let sumU = u[i] * 2;
        let sumV = v[i] * 2;
        let weight = 2;
        for (let k = 0; k < 8; k += 1) {
          const nx = gx + DX8[k];
          const ny = gy + DY8[k];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const other = ny * w + nx;
          if (!oceanMask[other]) continue;
          const kk = K8[k];
          sumU += u[other] * kk;
          sumV += v[other] * kk;
          weight += kk;
        }
        nextU[i] = sumU / weight;
        nextV[i] = sumV / weight;
      }
    }
    /* У берега снимаем нормальную составляющую: вода не течёт в сушу. Это и
       есть условие непротекания; после него поток разворачивается вдоль берега
       и круговорот замыкается. Нормаль у оси координат единичная, поэтому
       проекция на неё — просто составляющая вектора. */
    for (let gy = 0; gy < h; gy += 1) {
      const base = gy * w;
      for (let gx = 0; gx < w; gx += 1) {
        const i = base + gx;
        if (!oceanMask[i]) continue;
        if (gx < w - 1 && !oceanMask[i + 1] && nextU[i] > 0) nextU[i] = 0;
        else if (gx > 0 && !oceanMask[i - 1] && nextU[i] < 0) nextU[i] = 0;
        if (gy < h - 1 && !oceanMask[i + w] && nextV[i] > 0) nextV[i] = 0;
        else if (gy > 0 && !oceanMask[i - w] && nextV[i] < 0) nextV[i] = 0;
      }
    }
    u.set(nextU);
    v.set(nextV);
  }

  /* ---------- 3. апвеллинг у восточных берегов ---------- */

  /* Апвеллинг там, где ветер гонит воду от берега: у восточных окраин океанов
     в тропиках и субтропиках (Калифорния, Канарские острова, Перу, Бенгела).
     Признак — берег на запад от клетки и течение, направленное на юг/к экватору
     в северном полушарии (и на север в южном). */
  const upwelling = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    if (!oceanMask[i]) continue;
    const gx = i % w;
    const lat = rowLat[(i / w) | 0];
    let coastWest = 0;
    for (let k = 1; k <= 6; k += 1) {
      const other = neighbour(i, -k, 0);
      if (other >= 0 && !oceanMask[other]) {
        coastWest = 1 - k / 8;
        break;
      }
    }
    if (!coastWest) continue;
    /* Ветровое напряжение вдоль берега: чем сильнее меридиональная
       составляющая ветра, тем заметнее сгон воды. */
    const along = Math.abs(atmosphere.windV[i]);
    /* windV — составляющая по оси карты, а ось указывает на юг: у северного
       полушария к экватору ведёт положительная составляющая, у южного —
       отрицательная. */
    const equatorward = lat >= 0 ? atmosphere.windV[i] > 0 : atmosphere.windV[i] < 0;
    upwelling[i] = clamp(coastWest * along * (equatorward ? 1 : 0.45) * 1.4, 0, 1);
  }

  /* ---------- 4. температура воды ---------- */

  /* Основа — та же среднегодовая широтная кривая, что и у воздуха, но с
     меньшей сезонной амплитудой. Дальше аномалия: адвекция течением,
     перемешивание и источники холода/тепла. */
  const annual = new Float32Array(count);
  const anomaly = new Float32Array(count);
  const nextAnomaly = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const lat = rowLat[(i / w) | 0];
    annual[i] = annualSeaTemperature(lat);
    anomaly[i] = -UPWELL_DROP * upwelling[i];
  }
  /* Полярные воды не могут быть теплее −1,8 °C: там лёд. */
  for (let step = 0; step < ANOMALY_STEPS; step += 1) {
    for (let gy = 0; gy < h; gy += 1) {
      const base = gy * w;
      for (let gx = 0; gx < w; gx += 1) {
        const i = base + gx;
        if (!oceanMask[i]) {
          nextAnomaly[i] = 0;
          continue;
        }
        let sum = anomaly[i] * 2;
        let weight = 2;
        if (gx > 0 && oceanMask[i - 1]) { sum += anomaly[i - 1]; weight += 1; }
        if (gx < w - 1 && oceanMask[i + 1]) { sum += anomaly[i + 1]; weight += 1; }
        if (gy > 0 && oceanMask[i - w]) { sum += anomaly[i - w]; weight += 1; }
        if (gy < h - 1 && oceanMask[i + w]) { sum += anomaly[i + w]; weight += 1; }
        /* Перенос течением: аномалия идёт вниз по течению и там перемешивается. */
        const east = gx < w - 1 ? i + 1 : i;
        const south = gy < h - 1 ? i + w : i;
        const advect = u[i] * anomaly[east] + v[i] * anomaly[south];
        const mixed = sum / weight;
        let value = mixed * (1 - ADVECT_MIX) + advect * ADVECT_MIX;
        /* Теплообмен с атмосферой: аномалия живёт конечное время. */
        value *= 0.985;
        value -= UPWELL_DROP * upwelling[i] * 0.02;
        nextAnomaly[i] = clamp(value, -UPWELL_DROP * 1.4, 4);
      }
    }
    anomaly.set(nextAnomaly);
  }

  /* Холодный язык у берега сглаживается: в природе он тянется вдоль берега на
     сотни километров, а по клеткам получается пятнами. */
  const upwellingSmooth = new Float32Array(count);
  for (let gy = 0; gy < h; gy += 1) {
    for (let gx = 0; gx < w; gx += 1) {
      const i = gy * w + gx;
      let sum = upwelling[i] * 4;
      let weight = 4;
      if (gx > 0) { sum += upwelling[i - 1] * 2; weight += 2; }
      if (gx < w - 1) { sum += upwelling[i + 1] * 2; weight += 2; }
      if (gy > 0) { sum += upwelling[i - w] * 2; weight += 2; }
      if (gy < h - 1) { sum += upwelling[i + w] * 2; weight += 2; }
      if (gx > 0 && gy > 0) { sum += upwelling[i - w - 1]; weight += 1; }
      if (gx < w - 1 && gy > 0) { sum += upwelling[i - w + 1]; weight += 1; }
      if (gx > 0 && gy < h - 1) { sum += upwelling[i + w - 1]; weight += 1; }
      if (gx < w - 1 && gy < h - 1) { sum += upwelling[i + w + 1]; weight += 1; }
      upwellingSmooth[i] = sum / weight;
    }
  }

  const sst = new Float32Array(count);
  const ice = new Float32Array(count);
  const speed = new Float32Array(count);
  const gyre = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    if (!oceanMask[i]) {
      /* На суше температура воды смысла не имеет: поле читается только там,
         где маска океана равна единице. */
      sst[i] = 0;
      continue;
    }
    /* Зимой вода холоднее, летом теплее — сезонный ход слабее, чем у суши. */
    const sinLat = Math.abs(Math.sin((rowLat[(i / w) | 0] * Math.PI) / 180));
    const seasonal = atmosphere.season.sign * 2.5 * sinLat;
    /* Температура «как есть» нужна льду: лёд встаёт там, где вода хотела бы
       быть холоднее точки замерзания. */
    /* Апвеллинг снимает тепло напрямую: подъём глубинной воды — не диффузия,
       а перенос, и в температуре поверхности он виден сразу, а не через
       сотню шагов перемешивания. */
    const raw = annual[i] + anomaly[i] + seasonal - UPWELL_SST * upwellingSmooth[i];
    ice[i] = clamp(-raw / 4, 0, 1);
    /* Сама вода холоднее −1,8 °C не бывает: дальше она уже лёд. */
    sst[i] = Math.max(raw, -1.8);
    speed[i] = Math.hypot(u[i], v[i]);
    /* Завихрённость: знак говорит, тёплый круговорот или холодный. */
    const dvdx = (v[clampIndex(i, 1, 0, w, h)] - v[clampIndex(i, -1, 0, w, h)]) / (2 * grid.stepX);
    const dudy = (u[clampIndex(i, 0, 1, w, h)] - u[clampIndex(i, 0, -1, w, h)]) / (2 * grid.stepY);
    gyre[i] = dvdx - dudy;
  }

  const stats = () => {
    let warm = -Infinity;
    let cold = Infinity;
    let mean = 0;
    let cells = 0;
    for (let i = 0; i < count; i += 1) {
      if (!oceanMask[i]) continue;
      warm = Math.max(warm, sst[i]);
      cold = Math.min(cold, sst[i]);
      mean += sst[i];
      cells += 1;
    }
    return { cells, meanSst: cells ? mean / cells : 0, warmest: warm, coldest: cold };
  };

  return {
    planet,
    grid,
    mask: oceanMask,
    u,
    v,
    sst,
    anomaly,
    upwelling,
    upwellingSmooth,
    ice,
    speed,
    gyre,
    stats,
  };
};

const clampIndex = (index, dx, dy, w, h) => {
  const gx = index % w;
  const gy = (index / w) | 0;
  const nx = clamp(gx + dx, 0, w - 1);
  const ny = clamp(gy + dy, 0, h - 1);
  return ny * w + nx;
};
