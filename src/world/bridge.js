/* Мост: документ Azgaar → снимок географии для дополнительного вида
   планеты. Только чтение.

   iframe с редактором и игра живут на одном источнике (srcdoc или /fmg/),
   поэтому окна достают напрямую: `win.grid`, `win.pack`, `win.Rivers` — те же
   объекты, что рисуют карту. Правим мы только своё состояние; генератор не
   трогаем ни на байт (AGENTS.md), и никаких патчей в него не вставляем.

   Что снимаем и почему именно это:

   • высот — `pack.cells.h`, а не `grid.cells.h`: в pack уже лежит результат
     заполнения впадин и прорезки русел (`resolveDepressions`, `downcutRivers`),
     то есть рельеф, по которому вода реально потекла. Для клеток, которых в
     pack нет (открытый океан), остаётся grid-высота;
   • биомов — `pack.cells.biome` через `pack.cells.g` (родительская клетка
     grid): планетарная раскраска должна совпадать с исходной картой;
   • температур и осадков — `grid.cells.temp/prec`: они считаются на grid и в
     pack не переноссятся;
   • рек — `Rivers.addMeandering(r.cells, r.points)` даёт точки [x, y, flux] с
     излучистостью, а `Rivers.getOffset` — полуширину русла в пикселях. Оба
     метода — те же, чем генератор строит полилинию на экране, поэтому
     планетарный слой рек повторяет русла исходной карты;
   • озёр — `pack.features` с `type:'lake'`: поверхность — `height` фичи, а не
     уровень моря, тип (`subtype`) задаёт материал (пресное/солёное/сухое/лава).

   Снимок маленький (несколько типизированных массивов на ~10 000 клеток), и
   `buildField` из него детерминированно пересобирает всё поле: то же окно →
   тот же мир. */

/** Снимок неполный: генерация ещё не дошла до нужного шага или документ закрыт. */
export class VoxelSourceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VoxelSourceError';
  }
}

/**
 * Достаточно ли данных для поля: сетка, упаковка, «родительские» клетки и
 * биомы. Биомы обязательны: их перенос читает `pack.cells.biome` по клетке, и
 * без него снимок падал на `undefined` — а готовым мост его уже считал, потому
 * что биомы появляются позже упаковки (порядок генератора: сетка → pack →
 * климат → биомы).
 */
export const mapsReady = (win) =>
  Boolean(
    win?.grid?.cells?.h?.length &&
      win?.pack?.cells?.h?.length &&
      win?.pack?.cells?.g?.length &&
      win?.pack?.cells?.biome?.length &&
      win?.grid?.spacing,
  );

/** Что не готово — для человеческой подсказки в интерфейсе. */
export const missingMapsPart = (win) => {
  if (!win || !win.grid) return 'документ редактора не открыт';
  if (!win.grid.cells?.h?.length) return 'высоты сетки ещё не построены';
  if (!win.pack?.cells?.h?.length) return 'упаковка карты (pack) ещё не построена';
  if (!win.pack?.cells?.g?.length) return 'связь pack → grid ещё не построена';
  if (!win.pack?.cells?.biome?.length) return 'биомы клеток ещё не посчитаны';
  return 'данных достаточно';
};

const STRING_HASH = 0x9e3779b1;
const hashString = (value) => {
  let h = 2166136261;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, STRING_HASH) >>> 0;
  }
  return h >>> 0;
};

const numberOr = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** Высоты и биомы pack-клеток переносим на решётку grid через pack.cells.g. */
const spreadPackToGrid = (grid, pack, cellsX, cellsY, seaLevel) => {
  const total = cellsX * cellsY;
  /* Мост обязан называть свою причину, а не падать `TypeError` из недр: снимок
     берут и руками, и тесты, а генератор живёт в соседнем окне. */
  if (!pack?.cells?.g?.length) throw new VoxelSourceError('упаковка карты (pack) ещё не построена');
  if (!pack.cells.biome?.length) throw new VoxelSourceError('биомы клеток ещё не посчитаны: строить рано');
  const cellH = new Float32Array(total);
  const cellBiome = new Uint8Array(total);
  const raw = grid.cells.h;
  for (let i = 0; i < total; i += 1) {
    const h = numberOr(raw[i], seaLevel);
    cellH[i] = h;
    cellBiome[i] = h <= seaLevel ? 0 : 4; // 0 — море, 4 — луг: разумное «неизвестно»
  }
  const { g, h: packH, biome } = pack.cells;
  for (let i = 0; i < g.length; i += 1) {
    const parent = g[i];
    if (!(parent >= 0 && parent < total)) continue;
    const height = numberOr(packH[i], NaN);
    if (Number.isFinite(height)) cellH[parent] = height;
    const id = numberOr(biome[i], NaN);
    if (Number.isFinite(id)) cellBiome[parent] = Math.max(0, Math.min(255, Math.round(id)));
  }
  return { cellH, cellBiome };
};

