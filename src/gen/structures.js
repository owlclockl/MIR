/* Постройки: деревни, колодцы и дороги — как структуры в Minecraft.

   Структура привязана не к блоку, а к участку карты: у нас участок 2 × 2 км.
   Участок либо занят деревней, либо нет; решает хеш участка и биом в его
   центре (в пустыне деревня песчаная, в тайге — еловая, в океане — никакой).
   Такой порядок даёт три свойства, которые нужны игре:

     • деревни редки и разнесены — им не тесно, как и в Minecraft;
     • всё воспроизводимо: тот же seed даёт те же деревни в тех же местах;
     • постройку можно спросить в точке, не строя весь мир: дом — это
       прямоугольник, колодец — три на три, дорога — линия от центра.

   Поверхность под деревней выравнивается: Minecraft ставит деревню на
   площадку, а не на склон, иначе дома «съезжают» по рельефу. */

import { COBBLESTONE, DIRT_PATH, GLASS, GRAVEL, PLANKS, RED_SANDSTONE, SANDSTONE, WATER } from './blocks.js';
import { hashSeed, rand01, scramble } from './noise.js';

/** Участок структуры: 2 × 2 км — деревни не сливаются и не теряются. */
export const REGION = 2048;

const VILLAGE_NAMES = [
  'Дубовый Брод', 'Тихий Плёс', 'Каменный Ручей', 'Ясная Поляна', 'Сосновый Дол',
  'Белые Ключи', 'Речной Брод', 'Мшистый Холм', 'Ветреный Утёс', 'Тёплый Лог',
  'Ячменный Двор', 'Лисьи Норы', 'Ржаной Брод', 'Большие Камни', 'Мельничный Пруд',
  'Хмурый Овраг', 'Ольховый Склон', 'Песчаная Заводь', 'Криволесье', 'Светлый Яр',
];

/** Деревни ставят там, где ровно и есть вода: биом отбирает, хеш решает. */
const villageChance = (biomeKey) => {
  switch (biomeKey) {
    case 'plains':
    case 'flower_forest':
    case 'meadow':
      return 0.34;
    case 'savanna':
    case 'birch_forest':
      return 0.28;
    case 'desert':
    case 'badlands':
      return 0.22;
    case 'taiga':
    case 'snowy_taiga':
    case 'forest':
      return 0.18;
    case 'snowy_plains':
    case 'tundra':
    case 'grove':
      return 0.1;
    case 'jungle':
    case 'bamboo_jungle':
      return 0.06;
    default:
      return 0;
  }
};

/** Блоки постройки: у каждой деревни свой материал — по биому. */
const paletteFor = (biomeKey) => {
  switch (biomeKey) {
    case 'desert':
      return { wall: SANDSTONE, roof: SANDSTONE, floor: SANDSTONE, path: DIRT_PATH };
    case 'badlands':
      return { wall: RED_SANDSTONE, roof: RED_SANDSTONE, floor: RED_SANDSTONE, path: DIRT_PATH };
    case 'snowy_plains':
    case 'tundra':
    case 'taiga':
    case 'snowy_taiga':
    case 'grove':
      return { wall: COBBLESTONE, roof: PLANKS, floor: PLANKS, path: GRAVEL };
    default:
      return { wall: COBBLESTONE, roof: PLANKS, floor: PLANKS, path: DIRT_PATH };
  }
};

/**
 * @param {{planet: object, seed: string, biomeAt: (x: number, z: number) => string,
 *          groundAt: (x: number, z: number) => number}} options
 */
