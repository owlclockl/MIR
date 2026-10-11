/* Масштаб планеты: 1 пиксель = 1 метр.

   Карта — прямоугольная равнопромежуточная проекция (plate carrée): по горизонтали
   долгота, по вертикали широта. **Мир не замкнут по долготе**: левый и правый
   края — это рамка карты, а не шов. Замыкание (сэмплирование шума на цилиндре)
   было бы нужно глобусу, а нам сейчас важно совпадение с картой Azgaar: у неё
   прямоугольная рамка, и материки на ней обрезаются краем, а не переходят за
   него. Поэтому координаты за краем прижимаются к краю, как у полюсов.
   Единицы координат — метры, поэтому «1 пиксель = 1 метр» означает просто: на
   максимальном приближении один пиксель холста равен одному метру поверхности.

   Пирамида уровней устроена как у обычных тайловых карт (Google/OSM): уровень L
   хранит мир с разрешением mpp = 2^(maxLevel − L) метров на пиксель, тайлы 256 × 256.
   На уровне maxLevel разрешение ровно 1 м/пиксель. Глубина пирамиды считается от
   длины экватора: Земля (40 075 км) при 256-пиксельных тайлах требует 18 уровней,
   двойная планета — 19, четверная — 20.

   Полный мир Земли на максимальном приближении — это 40 075 017 × 20 003 932
   пикселя (8 × 10^14), то есть его нельзя «сгенерировать целиком»: грузятся только
   тайлы, попадающие в кадр, а остальное существует как формула. */

export const TILE = 256;

/** Длина экватора Земли, метры (WGS-84). */
export const EARTH_EQUATOR_M = 40_075_017;
/** Расстояние от полюса до полюса по меридиану, метры. */
export const EARTH_POLE_M = 20_003_932;

/** Доступные размеры планеты: множитель к Земле. */
export const PLANET_SIZES = [
  { id: 1, name: 'Земля', short: '1×', note: 'как Земля' },
  { id: 2, name: 'Двойная', short: '2×', note: 'вдвое больше Земли' },
  { id: 4, name: 'Четверная', short: '4×', note: 'вчетверо больше Земли' },
];

export const planetSizeById = (id) => PLANET_SIZES.find((entry) => entry.id === id) ?? PLANET_SIZES[0];
export const planetSizeIds = () => PLANET_SIZES.map((entry) => entry.id);

/* Seed слота — строка. Шуму нужны числа, поэтому строка один раз превращается в
   32 бита: одинаковый seed обязан давать одинаковый мир на любой машине. */
