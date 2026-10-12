/* Климат планеты: температура, осадки, испаряемость, биомы и классификации.

   Модель — переработанная модель Azgaar (vendor/azgaar-fantasy-map-generator,
   `temperature-generator.ts`, `precipitation-generator.ts`, `biomes-generator.ts`).
   Взяты без изменений:

     • шкала высот 0…100 с уровнем моря 20 (оттуда же порог «земля с 20»);
     • матрица биомов 5 × 26 «влажность × температура», правила «морская вода»,
       «вечная мерзлота», «жаркая пустыня», «болото» — теми же порогами;
     • таблица биомов: названия, цвета, пригодность, шкала влажности
       (5 единиц ≈ 400 мм).

   Переписано под планету и под физику (подробности — в atmosphere.js,
   ocean.js, precip.js, docs/planet-physics.md):

     • **Температура — из прихода тепла.** Широта и наклон оси дают годовое
       среднее и годовую амплитуду; у воды амплитуда втрое меньше, чем у суши,
       поэтому морской климат от континентального отличается сам, без порогов.
       Высота отнимает 6,5 °C на километр.
     • **Осадки — переносом влаги с ветром** (precip.js), а не формулой по
       точке: пустыни получаются там, где воздух пришёл с холодной воды или
       опустился в субтропиках, а не там, где «мало океаничности».
     • **Испаряемость считается отдельно** (Харгривз, atmosphere.js), отсюда
       настоящая засушливость P/PET и классы засушливости ЮНЕП. Пустыня — это
       не «мало дождя», а «дождя меньше, чем может испариться».
     • **Класс Кёппена — по критериям Кёппена** (Beck et al., 2018): пороги
       сухости зависят от температуры и сезонности осадков, а не только от
       годовой суммы; появились Cs, Cw, Ds, Dw, тропические Af/Am/Aw разделяются
       по осадкам самого сухого месяца.
     • **Зоны жизни Холдриджа** — вторая, независимая классификация (тепло ×
       осадки × испаряемость). Она не заменяет Кёппена: Кёппен описывает
       климат, Холдридж — что на этом месте растёт.
     • **Продуктивность (NPP)** — модель Майами (Lieth, 1975): минимум из
       «сколько даёт тепло» и «сколько даёт влага»; из неё считается слой флоры.
     • **Снег и лёд** — из зимней и летней температуры, а не из одной годовой:
       ледник там, где и летом ниже нуля, а не просто «холодно».

   В отличие от прежней версии всё это считается **один раз на грубой решётке
   мира** и опрашивается билинейно, поэтому климат перестал зависеть от уровня
   пирамиды: родитель и ребёнок видят одно и то же число, и тайл любого уровня
   согласован с соседями. */

import { clamp, levelForMpp, metersToGeo, mppAt, TILE } from './scale.js';
import { createGrid, smoothGrid } from './fields.js';
import { heightFromRaw, heightMeters, SEA_LEVEL } from './zscale.js';
import { SEASONS, annualSeaTemperature, createSeasonAtmosphere, extraterrestrial } from './atmosphere.js';
import { createOcean } from './ocean.js';
import { createPrecipitation } from './precip.js';

/* ---------- таблицы, перенесённые из Azgaar ---------- */

/** Модификатор осадков по 5-градусным поясам: 0—5°, 5—10°, … 85—90°.
    Оставлен для совместимости и для слоя «Осадки по Азгаару». */
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

