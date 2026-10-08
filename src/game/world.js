/*
 * Процедурный voxel-world.
 *
 * Мир не разворачивается целиком в памяти: площадь в 2× Земли при блоке
 * 1 м — это примерно 10^15 столбцов. Вместо этого данные чанка (16×16×96)
 * детерминированно строятся при первом обращении и хранятся в небольшом LRU.
 * Поэтому любые координаты мира воспроизводимы по одному seed.
 */

export const EARTH_SURFACE_KM2 = 510_072_000;
export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 96;
export const SEA_LEVEL = 34;
export const MAX_CONTINENTS = 12;
export const MAX_CACHED_CHUNKS = 64;

export const BLOCK = Object.freeze({
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  SNOW: 6,
});

export const BLOCK_NAMES = Object.freeze({
  [BLOCK.AIR]: 'воздух',
  [BLOCK.GRASS]: 'трава',
  [BLOCK.DIRT]: 'земля',
  [BLOCK.STONE]: 'камень',
  [BLOCK.SAND]: 'песок',
  [BLOCK.WATER]: 'вода',
  [BLOCK.SNOW]: 'снег',
});

export const BIOME = Object.freeze({
  DEEP_OCEAN: 0,
  COASTAL_WATER: 1,
  COAST: 2,
  GRASSLAND: 3,
  FOREST: 4,
  DESERT: 5,
  TAIGA: 6,
  TUNDRA: 7,
  HIGHLANDS: 8,
});

export const BIOME_NAMES = Object.freeze({
  [BIOME.DEEP_OCEAN]: 'глубокий океан',
  [BIOME.COASTAL_WATER]: 'прибрежные воды',
  [BIOME.COAST]: 'побережье',
  [BIOME.GRASSLAND]: 'равнины',
  [BIOME.FOREST]: 'лес',
  [BIOME.DESERT]: 'засушливые земли',
  [BIOME.TAIGA]: 'тайга',
  [BIOME.TUNDRA]: 'тундра',
  [BIOME.HIGHLANDS]: 'горные земли',
});

/* Профили меняют сами континенты и климат, а не только раскраску карты. */
export const LANDSCAPE_PRESETS = Object.freeze({
  mainland: Object.freeze({ label: 'Материковый', radius: 1, relief: 1 }),
  islands: Object.freeze({ label: 'Островной', radius: 0.84, relief: 0.82 }),
  highlands: Object.freeze({ label: 'Горный', radius: 0.96, relief: 1.48 }),
});