export const hashSeed = (value) => {
  const text = String(value ?? '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  /* Пустой seed — не «нулевой мир», а отдельная константа. */
  return (hash ^ 0x9e3779b9) >>> 0;
};

/** Планета: геометрия, глубина пирамиды и производные числа. */
export const createPlanet = ({ size = 1, seed = '' } = {}) => {
  const scale = planetSizeById(size).id;
  const widthM = Math.round(EARTH_EQUATOR_M * scale);
  const heightM = Math.round(EARTH_POLE_M * scale);
  /* Уровень, на котором 1 пиксель = 1 метр: 256 · 2^maxLevel ≥ длина экватора. */
  const maxLevel = Math.max(1, Math.ceil(Math.log2(widthM / TILE)));
  return {
    seed: String(seed ?? ''),
    seedNumber: hashSeed(seed),
    size: scale,
    widthM,
    heightM,
    maxLevel,
    /* Максимальное разрешение пирамиды в метрах на пиксель (уровень 0). */
    minMpp: 2 ** maxLevel,
  };
};

/** Метров на пиксель на уровне level. На maxLevel — ровно 1. */
export const mppAt = (planet, level) => 2 ** (planet.maxLevel - level);

/** Размер мира в пикселях на уровне level. */
export const levelPixels = (planet, level) => {
  const mpp = mppAt(planet, level);
  return {
    w: Math.max(1, Math.ceil(planet.widthM / mpp)),
    h: Math.max(1, Math.ceil(planet.heightM / mpp)),
  };
};

/** Сколько тайлов в ряд и в столбец на уровне level. */
export const levelTiles = (planet, level) => {
  const { w, h } = levelPixels(planet, level);
  return { tx: Math.ceil(w / TILE), ty: Math.ceil(h / TILE) };
};

/**
 * Уровень, на котором разрешение ближе всего к заданному mpp, но не грубее
 * него: mpp(level) = 2^(maxLevel − level), значит level = maxLevel − log2 mpp.
 * (Ошибка знака здесь стоит дорого: «грубый» запрос уходит на максимальное
 * приближение и начинает строить цепочки тайлов для каждого пикселя.)
 */
export const levelForMpp = (planet, mpp) => {
  const wanted = planet.maxLevel - Math.floor(Math.log2(Math.max(mpp, 1)));
  return Math.min(planet.maxLevel, Math.max(0, wanted));
};

/** Границы тайла в метрах: левый верхний угол и сторона. */
export const tileOriginM = (planet, level, tx, ty) => {
  const mpp = mppAt(planet, level);
  return { x: tx * TILE * mpp, y: ty * TILE * mpp, size: TILE * mpp };
};

/** Метры → долгота/широта. */
export const metersToGeo = (planet, mx, my) => {
  /* Долгота −180…180 по ширине карты. За краем карты координата прижимается к
     краю: мир не замкнут, и «181°» не имеет смысла — за рамкой нет земли. */
  const turns = clamp(mx / planet.widthM, 0, 1) * 360 - 180;
  const lon = clamp(turns, -180, 180);
  const lat = 90 - clamp(my / planet.heightM, 0, 1) * 180;
  return { lon, lat };
};

/** Долгота/широта → метры. */
export const geoToMeters = (planet, lon, lat) => {
  const x = ((lon + 180) / 360) * planet.widthM;
  const y = ((90 - lat) / 180) * planet.heightM;
  return { x, y };
};

/** Прижать пиксель по долготе (край карты — это рамка, а не шов). */
export const clampPixelX = (planet, level, px) => {
  const { w } = levelPixels(planet, level);
  return px < 0 ? 0 : px > w - 1 ? w - 1 : px;
};

/** Прижать пиксель по широте (полюса — край карты). */
export const clampPixelY = (planet, level, py) => {
  const { h } = levelPixels(planet, level);
  return py < 0 ? 0 : py > h - 1 ? h - 1 : py;
};

export const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

/* ---------- подписи для интерфейса ---------- */

const thousands = (value) => Math.round(value).toLocaleString('ru-RU').replace(/ /g, ' ');

/** «12 300 м», «4,2 км», «160 км» — по величине. */
export const formatDistance = (meters) => {
  const value = Math.abs(meters);
  if (value < 1000) return `${thousands(meters)} м`;
  if (value < 100_000) return `${thousands(meters / 1000 * 10) / 10} км`.replace('.', ',');
  return `${thousands(meters / 1000)} км`;
};

/** «55°42′ с. ш., 37°34′ в. д.» */
export const formatGeo = (lat, lon) => {
  const dms = (value) => {
    const abs = Math.abs(value);
    const deg = Math.floor(abs);
    const min = Math.round((abs - deg) * 60);
    return `${deg}°${String(min).padStart(2, '0')}′`;
  };
  return `${dms(lat)} ${lat >= 0 ? 'с. ш.' : 'ю. ш.'}, ${dms(lon)} ${lon >= 0 ? 'в. д.' : 'з. д.'}`;
};

/** «40 075 × 20 004 км» — размер планеты для подписи. */
export const formatPlanetSize = (planet) =>
  `${thousands(planet.widthM / 1000)} × ${thousands(planet.heightM / 1000)} км`;