/** Озёра: ключ в cellFeature → описание фичи. Ключи наши, порядок не важен. */
const readLakes = (pack, cellsX, cellsY, seaLevel) => {
  const features = [];
  const cellFeature = new Uint16Array(cellsX * cellsY);
  const packLakeKeys = new Uint16Array(pack.cells.h.length);
  const list = Array.isArray(pack.features) ? pack.features : [];
  for (const feature of list) {
    if (!feature || feature.type !== 'lake' || !Array.isArray(feature.cells) || !feature.cells.length) continue;
    const key = features.length + 1;
    if (key >= 65535) break;
    let marked = 0;
    for (const cell of feature.cells) {
      const parent = pack.cells.g[cell];
      if (!(parent >= 0 && parent < cellFeature.length)) continue;
      cellFeature[parent] = key;
      packLakeKeys[cell] = key;
      marked += 1;
    }
    if (!marked) continue;
    features.push({
      i: key,
      type: 'lake',
      subtype: String(feature.subtype ?? 'freshwater'),
      height: numberOr(feature.height, seaLevel),
    });
  }
  return { features, cellFeature, packLakeKeys };
};

/**
 * Реки в точках, полуширине и стоке. `Rivers` — тот же модуль, что рисует
 * излучистость на карте; если его нет (старый документ, ручной снимок), берём
 * центры клеток: русло будет прямым, но не исчезнет.
 */
const readRivers = (win, pack, width, height) => {
  const Rivers = win.Rivers;
  const list = Array.isArray(pack.rivers) ? pack.rivers : [];
  const pointsOf = pack?.cells?.p ?? null;
  const rivers = [];
  let skipped = 0;
  for (let index = 0; index < list.length; index += 1) {
    const river = list[index];
    const cells = Array.isArray(river?.cells) ? river.cells : null;
    if (!cells || cells.length < 2) {
      skipped += 1;
      continue;
    }
    let raw = null;
    if (Rivers && typeof Rivers.addMeandering === 'function') {
      try {
        raw = Rivers.addMeandering(cells, Array.isArray(river.points) ? river.points : null);
      } catch (error) {
        void error;
        raw = null;
      }
    }
    if (!raw || raw.length < 2) {
      raw = [];
      for (const cell of cells) {
        const point = pointsOf && cell > 0 ? pointsOf[cell] : null;
        if (point && Number.isFinite(point[0])) raw.push([point[0], point[1], numberOr(river.discharge, 30)]);
      }
    }
    if (raw.length < 2) {
      skipped += 1;
      continue;
    }
    const widthFactor = numberOr(river.widthFactor, 1);
    const sourceWidth = numberOr(river.sourceWidth, 0.5);
    const points = [];
    const half = [];
    const flux = [];
    let seen = 0;
    for (let i = 0; i < raw.length; i += 1) {
      const [x, y, flow] = raw[i];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < -8 || y < -8 || x > width + 8 || y > height + 8) continue; // за кадром рисовать нечего
      const value = numberOr(flow, 30);
      if (value > seen) seen = value;
      let offset = sourceWidth;
      if (Rivers && typeof Rivers.getOffset === 'function') {
        try {
          offset = Rivers.getOffset({ flux: seen, pointIndex: points.length, widthFactor, startingWidth: sourceWidth });
        } catch (error) {
          void error;
          offset = sourceWidth + Math.log2(Math.max(1, seen)) * 0.35;
        }
      } else {
        offset = sourceWidth + Math.log2(Math.max(1, seen)) * 0.35;
      }
      points.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
      half.push(Math.max(0.4, Math.min(12, numberOr(offset, 0.6))));
      flux.push(Math.round(Math.max(1, seen)));
    }
    if (points.length < 2) {
      skipped += 1;
      continue;
    }
    rivers.push({ id: numberOr(river.i, index + 1) || index + 1, points, half, flux });
  }
  return { rivers, skipped };
};

