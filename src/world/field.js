/* Поле мира: из карт Azgaar — в растры блоков.

   Здесь живёт вся география: интерполяция высот, биомы, море, озёра, русла рек
   и направление течения. Модуль не знает ни про WebGL, ни про DOM: вход —
   plain-объект, снятый bridge.js с окна Azgaar (или сшитый тестом), выход —
   растры + функции выборки.

   Единица растра = один блок. Карта Azgaar увеличивается по пикселям: один
   пиксель = scale × scale блоков (scale — опция buildField). Мир не замощён:
   одна полная карта, координаты за её краем приводятся к краю (fold). */

import { clamp, fbm2, hash32, noise2 } from './math.js';

/** Уровень моря в Azgaar: h < 20 — вода. */
export const FMG_SEA_LEVEL = 20;

/** Биты флага колонки. */
export const F_WATER = 1; // под водой
export const F_SEA = 2; // море (не река и не озеро)
export const F_RIVER = 4; // русло реки
export const F_LAKE = 8; // озёрная гладь
export const F_ICE = 16; // лёд на поверхности
export const F_BEACH = 32; // примыкает к воде
export const F_SNOW = 64; // снежная шапка
export const F_FALL = 128; // перепад ≥ 2 блока: водопад

/** Подтипы озёр: код фичи → материал колонки. */
export const LAKE_NONE = 0;
export const LAKE_FRESH = 1;
export const LAKE_SALT = 2;
export const LAKE_SINKHOLE = 3;
export const LAKE_DRY = 4;
export const LAKE_LAVA = 5;
export const LAKE_FROZEN = 6;
const LAKE_CODES = {
  freshwater: LAKE_FRESH,
  salt: LAKE_SALT,
  sinkhole: LAKE_SINKHOLE,
  dry: LAKE_DRY,
  lava: LAKE_LAVA,
  frozen: LAKE_FROZEN,
};

/** Блоков на пиксель карты Azgaar по умолчанию и предел (память растёт как scale²). */
export const DEFAULT_SCALE = 2;
export const MAX_SCALE = 8;

/**
 * Профили мира. heightScale — сколько блоков стоит одна единица высоты
 * Azgaar; при 2 рельеф до 160 блоков, и появляются уступы, скалы и водопады.
 */
export const WORLD_PROFILES = {
  1: { heightScale: 1, seaY: 40, worldHeight: 128 },
  2: { heightScale: 2, seaY: 64, worldHeight: 256 },
};

/** Высота Azgaar (0…100) → Y верхнего твёрдого блока. */
export const heightToY = (field, h) => {
  const sea = field.seaLevel;
  if (h >= sea) {
    return clamp(field.seaY + Math.round((h - sea) * field.heightScale), field.seaY, field.worldHeight - 9);
  }
  /* Дно не масштабируем: 20-метровый океан в два раза глубже был бы ямой. */
  return clamp(field.seaY + Math.round(h - sea), 1, field.seaY - 1);
};

/** Билинейная выборка непрерывного поля по решётке клеток. */
const latticeBilinear = (array, u, v, field) => {
  const { spacing, cellsX, cellsY } = field;
  const gx = u / spacing - 0.5;
  const gy = v / spacing - 0.5;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = gx - x0;
  const ty = gy - y0;
  const at = (x, y) => array[clamp(y, 0, cellsY - 1) * cellsX + clamp(x, 0, cellsX - 1)];
  const a = at(x0, y0);
  const b = at(x0 + 1, y0);
  const c = at(x0, y0 + 1);
  const d = at(x0 + 1, y0 + 1);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
};

/** Индекс клетки решётки под пикселем — «ближайшая клетка» для дискретных полей. */
export const latticeCell = (field, u, v) => {
  const cx = clamp(Math.floor(u / field.spacing), 0, field.cellsX - 1);
  const cy = clamp(Math.floor(v / field.spacing), 0, field.cellsY - 1);
  return cy * field.cellsX + cx;
};

