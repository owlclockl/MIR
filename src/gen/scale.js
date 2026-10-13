/* Масштаб блочного мира: размеры, единицы и пирамида уровней.

   Мир — плоская карта «блок = метр» в двух измерениях: ширина — окружность
   Земли, высота карты — расстояние от полюса до полюса (те же числа WGS-84, что
   в src/planet/scale.js и в слотах мира, src/data/store.js). Поэтому координаты
   мира одновременно координаты поверхности, а километры и градусы считаются
   прямо отсюда.

   Вертикаль при этом игровая, как в Minecraft: 384 блока от основания до
   предела постройки, море на Y=63. Один блок вглубь — это не метр рельефа, а
   его стилизованная мера: 30 метров на блок (ELEVATION_M_PER_BLOCK). Такое
   разделение честнее, чем «Эверест в 8848 блоков»: горизонтальный масштаб
   остаётся земным, а разрез мира — игровым, и оба числа видны в HUD.

   Пирамида уровней устроена как у тайловых карт (src/planet/scale.js):
   уровень L хранит мир с разрешением 2^(maxLevel − L) блоков на пиксель, тайлы
   256 × 256. На уровне maxLevel разрешение ровно 1 блок на пиксель. Полный мир
   Земли — 8 × 10^14 колонок, поэтому он не «генерируется целиком»: существует
   формула, а на экран попадают только тайлы в кадре. */

/** Длина экватора, метры (WGS-84). */
export const EARTH_EQUATOR_M = 40_075_017;
/** Полюс–полюс по меридиану, метры. */
export const EARTH_POLE_M = 20_003_932;

/**
 * Размеры мира: множитель к Земле. Отличаются от PLANET_SIZES тем, что это
 * размеры именно блочного полотна, а не тайловой пирамиды планеты.
 */
export const BLOCK_WORLD_SIZES = Object.freeze([
  { id: 'earth', label: 'Земля', note: '1 : 1 к Земле', scale: 1 },
  { id: 'super', label: 'Суперземля', note: 'вдвое больше Земли', scale: 2 },
  { id: 'giant', label: 'Гигант', note: 'вчетверо больше Земли', scale: 4 },
]);

export const blockWorldSize = (width, height) => {
  const ratio = Number(width) / EARTH_EQUATOR_M;
  return BLOCK_WORLD_SIZES.find((entry) => Math.abs(entry.scale - ratio) < 0.01) ?? null;
};

/** Высота мира блоков: ровно как в Minecraft 1.18 (384 блока от низа до верха). */
export const WORLD_Y = 384;
/** Уровень моря: как в Minecraft (Y=63). */
export const SEA_LEVEL = 63;
/** Ниже этого яруса — неразрушимое основание. */
export const BEDROCK_TOP = 4;
/** Верхний ярус, где ещё бывают пещеры и руды: выше — только открытое небо. */
export const MAX_UNDERGROUND_Y = 200;

/** Метров рельефа в одном блоке по вертикали — вертикальное преувеличение карты. */
export const ELEVATION_M_PER_BLOCK = 30;

/** Размер тайла пирамиды: 256 × 256 пикселей, как в src/planet/scale.js. */
export const TILE = 256;

/** Блоков в километре: блок — это метр. */
export const KM = 1000;

export const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

/** Тайлы уровня: сколько уровней нужно, чтобы на последнем блок стал пикселем. */
export const maxLevelFor = (width, height) =>
  Math.max(1, Math.ceil(Math.log2(Math.max(width, height) / TILE)));

export const mppAt = (planet, level) => 2 ** (planet.maxLevel - level);

export const levelPixels = (planet, level) => {
  const mpp = mppAt(planet, level);
  return {
    w: Math.max(1, Math.ceil(planet.width / mpp)),
    h: Math.max(1, Math.ceil(planet.height / mpp)),
  };
};

export const levelTiles = (planet, level) => {
  const pixels = levelPixels(planet, level);
  return { x: Math.ceil(pixels.w / TILE), y: Math.ceil(pixels.h / TILE) };
};

/**
 * Мир как объект: размеры в блоках, в километрах и пирамида уровней.
 *
 * @param {{seed?: string, width?: number, height?: number}} [options]
 */
export const createBlockPlanet = (options = {}) => {
  const width = Math.max(TILE, Math.round(options.width ?? EARTH_EQUATOR_M));
  const height = Math.max(TILE, Math.round(options.height ?? EARTH_POLE_M));
  const maxLevel = maxLevelFor(width, height);
  return {
    seed: String(options.seed ?? ''),
    width,
    height,
    seaLevel: SEA_LEVEL,
    worldY: WORLD_Y,
    maxHeight: WORLD_Y,
    widthKm: width / KM,
    heightKm: height / KM,
    areaKm2: (width / KM) * (height / KM),
    maxLevel,
    /** Минимальный размер пикселя пирамиды: на уровне maxLevel — ровно блок. */
    minMpp: 2 ** maxLevel,
    /** Сколько тайлов понадобилось бы на весь мир уровня maxLevel (в память не влезет — это справка). */
    fullTileCount: levelTiles({ maxLevel, width, height }, 0).x * levelTiles({ maxLevel, width, height }, 0).y,
  };
};

/** Широта и долгота точки мира: карта равнопромежуточная (plate carrée). */
export const geoAt = (planet, x, z) => ({
  lon: (x / planet.width) * 360 - 180,
  lat: 90 - (z / planet.height) * 180,
});

/** Метры над уровнем моря по ярусу блока. */
export const elevationMeters = (y) => (y - SEA_LEVEL) * ELEVATION_M_PER_BLOCK;

/** Ярус по метрам над уровнем моря (обратная к elevationMeters). */
export const levelForMeters = (meters) => SEA_LEVEL + meters / ELEVATION_M_PER_BLOCK;

/** Русский разделитель разрядов: узкий пробел, как в остальном интерфейсе. */
export const digits = (value) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');

/** Площадь в км²: до тысячи — точно, дальше — миллионы. */
export const areaLabel = (km2) => {
  if (!Number.isFinite(km2)) return '—';
  if (km2 >= 1_000_000) return `${(km2 / 1_000_000).toFixed(km2 >= 10_000_000 ? 1 : 2).replace('.', ',')} млн км²`;
  if (km2 >= 1_000) return `${digits(km2 / 1000)} тыс. км²`;
  return `${digits(km2)} км²`;
};

export const kmLabel = (km) => {
  if (!Number.isFinite(km)) return '—';
  if (km >= 1000) return `${digits(km / (km >= 100_000 ? 1000 : 100)).replace(',', ',')} ${km >= 100_000 ? 'тыс. км' : 'сот. км'}`;
  return `${digits(km)} км`;
};
