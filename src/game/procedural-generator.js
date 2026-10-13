/* Высокодетальный процедурный генератор мира (2D Canvas + мост в воксельный мир).
   Поддерживает сетки высокой плотности (от 64 000 до 1 000 000 ячеек),
   планетарные размеры (40 075 × 20 004 км, до 160 300 × 80 016 км),
   O(N) поразрядную сортировку высот для гидрологии стока, до 80 крупных рек,
   16 государств и 80 городов с торговыми путями, а также мгновенный мост
   в воксельный мир «Карта блоками» и 23-слойный планетарный генератор. */

import { icon } from '../ui/icons.js';

export const WORLD_TEMPLATES = Object.freeze([
  { id: 'continents', label: 'Два материка', desc: 'Два крупных континента, разделённых океанским проливом и архипелагом' },
  { id: 'pangaea', label: 'Пангея', desc: 'Единый сверхконтинент с внутренними заливами и горным хребтом' },
  { id: 'archipelago', label: 'Архипелаг', desc: 'Россыпь крупных и малых островов среди тёплых морей' },
  { id: 'island', label: 'Остров-крепость', desc: 'Высокий вулканический остров с радиальными реками и бухтами' },
  { id: 'inland', label: 'Внутреннее море', desc: 'Кольцо земель вокруг глубокого средиземного моря' },
  { id: 'rift', label: 'Тектонический разлом', desc: 'Две гряды хребтов вдоль великой рифтовой долины с озёрами' },
]);

export const DENSITY_PRESETS = Object.freeze([
  { id: '64k', label: '64 000 клеток (320×200)', cellsX: 320, cellsY: 200 },
  { id: '164k', label: '164 000 клеток (512×320)', cellsX: 512, cellsY: 320 },
  { id: '400k', label: '400 000 клеток (800×500)', cellsX: 800, cellsY: 500 },
  { id: '1m', label: '1 000 000 клеток (1250×800)', cellsX: 1250, cellsY: 800 },
]);

export const MAP_LAYERS = Object.freeze([
  { id: 'biomes', label: 'Биомы и рельеф' },
  { id: 'political', label: 'Государства' },
  { id: 'elevation', label: 'Высоты' },
  { id: 'moisture', label: 'Реки и осадки' },
  { id: 'temperature', label: 'Температура' },
]);

export const BIOME_META = Object.freeze([
  { id: 0, name: 'Океан', color: [24, 58, 94] },
  { id: 1, name: 'Горячая пустыня', color: [216, 184, 104] },
  { id: 2, name: 'Холодная пустыня', color: [184, 168, 126] },
  { id: 3, name: 'Саванна', color: [178, 184, 86] },
  { id: 4, name: 'Степь и луг', color: [120, 170, 76] },
  { id: 5, name: 'Тропический сезонный лес', color: [85, 150, 62] },
  { id: 6, name: 'Умеренный листопадный лес', color: [65, 132, 59] },
  { id: 7, name: 'Влажный тропический лес', color: [39, 108, 46] },
  { id: 8, name: 'Умеренный влажный лес', color: [47, 118, 68] },
  { id: 9, name: 'Тайга', color: [56, 94, 72] },
  { id: 10, name: 'Тундра', color: [126, 140, 114] },
  { id: 11, name: 'Ледник и снега', color: [222, 234, 242] },
  { id: 12, name: 'Болото и топь', color: [74, 107, 83] },
]);

const STATE_PALETTE = [
  [214, 92, 74],
  [78, 148, 212],
  [218, 172, 68],
  [146, 102, 198],
  [76, 178, 132],
  [212, 118, 158],
  [222, 134, 68],
  [92, 178, 196],
  [182, 204, 76],
  [208, 94, 124],
  [104, 128, 216],
  [172, 136, 92],
  [84, 192, 168],
  [196, 108, 196],
  [228, 156, 96],
  [118, 178, 98],
];

const KINGDOM_NAMES = [
  'Солнечный Доминион',
  'Северный Предел',
  'Королевство Вельдмар',
  'Аркадийский Союз',
  'Княжество Ольховый Дол',
  'Твердыня Мудрецов',
  'Вольные Гавани Эйра',
  'Империя Златогорья',
  'Ханство Ветров',
  'Орден Серебряного Пика',
  'Корона Янтарного Берега',
  'Великое Герцогство Исеть',
  'Республика Семи Морей',
  'Престол Белого Хребта',
  'Союз Звёздных Долин',
  'Держава Громового Утёса',
];

const CITY_ROOTS = [
  'Асфодель', 'Вельдгар', 'Солнцеград', 'Беловодье', 'Златоуст', 'Громовой',
  'Янтарный', 'Вороний', 'Серебряный', 'Каменный', 'Тихий', 'Орлиный',
  'Звёздный', 'Озёрный', 'Лесной', 'Морской', 'Ветреный', 'Высокий',
  'Северный', 'Вольный', 'Древний', 'Крылатый', 'Лазурный', 'Железный',
];

const CITY_SUFFIX = [
  'Посад', 'Предел', 'Брод', 'Пик', 'Плёс', 'Бастион',
  'Дол', 'Порт', 'Маяк', 'Утёс', 'Холм', 'Ключ',
  'Затон', 'Острог', 'Чертог', 'Рубеж',
];

const RIVER_NAMES = [
  'Серебрянка', 'Быстрица', 'Исеть', 'Вельд', 'Ольховка', 'Янтарная',
  'Глубокая', 'Тихая', 'Громовая', 'Светлая', 'Студёная', 'Золотая',
  'Вольная', 'Лесная', 'Каменка', 'Лазурная', 'Великая', 'Белая',
];

const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

const hashSeed = (seedText) => {
  const str = String(seedText || 'mir-world');
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
};

const createRng = (seedText) => {
  const seedFn = hashSeed(seedText);
  let a = seedFn();
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* Быстрый детерминированный 2D градиентный шум + fBm + Ridged Multifractal. */
const createNoise2D = (seedText) => {
  const rng = createRng(seedText);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) p[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i += 1) perm[i] = p[i & 255];

  const gx = new Float32Array([1, -1, 1, -1, 1, -1, 0, 0]);
  const gy = new Float32Array([1, 1, -1, -1, 0, 0, 1, -1]);

  const noise = (x, y) => {
    const xFloor = Math.floor(x);
    const yFloor = Math.floor(y);
    const xi = xFloor & 255;
    const yi = yFloor & 255;
    const xf = x - xFloor;
    const yf = y - yFloor;
    const u = smoothstep(xf);
    const v = smoothstep(yf);

    const aa = perm[perm[xi] + yi] & 7;
    const ab = perm[perm[xi] + yi + 1] & 7;
    const ba = perm[perm[xi + 1] + yi] & 7;
    const bb = perm[perm[xi + 1] + yi + 1] & 7;

    const g00 = gx[aa] * xf + gy[aa] * yf;
    const g10 = gx[ba] * (xf - 1) + gy[ba] * yf;
    const g01 = gx[ab] * xf + gy[ab] * (yf - 1);
    const g11 = gx[bb] * (xf - 1) + gy[bb] * (yf - 1);

    return lerp(lerp(g00, g10, u), lerp(g01, g11, u), v);
  };

  const fbm = (x, y, octaves = 5, lacunarity = 2.05, gain = 0.5) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i += 1) {
      sum += noise(x * freq, y * freq) * amp;
      norm += amp;
      freq *= lacunarity;
      amp *= gain;
    }
    return sum / (norm || 1);
  };

  const ridged = (x, y, octaves = 4) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i += 1) {
      const n = 1 - Math.abs(noise(x * freq, y * freq));
      sum += n * n * amp;
      norm += amp;
      freq *= 2.1;
      amp *= 0.5;
    }
    return sum / (norm || 1);
  };

  return { noise, fbm, ridged };
};

