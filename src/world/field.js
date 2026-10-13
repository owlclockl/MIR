/* Поле мира: из карт Azgaar — в растры блоков.

   Здесь живёт вся география: интерполяция высот, биомы, море, озёра, русла рек
   и направление течения. Модуль не знает ни про WebGL, ни про DOM: вход —
   plain-объект, снятый bridge.js с окна Azgaar (или сшитый тестом), выход —
   растры + функции выборки.

   Единица растра = один блок. Карта Azgaar увеличивается по пикселям: один
   пиксель = scale × scale блоков (scale — опция buildField). Мир не замощён:
   одна полная карта, координаты за её краем приводятся к краю (fold).

   Земной масштаб — отдельный режим (`field.lazy`). Карта Azgaar размером с
   планету (40 075 017 × 20 003 932 пикселя, 1 пиксель = 1 блок = 1 метр)
   не может лечь в растры width × height: это ~8 × 10^14 колонок. Поэтому
   ленивое поле не выделяет растров вовсе: колонка считается по запросу из
   решётки клеток (у земной карты их миллион — это посильные массивы),
   рек и озёр тем же порядком правил, что и растровый путь (море → озёра →
   реки → берег → климат), а чанки и кадры спрашивают только те колонки,
   что реально видны. Масштаб при этом принудительно 1: пиксель карты и
   есть блок, конвертация не требует коэффициента — именно ради этого
   размер карты и сделан земным. */

import { clamp, fbm2, hash32, noise2, rand01 } from './math.js';

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
 * Потолок колонок полного растра. Выше него поле строится лениво
 * (`field.lazy`): растры ground/waterY/flags на земную карту потребовали бы
 * сотни терабайт, а решётка клеток и реки помещаются легко. Порог заметно
 * выше любой обзорной карты (1920×1080 при scale 8 — 133 млн колонок уже
 * лениво; обычные миры при scale 2 — до ~8 млн и идут прежним путём).
 */
export const LAZY_RASTER_LIMIT = 16_000_000;

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

/* Ширина полосы у границы клетки, где биом выбирается шумом, в блоках. */
const BIOME_DITHER = 3;

/**
 * Биом колонки — с рваной границей. У клетки решётки Azgaar биом один на всю
 * клетку, и в блоках её край читается квадратом в тридцать блоков: это первое,
 * что видно в кадре и чего в природе не бывает. Поэтому у самой границы биом
 * выбирается шумом между своей клеткой и соседней — край размывается на пару
 * блоков. Правило одно на генерацию и кадр: колонка и её блок берут биом отсюда.
 *
 * `cell` и `own` — уже посчитанные клетка и её биом: кадр зовёт это на каждом
 * пикселе, и повторять `latticeCell` там незачем.
 */
