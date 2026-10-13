/* Проверка мира блоками: поле → чанк → слой. Запуск: npm run test:voxel
   Карта блоками рисуется в canvas, но сам canvas в node недоступен, поэтому
   проверяем то, что нельзя увидеть глазами в браузере: согласованность данных
   на швах и то, что пиксель слоя = блок в этой же точке мира.
   1. Край карты — край мира (fold): колонка за краем прижимается к краю,
   а не отражается и не повторяется;
   2. Река: вода нигде не течёт в гору, у каждого русла есть направление
   течения, канал глубже глади;
   3. Чанк: детерминированность (два раза один и тот же чанк), соседние чанки
   сходятся с «юбкой» — без этого между чанками видны щели;
   4. Палитра: упаковка/распаковка чанка сохраняет блоки;
   5. Срез: пиксель = блок на плоскости реза (цвета берутся из атласа),
   честный подсчёт клеток, вода/берег/стрелки течения и пресеты ярусов;
   6. Бюджет времени: сколько стоит поле и один чанк — по нему судим, нужна
   ли распараллеленная генерация. */

import './lib/root.mjs';
import {
  buildField,
  fold,
  sampleColumn,
  F_ICE,
  F_RIVER,
  F_LAKE,
  biomeAt,
  F_WATER,
  F_FALL,
  flowVector,
  direction8,
  latticeCell,
} from '../src/world/field.js';

import {
  AIR,
  ATLAS_COLUMNS,
  BIOME_PALETTE,
  BLOCKS,
  BLOCK_COUNT,
  biomeFromClimate,
  blockName,
  GRASS,
  isKnownBlock,
  isOpaque,
  isSolid,
  paletteFor,
  SAND,
  STONE,
  WATER,
  WATER_SOURCE,
  TILES,
} from '../src/world/blocks.js';

import { CHUNK_SX, CHUNK_SZ, blockAt, columnBlock, fieldProfile, generateChunk, paletteCache } from '../src/world/chunk.js';
import { encodePalette, decodePalette } from '../src/world/chunk.js';
import { readSource, mapsReady, missingMapsPart, VoxelSourceError } from '../src/world/bridge.js';
import { createVoxelWorld } from '../src/world/world.js';
import { buildAtlas, buildTileColors } from '../src/world/atlas.js';
import {
  LAYER_PRESETS,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  buildSlice,
  cutY,
  makeView,
  presetLevel,
  zoneName,
} from '../src/world/layers.js';

import { fakeEditorWindow, FAKE_EXPECT } from './lib/fake-fmg.mjs';

/* Русское согласование числительного: «61 проверка», а не «61 проверок». */
const plural = (n, one, few, many) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const checks = [];
const add = (ok, what, detail = '') => checks.push({ ok: Boolean(ok), what, detail });

/* ---------- синтетический источник: остров с рекой и озером ---------- */

const CELLS_X = 40;
const CELLS_Y = 30;
const SPACING = 12;
const WIDTH = CELLS_X * SPACING;
const HEIGHT = CELLS_Y * SPACING;
const island = () => {
  const cellH = new Float32Array(CELLS_X * CELLS_Y);
  const cellBiome = new Uint8Array(CELLS_X * CELLS_Y);
  const cellTemp = new Int8Array(CELLS_X * CELLS_Y);
  const cellPrec = new Uint8Array(CELLS_X * CELLS_Y);
  const cellFeature = new Uint16Array(CELLS_X * CELLS_Y);
  for (let cy = 0; cy < CELLS_Y; cy += 1) {
    for (let cx = 0; cx < CELLS_X; cx += 1) {
      const nx = (cx / (CELLS_X - 1)) * 2 - 1;
      const ny = (cy / (CELLS_Y - 1)) * 2 - 1;
      const d = Math.hypot(nx * 1.05, ny * 1.4);
      const ridge = Math.sin(nx * 5.1 + 0.6) * Math.cos(ny * 4.3 - 0.4);
      let h = 20 + (1 - Math.min(1, d)) * 46 + ridge * 9;
      h -= Math.max(0, d - 0.78) * 150; // край уходит под море
      const i = cy * CELLS_X + cx;
      h = Math.round(Math.max(2, Math.min(96, h)));
      cellH[i] = h;
      const t = Math.round(30 - Math.abs(ny) * 34 + (h > 55 ? -10 : 0));
      cellTemp[i] = t;
      const p = Math.round(30 + Math.cos(nx * 3.2) * 24 + (t > 10 ? 8 : -6));
      cellPrec[i] = Math.max(2, Math.min(96, p));
      cellBiome[i] = h <= 20 ? 0 : t < -6 ? 11 : t < 2 ? 10 : t < 10 ? 9 : p < 18 ? 1 : p < 30 ? 4 : p < 44 ? 6 : 7;
    }
  }

  /* Реку ведём по склону: исток — самая высокая клетка, дальше — шаг к самой
     низкой из соседних (как это делает сам Azgaar, только без депрешн-фильтров).
     Искусственная «диагональ» через хребет давала бы русло, идущее в гору, и
     проверка монотонности глади ловила бы не генератор, а выдуманный путь. */
  const riverPoints = [];
  const half = [];
  const flux = [];
  let bestCell = 0;
  for (let i = 1; i < cellH.length; i += 1) if (cellH[i] > cellH[bestCell]) bestCell = i;
  let cx = bestCell % CELLS_X;
  let cy = (bestCell / CELLS_X) | 0;
  const visited = new Set();
  for (let step = 0; step < 120; step += 1) {
    visited.add(cy * CELLS_X + cx);
    riverPoints.push([Math.round((cx + 0.5) * SPACING), Math.round((cy + 0.5) * SPACING)]);
    let next = -1;
    let nextH = cellH[cy * CELLS_X + cx];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx2 = cx + dx;
        const ny2 = cy + dy;
        if (nx2 < 0 || ny2 < 0 || nx2 >= CELLS_X || ny2 >= CELLS_Y) continue;
        const n = ny2 * CELLS_X + nx2;
        if (visited.has(n)) continue;
        if (cellH[n] < nextH) {
          nextH = cellH[n];
          next = n;
        }
      }
    }
    if (next < 0 || nextH <= 20) break; // дошли до моря
    cx = next % CELLS_X;
    cy = (next / CELLS_X) | 0;
  }
  for (let i = 0; i < riverPoints.length; i += 1) {
    const t = i / Math.max(1, riverPoints.length - 1);
    half.push(0.7 + t * 2.4);
    flux.push(30 + Math.round(t * 900));
  }

  const lakeCells = [];
  for (let cy = 18; cy <= 21; cy += 1) for (let cx = 26; cx <= 29; cx += 1) lakeCells.push(cy * CELLS_X + cx);
  for (const c of lakeCells) cellFeature[c] = 1;
  return {
    width: WIDTH,
    height: HEIGHT,
    spacing: SPACING,
    cellsX: CELLS_X,
    cellsY: CELLS_Y,
    seaLevel: 20,
    seedSalt: 20260,
    cellH,
    cellBiome,
    cellTemp,
    cellPrec,
    cellFeature,
    features: [{ i: lakeCells[0], type: 'lake', subtype: 'freshwater', height: 34 }],
    rivers: [{ id: 1, points: riverPoints, half, flux }],
  };
};