/* Шаблон континентальной маски: формирует крупную географию материков и морей. */
const templateHeight = (template, nx, ny, noiseA, noiseB) => {
  const dx = nx * 2 - 1;
  const dy = ny * 2 - 1;
  const edgeFade = clamp(1 - Math.pow(Math.max(Math.abs(dx), Math.abs(dy)), 3.2), 0, 1);

  if (template === 'pangaea') {
    const dist = Math.hypot(dx * 0.85, dy * 0.95);
    return (0.62 - dist * 0.78) * edgeFade;
  }
  if (template === 'island') {
    const dist = Math.hypot(dx * 1.15, dy * 1.15);
    const peak = Math.max(0, 1 - dist * 1.35);
    return peak * peak * 0.85 - 0.22;
  }
  if (template === 'archipelago') {
    const chain = Math.sin(nx * 5.2 + noiseA * 1.8) * Math.cos(ny * 4.4 + noiseB * 1.8);
    const dist = Math.hypot(dx * 0.9, dy * 0.9);
    return (chain * 0.35 + 0.08 - dist * 0.32) * edgeFade;
  }
  if (template === 'inland') {
    const dist = Math.hypot(dx * 1.05, dy * 1.1);
    const ring = Math.exp(-Math.pow((dist - 0.58) / 0.34, 2));
    const sea = Math.exp(-Math.pow(dist / 0.36, 2)) * 0.75;
    return (ring * 0.65 - sea - 0.08) * edgeFade;
  }
  if (template === 'rift') {
    const riftLine = Math.abs(dx + Math.sin(ny * 3.8) * 0.18 + noiseA * 0.15);
    const valley = Math.exp(-Math.pow(riftLine / 0.14, 2)) * 0.7;
    const flanks = Math.exp(-Math.pow((riftLine - 0.26) / 0.22, 2)) * 0.68;
    return (flanks - valley + 0.05 - Math.abs(dy) * 0.22) * edgeFade;
  }
  const c1 = Math.exp(-(Math.pow((dx + 0.46) / 0.44, 2) + Math.pow((dy + 0.08) / 0.62, 2)));
  const c2 = Math.exp(-(Math.pow((dx - 0.48) / 0.42, 2) + Math.pow((dy - 0.06) / 0.58, 2)));
  const isle = Math.exp(-(Math.pow(dx / 0.22, 2) + Math.pow((dy - 0.28) / 0.24, 2))) * 0.45;
  return ((c1 + c2 + isle) * 0.66 - 0.24) * edgeFade;
};

const classifyBiome = (h, seaLevel, temp, moisture) => {
  if (h < seaLevel) return 0;
  if (h >= 78 || temp <= -10) return 11;
  if (temp <= -3) return 10;
  if (temp <= 4) return moisture >= 32 ? 9 : 2;
  if (h <= seaLevel + 4 && moisture >= 74) return 12;
  if (temp >= 22) {
    if (moisture < 24) return 1;
    if (moisture < 45) return 3;
    if (moisture < 70) return 5;
    return 7;
  }
  if (moisture < 22) return 2;
  if (moisture < 46) return 4;
  if (moisture < 74) return 6;
  return 8;
};

/**
 * Полная планетарная шкала глубин и высот (-10 994 м .. +8 848 м).
 */
export const heightToMeters = (h, seaLevel = 20) => {
  if (h < seaLevel) {
    const depthRatio = (seaLevel - h) / Math.max(1, seaLevel);
    return -Math.round(depthRatio * depthRatio * 10950 + 44);
  }
  const landRatio = (h - seaLevel) / Math.max(1, 100 - seaLevel);
  return Math.round(Math.pow(landRatio, 1.38) * 8848);
};

/**
 * Детерминированная генерация высокодетального процедурного мира (до 1 000 000 клеток).
 */