export const createStructures = ({ planet, seed, biomeAt, groundAt }) => {
  const R = hashSeed(`${seed}:structures`);
  const cache = new Map();

  const regionCenter = (region) => ({
    x: (region.rx + 0.5) * REGION,
    z: (region.ry + 0.5) * REGION,
  });

  /** План деревни на участке: центр, радиус, дома. null — деревни нет. */
  const layout = (rx, ry) => {
    /* Ключ — число, а не строка: строковый ключ в Map собирается заново на
       каждый запрос, а запрос приходит на каждую точку кадра. */
    const key = rx * 131071 + ry;
    if (cache.has(key)) return cache.get(key);
    const hash = scramble(R, rx, ry);
    const center = regionCenter({ rx, ry });
    const biomeKey = biomeAt(center.x, center.z);
    const chance = villageChance(biomeKey);
    if (chance === 0 || rand01(hash, 1, 0, 0) > chance) {
      cache.set(key, null);
      return null;
    }
    const radius = REGION * (0.09 + rand01(hash, 2, 0, 0) * 0.1);
    const houses = 4 + Math.floor(rand01(hash, 3, 0, 0) * 5);
    const palette = paletteFor(biomeKey);
    const name = VILLAGE_NAMES[Math.floor(rand01(hash, 4, 0, 0) * VILLAGE_NAMES.length) % VILLAGE_NAMES.length];
    const list = [];
    for (let i = 0; i < houses; i += 1) {
      const angle = (i / houses) * Math.PI * 2 + rand01(hash, 10 + i, 0, 0) * 0.6;
      const distance = radius * (0.45 + rand01(hash, 40 + i, 0, 0) * 0.5);
      const width = 7 + Math.floor(rand01(hash, 70 + i, 0, 0) * 6);
      const depth = 6 + Math.floor(rand01(hash, 100 + i, 0, 0) * 5);
      list.push({
        cx: center.x + Math.cos(angle) * distance,
        cz: center.z + Math.sin(angle) * distance,
        halfW: width / 2,
        halfD: depth / 2,
        window: rand01(hash, 130 + i, 0, 0) < 0.7,
      });
    }
    const village = {
      rx,
      ry,
      key,
      name,
      center,
      radius,
      ground: groundAt(center.x, center.z),
      palette,
      houses: list,
      well: { cx: center.x, cz: center.z },
    };
    cache.set(key, village);
    return village;
  };

  const insideVillage = (village, x, z) => {
    const dx = x - village.center.x;
    const dz = z - village.center.z;
    return dx * dx + dz * dz <= village.radius * village.radius;
  };

  /* Памятка последнего ответа: вид спрашивает постройку в каждой точке кадра,
     а точки идут подряд, поэтому почти всегда это тот же участок. Без памятки
     на пиксель приходилось бы смотреть девять участков. */
  let memoKey = '';
  let memoValue = null;
  let memoStamp = 0;

  /** Деревня, накрывающая точку: своя или соседняя (постройка может вылезать за участок). */
  const villageAt = (x, z) => {
    const rx = Math.floor(x / REGION);
    const ry = Math.floor(z / REGION);
    const key = rx * 100003 + ry;
    if (key === memoKey && memoValue !== null) {
      /* Памятка годится, только пока точка внутри той же деревни, иначе ищем. */
      if (memoValue === false) return null;
      if (insideVillage(memoValue, x, z)) return memoValue;
    }
    memoKey = key;
    memoStamp += 1;
    let found = null;
    for (let dy = -1; dy <= 1 && !found; dy += 1) {
      for (let dx = -1; dx <= 1 && !found; dx += 1) {
        const village = layout(rx + dx, ry + dy);
        if (village && insideVillage(village, x, z)) found = village;
      }
    }
    memoValue = found ?? false;
    return found;
  };

  /**
   * Блок постройки в точке или 0, если тут ничего не построено. Крыша дома,
   * колодец и дорога видны сверху так же, как в игре: дом — прямоугольник
   * материала, колодец — кольцо булыжника с водой, дорога — тропа или гравий.
   */
  const blockAt = (x, z) => {
    const village = villageAt(x, z);
    if (!village) return 0;
    const palette = village.palette;
    /* Колодец: 3 × 3 булыжника с водой в середине. */
    const wellX = Math.abs(x - village.well.cx);
    const wellZ = Math.abs(z - village.well.cz);
    if (wellX < 0.5 && wellZ < 0.5) return WATER;
    if (wellX <= 1.5 && wellZ <= 1.5) return COBBLESTONE;
    for (const house of village.houses) {
      const dx = Math.abs(x - house.cx);
      const dz = Math.abs(z - house.cz);
      if (dx > house.halfW + 1 || dz > house.halfD + 1) continue;
      const edge = dx > house.halfW || dz > house.halfD;
      if (edge) {
        /* Стены дома: по периметру — камень или доски с окнами. */
        if (house.window && (Math.round(dx) % 4 === 0 || Math.round(dz) % 4 === 0) && Math.round(dx) < 2 && Math.round(dz) < 2) return GLASS;
        return palette.wall;
      }
      return palette.roof;
    }
    /* Дорога от центра к дому: три блока шириной. */
    for (const house of village.houses) {
      const ax = village.well.cx;
      const az = village.well.cz;
      const bx = house.cx;
      const bz = house.cz;
      const dx = bx - ax;
      const dz = bz - az;
      const lengthSq = dx * dx + dz * dz;
      if (lengthSq <= 0) continue;
      let t = ((x - ax) * dx + (z - az) * dz) / lengthSq;
      if (t < 0 || t > 1) continue;
      const distance = Math.sqrt((x - (ax + dx * t)) ** 2 + (z - (az + dz * t)) ** 2);
      if (distance <= 1.6) return palette.path;
    }
    return 0;
  };

  /** Что стоит в точке: тип, имя и «площадка» деревни — её площадка ровная. */
  const at = (x, z) => {
    const village = villageAt(x, z);
    if (!village) return null;
    const dx = x - village.center.x;
    const dz = z - village.center.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    /* Край площадки сглаживается: деревня стоит на ровном месте, но не как
       вырезанный круг — рельеф подходит к ней постепенно. */
    const blend = Math.min(1, Math.max(0, (village.radius - distance) / (village.radius * 0.25)));
    return {
      kind: 'village',
      name: village.name,
      ground: village.ground,
      distance,
      radius: village.radius,
      blend,
      center: village.center,
    };
  };

  /** Список деревень, чьи центры попадают в прямоугольник — для слоя отметок. */
  const villagesIn = (x0, z0, x1, z1) => {
    const list = [];
    const rx0 = Math.floor(x0 / REGION) - 1;
    const rx1 = Math.floor(x1 / REGION) + 1;
    const ry0 = Math.floor(z0 / REGION) - 1;
    const ry1 = Math.floor(z1 / REGION) + 1;
    const limit = 400;
    for (let ry = ry0; ry <= ry1 && list.length < limit; ry += 1) {
      for (let rx = rx0; rx <= rx1 && list.length < limit; rx += 1) {
        const village = layout(rx, ry);
        if (!village) continue;
        if (village.center.x < x0 || village.center.x > x1) continue;
        if (village.center.z < z0 || village.center.z > z1) continue;
        list.push({ name: village.name, x: village.center.x, z: village.center.z, radius: village.radius, ground: village.ground });
      }
    }
    return list;
  };

  return {
    region: REGION,
    at,
    blockAt,
    villagesIn,
    /** Сколько деревень уже спланировано — по этому видно, работает ли выбор. */
    get planned() {
      let count = 0;
      for (const value of cache.values()) if (value) count += 1;
      return count;
    },
    clear: () => {
      cache.clear();
      memoKey = '';
      memoValue = null;
    },
    get lookups() {
      return memoStamp;
    },
    /** Материал дороги в биоме — для проверок и слоя. */
    paletteFor,
  };
};
