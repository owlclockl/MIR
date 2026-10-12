/* Картинка планеты в файл: чем дышит генератор, видно только глазами.

   Запуск:

     node scripts/planet-preview.mjs --level 4 --out preview.png
     node scripts/planet-preview.mjs --stats --samples 40000
     node scripts/planet-preview.mjs --layer temperature --level 4

   Ничего, кроме Node, не нужно: PNG собирается здесь же, на zlib. Скрипт —
   инструмент разработчика, в сборку игры не входит. */

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

import './lib/root.mjs';
import { createPlanet, levelPixels, levelTiles, mppAt, TILE, metersToGeo } from '../src/planet/scale.js';
import { createElevation, heightMeters, SEA_LEVEL } from '../src/planet/elevation.js';
import { createClimate, BIOMES } from '../src/planet/climate.js';
import { LAYERS, paintTile } from '../src/planet/paint.js';
import { createHydro } from '../src/planet/hydro.js';

/* ---------- PNG ---------- */

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
/** RGBA → PNG. */
export const encodePng = (width, height, rgba) => {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // бит на канал
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

/* ---------- аргументы ---------- */

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const seed = option('seed', 'mir-2026');
const size = Number(option('size', '1'));
const level = Number(option('level', '4'));
const layerId = option('layer', 'relief');
const out = option('out', 'planet-preview.png');
const planet = createPlanet({ seed, size });

/* ---------- статистика ---------- */

if (flag('stats')) {
  const elevation = createElevation(planet);
  const { w, h } = levelPixels(planet, level);
  const counts = new Array(BIOMES.length).fill(0);
  let land = 0;
  let total = 0;
  let minH = Infinity;
  let maxH = -Infinity;
  let tempSum = 0;
  let precSum = 0;
  const climate = createClimate(planet, elevation);
  const mpp = mppAt(planet, level);
  const tiles = levelTiles(planet, level);
  for (let ty = 0; ty < tiles.ty; ty += 1) {
    for (let tx = 0; tx < tiles.tx; tx += 1) {
      const raw = elevation.rawTile(level, tx, ty);
      const grid = climate.gridFor(level, tx, ty);
      for (let py = 0; py < TILE; py += 1) {
        const gx = tx * TILE;
        const gy = ty * TILE + py;
        if (gx >= w || gy >= h) continue;
        for (let px = 0; px < TILE; px += 1) {
          const x = gx + px;
          if (x >= w) continue;
          const height = grid.height[py * TILE + px];
          if (height >= SEA_LEVEL) land += 1;
          total += 1;
          if (height < minH) minH = height;
          if (height > maxH) maxH = height;
          tempSum += grid.temp[py * TILE + px];
          precSum += grid.prec[py * TILE + px];
          counts[grid.biome[py * TILE + px]] += 1;
        }
      }
      void raw;
    }
  }
  console.log(`Планета: ${(planet.widthM / 1000).toFixed(0)} × ${(planet.heightM / 1000).toFixed(0)} км, уровень ${level} (${mpp} м/пиксель)`);
  console.log(`Пикселей: ${total.toLocaleString('ru-RU')}`);
  console.log(`Суша: ${((land / total) * 100).toFixed(1)} %`);
  console.log(`Высоты: от ${heightMeters(minH).toFixed(0)} м до ${heightMeters(maxH).toFixed(0)} м`);
  console.log(`Средняя температура: ${(tempSum / total).toFixed(1)} °C, осадки: ${(precSum / total).toFixed(1)}`);
  console.log('Биомы:');
  counts.forEach((count, id) => {
    if (!count) return;
    console.log(`  ${BIOMES[id].name.padEnd(24)} ${((count / total) * 100).toFixed(1)} %`);
  });
  const hydro = createHydro(planet, elevation, climate);
  const started = performance.now();
  while (!hydro.ready()) hydro.step(200);
  console.log(`Гидрология: ${hydro.stats().rivers} рек в ${hydro.stats().regions} областях, ${(performance.now() - started).toFixed(0)} мс, сеть ${hydro.stats().cells} клеток`);
}

/* ---------- картинка ---------- */

const elevation = createElevation(planet);
const climate = createClimate(planet, elevation);
const hydro = createHydro(planet, elevation, climate);
while (!hydro.ready()) hydro.step(500);

const { w, h } = levelPixels(planet, level);
const tiles = levelTiles(planet, level);
const layer = LAYERS.find((entry) => entry.id === layerId) ?? LAYERS[0];
const image = new Uint8ClampedArray(w * h * 4);
const started = performance.now();

for (let ty = 0; ty < tiles.ty; ty += 1) {
  for (let tx = 0; tx < tiles.tx; tx += 1) {
    const tile = { level, tx, ty, elevation, climate, hydro };
    paintTile(image, w, h, tx * TILE, ty * TILE, tile, layer, { shading: true, rivers: true, graticule: false });
  }
}

writeFileSync(out, encodePng(w, h, image));
console.log(`${out}: ${w} × ${h}, слой «${layer.name}», ${(performance.now() - started).toFixed(0)} мс`);
console.log(`Центр кадра: ${JSON.stringify(metersToGeo(planet, planet.widthM / 2, planet.heightM / 2))}`);