export const generateProceduralWorld = (options = {}) => {
  const seed = String(options.seed || 'mir-sage-world').trim() || 'mir-sage-world';
  const template = WORLD_TEMPLATES.some((t) => t.id === options.template) ? options.template : 'continents';
  const width = Math.max(1600, Number(options.width) || 40_075_017);
  const height = Math.max(1000, Number(options.height) || 20_003_932);
  const preset = DENSITY_PRESETS.find((d) => d.id === options.density) || DENSITY_PRESETS[0];
  const cellsX = clamp(Math.round(Number(options.cellsX) || preset.cellsX), 64, 1600);
  const cellsY = clamp(Math.round(Number(options.cellsY) || preset.cellsY), 40, 1000);
  const total = cellsX * cellsY;
  const spacing = width / cellsX;
  const seaLevel = clamp(Math.round(Number(options.seaLevel) || 20), 8, 45);
  const moistureShift = clamp(Number(options.moistureShift) || 0, -40, 40);
  const tempShift = clamp(Number(options.tempShift) || 0, -15, 15);

  const rng = createRng(`${seed}|${template}`);
  const nMain = createNoise2D(`${seed}:main`);
  const nWarp = createNoise2D(`${seed}:warp`);
  const nRidge = createNoise2D(`${seed}:ridge`);
  const nMoist = createNoise2D(`${seed}:moist`);

  const cellH = new Uint8Array(total);
  const cellTemp = new Int8Array(total);
  const cellPrec = new Uint8Array(total);
  const cellBiome = new Uint8Array(total);
  const cellState = new Uint8Array(total);
  const cellFeature = new Uint16Array(total);

  const mainOctaves = total > 250_000 ? 3 : 5;
  const ridgeOctaves = total > 250_000 ? 3 : 4;

  /* 1. Рельеф, климат и осадки за один кэш-дружелюбный проход. */
  for (let y = 0; y < cellsY; y += 1) {
    const ny = (y + 0.5) / cellsY;
    const lat = Math.abs(ny * 2 - 1);
    const baseLatTemp = lerp(30, -18, Math.pow(lat, 1.25));
    const eqBonus = (1 - Math.abs(lat - 0.15)) * 18;
    const rowOffset = y * cellsX;

    for (let x = 0; x < cellsX; x += 1) {
      const nx = (x + 0.5) / cellsX;
      const i = rowOffset + x;
      const wx = nWarp.fbm(nx * 3.2, ny * 3.2, 2) * 0.24;
      const wy = nWarp.fbm(nx * 3.2 + 7.3, ny * 3.2 - 4.1, 2) * 0.24;
      const baseMask = templateHeight(template, nx + wx * 0.35, ny + wy * 0.35, wx, wy);
      const detail = nMain.fbm((nx + wx) * 4.5, (ny + wy) * 4.5, mainOctaves);
      const ridges = nRidge.ridged((nx - wy * 0.5) * 3.6, (ny + wx * 0.5) * 3.6, ridgeOctaves);
      const continental = baseMask + detail * 0.42 + Math.max(0, baseMask + 0.1) * (ridges - 0.45) * 0.78;
      const h = clamp(Math.round(seaLevel + continental * 78), 2, 99);
      cellH[i] = h;

      const altDrop = h > seaLevel ? ((h - seaLevel) / (100 - seaLevel)) * 30 : 0;
      const localT = detail * 4;
      cellTemp[i] = clamp(Math.round(baseLatTemp - altDrop + localT + tempShift), -32, 40);

      const mNoise = (nMoist.fbm(nx * 4.2, ny * 4.2, 3) + 0.5) * 68;
      const rainShadow = h > 70 ? -16 : h > 42 ? 9 : 0;
      cellPrec[i] = clamp(Math.round(mNoise + eqBonus + rainShadow + moistureShift), 4, 100);
    }
  }

  /* 2. Выделение мирового океана и внутренних пресных озёр (O(N) очередь на типизированном массиве). */
  const features = [];
  const visitedWater = new Uint8Array(total);
  const bfsQueue = new Int32Array(total);
  let qHead = 0;
  let qTail = 0;

  for (let x = 0; x < cellsX; x += 1) {
    const top = x;
    const bot = (cellsY - 1) * cellsX + x;
    if (cellH[top] < seaLevel) { visitedWater[top] = 1; bfsQueue[qTail++] = top; }
    if (cellH[bot] < seaLevel && !visitedWater[bot]) { visitedWater[bot] = 1; bfsQueue[qTail++] = bot; }
  }
  for (let y = 0; y < cellsY; y += 1) {
    const left = y * cellsX;
    const right = y * cellsX + (cellsX - 1);
    if (cellH[left] < seaLevel && !visitedWater[left]) { visitedWater[left] = 1; bfsQueue[qTail++] = left; }
    if (cellH[right] < seaLevel && !visitedWater[right]) { visitedWater[right] = 1; bfsQueue[qTail++] = right; }
  }

  while (qHead < qTail) {
    const cur = bfsQueue[qHead++];
    const cx = cur % cellsX;
    const cy = (cur / cellsX) | 0;
    if (cx > 0) {
      const ni = cur - 1;
      if (!visitedWater[ni] && cellH[ni] < seaLevel) { visitedWater[ni] = 1; bfsQueue[qTail++] = ni; }
    }
    if (cx < cellsX - 1) {
      const ni = cur + 1;
      if (!visitedWater[ni] && cellH[ni] < seaLevel) { visitedWater[ni] = 1; bfsQueue[qTail++] = ni; }
    }
    if (cy > 0) {
      const ni = cur - cellsX;
      if (!visitedWater[ni] && cellH[ni] < seaLevel) { visitedWater[ni] = 1; bfsQueue[qTail++] = ni; }
    }
    if (cy < cellsY - 1) {
      const ni = cur + cellsX;
      if (!visitedWater[ni] && cellH[ni] < seaLevel) { visitedWater[ni] = 1; bfsQueue[qTail++] = ni; }
    }
  }

  const maxLakeSize = Math.max(400, Math.round(total * 0.025));
  for (let i = 0; i < total; i += 1) {
    if (cellH[i] < seaLevel && !visitedWater[i]) {
      let lHead = 0;
      let lTail = 0;
      visitedWater[i] = 2;
      bfsQueue[lTail++] = i;
      while (lHead < lTail) {
        const cur = bfsQueue[lHead++];
        const cx = cur % cellsX;
        const cy = (cur / cellsX) | 0;
        if (cx > 0) {
          const ni = cur - 1;
          if (!visitedWater[ni] && cellH[ni] < seaLevel) { visitedWater[ni] = 2; bfsQueue[lTail++] = ni; }
        }
        if (cx < cellsX - 1) {
          const ni = cur + 1;
          if (!visitedWater[ni] && cellH[ni] < seaLevel) { visitedWater[ni] = 2; bfsQueue[lTail++] = ni; }
        }
        if (cy > 0) {
          const ni = cur - cellsX;
          if (!visitedWater[ni] && cellH[ni] < seaLevel) { visitedWater[ni] = 2; bfsQueue[lTail++] = ni; }
        }
        if (cy < cellsY - 1) {
          const ni = cur + cellsX;
          if (!visitedWater[ni] && cellH[ni] < seaLevel) { visitedWater[ni] = 2; bfsQueue[lTail++] = ni; }
        }
      }
      if (lTail >= 2 && lTail <= maxLakeSize && features.length < 120) {
        const lakeId = features.length + 1;
        const lakeHeight = seaLevel + 1;
        const lakeCells = new Array(lTail);
        for (let k = 0; k < lTail; k += 1) {
          const lc = bfsQueue[k];
          lakeCells[k] = lc;
          cellFeature[lc] = lakeId;
          cellH[lc] = lakeHeight;
        }
        features.push({
          i: lakeId,
          type: 'lake',
          subtype: 'freshwater',
          height: lakeHeight,
          cells: lakeCells,
        });
      }
    }
  }

  /* 3. Направление стока (downslope) + O(N) поразрядная сортировка высот 0..100. */
  const downslope = new Int32Array(total).fill(-1);
  const neighborOffsets = [
    -1, 1, -cellsX, cellsX,
    -cellsX - 1, -cellsX + 1, cellsX - 1, cellsX + 1,
  ];
  const heightBuckets = new Int32Array(101);
  let landCount = 0;

  for (let y = 1; y < cellsY - 1; y += 1) {
    const row = y * cellsX;
    for (let x = 1; x < cellsX - 1; x += 1) {
      const i = row + x;
      const h = cellH[i];
      if (h < seaLevel || cellFeature[i] > 0) continue;
      heightBuckets[h] += 1;
      landCount += 1;
      let lowestH = 999;
      let best = -1;
      for (let d = 0; d < 8; d += 1) {
        const ni = i + neighborOffsets[d];
        const nh = cellH[ni];
        if (nh < lowestH) {
          lowestH = nh;
          best = ni;
        }
      }
      downslope[i] = best;
    }
  }

  /* Вычисляем смещения корзин от вершины (100) к уровню моря (seaLevel). */
  const bucketOffsets = new Int32Array(101);
  let runningOffset = 0;
  for (let h = 100; h >= seaLevel; h -= 1) {
    bucketOffsets[h] = runningOffset;
    runningOffset += heightBuckets[h];
  }
  const landOrder = new Int32Array(landCount);
  for (let y = 1; y < cellsY - 1; y += 1) {
    const row = y * cellsX;
    for (let x = 1; x < cellsX - 1; x += 1) {
      const i = row + x;
      const h = cellH[i];
      if (h < seaLevel || cellFeature[i] > 0) continue;
      landOrder[bucketOffsets[h]++] = i;
    }
  }

  /* 4. Аккумуляция речного стока сверху вниз и трассировка до 80 главных рек. */
  const flux = new Float32Array(total);
  for (let idx = 0; idx < landCount; idx += 1) {
    const i = landOrder[idx];
    flux[i] += 1 + cellPrec[i] * 0.22;
    const dst = downslope[i];
    if (dst >= 0 && cellH[dst] <= cellH[i]) {
      flux[dst] += flux[i];
    }
  }

  const riverThreshold = Math.max(24, Math.round(Math.sqrt(total) * 0.14));
  const riverUsed = new Uint8Array(total);
  const pathStamp = new Uint32Array(total);
  const rivers = [];
  const maxRivers = 80;
  const maxRiverSteps = Math.max(180, cellsX + cellsY);

  /* Отбираем истоки рек с наибольшим стоком на средних и высоких ярусах. */
  const riverCandidates = [];
  const candidateStride = Math.max(1, Math.floor(landCount / 6000));
  for (let idx = 0; idx < landCount; idx += candidateStride) {
    const i = landOrder[idx];
    if (flux[i] >= riverThreshold && cellH[i] >= seaLevel + 7) {
      riverCandidates.push(i);
    }
  }
  riverCandidates.sort((a, b) => flux[b] - flux[a]);

  let stampId = 1;
  for (const start of riverCandidates) {
    if (rivers.length >= maxRivers) break;
    if (riverUsed[start]) continue;
    stampId += 1;
    const pathCells = [];
    const pathPoints = [];
    let cur = start;
    while (cur >= 0 && pathStamp[cur] !== stampId && pathCells.length < maxRiverSteps) {
      pathStamp[cur] = stampId;
      pathCells.push(cur);
      const cx = (cur % cellsX) + 0.5;
      const cy = ((cur / cellsX) | 0) + 0.5;
      const jitterX = nMain.noise(cx * 0.7, cy * 0.7) * 0.26;
      const jitterY = nMain.noise(cx * 0.7 + 19, cy * 0.7 - 13) * 0.26;
      pathPoints.push([
        (cx + jitterX) * spacing,
        (cy + jitterY) * (height / cellsY),
      ]);
      if (cellH[cur] < seaLevel || cellFeature[cur] > 0) break;
      const next = downslope[cur];
      if (next < 0 || cellH[next] > cellH[cur]) break;
      riverUsed[cur] = 1;
      cur = next;
    }
    if (pathCells.length >= 6) {
      const id = rivers.length + 1;
      const maxFlux = flux[pathCells[pathCells.length - 1]] || 60;
      rivers.push({
        i: id,
        id,
        name: RIVER_NAMES[(id - 1) % RIVER_NAMES.length],
        cells: pathCells,
        points: pathPoints,
        discharge: Math.round(maxFlux * 12),
        widthFactor: 1.25,
        sourceWidth: 0.7,
      });
    }
  }

  /* 5. Биомы клеток (с учётом речных долин и озёр). */
  for (let i = 0; i < total; i += 1) {
    const riverBonus = flux[i] >= riverThreshold ? 18 : 0;
    const lakeBonus = cellFeature[i] > 0 ? 25 : 0;
    const moist = clamp(cellPrec[i] + riverBonus + lakeBonus, 0, 100);
    cellBiome[i] = classifyBiome(cellH[i], seaLevel, cellTemp[i], moist);
  }

  /* 6. Империи/государства (до 16 держав) и города/порты (до 80 поселений). */
  const habitable = [];
  const stepXY = Math.max(1, Math.floor(Math.sqrt(total / 10000)));
  for (let y = 2; y < cellsY - 2; y += stepXY) {
    for (let x = 2; x < cellsX - 2; x += stepXY) {
      const i = y * cellsX + x;
      const h = cellH[i];
      if (h < seaLevel || h > 74 || cellFeature[i] > 0) continue;
      const b = cellBiome[i];
      if (b === 11 || b === 1) continue;
      const coast =
        cellH[i - 1] < seaLevel ||
        cellH[i + 1] < seaLevel ||
        cellH[i - cellsX] < seaLevel ||
        cellH[i + cellsX] < seaLevel;
      const score =
        (coast ? 30 : 0) +
        (flux[i] >= riverThreshold ? 26 : 0) +
        (b >= 4 && b <= 8 ? 22 : 8) -
        Math.abs(cellTemp[i] - 15) * 0.8;
      if (score > 14) habitable.push({ cell: i, x, y, score, coast });
    }
  }
  habitable.sort((a, b) => b.score - a.score);

  const states = [];
  const burgs = [];
  const maxStates = 16;
  const maxBurgs = 80;
  const minCapitalDist = Math.max(8, Math.round(cellsX * 0.095));

  for (const cand of habitable) {
    if (states.length >= maxStates) break;
    if (states.some((s) => Math.hypot(s.cx - cand.x, s.cy - cand.y) < minCapitalDist)) continue;
    const stateId = states.length + 1;
    const color = STATE_PALETTE[(stateId - 1) % STATE_PALETTE.length];
    const capitalName = `${CITY_ROOTS[(stateId * 3 + Math.floor(rng() * 5)) % CITY_ROOTS.length]} ${CITY_SUFFIX[(stateId * 2) % CITY_SUFFIX.length]}`;
    const burgId = burgs.length + 1;
    burgs.push({
      id: burgId,
      name: capitalName,
      cell: cand.cell,
      cx: cand.x,
      cy: cand.y,
      x: Math.round((cand.x + 0.5) * spacing),
      y: Math.round((cand.y + 0.5) * (height / cellsY)),
      state: stateId,
      capital: true,
      port: cand.coast,
      population: Math.round(85 + rng() * 420) * 1000,
    });
    states.push({
      id: stateId,
      name: KINGDOM_NAMES[(stateId - 1) % KINGDOM_NAMES.length],
      color,
      capitalId: burgId,
      capitalName,
      cell: cand.cell,
      cx: cand.x,
      cy: cand.y,
      cellsCount: 0,
    });
  }

  /* Расширение границ государств (O(N) волновой обход на типизированной очереди). */
  if (states.length > 0) {
    let sHead = 0;
    let sTail = 0;
    for (const st of states) {
      if (!cellState[st.cell]) {
        cellState[st.cell] = st.id;
        bfsQueue[sTail++] = st.cell;
      }
    }
    while (sHead < sTail) {
      const cell = bfsQueue[sHead++];
      const state = cellState[cell];
      const cx = cell % cellsX;
      const cy = (cell / cellsX) | 0;
      if (cx > 0) {
        const ni = cell - 1;
        if (!cellState[ni] && cellH[ni] >= seaLevel && !cellFeature[ni] && cellH[ni] <= 88) {
          cellState[ni] = state;
          bfsQueue[sTail++] = ni;
        }
      }
      if (cx < cellsX - 1) {
        const ni = cell + 1;
        if (!cellState[ni] && cellH[ni] >= seaLevel && !cellFeature[ni] && cellH[ni] <= 88) {
          cellState[ni] = state;
          bfsQueue[sTail++] = ni;
        }
      }
      if (cy > 0) {
        const ni = cell - cellsX;
        if (!cellState[ni] && cellH[ni] >= seaLevel && !cellFeature[ni] && cellH[ni] <= 88) {
          cellState[ni] = state;
          bfsQueue[sTail++] = ni;
        }
      }
      if (cy < cellsY - 1) {
        const ni = cell + cellsX;
        if (!cellState[ni] && cellH[ni] >= seaLevel && !cellFeature[ni] && cellH[ni] <= 88) {
          cellState[ni] = state;
          bfsQueue[sTail++] = ni;
        }
      }
    }
    for (let i = 0; i < total; i += 1) {
      const sid = cellState[i];
      if (sid > 0 && states[sid - 1]) states[sid - 1].cellsCount += 1;
    }
  }

  const minTownDist = Math.max(4, Math.round(cellsX * 0.042));
  for (const cand of habitable) {
    if (burgs.length >= maxBurgs) break;
    if (burgs.some((b) => Math.hypot(b.cx - cand.x, b.cy - cand.y) < minTownDist)) continue;
    const burgId = burgs.length + 1;
    const root = CITY_ROOTS[(burgId * 5 + Math.floor(rng() * 7)) % CITY_ROOTS.length];
    const suf = CITY_SUFFIX[(burgId * 3 + Math.floor(rng() * 5)) % CITY_SUFFIX.length];
    burgs.push({
      id: burgId,
      name: `${root} ${suf}`,
      cell: cand.cell,
      cx: cand.x,
      cy: cand.y,
      x: Math.round((cand.x + 0.5) * spacing),
      y: Math.round((cand.y + 0.5) * (height / cellsY)),
      state: cellState[cand.cell] || 1,
      capital: false,
      port: cand.coast,
      population: Math.round(12 + rng() * 95) * 1000,
    });
  }

  const routes = [];
  for (let i = 0; i < burgs.length; i += 1) {
    let closest = null;
    let bestD = 1e9;
    for (let j = 0; j < burgs.length; j += 1) {
      if (i === j) continue;
      const d = Math.hypot(burgs[i].cx - burgs[j].cx, burgs[i].cy - burgs[j].cy);
      if (d < bestD && d < cellsX * 0.22) {
        bestD = d;
        closest = burgs[j];
      }
    }
    if (closest && burgs[i].id < closest.id) {
      routes.push({ from: burgs[i], to: closest });
    }
  }

  return {
    seed,
    template,
    density: preset.id,
    width,
    height,
    cellsX,
    cellsY,
    spacing,
    seaLevel,
    moistureShift,
    tempShift,
    riverThreshold,
    cellH,
    cellTemp,
    cellPrec,
    cellBiome,
    cellState,
    cellFeature,
    flux,
    features,
    rivers,
    states,
    burgs,
    routes,
  };
};

