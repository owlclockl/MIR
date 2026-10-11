/* Климат планеты: температура, осадки, биомы и всё, что из них выводится.

   Модель — переработанная модель Azgaar (vendor/azgaar-fantasy-map-generator,
   `temperature-generator.ts`, `precipitation-generator.ts`, `biomes-generator.ts`).
   Взяты без изменений:

     • шкала высот 0…100 с уровнем моря 20 (оттуда же порог «земля с 20»);
     • температура: тропический пояс 16°…−20°, градиент 0,15 °C на градус
       широты в поясе, линейный градиент к полюсам, падение 6,5 °C на километр
       высоты (в Azgaar — `((h − 18)^e / 1000) · 6,5`);
     • модификатор осадков по 5-градусным широтным поясам `LATITUDE_MODIFIER`
       (подъём у экватора, сушь 20…30°, вторая влажная зона 50…60°);
     • матрица биомов 5 × 26 «влажность × температура», правила «морская вода»,
       «вечная мерзлота», «жаркая пустыня», «болото» — теми же порогами;
     • таблица биомов: названия, цвета, пригодность.

   Переписано под планету:

     • **Осадки считаются по точке, а не прогоном ветра по всей карте.** Azgaar
       ведёт ветер через каждую строку решётки — это O(клеток) на весь мир, на
       40-миллионной карте немыслимо. Здесь то же физическое содержание выражено
       через локальные величины: влажность приносит океан, поэтому «океаничность»
       считается как взвешенная доля воды в окрестностях 8…2048 км (мульти-
       масштабная выборка той же пирамиды высот), плюс орографический подъём на
       наветренном склоне и дождевая тень за хребтом — чего у Azgaar нет вовсе.
     • **Температура считается по строке:** широта зависит только от y, поэтому
       на тайл это одна формула на строку и одно вычитание на пиксель.
     • **Ветры — функция широты** (пассаты, западный перенос, полярные восточные),
       а не случайный угол: от них же идут осадки, течения и слой «Ветры». */

import { clamp, levelForMpp, metersToGeo, mppAt, TILE } from './scale.js';
import { heightFromRaw, heightMeters, SEA_LEVEL } from './elevation.js';

/* ---------- таблицы, перенесённые из Azgaar ---------- */

/** Модификатор осадков по 5-градусным поясам: 0—5°, 5—10°, … 85—90°. */
export const LATITUDE_MODIFIER = [4, 2, 2, 2, 1, 1, 2, 2, 2, 2, 3, 3, 2, 2, 1, 1, 1, 0.5];

/** Биомы Azgaar: порядок, цвета и пригодность — как в `getDefaultBiomes()`. */
export const BIOMES = [
  { i: 0, name: 'Море', color: '#466eab', habitability: 0 },
  { i: 1, name: 'Жаркая пустыня', color: '#fbe79f', habitability: 4 },
  { i: 2, name: 'Холодная пустыня', color: '#b5b887', habitability: 10 },
  { i: 3, name: 'Саванна', color: '#d2d082', habitability: 22 },
  { i: 4, name: 'Степь', color: '#c8d68f', habitability: 30 },
  { i: 5, name: 'Тропический сезонный лес', color: '#b6d95d', habitability: 50 },
  { i: 6, name: 'Лиственный лес', color: '#29bc56', habitability: 100 },
  { i: 7, name: 'Влажный тропический лес', color: '#7dcb35', habitability: 80 },
  { i: 8, name: 'Умеренный дождевой лес', color: '#409c43', habitability: 90 },
  { i: 9, name: 'Тайга', color: '#4b6b32', habitability: 12 },
  { i: 10, name: 'Тундра', color: '#96784b', habitability: 4 },
  { i: 11, name: 'Ледник', color: '#d5e7eb', habitability: 0 },
  { i: 12, name: 'Болото', color: '#0b9131', habitability: 12 },
];

/** Матрица «влажность × температура»: hot ↔ cold [>19 °C; <−4 °C], dry ↕ wet. */
export const BIOME_MATRIX = [
  new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 10]),
  new Uint8Array([3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 9, 9, 9, 9, 10, 10, 10]),
  new Uint8Array([5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 9, 9, 9, 9, 9, 10, 10, 10]),
  new Uint8Array([5, 6, 6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 10, 10, 10]),
  new Uint8Array([7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 10, 10]),
];