const t0 = performance.now();
const field = buildField(island(), { profile: 2, detail: 1 });
const fieldMs = performance.now() - t0;

add(field.seed > 0, 'затравка поля собрана из размера и соли');

/* ---------- 1. одна полная карта, без замощения ---------- */

add(
  field.width === WIDTH * field.scale && field.height === HEIGHT * field.scale,
  'поле = карта Azgaar × масштаб по пикселям',
  `${field.width} × ${field.height} блоков при scale ${field.scale}`,
);
{
  const outX = fold(field, field.width + 5, 100);
  const outNegX = fold(field, -3, 100);
  const outZ = fold(field, 100, field.height + 9);
  add(
    outX.u === field.width - 1 && outNegX.u === 0 && outZ.v === field.height - 1 && !outX.inside,
    'край карты — край мира: колонка за краем не отражается и не повторяется',
    `u ${outX.u} и ${outNegX.u}, v ${outZ.v}`,
  );
  const inside = fold(field, 10, 10);
  add(inside.u === 10 && inside.v === 10 && inside.inside, 'внутри карты координаты не меняются');
}

/* Край карты — не шов: соседние колонки у края не совпадают с зеркальными,
   а последняя колонка и её «продолжение за край» совпадают по значениям. */
{
  const edge = sampleColumn(field, field.width - 1, 100);
  const beyond = sampleColumn(field, field.width + 40, 100);
  add(edge.y === beyond.y && edge.flags === beyond.flags, 'за краем карты остаётся край, а не повтор тайла');
}

/* ---------- 2. река и течение ---------- */

let channel = 0;
let flowless = 0;
let uphill = 0;
let falls = 0;
for (let v = 0; v < field.height; v += 1) {
  for (let u = 0; u < field.width; u += 1) {
    const i = v * field.width + u;
    if ((field.flags[i] & F_RIVER) === 0) continue;
    channel += 1;
    if (field.waterY[i] <= field.ground[i]) uphill += 1;
    if (field.waterY[i] < field.seaY) uphill += 1;
    if ((field.flow[i] & 15) === 0) flowless += 1;
    if ((field.flags[i] & F_FALL) !== 0) falls += 1;
  }
}

add(channel > 200, 'русло легло на растр', `${channel} колонок воды`);
add(uphill === 0, 'вода в русле выше дна и не ниже уровня моря', uphill ? `${uphill} нарушений` : `${falls} водопадов`);

/* Направления нет у первых сэмплов от устья (течь некуда — там уже море) и у
   стоячих озёр. Для русла в 500+ колонок это доли процента. */
add(
  channel > 0 && flowless / channel < 0.03,
  'у русла есть направление течения',
  `${flowless} из ${channel} колонок без направления (срез устья)`,
);

/* Гладь не растёт к устью: идём по точкам полилинии от истока. */
let rising = 0;
let prevLevel = null;
for (const [px, py] of island().rivers[0].points) {
  let best = null;
  for (let dv = -2; dv <= 2; dv += 1) {
    for (let du = -2; du <= 2; du += 1) {
      const u = Math.round(px) + du;
      const v = Math.round(py) + dv;
      if (u < 0 || v < 0 || u >= field.width || v >= field.height) continue;
      const i = v * field.width + u;
      if ((field.flags[i] & F_RIVER) === 0) continue;
      const level = field.waterY[i];
      if (best === null || Math.abs(level - (prevLevel ?? level)) < Math.abs(best - (prevLevel ?? level))) best = level;
    }
  }
  if (best === null) continue;
  if (prevLevel !== null && best > prevLevel) rising += 1;
  prevLevel = best;
}

add(rising === 0, 'гладь реки монотонна от истока к устью', rising ? `${rising} подъёмов` : 'течь вниз без подъёмов');

const d8 = [1, 2, 3, 4, 5, 6, 7, 8].every((dir) => {
  const [dx, dz] = flowVector(dir);
  return direction8(dx, dz) === dir;
});

add(d8, 'D8-направление и вектор согласованы', 'все 8 сторон');

/* ---------- 3. чанки ---------- */

/**
 * Чанки для проверок берём по содержимому, а не «на глаз»: вода в холодном
 * биоме скрыта льдом и граней воды не даёт, поэтому ищем незамерзшую воду.
 */
const findChunk = (test) => {
  const cellsX = field.cellsX;
  for (let cz = 0; cz < Math.ceil(HEIGHT / CHUNK_SZ); cz += 1) {
    for (let cx = 0; cx < Math.ceil(WIDTH / CHUNK_SX); cx += 1) {
      for (let v = cz * CHUNK_SZ; v < Math.min(HEIGHT, (cz + 1) * CHUNK_SZ); v += 1) {
        for (let u = cx * CHUNK_SX; u < Math.min(WIDTH, (cx + 1) * CHUNK_SX); u += 1) {
          const i = v * field.width + u;
          const c = Math.floor(v / field.spacing) * cellsX + Math.floor(u / field.spacing);
          if (test(i, c)) return { cx, cz, u, v };
        }
      }
    }
  }
  return null;
};

const land = findChunk((i) => (field.flags[i] & F_WATER) === 0 && field.ground[i] > field.seaY + 8);
const midX = land.cx;
const midZ = land.cz;
const a0 = generateChunk(field, midX, midZ, { ores: true, caves: true });
const a1 = generateChunk(field, midX, midZ, { ores: true, caves: true });