/**
 * Превращает процедурный мир в окно-источник, совместимое с `src/world/bridge.js`
 * (`mapsReady(win)` и `readSource(win)`), в планетарном масштабе (`field.lazy`).
 */
export const toAzgaarWindow = (world) => {
  const mapWidth = Math.max(world.width, 40_075_017);
  const mapHeight = Math.max(world.height, 20_003_932);
  /* Для воксельного поля используем быструю опорную решётку до 160×100, чтобы
     снимок readSource строился за ~3 мс даже при 1 000 000 клеток 2D-карты. */
  const gridX = Math.min(world.cellsX, 160);
  const gridY = Math.min(world.cellsY, 100);
  const total = gridX * gridY;
  const hArr = new Uint8Array(total);
  const tArr = new Int8Array(total);
  const pArr = new Uint8Array(total);
  const bArr = new Uint8Array(total);
  const g = new Uint32Array(total);
  const p = new Array(total);
  const spacing = mapWidth / gridX;
  const stepY = mapHeight / gridY;

  for (let y = 0; y < gridY; y += 1) {
    const sy = Math.min(world.cellsY - 1, Math.floor((y * world.cellsY) / gridY));
    for (let x = 0; x < gridX; x += 1) {
      const sx = Math.min(world.cellsX - 1, Math.floor((x * world.cellsX) / gridX));
      const srcIdx = sy * world.cellsX + sx;
      const dstIdx = y * gridX + x;
      hArr[dstIdx] = world.cellH[srcIdx];
      tArr[dstIdx] = world.cellTemp[srcIdx];
      pArr[dstIdx] = world.cellPrec[srcIdx];
      bArr[dstIdx] = world.cellBiome[srcIdx];
      g[dstIdx] = dstIdx;
      p[dstIdx] = [(x + 0.5) * spacing, (y + 0.5) * stepY];
    }
  }

  const scaleX = mapWidth / world.width;
  const scaleY = mapHeight / world.height;
  const scaledRivers = world.rivers.slice(0, 36).map((r) => ({
    ...r,
    cells: r.cells.map((c) => {
      const cx = Math.min(gridX - 1, Math.floor(((c % world.cellsX) * gridX) / world.cellsX));
      const cy = Math.min(gridY - 1, Math.floor((((c / world.cellsX) | 0) * gridY) / world.cellsY));
      return cy * gridX + cx;
    }),
    points: r.points.map(([px, py]) => [px * scaleX, py * scaleY]),
  }));

  const scaledFeatures = world.features.slice(0, 40).map((f) => ({
    ...f,
    cells: f.cells.map((c) => {
      const cx = Math.min(gridX - 1, Math.floor(((c % world.cellsX) * gridX) / world.cellsX));
      const cy = Math.min(gridY - 1, Math.floor((((c / world.cellsX) | 0) * gridY) / world.cellsY));
      return cy * gridX + cx;
    }),
  }));

  return {
    SEA_LEVEL: world.seaLevel,
    options: {
      map: {
        graph: { width: mapWidth, height: mapHeight },
      },
    },
    grid: {
      spacing,
      cellsX: gridX,
      cellsY: gridY,
      cells: {
        h: hArr,
        temp: tArr,
        prec: pArr,
      },
    },
    pack: {
      cells: {
        h: hArr,
        g,
        biome: bArr,
        p,
      },
      features: scaledFeatures,
      rivers: scaledRivers,
    },
  };
};

