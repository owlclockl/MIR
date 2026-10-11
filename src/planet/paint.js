/* Раскраска тайла: слой за слоем, пиксель за пикселем.

   Здесь нет ни DOM, ни холста: функция пишет прямо в Uint8ClampedArray. От этого
   два выигрыша — раскраску можно проверить в Node (scripts/planet-preview.mjs
   собирает картинку планеты в PNG) и один и тот же код обслуживает и кадр целиком,
   и отдельный тайл 256 × 256 в живом виде.

   У каждого слоя своя шкала, но общая схема одна: высота, температура, осадки,
   влажность и биом уже посчитаны климатом (climate.js), уклоны и отмывка
   считаются здесь из высот, реки и озёра приходят геометрией из hydro.js. */

import { clamp, metersToGeo, mppAt, TILE } from './scale.js';
import { heightMeters, SEA_LEVEL } from './elevation.js';
import { noise3 } from './noise.js';
import { visibleWidth } from './hydro.js';
import {
  BIOMES,
  KOPPEN,
  PREC_TO_MM,
  ROCKS,
  SOILS,
  floraIndex,
  habitabilityIndex,
  koppenId,
  latitudeModifier,
  populationIndex,
  prevailingWind,
  rockId,
  seaIce,
  snowLine,
  soilId,
} from './climate.js';

/* ---------- цветовые шкалы ---------- */

const hex = (value) => {
  const text = value.replace('#', '');
  return [parseInt(text.slice(0, 2), 16), parseInt(text.slice(2, 4), 16), parseInt(text.slice(4, 6), 16)];
};

/** Шкала из опорных цветов: строится один раз, дальше — выборка по индексу. */
const ramp = (stops) => {
  const table = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s += 1) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) {
        a = stops[s];
        b = stops[s + 1];
        break;
      }
    }
    const span = b[0] - a[0] || 1;
    const k = clamp((t - a[0]) / span, 0, 1);
    const ca = hex(a[1]);
    const cb = hex(b[1]);
    table[i * 3] = Math.round(ca[0] + (cb[0] - ca[0]) * k);
    table[i * 3 + 1] = Math.round(ca[1] + (cb[1] - ca[1]) * k);
    table[i * 3 + 2] = Math.round(ca[2] + (cb[2] - ca[2]) * k);
  }
  return table;
};

const SEA_RAMP = ramp([
  [0, '#8fd0e0'],
  [0.06, '#4f9fc4'],
  [0.25, '#2b6ea3'],
  [0.6, '#173f77'],
  [1, '#08142c'],
]);
const LAND_RAMP = ramp([
  [0, '#5f9a4e'],
  [0.06, '#7fae55'],
  [0.16, '#b8bd63'],
  [0.3, '#c9ab6a'],
  [0.48, '#a9814f'],
  [0.68, '#8d7563'],
  [0.85, '#b9b2ab'],
  [1, '#f2f6f8'],
]);
const TEMP_RAMP = ramp([
  [0, '#2c1f8f'],
  [0.18, '#2f6ed0'],
  [0.36, '#63c7dd'],
  [0.5, '#c9e6b8'],
  [0.62, '#f2ec8a'],
  [0.78, '#e8973f'],
  [0.9, '#cf3b2c'],
  [1, '#6d0f12'],
]);
const PREC_RAMP = ramp([
  [0, '#8a5a2b'],
  [0.12, '#c9a86a'],
  [0.28, '#e6e2a8'],
  [0.45, '#a8d08a'],
  [0.65, '#4fae7a'],
  [0.82, '#2f7fb5'],
  [1, '#123a86'],
]);
const SLOPE_RAMP = ramp([
  [0, '#e9e4d4'],
  [0.25, '#c9b98f'],
  [0.5, '#a58456'],
  [0.75, '#7a5334'],
  [1, '#3a2418'],
]);
const FLUX_RAMP = ramp([
  [0, '#f4f1e6'],
  [0.35, '#b7d3e8'],
  [0.6, '#5b95c9'],
  [0.8, '#2f5fa8'],
  [1, '#10233f'],
]);
const LIFE_RAMP = ramp([
  [0, '#5b5340'],
  [0.3, '#8c9a4b'],
  [0.6, '#4f8f3c'],
  [1, '#1f6b2c'],
]);
const DENSITY_RAMP = ramp([
  [0, '#1b1f22'],
  [0.25, '#4a3b6b'],
  [0.5, '#a1553f'],
  [0.75, '#d9a441'],
  [1, '#f7f2c8'],
]);
const HEAT_RAMP = ramp([
  [0, '#2b3a55'],
  [0.4, '#7f8fa6'],
  [0.7, '#d98b4a'],
  [1, '#e02f1f'],
]);