let diff = 0;
for (let i = 0; i < a0.blocks.length; i += 1) if (a0.blocks[i] !== a1.blocks[i]) diff += 1;

add(diff === 0, 'чанк детерминирован', diff ? `${diff} блоков разошлись` : `${a0.blocks.length >> 10} KiB байт-в-байт`);
add(
  a0.sx === CHUNK_SX + 2 && a0.sz === CHUNK_SZ + 2,
  'юбка в один блок по краям',
  `${a0.sx} × ${a0.sz} × ${a0.height}`,
);

/* Сосед справа: его первые внутренние колонки = последние колонки юбки. */
const right2 = generateChunk(field, midX + 1, midZ, { ores: true, caves: true });

let border = 0;
for (let lz = 1; lz < CHUNK_SZ + 1; lz += 1) {
  for (let y = 0; y < a0.height; y += 1) {
    /* наши последние две колонки = первые две колонки соседа (у обоих юбка) */
    if (blockAt(a0, CHUNK_SX, y, lz) !== blockAt(right2, 0, y, lz)) border += 1;
    if (blockAt(a0, CHUNK_SX + 1, y, lz) !== blockAt(right2, 1, y, lz)) border += 1;
  }
}

add(
  border === 0,
  'чанки сходятся с юбкой соседа',
  border ? `${border} несовпадений` : 'кроны и пещеры через границу не режутся',
);

/* ---------- 4. палитра ---------- */

const packed = encodePalette(a0.blocks);
const unpacked = decodePalette(packed);

let paletteDiff = 0;
for (let i = 0; i < packed.indices.length; i += 1) if (unpacked[i] !== a0.blocks[i]) paletteDiff += 1;

const ratio = (unpacked.length / Math.max(1, packed.indices.length + packed.palette.length * 1)).toFixed(2);

add(
  paletteDiff === 0 && packed.palette !== null,
  'упаковка палитры обратима',
  `${packed.bits} бит, ×${ratio} компактнее`,
);

let foreign = null;
try {
  decodePalette({ v: 7, bits: packed.bits, palette: packed.palette, indices: packed.indices });
} catch (error) {
  foreign = error.message;
}

add(foreign !== null && /версия/i.test(foreign), 'чужая версия палитры — понятная ошибка', foreign ?? '');

/* Палитра биомов не должна вырождаться в «везде булыжник»: своя поверхность у
   каждого, растения — у всех, кроме ледника (11), где их и не бывает. */
const stoneTops = BIOME_PALETTE.map((p, id) => (p.top === STONE ? id : -1)).filter((id) => id >= 0);
const bareBiomes = BIOME_PALETTE.map((p, id) =>
  !p.filler.length || (!p.trees.length && !p.plants.length && id !== 11) ? id : -1,
).filter((id) => id >= 0);

add(
  BIOME_PALETTE.length === 13 && stoneTops.length === 0 && bareBiomes.length === 0,
  'биомы не сводятся к голому камню',
  `${BIOME_PALETTE.length} биомов, заглушек: ${stoneTops.length + bareBiomes.length}`,
);

add(
  isKnownBlock(paletteFor(200).top) && paletteFor(200).filler.length > 0,
  'неизвестный id биомы не роняет генератор',
  blockName(paletteFor(200).top),
);

add(
  [
    [-100, -40, 0],
    [100, 60, 120],
    [0, 50, 25],
    [50, -50, 3],
    [255, 127, 1],
  ].every(([moisture, temperature, height]) => {
    const id = biomeFromClimate(moisture, temperature, height);
    return id >= 0 && id < BIOME_PALETTE.length && Boolean(BIOME_PALETTE[id]);
  }),
  'климат всегда попадает в известный биом',
);

const altField = buildField({ ...island(), seedSalt: 999999 }, { profile: 2, detail: 1 });
const altChunk = generateChunk(altField, midX, midZ, { ores: true, caves: true });

let saltDiff = 0;
for (let i = 0; i < altChunk.blocks.length; i += 1) if (altChunk.blocks[i] !== a0.blocks[i]) saltDiff += 1;

add(saltDiff > 0, 'другая соль карты — другой чанк', `${saltDiff} блоков отличается`);

/* ---------- 5. срез (слой) ---------- */

const colors = buildTileColors(buildAtlas(field.seed));
const COLORS_OK =
  colors.length === TILES.length &&
  colors.every(
    (c) => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255),
  ) &&
  /* [255,0,255] atlas.js оставляет там, где тайл вышел полностью прозрачным:
     на карте это значит «тайл не нарисован», и терять такой сигнал нельзя. */
  !colors.some((c) => c[0] === 255 && c[1] === 0 && c[2] === 255);
add(
  COLORS_OK,
  'палитра слоя = средний цвет тайла атласа',
  `${colors.length} тайлов × ${ATLAS_COLUMNS}×${ATLAS_COLUMNS} атлас`,
);

const sliceView = makeView([Math.round(field.width / 2), Math.round(field.height / 2)], 96, 64);

add(
  sliceView.x0 + Math.floor(sliceView.cellsX / 2) === Math.round(field.width / 2) &&
    sliceView.z0 + Math.floor(sliceView.cellsZ / 2) === Math.round(field.height / 2),
  'кадр центрируется на запрошенной точке',
  `x0=${sliceView.x0}, z0=${sliceView.z0}`,
);

const bareSlice = () =>
  buildSlice(field, colors, null, sliceView, {
    level: field.worldHeight - 1,
    shade: false,
    coast: false,
    arrows: false,
    labels: false,
  });
const top = bareSlice();

add(top.data.length === 96 * 64 * 4, 'кадр = 4 байта на блок', `${top.width}×${top.height}`);
add(
  top.fromChunks === 0 && top.fromField === 96 * 64,
  'без чанков кадр красится схемой поля',
  `из поля ${top.fromField}, из чанков ${top.fromChunks}`,
);

add(
  top.fromChunks + top.fromField === 96 * 64,
  'каждый блок кадра учтён ровно один раз',
  `${top.fromChunks} + ${top.fromField} = ${96 * 64}`,
);

let alphaBad = 0;
for (let i = 3; i < top.data.length; i += 4) if (!(top.data[i] >= 0 && top.data[i] <= 255)) alphaBad += 1;