/** Классификация Кёппена (упрощённая, по среднегодовым). Цвета — школьные. */
export const KOPPEN = [
  { id: 'Af', name: 'Влажный тропический', color: '#004b85' },
  { id: 'Am', name: 'Муссонный', color: '#2b7fbe' },
  { id: 'Aw', name: 'Саванна', color: '#7fbf7f' },
  { id: 'BWh', name: 'Жаркая пустыня', color: '#f2a05f' },
  { id: 'BWk', name: 'Холодная пустыня', color: '#d9c08a' },
  { id: 'BSh', name: 'Жаркая полупустыня', color: '#f6d08a' },
  { id: 'BSk', name: 'Холодная полупустыня', color: '#cdbd7a' },
  { id: 'Csa', name: 'Средиземноморский', color: '#c9d94f' },
  { id: 'Csb', name: 'Тёплое лето, сухое', color: '#a8cf6a' },
  { id: 'Cfa', name: 'Влажный субтропический', color: '#6cc04f' },
  { id: 'Cfb', name: 'Морской умеренный', color: '#3fa055' },
  { id: 'Dfa', name: 'Влажный континентальный', color: '#4b8f45' },
  { id: 'Dfb', name: 'Влажный континентальный, прохладный', color: '#37703c' },
  { id: 'Dfc', name: 'Субарктический', color: '#4b6b32' },
  { id: 'ET', name: 'Тундра', color: '#8c8f6b' },
  { id: 'EF', name: 'Ледяной покров', color: '#d5e7eb' },
];

/* ---------- параметры климата ---------- */

const TROPIC_N = 16;
const TROPIC_S = -20;
const TROPIC_GRADIENT = 0.15;
const EQUATOR_TEMP = 27;
const NORTH_POLE_TEMP = -26;
const SOUTH_POLE_TEMP = -32;

/** Единица осадков Azgaar → миллиметры в год (шкала доведена до 4000 мм). */
export const PREC_TO_MM = 4000 / 255;
/** Осадки: множитель перед «широтный пояс × океаничность». */
const PREC_BASE = 55;
/** Масштабы океаничности, метры (увеличиваются вместе с планетой). */
const OCEANITY_SCALES = [8, 32, 128, 512, 2048].map((km) => km * 1000);
const OCEANITY_WEIGHTS = [0.06, 0.1, 0.16, 0.26, 0.42];
/** Расстояние, на котором берётся наветренный перепад высот. */
const ORO_STEP_M = 24_000;

/** Температура на уровне моря для широты (модель Azgaar). */
export const seaLevelTemperature = (lat) => {
  const equator = EQUATOR_TEMP;
  if (lat <= TROPIC_N && lat >= TROPIC_S) return equator - Math.abs(lat) * TROPIC_GRADIENT;
  const northTropic = equator - TROPIC_N * TROPIC_GRADIENT;
  const southTropic = equator + TROPIC_S * TROPIC_GRADIENT;
  if (lat > TROPIC_N) {
    const gradient = (northTropic - NORTH_POLE_TEMP) / (90 - TROPIC_N);
    return northTropic - (lat - TROPIC_N) * gradient;
  }
  const gradient = (southTropic - SOUTH_POLE_TEMP) / (90 + TROPIC_S);
  return southTropic + (lat - TROPIC_S) * gradient;
};

/** Падение температуры с высотой: 6,5 °C на километр выше уровня моря. */
export const altitudeDrop = (h) => (h < SEA_LEVEL ? 0 : (heightMeters(h) / 1000) * 6.5);

/** Температура воздуха: широта минус поправка на высоту. */
export const temperatureAt = (lat, h) => seaLevelTemperature(lat) - altitudeDrop(h);

/** Модификатор осадков для широты: таблица Azgaar по 5-градусным поясам. */
export const latitudeModifier = (lat) => LATITUDE_MODIFIER[clamp(Math.floor(Math.abs(lat) / 5), 0, LATITUDE_MODIFIER.length - 1)];