const sampleCellColor = (world, i, layer) => {
  const h = world.cellH[i];
  const sea = world.seaLevel;
  const isLake = world.cellFeature[i] > 0;

  if (isLake) return [52, 118, 168];

  if (layer === 'elevation') {
    if (h < sea) {
      const t = clamp(h / Math.max(1, sea), 0, 1);
      return [
        Math.round(lerp(14, 52, t)),
        Math.round(lerp(36, 108, t)),
        Math.round(lerp(72, 158, t)),
      ];
    }
    const t = clamp((h - sea) / Math.max(1, 100 - sea), 0, 1);
    if (t < 0.35) {
      const k = t / 0.35;
      return [Math.round(lerp(76, 158, k)), Math.round(lerp(148, 178, k)), Math.round(lerp(82, 92, k))];
    }
    if (t < 0.72) {
      const k = (t - 0.35) / 0.37;
      return [Math.round(lerp(158, 148, k)), Math.round(lerp(178, 112, k)), Math.round(lerp(92, 76, k))];
    }
    const k = (t - 0.72) / 0.28;
    return [Math.round(lerp(148, 236, k)), Math.round(lerp(112, 240, k)), Math.round(lerp(76, 245, k))];
  }

  if (layer === 'moisture') {
    if (h < sea) return [22, 48, 78];
    const m = clamp(world.cellPrec[i] / 100, 0, 1);
    return [
      Math.round(lerp(212, 36, m)),
      Math.round(lerp(186, 128, m)),
      Math.round(lerp(112, 188, m)),
    ];
  }

  if (layer === 'temperature') {
    const t = clamp((world.cellTemp[i] + 24) / 58, 0, 1);
    if (t < 0.5) {
      const k = t * 2;
      return [Math.round(lerp(56, 118, k)), Math.round(lerp(112, 188, k)), Math.round(lerp(214, 132, k))];
    }
    const k = (t - 0.5) * 2;
    return [Math.round(lerp(118, 224, k)), Math.round(lerp(188, 82, k)), Math.round(lerp(132, 58, k))];
  }

  if (layer === 'political') {
    if (h < sea) {
      const t = clamp(h / Math.max(1, sea), 0, 1);
      return [Math.round(lerp(18, 36, t)), Math.round(lerp(42, 74, t)), Math.round(lerp(68, 112, t))];
    }
    const sid = world.cellState[i];
    const biomeCol = BIOME_META[world.cellBiome[i]]?.color || BIOME_META[4].color;
    if (!sid || !world.states[sid - 1]) return biomeCol;
    const scol = world.states[sid - 1].color;
    return [
      Math.round(lerp(biomeCol[0], scol[0], 0.62)),
      Math.round(lerp(biomeCol[1], scol[1], 0.62)),
      Math.round(lerp(biomeCol[2], scol[2], 0.62)),
    ];
  }

  if (h < sea) {
    const t = clamp(h / Math.max(1, sea), 0, 1);
    const shelf = t > 0.78 ? 18 : 0;
    return [
      Math.round(lerp(16, 38, t) + shelf * 0.5),
      Math.round(lerp(40, 88, t) + shelf),
      Math.round(lerp(72, 136, t) + shelf),
    ];
  }
  const meta = BIOME_META[world.cellBiome[i]] || BIOME_META[4];
  return [meta.color[0], meta.color[1], meta.color[2]];
};