/**
 * Координаты колонки внутри одной полной карты. Мир не замощается: край
 * карты — край мира, поэтому колонка за краем приводится к ближайшей
 * колонке края (`inside` — false). Берег у края делает сам Azgaar: края его
 * карты почти всегда морские.
 */
export const fold = (field, x, z) => {
  const u = clamp(x, 0, field.width - 1);
  const v = clamp(z, 0, field.height - 1);
  return { u, v, mx: 0, my: 0, inside: u === x && v === z };
};

/** D8: вектор движения → направление 1…8 (0 — стоячая вода). */
export const direction8 = (du, dv) => {
  if (Math.abs(du) < 1e-6 && Math.abs(dv) < 1e-6) return 0;
  const ax = Math.abs(du);
  const ay = Math.abs(dv);
  if (ax > ay * 2) return du > 0 ? 1 : 5;
  if (ay > ax * 2) return dv > 0 ? 3 : 7;
  if (du > 0 && dv > 0) return 2;
  if (du < 0 && dv > 0) return 4;
  if (du < 0 && dv < 0) return 6;
  return 8;
};

/** Вектор D8-направления в координатах растра (v растёт к югу). */
export const flowVector = (dir) => {
  switch (dir & 15) {
    case 1:
      return [1, 0];
    case 2:
      return [1, 1];
    case 3:
      return [0, 1];
    case 4:
      return [-1, 1];
    case 5:
      return [-1, 0];
    case 6:
      return [-1, -1];
    case 7:
      return [0, -1];
    case 8:
      return [1, -1];
    default:
      return [0, 0];
  }
};

/* ---------- построение поля ---------- */

/**
 * @param {object} source снимок карт (см. bridge.js: extractFields)
 * @param {{ profile?: 1|2, detail?: number }} [options]
 */
export const buildField = (source, options = {}) => {
  const profile = WORLD_PROFILES[options.profile ?? 2] ?? WORLD_PROFILES[2];
  /* Увеличение по пикселям: один пиксель карты Azgaar = scale × scale блоков.
     Клетки и их шкала растягиваются вместе с картой, шум — пропорционально,
     поэтому рельеф выглядит тем же, но крупнее и с мелкой деталью между
     клетками. Сама карта Azgaar не меняется. */
  const scale = clamp(Math.round(options.scale ?? DEFAULT_SCALE), 1, MAX_SCALE);
  const sourceWidth = Math.max(64, Math.round(source.width));
  const sourceHeight = Math.max(64, Math.round(source.height));
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const cellsX = Math.max(2, Math.round(source.cellsX) || Math.ceil(sourceWidth / (source.spacing || 12)));
  const cellsY = Math.max(2, Math.round(source.cellsY) || Math.ceil(sourceHeight / (source.spacing || 12)));
  const spacing = (source.spacing || Math.sqrt((sourceWidth * sourceHeight) / (cellsX * cellsY))) * scale;
  const seaLevel = source.seaLevel ?? FMG_SEA_LEVEL;
  const cellCount = cellsX * cellsY;
  const fill = (array, Type, fallback) => {
    const out = new Type(cellCount);
    if (array) for (let i = 0; i < cellCount; i += 1) out[i] = Number(array[i]) || 0;
    else out.fill(fallback);
    return out;
  };

  const field = {
    width,
    height,
    scale,
    area: width * height,
    spacing,
    cellsX,
    cellsY,
    seaLevel,
    heightScale: profile.heightScale,
    seaY: profile.seaY,
    worldHeight: profile.worldHeight,
    seed: hash32(source.seedSalt || 1, width, height, profile.heightScale),
    detail: options.detail ?? 1,
    cellH: fill(source.cellH, Float32Array, seaLevel),
    cellBiome: fill(source.cellBiome, Uint8Array, 4),
    cellTemp: fill(source.cellTemp, Int8Array, 12),
    cellPrec: fill(source.cellPrec, Uint8Array, 20),
    cellFeature: fill(source.cellFeature, Uint16Array, 0),
    features: source.features ?? [],
    rivers: source.rivers ?? [],
    ground: new Uint8Array(width * height),
    waterY: new Uint8Array(width * height),
    flow: new Uint8Array(width * height),
    flags: new Uint8Array(width * height),
    riverId: new Uint16Array(width * height),
    lakeType: new Uint8Array(width * height),
  };

  /* Высота — непрерывной (шум снимает «ступени клеток»), дискретные поля —
     кусочно-постоянными: биом не имеет права перетекать через берег. */
  const base = field.base = new Float32Array(width * height);
  for (let v = 0; v < height; v += 1) {
    for (let u = 0; u < width; u += 1) {
      let h = latticeBilinear(field.cellH, u, v, field);
      if (h >= seaLevel) {
        h = Math.max(seaLevel, h + fbm2(field.seed, u, v, 3.5 * scale, 3) * 0.85 * field.detail);
      } else {
        h = Math.min(seaLevel - 0.05, h + fbm2(field.seed, u, v, 2.6 * scale, 2) * 0.35 * field.detail);
      }
      const i = v * width + u;
      base[i] = h;
      field.ground[i] = heightToY(field, h);
    }
  }
  field.groundBase = Uint8Array.from(field.ground);

  applySea(field);
  applyLakes(field);
  applyRivers(field);
  applyShore(field);
  applyClimateCaps(field);
  return field;
};

