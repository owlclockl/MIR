import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalUV, planetGeometry, geodesicRoute } from '../src/world/geodesy.js';
import license from '../src/world/geodesy-license.js';
import { smoothHeight } from '../src/map/height.js';
import { sampleSurface, createMapCamera, clampCamera, screenToMap, zoomMap, mapRect } from '../src/map/raster.js';
import { createBlockField, blockLOD, MAX_VISIBLE_SAMPLES } from '../src/map/blocks.js';
import { parsePlanet, stringifyPlanet, MAX_PLANET_BYTES } from '../src/world/planet-file.js';
const config = { seed: 'unified-test', width: 40075017, height: 20003932 };
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; console.log(`✓ ${label}`); };
const close = (a, b, tolerance = 1e-6) => Math.abs(a - b) < tolerance;
const source = { width: 128, height: 64, spacing: 8, cellsX: 16, cellsY: 8, seaLevel: 20, heightExponent: 2.05, seedSalt: 42,
  topology: 'ellipsoid', physicalWidth: config.width, physicalHeight: config.height,
  cellH: Float32Array.from({ length: 128 }, (_, i) => i % 16 < 4 ? 10 : 30 + i % 16),
  cellBiome: Uint8Array.from({ length: 128 }, (_, i) => i % 16 < 4 ? 0 : 6), cellTemp: new Int8Array(128).fill(-7), cellPrec: new Uint8Array(128).fill(40), cellFeature: new Uint16Array(128), packHeight: null, packBiome: null, packLake: null, features: [], rivers: [], stats: { cells: 128, rivers: 0, lakes: 0, riversSkipped: 0 } };