/**
 * Господствующий ветер: пассаты до 30°, западный перенос 30…60°, полярные
 * восточные дальше. Возвращает единичный вектор, куда воздух движется.
 */
export const prevailingWind = (lat) => {
  const abs = Math.abs(lat);
  const east = abs < 30 || abs > 60;
  const sign = lat >= 0 ? 1 : -1;
  /* Пассаты дуют к экватору (на юг в северном полушарии), западные ветры — к полюсу. */
  return east ? { x: -0.87, y: -0.5 * sign } : { x: 0.87, y: 0.5 * sign };
};

/** Биом по влажности, температуре, высоте и наличию реки — правила Azgaar. */
export const biomeId = (moisture, temperature, height, hasRiver) => {
  if (height < SEA_LEVEL) return 0;
  if (temperature < -5) return 11;
  if (temperature >= 25 && !hasRiver && moisture < 5) return 1;
  if (temperature > -2 && ((moisture > 40 && height < 25) || (moisture > 24 && height > 24 && height < 60))) return 12;
  const moistureBand = Math.min((moisture / 5) | 0, 4);
  const temperatureBand = clamp(Math.round(20 - temperature), 0, 25);
  return BIOME_MATRIX[moistureBand][temperatureBand];
};

/** Класс Кёппена по среднегодовым температуре, осадкам и континентальности. */
export const koppenId = (temperature, precMm, lat, oceanity) => {
  const amplitude = 3 + 13 * (1 - oceanity); // полуамплитуда года: континент качается сильнее
  const hot = temperature + amplitude;
  const cold = temperature - amplitude;
  if (hot <= 10) return temperature < -20 ? 15 : 14; // EF / ET
  const desert = 250 + 8 * Math.max(temperature, 0);
  const steppe = 500 + 12 * Math.max(temperature, 0);
  if (precMm < desert) return temperature >= 18 ? 3 : 4; // BWh / BWk
  if (precMm < steppe) return temperature >= 18 ? 5 : 6; // BSh / BSk
  if (cold >= 18) return precMm > 1500 ? 0 : precMm > 800 ? 1 : 2; // Af / Am / Aw
  if (cold <= -3) return hot > 22 ? 11 : hot > 15 ? 12 : 13; // Dfa / Dfb / Dfc
  /* C: сухое лето — там, где западный перенос летом уходит (30…45°). */
  const drySummer = Math.abs(lat) > 28 && Math.abs(lat) < 46;
  if (drySummer) return hot > 22 ? 7 : 8; // Csa / Csb
  return hot > 22 ? 9 : 10; // Cfa / Cfb
};

/* ---------- производные показатели (для слоёв) ---------- */

/** Снеговая линия: где постоянный снег. Высота в метрах. */
export const snowLine = (temperature) => clamp((temperature + 6) * 480, 0, 6000);

/** Морской лёд: доля покрытия 0…1 по температуре воды. */
export const seaIce = (temperature) => clamp((-2 - temperature) / 8, 0, 1);

/** Продуктивность растительности 0…1: тепло × влага, минус мороз и засуха. */
export const floraIndex = (temperature, precMm) => {
  const warmth = clamp((temperature + 8) / 30, 0, 1);
  const wet = clamp(precMm / 1400, 0, 1);
  const cold = clamp((temperature + 12) / 10, 0, 1);
  return clamp(warmth ** 0.8 * (0.35 + 0.65 * wet) * cold, 0, 1);
};

/** Пригодность для жизни 0…100: пригодность биома, поправки на берег и реку. */
export const habitabilityIndex = (biome, temperature, nearWater) => {
  const base = BIOMES[biome]?.habitability ?? 0;
  const comfort = clamp(1 - Math.abs(temperature - 14) / 34, 0, 1);
  return clamp(base * (0.45 + 0.55 * comfort) * (0.75 + 0.5 * clamp(nearWater, 0, 1)), 0, 100);
};

