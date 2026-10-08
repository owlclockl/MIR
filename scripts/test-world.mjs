/* Быстрая проверка генератора voxel-world без браузера и сервера.
   Запуск: npm run test:world */

import assert from 'node:assert/strict';
import {
  BIOME,
  BIOME_NAMES,
  BLOCK,
  CHUNK_SIZE,
  CLIMATE_PRESETS,
  EARTH_SURFACE_KM2,
  LANDSCAPE_PRESETS,
  MAX_CACHED_CHUNKS,
  MAX_CONTINENTS,
  SEA_LEVEL,
  WORLD_HEIGHT,
  createWorld,
} from '../src/game/world.js';
import { cameraPanDelta, worldMapPointAt } from '../src/game/render.js';

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

check('профили ландшафта и климата меняют генерацию, но неизвестные значения безопасны', () => {
  const temperate = createWorld({ seed: 'climate-test', landscape: 'mainland', climate: 'temperate' });
  const island = createWorld({ seed: 'climate-test', landscape: 'islands', climate: 'arid' });
  const frozen = createWorld({ seed: 'climate-test', landscape: 'highlands', climate: 'frozen' });
  assert.notEqual(temperate.continentCenters[0].rx, island.continentCenters[0].rx);
  assert.ok(LANDSCAPE_PRESETS[island.landscape]);
  assert.ok(CLIMATE_PRESETS[frozen.climate]);
  assert.equal(createWorld({ landscape: 'unknown', climate: 'unknown' }).landscape, 'mainland');
  assert.equal(createWorld({ landscape: 'unknown', climate: 'unknown' }).climate, 'temperate');

  const sample = temperate.sampleAtNormalized(temperate.continentCenters[0].x, temperate.continentCenters[0].z);
  const drySample = createWorld({ seed: 'climate-test', climate: 'arid' })
    .sampleAtNormalized(temperate.continentCenters[0].x, temperate.continentCenters[0].z);
  const coldSample = frozen.sampleAtNormalized(frozen.continentCenters[0].x, frozen.continentCenters[0].z);
  assert.ok(sample.land && sample.biome in BIOME_NAMES);
  assert.ok(drySample.moisture < sample.moisture);
  assert.ok(coldSample.temperature < sample.temperature);
  assert.ok(Object.values(BIOME).includes(sample.biome));
});

check('у каждого материка есть детерминированное имя и река с названным руслом', () => {
  const first = createWorld({ seed: 'atlas-test', continents: 5 });
  const second = createWorld({ seed: 'atlas-test', continents: 5 });
  assert.deepEqual(first.continentCenters, second.continentCenters);
  assert.deepEqual(first.rivers, second.rivers);
  assert.equal(first.rivers.length, first.continents);
  assert.ok(new Set(first.continentCenters.map((center) => center.name)).size === first.continents);
  for (const river of first.rivers) {
    assert.ok(river.name.length > 2);
    assert.equal(river.points.length, 73);
    assert.ok(river.points.some((point) => point.land));
    assert.ok(river.points.every((point) => point.x >= 0 && point.x <= 1 && point.z >= 0 && point.z <= 1));
  }
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

check('государства, культуры, ресурсы и поселения детерминированы seed мира', () => {
  const first = createWorld({ seed: 'civilization-test', continents: 4 });
  const second = createWorld({ seed: 'civilization-test', continents: 4 });
  assert.deepEqual(first.states, second.states);
  assert.deepEqual(first.settlements, second.settlements);
  assert.ok(first.states.length >= first.continents * 2);
  assert.ok(first.settlements.length >= first.states.length, 'у каждого государства есть столица');
  for (const state of first.states) {
    assert.ok(state.name.length > 4);
    assert.ok(state.resources.length >= 2);
    assert.ok(state.color.startsWith('#'));
    assert.equal(first.stateAtNormalized(state.center.x, state.center.z)?.id, state.id);
    assert.ok(first.settlements.some((item) => item.id === state.capitalId && item.kind === 'столица'));
  }
  const tectonicSamples = Array.from({ length: 70 }, (_, index) => {
    const u = (index + 0.5) / 70;
    return Array.from({ length: 36 }, (_, row) => first.sampleAtNormalized(u, (row + 0.5) / 36).tectonics);
  }).flat();
  assert.ok(tectonicSamples.some((activity) => activity > 0.4), 'процедурные границы плит формируют активные зоны');
  assert.ok(tectonicSamples.every((activity) => activity >= 0 && activity <= 1));
});

check('стратегическая карта переводит экранные координаты в seed-координаты с учётом зума', () => {
  const world = createWorld({ seed: 'map-camera-test' });
  const canvas = { getBoundingClientRect: () => ({ left: 20, top: 30, width: 1000, height: 500 }) };
  const camera = { x: 400, z: 220, mapZoom: 2 };
  const center = worldMapPointAt(canvas, world, camera, 520, 280);
  assert.equal(center.x, 400);
  assert.equal(center.z, 220);
  const overviewCorner = worldMapPointAt(canvas, world, camera, 20, 30, true);
  assert.equal(overviewCorner.x, 0);
  assert.equal(overviewCorner.z, 0);
  assert.ok(worldMapPointAt(canvas, world, camera, 1020, 530, true).x === world.widthCells - 1);
});

check('панорамирование изометрической камеры учитывает проекцию и масштаб', () => {
  const still = cameraPanDelta(900, 600, 0, 0, 1);
  const horizontal = cameraPanDelta(900, 600, 52, 0, 1);
  const vertical = cameraPanDelta(900, 600, 0, 30, 1);
  const zoomed = cameraPanDelta(900, 600, 52, 0, 2);
  assert.deepEqual(still, { x: 0, z: 0 });
  assert.ok(horizontal.x < 0 && horizontal.z > 0, 'горизонтальный drag переводится в диагональ X/Z');
  assert.ok(vertical.x < 0 && vertical.z < 0, 'вертикальный drag сдвигает камеру по обеим осям');
  assert.ok(Math.abs(zoomed.x) < Math.abs(horizontal.x), 'при приближении тот же drag проходит меньше клеток');
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