/** Классификация Кёппена: 30 типов (Beck et al., 2018). Цвета — школьные. */
export const KOPPEN = [
  { id: 'Af', name: 'Влажный тропический', color: '#0000ff' },
  { id: 'Am', name: 'Муссонный', color: '#0077ff' },
  { id: 'Aw', name: 'Саванна', color: '#46a9fa' },
  { id: 'BWh', name: 'Жаркая пустыня', color: '#fe0000' },
  { id: 'BWk', name: 'Холодная пустыня', color: '#fd9696' },
  { id: 'BSh', name: 'Жаркая полупустыня', color: '#f5a401' },
  { id: 'BSk', name: 'Холодная полупустыня', color: '#fdd68b' },
  { id: 'Csa', name: 'Средиземноморский', color: '#fffc33' },
  { id: 'Csb', name: 'Тёплое лето, сухое', color: '#fdfd96' },
  { id: 'Csc', name: 'Прохладное лето, сухое', color: '#ffffb3' },
  { id: 'Cfa', name: 'Влажный субтропический', color: '#c6ff4e' },
  { id: 'Cfb', name: 'Морской умеренный', color: '#66ff33' },
  { id: 'Cfc', name: 'Прохладный морской', color: '#b3ff66' },
  { id: 'Cwa', name: 'Субтропический с сухой зимой', color: '#96ff33' },
  { id: 'Cwb', name: 'Умеренный с сухой зимой', color: '#b0ff33' },
  { id: 'Cwc', name: 'Прохладный с сухой зимой', color: '#ccff33' },
  { id: 'Dfa', name: 'Влажный континентальный', color: '#4dff00' },
  { id: 'Dfb', name: 'Влажный континентальный, прохладный', color: '#00d400' },
  { id: 'Dfc', name: 'Субарктический', color: '#00a100' },
  { id: 'Dfd', name: 'Экстремально континентальный', color: '#008000' },
  { id: 'Dsa', name: 'Континентальный с сухим летом', color: '#95ff00' },
  { id: 'Dsb', name: 'Прохладный с сухим летом', color: '#aaff00' },
  { id: 'Dsc', name: 'Субарктический с сухим летом', color: '#ccff66' },
  { id: 'Dwa', name: 'Континентальный с сухой зимой', color: '#78ff00' },
  { id: 'Dwb', name: 'Прохладный с сухой зимой', color: '#90ff33' },
  { id: 'Dwc', name: 'Субарктический с сухой зимой', color: '#b0ff66' },
  { id: 'ET', name: 'Тундра', color: '#b3b3b3' },
  { id: 'EF', name: 'Ледяной покров', color: '#cccccc' },
];

/** Зоны жизни Холдриджа: 30 сочетаний тепла и влаги (из 36 возможных). */
export const HOLDRIDGE_BELTS = ['Полярный', 'Субполярный', 'Бореальный', 'Прохладный', 'Тёплый', 'Субтропический', 'Тропический'];
export const HOLDRIDGE_HUMIDITY = ['Супервлажный', 'Влажный', 'Влажно-лесной', 'Сырой лес', 'Степной', 'Сухой лес', 'Колючий лес', 'Пустынный'];
export const HOLDRIDGE_COLORS = [
  '#2b7a5a', '#3d9c6a', '#57b57c', '#7ccb8f', '#a8d98f', '#d6e08a', '#e8d27a', '#e0b063',
  '#c98f52', '#b3763f', '#9c6234', '#7f4f2c',
];

/* ---------- параметры климата ---------- */

/** Единица осадков Azgaar → миллиметры в год (шкала доведена до 4000 мм). */
export const PREC_TO_MM = 4000 / 255;
/** Осадки Azgaar: сколько миллиметров в одной единице влажности матрицы. */
export const MM_PER_MOISTURE = PREC_TO_MM * 5;
/** Шаг температурной оси матрицы биомов, °C. */
const BIOME_TEMP_STEP = 1;

/** Температура на уровне моря для широты — годовое среднее (atmosphere.js). */
export const seaLevelTemperature = (lat) => annualSeaTemperature(lat);

/** Падение температуры с высотой: 6,5 °C на километр выше уровня моря. */
export const altitudeDrop = (h) => (h < SEA_LEVEL ? 0 : (heightMeters(h) / 1000) * 6.5);

/** Температура воздуха: широта минус поправка на высоту. */
export const temperatureAt = (lat, h) => seaLevelTemperature(lat) - altitudeDrop(h);

/** Модификатор осадков для широты: таблица Azgaar по 5-градусным поясам. */
export const latitudeModifier = (lat) => LATITUDE_MODIFIER[clamp(Math.floor(Math.abs(lat) / 5), 0, LATITUDE_MODIFIER.length - 1)];