const BIOME_RGB = BIOMES.map((biome) => hex(biome.color));
const KOPPEN_RGB = KOPPEN.map((entry) => hex(entry.color));
const SOIL_RGB = SOILS.map((entry) => hex(entry.color));
const ROCK_RGB = ROCKS.map((entry) => hex(entry.color));

/* ---------- слои ---------- */

/**
 * Слои карты. Порядок — порядок ползунка. У слоя есть подсказка: она попадает
 * в строку состояния рядом с ползунком.
 */
export const LAYERS = [
  { id: 'relief', name: 'Рельеф', hint: 'Высоты с отмывкой, снегом и льдом' },
  { id: 'heights', name: 'Высоты', hint: 'Гипсометрическая шкала: глубины и вершины' },
  { id: 'slope', name: 'Уклоны', hint: 'Крутизна склона: где можно пройти, а где нет' },
  { id: 'temperature', name: 'Температура', hint: 'Среднегодовая температура воздуха' },
  { id: 'precipitation', name: 'Осадки', hint: 'Осадки в год, мм' },
  { id: 'moisture', name: 'Влажность', hint: 'Влажность почвы: осадки плюс реки' },
  { id: 'biomes', name: 'Биомы', hint: 'Биомы Azgaar: от пустыни до тайги' },
  { id: 'koppen', name: 'Климат Кёппена', hint: 'Классификация климатов Кёппена' },
  { id: 'rivers', name: 'Реки и вода', hint: 'Русла, озёра и сток' },
  { id: 'watershed', name: 'Водосбор', hint: 'Сколько воды проходит через точку' },
  { id: 'ice', name: 'Лёд и снег', hint: 'Морской лёд, ледники, снеговая линия' },
  { id: 'winds', name: 'Ветры', hint: 'Господствующие ветры по широтам' },
  { id: 'currents', name: 'Течения', hint: 'Поверхностные течения океана' },
  { id: 'soil', name: 'Почвы', hint: 'Тип почвы по биому и уклону' },
  { id: 'rocks', name: 'Породы', hint: 'Геология: щиты, пояса, вулканизм' },
  { id: 'flora', name: 'Растительность', hint: 'Продуктивность: тепло и влага' },
  { id: 'habitability', name: 'Пригодность', hint: 'Насколько место пригодно для жизни' },
  { id: 'population', name: 'Населённость', hint: 'Потенциальная плотность населения' },
  { id: 'resources', name: 'Ископаемые', hint: 'Где что добывается' },
  { id: 'seismic', name: 'Сейсмика', hint: 'Подвижность земной коры' },
];

export const layerById = (id) => LAYERS.find((entry) => entry.id === id) ?? LAYERS[0];

/* ---------- черновые буферы: переиспользуются между тайлами ---------- */

const scratch = {
  meters: new Float32Array(TILE * TILE),
  shade: new Float32Array(TILE * TILE),
  slope: new Float32Array(TILE * TILE),
};

const WATER_RGB = [54, 116, 158];
const LAKE_RGB = [58, 108, 152];
const DEEP_RGB = [30, 76, 120];

/* ---------- геометрия линий ---------- */

/** Залить пиксель кадра с учётом покрытия (края линий не «лесенкой»). */
const blend = (image, frameW, frameH, x, y, rgb, coverage) => {
  if (x < 0 || y < 0 || x >= frameW || y >= frameH || coverage <= 0) return;
  const offset = (y * frameW + x) * 4;
  const alpha = coverage > 1 ? 1 : coverage;
  image[offset] = image[offset] + (rgb[0] - image[offset]) * alpha;
  image[offset + 1] = image[offset + 1] + (rgb[1] - image[offset + 1]) * alpha;
  image[offset + 2] = image[offset + 2] + (rgb[2] - image[offset + 2]) * alpha;
  image[offset + 3] = 255;
};