add(alphaBad === 0, 'прозрачность кадра в шкале 0…255', `${alphaBad} выходов`);

const again = bareSlice();

let sameBytes = 0;
for (let i = 0; i < top.data.length; i += 1) if (top.data[i] !== again.data[i]) sameBytes += 1;

add(sameBytes === 0, 'кадр детерминирован: два прогона побайтно равны', `${sameBytes} расхождений`);

/* Правило «срезаем до кожи»: над вершиной показываем вершину, под водой —
   зеркало воды; ниже грунта — сам ярус. */
const probeCells = [];
for (let attempt = 0; attempt < 4000 && probeCells.length < 48; attempt += 1) {
  const x = (attempt * 37 + 5) % field.width;
  const z = (attempt * 61 + 11) % field.height;
  probeCells.push({ i: z * field.width + x, x, z, column: sampleColumn(field, x, z) });
}

let cutWrong = 0;
for (const { i, column } of probeCells) {
  const wet = (column.flags & F_WATER) !== 0 && column.waterY > column.y ? column.waterY : column.y;
  for (const level of [1, field.seaY, column.y, field.worldHeight]) {
    const expect = level > wet ? wet : level;
    if (cutY(field, i, level) !== expect) cutWrong += 1;
  }
}

add(cutWrong === 0, 'cutY = min(вершина колонки, ярус)', `${probeCells.length} колонок × 4 яруса`);

/* Кадр для воды, берега и течения: вокруг русла и на его же зеркале — иначе в
   центре острова воды нет вовсе, и проверка молча повиснет на нуле. */
let wetCell = -1;
for (let i = 0; i < field.area; i += 1) {
  if ((field.flags[i] & F_RIVER) !== 0 && (field.flow[i] & 15) !== 0 && field.waterY[i] > field.ground[i]) {
    wetCell = i;
    break;
  }
}

add(
  wetCell >= 0,
  'в пробном поле есть проточная клетка',
  wetCell >= 0 ? `ярус воды ${field.waterY[wetCell]}` : 'нет ни рек, ни направления течения',
);

const wetLevel = wetCell >= 0 ? field.waterY[wetCell] : field.seaY;

/* Вид растёт вместе с полем: тот же кусок карты Azgaar в блоках — в field.scale раз больше. */
const wetView = makeView([wetCell % field.width, Math.floor(wetCell / field.width)], 132 * field.scale, 96 * field.scale);

/* То же правило, по которому срез решает «в клетке вода»: плоскость в толще
   воды или выше вершины — в обоих случаях видно воду. */
const coveredAt = (i, level, cell) => {
  if ((field.flags[i] & F_WATER) === 0) return false;
  if (field.waterY[i] <= field.ground[i] || level <= field.ground[i]) return false;

  /* Вода подо льдом — не вода: лёд это блок, а не жидкость, и в кадре он не
     считается ни водой, ни течением. Правило сверяется со блоком колонки. */
  if ((field.flags[i] & F_ICE) === 0) return true;
  return level <= field.waterY[i] - (field.cellTemp[cell] <= -12 ? 3 : 1);
};

const wetSlice = buildSlice(field, colors, null, wetView, {
  level: wetLevel,
  shade: false,
  coast: false,
  arrows: false,
  labels: false,
});

let flagged = 0;
for (let z = 0; z < wetView.cellsZ; z += 1) {
  for (let x = 0; x < wetView.cellsX; x += 1) {
    const { u, v } = fold(field, wetView.x0 + x, wetView.z0 + z);
    if (coveredAt(v * field.width + u, wetLevel, latticeCell(field, u, v))) flagged += 1;
  }
}

add(
  wetSlice.water === flagged && flagged > 0,
  'число водных пикселей = правилу воды поля',
  `${wetSlice.water} из ${flagged}`,
);

/* Береговая линия: пиксель ставится там, где «занято водой» меняется на
   «свободно», и рисуются они по сухую сторону. Считаем переходы и сравниваем с
   изменённым кадром. */
const coastOn = buildSlice(field, colors, null, wetView, {
  level: wetLevel,
  shade: false,
  coast: true,
  arrows: false,
  labels: false,
});

let flips = 0;
for (let z = 0; z < wetView.cellsZ; z += 1) {
  for (let x = 0; x < wetView.cellsX; x += 1) {
    const { u, v } = fold(field, wetView.x0 + x, wetView.z0 + z);
    const here = coveredAt(v * field.width + u, wetLevel, latticeCell(field, u, v));
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
    ]) {
      const { u: nu, v: nv } = fold(field, wetView.x0 + x + dx, wetView.z0 + z + dz);
      if (coveredAt(nv * field.width + nu, wetLevel, latticeCell(field, nu, nv)) !== here) flips += 1;
    }
  }
}

let coastChanged = 0;
for (let i = 0; i < coastOn.data.length; i += 4) if (coastOn.data[i] !== wetSlice.data[i]) coastChanged += 1;

add(
  flips > 8 && coastChanged > 0 && coastChanged <= flips,
  'линия воды = граница «занято / свободно»',
  `${flips} переходов, ${coastChanged} перекрашенных блоков`,
);

/* Стрелки течения: ставим на решётку и проверяем, что яркость растёт по
   направлению flow — то есть стрелка смотрит туда, куда течение записало поле. */
const arrowOff = buildSlice(field, colors, null, wetView, {
  level: wetLevel,
  time: 0,
  shade: false,
  coast: false,
  arrows: false,
  labels: false,
});

const arrowOn = buildSlice(field, colors, null, wetView, {
  level: wetLevel,
  time: 0,
  shade: false,
  coast: false,
  arrows: true,
  labels: false,
});

const lum = (slice, x, z) => {
  const o = (z * slice.width + x) * 4;
  return slice.data[o] + slice.data[o + 1] + slice.data[o + 2];
};

let arrowCell = null;
for (let z = 1; z + 1 < wetView.cellsZ && !arrowCell; z += 1) {
  for (let x = 1; x + 1 < wetView.cellsX && !arrowCell; x += 1) {
    if ((wetView.x0 + x) % 4 || (wetView.z0 + z) % 4) continue;
    const { u, v } = fold(field, wetView.x0 + x, wetView.z0 + z);
    const i = v * field.width + u;
    if (!coveredAt(i, wetLevel) || !(field.flow[i] & 15)) continue;
    arrowCell = { x, z, dir: field.flow[i] & 15 };
  }
}