/** Потенциальная плотность населения, человек на км² (порядок величины). */
export const populationIndex = (habitability, riverWidthM, slope) =>
  habitability * (1 + clamp(riverWidthM / 120, 0, 2)) * clamp(1.15 - slope * 0.9, 0.15, 1.15) * 0.9;

/** Почвы: из биома и уклона. */
export const SOILS = [
  { name: 'Донные отложения', color: '#3d4a52' },
  { name: 'Песок', color: '#e6d8a2' },
  { name: 'Солончак', color: '#ded7bd' },
  { name: 'Каштановая', color: '#9c7c4f' },
  { name: 'Чернозём', color: '#4d3b26' },
  { name: 'Краснозём', color: '#a3502f' },
  { name: 'Бурая лесная', color: '#6b4f31' },
  { name: 'Латерит', color: '#b4552c' },
  { name: 'Подзол', color: '#8a8f97' },
  { name: 'Тундровая', color: '#6f7278' },
  { name: 'Каменистая', color: '#8b8b8b' },
];

export const soilId = (biome, slope, height) => {
  if (height < SEA_LEVEL) return 0;
  if (slope > 0.32) return 10;
  if (biome === 11 || biome === 10) return 9;
  if (biome === 1) return 1;
  if (biome === 2) return 2;
  if (biome === 3) return 3;
  if (biome === 4) return 4;
  if (biome === 5 || biome === 7) return 7;
  if (biome === 8 || biome === 6) return 6;
  if (biome === 9) return 8;
  if (biome === 12) return 5;
  return 9;
};

/** Породы: древние щиты, складчатые пояса, вулканизм, осадки. */
export const ROCKS = [
  { name: 'Осадочные', color: '#b9ae8f' },
  { name: 'Граниты щитов', color: '#b07a86' },
  { name: 'Метаморфические', color: '#7f6f9a' },
  { name: 'Вулканические', color: '#8d4f45' },
  { name: 'Офиолиты', color: '#4f6b52' },
];

export const rockId = (belt, volcanic, craton, height) => {
  if (height < SEA_LEVEL) return volcanic > 0.55 ? 3 : 0;
  if (volcanic > 0.5) return 3;
  if (belt > 0.45) return 2;
  if (belt > 0.22) return 4;
  if (craton > 0.6) return 1;
  return 0;
};

/* ---------- поле климата по тайлам ---------- */

/** Осадки считаются на сетке в 4 раза грубее тайла: влага меняется плавно. */
const CLIMATE_SUB = 64;
const SUB_STEP = TILE / CLIMATE_SUB;
/** Океаничность меняется на тысячах километров — ей хватает сетки в 16 раз
    грубее тайла. Пять масштабов выборки на каждый пиксель осадков стоили бы
    дороже всего остального климата, а разницы не видно. */
const OCEAN_SUB = 16;
const OCEAN_STEP = TILE / OCEAN_SUB;

/**
 * Климат планеты. Считает по тайлу: высоты, температуру, осадки, влажность,
 * биом. Всё, кроме осадков, — по пикселю; осадки — на сетке 64 × 64 и растягиваются.
 */