/** Отрезок толщиной `half`*2 с мягкими краями. */
const stroke = (image, frameW, frameH, x1, y1, x2, y2, half, rgb) => {
  const minX = Math.floor(Math.min(x1, x2) - half - 1);
  const maxX = Math.ceil(Math.max(x1, x2) + half + 1);
  const minY = Math.floor(Math.min(y1, y2) - half - 1);
  const maxY = Math.ceil(Math.max(y1, y2) + half + 1);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length2 = dx * dx + dy * dy || 1;
  for (let y = Math.max(0, minY); y <= Math.min(frameH - 1, maxY); y += 1) {
    for (let x = Math.max(0, minX); x <= Math.min(frameW - 1, maxX); x += 1) {
      const px = x + 0.5 - x1;
      const py = y + 0.5 - y1;
      const t = clamp((px * dx + py * dy) / length2, 0, 1);
      const ex = px - dx * t;
      const ey = py - dy * t;
      const distance = Math.hypot(ex, ey);
      const coverage = clamp(half - distance + 0.5, 0, 1);
      if (coverage > 0) blend(image, frameW, frameH, x, y, rgb, coverage);
    }
  }
};

/* ---------- раскраска ---------- */

/**
 * Раскрасить тайл в кадр.
 *
 * @param {Uint8ClampedArray} image — RGBA кадра
 * @param {number} frameW @param {number} frameH — размер кадра в пикселях
 * @param {number} ox @param {number} oy — куда в кадре левый верхний угол тайла
 * @param {object} tile — { level, tx, ty, elevation, climate, hydro }
 * @param {object} layer — запись из LAYERS
 * @param {{shading?: boolean, rivers?: boolean, graticule?: boolean, seed?: number}} [options]
 */