/** Господствующий ветер (atmosphere.js): оставлен экспортом ради слоя «Ветры». */
export const prevailingWind = (lat) => {
  const abs = Math.abs(lat);
  const sign = lat >= 0 ? 1 : -1;
  const east = abs < 30 || abs > 60;
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

/**
 * Класс Кёппена по критериям Кёппена — с сезонностью, а не по одной годовой
 * сумме (Beck et al., 2018; пороги сухости зависят от температуры и от того,
 * в какой сезон выпадает больше осадков).
 *
 * @param {{tMean: number, tWarm: number, tCold: number, precMm: number,
 *   precWet: number, precDry: number, lat: number}} c
 */
export const koppenId = ({ tMean, tWarm, tCold, precMm, precWet, precDry, lat }) => {
  const find = (id) => KOPPEN.findIndex((entry) => entry.id === id);
  /* Порог сухости Кёппена: 2·T в умеренном поясе, 2·T + 14 при сухом лете,
     2·T + 28 при сухой зиме (и 2·T при равномерных осадках). */
  const summer = precWet >= precDry;
  const summerShare = precWet / Math.max(precMm, 1e-6);
  const dryThreshold = precMm * summerShare > 0.7
    ? 2 * tMean + 28
    : precMm * summerShare < 0.3
      ? 2 * tMean + 14
      : 2 * tMean;
  if (precMm < 10 * dryThreshold) {
    if (precMm < 5 * dryThreshold) return tMean >= 18 ? find('BWh') : find('BWk');
    return tMean >= 18 ? find('BSh') : find('BSk');
  }
  if (tCold >= 18) {
    if (precDry >= 60) return find('Af');
    if (precDry >= 1000 - 100 * precMm / 25) return find('Am');
    return find('Aw');
  }
  if (tCold > 0 && tCold < 18) {
    const drySummer = precDry < precWet / 3 && precDry < 40;
    const dryWinter = precWet < precDry / 10;
    const third = tWarm >= 22 ? 'a' : tWarm >= 10 ? 'b' : 'c';
    if (drySummer) return find(`Cs${third}`);
    if (dryWinter) return find(`Cw${third}`);
    return find(`Cf${third}`);
  }
  /* D: холодная зима. Четвёртая буква — суровость зимы. */
  const coldLetter = tCold < -38 ? 'd' : tWarm >= 22 ? 'a' : tWarm >= 10 ? 'b' : 'c';
  const drySummer = precDry < precWet / 3 && precDry < 40;
  const dryWinter = precWet < precDry / 10;
  if (drySummer) return find(`Ds${coldLetter}`);
  if (dryWinter) return find(`Dw${coldLetter}`);
  return find(`Df${coldLetter}`);
};

/**
 * Биом по классу Кёппена — соответствие из классической схемы Уиттекера:
 * климат описывает Кёппен, а растительность — биом, и связь между ними
 * однозначна (тропический дождевой лес при Af, тайга при Dfc, тундра при ET).
 *
 * Зачем это вместо матрицы «влажность × температура». Матрица Азгаара
 * различает биомы по **годовой сумме осадков**, а тайга от степи отличается не
 * суммой (у обеих 300–500 мм), а тем, что зима в тайге холодная настолько, что
 * испарение мало и вода остаётся. Именно это различие и содержит Кёппен —
 * поэтому класс первичен, а матрица остаётся для совместимости и слоя «Климат
 * Азгаара».
 *
 * @param {number} koppen — индекс класса в KOPPEN
 * @param {{temperature: number, prec: number, height: number, hasRiver: boolean}} at
 */
export const biomeFromKoppen = (koppen, { temperature, prec, height, hasRiver = false }) => {
  const id = KOPPEN[koppen]?.id ?? 'Cfb';
  if (height < SEA_LEVEL) return 0;
  if (id === 'EF') return 11;
  if (id === 'ET') return 10;
  /* Болото — не климат, а место: плоско и мокро. */
  if (temperature > -2 && prec > 900 && height < 60 && !hasRiver) return 12;
  if (id === 'Af' || id === 'Am') return 7;
  if (id === 'Aw' || id === 'BSh') return prec > 900 ? 5 : 3;
  if (id === 'BWh') return 1;
  if (id === 'BWk') return 2;
  if (id === 'BSk') return 4;
  if (id[0] === 'D') {
    /* Тайга — там, где лето ещё тёплое, а зима уже долгая; дальше к полюсу
       тундра и ледник. */
    if (id[2] === 'c' || id[2] === 'd') return 9;
    if (prec > 1100) return 8;
    return 6;
  }
  /* C: умеренный пояс. Влажный субтропический и морской — леса, сухое лето —
     средиземноморская растительность, которая по структуре ближе к саванне. */
  if (id[0] === 'C') {
    if (id[2] === 's' && prec < 700) return 5;
    if (prec > 1400) return 8;
    return 6;
  }
  return 6;
};

/* ---------- производные показатели (для слоёв) ---------- */

/** Снеговая линия: где постоянный снег. Высота в метрах. */
export const snowLine = (temperature) => clamp((temperature + 6) * 480, 0, 6000);

/** Морской лёд: доля покрытия 0…1 по температуре воды. */
export const seaIce = (temperature) => clamp((-1.8 - temperature) / 6, 0, 1);

/* Продуктивность по модели Майами (Lieth, 1975): минимум из тепловой и водной
   кривых. Г/м² в год — так её и приводят в учебниках. */
export const nppMiami = (temperature, precMm) => {
  const thermal = 3000 / (1 + Math.exp(1.315 - 0.119 * temperature));
  const water = 3000 * (1 - Math.exp(-0.000664 * precMm));
  return Math.min(thermal, water);
};

/** Продуктивность растительности 0…1: из неё делается слой «Флора». */
export const floraIndex = (temperature, precMm) => clamp(nppMiami(temperature, precMm) / 1800, 0, 1);

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

/* ---------- сборка климата мира ---------- */

const CLIMATE_CHANNEL = {
  height: 0,
  tempWarm: 1,
  tempCold: 2,
  petWarm: 3,
  petCold: 4,
  precWarm: 5,
  precCold: 6,
  sstWarm: 7,
  sstCold: 8,
  continentality: 9,
  land: 10,
  seaShare: 11,
  windU: 12,
  windV: 13,
  currentU: 14,
  currentV: 15,
  upwelling: 16,
  ice: 17,
  snow: 18,
  koppen: 19,
  holdridge: 20,
  npp: 21,
  aridity: 22,
  nutrient: 23,
  column: 24,
};
const CLIMATE_CHANNELS = 25;

/**
 * Все поля климата мира на грубой решётке.
 *
 * Считается лениво: пока никто не спросил погоду, ни атмосфера, ни океан не
 * строятся. Порядок обязателен — рельеф → расстояние до моря → атмосфера →
 * океан → осадки → классификации: осадкам нужен океан, а океану — ветер.
 */
const buildClimateFields = (planet, elevation) => {
  const base = elevation.terrain();
  const source = base.grid;
  const { w, h } = source;
  const count = w * h;
  const grid = createGrid(planet, { cells: source.w, channels: CLIMATE_CHANNELS });
  const stepX = grid.stepX;
  const stepY = grid.stepY;

  /* Высоты берём из **собственной пирамиды мира**, а не из решётки эрозии: у
     мира с картой Azgaar берег задаёт карта, и климат обязан стоять на том же
     рельефе, что и раскраска. Уровень выбирается так, чтобы пиксель был
     примерно равен клетке климата, — тогда выборка и дешёвая, и осмысленная. */
  const level = clamp(levelForMpp(planet, stepX), 0, planet.maxLevel);
  const mpp = mppAt(planet, level);
  const heightM = new Float32Array(count);
  const land = new Uint8Array(count);
  for (let gy = 0; gy < h; gy += 1) {
    for (let gx = 0; gx < w; gx += 1) {
      const index = gy * w + gx;
      const mx = (gx + 0.5) * stepX;
      const my = (gy + 0.5) * stepY;
      const px = clamp(Math.round(mx / mpp - 0.5), 0, Math.max(0, Math.round(planet.widthM / mpp) - 1));
      const py = clamp(Math.round(my / mpp - 0.5), 0, Math.max(0, Math.round(planet.heightM / mpp) - 1));
      const metres = heightMeters(heightFromRaw(elevation.rawPixel(level, px, py)));
      heightM[index] = metres;
      land[index] = metres > 0 ? 1 : 0;
    }
  }

  /* Доля моря в окрестности: размытая маска суши. По ней считается
     континентальность и то, «морской» ли климат у точки. */
  const seaShare = new Float32Array(count);
  for (let i = 0; i < count; i += 1) seaShare[i] = land[i] ? 0 : 1;
  for (let pass = 0; pass < 6; pass += 1) {
    const copy = seaShare.slice();
    for (let gy = 0; gy < h; gy += 1) {
      for (let gx = 0; gx < w; gx += 1) {
        const index = gy * w + gx;
        let sum = copy[index] * 2;
        let weight = 2;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          sum += copy[ny * w + nx];
          weight += 1;
        }
        seaShare[index] = sum / weight;
      }
    }
  }
  /* Расстояние до берега — чамфером по маске суши: оно и есть мера
     континентальности (в метрах, переводим в километры). */
  const distance = new Float32Array(count).fill(1e9);
  for (let i = 0; i < count; i += 1) if (land[i]) distance[i] = 0;
  const a = stepX;
  const b = stepX * Math.SQRT2;
  const relax = (i, j, weight) => {
    const candidate = distance[j] + weight;
    if (candidate < distance[i]) distance[i] = candidate;
  };
  for (let gy = 0; gy < h; gy += 1) {
    for (let gx = 0; gx < w; gx += 1) {
      const i = gy * w + gx;
      if (gx > 0) relax(i, i - 1, a);
      if (gy > 0) relax(i, i - w, a);
      if (gx > 0 && gy > 0) relax(i, i - w - 1, b);
      if (gx < w - 1 && gy > 0) relax(i, i - w + 1, b);
    }
  }
  for (let gy = h - 1; gy >= 0; gy -= 1) {
    for (let gx = w - 1; gx >= 0; gx -= 1) {
      const i = gy * w + gx;
      if (gx < w - 1) relax(i, i + 1, a);
      if (gy < h - 1) relax(i, i + w, a);
      if (gx < w - 1 && gy < h - 1) relax(i, i + w + 1, b);
      if (gx > 0 && gy < h - 1) relax(i, i + w - 1, b);
    }
  }
  const continentality = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    /* Континентальность выходит на единицу в 2000 км от берега: глубже этого
       океан уже не смягчает климат (Восточная Сибирь, Центральная Азия). */
    continentality[i] = clamp(distance[i] / 2_000_000, 0, 1);
  }

  const rowLat = new Float64Array(h);
  for (let gy = 0; gy < h; gy += 1) rowLat[gy] = metersToGeo(planet, 0, (gy + 0.5) * stepY).lat;
  const masks = { land, heightM, rowLat, continentality, seaShare };

  const seasons = {};
  for (const season of SEASONS) {
    const atmosphere = createSeasonAtmosphere(planet, grid, masks, season);
    const ocean = createOcean(planet, grid, masks, atmosphere);
    seasons[season.id] = { season, atmosphere, ocean };
  }
  const warm = seasons.july;
  const cold = seasons.january;
  const precip = createPrecipitation(planet, grid, masks, {
    july: { atmosphere: warm.atmosphere, ocean: warm.ocean },
    january: { atmosphere: cold.atmosphere, ocean: cold.ocean },
  });

  /* Испаряемость за год: два полугодия по Харгривзу. */
  const pet = new Float32Array(count);
  const aridity = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    pet[i] = warm.atmosphere.pet[i] + cold.atmosphere.pet[i];
    /* Индекс засушливости ЮНЕП — отношение осадков к испаряемости P/PET.
       Пороги общепринятые: ниже 0,03 — гиперзасушливо, 0,03–0,2 — засушливо,
       0,2–0,5 — полузасушливо, 0,5–0,65 — сухо-субгумидно, выше — влажно.
       В пустыне дождь бывает раз в год, поэтому знаменатель не даём уйти в
       ноль: пять миллиметров — это уже не «сухо», а «дождя не было». */
    aridity[i] = clamp(precip.annual[i] / Math.max(pet[i], 1), 0, 12);
  }

  /* Снег и лёд: по сезонам, а не по годовой средней. Ледник там, где и в
     тёплый сезон выше снеговой линии; снежный покров — где зимой холодно. */
  const snow = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    if (!land[i]) continue;
    const winter = cold.atmosphere.temperature[i];
    const summer = warm.atmosphere.temperature[i];
    if (winter < 0) {
      /* Доля года со снежным покровом — грубо по зимней температуре. */
      snow[i] = clamp(-winter / 12, 0, 1);
    }
    if (summer < 1 && summer > -30) snow[i] = Math.max(snow[i], clamp(1 - summer / 1.5, 0.6, 1));
  }

  /* Пишем прямо в поле решётки: отдельный массив пришлось бы копировать, а
     лишний проход по 300 тысячам клеток тут ни к чему. */
  const put = (index, channel, value) => {
    grid.data[index * CLIMATE_CHANNELS + channel] = value;
  };
  for (let i = 0; i < count; i += 1) {
    const lat = rowLat[(i / w) | 0];
    const tWarm = warm.atmosphere.temperature[i];
    const tCold = cold.atmosphere.temperature[i];
    const tMean = (tWarm + tCold) / 2;
    const pWarm = precip.warm[i];
    const pCold = precip.cold[i];
    const pAnnual = precip.annual[i];
    const precWet = Math.max(pWarm, pCold);
    const precDry = Math.min(pWarm, pCold);
    put(i, CLIMATE_CHANNEL.height, heightM[i]);
    put(i, CLIMATE_CHANNEL.tempWarm, tWarm);
    put(i, CLIMATE_CHANNEL.tempCold, tCold);
    put(i, CLIMATE_CHANNEL.petWarm, warm.atmosphere.pet[i]);
    put(i, CLIMATE_CHANNEL.petCold, cold.atmosphere.pet[i]);
    put(i, CLIMATE_CHANNEL.precWarm, pWarm);
    put(i, CLIMATE_CHANNEL.precCold, pCold);
    put(i, CLIMATE_CHANNEL.sstWarm, warm.ocean.sst[i]);
    put(i, CLIMATE_CHANNEL.sstCold, cold.ocean.sst[i]);
    put(i, CLIMATE_CHANNEL.continentality, continentality[i]);
    put(i, CLIMATE_CHANNEL.land, land[i]);
    put(i, CLIMATE_CHANNEL.seaShare, seaShare[i]);
    put(i, CLIMATE_CHANNEL.windU, warm.atmosphere.windU[i]);
    put(i, CLIMATE_CHANNEL.windV, warm.atmosphere.windV[i]);
    put(i, CLIMATE_CHANNEL.currentU, land[i] ? 0 : warm.ocean.u[i] * 0.12);
    put(i, CLIMATE_CHANNEL.currentV, land[i] ? 0 : warm.ocean.v[i] * 0.12);
    put(i, CLIMATE_CHANNEL.upwelling, warm.ocean.upwelling[i]);
    put(i, CLIMATE_CHANNEL.ice, Math.max(warm.ocean.ice[i], cold.ocean.ice[i]));
    put(i, CLIMATE_CHANNEL.snow, snow[i]);
    put(i, CLIMATE_CHANNEL.koppen, koppenId({ tMean, tWarm, tCold, precMm: pAnnual, precWet, precDry, lat }));
    /* Холдридж: биотемпература (ниже нуля и выше 30 °C считается как 0 —
       растение в это время не растёт) и коэффициент PET. */
    /* Биотемпература Холдриджа — среднее по месяцам с оговоркой: месяцы ниже
       нуля и выше 30 °C считаются нулём. Растение в это время не растёт, и
       именно эта оговорка отделяет тропики от пустынь и тундр. */
    const dormant = (t) => (t < 0 || t > 30 ? 0 : t);
    const biotemperature = (dormant(tWarm) + dormant(tCold)) / 2;
    const petRatio = (biotemperature * 58.93) / Math.max(pAnnual, 1e-3);
    const belt = biotemperature > 24 ? 6 : biotemperature > 18 ? 5 : biotemperature > 12 ? 4 : biotemperature > 6 ? 3 : biotemperature > 3 ? 2 : biotemperature > 1.5 ? 1 : 0;
    const humidity = petRatio < 0.25 ? 2 : petRatio < 0.5 ? 1 : petRatio < 1 ? 0 : petRatio < 2 ? 4 : petRatio < 4 ? 5 : petRatio < 8 ? 6 : 7;
    put(i, CLIMATE_CHANNEL.holdridge, belt * 8 + humidity);
    put(i, CLIMATE_CHANNEL.npp, nppMiami(tMean, pAnnual));
    put(i, CLIMATE_CHANNEL.aridity, aridity[i]);
    /* Питательность почв: холод и сушь её снижают, вулканизм и реки повышают. */
    put(i, CLIMATE_CHANNEL.column, precip.column[i]);
    put(i, CLIMATE_CHANNEL.nutrient, clamp((0.2 + 0.5 * clamp(pAnnual / 1200, 0, 1)) * clamp((tMean + 5) / 25, 0, 1) + 0.25 * (base.tectonics.grid.sample1((i % w + 0.5) * stepX, (((i / w) | 0) + 0.5) * stepY, 8)), 0, 1));
  }

  return { grid, channels: CLIMATE_CHANNEL, count, masks, seasons, precip, pet, aridity, snow, seaShare, continentality, heightM, rowLat, level, base };
};