const manifest = JSON.parse(readFileSync(new URL('../vendor/geographiclib-geodesic/upstream-manifest.json', import.meta.url)));
for (const [path, digest] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(readFileSync(new URL(`../vendor/geographiclib-geodesic/${path}`, import.meta.url))).digest('hex'), digest);
check(Object.keys(manifest.files).length === 12, 'полный оригинальный npm-пакет GeographicLib защищён SHA-256');
check(license === readFileSync(new URL('../vendor/geographiclib-geodesic/LICENSE.txt', import.meta.url), 'utf8'), 'MIT notice совпадает с оригинальной лицензией GeographicLib');
check(close(canonicalUV(.1, -.1).u, .6) && close(canonicalUV(.1, -.1).v, .1), 'за северным полюсом отражается широта и меняется долгота, не тор');
check(close(canonicalUV(.1, 1.1).u, .6) && close(canonicalUV(.1, 1.1).v, .9), 'южный полюс не соединяется с северным');
check(close(canonicalUV(3.25, .3).u, .25), 'долгота периодична');
for (const scale of [1, 2, 4]) {
  const model = planetGeometry(config.width * scale, config.height * scale);
  check(close(model.geodesic.Inverse(90, 0, -90, 0).s12, config.height * scale), `эллипсоид ${scale}× согласован с физическим полумеридианом`);
  check(close(model.distance(.5, .5, .75, .5), config.width * scale / 4), `экваториальная четверть ${scale}× в физических метрах`);
  check(close(model.distance(.999, .5, .001, .5), config.width * scale * .002), `кратчайшее расстояние ${scale}× через линию смены долготы`);
  check(close(model.distance(0, 0, .7, 0), 0), `северный полюс ${scale}× — одна точка`);
  check(close(model.distance(0, 1, .7, 1), 0), `южный полюс ${scale}× — одна точка`);
  check(close(model.distance(0, .5, .5, .5), config.height * scale), `антиподы ${scale}× не ломают обратную геодезическую задачу`);
}
const model = planetGeometry(config.width, config.height);
check(model.address(.1, 0).x === model.address(.8, 0).x && model.address(.1, 1).x === model.address(.8, 1).x, 'каждый полюс имеет один канонический метровый адрес');
const row = model.row(1000000);
check(close(model.distance(.3, row.v, .3 + 1 / row.circumference, row.v), 1, 1e-5), 'метр вдоль широтного ряда — физический метр, не экваториальная проекция');
check(close(model.distance(.3, row.v, .3, model.row(row.z + 1).v), 1), 'соседние широтные ряды отстоят на метр по меридиану');
check(close(model.address(0, .6).u, model.address(1, .6).u), 'одинаковый метровый адрес на обоих концах долготы');
const route = geodesicRoute(model, { u1: .99, v1: .3, u2: .01, v2: .35 });
check(route.flat().every(Number.isFinite) && Math.abs(route.at(-1)[0] - route[0][0]) < .03, 'линейка рисует кратчайшую геодезическую через шов');
check(geodesicRoute(model, { u1: 0, v1: .5, u2: .5, v2: .5 }).flat().every(Number.isFinite), 'геодезическая антиподов без NaN');
const original = source.cellH.slice();
for (const v of [0, .001, .2, .5, .99, 1]) {
  check(close(smoothHeight(source, 0, v), smoothHeight(source, 1, v)), `высота совпадает на шве, v=${v}`);
  check(Math.abs(smoothHeight(source, 1 - 1e-9, v) - smoothHeight(source, 1e-9, v)) < 1e-5, `нет скачка высоты через шов, v=${v}`);
}
for (const v of [0, 1]) {
  check(close(smoothHeight(source, .1, v), smoothHeight(source, .8, v)), `единая высота полюса v=${v}`);
  check(sampleSurface(source, .1, v).biome === sampleSurface(source, .8, v).biome, `единый биом полюса v=${v}`);
}
check(Buffer.from(original.buffer).equals(Buffer.from(source.cellH.buffer)), 'сферическая адаптация не переписывает сохранённую исходную географию');
const field = createBlockField(source, config.width, config.height);
const a = field.column(0, config.height * .3), b = field.column(config.width, config.height * .3);
check(a.x === b.x && a.z === b.z && a.groundY === b.groundY && a.material === b.material, 'метровые колонки на шве имеют одинаковый адрес и содержимое');
check(Number.isInteger(a.x) && Number.isInteger(a.z) && Number.isInteger(a.groundY), 'адреса и высоты — целые метры');
const camera = createMapCamera(config.width, config.height, 1440, 900); camera.topology = 'ellipsoid'; camera.zoom = 4; camera.x = 1.1; camera.y = 0;
clampCamera(camera);
check(close(camera.x, .1) && camera.y === 0, 'камера обходит экватор и достигает полюса');
camera.x = .99; camera.y = .5;
const anchor = screenToMap(camera, 900, 450); zoomMap(camera, 1.5, 900, 450);
const anchorAfter = screenToMap(camera, 900, 450);
check(close(canonicalUV(anchor.u, anchor.v).u, canonicalUV(anchorAfter.u, anchorAfter.v).u), 'зум у шва сохраняет точку под курсором');
for (const zoom of [1, 30, 10000, 300000000]) {
  camera.zoom = zoom;
  const r = mapRect(camera), step = blockLOD(camera);
  check(Math.min(camera.width * config.width / r.width, config.width) * Math.min(camera.height * config.width / r.width, config.height) / step ** 2 <= MAX_VISIBLE_SAMPLES, `LOD ${zoom} не материализует всю планету`);
}
const pins = [{ u: .99, v: .3, name: 'Пост' }];
const annotations = [{ type: 'line', u1: .2, v1: .3, u2: .3, v2: .4, color: -1, width: 2 }];
camera.zoom = 100;
const text = stringifyPlanet({ config, source, pins, annotations, settings: {}, camera });
const restored = parsePlanet(text);
check(restored.config.seed === config.seed && restored.source.topology === 'ellipsoid', 'файл хранит полную географию, не только seed');
for (const key of ['cellH', 'cellBiome', 'cellTemp', 'cellPrec', 'cellFeature']) check(Buffer.from(restored.source[key].buffer).equals(Buffer.from(source[key].buffer)), `lossless roundtrip ${key}`);
check(restored.pins[0].name === 'Пост' && restored.annotations.length === 1 && restored.camera.zoom === 100, 'переносимый файл восстанавливает метки, рисунки и камеру');
for (const mutate of [d => d.version++, d => d.source.cellsX = 1e9, d => d.source.cellH.type = 'Float64Array', d => d.source.cellH.data = 'AAAA', d => d.source.heightExponent = 1e6, d => d.pins[0].u = 9, d => d.camera.zoom = -1, d => d.source.topology = 'torus', d => { delete d.source.topology; d.source.physicalWidth = 64; }, d => d.source.rivers = [{ id: 1, points: [[1, 1], [2, 2]], half: [1], flux: [1] }]]) {
  const d = JSON.parse(text); mutate(d);
  assert.throws(() => parsePlanet(JSON.stringify(d))); checks++;
}
assert.throws(() => parsePlanet(' '.repeat(MAX_PLANET_BYTES + 1))); checks++;
console.log(`${checks} unified planet checks passed`);
