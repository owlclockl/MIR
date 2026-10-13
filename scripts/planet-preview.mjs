/* Картинка планеты в файл: чем дышит генератор, видно только глазами.

   Запуск:

     node scripts/planet-preview.mjs --level 4 --out preview.png
     node scripts/planet-preview.mjs --stats --samples 40000
     node scripts/planet-preview.mjs --layer temperature --level 4
     node scripts/planet-preview.mjs --azgaar --level 4 --diff   # берега из карты Azgaar

   Ничего, кроме Node, не нужно: PNG собирается здесь же, на zlib. Скрипт —
   инструмент разработчика, в сборку игры не входит. */

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

import './lib/root.mjs';
import { createPlanet, levelPixels, levelTiles, mppAt, TILE, metersToGeo } from '../src/planet/scale.js';
import { createElevation, heightMeters, SEA_LEVEL } from '../src/planet/elevation.js';
import { heightFromRaw } from '../src/planet/zscale.js';
import { blobsSource } from './lib/planet-source.mjs';
import { createClimate, BIOMES } from '../src/planet/climate.js';
import { LAYERS, paintTile } from '../src/planet/paint.js';
import { createHydro } from '../src/planet/hydro.js';
import { createClock, createLivingWorld, createSeasonFields, dateLabel, hourLabel } from '../src/planet/alive.js';
import { composeAlive } from './lib/alive-raster.mjs';

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
/* Аргумент можно писать и через пробел (--level 5), и через знак равенства
   (--level=5): второй способ привычен там, где значение — слово, а не число. */
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  const joined = args.find((arg) => arg.startsWith(`--${name}=`));
  return joined ? joined.slice(name.length + 3) : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const seed = option('seed', 'mir-2026');
const size = Number(option('size', '1'));
const level = Number(option('level', '4'));
const layerId = option('layer', 'relief');
const out = option('out', 'planet-preview.png');
const planet = createPlanet({ seed, size });

/* География. По умолчанию своя, процедурная. С флагом --azgaar — из снимка
   карт генератора (тот же формат, что мост читает из окна редактора): тогда
   картинкой можно сверить берега планеты с берегами источника. --cells —
   разрешение решётки клеток источника. */
const source = flag('azgaar')
  ? blobsSource({ cellsX: Number(option('cells', '100')), cellsY: Math.round(Number(option('cells', '100')) * 0.63) })
  : null;

/* ---------- статистика ---------- */