export const CLIMATE_PRESETS = Object.freeze({
  temperate: Object.freeze({ label: 'Умеренный', temperature: 0, moisture: 0 }),
  lush: Object.freeze({ label: 'Влажный', temperature: 0.03, moisture: 0.2 }),
  arid: Object.freeze({ label: 'Засушливый', temperature: 0.14, moisture: -0.27 }),
  frozen: Object.freeze({ label: 'Холодный', temperature: -0.28, moisture: 0.04 }),
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

const hashSeed = (value) => {
  const text = String(value ?? '').trim() || 'MIR';
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0 || 1;
};

const hash2 = (seed, x, z) => {
  let hash = seed ^ Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(z | 0, 0x85ebca77);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4_294_967_295;
};

const valueNoise = (seed, x, z) => {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const tz = smooth(z - z0);
  const north = lerp(hash2(seed, x0, z0), hash2(seed, x0 + 1, z0), tx);
  const south = lerp(hash2(seed, x0, z0 + 1), hash2(seed, x0 + 1, z0 + 1), tx);
  return lerp(north, south, tz);
};

const fractalNoise = (seed, x, z, octaves = 4) => {
  let total = 0;
  let weight = 0;
  let amplitude = 0.55;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(seed + Math.imul(octave + 1, 0x27d4eb2d), x * frequency, z * frequency) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / weight;
};

const mulberry32 = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const NAME_HEADS = ['Ар', 'Бел', 'Валь', 'Грей', 'Дор', 'Эль', 'Фар', 'Ил', 'Кел', 'Лор', 'Мир', 'Нор', 'Ор', 'Сел', 'Тир', 'Эс'];
const NAME_TAILS = ['валь', 'вин', 'дар', 'дор', 'рин', 'лис', 'мир', 'таль', 'нар', 'эль', 'ион', 'ар', 'ора', 'ен'];
const makeName = (random, used) => {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const name = `${NAME_HEADS[Math.floor(random() * NAME_HEADS.length)]}${NAME_TAILS[Math.floor(random() * NAME_TAILS.length)]}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `Край ${used.size + 1}`;
  used.add(fallback);
  return fallback;
};

const normalizedConfig = (options = {}) => {
  const seed = String(options.seed ?? '').trim() || 'MIR';
  const continents = Math.round(clamp(options.continents ?? 4, 1, MAX_CONTINENTS));
  const allowedVoxelSizes = [1, 1.25, 1.5];
  const requestedVoxelSize = Number(options.voxelSize ?? 1.25);
  const voxelSize = allowedVoxelSizes.includes(requestedVoxelSize) ? requestedVoxelSize : 1.25;
  const earthMultiples = Math.round(clamp(options.earthMultiples ?? 2, 2, 10));
  const requestedLandscape = String(options.landscape ?? 'mainland');
  const requestedClimate = String(options.climate ?? 'temperate');
  const landscape = LANDSCAPE_PRESETS[requestedLandscape] ? requestedLandscape : 'mainland';
  const climate = CLIMATE_PRESETS[requestedClimate] ? requestedClimate : 'temperate';
  return { seed, continents, voxelSize, earthMultiples, landscape, climate };
};

const buildContinentCenters = (seed, count, landscape) => {
  const random = mulberry32(seed ^ 0xc2b2ae35);
  const names = new Set();
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const centers = [];

  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellWidth = 1 / columns;
    const cellHeight = 1 / rows;
    const radiusScale = LANDSCAPE_PRESETS[landscape].radius;
    const rx = cellWidth * (0.345 + random() * 0.025) * radiusScale;
    const rz = cellHeight * (0.345 + random() * 0.025) * radiusScale;
    const jitterX = (random() - 0.5) * cellWidth * 0.08;
    const jitterZ = (random() - 0.5) * cellHeight * 0.08;

    centers.push(Object.freeze({
      id: index + 1,
      name: makeName(random, names),
      x: (column + 0.5) * cellWidth + jitterX,
      z: (row + 0.5) * cellHeight + jitterZ,
      rx,
      rz,
      phase: random() * 128,
    }));
  }

  return Object.freeze(centers);
};

const buildRivers = (seed, centers, sampleAtNormalized) => {
  const random = mulberry32(seed ^ 0x7f4a7c15);
  const names = new Set();
  return Object.freeze(centers.map((center, index) => {
    const startX = center.x + (random() - 0.5) * center.rx * 0.36;
    const startZ = center.z + (random() - 0.5) * center.rz * 0.36;
    const angle = random() * Math.PI * 2;
    const endX = clamp(center.x + Math.cos(angle) * center.rx * 0.92, 0.015, 0.985);
    const endZ = clamp(center.z + Math.sin(angle) * center.rz * 0.92, 0.015, 0.985);
    const dx = endX - startX;
    const dz = endZ - startZ;
    const bend = (random() - 0.5) * Math.min(center.rx, center.rz) * 0.9;
    const perpendicularX = -dz;
    const perpendicularZ = dx;
    const control1 = {
      x: startX + dx * 0.34 + perpendicularX * bend,
      z: startZ + dz * 0.34 + perpendicularZ * bend,
    };
    const control2 = {
      x: startX + dx * 0.72 - perpendicularX * bend * 0.62,
      z: startZ + dz * 0.72 - perpendicularZ * bend * 0.62,
    };
    const points = [];
    const steps = 72;
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const inverse = 1 - t;
      const x = clamp(
        inverse ** 3 * startX + 3 * inverse ** 2 * t * control1.x + 3 * inverse * t ** 2 * control2.x + t ** 3 * endX,
        0.002,
        0.998,
      );
      const z = clamp(
        inverse ** 3 * startZ + 3 * inverse ** 2 * t * control1.z + 3 * inverse * t ** 2 * control2.z + t ** 3 * endZ,
        0.002,
        0.998,
      );
      points.push(Object.freeze({ x, z, land: sampleAtNormalized(x, z).land }));
    }
    return Object.freeze({ id: index + 1, name: makeName(random, names), points: Object.freeze(points) });
  }));
};

/** Создаёт описание мира и его ленивые методы доступа к вокселям. */
export const createWorld = (options = {}) => {
  const config = normalizedConfig(options);
  const seedHash = hashSeed(config.seed);
  const targetAreaKm2 = EARTH_SURFACE_KM2 * config.earthMultiples;
  const targetAreaM2 = targetAreaKm2 * 1_000_000;
  const sideMeters = Math.sqrt(targetAreaM2);
  const cellsPerSide = Math.ceil(sideMeters / config.voxelSize);
  const widthMeters = cellsPerSide * config.voxelSize;
  const areaKm2 = (widthMeters * widthMeters) / 1_000_000;
  const chunksPerSide = Math.ceil(cellsPerSide / CHUNK_SIZE);
  const centers = buildContinentCenters(seedHash, config.continents, config.landscape);
  const landscape = LANDSCAPE_PRESETS[config.landscape];
  const climate = CLIMATE_PRESETS[config.climate];
  const chunks = new Map();
  const columnsPerChunk = CHUNK_SIZE * CHUNK_SIZE;
  const blocksPerChunk = columnsPerChunk * WORLD_HEIGHT;

  const sampleNormalized = (u, v) => {
    const nx = clamp(Number(u) || 0, 0, 1);
    const nz = clamp(Number(v) || 0, 0, 1);
    let continentalDepth = 0;
    let continentId = 0;

    for (const center of centers) {
      const dx = (nx - center.x) / center.rx;
      const dz = (nz - center.z) / center.rz;
      const distance = Math.sqrt(dx * dx + dz * dz);
      /* Порог берётся из угла, а не из координаты каждой точки: так берег
         получается рваным, но форма остаётся цельной — один выбранный центр
         не распадается на несколько случайных островных «континентов». */
      const angle = (Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2);
      const shoreline = fractalNoise(
        seedHash ^ Math.imul(center.id, 0x165667b1),
        angle * 18 + center.phase,
        center.phase * 0.031,
        3,
      );
      const edge = 0.84 + shoreline * 0.32;
      if (distance < edge) {
        const depth = clamp((edge - distance) / edge, 0, 1);
        if (depth > continentalDepth) {
          continentalDepth = depth;
          continentId = center.id;
        }
      }
    }

    if (continentId) {
      const largeRelief = fractalNoise(seedHash ^ 0x68bc21eb, nx * 14, nz * 14, 4);
      const smallRelief = fractalNoise(seedHash ^ 0x02e5be93, nx * 86, nz * 86, 3);
      const height = Math.round(clamp(
        37 + continentalDepth * 34 + (largeRelief - 0.5) * 17 * landscape.relief + (smallRelief - 0.5) * 5 * landscape.relief,
        SEA_LEVEL + 1,
        WORLD_HEIGHT - 8,
      ));
      const humidityField = fractalNoise(seedHash ^ 0x165667b1, nx * 12, nz * 12, 4);
      const moisture = clamp(0.18 + humidityField * 0.82 + climate.moisture, 0, 1);
      const latitude = Math.abs(nz - 0.5) * 2;
      const altitudeCooling = Math.max(0, height - SEA_LEVEL) / (WORLD_HEIGHT - SEA_LEVEL) * 0.32;
      const temperature = clamp(1 - latitude * 0.62 - altitudeCooling + climate.temperature, 0, 1);
      const nearCoast = continentalDepth < 0.105 || height <= SEA_LEVEL + 8;
      const biome = nearCoast
        ? BIOME.COAST
        : height >= 69
          ? BIOME.HIGHLANDS
          : temperature < 0.2
            ? BIOME.TUNDRA
            : temperature < 0.36
              ? BIOME.TAIGA
              : temperature > 0.58 && moisture < 0.3
                ? BIOME.DESERT
                : moisture > 0.64
                  ? BIOME.FOREST
                  : BIOME.GRASSLAND;
      const surfaceMaterial = biome === BIOME.HIGHLANDS
        ? height >= 79 ? BLOCK.SNOW : BLOCK.STONE
        : biome === BIOME.TUNDRA
          ? BLOCK.SNOW
          : biome === BIOME.DESERT || biome === BIOME.COAST
            ? BLOCK.SAND
            : BLOCK.GRASS;
      return {
        land: true,
        continent: continentId,
        depth: continentalDepth,
        height,
        topY: height,
        surfaceMaterial,
        topMaterial: surfaceMaterial,
        waterDepth: 0,
        biome,
        temperature,
        moisture,
      };
    }

    const basin = fractalNoise(seedHash ^ 0x967a889b, nx * 48, nz * 48, 3);
    const height = Math.round(clamp(8 + basin * 23, 3, SEA_LEVEL - 1));
    const waterDepth = SEA_LEVEL - height;
    return {
      land: false,
      continent: 0,
      depth: 0,
      height,
      topY: SEA_LEVEL,
      surfaceMaterial: height >= 27 ? BLOCK.SAND : BLOCK.STONE,
      topMaterial: BLOCK.WATER,
      waterDepth,
      biome: waterDepth > 14 ? BIOME.DEEP_OCEAN : BIOME.COASTAL_WATER,
      temperature: 0,
      moisture: 0,
    };
  };

  const rivers = buildRivers(seedHash, centers, sampleNormalized);

  const sampleColumn = (x, z) => {
    const worldX = Math.floor(Number(x));
    const worldZ = Math.floor(Number(z));
    if (
      !Number.isFinite(worldX) ||
      !Number.isFinite(worldZ) ||
      worldX < 0 || worldZ < 0 ||
      worldX >= cellsPerSide || worldZ >= cellsPerSide
    ) return null;
    return sampleNormalized((worldX + 0.5) / cellsPerSide, (worldZ + 0.5) / cellsPerSide);
  };

  const getChunk = (chunkX, chunkZ) => {
    const cx = Math.floor(Number(chunkX));
    const cz = Math.floor(Number(chunkZ));
    if (
      !Number.isFinite(cx) || !Number.isFinite(cz) ||
      cx < 0 || cz < 0 || cx >= chunksPerSide || cz >= chunksPerSide
    ) return null;

    const key = `${cx},${cz}`;
    const cached = chunks.get(key);
    if (cached) {
      chunks.delete(key);
      chunks.set(key, cached);
      return cached;
    }

    const chunk = {
      x: cx,
      z: cz,
      size: CHUNK_SIZE,
      height: WORLD_HEIGHT,
      blocks: new Uint8Array(blocksPerChunk),
      columnHeights: new Uint8Array(columnsPerChunk),
      surfaceHeights: new Uint8Array(columnsPerChunk),
      surfaceMaterials: new Uint8Array(columnsPerChunk),
      topMaterials: new Uint8Array(columnsPerChunk),
      waterFlags: new Uint8Array(columnsPerChunk),
      biomes: new Uint8Array(columnsPerChunk),
    };

    for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
      for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
        const worldX = cx * CHUNK_SIZE + localX;
        const worldZ = cz * CHUNK_SIZE + localZ;
        if (worldX >= cellsPerSide || worldZ >= cellsPerSide) continue;

        const columnIndex = localZ * CHUNK_SIZE + localX;
        const terrain = sampleNormalized(
          (worldX + 0.5) / cellsPerSide,
          (worldZ + 0.5) / cellsPerSide,
        );
        chunk.columnHeights[columnIndex] = terrain.height;
        chunk.surfaceHeights[columnIndex] = terrain.topY;
        chunk.surfaceMaterials[columnIndex] = terrain.surfaceMaterial;
        chunk.topMaterials[columnIndex] = terrain.topMaterial;
        chunk.waterFlags[columnIndex] = terrain.land ? 0 : 1;
        chunk.biomes[columnIndex] = terrain.biome;

        const columnOffset = columnIndex;
        for (let y = 0; y <= terrain.height; y += 1) {
          const block = y === terrain.height
            ? terrain.surfaceMaterial
            : y >= terrain.height - 3 && terrain.surfaceMaterial !== BLOCK.STONE
              ? terrain.surfaceMaterial === BLOCK.SAND ? BLOCK.SAND : BLOCK.DIRT
              : BLOCK.STONE;
          chunk.blocks[y * columnsPerChunk + columnOffset] = block;
        }
        if (!terrain.land) {
          for (let y = terrain.height + 1; y <= SEA_LEVEL; y += 1)
            chunk.blocks[y * columnsPerChunk + columnOffset] = BLOCK.WATER;
        }
      }
    }

    if (chunks.size >= MAX_CACHED_CHUNKS) chunks.delete(chunks.keys().next().value);
    chunks.set(key, chunk);
    return chunk;
  };

  const getColumn = (x, z) => {
    const worldX = Math.floor(Number(x));
    const worldZ = Math.floor(Number(z));
    if (
      !Number.isFinite(worldX) || !Number.isFinite(worldZ) ||
      worldX < 0 || worldZ < 0 ||
      worldX >= cellsPerSide || worldZ >= cellsPerSide
    ) return null;

    const chunk = getChunk(Math.floor(worldX / CHUNK_SIZE), Math.floor(worldZ / CHUNK_SIZE));
    const localX = worldX % CHUNK_SIZE;
    const localZ = worldZ % CHUNK_SIZE;
    const index = localZ * CHUNK_SIZE + localX;
    const terrainHeight = chunk.columnHeights[index];
    const water = chunk.waterFlags[index] === 1;
    return {
      x: worldX,
      z: worldZ,
      height: terrainHeight,
      topY: chunk.surfaceHeights[index],
      surfaceMaterial: chunk.surfaceMaterials[index],
      topMaterial: chunk.topMaterials[index],
      water,
      waterDepth: water ? SEA_LEVEL - terrainHeight : 0,
      biome: chunk.biomes[index],
    };
  };

  const getBlock = (x, y, z) => {
    const worldY = Math.floor(Number(y));
    if (!Number.isFinite(worldY) || worldY < 0 || worldY >= WORLD_HEIGHT) return BLOCK.AIR;
    const column = getColumn(x, z);
    if (!column) return BLOCK.AIR;
    const chunk = getChunk(Math.floor(column.x / CHUNK_SIZE), Math.floor(column.z / CHUNK_SIZE));
    const localX = column.x % CHUNK_SIZE;
    const localZ = column.z % CHUNK_SIZE;
    const columnIndex = localZ * CHUNK_SIZE + localX;
    return chunk.blocks[worldY * columnsPerChunk + columnIndex];
  };

  const findSpawn = () => {
    const center = centers[0];
    const x = clamp(Math.floor(center.x * cellsPerSide), 0, cellsPerSide - 1);
    const z = clamp(Math.floor(center.z * cellsPerSide), 0, cellsPerSide - 1);
    const column = sampleColumn(x, z);
    return { x, z, y: column?.topY ?? SEA_LEVEL + 1 };
  };

  return {
    ...config,
    seedHash,
    areaKm2,
    targetAreaKm2,
    earthRatio: areaKm2 / EARTH_SURFACE_KM2,
    widthMeters,
    widthCells: cellsPerSide,
    depthCells: cellsPerSide,
    chunksPerSide,
    chunkCount: chunksPerSide * chunksPerSide,
    surfaceVoxelCount: cellsPerSide * cellsPerSide,
    chunkSize: CHUNK_SIZE,
    worldHeight: WORLD_HEIGHT,
    seaLevel: SEA_LEVEL,
    continentCenters: centers,
    rivers,
    sampleAtNormalized: sampleNormalized,
    sampleColumn,
    getChunk,
    getColumn,
    getBlock,
    findSpawn,
    loadedChunkCount: () => chunks.size,
  };
};
