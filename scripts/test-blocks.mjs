import assert from 'node:assert/strict';
import { landColor, oceanColor, terrainLight } from '../src/map/terrain-style.js';
import { smoothHeight, heightMeters } from '../src/map/height.js';
import { createBlockField, buildBlockTile, blockLOD, createBlockRenderer, BLOCK_METERS, TILE_BLOCKS, MAX_BLOCK_TILES, MAX_VISIBLE_SAMPLES } from '../src/map/blocks.js';
import { createMapCamera, mapRect, zoomMap, maxMapZoom } from '../src/map/raster.js';
let checks = 0;
const check = (ok, name) => { assert.ok(ok, name); checks += 1; console.log(`✓ ${name}`); };
const heights = Float32Array.from({ length: 64 }, (_, i) => 30 + i % 8 * 4);
const source = { width: 64, height: 64, cellsX: 8, cellsY: 8, spacing: 8, cellH: heights, cellBiome: new Uint8Array(64).fill(4), seaLevel: 20, heightExponent: 1.8, features: [], rivers: [{ id: 7, points: [[8, 32], [32, 32], [56, 32]], half: [.5, .8, 1], flux: [16, 64, 100] }] };
const oldH = heights.slice(); const oldR = JSON.stringify(source.rivers);
const field = createBlockField(source, 64000, 64000);
check(BLOCK_METERS === 1 && TILE_BLOCKS === 64, 'горизонтальная и вертикальная клетка — 1 метр, тайл 64×64');
assert.deepEqual(field.column(123.1, 456.1), field.column(123.9, 456.9)); checks += 1;
check(field.column(124, 456).x - field.column(123, 456).x === 1, 'соседние X/Z — действительно соседние метры, не пиксели источника');
check(Math.abs(smoothHeight(source, .5 - 1e-7, .5) - smoothHeight(source, .5 + 1e-7, .5)) < .001, 'высота непрерывна на границах исходных ячеек');
check(smoothHeight(source, .5, .5) > 42 && smoothHeight(source, .5, .5) < 46, 'между известными высотами есть интерполяция, не ближайшая клетка');
for (const y of [0, 5, 19, 19.5, 20, 50, 100]) check(Number.isFinite(heightMeters(source, y)), 'высота Azgaar переводится в метры без NaN');
let largestStep = 0;
for (let x = 10000; x < 22000; x += 1) {
  const a = field.column(x, 10000); const b = field.column(x + 1, 10000);
  assert.ok(Number.isInteger(a.groundY)); largestStep = Math.max(largestStep, Math.abs(a.groundY - b.groundY));
}
check(largestStep <= 1 && largestStep > 0, 'плавный склон представлен метровыми ступенями, без гигантских террас');
const water = field.column(32000, 32000);
check(water.material === 'river' && water.riverId === 7 && Number.isInteger(water.waterY) && water.waterY - water.groundY === 2, 'река — водяные колонки с целочисленной поверхностью и дном');
check(field.column(32000, 32020).waterY === null, 'за физическим руслом нет растянутой экранной линии воды');
check(field.riverAt(32000, 32000).radiusM <= 64, 'ширина русла метрическая и ограниченная, не ширина символа в километрах');
let lastWater = Infinity;
for (let x = 8000; x < 56000; x += 128) { const c = field.column(x, 32000); assert.ok(c.waterY <= lastWater); lastWater = c.waterY; }
check(true, 'поверхность реки не поднимается вверх по направлению русла');
const tile = buildBlockTile(field, 500, 500, 1);
check(tile.terrain.length === 64 * 64 * 4 && tile.rivers.some((v, i) => i % 4 === 3 && v === 255), 'вода материализуется в RGBA-клетках тайла, не Canvas stroke');
check(tile.rivers.some((v, i) => i % 4 === 3 && v === 0), 'берега отделяют водные клетки от суши');
assert.deepEqual(buildBlockTile(field, 500, 500, 1), tile); checks += 1;
const coarseWater = buildBlockTile(field, 7, 7, 64).rivers.filter((v,i) => i % 4 === 3 && v > 0);
check(coarseWater.length > 0 && coarseWater.every(a => a < 64), 'реки LOD полупрозрачны по покрытию: ручьи не становятся океанскими проливами');
const left = buildBlockTile(field, 499, 500, 1);
check(left.rivers[63 * 4 + 3] === tile.rivers[3], 'река непрерывна на границе тайлов');
assert.deepEqual(heights, oldH); assert.equal(JSON.stringify(source.rivers), oldR); checks += 1;
for (const width of [320, 1440, 4096]) {
  const camera = createMapCamera(40075017, 20003932, width, 900);
  for (const zoom of [1, 64, 1000, maxMapZoom(camera)]) {
    camera.zoom = zoom; const lod = blockLOD(camera); const r = mapRect(camera); const mpp = camera.worldWidth / r.width;
    const count = Math.min(camera.width * mpp, camera.worldWidth) * Math.min(camera.height * mpp, camera.worldHeight) / lod ** 2;
    check(Number.isInteger(Math.log2(lod)) && lod >= 1 && count <= MAX_VISIBLE_SAMPLES, 'LOD и число видимых выборок ограничены независимо от размера планеты');
  }
  zoomMap(camera, 1e10); check(blockLOD(camera) === 1 && Math.abs(mapRect(camera).width / camera.worldWidth - 8) < 1e-8, 'на Земле и телефоне достижим 1 блок = 8 px, без предела 64×');
}
const context = new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }, { get: (o, k) => o[k] || (() => {}) });
globalThis.document = { createElement: () => ({ getContext: () => context }) };
const renderer = createBlockRenderer(field); const camera = createMapCamera(64000, 64000, 320, 240);
zoomMap(camera, 1e8);
for (let i = 0; i < 140; i += 1) { camera.x = (i * 128 + 100) / 64000; camera.y = .6; renderer.paint(context, camera, true); }
check(renderer.stats().cached <= MAX_BLOCK_TILES && renderer.stats().builds > MAX_BLOCK_TILES, 'LRU освобождает тайлы при перемещении, память не растёт с путём');
const builds = renderer.stats().builds; renderer.paint(context, camera, true, 'rivers');
check(renderer.stats().builds === builds && renderer.stats().hits > 0, 'слой рек использует те же кэшированные клетки');
renderer.clear(); check(renderer.stats().cached === 0, 'смена источника/dispose освобождает кэш');
for (const height of [0, 500, 1600, 2800, 3800, 5500, 8000]) check(landColor(6, height).every(c => Number.isFinite(c) && c >= 0 && c <= 255), 'непрерывная высотная окраска без выхода RGB за границы');
check(Math.max(...landColor(6, 2800).map((c,i) => Math.abs(c-landColor(6,2799)[i]))) < 1, 'на границе нагорья нет резкой серой полосы');
check(landColor(6, 5500).every(c => c > 220), 'снег на высоких вершинах, не на всех нагорьях');
check(oceanColor(-990)[2] < oceanColor(-5)[2] && oceanColor(-990)[0] < oceanColor(-5)[0], 'плавный шельф светлее глубокого океана');
check(terrainLight(0,100,0,100,1000) > terrainLight(100,0,100,0,1000), 'северо-западная светотень различает ориентацию склонов');
console.log(`\n${checks} проверок метровых блоков: всё хорошо.`);