add(
  Boolean(arrowCell),
  'на решётке течения есть куда ставить стрелку',
  arrowCell
    ? `блок ${arrowCell.x}/${arrowCell.z}, направление ${arrowCell.dir}`
    : 'нет ни одного проточного блока в кадре',
);
if (arrowCell) {
  const [dx, dz] = flowVector(arrowCell.dir);
  const { x, z } = arrowCell;
  const tip = lum(arrowOn, x + dx, z + dz) - lum(arrowOff, x + dx, z + dz);
  const tail = lum(arrowOn, x - dx, z - dz) - lum(arrowOff, x - dx, z - dz);
  const beyond = lum(arrowOn, x - 2 * dx, z - 2 * dz) - lum(arrowOff, x - 2 * dx, z - 2 * dz);
  add(
    tip > 0 && tail > 0 && tip > tail && beyond === 0,
    'стрелка разворачивается по направлению течения',
    `остриё +${tip}, хвост +${tail}, за стрелкой ${beyond}`,
  );
  const pulse = buildSlice(field, colors, null, wetView, {
    level: wetLevel,
    time: 1.1,
    shade: false,
    coast: false,
    arrows: true,
    labels: false,
  });
  let pulseDiff = 0;
  for (let i = 0; i < pulse.data.length; i += 1) if (pulse.data[i] !== arrowOn.data[i]) pulseDiff += 1;
  add(pulseDiff > 0, 'течение анимировано: кадр с другой фазой отличается', `${pulseDiff} байт`);

/* Течение рек: вода в русле дышит по времени, суша и без течения — нет. */
const riverBase = { level: wetLevel, shade: false, coast: false, arrows: false, labels: false };

const riverA = buildSlice(field, colors, null, wetView, { ...riverBase, time: 0 });
const riverB = buildSlice(field, colors, null, wetView, { ...riverBase, time: 1.3 });
const riverOff = { ...riverBase, flow: false };

const offA = buildSlice(field, colors, null, wetView, { ...riverOff, time: 0 });
const offB = buildSlice(field, colors, null, wetView, { ...riverOff, time: 1.3 });

let riverDiff = 0;
let landDiff = 0;
for (let z = 0; z < wetView.cellsZ; z += 1) {
  for (let x = 0; x < wetView.cellsX; x += 1) {
    const i = (z * wetView.cellsX + x) * 4;
    const changed = riverA.data[i] !== riverB.data[i] || riverA.data[i + 1] !== riverB.data[i + 1] || riverA.data[i + 2] !== riverB.data[i + 2];
    if (!changed) continue;
    const { u, v } = fold(field, wetView.x0 + x, wetView.z0 + z);
    if (coveredAt(v * field.width + u, wetLevel) || (field.flags[v * field.width + u] & F_WATER) !== 0) riverDiff += 1;
    else landDiff += 1;
  }
}

let offDiff = 0;
for (let i = 0; i < offA.data.length; i += 1) if (offA.data[i] !== offB.data[i]) offDiff += 1;

add(riverDiff > 0, 'реки текут: кадры разного времени отличаются на воде', `${riverDiff} пикселей воды`);
add(landDiff === 0, 'течение не трогает сушу', `${landDiff} пикселей суши`);
add(offDiff === 0, 'без течения кадры одинаковы', `${offDiff} байт`);
}

/* Отметки высот: подписываем локальные вершины, и только над водой. */
/* Своя вьюха под отметки: та же область карты, что и у среза, но в масштабе поля. */
const labelView = makeView([Math.round(field.width / 2), Math.round(field.height / 2)], 96 * field.scale, 64 * field.scale);
const labelOff = buildSlice(field, colors, null, labelView, {
  level: field.worldHeight - 1,
  shade: false,
  coast: false,
  arrows: false,
  labels: false,
});

const labelOn = buildSlice(field, colors, null, labelView, {
  level: field.worldHeight - 1,
  shade: false,
  coast: false,
  arrows: false,
  labels: true,
});

let labelChanged = 0;
for (let i = 0; i < labelOn.data.length; i += 4) if (labelOn.data[i] !== labelOff.data[i]) labelChanged += 1;

add(labelChanged > 0, 'отметки высот рисуются на суше', `${labelChanged} перекрашенных блоков`);

/* Пресеты ярусов. `blockAtWorld` тут намеренно null: без чанков поиск «самого
   пещеристого» яруса невозможен, и пресет обязан отвалиться на понятную
   страховку, а не на NaN или исключение. */
const noBlocks = () => null;
for (const preset of LAYER_PRESETS) {
  const level = presetLevel(field, noBlocks, sliceView, preset.id);
  add(
    Number.isInteger(level) && level >= 1 && level <= field.worldHeight,
    `пресет «${preset.name}» попадает в ярус мира`,
    `ярус ${level} из ${field.worldHeight}`,
  );
}

const surfaceLevel = presetLevel(field, noBlocks, sliceView, 'surface');
const seaLevel = presetLevel(field, noBlocks, sliceView, 'sea');
const rootLevel = presetLevel(field, noBlocks, sliceView, 'root');

add(
  surfaceLevel === field.worldHeight - 1,
  'пресет «Поверхность» = верхний блок, ничего не срезано',
  `ярус ${surfaceLevel} при потолке ${field.worldHeight}`,
);

add(seaLevel === field.seaY, 'пресет «Вода» = уровень моря', `${seaLevel}`);
add(rootLevel === 2, 'пресет «Основание» = пол мира', `${rootLevel}`);

const hints = new Set(
  LAYER_PRESETS.map((preset) => zoneName(field, presetLevel(field, noBlocks, sliceView, preset.id), 140)),
);

add(
  hints.size >= LAYER_PRESETS.length - 2,
  'подпись под ползунком различает пресеты',
  `${hints.size} разных формулировок из ${LAYER_PRESETS.length}`,
);

add(
  /не срезан/.test(zoneName(field, field.worldHeight, 140)) && /основание/i.test(zoneName(field, 1, 140)),
  'крайние ярусы подписаны по-человечески',
  `${zoneName(field, field.worldHeight, 140)} / ${zoneName(field, 1, 140)}`,
);

