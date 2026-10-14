/* Реальный heightmap Azgaar, не мок: seed → граф → материки → физический размер.
   Не запускает весь UI/политическую генерацию. Нужен npm ci и fmg:install. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fromRoot } from './lib/root.mjs';

const dir = mkdtempSync(join(tmpdir(), 'mir-earth-'));
try {
  const vendor = fromRoot('vendor/azgaar-fantasy-map-generator');
  const entry = (name) => JSON.stringify(join(vendor, 'src', name));
  const file = join(dir, 'core.mjs');
  await build({
    stdin: { contents: `
      import ${entry('generators/grid-generator.ts')};
      import ${entry('generators/heightmap-generator.ts')};
      export * from ${entry('services/earth-world.ts')};
      export {getRequestedMapSize} from ${entry('services/map-size.ts')};
    `, resolveDir: vendor },
    bundle: true, format: 'esm', platform: 'node', outfile: file,
    tsconfig: join(vendor, 'tsconfig.json'),
  });
  globalThis.window = globalThis;
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.Node = class Node {};
  globalThis.document = { readyState: 'complete', addEventListener() {}, getElementById() { return null; }, querySelector() { return null; } };
  for (const key of ['INFO', 'TIME', 'ERROR', 'WARN', 'DEBUG']) globalThis[key] = false;
  const { readEarthWorldProfile, applyEarthWorldProfile, EARTH_WORLD_POINTS, getRequestedMapSize } = await import(pathToFileURL(file).href);
  const { editorQuery } = await import('../src/game/azgaar.js');
  const { WORLD_MAP_POINTS, WORLD_SIZES, normalizeWorldConfig } = await import('../src/data/store.js');
  assert.equal(WORLD_MAP_POINTS, EARTH_WORLD_POINTS);
  let checks = 1;
  const earth = { width: 40_075_017, height: 20_003_932 };
  const params = (size = earth, seed = 'earth-test') => new URLSearchParams(editorQuery({ ...size, seed }));
  const world = readEarthWorldProfile(params());
  assert.equal(world.widthKm, 40_075.017);
  assert.equal(world.heightKm, 20_003.932);
  assert.ok(world.graphWidth <= 2000 && world.graphHeight <= 2000);
  const expectedGraph = { width: world.graphWidth, height: world.graphHeight, points: EARTH_WORLD_POINTS };
  assert.deepEqual(getRequestedMapSize(params()), expectedGraph);
  checks += 4;

  const optionStub = () => ({ generation: { graph: {} }, map: { units: { distance: {}, area: {}, height: {}, temperature: {} } } });
  const target = optionStub();
  applyEarthWorldProfile(target, world);
  assert.equal(target.generation.template, 'earthContinents');
  assert.deepEqual(target.generation.geography, { mapSize: 100, latitude: 50, longitude: 50 });
  assert.equal(target.map.units.height.exponent, 2.05); checks += 1;
  assert.equal(target.map.units.distance.unit, 'km');
  assert.equal(target.map.units.area.unit, 'square');
  assert.ok(Math.abs(target.map.graph.width * target.map.units.distance.scale - world.widthKm) < 1e-9);
  assert.ok(Math.abs(target.map.graph.height * target.map.units.distance.scale - world.heightKm) < 1e-9);
  // Regeneration must overwrite randomized islands, units, geography and density.
  target.generation.template = 'atoll'; target.map.units.distance = { unit: 'mi', scale: 5 };
  applyEarthWorldProfile(target, world);
  assert.equal(target.generation.template, 'earthContinents');
  assert.equal(target.map.units.distance.unit, 'km');
  checks += 8;

  for (const size of WORLD_SIZES.slice(0, 3)) {
    const profile = readEarthWorldProfile(params(size));
    const scale = profile.widthKm / profile.graphWidth;
    assert.ok(Math.abs(profile.graphHeight * scale - size.height / 1000) < 1e-8);
    assert.equal(profile.graphWidth, world.graphWidth);
    assert.ok(Math.abs(profile.graphHeight - world.graphHeight) < 1e-9);
    assert.deepEqual(normalizeWorldConfig({ seed: 'keep-slot', ...size }), { seed: 'keep-slot', width: size.width, height: size.height });
    checks += 4;
  }
  for (const query of [
    'width=40075017&height=20003932', // no opt-in, preserve old shared links
    'world=earth&width=NaN&height=20003932',
    'world=earth&width=Infinity&height=20003932',
    'world=earth&width=0&height=20003932',
    'world=earth&width=100000000000&height=20003932',
    'world=earth&width=40075017&height=1000000',
    'world=earth&width=1600&height=1000',
  ]) { assert.equal(readEarthWorldProfile(new URLSearchParams(query)), undefined); checks += 1; }
  assert.equal(params({ width: 1600, height: 1000 }).has('world'), false);
  assert.deepEqual(getRequestedMapSize(new URLSearchParams('width=1600&height=1000')), { width: 1600, height: 1000, points: undefined });
  checks += 2;

  const components = (graph, heights, threshold = 20) => {
    const seen = new Uint8Array(heights.length);
    const result = [];
    // Approximate equirectangular area with cos(latitude), not raw SVG area.
    // It checks scale/order of magnitude, not cadastral/geodesic accuracy.
    const cellKm2 = world.widthKm * world.heightKm / heights.length;
    for (let first = 0; first < heights.length; first += 1) {
      if (seen[first] || heights[first] < threshold) continue;
      const queue = [first]; seen[first] = 1;
      let area = 0, boundaryCells = 0;
      let west = Infinity, east = -Infinity, north = Infinity, south = -Infinity;
      for (let head = 0; head < queue.length; head += 1) {
        const cell = queue[head];
        const [x, y] = graph.points[cell];
        const neighbors = graph.cells.c[cell];
        area += cellKm2 * Math.cos((y / world.graphHeight - 0.5) * Math.PI);
        west = Math.min(west, x); east = Math.max(east, x); north = Math.min(north, y); south = Math.max(south, y);
        let touchesSea = false;
        for (const n of neighbors) {
          if (heights[n] < threshold) touchesSea = true;
          else if (!seen[n]) { seen[n] = 1; queue.push(n); }
        }
        if (touchesSea) boundaryCells += 1;
      }
      const spanKm = (east - west) * world.widthKm / world.graphWidth;
      const spanYKm = (south - north) * world.heightKm / world.graphHeight;
      result.push({
        area, spanKm, spanYKm,
        aspect: Math.min(spanKm, spanYKm) / Math.max(spanKm, spanYKm),
        coastComplexity: boundaryCells / Math.sqrt(queue.length),
      });
    }
    return result.sort((a, b) => b.area - a.area);
  };
  let firstHeights;
  for (const seed of ['earth-test', 'MIR-2026', 'земля', 'sages-earth', '1337', '987654321', 'earth-test']) {
    globalThis.options = { map: { seed, graph: expectedGraph } };
    const graph = Grid.generate(seed, world.graphWidth, world.graphHeight, EARTH_WORLD_POINTS);
    let coastBeforeMountains;
    const originalAddStep = HeightmapGenerator.addStep;
    HeightmapGenerator.addStep = function(tool, ...args) {
      if (tool === 'Range' && !coastBeforeMountains) coastBeforeMountains = this.heights.slice();
      return originalAddStep.call(this, tool, ...args);
    };
    let heights;
    try { heights = await HeightmapGenerator.generate(graph, target.generation.template); }
    finally { HeightmapGenerator.addStep = originalAddStep; }
    assert.ok(coastBeforeMountains && heights.every((h, i) => (h >= 20) === (coastBeforeMountains[i] >= 20)), `${seed}: горные пояса не меняют берег`);
    const dry = [...heights].filter(h => h >= 20);
    const coast = [...heights].reduce((n, h, i) => n + (h >= 20 && graph.cells.c[i].some(j => heights[j] < 20) ? 1 : 0), 0);
    assert.ok(coast / dry.length < .18, `${seed}: слишком много тонких отростков вместо материков`);
    const plains = dry.filter(h => h <= 40).length / dry.length;
    const mountains = dry.filter(h => h >= 55).length / dry.length;
    assert.ok(plains > .45 && mountains > .005 && mountains < .25, `${seed}: нужны и равнины, и горы (${plains}/${mountains})`);
    const belts = components(graph, heights, 55);
    assert.ok(belts.some(b => Math.max(b.spanKm, b.spanYKm) > 700), `${seed}: нужен протяжённый горный пояс`);
    checks += 4;
    assert.ok(heights.every((h) => Number.isFinite(h) && h >= 0 && h <= 100));
    const land = components(graph, heights);
    assert.ok(land.filter((c) => c.area >= 3_000_000).length >= 2, `${seed}: нужны отдельные материки, не только острова`);
    assert.ok(land[0].area >= 10_000_000 && land[0].area < 100_000_000, `${seed}: ${land[0].area} км²`);
    assert.ok(land[0].spanKm >= 3000, `${seed}: материк должен быть тысячи км в поперечнике`);
    if (seed === 'earth-test') {
      const major = land.filter((c) => c.area >= 3_000_000).slice(0, 2);
      assert.ok(major.every((c) => c.aspect >= 0.6 && c.coastComplexity >= 8.5),
        `${seed}: два крупнейших материка должны быть менее овальными и иметь разнообразный берег`);
      checks += 1;
    }
    const fraction = heights.filter((h) => h >= 20).length / heights.length;
    assert.ok(fraction > 0.05 && fraction < 0.5, `${seed}: должны быть и океаны, и суша`);
    if (seed === 'earth-test') {
      if (firstHeights) { assert.deepEqual(heights, firstHeights); checks += 1; }
      else firstHeights = Uint8Array.from(heights);
    } else { assert.notDeepEqual(heights, firstHeights); checks += 1; }
    console.log(`✓ ${seed}: равнины ${(plains*100).toFixed(0)}%, горы ${(mountains*100).toFixed(1)}%, береговые клетки ${(coast/dry.length*100).toFixed(1)}%;  ${land.filter((c) => c.area >= 3_000_000).length} крупных материков, крупнейший ≈ ${(land[0].area / 1e6).toFixed(1)} млн км², поперечник ≈ ${Math.round(land[0].spanKm)} км`);
    checks += 5;
  }
  console.log(`\n✓ ${checks} проверок: физический масштаб, профиль, реальные материки Azgaar, seed и совместимость слотов.`);
} finally { rmSync(dir, { recursive: true, force: true }); }