/** Море: всё, что ушло ниже уровня моря. */
const applySea = (field) => {
  const { ground, waterY, flags, area, seaY } = field;
  for (let i = 0; i < area; i += 1) {
    if (ground[i] >= seaY) continue;
    waterY[i] = seaY;
    flags[i] |= F_WATER | F_SEA;
  }
};

/** Озёра: поверхность — own height фичи, а не уровень моря; тип задаёт материал. */
const applyLakes = (field) => {
  const surface = new Map();
  const kinds = new Map();
  for (const feature of field.features) {
    if (!feature || feature.type !== 'lake') continue;
    const h = Number.isFinite(feature.height) ? feature.height : field.seaLevel;
    surface.set(feature.i, clamp(heightToY(field, h), 1, field.worldHeight - 2));
    kinds.set(feature.i, LAKE_CODES[feature.subtype] ?? LAKE_FRESH);
  }
  if (!surface.size) return;
  const { cellFeature, ground, groundBase, waterY, flags, lakeType, width } = field;
  for (let v = 0; v < field.height; v += 1) {
    for (let u = 0; u < width; u += 1) {
      const id = cellFeature[latticeCell(field, u, v)];
      const y = surface.get(id);
      if (y === undefined) continue;
      const i = v * width + u;
      lakeType[i] = kinds.get(id) ?? LAKE_FRESH;
      if (lakeType[i] === LAKE_DRY) {
        flags[i] |= F_LAKE;
        continue;
      }
      if (groundBase[i] > y) {
        flags[i] |= F_LAKE; // берег или остров внутри озера
        continue;
      }
      flags[i] = (flags[i] & ~F_SEA) | F_LAKE | F_WATER;
      waterY[i] = y;
      const depth = lakeType[i] === LAKE_LAVA ? 2 : 1 + ((i * 7919) % 3);
      ground[i] = clamp(Math.min(ground[i], y - depth), 0, y - 1);
    }
  }
};

/**
 * Реки. Точки идут от истока к устью (как river.cells в Azgaar), а считать
 * надо наоборот: от устья вверх, чтобы вода нигде не потекла в гору.
 *
 * Поверхность воды — «бегущий максимум» по дну долины: там, где долина
 * поднимается, вода идёт по склону; где terrain ниже, чем уже посчитанная
 * гладь, вода падает (водопад), но не поднимается. Русло при этом режется
 * ниже глади, поэтому даже на равнине река не «висит» над лугом.
 */