/**
 * Снимок карт из окна редактора.
 *
 * @param {Window} win окно iframe с Azgaar
 * @param {{ seed?: string, width?: number, height?: number }} [hint]
 *   размеры из конфигурации мира — нужны, если документ их не отдал
 * @returns {object} source — снимок для своего читателя: им пользуется карта
 *   планеты (src/planet/source.js)
 */
export const readSource = (win, hint = {}) => {
  if (!win) throw new VoxelSourceError('документ редактора не открыт');
  const grid = win.grid;
  const pack = win.pack;
  if (!mapsReady(win)) throw new VoxelSourceError(`источник планеты читать рано: ${missingMapsPart(win)}`);
  const graph = win.options?.map?.graph ?? {};
  const cellsX = Math.max(2, Math.round(numberOr(grid.cellsX, 0)) || Math.ceil(numberOr(graph.width, hint.width || 1600) / grid.spacing));
  const cellsY = Math.max(2, Math.round(numberOr(grid.cellsY, 0)) || Math.ceil(numberOr(graph.height, hint.height || 1000) / grid.spacing));
  const spacing = Math.max(1, numberOr(grid.spacing, 12.65));
  const width = Math.max(64, Math.round(numberOr(graph.width, cellsX * spacing)));
  const height = Math.max(64, Math.round(numberOr(graph.height, cellsY * spacing)));
  const seaLevel = Math.max(1, Math.round(numberOr(win.SEA_LEVEL, 20)));
  const { cellH, cellBiome } = spreadPackToGrid(grid, pack, cellsX, cellsY, seaLevel);
  const copy = (source, Type, fallback) => {
    const out = new Type(cellsX * cellsY);
    if (!source) out.fill(fallback);
    else for (let i = 0; i < out.length; i += 1) out[i] = Number(source[i]) || 0;
    return out;
  };
  const cellTemp = copy(grid.cells.temp, Int8Array, 12);
  const cellPrec = copy(grid.cells.prec, Uint8Array, 20);
  const { features, cellFeature, packLakeKeys } = readLakes(pack, cellsX, cellsY, seaLevel);
  const { rivers, skipped } = readRivers(win, pack, width, height);

  /* Azgaar рисует берег и биомы по ближайшей pack-клетке, а не по grid.
     Раскладываем тот же Pack.findCell в разрешении обзорной карты один раз:
     интерполяция grid сглаживала берег и давала другую сушу даже при общем seed.
     Для чужих/старых документов без Pack оставляем прежний путь. Предел не
     позволяет повреждённому документу запросить гигантский буфер. */
  let packHeight = null;
  let packBiome = null;
  let packLake = null;
  if (
    width * height <= 3_000_000 && typeof win.Pack?.findCell === 'function' &&
    pack.cells.p?.length === pack.cells.h.length && pack.cells.biome?.length === pack.cells.h.length
  ) {
    packHeight = new Uint8Array(width * height);
    packBiome = new Uint8Array(width * height);
    packLake = new Uint16Array(width * height);
    packHeight.fill(255); // неизвестная клетка — используем grid
    packBiome.fill(255);
    packLake.fill(65535);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cell = win.Pack.findCell(x + 0.5, y + 0.5);
        if (!Number.isInteger(cell) || cell < 0 || cell >= pack.cells.h.length) continue;
        const i = y * width + x;
        packHeight[i] = pack.cells.h[cell];
        packBiome[i] = pack.cells.biome[cell];
        packLake[i] = packLakeKeys[cell];
      }
    }
  }
  return {
    width,
    height,
    spacing,
    cellsX,
    cellsY,
    seaLevel,
    heightExponent: Math.max(1, Math.min(3, numberOr(win.options?.map?.units?.height?.exponent, 1.8))),
    seedSalt: hashString(`${hint.seed ?? ''}|${width}x${height}|${cellsX}x${cellsY}|${spacing.toFixed(3)}`),
    cellH,
    cellBiome,
    cellTemp,
    cellPrec,
    cellFeature,
    features,
    rivers,
    packHeight,
    packBiome,
    packLake,
    stats: { cells: cellsX * cellsY, rivers: rivers.length, lakes: features.length, riversSkipped: skipped },
  };
};

/** Краткая сводка для отладочной панели: чем мир «засеян». */
export const describeSource = (source) =>
  [
    `клеток ${source.stats.cells}`,
    `рек ${source.stats.rivers}`,
    `озёр ${source.stats.lakes}`,
    `море на уровне ${source.seaLevel}`,
  ].join(' · ');