/**
 * Климат планеты. Климатические поля считаются один раз на грубой решётке и
 * опрашиваются билинейно; на тайл строится только сетка для раскраски, где
 * высота берётся из пирамиды (она мелкая), а всё остальное — из полей (оно
 * крупное и от уровня не зависит).
 */
export const createClimate = (planet, elevation, { tiles: tileLimit = 96 } = {}) => {
  const cache = new Map();
  let fields = null;
  const world = () => {
    if (!fields) fields = buildClimateFields(planet, elevation);
    return fields;
  };

  /** Выборка поля климата в метрах карты. */
  const at = (channel, mx, my) => world().grid.sample1(mx, my, channel);

  /**
   * Осадки в точке, мм в год: настоящие, посчитанные переносом влаги. Служат
   * гидрологии: сток обязан отвечать тому дождю, который выпал, а не оценке.
   */
  const approximatePrec = (mx, my) => at(CLIMATE_CHANNEL.precWarm, mx, my) / 2 + at(CLIMATE_CHANNEL.precCold, mx, my) / 2;

  const build = (level, tx, ty) => {
    const mpp = mppAt(planet, level);
    const originX = tx * TILE * mpp;
    const originY = ty * TILE * mpp;
    const height = new Float32Array(TILE * TILE);
    const temp = new Int8Array(TILE * TILE);
    const prec = new Uint8Array(TILE * TILE);
    const moisture = new Uint8Array(TILE * TILE);
    const biome = new Uint8Array(TILE * TILE);
    const ocean = new Uint8Array(TILE * TILE);
    /* Новые поля — для новых слоёв: тепло, вода, жизнь, лёд и течения. */
    const pet = new Uint16Array(TILE * TILE);
    const aridity = new Uint8Array(TILE * TILE);
    const koppen = new Uint8Array(TILE * TILE);
    const holdridge = new Uint8Array(TILE * TILE);
    const npp = new Uint16Array(TILE * TILE);
    const snow = new Uint8Array(TILE * TILE);
    const ice = new Uint8Array(TILE * TILE);
    const sst = new Int8Array(TILE * TILE);
    const wind = new Uint8Array(TILE * TILE);
    const current = new Uint8Array(TILE * TILE);
    const upwelling = new Uint8Array(TILE * TILE);
    const seasonal = new Uint8Array(TILE * TILE);

    for (let py = 0; py < TILE; py += 1) {
      const my = originY + (py + 0.5) * mpp;
      for (let px = 0; px < TILE; px += 1) {
        const index = py * TILE + px;
        const mx = originX + (px + 0.5) * mpp;
        /* Высота — из пирамиды: она единственная, что меняется на километрах.
           Координаты пикселя глобальные, а не внутри тайла: тайл с локальными
           координатами рисовал бы один и тот же угол мира во всех тайлах. */
        const h = heightFromRaw(elevation.sampleRaw(level, tx * TILE + px, ty * TILE + py));
        height[index] = h;
        const metres = heightMeters(h);
        const fieldHeight = at(CLIMATE_CHANNEL.height, mx, my);
        const tWarm = at(CLIMATE_CHANNEL.tempWarm, mx, my);
        const tCold = at(CLIMATE_CHANNEL.tempCold, mx, my);
        const tMean = (tWarm + tCold) / 2;
        const pAnnual = at(CLIMATE_CHANNEL.precWarm, mx, my) / 2 + at(CLIMATE_CHANNEL.precCold, mx, my) / 2;
        /* Локальная поправка высоты: поле стоит на грубой решётке, а пиксель
           может быть выше или ниже её клетки — разницу снимаем градиентом. */
        const lapse = clamp((fieldHeight - metres) * 0.0065, -20, 20);
        const temperature = tMean + lapse;
        temp[index] = clamp(Math.round(temperature), -127, 127);
        const precMm = Math.max(pAnnual, 0);
        prec[index] = clamp(Math.round(precMm / PREC_TO_MM), 0, 255);
        moisture[index] = clamp(Math.round(precMm / MM_PER_MOISTURE), 0, 255);
        /* Биом — из класса Кёппена того же поля: климат и растительность
           обязаны описывать одно и то же место, а не считаться независимо. */
        biome[index] = biomeFromKoppen(
          clamp(Math.round(at(CLIMATE_CHANNEL.koppen, mx, my)), 0, KOPPEN.length - 1),
          { temperature, prec: precMm, height: h, hasRiver: false },
        );
        ocean[index] = clamp(Math.round((1 - at(CLIMATE_CHANNEL.seaShare, mx, my)) * 255), 0, 255);
        pet[index] = clamp(Math.round(at(CLIMATE_CHANNEL.petWarm, mx, my) + at(CLIMATE_CHANNEL.petCold, mx, my)), 0, 65535);
        /* В канал едет сам индекс P/PET, растянутый так, чтобы влажная
           граница 0,65 приходилась на 166. */
        aridity[index] = clamp(Math.round(at(CLIMATE_CHANNEL.aridity, mx, my) * 255), 0, 255);
        koppen[index] = clamp(Math.round(at(CLIMATE_CHANNEL.koppen, mx, my)), 0, KOPPEN.length - 1);
        holdridge[index] = clamp(Math.round(at(CLIMATE_CHANNEL.holdridge, mx, my)), 0, 255);
        npp[index] = clamp(Math.round(at(CLIMATE_CHANNEL.npp, mx, my)), 0, 65535);
        snow[index] = clamp(Math.round(at(CLIMATE_CHANNEL.snow, mx, my) * 255), 0, 255);
        ice[index] = clamp(Math.round(at(CLIMATE_CHANNEL.ice, mx, my) * 255), 0, 255);
        const water = 1 - at(CLIMATE_CHANNEL.land, mx, my);
        sst[index] = water > 0.5 ? clamp(Math.round(at(CLIMATE_CHANNEL.sstWarm, mx, my)), -127, 127) : 0;
        const wu = at(CLIMATE_CHANNEL.windU, mx, my);
        const wv = at(CLIMATE_CHANNEL.windV, mx, my);
        wind[index] = (Math.atan2(wv, wu) + Math.PI) / (2 * Math.PI) * 255 | 0;
        const cu = at(CLIMATE_CHANNEL.currentU, mx, my);
        const cv = at(CLIMATE_CHANNEL.currentV, mx, my);
        current[index] = (Math.atan2(cv, cu) + Math.PI) / (2 * Math.PI) * 255 | 0;
        upwelling[index] = clamp(Math.round(at(CLIMATE_CHANNEL.upwelling, mx, my) * 255), 0, 255);
        seasonal[index] = clamp(Math.round((Math.abs(at(CLIMATE_CHANNEL.precWarm, mx, my) - at(CLIMATE_CHANNEL.precCold, mx, my)) / Math.max(pAnnual, 1)) * 255), 0, 255);
      }
    }

    return {
      level, tx, ty, height, temp, prec, moisture, biome, ocean,
      pet, aridity, koppen, holdridge, npp, snow, ice, sst, wind, current, upwelling, seasonal,
    };
  };

  return {
    planet,
    approximatePrec,
    /** Осадки, мм в год, и испаряемость — наружу для гидрологии и проверок. */
    precAt: (mx, my) => at(CLIMATE_CHANNEL.precWarm, mx, my) / 2 + at(CLIMATE_CHANNEL.precCold, mx, my) / 2,
    petAt: (mx, my) => at(CLIMATE_CHANNEL.petWarm, mx, my) + at(CLIMATE_CHANNEL.petCold, mx, my),
    temperatureAt: (mx, my) => (at(CLIMATE_CHANNEL.tempWarm, mx, my) + at(CLIMATE_CHANNEL.tempCold, mx, my)) / 2,
    sstAt: (mx, my) => at(CLIMATE_CHANNEL.sstWarm, mx, my),
    landAt: (mx, my) => at(CLIMATE_CHANNEL.land, mx, my),
    aridityAt: (mx, my) => at(CLIMATE_CHANNEL.aridity, mx, my),
    /** Поля мира целиком — для слоёв и проверок. */
    fields: () => world(),
    channel: (name) => CLIMATE_CHANNEL[name],
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
    stats: () => ({ tiles: cache.size, limit: tileLimit, fields: fields ? fields.grid.w * fields.grid.h : 0 }),
  };
};

export { extraterrestrial, smoothGrid };