export const paintTile = (image, frameW, frameH, ox, oy, tile, layer, options = {}) => {
  const { level, tx, ty } = tile;
  const planet = tile.elevation.planet;
  const mpp = mppAt(planet, level);
  const grid = tile.climate.gridFor(level, tx, ty);
  const height = grid.height;
  const temp = grid.temp;
  const prec = grid.prec;
  const moisture = grid.moisture;
  const biome = grid.biome;
  const ocean = grid.ocean;
  const meters = scratch.meters;
  const shade = scratch.shade;
  const slope = scratch.slope;
  const shading = options.shading !== false;

  for (let i = 0; i < height.length; i += 1) meters[i] = heightMeters(height[i]);

  /* Уклоны и отмывка. Преувеличение высоты растёт с уменьшением масштаба: на
     обзорном уровне перепад в километр приходится на десятки километров, и без
     преувеличения рельеф выглядит плоским блином. */
  const exag = clamp((mpp / 1000) ** 0.7, 1, 40);
  if (shading || layer.id === 'slope') {
    for (let py = 0; py < TILE; py += 1) {
      const y0 = Math.max(py - 1, 0);
      const y1 = Math.min(py + 1, TILE - 1);
      for (let px = 0; px < TILE; px += 1) {
        const x0 = Math.max(px - 1, 0);
        const x1 = Math.min(px + 1, TILE - 1);
        const index = py * TILE + px;
        const dx = (meters[py * TILE + x1] - meters[py * TILE + x0]) / ((x1 - x0) * mpp);
        const dy = (meters[y1 * TILE + px] - meters[y0 * TILE + px]) / ((y1 - y0) * mpp);
        const steep = Math.hypot(dx, dy);
        slope[index] = steep;
        if (!shading) continue;
        const sx = dx * exag;
        const sy = dy * exag;
        const length = Math.hypot(sx, sy, 1);
        /* Свет с северо-запада: (запад, север, вверх) в мировых осях. */
        const dot = (-0.6 * -sx + 0.6 * sy + 0.53) / length;
        shade[index] = clamp(0.55 + 0.85 * dot, 0.25, 1.45);
      }
    }
  }

  const originX = tx * TILE * mpp;
  const originY = ty * TILE * mpp;

  for (let py = 0; py < TILE; py += 1) {
    const my = originY + (py + 0.5) * mpp;
    const { lat } = metersToGeo(planet, 0, my);
    const latMod = latitudeModifier(lat);
    const wind = prevailingWind(lat);
    const rowOffset = (oy + py) * frameW + ox;
    for (let px = 0; px < TILE; px += 1) {
      const index = py * TILE + px;
      const h = height[index];
      const m = meters[index];
      const t = temp[index];
      const p = prec[index];
      const wet = moisture[index];
      const bio = biome[index];
      const oceanity = ocean[index] / 255;
      let r;
      let g;
      let b;
      const lit = shading ? shade[index] : 1;
      const steep = slope[index];
      const precMm = p * PREC_TO_MM;

      switch (layer.id) {
        case 'relief': {
          if (h < SEA_LEVEL) {
            const depth = clamp(-m / 11_000, 0, 1);
            const at = (depth * 255) | 0;
            r = SEA_RAMP[at * 3];
            g = SEA_RAMP[at * 3 + 1];
            b = SEA_RAMP[at * 3 + 2];
            const ice = seaIce(t);
            if (ice > 0) {
              r += (232 - r) * ice;
              g += (240 - g) * ice;
              b += (246 - b) * ice;
            }
          } else {
            const at = clamp((m / 6200) * 255, 0, 255) | 0;
            r = LAND_RAMP[at * 3];
            g = LAND_RAMP[at * 3 + 1];
            b = LAND_RAMP[at * 3 + 2];
            /* Сухое — к песку, влажное — к зелени: климат читается по цвету. */
            const dry = clamp(1 - p / 90, 0, 1);
            r += 26 * dry;
            g += 8 * dry - 10 * (1 - dry);
            b -= 12 * dry;
            const snowAt = snowLine(t);
            if (m > snowAt) {
              const cover = clamp((m - snowAt) / 500, 0, 1) * clamp(1 - steep * 1.6, 0, 1);
              r += (244 - r) * cover;
              g += (247 - g) * cover;
              b += (250 - b) * cover;
            }
          }
          r = clamp(r * lit, 0, 255);
          g = clamp(g * lit, 0, 255);
          b = clamp(b * lit, 0, 255);
          break;
        }
        case 'heights': {
          const table = m >= 0 ? LAND_RAMP : SEA_RAMP;
          const local = m >= 0 ? clamp((m / 6200) * 255, 0, 255) | 0 : clamp((-m / 11_000) * 255, 0, 255) | 0;
          r = table[local * 3];
          g = table[local * 3 + 1];
          b = table[local * 3 + 2];
          break;
        }
        case 'slope': {
          const at = clamp(steep * exag * 0.9 * 255, 0, 255) | 0;
          r = SLOPE_RAMP[at * 3];
          g = SLOPE_RAMP[at * 3 + 1];
          b = SLOPE_RAMP[at * 3 + 2];
          if (h < SEA_LEVEL) {
            r = r * 0.5 + 40;
            g = g * 0.5 + 70;
            b = b * 0.5 + 100;
          }
          break;
        }
        case 'temperature': {
          const at = clamp(((t + 45) / 90) * 255, 0, 255) | 0;
          r = TEMP_RAMP[at * 3];
          g = TEMP_RAMP[at * 3 + 1];
          b = TEMP_RAMP[at * 3 + 2];
          break;
        }
        case 'precipitation': {
          const at = clamp((p / 255) * 255, 0, 255) | 0;
          r = PREC_RAMP[at * 3];
          g = PREC_RAMP[at * 3 + 1];
          b = PREC_RAMP[at * 3 + 2];
          if (h < SEA_LEVEL) {
            r *= 0.7;
            g *= 0.7;
            b *= 0.7;
          }
          break;
        }
        case 'moisture': {
          const at = clamp((wet / 160) * 255, 0, 255) | 0;
          r = PREC_RAMP[at * 3];
          g = PREC_RAMP[at * 3 + 1];
          b = PREC_RAMP[at * 3 + 2];
          break;
        }
        case 'biomes': {
          const color = BIOME_RGB[bio] ?? BIOME_RGB[0];
          r = color[0];
          g = color[1];
          b = color[2];
          if (shading) {
            r = clamp(r * lit, 0, 255);
            g = clamp(g * lit, 0, 255);
            b = clamp(b * lit, 0, 255);
          }
          break;
        }
        case 'koppen': {
          const id = koppenId(t, precMm, lat, oceanity);
          const color = KOPPEN_RGB[id] ?? KOPPEN_RGB[0];
          r = color[0];
          g = color[1];
          b = color[2];
          break;
        }
        case 'rivers': {
          /* Фон приглушён, чтобы вода читалась. */
          if (h < SEA_LEVEL) {
            const local = clamp((-m / 11_000) * 255, 0, 255) | 0;
            r = SEA_RAMP[local * 3] * 0.8;
            g = SEA_RAMP[local * 3 + 1] * 0.8;
            b = SEA_RAMP[local * 3 + 2] * 0.8;
          } else {
            const local = clamp((m / 6200) * 255, 0, 255) | 0;
            r = 150 + LAND_RAMP[local * 3] * 0.32;
            g = 148 + LAND_RAMP[local * 3 + 1] * 0.32;
            b = 138 + LAND_RAMP[local * 3 + 2] * 0.32;
          }
          break;
        }
        case 'watershed': {
          const flux = tile.hydro.fluxAt(mpp, originX + (px + 0.5) * mpp, my);
          const at = clamp((Math.log10(1 + flux) / 6) * 255, 0, 255) | 0;
          r = FLUX_RAMP[at * 3];
          g = FLUX_RAMP[at * 3 + 1];
          b = FLUX_RAMP[at * 3 + 2];
          if (h < SEA_LEVEL) {
            r *= 0.75;
            g *= 0.75;
            b *= 0.75;
          }
          break;
        }
        case 'ice': {
          const ice = h < SEA_LEVEL ? seaIce(t) : clamp((m - snowLine(t)) / 600, 0, 1) * clamp(1 - steep, 0, 1);
          const at = clamp(ice * 255, 0, 255) | 0;
          r = 90 + at * 0.6;
          g = 120 + at * 0.5;
          b = 150 + at * 0.42;
          if (h < SEA_LEVEL) {
            r = 24 + at * 0.82;
            g = 60 + at * 0.75;
            b = 96 + at * 0.66;
          }
          break;
        }
        case 'winds': {
          /* Цвет — направление, яркость — сила пояса. */
          const angle = Math.atan2(wind.y, wind.x);
          const at = clamp(((angle + Math.PI) / (Math.PI * 2)) * 255, 0, 255) | 0;
          const strength = 0.45 + 0.55 * clamp(latMod / 4, 0, 1);
          r = clamp(TEMP_RAMP[at * 3] * strength + 20, 0, 255);
          g = clamp(TEMP_RAMP[at * 3 + 1] * strength + 20, 0, 255);
          b = clamp(TEMP_RAMP[at * 3 + 2] * strength + 20, 0, 255);
          if (h >= SEA_LEVEL) {
            const grey = (r + g + b) / 3;
            r = grey * 0.9 + 26;
            g = grey * 0.9 + 26;
            b = grey * 0.9 + 24;
          }
          break;
        }
        case 'currents': {
          /* Течение — ветер, довёрнутый Кориолисом: вправо в северном
             полушарии, влево в южном. */
          const spin = lat >= 0 ? 1 : -1;
          const angle = Math.atan2(wind.y + 0.6 * spin, wind.x - 0.6 * spin);
          const at = clamp(((angle + Math.PI) / (Math.PI * 2)) * 255, 0, 255) | 0;
          if (h < SEA_LEVEL) {
            r = TEMP_RAMP[at * 3];
            g = TEMP_RAMP[at * 3 + 1];
            b = TEMP_RAMP[at * 3 + 2];
          } else {
            const warm = clamp(t / 30, 0, 1);
            r = 96 + 70 * warm;
            g = 92 + 66 * warm;
            b = 84 + 58 * warm;
          }
          break;
        }
        case 'soil': {
          const id = soilId(bio, steep * exag, h);
          const color = SOIL_RGB[id];
          r = color[0];
          g = color[1];
          b = color[2];
          if (shading && h >= SEA_LEVEL) {
            r = clamp(r * lit, 0, 255);
            g = clamp(g * lit, 0, 255);
            b = clamp(b * lit, 0, 255);
          }
          break;
        }
        case 'rocks': {
          const belt = tile.elevation.belt(originX + (px + 0.5) * mpp, my);
          const volcano = tile.elevation.volcanic(originX + (px + 0.5) * mpp, my);
          const craton = tile.elevation.craton(originX + (px + 0.5) * mpp, my);
          const id = rockId(belt, volcano, craton, h);
          const color = ROCK_RGB[id];
          r = color[0];
          g = color[1];
          b = color[2];
          if (h < SEA_LEVEL) {
            r *= 0.72;
            g *= 0.72;
            b *= 0.72;
          }
          break;
        }
        case 'flora': {
          const value = h < SEA_LEVEL ? clamp(0.35 + wet / 400, 0, 0.9) : floraIndex(t, precMm);
          const at = clamp(value * 255, 0, 255) | 0;
          r = LIFE_RAMP[at * 3];
          g = LIFE_RAMP[at * 3 + 1];
          b = LIFE_RAMP[at * 3 + 2];
          if (h < SEA_LEVEL) {
            r *= 0.7;
            g *= 0.8;
            b *= 0.9;
          }
          break;
        }
        case 'habitability': {
          const value = h < SEA_LEVEL ? 0 : habitabilityIndex(bio, t, oceanity * 1.4) / 100;
          const at = clamp(value * 255, 0, 255) | 0;
          r = DENSITY_RAMP[at * 3];
          g = DENSITY_RAMP[at * 3 + 1];
          b = DENSITY_RAMP[at * 3 + 2];
          break;
        }
        case 'population': {
          const width = tile.hydro.widthAt(mpp, originX + (px + 0.5) * mpp, my);
          const value = h < SEA_LEVEL ? 0 : populationIndex(habitabilityIndex(bio, t, oceanity * 1.4), width, steep);
          const at = clamp((value / 90) * 255, 0, 255) | 0;
          r = DENSITY_RAMP[at * 3];
          g = DENSITY_RAMP[at * 3 + 1];
          b = DENSITY_RAMP[at * 3 + 2];
          break;
        }
        case 'resources': {
          const belt = tile.elevation.belt(originX + (px + 0.5) * mpp, my);
          const volcano = tile.elevation.volcanic(originX + (px + 0.5) * mpp, my);
          const craton = tile.elevation.craton(originX + (px + 0.5) * mpp, my);
          /* Металлы в складчатых поясах, топливо в осадочных бассейнах,
             камни и золото на щитах, геотермалия там, где вулканы. */
          let color = [120, 116, 108];
          if (h >= SEA_LEVEL) {
            if (volcano > 0.55) color = [214, 88, 52];
            else if (belt > 0.4) color = [186, 152, 62];
            else if (belt > 0.18) color = [96, 148, 176];
            else if (craton > 0.62) color = [206, 182, 96];
            else if (m < 900) color = [70, 78, 86];
          } else if (m > -400) color = [58, 96, 120];
          r = color[0];
          g = color[1];
          b = color[2];
          if (shading) {
            r = clamp(r * lit, 0, 255);
            g = clamp(g * lit, 0, 255);
            b = clamp(b * lit, 0, 255);
          }
          break;
        }
        case 'seismic': {
          const belt = tile.elevation.belt(originX + (px + 0.5) * mpp, my);
          const volcano = tile.elevation.volcanic(originX + (px + 0.5) * mpp, my);
          const value = clamp(belt * 0.75 + volcano * 0.6, 0, 1);
          const at = clamp(value * 255, 0, 255) | 0;
          r = HEAT_RAMP[at * 3];
          g = HEAT_RAMP[at * 3 + 1];
          b = HEAT_RAMP[at * 3 + 2];
          if (h < SEA_LEVEL) {
            r *= 0.65;
            g *= 0.75;
            b *= 0.95;
          }
          break;
        }
        default: {
          r = 0;
          g = 0;
          b = 0;
        }
      }

      const offset = (rowOffset + px) * 4;
      image[offset] = r;
      image[offset + 1] = g;
      image[offset + 2] = b;
      image[offset + 3] = 255;
    }
  }

  /* ---------- вода поверх слоя ---------- */
  if (options.rivers !== false && layer.id !== 'watershed') {
    drawWater(image, frameW, frameH, ox, oy, tile, mpp, originX, originY, layer.id === 'rivers');
  }
  if (options.graticule) drawGraticule(image, frameW, frameH, ox, oy, tile, mpp, originX, originY);
};

