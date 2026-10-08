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

const normalizedConfig = (options = {}) => {
  const seed = String(options.seed ?? '').trim() || 'MIR';
  const continents = Math.round(clamp(options.continents ?? 4, 1, MAX_CONTINENTS));
  const allowedVoxelSizes = [1, 1.25, 1.5];
  const requestedVoxelSize = Number(options.voxelSize ?? 1.25);
  const voxelSize = allowedVoxelSizes.includes(requestedVoxelSize) ? requestedVoxelSize : 1.25;
  const earthMultiples = Math.round(clamp(options.earthMultiples ?? 2, 2, 10));
  return { seed, continents, voxelSize, earthMultiples };
};

const buildContinentCenters = (seed, count) => {
  const random = mulberry32(seed ^ 0xc2b2ae35);
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const centers = [];

  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellWidth = 1 / columns;
    const cellHeight = 1 / rows;
    const rx = cellWidth * (0.345 + random() * 0.025);
    const rz = cellHeight * (0.345 + random() * 0.025);
    const jitterX = (random() - 0.5) * cellWidth * 0.08;
    const jitterZ = (random() - 0.5) * cellHeight * 0.08;

    centers.push(Object.freeze({
      id: index + 1,
      x: (column + 0.5) * cellWidth + jitterX,
      z: (row + 0.5) * cellHeight + jitterZ,
      rx,
      rz,
      phase: random() * 128,
    }));
  }

  return Object.freeze(centers);
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
  const centers = buildContinentCenters(seedHash, config.continents);
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
        37 + continentalDepth * 34 + (largeRelief - 0.5) * 17 + (smallRelief - 0.5) * 5,
        SEA_LEVEL + 1,
        WORLD_HEIGHT - 8,
      ));
      const surfaceMaterial = height >= 70
        ? BLOCK.SNOW
        : continentalDepth < 0.08 || height < 43
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
      };
    }

    const basin = fractalNoise(seedHash ^ 0x967a889b, nx * 48, nz * 48, 3);
    const height = Math.round(clamp(8 + basin * 23, 3, SEA_LEVEL - 1));
    return {
      land: false,
      continent: 0,
      depth: 0,
      height,
      topY: SEA_LEVEL,
      surfaceMaterial: height >= 27 ? BLOCK.SAND : BLOCK.STONE,
      topMaterial: BLOCK.WATER,
      waterDepth: SEA_LEVEL - height,
    };
  };

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
    sampleAtNormalized: sampleNormalized,
    sampleColumn,
    getChunk,
    getColumn,
    getBlock,
    findSpawn,
    loadedChunkCount: () => chunks.size,
  };
};