add(
  ZOOM_MIN < ZOOM_DEFAULT && ZOOM_DEFAULT < ZOOM_MAX,
  'шкала масштаба задана',
  `${ZOOM_MIN}…${ZOOM_MAX} px на блок, по умолчанию ${ZOOM_DEFAULT}`,
);

add(
  typeof isKnownBlock === 'function' && isKnownBlock(WATER_SOURCE) && !isKnownBlock(29),
  'в таблице блоков нет дыр под чужими id',
);

/* Цена генерации чанка — на прогретом движке: первая же генерация это прогрев
   JIT и аллокатора, и на ней «12 мс» превращаются в «1 мс» уже со второго
   чанка, поэтому замер на одном чанке ничего не значит. */
const warm = [];
for (let i = 0; i < 24; i += 1) warm.push(generateChunk(field, midX + i, midZ, { ores: true, caves: true }));

const genStart = performance.now();
for (let i = 100; i < 124; i += 1) generateChunk(field, i, midZ + 3, { ores: true, caves: true });

const genMs = (performance.now() - genStart) / 24;

/* ---------- 6. бюджет ---------- */

add(fieldMs < 4000, 'поле строится в пределах паузы', `${fieldMs.toFixed(0)} мс на ${field.area} колонок`);
add(genMs < 10, 'чанк: генерация — доли кадра', `генерация ${genMs.toFixed(2)} мс на чанк`);

const sliceMs = (() => {
  const t0 = performance.now();
  for (let i = 0; i < 8; i += 1) bareSlice();
  return (performance.now() - t0) / 8;
})();

add(sliceMs < 24, 'кадр 96×64 блоков вписан в кадр интерфейса', `${sliceMs.toFixed(1)} мс на кадр, ${96 * 64} блоков`);
add(
  isOpaque(WATER) === false && isOpaque(WATER_SOURCE) === false,
  'вода не перекрывает грани соседей',
  `${BLOCK_COUNT} блоков, таблица до ${BLOCKS.length - 1}`,
);

add(BLOCKS[AIR].solid === false, 'воздух не блокирует обзор');

/* ---------- 7. мост: окно редактора → снимок карт ---------- */

/* Окно собирается общим помощником — тот же снимок проверяет и DOM-тест вида. */
const win = fakeEditorWindow();

add(mapsReady(win) === true, 'мост: готовность окна распознана');

const src = readSource(win, { seed: 'мост' });

add(
  src.width === FAKE_EXPECT.width && src.height === FAKE_EXPECT.height,
  'мост: размеры взяты из graph',
  `${src.width}×${src.height}`,
);

add(src.seaLevel === 20 && src.spacing === 16, 'мост: уровень моря и шаг сетки');
add(
  src.cellH[FAKE_EXPECT.cells.land] === FAKE_EXPECT.heights.dry &&
    src.cellH[FAKE_EXPECT.cells.lake] === FAKE_EXPECT.heights.lake &&
    src.cellH[1] === FAKE_EXPECT.heights.sea,
  'мост: высоты pack перенесены на grid, остальное осталось из grid',
);

add(
  src.cellBiome[FAKE_EXPECT.cells.land] === 1 &&
    src.cellTemp[FAKE_EXPECT.cells.lake] === 3 &&
    src.cellPrec[FAKE_EXPECT.cells.river] === 40,
  'мост: биомы, температуры и осадки доехали',
);

/* Плотный берег pack проходит посреди клетки grid: перенос только на grid
   давал другую сушу, хотя на карте Azgaar берег был на x=48. */
const packedWin = fakeEditorWindow();
packedWin.pack.cells.p = [[24, 48], [48, 48], [72, 48]];
packedWin.pack.cells.h = [5, 5, 70];
packedWin.pack.cells.biome = [0, 0, 11];
packedWin.Pack = { findCell: (x) => (x < 48 ? 0 : 2) };
const packedSource = readSource(packedWin);
const packedField = buildField(packedSource, { scale: 2 });
const seaSample = sampleColumn(packedField, 40, 176);
const landSample = sampleColumn(packedField, 140, 176);
add(
  packedSource.packHeight[88 * 96 + 20] === 5 && packedSource.packHeight[88 * 96 + 70] === 70 &&
    (seaSample.flags & F_WATER) !== 0 && (landSample.flags & F_WATER) === 0,
  'берег блока = ближайшая pack-клетка Azgaar, даже когда grid показывает другое',
);
add(
  landSample.biome === 11 && biomeAt(packedField, 140, 176, latticeCell(packedField, 140, 176), 4) === 11,
  'биом блока = биом той же pack-клетки',
);
add(
  packedSource.packLake[31 * 96 + 17] === 0 && (sampleColumn(packedField, 34, 62).flags & F_LAKE) === 0,
  'озеро grid не затапливает соседнюю pack-клетку',
);

add(src.stats.lakes === 1 && src.cellFeature[FAKE_EXPECT.cells.lake] === 1, 'мост: озеро помечено на клетке-родителе');
add(
  src.stats.rivers === 1 && src.rivers[0].points.length === 2 && src.rivers[0].half[0] > 0.4,
  'мост: русло прочитано и имеет полуширину',
  `${src.rivers[0]?.half?.[0]?.toFixed(2) ?? 0} px`,
);

const bridgeField = buildField(src, { profile: 0, detail: 0 });
const riverPixels = [];
for (let i = 0; i < bridgeField.flags.length; i += 1) {
  if ((bridgeField.flags[i] & F_RIVER) === 0) continue;
  riverPixels.push([i % bridgeField.width, Math.floor(i / bridgeField.width)]);
}

const near = (x, y) => riverPixels.some(([px, py]) => Math.abs(px - x) <= 3 && Math.abs(py - y) <= 3);

add(riverPixels.length > 8, 'мост: русло прорастрировано в поле', `${riverPixels.length} пикселей`);
add(
  FAKE_EXPECT.riverPoints.every(([x, y]) => near(x, y)),
  'мост: русло прошло по точкам генератора',
  'излучистость не сместила канал',
);

add(bridgeField.ground[0] >= bridgeField.seaY - 4, 'мост: суша над уровнем моря осталась сушей');

let early = null;
try {
  readSource(null);
} catch (error) {
  early = error;
}

add(early instanceof VoxelSourceError, 'мост: закрытый документ — человеческая ошибка', early?.message ?? '');