/**
 * Монтирует интерактивный высокодетальный 2D генератор мира в контейнер редактора.
 */
export const mountProceduralGenerator = (host, options = {}) => {
  if (!host) return { dispose: () => {} };

  const state = {
    seed: String(options.config?.seed || 'mir-sage-world'),
    template: String(options.config?.template || 'continents'),
    density: String(options.config?.density || '64k'),
    width: Number(options.config?.width) || 40_075_017,
    height: Number(options.config?.height) || 20_003_932,
    seaLevel: 20,
    moistureShift: 0,
    tempShift: 0,
    layer: 'biomes',
    overlays: {
      rivers: true,
      cities: true,
      borders: true,
      relief: true,
      grid: false,
    },
    zoom: 1,
    panX: 0,
    panY: 0,
    hoverCell: -1,
    selectedCell: -1,
  };

  let world = generateProceduralWorld(state);
  let disposed = false;

  const root = document.createElement('section');
  root.className = 'proc-gen';
  root.dataset.role = 'world-proc-gen';
  root.setAttribute('aria-label', 'Высокодетальный процедурный генератор мира');

  root.innerHTML = `
    <div class="proc-gen__bar" data-role="proc-toolbar">
      <div class="proc-gen__group">
        <label class="proc-gen__field" title="Зерно генерации (seed)">
          <span class="proc-gen__label">Seed</span>
          <input class="proc-gen__input" type="text" data-role="proc-seed" value="${state.seed.replace(/"/g, '&quot;')}" maxlength="48" />
        </label>
        <button class="ghost-button proc-gen__btn" type="button" data-proc-action="random-seed" title="Случайный мир">
          ${icon('dices', 'icon')}
          <span>Случайный</span>
        </button>
        <label class="proc-gen__field" title="Геологический шаблон материков">
          <span class="proc-gen__label">Рельеф</span>
          <select class="proc-gen__select" data-role="proc-template">
            ${WORLD_TEMPLATES.map((t) => `<option value="${t.id}" ${t.id === state.template ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </label>
        <label class="proc-gen__field" title="Плотность сетки (до 1 000 000 ячеек)">
          <span class="proc-gen__label">Сетка</span>
          <select class="proc-gen__select" data-role="proc-density">
            ${DENSITY_PRESETS.map((d) => `<option value="${d.id}" ${d.id === state.density ? 'selected' : ''}>${d.label}</option>`).join('')}
          </select>
        </label>
      </div>

      <div class="proc-gen__group" role="group" aria-label="Слой карты">
        ${MAP_LAYERS.map((l) => `
          <button class="proc-gen__chip ${l.id === state.layer ? 'is-active' : ''}" type="button" data-proc-layer="${l.id}" aria-pressed="${l.id === state.layer}">
            ${l.label}
          </button>
        `).join('')}
      </div>

      <div class="proc-gen__group proc-gen__sliders">
        <label class="proc-gen__slider-wrap" title="Уровень мирового океана">
          <span>Море: <strong data-role="proc-sealevel-val">${state.seaLevel}</strong></span>
          <input type="range" min="10" max="38" step="1" value="${state.seaLevel}" data-role="proc-sealevel" />
        </label>
        <label class="proc-gen__slider-wrap" title="Сдвиг влажности и осадков">
          <span>Осадки: <strong data-role="proc-moisture-val">0</strong></span>
          <input type="range" min="-30" max="30" step="2" value="${state.moistureShift}" data-role="proc-moisture" />
        </label>
      </div>

      <div class="proc-gen__group" role="group" aria-label="Слои поверх карты">
        <button class="proc-gen__chip is-active" type="button" data-proc-overlay="rivers" aria-pressed="true">Реки</button>
        <button class="proc-gen__chip is-active" type="button" data-proc-overlay="cities" aria-pressed="true">Города</button>
        <button class="proc-gen__chip is-active" type="button" data-proc-overlay="borders" aria-pressed="true">Границы</button>
        <button class="proc-gen__chip is-active" type="button" data-proc-overlay="relief" aria-pressed="true">Отмывка</button>
        <button class="proc-gen__chip" type="button" data-proc-overlay="grid" aria-pressed="false">Сетка</button>
      </div>

      <div class="proc-gen__group proc-gen__zoom">
        <button class="ghost-button proc-gen__icon-btn" type="button" data-proc-action="zoom-out" aria-label="Отдалить">−</button>
        <span class="proc-gen__zoom-val" data-role="proc-zoom-val">100%</span>
        <button class="ghost-button proc-gen__icon-btn" type="button" data-proc-action="zoom-in" aria-label="Приблизить">+</button>
        <button class="ghost-button proc-gen__btn" type="button" data-proc-action="reset-view" aria-label="Сбросить вид">Сброс</button>
        <button class="primary-button proc-gen__btn" type="button" data-proc-action="open-voxel" title="Построить воксельную карту блоками по этому миру">
          ${icon('layers', 'icon')}
          <span>В блоки</span>
        </button>
      </div>
    </div>

    <div class="proc-gen__stage">
      <canvas class="proc-gen__canvas" data-role="proc-canvas" tabindex="0" width="1600" height="1000"></canvas>
      <div class="proc-gen__hud" data-role="proc-hud" role="status" aria-live="polite"></div>
      <div class="proc-gen__inspector" data-role="proc-inspector">
        Наведите курсор или кликните по клетке карты, чтобы изучить высоту, климат, биом, реки и государства.
      </div>
    </div>
  `;

  host.append(root);

  const canvas = root.querySelector('[data-role="proc-canvas"]');
  const hudEl = root.querySelector('[data-role="proc-hud"]');
  const inspectorEl = root.querySelector('[data-role="proc-inspector"]');
  const seedInput = root.querySelector('[data-role="proc-seed"]');
  const templateSelect = root.querySelector('[data-role="proc-template"]');
  const densitySelect = root.querySelector('[data-role="proc-density"]');
  const seaSlider = root.querySelector('[data-role="proc-sealevel"]');
  const seaVal = root.querySelector('[data-role="proc-sealevel-val"]');
  const moistSlider = root.querySelector('[data-role="proc-moisture"]');
  const moistVal = root.querySelector('[data-role="proc-moisture-val"]');
  const zoomVal = root.querySelector('[data-role="proc-zoom-val"]');

  let ctx = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }

  let terrainCanvas = null;
  let terrainDirty = true;

  const updateHud = () => {
    let landCells = 0;
    for (let i = 0; i < world.cellH.length; i += 1) {
      if (world.cellH[i] >= world.seaLevel && !world.cellFeature[i]) landCells += 1;
    }
    const landPct = Math.round((landCells / world.cellH.length) * 100);
    const spanKmX = Math.round(world.width / 1000).toLocaleString('ru-RU');
    const spanKmY = Math.round(world.height / 1000).toLocaleString('ru-RU');
    hudEl.textContent = [
      `Seed: ${world.seed}`,
      `Масштаб: ${spanKmX}×${spanKmY} км`,
      `Клеток: ${world.cellsX}×${world.cellsY} (${world.cellH.length.toLocaleString('ru-RU')})`,
      `Суша: ${landPct}%`,
      `Государств: ${world.states.length}`,
      `Городов: ${world.burgs.length}`,
      `Рек: ${world.rivers.length}`,
      `Озёр: ${world.features.length}`,
    ].join(' · ');
    zoomVal.textContent = `${Math.round(state.zoom * 100)}%`;
  };

  const updateInspector = (cellIndex) => {
    if (cellIndex < 0 || cellIndex >= world.cellH.length) {
      inspectorEl.textContent = 'Наведите курсор или кликните по клетке карты, чтобы изучить высоту, климат, биом, реки и государства.';
      return;
    }
    const cx = cellIndex % world.cellsX;
    const cy = (cellIndex / world.cellsX) | 0;
    const h = world.cellH[cellIndex];
    const meters = heightToMeters(h, world.seaLevel);
    const temp = world.cellTemp[cellIndex];
    const prec = world.cellPrec[cellIndex];
    const isLake = world.cellFeature[cellIndex] > 0;
    const biome = isLake ? 'Пресное озеро' : (BIOME_META[world.cellBiome[cellIndex]]?.name || 'Луг');
    const st = world.cellState[cellIndex] ? world.states[world.cellState[cellIndex] - 1] : null;
    const burg = world.burgs.find((b) => Math.abs(b.cx - cx) <= 1 && Math.abs(b.cy - cy) <= 1);
    const flowM3 = Math.round(world.flux[cellIndex] * 12);

    const parts = [
      `Клетка [${cx}, ${cy}]`,
      `Высота: ${meters >= 0 ? `+${meters.toLocaleString('ru-RU')}` : meters.toLocaleString('ru-RU')} м (${h}/100)`,
      `Биом: ${biome}`,
      `Климат: ${temp > 0 ? `+${temp}` : temp} °C · влажность ${prec}%`,
    ];
    if (flowM3 >= 120 && h >= world.seaLevel) parts.push(`Речной сток: ${flowM3.toLocaleString('ru-RU')} м³/с`);
    if (st) parts.push(`Держава: ${st.name}`);
    if (burg) parts.push(`${burg.capital ? '★ Столица' : 'Город'}: ${burg.name} (${burg.population.toLocaleString('ru-RU')} жит.)`);
    inspectorEl.textContent = parts.join(' · ');
  };

  const buildTerrainBitmap = () => {
    if (!ctx) return;
    const bmpW = Math.min(1280, world.cellsX * 2);
    const bmpH = Math.min(800, world.cellsY * 2);
    if (!terrainCanvas) {
      terrainCanvas = document.createElement('canvas');
    }
    terrainCanvas.width = bmpW;
    terrainCanvas.height = bmpH;
    let tctx = null;
    try {
      tctx = terrainCanvas.getContext('2d');
    } catch {
      tctx = null;
    }
    if (!tctx) return;

    const img = tctx.createImageData(bmpW, bmpH);
    const data = img.data;
    const { cellsX, cellsY, cellH, seaLevel } = world;
    const useRelief = state.overlays.relief;

    for (let py = 0; py < bmpH; py += 1) {
      const cy = Math.min(cellsY - 1, Math.floor((py * cellsY) / bmpH));
      const cyUp = Math.max(0, cy - 1);
      const cyDn = Math.min(cellsY - 1, cy + 1);
      const rowOff = cy * cellsX;
      const rowUp = cyUp * cellsX;
      const rowDn = cyDn * cellsX;

      for (let px = 0; px < bmpW; px += 1) {
        const cx = Math.min(cellsX - 1, Math.floor((px * cellsX) / bmpW));
        const i = rowOff + cx;
        const base = sampleCellColor(world, i, state.layer);
        let shade = 0;
        if (useRelief && cellH[i] >= seaLevel) {
          const hL = cellH[rowOff + Math.max(0, cx - 1)];
          const hR = cellH[rowOff + Math.min(cellsX - 1, cx + 1)];
          const hU = cellH[rowUp + cx];
          const hD = cellH[rowDn + cx];
          shade = clamp(((hL - hR) * 1.4 + (hU - hD) * 1.2) * 2.2, -38, 38);
        }
        let coastDark = 0;
        if (cellH[i] >= seaLevel) {
          if (
            (cx > 0 && cellH[i - 1] < seaLevel) ||
            (cx < cellsX - 1 && cellH[i + 1] < seaLevel) ||
            (cy > 0 && cellH[i - cellsX] < seaLevel) ||
            (cy < cellsY - 1 && cellH[i + cellsX] < seaLevel)
          ) {
            coastDark = -22;
          }
        }
        const p = (py * bmpW + px) * 4;
        data[p] = clamp(base[0] + shade + coastDark, 0, 255);
        data[p + 1] = clamp(base[1] + shade + coastDark, 0, 255);
        data[p + 2] = clamp(base[2] + shade + coastDark, 0, 255);
        data[p + 3] = 255;
      }
    }
    tctx.putImageData(img, 0, 0);
    terrainDirty = false;
  };

  const draw = () => {
    updateHud();
    if (!ctx) return;
    if (terrainDirty) buildTerrainBitmap();

    const cw = canvas.width;
    const ch = canvas.height;
    ctx.save();
    ctx.fillStyle = '#0f2238';
    ctx.fillRect(0, 0, cw, ch);

    ctx.translate(cw / 2 + state.panX, ch / 2 + state.panY);
    ctx.scale(state.zoom, state.zoom);
    ctx.translate(-cw / 2, -ch / 2);

    if (terrainCanvas) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(terrainCanvas, 0, 0, cw, ch);
    }

    const cellW = cw / world.cellsX;
    const cellH = ch / world.cellsY;

    if (state.overlays.grid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1 / state.zoom;
      const stepX = Math.max(4, Math.round(world.cellsX / 16));
      const stepY = Math.max(4, Math.round(world.cellsY / 10));
      ctx.beginPath();
      for (let x = stepX; x < world.cellsX; x += stepX) {
        ctx.moveTo(x * cellW, 0);
        ctx.lineTo(x * cellW, ch);
      }
      for (let y = stepY; y < world.cellsY; y += stepY) {
        ctx.moveTo(0, y * cellH);
        ctx.lineTo(cw, y * cellH);
      }
      ctx.stroke();
    }

    if (state.overlays.borders && world.states.length > 0) {
      ctx.strokeStyle = 'rgba(24, 18, 14, 0.68)';
      ctx.lineWidth = 1.4 / state.zoom;
      ctx.beginPath();
      const stride = world.cellsX > 600 ? 2 : 1;
      for (let y = 0; y < world.cellsY; y += stride) {
        for (let x = 0; x < world.cellsX; x += stride) {
          const i = y * world.cellsX + x;
          const s = world.cellState[i];
          if (!s) continue;
          if (x + stride < world.cellsX && world.cellState[i + stride] !== s && world.cellH[i + stride] >= world.seaLevel) {
            ctx.moveTo((x + stride) * cellW, y * cellH);
            ctx.lineTo((x + stride) * cellW, (y + stride) * cellH);
          }
          if (y + stride < world.cellsY && world.cellState[i + stride * world.cellsX] !== s && world.cellH[i + stride * world.cellsX] >= world.seaLevel) {
            ctx.moveTo(x * cellW, (y + stride) * cellH);
            ctx.lineTo((x + stride) * cellW, (y + stride) * cellH);
          }
        }
      }
      ctx.stroke();
    }

    if (state.overlays.rivers) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const river of world.rivers) {
        if (river.cells.length < 2) continue;
        ctx.beginPath();
        for (let k = 0; k < river.cells.length; k += 1) {
          const c = river.cells[k];
          const rx = ((c % world.cellsX) + 0.5) * cellW;
          const ry = (((c / world.cellsX) | 0) + 0.5) * cellH;
          if (k === 0) ctx.moveTo(rx, ry);
          else ctx.lineTo(rx, ry);
        }
        ctx.strokeStyle = 'rgba(38, 124, 198, 0.92)';
        ctx.lineWidth = Math.max(1.2, Math.min(4.2, Math.log2(river.discharge / 40 + 1))) / Math.sqrt(state.zoom);
        ctx.stroke();
      }
    }

    if (state.overlays.cities) {
      ctx.strokeStyle = 'rgba(232, 198, 132, 0.58)';
      ctx.setLineDash?.([4 / state.zoom, 3 / state.zoom]);
      ctx.lineWidth = 1.1 / state.zoom;
      for (const route of world.routes) {
        ctx.beginPath();
        ctx.moveTo((route.from.cx + 0.5) * cellW, (route.from.cy + 0.5) * cellH);
        ctx.lineTo((route.to.cx + 0.5) * cellW, (route.to.cy + 0.5) * cellH);
        ctx.stroke();
      }
      ctx.setLineDash?.([]);

      const fontSize = Math.max(9, Math.min(14, 11 / Math.sqrt(state.zoom)));
      ctx.font = `600 ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';

      for (const burg of world.burgs) {
        const bx = (burg.cx + 0.5) * cellW;
        const by = (burg.cy + 0.5) * cellH;
        const r = (burg.capital ? 4.5 : 2.8) / Math.sqrt(state.zoom);

        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fillStyle = burg.capital ? '#ffd166' : '#f4f1de';
        ctx.fill();
        ctx.lineWidth = 1.2 / Math.sqrt(state.zoom);
        ctx.strokeStyle = '#1b1f24';
        ctx.stroke();

        if (burg.capital || state.zoom >= 1.35) {
          ctx.fillStyle = 'rgba(15, 20, 28, 0.82)';
          ctx.fillText(burg.name, bx + 0.8 / state.zoom, by - r - 3 / state.zoom + 0.8 / state.zoom);
          ctx.fillStyle = burg.capital ? '#ffe388' : '#f8f9fa';
          ctx.fillText(burg.name, bx, by - r - 3 / state.zoom);
        }
      }
    }

    const activeCell = state.hoverCell >= 0 ? state.hoverCell : state.selectedCell;
    if (activeCell >= 0 && activeCell < world.cellH.length) {
      const hx = (activeCell % world.cellsX) * cellW;
      const hy = ((activeCell / world.cellsX) | 0) * cellH;
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 1.6 / state.zoom;
      ctx.strokeRect(hx, hy, cellW, cellH);
    }

    ctx.restore();
  };

  const regenerate = () => {
    world = generateProceduralWorld(state);
    terrainDirty = true;
    if (typeof options.onWorldChange === 'function') {
      options.onWorldChange(world, toAzgaarWindow(world));
    }
    draw();
    updateInspector(state.selectedCell >= 0 ? state.selectedCell : state.hoverCell);
  };

  const onToolbarClick = (event) => {
    const layerBtn = event.target.closest('[data-proc-layer]');
    if (layerBtn) {
      state.layer = layerBtn.dataset.procLayer;
      for (const node of root.querySelectorAll('[data-proc-layer]')) {
        const active = node.dataset.procLayer === state.layer;
        node.classList.toggle('is-active', active);
        node.setAttribute('aria-pressed', String(active));
      }
      terrainDirty = true;
      draw();
      return;
    }

    const overlayBtn = event.target.closest('[data-proc-overlay]');
    if (overlayBtn) {
      const key = overlayBtn.dataset.procOverlay;
      if (key in state.overlays) {
        state.overlays[key] = !state.overlays[key];
        overlayBtn.classList.toggle('is-active', state.overlays[key]);
        overlayBtn.setAttribute('aria-pressed', String(state.overlays[key]));
        if (key === 'relief') terrainDirty = true;
        draw();
      }
      return;
    }

    const actionBtn = event.target.closest('[data-proc-action]');
    if (!actionBtn) return;
    const act = actionBtn.dataset.procAction;
    if (act === 'random-seed') {
      state.seed = `SAGES-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      seedInput.value = state.seed;
      regenerate();
    } else if (act === 'zoom-in') {
      state.zoom = clamp(Math.round(state.zoom * 1.3 * 100) / 100, 0.5, 24);
      draw();
    } else if (act === 'zoom-out') {
      state.zoom = clamp(Math.round((state.zoom / 1.3) * 100) / 100, 0.5, 24);
      draw();
    } else if (act === 'reset-view') {
      state.zoom = 1;
      state.panX = 0;
      state.panY = 0;
      draw();
    } else if (act === 'open-voxel') {
      options.onOpenVoxel?.(world, toAzgaarWindow(world));
    }
  };

  root.addEventListener('click', onToolbarClick);

  seedInput.addEventListener('change', () => {
    state.seed = seedInput.value.trim() || 'mir-sage-world';
    regenerate();
  });

  templateSelect.addEventListener('change', () => {
    state.template = templateSelect.value;
    regenerate();
  });

  densitySelect?.addEventListener('change', () => {
    state.density = densitySelect.value;
    regenerate();
  });

  seaSlider.addEventListener('input', () => {
    state.seaLevel = Number(seaSlider.value) || 20;
    seaVal.textContent = String(state.seaLevel);
    regenerate();
  });

  moistSlider.addEventListener('input', () => {
    state.moistureShift = Number(moistSlider.value) || 0;
    moistVal.textContent = state.moistureShift > 0 ? `+${state.moistureShift}` : String(state.moistureShift);
    regenerate();
  });

  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  const clientToCell = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return -1;
    const relX = ((clientX - rect.left) / rect.width) * canvas.width;
    const relY = ((clientY - rect.top) / rect.height) * canvas.height;
    const worldX = (relX - canvas.width / 2 - state.panX) / state.zoom + canvas.width / 2;
    const worldY = (relY - canvas.height / 2 - state.panY) / state.zoom + canvas.height / 2;
    const cx = Math.floor((worldX / canvas.width) * world.cellsX);
    const cy = Math.floor((worldY / canvas.height) * world.cellsY);
    if (cx < 0 || cx >= world.cellsX || cy < 0 || cy >= world.cellsY) return -1;
    return cy * world.cellsX + cx;
  };

  canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    dragStartX = event.clientX - state.panX;
    dragStartY = event.clientY - state.panY;
  });

  const onWindowMove = (event) => {
    if (disposed) return;
    if (dragging) {
      state.panX = event.clientX - dragStartX;
      state.panY = event.clientY - dragStartY;
      draw();
      return;
    }
    if (event.target === canvas) {
      const idx = clientToCell(event.clientX, event.clientY);
      if (idx !== state.hoverCell) {
        state.hoverCell = idx;
        updateInspector(idx >= 0 ? idx : state.selectedCell);
        draw();
      }
    }
  };

  const onWindowUp = () => {
    dragging = false;
  };

  canvas.addEventListener('click', (event) => {
    const idx = clientToCell(event.clientX, event.clientY);
    state.selectedCell = idx;
    updateInspector(idx);
    draw();
  });

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2;
    state.zoom = clamp(Math.round(state.zoom * factor * 100) / 100, 0.5, 24);
    draw();
  }, { passive: false });

  window.addEventListener('mousemove', onWindowMove);
  window.addEventListener('mouseup', onWindowUp);

  if (typeof options.onWorldChange === 'function') {
    options.onWorldChange(world, toAzgaarWindow(world));
  }
  draw();
  updateInspector(-1);

  return {
    element: root,
    get world() {
      return world;
    },
    get azgaarWindow() {
      return toAzgaarWindow(world);
    },
    regenerate,
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('mousemove', onWindowMove);
      window.removeEventListener('mouseup', onWindowUp);
      root.remove();
    },
  };
};
