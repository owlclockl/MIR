/* Быстрая проверка генератора voxel-world без браузера и сервера.
   Запуск: npm run test:world */

import assert from 'node:assert/strict';
import {
  BLOCK,
  CHUNK_SIZE,
  EARTH_SURFACE_KM2,
  MAX_CACHED_CHUNKS,
  MAX_CONTINENTS,
  SEA_LEVEL,
  WORLD_HEIGHT,
  createWorld,
} from '../src/game/world.js';

const check = (label, callback) => {
  callback();
  console.log(`  ✓ ${label}`);
};

console.log('Генератор процедурного voxel-мира:\n');

check('любая настройка размера блока сохраняет площадь больше 1× Земли', () => {
  for (const voxelSize of [1, 1.25, 1.5]) {
    const world = createWorld({ seed: 'area-test', continents: 4, voxelSize, earthMultiples: 2 });
    assert.ok(world.areaKm2 > EARTH_SURFACE_KM2);
    assert.ok(world.earthRatio >= 2);
    assert.equal(world.voxelSize, voxelSize);
  }
});

check('диапазон континентов — от одного до двенадцати', () => {
  for (const continents of [1, MAX_CONTINENTS]) {
    const world = createWorld({ seed: 'continents-test', continents });
    assert.equal(world.continents, continents);
    assert.equal(world.continentCenters.length, continents);
    assert.equal(world.continentCenters[0].id, 1);
  }
  assert.equal(createWorld({ continents: 0 }).continents, 1);
  assert.equal(createWorld({ continents: 999 }).continents, MAX_CONTINENTS);
});

check('на карте ровно столько связных континентов, сколько выбрано', () => {
  for (const count of [1, 4, MAX_CONTINENTS]) {
    const world = createWorld({ seed: 'topology-test', continents: count });
    const width = 180;
    const height = 90;
    const land = new Uint8Array(width * height);
    const seen = new Uint8Array(width * height);
    for (let z = 0; z < height; z += 1) {
      for (let x = 0; x < width; x += 1)
        land[z * width + x] = world.sampleAtNormalized((x + 0.5) / width, (z + 0.5) / height).land ? 1 : 0;
    }
    let regions = 0;
    for (let index = 0; index < land.length; index += 1) {
      if (!land[index] || seen[index]) continue;
      regions += 1;
      const queue = [index];
      seen[index] = 1;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        const x = current % width;
        const z = Math.floor(current / width);
        const neighbors = [x > 0 ? current - 1 : -1, x + 1 < width ? current + 1 : -1, z > 0 ? current - width : -1, z + 1 < height ? current + width : -1];
        for (const neighbor of neighbors) {
          if (neighbor < 0 || !land[neighbor] || seen[neighbor]) continue;
          seen[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
    assert.equal(regions, count);
  }
});

check('карта и рельеф повторяются по seed', () => {
  const first = createWorld({ seed: 'same-world', continents: 5, voxelSize: 1.25, earthMultiples: 4 });
  const second = createWorld({ seed: 'same-world', continents: 5, voxelSize: 1.25, earthMultiples: 4 });
  const a = first.sampleAtNormalized(0.27, 0.36);
  const b = second.sampleAtNormalized(0.27, 0.36);
  assert.deepEqual(a, b);
  const spawn = first.findSpawn();
  assert.deepEqual(first.getColumn(spawn.x, spawn.z), second.getColumn(spawn.x, spawn.z));
});

check('чанк хранит блоки воксельной сетки 16×16×96 и создаётся лениво', () => {
  const world = createWorld({ seed: 'chunk-test', continents: 4 });
  assert.equal(world.loadedChunkCount(), 0);
  const spawn = world.findSpawn();
  const chunk = world.getChunk(Math.floor(spawn.x / CHUNK_SIZE), Math.floor(spawn.z / CHUNK_SIZE));
  assert.ok(chunk);
  assert.equal(chunk.blocks.length, CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
  assert.equal(world.loadedChunkCount(), 1);
  const column = world.getColumn(spawn.x, spawn.z);
  assert.ok(column && !column.water, 'точка появления должна быть на суше');
  assert.equal(world.getBlock(spawn.x, column.topY, spawn.z), column.topMaterial);
  assert.equal(world.getBlock(spawn.x, WORLD_HEIGHT, spawn.z), BLOCK.AIR);
  assert.equal(world.getChunk(-1, 0), null);
  assert.equal(world.getColumn(-1, 0), null);
});

check('океан заполняет водяные воксели до уровня моря', () => {
  const world = createWorld({ seed: 'ocean-test', continents: 3 });
  let ocean = null;
  for (let z = 0; z < 50 && !ocean; z += 1) {
    for (let x = 0; x < 50 && !ocean; x += 1) {
      const sample = world.sampleAtNormalized((x + 0.5) / 50, (z + 0.5) / 50);
      if (!sample.land) ocean = { x: Math.floor((x + 0.5) / 50 * world.widthCells), z: Math.floor((z + 0.5) / 50 * world.depthCells), sample };
    }
  }
  assert.ok(ocean, 'на карте должны быть океанические области');
  const column = world.getColumn(ocean.x, ocean.z);
  assert.ok(column.water);
  assert.ok(column.height < SEA_LEVEL);
  assert.equal(world.getBlock(ocean.x, SEA_LEVEL, ocean.z), BLOCK.WATER);
  assert.equal(world.getBlock(ocean.x, column.height, ocean.z), column.surfaceMaterial);
});

check('объём загруженных чанков ограничен кэшем', () => {
  const world = createWorld({ seed: 'cache-test', continents: 2 });
  for (let index = 0; index < MAX_CACHED_CHUNKS + 4; index += 1)
    world.getChunk(index, 0);
  assert.equal(world.loadedChunkCount(), MAX_CACHED_CHUNKS);
});

console.log('\nГЕНЕРАТОР РАБОТАЕТ — проверки завершены.');