const half = { grid: { spacing: 8, cells: { h: [1, 2] } } };

add(missingMapsPart(half).includes('упаковк'), 'мост: подсказка говорит, чего не хватает', missingMapsPart(half));

let partial = null;
try {
  readSource(half);
} catch (error) {
  partial = error;
}

add(partial instanceof VoxelSourceError && /рано/.test(partial.message), 'мост: генерация не дошла — мир не строим');

/* Биомы появляются позже упаковки — между этими шагами окно уже отдаёт сетку и
   pack, но ещё не отдаёт `pack.cells.biome`. Мост считал такой мир готовым и
   падал в переносе биомов («Cannot read properties of undefined»), поэтому
   проверка готовности обязана спрашивать и про биомы. */
const noBiomes = fakeEditorWindow({ biomes: false });

add(mapsReady(noBiomes) === false, 'мост: без биомов мир ещё не готов');
add(/биом/.test(missingMapsPart(noBiomes)), 'мост: подсказка называет биомы', missingMapsPart(noBiomes));

let biomeEarly = null;
try {
  readSource(noBiomes);
} catch (error) {
  biomeEarly = error;
}

add(
  biomeEarly instanceof VoxelSourceError && /рано/.test(biomeEarly.message),
  'мост: окно без биомов — ожидание, а не падение',
  biomeEarly?.message ?? '',
);

noBiomes.pack.cells.biome = [1, 7, 7];

add(mapsReady(noBiomes) === true && readSource(noBiomes).stats.rivers === 1, 'мост: биомы доехали — снимок берётся');

/* ---------- 8. хранилище чанков и пиксель по блоку ---------- */

/* Хост не передаём: без DOM мир считается ровно так же. Проверяем то, что в
   браузере видно только глазами: очередь укладывается в бюджет кадра, кадр
   красится построенными чанками, а прыжок на другой край тайла вытесняет
   их из памяти. */
const pickWorld = createVoxelWorld(field, { radius: 2 });

/* Столбик берём сухой и выше моря: иначе проверка начнёт спорить сама с собой,
   попав в пруд вместо рельефа. */
let pickX = -1;
let pickZ = -1;
let pickColumn = null;
for (let attempt = 0; attempt < 6000 && pickX < 0; attempt += 1) {
  const x = (attempt * 37 + 5) % field.width;
  const z = (attempt * 61 + 11) % field.height;
  const column = sampleColumn(field, x, z);
  if ((column.flags & F_WATER) === 0 && column.y > field.seaY + 6) {
    pickX = x;
    pickZ = z;
    pickColumn = column;
  }
}

const fresh = pickWorld.stats();

add(fresh.chunks === 0 && fresh.ready === 0, 'мир до фокуса не строит ничего', `${fresh.chunks} чанков`);

pickWorld.focus(pickX, pickZ);

const queued = pickWorld.stats();

add(
  queued.queued === (2 * 2 + 1) ** 2 && queued.ready === 0,
  'фокус ставит весь радиус в очередь',
  `${queued.queued} чанков в очереди, ${queued.pending} не создано`,
);
for (let guard = 0; guard < 24 && pickWorld.stats().queued; guard += 1) pickWorld.step(50);

const built = pickWorld.stats();

add(
  built.ready > 0 && built.bytes > 0,
  'очередь строит чанки в бюджете кадра',
  `${built.ready} готово, ${(built.bytes / 1024).toFixed(0)} КиБ блоков`,
);

/* Край биома: у клетки решётки биом один на всю клетку, и без размытия его
   граница читается в кадре квадратом в тридцать блоков. Проверяем, что в
   глубине клетки биом свой, а у границы — рваный и всё равно из двух соседей:
   ничего третьего шум выбрать не может. */
let ditch = 0;
let deep = 0;
let deepWrong = 0;
let borderEscape = 0;
for (let cy = 1; cy < field.cellsY - 1; cy += 1) {
  for (let cx = 1; cx < field.cellsX - 1; cx += 1) {
    const own = field.cellBiome[cy * field.cellsX + cx];
    const west = field.cellBiome[cy * field.cellsX + cx - 1];
    const north = field.cellBiome[(cy - 1) * field.cellsX + cx];
    const centerU = Math.round((cx + 0.5) * field.spacing);
    const centerV = Math.round((cy + 0.5) * field.spacing);
    if (biomeAt(field, centerU, centerV, cy * field.cellsX + cx, own) !== own) deepWrong += 1;
    else deep += 1;

    /* Полоса у западной границы клетки: там биом обязан иногда уступать соседу. */
    const u = Math.round(cx * field.spacing) + 1;
    for (let k = 0; k < 8; k += 1) {
      const v = Math.round(((cy + 0.3 + k * 0.05) * field.spacing)) % field.height;
      const cell = latticeCell(field, u, v);
      const mine = field.cellBiome[cell];
      const picked = biomeAt(field, u, v, cell, mine);
      if (picked !== mine) {
        ditch += 1;
        if (picked !== west && picked !== north) borderEscape += 1;
      }
    }
  }
}

add(deepWrong === 0 && deep > 100, 'биом: в глубине клетки биом свой', `${deep} проб, промахов ${deepWrong}`);
add(ditch > 0 && borderEscape === 0, 'биом: у границы клетки биом рваный и только из соседей', `размыто ${ditch} проб`);

/* Кадр и чанк обязаны видеть один и тот же блок на одном ярусе. Это и есть
   тот баг «ужасного отображения»: поле рисовалось приблизительно и приглушённо,
   а блоки из чанков — точно, поэтому граница построенных чанков читалась в
   кадре прямоугольником на всю загруженную область. Сверяем поверхность: там
   кадр показывает то же, что лежит в чанке (руда и пещеры до вершины не
   доходят, поэтому совпадение обязано быть точным). */
const readyChunk = pickWorld.get(Math.floor(pickX / CHUNK_SX), Math.floor(pickZ / CHUNK_SZ)).chunk;
const pixelProfile = {};

const pixelPalettes = paletteCache(field);