const applyRivers = (field) => {
  const { width, height, ground, groundBase, waterY, flags, flow, riverId } = field;
  const stamp = new Uint32Array(field.area); // чем занята колонка: номер реки + 1
  const cell = (u, v) => v * width + u;
  let tag = 0;

  for (const river of field.rivers) {
    const points = river.points;
    if (!points || points.length < 2) continue;
    tag += 1;
    const half = river.half ?? [];
    const flux = river.flux ?? [];
    let surf = 0;
    let started = false;
    let prevU = 0;
    let prevV = 0;
    let hasPrev = false;

    for (let index = points.length - 1; index >= 0; index -= 1) {
      const [x0, y0] = points[index];
      const [x1, y1] = points[index - 1] ?? points[index]; // следующий вверх по течению
      const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
      const w = clamp(Number(half[index]) || 0.6, 0.4, 12);
      const fl = Number(flux[index]) || 30;

      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps;
        const px = x0 + (x1 - x0) * t;
        const py = y0 + (y1 - y0) * t;
        const u0 = Math.floor(px);
        const v0 = Math.floor(py);
        if (u0 < 0 || v0 < 0 || u0 >= width || v0 >= height) continue;

        const scan = Math.max(1, Math.ceil(w)) + 1;
        let floorY = field.worldHeight;
        for (let dv = -scan; dv <= scan; dv += 1) {
          const v = v0 + dv;
          if (v < 0 || v >= height) continue;
          for (let du = -scan; du <= scan; du += 1) {
            const u = u0 + du;
            if (u < 0 || u >= width) continue;
            const y = groundBase[cell(u, v)];
            if (y < floorY) floorY = y;
          }
        }

        if (!started) {
          const i = cell(u0, v0);
          const lake = (flags[i] & F_LAKE) !== 0 && waterY[i] ? waterY[i] : 0;
          surf = (flags[i] & F_SEA) !== 0 ? field.seaY : Math.max(field.seaY, lake || floorY);
          started = true;
        } else if (floorY <= surf - 2) {
          surf = Math.max(field.seaY, floorY);
          flags[cell(u0, v0)] |= F_FALL;
        } else {
          surf = Math.max(surf, Math.min(floorY, surf + 1));
        }
        surf = clamp(surf, 1, field.worldHeight - 4);

        const depth = clamp(1 + Math.floor(Math.log2(Math.max(1, fl) / 24)), 1, 4);
        const channel = Math.max(1, Math.round(w));
        for (let dv = -channel - 1; dv <= channel + 1; dv += 1) {
          const v = v0 + dv;
          if (v < 0 || v >= height) continue;
          for (let du = -channel - 1; du <= channel + 1; du += 1) {
            const u = u0 + du;
            if (u < 0 || u >= width) continue;
            const i = cell(u, v);
            const inside = Math.hypot(du, dv) <= w + 0.35;
            if (!inside) {
              /* Пойма: берег не должен оказаться ниже воды. Помечать её не
                 нужно — поднятие дна идемпотентно, а общий со «дном русла»
                 штамп съедал канал: река проставляла пойму, а на следующем
                 сэмпле отказывалась копать там русло. */
              if ((flags[i] & F_WATER) === 0 && ground[i] < surf) ground[i] = clamp(surf, 1, field.worldHeight - 2);
              continue;
            }
            if (stamp[i] === tag) continue;
            if (riverId[i] && riverId[i] !== (river.id || 1)) continue; // чужое русло не перебиваем
            stamp[i] = tag;
            riverId[i] = river.id || 1;
            flags[i] = (flags[i] & ~F_SEA) | F_RIVER | F_WATER;
            const bed = clamp(Math.min(groundBase[i], surf - 1, surf - depth), 1, field.worldHeight - 2);
            ground[i] = Math.min(ground[i], bed);
            waterY[i] = surf;
            /* течение — к устью: от текущего сэмпла к предыдущему (уже пройденному) */
            const dir = hasPrev ? direction8(prevU - px, prevV - py) : 0;
            flow[i] = (clamp(surf - bed, 0, 15) << 4) | dir;
            hasPrev = true;
            prevU = u;
            prevV = v;
          }
        }
        prevU = u0;
        prevV = v0;
      }
    }
  }
};