export const createClimate = (planet, elevation, { tiles: tileLimit = 96 } = {}) => {
  const cache = new Map();
  const scales = OCEANITY_SCALES.map((meters) => meters * planet.size);

  /**
   * Доля воды в окрестности: выборка пирамиды на пяти масштабах.
   *
   * Масштаб грубее собственного разрешения тайла не берётся: на обзорном уровне
   * трёхкилометровых деталей всё равно не видно, а ради них пришлось бы строить
   * сотни тайлов. Поэтому уровень выборки ограничен уровнем тайла — для глубоких
   * уровней это предки, уже лежащие в кэше.
   */
  const oceanityAt = (mx, my, limitLevel = planet.maxLevel) => {
    let wet = 0;
    for (let i = 0; i < scales.length; i += 1) {
      const coarse = Math.min(levelForMpp(planet, scales[i] / 4), limitLevel);
      const mpp = mppAt(planet, coarse);
      const px = Math.floor(mx / mpp);
      const py = Math.floor(my / mpp);
      const h = heightFromRaw(elevation.sampleRaw(coarse, px, py));
      wet += OCEANITY_WEIGHTS[i] * clamp((SEA_LEVEL + 0.5 - h) / 3, 0, 1);
    }
    return clamp(wet, 0, 1);
  };

  /** Координата узла сетки (шаг `step` пикселей) в узлах сетки океаничности. */
  const oceanCoord = (pixel, step) => ((pixel + 0.5) * step) / OCEAN_STEP - 0.5;

  /** Выборка сетки океаничности в её собственных узлах (дробные координаты). */
  const sampleOcean = (grid, gx, gy) => {
    const fx = clamp(gx, 0, OCEAN_SUB - 1);
    const fy = clamp(gy, 0, OCEAN_SUB - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, OCEAN_SUB - 1);
    const y1 = Math.min(y0 + 1, OCEAN_SUB - 1);
    const wx = fx - x0;
    const wy = fy - y0;
    const top = grid[y0 * OCEAN_SUB + x0] + (grid[y0 * OCEAN_SUB + x1] - grid[y0 * OCEAN_SUB + x0]) * wx;
    const bottom = grid[y1 * OCEAN_SUB + x0] + (grid[y1 * OCEAN_SUB + x1] - grid[y1 * OCEAN_SUB + x0]) * wx;
    return top + (bottom - top) * wy;
  };

  const build = (level, tx, ty) => {
    const mpp = mppAt(planet, level);
    const originX = tx * TILE * mpp;
    const originY = ty * TILE * mpp;
    const raw = elevation.rawTile(level, tx, ty);
    const height = new Float32Array(TILE * TILE);
    const temp = new Int8Array(TILE * TILE);
    const prec = new Uint8Array(TILE * TILE);
    const moisture = new Uint8Array(TILE * TILE);
    const biome = new Uint8Array(TILE * TILE);
    const ocean = new Uint8Array(TILE * TILE);

    /* 1. Океаничность на грубой сетке: пять масштабов выборки пирамиды. */
    const oceanGrid = new Float32Array(OCEAN_SUB * OCEAN_SUB);
    for (let oy = 0; oy < OCEAN_SUB; oy += 1) {
      const my = originY + (oy + 0.5) * mpp * OCEAN_STEP;
      for (let ox = 0; ox < OCEAN_SUB; ox += 1) {
        const mx = originX + (ox + 0.5) * mpp * OCEAN_STEP;
        oceanGrid[oy * OCEAN_SUB + ox] = oceanityAt(mx, my, level);
      }
    }

    /* 2. Осадки на сетке в 4 раза грубее тайла: широтный пояс, океаничность,
          орографический подъём на наветренном склоне и дождевая тень. */
    const sub = new Float32Array(CLIMATE_SUB * CLIMATE_SUB);
    for (let sy = 0; sy < CLIMATE_SUB; sy += 1) {
      const my = originY + (sy + 0.5) * mpp * SUB_STEP;
      const { lat } = metersToGeo(planet, 0, my);
      const latMod = latitudeModifier(lat);
      const wind = prevailingWind(lat);
      const stepX = wind.x * ORO_STEP_M * planet.size;
      const stepY = wind.y * ORO_STEP_M * planet.size;
      for (let sx = 0; sx < CLIMATE_SUB; sx += 1) {
        const mx = originX + (sx + 0.5) * mpp * SUB_STEP;
        const oceanityValue = sampleOcean(oceanGrid, oceanCoord(sx, SUB_STEP), oceanCoord(sy, SUB_STEP));
        /* Наветренный перепад: воздух поднимается — проливается, опускается — сушь. */
        const here = elevation.heightMetersAt(level, mx, my);
        const upwind = elevation.heightMetersAt(level, mx - stepX, my - stepY);
        const lift = clamp((here - upwind) / 250, -3, 6);
        const oro = lift * 6 * (0.3 + 0.7 * oceanityValue);
        const base = PREC_BASE * latMod * (0.35 + 0.65 * oceanityValue ** 0.8);
        sub[sy * CLIMATE_SUB + sx] = clamp(base + oro, 0, 255);
      }
    }

    /* 3. По пикселю: высота, широта → температура; осадки — выборкой с сетки. */
    for (let py = 0; py < TILE; py += 1) {
      const my = originY + (py + 0.5) * mpp;
      const { lat } = metersToGeo(planet, 0, my);
      const seaTemp = seaLevelTemperature(lat);
      const fy = clamp(py / SUB_STEP - 0.5, 0, CLIMATE_SUB - 1);
      const y0 = Math.floor(fy);
      const y1 = Math.min(y0 + 1, CLIMATE_SUB - 1);
      const wy = fy - y0;
      for (let px = 0; px < TILE; px += 1) {
        const index = py * TILE + px;
        const heightValue = heightFromRaw(raw[index]);
        height[index] = heightValue;
        const temperature = seaTemp - altitudeDrop(heightValue);
        temp[index] = clamp(Math.round(temperature), -127, 127);
        const fx = clamp(px / SUB_STEP - 0.5, 0, CLIMATE_SUB - 1);
        const x0 = Math.floor(fx);
        const x1 = Math.min(x0 + 1, CLIMATE_SUB - 1);
        const wx = fx - x0;
        const top = sub[y0 * CLIMATE_SUB + x0] + (sub[y0 * CLIMATE_SUB + x1] - sub[y0 * CLIMATE_SUB + x0]) * wx;
        const bottom = sub[y1 * CLIMATE_SUB + x0] + (sub[y1 * CLIMATE_SUB + x1] - sub[y1 * CLIMATE_SUB + x0]) * wx;
        let precipitation = top + (bottom - top) * wy;
        /* Холодный воздух влагу не держит: за полярным кругом осадков мало. */
        if (temperature < -5) precipitation *= 0.4;
        else if (temperature < 2) precipitation *= 0.75;
        prec[index] = clamp(Math.round(precipitation), 0, 255);
        ocean[index] = clamp(Math.round(sampleOcean(oceanGrid, oceanCoord(px, 1), oceanCoord(py, 1)) * 255), 0, 255);
      }
    }

    /* 4. Влажность и биом: правила Azgaar; реку добавит раскраска.
          Влажность в тех же «единицах Azgaar», что и матрица: 0…50, то есть
          осадки 0…255 делённые на пять. Границы полос матрицы (шаг 5) тогда
          отвечают 400 миллиметрам осадков: полоса 0 — пустыня и сухая степь,
          полоса 4 — лес, который уже не просыхает. */
    for (let i = 0; i < height.length; i += 1) {
      moisture[i] = clamp(Math.round(prec[i] / 5), 0, 255);
      biome[i] = biomeId(moisture[i], temp[i], height[i], false);
    }

    return { level, tx, ty, height, temp, prec, moisture, biome, ocean };
  };

  /**
   * Приблизительные осадки в точке карты (метры) без построения климатических
   * сеток: та же формула, но без орографической поправки, и только из пирамиды
   * высот. Такой оценкой питается гидрология: она вызывается из раскраски, а
   * раскраска сама ждёт климат — полная сетка осадков внутри себя создала бы
   * рекурсию «климат → сток → климат».
   */
  const approximatePrec = (mx, my, limitLevel = planet.maxLevel) => {
    const { lat } = metersToGeo(planet, 0, my);
    const latMod = latitudeModifier(lat);
    const oceanity = oceanityAt(mx, my, limitLevel);
    return clamp(PREC_BASE * latMod * (0.35 + 0.65 * oceanity ** 0.8), 0, 255);
  };

  return {
    planet,
    approximatePrec,
    /** Климат тайла: считается один раз и живёт в кэше рядом с тайлом высот. */
    gridFor(level, tx, ty) {
      const name = `${level}:${tx}:${ty}`;
      let grid = cache.get(name);
      if (!grid) {
        grid = build(level, tx, ty);
        cache.set(name, grid);
        if (cache.size > tileLimit) {
          const oldest = cache.keys().next().value;
          cache.delete(oldest);
        }
      }
      return grid;
    },
    drop: (level, tx, ty) => cache.delete(`${level}:${tx}:${ty}`),
    clear: () => cache.clear(),
    stats: () => ({ tiles: cache.size, limit: tileLimit }),
  };
};