let matched = 0;
let mismatched = 0;
for (let dz = 0; dz < CHUNK_SZ; dz += 1) {
  for (let dx = 0; dx < CHUNK_SX; dx += 1) {
    const u = readyChunk.x0 + readyChunk.ox + dx;
    const v = readyChunk.z0 + readyChunk.oz + dz;
    const i = v * field.width + u;
    const level = cutY(field, i, field.worldHeight - 1);
    const inChunk = blockAt(readyChunk, readyChunk.ox + dx, level, readyChunk.oz + dz);
    const fromField = columnBlock(level, fieldProfile(field, u, v, i, pixelProfile, pixelPalettes));
    if (inChunk === fromField) matched += 1;
    else mismatched += 1;
  }
}

add(
  matched === CHUNK_SX * CHUNK_SZ && mismatched === 0,
  'кадр и чанк: один блок на одном ярусе — границы чанков не видно',
  `${matched} совпало, ${mismatched} разошлось`,
);

/* Цена чанка — средняя по очереди, а не «последний измеренный»: один замер
   зависит от JIT и сборщика мусора и на загруженной машине прыгает до 25 мс,
   а контракт здесь — средний бюджет кадра. */
const timing = createVoxelWorld(field, { radius: 1 }); // радиус зажимается снизу до 2 — это продукт-решение
timing.focus(pickX, pickZ);

let spent = 0;
let made = 0;
for (let guard = 0; guard < 60 && timing.stats().queued; guard += 1) {
  const part = timing.step(4);
  spent += part.ms;
  made += part.generated;
}

const mean = spent / Math.max(1, made);

add(
  made === 25 && mean < 16,
  'чанк вписан в средний бюджет кадра',
  `${made} чанков (радиус 2 — минимум), в среднем ${mean.toFixed(1)} мс`,
);

const atomic = createVoxelWorld(field, { radius: 0 });

atomic.focus(pickX, pickZ);

const single = atomic.step(0);

add(
  single.generated === 1,
  'гранулярность очереди: один чанк за шаг при нулевом бюджете',
  `${single.generated} чанк за ${single.ms.toFixed(1)} мс`,
);

atomic.dispose();

timing.dispose();

/* Пиксель слоя = блок на плоскости реза. Берём ярус «ничего не срезано» и
   выключенные наложения: тогда цвет обязан равняться среднему цвету верхней
   грани того же блока, что лежит в чанке. Листву, воду и прочее полупрозрачное
   не сравниваем: они намеренно смешиваются с фоном. */
const blockAtWorld = (x, y, z) => {
  const record = pickWorld.get(Math.floor(x / CHUNK_SX), Math.floor(z / CHUNK_SZ));
  const chunk = record?.chunk;
  if (!chunk) return null;
  const lx = x - chunk.x0;
  const lz = z - chunk.z0;
  if (lx < 0 || lx >= chunk.sx || lz < 0 || lz >= chunk.sz) return null;
  return blockAt(chunk, lx, y, lz);
};

const FLAT = new Set([BLOCKS[GRASS].top, BLOCKS[SAND].top, BLOCKS[STONE].top]);
const blockView = makeView([pickX, pickZ], 64, 40);
const blockSlice = buildSlice(field, colors, pickWorld, blockView, {
  level: field.worldHeight - 1,
  shade: false,
  coast: false,
  arrows: false,
  labels: false,
});

add(
  blockSlice.fromChunks === 64 * 40,
  'кадр над построенным радиусом целиком из чанков',
  `${blockSlice.fromChunks} из ${64 * 40}`,
);

let compared = 0;
let mismatch = 0;
for (let z = 0; z < blockSlice.height; z += 1) {
  for (let x = 0; x < blockSlice.width; x += 1) {
    const wx = blockView.x0 + x;
    const wz = blockView.z0 + z;
    const { u, v } = fold(field, wx, wz);
    const i = v * field.width + u;
    const y = cutY(field, i, blockSlice.level);
    const id = blockAtWorld(wx, y, wz);
    if (id === null) continue;
    const tile = BLOCKS[id]?.top;
    if (!FLAT.has(tile)) continue;
    compared += 1;
    const o = (z * blockSlice.width + x) * 4;
    const want = colors[tile];
    if (blockSlice.data[o] !== want[0] || blockSlice.data[o + 1] !== want[1] || blockSlice.data[o + 2] !== want[2])
      mismatch += 1;
    if (blockSlice.data[o + 3] !== 255) mismatch += 1;
  }
}

add(
  compared > 24 && mismatch === 0,
  'пиксель слоя = блок на плоскости реза',
  `${compared} блоков сверено, ${mismatch} расхождений`,
);

/* Под поверхностью пусто быть не может: три блока под грунтом — сплошные. */
const underRecord = pickWorld.get(Math.floor(pickX / CHUNK_SX), Math.floor(pickZ / CHUNK_SZ));
const under = underRecord?.chunk;

let hollow = 0;
if (under) {
  for (let dy = 1; dy <= 3; dy += 1) {
    if (!isSolid(blockAt(under, pickX - under.x0, pickColumn.y - dy, pickZ - under.z0))) hollow += 1;
  }
}

add(Boolean(under) && hollow === 0, 'под поверхностью нет пустот', under ? `${hollow} пустых клеток` : 'чанк не готов');

const before = pickWorld.stats().dropped;

pickWorld.focus(field.width * 3, field.height * 3);
for (let guard = 0; guard < 24; guard += 1) pickWorld.step(50);

add(
  pickWorld.stats().dropped > before,
  'прыжок на другой край тайла вытесняет чанки',
  `вытеснено ${pickWorld.stats().dropped - before}`,
);

pickWorld.dispose();

const cleared = pickWorld.stats();

add(cleared.chunks === 0 && cleared.bytes === 0, 'dispose освобождает хранилище', `${cleared.chunks} чанков`);

/* ---------- итог ---------- */

console.log('Мир блоками: поле → чанк → слой\n');

let bad = 0;
for (const check of checks) {
  console.log(`${check.ok ? ' ✓' : ' ×'} ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);
  if (!check.ok) bad += 1;
}

console.log('');
if (bad) {
  console.log(
    `МИР БЛОКАМИ ЛОМАЕТСЯ: не прошло ${plural(bad, 'проверка', 'проверки', 'проверок')} — ${bad} из ${checks.length}.`,
  );
  process.exit(1);
}

console.log(`ВСЁ ХОРОШО — ${checks.length} ${plural(checks.length, 'проверка', 'проверки', 'проверок')} мира блоками.`);