/** Река и озёра: геометрия из гидрологии, меандры — полем шума. */
const drawWater = (image, frameW, frameH, ox, oy, tile, mpp, originX, originY, strong) => {
  const planet = tile.elevation.planet;
  const hydro = tile.hydro;
  const minWidth = visibleWidth(mpp);
  const seed = planet.seedNumber ?? 1;
  const span = TILE * mpp;
  const pad = Math.max(span * 0.25, minWidth * 2);
  const rgb = strong ? DEEP_RGB : WATER_RGB;

  hydro.forEachSegment(mpp, originX - pad, originY - pad, originX + span + pad, originY + span + pad, (x1, y1, x2, y2, width) => {
    if (width < minWidth) return;
    const halfPx = Math.max(width / mpp, 1.1) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    /* Меандры: длина волны и амплитуда — доли ширины, как у настоящих рек.
       Смещение задаётся полем шума от координат мира, поэтому русло одинаково
       на любом приближении и не «переезжает» при зуме и на стыке областей. */
    const wave = Math.max(width * 9, mpp * 4);
    const amplitude = width * 0.9;
    const steps = clamp(Math.ceil(length / Math.max(wave / 8, mpp * 1.5)), 1, 48);
    const meander = (mx, my) => (amplitude < mpp * 0.75 ? 0 : noise3(mx / wave, my / wave, seed % 97) * amplitude * 0.9);
    const toPixel = (mx, my, shift) => [ox + (mx + nx * shift - originX) / mpp, oy + (my + ny * shift - originY) / mpp];
    let [px1, py1] = toPixel(x1, y1, meander(x1, y1));
    for (let step = 1; step <= steps; step += 1) {
      const k = step / steps;
      const mx = x1 + dx * k;
      const my = y1 + dy * k;
      const [px2, py2] = toPixel(mx, my, meander(mx, my));
      stroke(image, frameW, frameH, px1, py1, px2, py2, halfPx, rgb);
      px1 = px2;
      py1 = py2;
    }
  });

  hydro.forEachLake(mpp, originX - pad, originY - pad, originX + span + pad, originY + span + pad, (mx, my, half, depth) => {
    const px = ox + (mx - originX) / mpp;
    const py = oy + (my - originY) / mpp;
    const size = Math.max(half / mpp, 0.9);
    const tint = clamp(0.55 + depth * 0.2, 0, 1);
    const color = [
      LAKE_RGB[0] * (strong ? tint + 0.2 : tint),
      LAKE_RGB[1] * (strong ? tint + 0.2 : tint),
      LAKE_RGB[2] * (strong ? tint + 0.2 : tint),
    ];
    stroke(image, frameW, frameH, px - size, py, px + size, py, Math.max(size, 1), color);
  });
};