export const biomeAt = (field, u, v, cell, own) => {
  const exact = field.packBiome?.[Math.floor(v / field.scale) * field.sourceWidth + Math.floor(u / field.scale)];
  if (exact !== undefined && exact !== 255) return exact;
  const spacing = field.spacing;
  const cx = cell % field.cellsX;
  const cy = (cell - cx) / field.cellsX;
  /* Расстояние до ближайшей границы клетки по обеим осям, в блоках. */
  const lx = u / spacing - cx;
  const ly = v / spacing - cy;
  const edgeX = Math.min(lx, 1 - lx) * spacing;
  const edgeY = Math.min(ly, 1 - ly) * spacing;
  const near = Math.min(edgeX, edgeY);
  if (near > BIOME_DITHER) return own;
  const nx = cx + (edgeX <= edgeY ? (lx < 0.5 ? -1 : 1) : 0);
  const ny = cy + (edgeY < edgeX ? (ly < 0.5 ? -1 : 1) : 0);
  if (nx < 0 || ny < 0 || nx >= field.cellsX || ny >= field.cellsY) return own;
  const other = field.cellBiome[ny * field.cellsX + nx];
  if (other === own) return own;
  /* Ровно на границе уступаем соседу в половине случаев, а к третьему блоку
     внутрь — уже почти никогда: полоса вдоль границы выходит рваной, а не
     ровной. Шум берём на грубой решётке в два блока — в кадре это пятна
     биома, а не рябь по пикселям. */
  const chance = 0.5 * (1 - near / (BIOME_DITHER + 1));
  const noise = rand01(field.seed + 0x51ed, Math.floor(u / 2), Math.floor(v / 2), 0);
  return noise < chance ? other : own;
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
  const sourceWidth = Math.max(64, Math.round(source.width));
  const sourceHeight = Math.max(64, Math.round(source.height));
  /* Ленивый режим: растры на всю карту не выделяются, колонка считается по
     запросу. Включается сам, когда полный растр больше LAZY_RASTER_LIMIT
     колонок (земная карта — именно этот случай), или явно опцией lazy.
     Масштаб здесь всегда 1: пиксель карты = блок, иначе земная конвертация
     снова потребовала бы коэффициента и реки/озёра встали бы не туда. */
  const requestedScale = clamp(Math.round(options.scale ?? DEFAULT_SCALE), 1, MAX_SCALE);
  const lazy = options.lazy ?? sourceWidth * requestedScale * (sourceHeight * requestedScale) > LAZY_RASTER_LIMIT;
  const scale = lazy ? 1 : requestedScale;
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
    sourceWidth,
    sourceHeight,
    scale,
    packHeight: source.packHeight?.length === sourceWidth * sourceHeight ? source.packHeight : null,
    packBiome: source.packBiome?.length === sourceWidth * sourceHeight ? source.packBiome : null,
    packLake: source.packLake?.length === sourceWidth * sourceHeight ? source.packLake : null,
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
    /* Ленивое поле растров не держит: ground/waterY/flow/flags/riverId/
       lakeType/base у него null, а колонку отдаёт lazyColumnAt ниже. Все
       потребители обязаны смотреть field.lazy, а не трогать растры вслепую. */
    lazy,
    base: null, // растровый путь перезапишет настоящим Float32Array ниже
    groundBase: null,
    ground: lazy ? null : new Uint8Array(width * height),
    waterY: lazy ? null : new Uint8Array(width * height),
    flow: lazy ? null : new Uint8Array(width * height),
    flags: lazy ? null : new Uint8Array(width * height),
    riverId: lazy ? null : new Uint16Array(width * height),
    lakeType: lazy ? null : new Uint8Array(width * height),
  };

  if (lazy) {
    const lakes = lakeTables(field);
    field.lakeSurface = lakes.surface;
    field.lakeKinds = lakes.kinds;
    field.riverIndex = buildRiverIndex(field);
    field.lazyCache = new Map();
    /* Детальный шум — в долях клетки решётки, а не в блоках: у земной карты
       клетка ~28 км, и шум с длиной волны 3,5 блока дал бы только метровую
       рябь поверх гладкого билатерального рельефа. */
    field.lazyDetailScale = clamp(spacing * 0.3, 3.5, 32768);
    return field;
  }

  /* Высота — непрерывной (шум снимает «ступени клеток»), дискретные поля —
     кусочно-постоянными: биом не имеет права перетекать через берег. */
  const base = field.base = new Float32Array(width * height);
  for (let v = 0; v < height; v += 1) {
    for (let u = 0; u < width; u += 1) {
      const sourceIndex = Math.floor(v / scale) * sourceWidth + Math.floor(u / scale);
      const packed = field.packHeight?.[sourceIndex];
      let h = packed !== undefined && packed !== 255 ? packed : latticeBilinear(field.cellH, u, v, field);
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

/** Таблицы озёр: id фичи → гладь (Y) и материал. Общие у растрового и ленивого путей. */
const lakeTables = (field) => {
  const surface = new Map();
  const kinds = new Map();
  for (const feature of field.features) {
    if (!feature || feature.type !== 'lake') continue;
    const h = Number.isFinite(feature.height) ? feature.height : field.seaLevel;
    surface.set(feature.i, clamp(heightToY(field, h), 1, field.worldHeight - 2));
    kinds.set(feature.i, LAKE_CODES[feature.subtype] ?? LAKE_FRESH);
  }
  return { surface, kinds };
};

/** Озёра: поверхность — own height фичи, а не уровень моря; тип задаёт материал. */
const applyLakes = (field) => {
  const { surface, kinds } = lakeTables(field);
  if (!surface.size) return;
  const { cellFeature, ground, groundBase, waterY, flags, lakeType, width } = field;
  for (let v = 0; v < field.height; v += 1) {
    for (let u = 0; u < width; u += 1) {
      const sourceIndex = Math.floor(v / field.scale) * field.sourceWidth + Math.floor(u / field.scale);
      const packed = field.packLake?.[sourceIndex];
      const id = packed !== undefined && packed !== 65535 ? packed : cellFeature[latticeCell(field, u, v)];
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

/* ---------- ленивое поле: колонка по запросу ---------- */

/* Шаг бакетов речного индекса, в блоках. Река в земном мире может тянуться
   на тысячи километров: без индекса каждая колонка проверяла бы все
   сегменты всех рек, и одна видимая область стоила бы миллиарды сравнений. */
const RIVER_BUCKET = 8192;

const buildRiverIndex = (field) => {
  const buckets = new Map();
  const key = (bx, bz) => `${bx},${bz}`;
  for (const river of field.rivers) {
    const points = river.points;
    if (!points || points.length < 2) continue;
    for (let s = 0; s + 1 < points.length; s += 1) {
      const [ax, ay] = points[s];
      const [bx, by] = points[s + 1];
      const segment = { river, ax, ay, bx, by, index: s };
      const pad = 16;
      const x0 = Math.floor((Math.min(ax, bx) - pad) / RIVER_BUCKET);
      const x1 = Math.floor((Math.max(ax, bx) + pad) / RIVER_BUCKET);
      const z0 = Math.floor((Math.min(ay, by) - pad) / RIVER_BUCKET);
      const z1 = Math.floor((Math.max(ay, by) + pad) / RIVER_BUCKET);
      for (let bz = z0; bz <= z1; bz += 1) {
        for (let bx = x0; bx <= x1; bx += 1) {
          const k = key(bx, bz);
          if (!buckets.has(k)) buckets.set(k, []);
          buckets.get(k).push(segment);
        }
      }
    }
  }
  return buckets;
};

/** Ближайший сегмент реки к колонке и расстояние до него, или null. */
const lazyRiverHit = (field, u, v) => {
  const list = field.riverIndex.get(`${Math.floor(u / RIVER_BUCKET)},${Math.floor(v / RIVER_BUCKET)}`);
  if (!list) return null;
  let best = null;
  for (const segment of list) {
    const dx = segment.bx - segment.ax;
    const dy = segment.by - segment.ay;
    const length2 = dx * dx + dy * dy || 1;
    const t = clamp(((u - segment.ax) * dx + (v - segment.ay) * dy) / length2, 0, 1);
    const px = segment.ax + dx * t;
    const py = segment.ay + dy * t;
    const dist = Math.hypot(u - px, v - py);
    const half = clamp(
      (Number(segment.river.half?.[segment.index]) || 0.6) * (1 - t) +
        (Number(segment.river.half?.[segment.index + 1]) || 0.6) * t,
      0.4,
      12,
    );
    if (dist > half + 0.35) continue;
    if (!best || dist < best.dist) {
      const flux = Math.max(
        1,
        (Number(segment.river.flux?.[segment.index]) || 30) * (1 - t) +
          (Number(segment.river.flux?.[segment.index + 1]) || 30) * t,
      );
      best = { segment, dist, px, py, half, flux };
    }
  }
  return best;
};

/** Непрерывная высота и Y вершины колонки — та же формула, что в растре. */
const lazyHeight = (field, u, v) => {
  const sourceIndex = Math.floor(v / field.scale) * field.sourceWidth + Math.floor(u / field.scale);
  const packed = field.packHeight?.[sourceIndex];
  let h = packed !== undefined && packed !== 255 ? packed : latticeBilinear(field.cellH, u, v, field);
  const detailScale = field.lazyDetailScale;
  if (h >= field.seaLevel) {
    h = Math.max(field.seaLevel, h + fbm2(field.seed, u, v, detailScale, 3) * 0.85 * field.detail);
  } else {
    h = Math.min(field.seaLevel - 0.05, h + fbm2(field.seed, u, v, detailScale * 0.74, 2) * 0.35 * field.detail);
  }
  return h;
};

/**
 * Базовая колонка ленивого поля: море → озёра → реки, без берега и климата
 * (берегу нужны соседи, климату — финальная высота). Результат кэшируется:
 * чанк спрашивает колонку несколько раз (колонка, пещеры, декор, соседи).
 */
const lazyBase = (field, u, v) => {
  const key = v * field.width + u;
  let entry = field.lazyCache.get(key);
  if (entry?.base) return entry.base;
  const cell = latticeCell(field, u, v);
  const h = lazyHeight(field, u, v);
  const groundBase = heightToY(field, h);
  let ground = groundBase;
  let waterY = 0;
  let flags = 0;
  let lakeType = 0;
  let flow = 0;
  let riverId = 0;
  if (ground < field.seaY) {
    waterY = field.seaY;
    flags |= F_WATER | F_SEA;
  }
  const sourceIndex = Math.floor(v / field.scale) * field.sourceWidth + Math.floor(u / field.scale);
  const packedLake = field.packLake?.[sourceIndex];
  const lakeId = packedLake !== undefined && packedLake !== 65535 ? packedLake : field.cellFeature[cell];
  const lakeY = field.lakeSurface.get(lakeId);
  if (lakeY !== undefined) {
    lakeType = field.lakeKinds.get(lakeId) ?? LAKE_FRESH;
    if (lakeType === LAKE_DRY) {
      flags |= F_LAKE;
    } else if (groundBase > lakeY) {
      flags |= F_LAKE; // берег или остров внутри озера
    } else {
      flags = (flags & ~F_SEA) | F_LAKE | F_WATER;
      waterY = lakeY;
      const depth = lakeType === LAKE_LAVA ? 2 : 1 + ((u * 7919 + v * 104729) % 3);
      ground = clamp(Math.min(ground, lakeY - depth), 0, lakeY - 1);
    }
  }
  const hit = lazyRiverHit(field, u, v);
  if (hit) {
    /* Гладь растрового пути идёт «бегущим максимумом» от устья вверх по
       всей реке — ленивая колонка всей реки не видит. Здесь гладь — высота
       дна долины в ближайшей точке русла: вода не висит над склоном и не
       тонет под ним, а русло режется ниже глади на глубину по стоку. */
    const valleyY = heightToY(field, lazyHeight(field, Math.round(hit.px), Math.round(hit.py)));
    const surf = clamp(Math.max(field.seaY, valleyY), 1, field.worldHeight - 4);
    const depth = clamp(1 + Math.floor(Math.log2(Math.max(1, hit.flux) / 24)), 1, 4);
    riverId = hit.segment.river.id || 1;
    flags = (flags & ~F_SEA) | F_RIVER | F_WATER;
    const bed = clamp(Math.min(groundBase, surf - 1, surf - depth), 1, field.worldHeight - 2);
    ground = Math.min(ground, bed);
    waterY = surf;
    flow = (clamp(surf - bed, 0, 15) << 4) | direction8(hit.segment.bx - hit.segment.ax, hit.segment.by - hit.segment.ay);
  }
  const base = { h, ground, groundBase, waterY, flags, lakeType, flow, riverId, cell };
  if (!entry) {
    if (field.lazyCache.size > 300_000) field.lazyCache.clear();
    entry = { base: null, full: null };
    field.lazyCache.set(key, entry);
  }
  entry.base = base;
  return base;
};

/** Полная колонка ленивого поля: базовая + берег по соседям + климат. */
export const lazyColumnAt = (field, u, v) => {
  const key = v * field.width + u;
  const cached = field.lazyCache.get(key)?.full;
  if (cached) return cached;
  const base = lazyBase(field, u, v);
  let { ground, flags } = base;
  if ((flags & F_WATER) === 0) {
    let surface = 0;
    for (let dv = -1; dv <= 1; dv += 1) {
      for (let du = -1; du <= 1; du += 1) {
        if (!du && !dv) continue;
        const nu = u + du;
        const nv = v + dv;
        if (nu < 0 || nv < 0 || nu >= field.width || nv >= field.height) continue;
        const neighbour = lazyBase(field, nu, nv);
        if ((neighbour.flags & F_WATER) === 0) continue;
        if (neighbour.waterY - ground > 3) continue;
        if (neighbour.waterY > surface) surface = neighbour.waterY;
      }
    }
    if (surface) {
      flags |= F_BEACH;
      if (ground < surface) ground = clamp(surface, 1, field.worldHeight - 2);
    }
  }
  const temp = field.cellTemp[base.cell];
  if ((flags & F_WATER) !== 0) {
    if (temp <= -1) flags |= F_ICE;
  } else {
    const lapse = (ground - field.seaY) * 0.06 * field.heightScale;
    if (temp - lapse <= -2 || field.cellBiome[base.cell] === 11) flags |= F_SNOW;
    else if (temp <= 0 && noise2(field.seed, u, v, 24) > 0.4) flags |= F_SNOW;
  }
  const full = { ...base, ground, flags };
  const entry = field.lazyCache.get(key);
  if (entry) entry.full = full;
  return full;
};

/* ---------- выборка для чанков ---------- */

/**
 * Всё, что нужно колонке, по мировым координатам (любые целые, включая
 * отрицательные): свёртка в тайл + выборка растров и решётки.
 */
export const sampleColumn = (field, x, z) => {
  const { u, v, mx, my } = fold(field, x, z);
  if (field.lazy) {
    const column = lazyColumnAt(field, u, v);
    const c = column.cell;
    return {
      u,
      v,
      mx,
      my,
      y: column.ground,
      waterY: (column.flags & F_WATER) !== 0 ? column.waterY : 0,
      flags: column.flags,
      dir: column.flow & 15,
      depth: column.flow >> 4,
      lakeType: column.lakeType,
      biome: biomeAt(field, u, v, c, field.cellBiome[c]),
      temp: field.cellTemp[c],
      prec: field.cellPrec[c],
      h: column.h,
    };
  }
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
    biome: biomeAt(field, u, v, c, field.cellBiome[c]),
    temp: field.cellTemp[c],
    prec: field.cellPrec[c],
    h: field.base[i],
  };
};

/** Только верх твёрдого блока — для превью слота и точки появления. */
export const surfaceY = (field, x, z) => {
  const { u, v } = fold(field, x, z);
  if (field.lazy) return lazyColumnAt(field, u, v).ground;
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
      /* Через sampleColumn: у ленивого поля растров нет, а правило одно. */
      const column = sampleColumn(field, clamp(x, 0, field.width - 1), clamp(z, 0, field.height - 1));
      if ((column.flags & F_WATER) === 0 && column.y >= field.seaY) {
        return { x: clamp(x, 0, field.width - 1), z: clamp(z, 0, field.height - 1), y: column.y + 1 };
      }
    }
  }
  return { x: cx, z: cy, y: field.seaY + 2 };
};