/** Пляжи: песок там, где суша в паре блоков над водой, и берег не ниже глади. */
const applyShore = (field) => {
  const { width, height, ground, waterY, flags } = field;
  const cell = (u, v) => v * width + u;
  for (let v = 0; v < height; v += 1) {
    for (let u = 0; u < width; u += 1) {
      const i = cell(u, v);
      if ((flags[i] & F_WATER) !== 0) continue;
      let surface = 0;
      for (let dv = -1; dv <= 1; dv += 1) {
        for (let du = -1; du <= 1; du += 1) {
          if (!du && !dv) continue;
          const nu = u + du;
          const nv = v + dv;
          if (nu < 0 || nv < 0 || nu >= width || nv >= height) continue;
          const n = cell(nu, nv);
          if ((flags[n] & F_WATER) === 0) continue;
          const y = waterY[n];
          if (y - ground[i] > 3) continue;
          if (y > surface) surface = y;
        }
      }
      if (!surface) continue;
      flags[i] |= F_BEACH;
      if (ground[i] < surface) ground[i] = clamp(surface, 1, field.worldHeight - 2);
    }
  }
};

/** Снег по холоду и по высоте, лёд на воде: по t° решётки, а не по широте. */
const applyClimateCaps = (field) => {
  const { width, height, ground, flags, cellTemp, cellBiome, seaY, heightScale } = field;
  for (let v = 0; v < height; v += 1) {
    for (let u = 0; u < width; u += 1) {
      const i = v * width + u;
      const c = latticeCell(field, u, v);
      const temp = cellTemp[c];
      if ((flags[i] & F_WATER) !== 0) {
        if (temp <= -1) flags[i] |= F_ICE;
        continue;
      }
      const lapse = (ground[i] - seaY) * 0.06 * heightScale;
      if (temp - lapse <= -2 || cellBiome[c] === 11) flags[i] |= F_SNOW;
      else if (temp <= 0 && noise2(field.seed, u, v, 24) > 0.4) flags[i] |= F_SNOW;
    }
  }
};

/* ---------- выборка для чанков ---------- */

/**
 * Всё, что нужно колонке, по мировым координатам (любые целые, включая
 * отрицательные): свёртка в тайл + выборка растров и решётки.
 */
export const sampleColumn = (field, x, z) => {
  const { u, v, mx, my } = fold(field, x, z);
  const i = v * field.width + u;
  const c = latticeCell(field, u, v);
  const flowByte = field.flow[i];
  const flags = field.flags[i];
  return {
    u,
    v,
    mx,
    my,
    y: field.ground[i],
    waterY: (flags & F_WATER) !== 0 ? field.waterY[i] : 0,
    flags,
    dir: flowByte & 15,
    depth: flowByte >> 4,
    lakeType: field.lakeType[i],
    biome: field.cellBiome[c],
    temp: field.cellTemp[c],
    prec: field.cellPrec[c],
    h: field.base[i],
  };
};

/** Только верх твёрдого блока — для превью слота и точки появления. */
export const surfaceY = (field, x, z) => {
  const { u, v } = fold(field, x, z);
  return field.ground[v * field.width + u];
};

/** Ближайшая суша от центра карты — точка появления. */
export const spawnPoint = (field) => {
  const cx = Math.floor(field.width / 2);
  const cy = Math.floor(field.height / 2);
  for (let radius = 0; radius <= Math.max(field.width, field.height); radius += 3) {
    for (let a = 0; a < 24; a += 1) {
      const angle = (a / 24) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(angle) * radius);
      const z = Math.round(cy + Math.sin(angle) * radius);
      const i = clamp(z, 0, field.height - 1) * field.width + clamp(x, 0, field.width - 1);
      if ((field.flags[i] & F_WATER) === 0 && field.ground[i] >= field.seaY) {
        return { x, z, y: field.ground[i] + 1 };
      }
    }
  }
  return { x: cx, z: cy, y: field.seaY + 2 };
};