/** Координатная сетка: шаг подбирается так, чтобы линии не слипались. */
const GRATICULE_STEPS = [30, 15, 5, 1, 1 / 6, 1 / 60, 1 / 360];

const drawGraticule = (image, frameW, frameH, ox, oy, tile, mpp, originX, originY) => {
  const planet = tile.elevation.planet;
  const span = TILE * mpp;
  let step = GRATICULE_STEPS[GRATICULE_STEPS.length - 1];
  for (const candidate of GRATICULE_STEPS) {
    if (((candidate / 360) * planet.widthM) / mpp >= 64) {
      step = candidate;
      break;
    }
  }
  const rgb = [235, 240, 235];
  const drawLine = (x1, y1, x2, y2) => stroke(image, frameW, frameH, x1, y1, x2, y2, 0.55, rgb);

  const latFrom = 90 - (originY / planet.heightM) * 180;
  const latTo = 90 - ((originY + span) / planet.heightM) * 180;
  for (let lat = Math.ceil(Math.min(latFrom, latTo) / step) * step; lat <= Math.max(latFrom, latTo); lat += step) {
    const my = ((90 - lat) / 180) * planet.heightM;
    const py = oy + (my - originY) / mpp;
    if (py < oy - 1 || py > oy + TILE + 1) continue;
    drawLine(ox, py, ox + TILE, py);
  }
  const lonFrom = (originX / planet.widthM) * 360 - 180;
  const lonTo = ((originX + span) / planet.widthM) * 360 - 180;
  for (let lon = Math.ceil(Math.min(lonFrom, lonTo) / step) * step; lon <= Math.max(lonFrom, lonTo); lon += step) {
    const mx = ((lon + 180) / 360) * planet.widthM;
    const px = ox + (mx - originX) / mpp;
    if (px < ox - 1 || px > ox + TILE + 1) continue;
    drawLine(px, oy, px, oy + TILE);
  }
};