if (flag('stats')) {
  const elevation = createElevation(planet, { source });
  const stats = elevation.stats();
  console.log(`География: ${stats.geography}${stats.source ? `, клетка источника ${(stats.source.cellM / 1000).toFixed(0)} тыс. км, деталь с ${stats.detailFrom}-й октавы` : ''}`);
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

const elevation = createElevation(planet, { source });
const climate = createClimate(planet, elevation);
const hydro = createHydro(planet, elevation, climate);
while (!hydro.ready()) hydro.step(500);

/* Кадр: по умолчанию — верхний левый угол уровня, целиком. --tx/--ty сдвигают
   окно на тайл, --tw/--th задают его размер в тайлах: так можно разглядеть
   берег вблизи и увидеть, что он не рассыпался в ступени на глубоком уровне. */
const all = levelTiles(planet, level);
const whole = levelPixels(planet, level);
const tx0 = Math.max(0, Math.min(Number(option('tx', '0')), all.tx - 1));
const ty0 = Math.max(0, Math.min(Number(option('ty', '0')), all.ty - 1));
const tw = Math.max(1, Math.min(Number(option('tw', '0')) || Math.ceil(Math.min(whole.w, 1224) / TILE), all.tx - tx0));
const th = Math.max(1, Math.min(Number(option('th', '0')) || Math.ceil(Math.min(whole.h, 612) / TILE), all.ty - ty0));
const w = tw * TILE;
const h = th * TILE;
const originX = tx0 * TILE;
const originY = ty0 * TILE;
const layer = LAYERS.find((entry) => entry.id === layerId) ?? LAYERS[0];
const image = new Uint8ClampedArray(w * h * 4);
const started = performance.now();

for (let ty = ty0; ty < ty0 + th; ty += 1) {
  for (let tx = tx0; tx < tx0 + tw; tx += 1) {
    const tile = { level, tx, ty, elevation, climate, hydro };
    paintTile(image, w, h, tx * TILE - originX, ty * TILE - originY, tile, layer, { shading: true, rivers: true, graticule: false });
  }
}

/* --alive: поверх статичной карты ложится живой мир — облака, ночь, огни,
   ветер, снег, вулканы и берег будущего мира. Мир при этом живёт своей
   жизнью: часы идут, погода успевает подуть, плиты — уехать.

     --alive=day|year|epoch   масштаб времени (по умолчанию сутки)
     --hour 18 --day 355      час суток и день года
     --ma 10                  на сколько миллионов лет уехать в эпохе
     --warmup 12              сколько модельных часов погоды прокрутить */
if (args.some((arg) => arg === '--alive' || arg.startsWith('--alive='))) {
  const mode = option('alive', 'day') || 'day';
  const liveClock = createClock({ mode, hour: Number(option('hour', '12')), day: Number(option('day', '172')) });
  const living = createLivingWorld({ planet, elevation, climate, hydro, seed, clock: liveClock });
  const seasonFields = createSeasonFields({ climate });
  const warmup = Number(option('warmup', '14'));
  for (let i = 0; i < warmup; i += 1) living.weather.step(1);
  if (mode === 'epoch') {
    const destination = Number(option('ma', '10'));
    living.drift.advance(destination);
    liveClock.setMa(destination);
  }
  /* Частицы ставятся по всему миру: preview показывает планету целиком, и
     частиц должно быть столько же, сколько было бы в кадре такого размера. */
  const mpp = mppAt(planet, level);
  living.setView({ minX: originX * mpp, minY: originY * mpp, maxX: (originX + w) * mpp, maxY: (originY + h) * mpp, mpp });
  for (let i = 0; i < 120; i += 1) {
    living.advance(1 / 60);
  }
  composeAlive({
    rgba: image, width: w, height: h, originX, originY, mpp, planet, living, seasonFields,
    options: { layers: {} },
  });
  console.log(`живой мир: ${mode === 'epoch' ? `${liveClock.ma.toFixed(1)} млн лет` : `${dateLabel(liveClock.dayOfYear())} · ${hourLabel(liveClock.hour)}`}, ` +
    `облачность ${living.weather.stats().cover.toFixed(2)}, вихрей ${living.weather.stats().systems}, ` +
    `огней ${living.lights.points.length}, вулканов ${living.volcanoes.sites.length}, ` +
    `сияние ${living.aurora.activity().toFixed(2)}, берег ${living.drift.stats().segments} отрезков`);
}

writeFileSync(out, encodePng(w, h, image));
console.log(`${out}: ${w} × ${h}, слой «${layer.name}», ${(performance.now() - started).toFixed(0)} мс`);

/* --diff: карта расхождения берегов. Без неё «совпадает» выглядит правдоподобно
   и на чужой географии, а здесь видно каждую клетку: зелёный — суша на обеих
   картах, тёмно-синий — вода на обеих, красный — планета добавила берег,
   голубой — планета его съела. Идея проверки ровно та же, что у
   `npm run test:planet`, только глазами. */
if (flag('diff')) {
  if (!elevation.geography) {
    console.log('--diff нужен --azgaar: сравнивать береги не с чем, мир процедурный.');
  } else {
    const diff = new Uint8ClampedArray(w * h * 4);
    const mpp = mppAt(planet, level);
    let mismatch = 0;
    for (let py = 0; py < h; py += 1) {
      for (let px = 0; px < w; px += 1) {
        const mx = (originX + px + 0.5) * mpp;
        const my = (originY + py + 0.5) * mpp;
        /* rawPixel ждёт абсолютные пиксели уровня: окно сдвинуто, поэтому к px
           и py прибавлено начало кадра — иначе берег сравнивался бы с берегом
           из другой половины света (и расхождение вышло бы 100 %). */
        const here = heightFromRaw(elevation.rawPixel(level, originX + px, originY + py)) >= SEA_LEVEL;
        const there = elevation.geography.landAt(mx, my);
        const at = (py * w + px) * 4;
        const color = here && there ? [28, 74, 46] : !here && !there ? [18, 32, 48] : here ? [200, 62, 46] : [52, 138, 220];
        if (here !== there) mismatch += 1;
        diff[at] = color[0];
        diff[at + 1] = color[1];
        diff[at + 2] = color[2];
        diff[at + 3] = 255;
      }
    }
    const diffOut = `${out.replace(/\.png$/, '')}-diff.png`;
    writeFileSync(diffOut, encodePng(w, h, diff));
    console.log(`${diffOut}: расхождение берега ${(mismatch / (w * h) * 100).toFixed(4)} % пикселей`);
  }
}
console.log(`Центр кадра: ${JSON.stringify(metersToGeo(planet, planet.widthM / 2, planet.heightM / 2))}`);
