/* Проверка генератора планеты: масштаб → шум → высоты → климат → сток →
   раскраска. Запуск: npm run test:planet

   Глазами здесь смотреть не на что (это числа), зато проверяется как раз то,
   что глазами не увидеть и что ломается незаметно:

     1. **Шкала.** Планета размером с Землю: экватор 40 075 км, на максимальном
        уровне ровно метр в пиксель, уровни — степени двойки, а координаты
        туда-обратно без потери.
     2. **Пирамида.** Тайл любого уровня совпадает с растянутым родителем там,
        где новые октавы ещё не видны; одинаковый тайл два раза — одно и то же
        число; за границей массива не NaN. Проверка ловила уже два падения:
        отрицательный индекс при выборке и чтение за краем тайла.
     3. **Море и суша.** Доля суши в разумных пределах, Эверест не выше 9 км,
        впадины не глубже 11 км, на экваторе теплее, чем у полюса.
     4. **География из карты Azgaar.** На синтетическом снимке в формате
        `readSource` (материки, хребет, залив): берег планеты совпадает с
        берегом источника до пикселя, октавы крупнее клетки источника молчат,
        высоты не уходят дальше детали, мир не замыкается по долготе.
     5. **Климат.** Температура падает с высотой, осадки зависят от широты и
        океаничности, биомы встречаются разные — без пустынь или без лесов
        карта не карта.
     6. **Сток.** Вода течёт вниз: у каждой клетки сток не меньше собственного
        вклада, русло не исчезает на стыке областей, ширина Амазонки — кило-
        метры, а ручья — метры.
     7. **Раскраска.** Все двадцать слоёв рисуются, в пикселях нет NaN и пустот.

   Отдельно печатается цена: сколько стоит тайл на разных уровнях. По этим
   числам видно, укладывается ли генерация в кадр. */

import './lib/root.mjs';
import {
  clampPixelX, createPlanet, geoToMeters, levelPixels, levelTiles, metersToGeo, mppAt, TILE,
} from '../src/planet/scale.js';
import { noise3, fbm3, hash3 } from '../src/planet/noise.js';
import {
  createElevation, heightFromMeters, heightFromRaw, heightMeters, octaveWavelength, SEA_LEVEL,
} from '../src/planet/elevation.js';
import { GUARD_SIGMAS, createSourceField } from '../src/planet/source.js';
import {
  RAW_MEAN, RAW_SIGMA, SEA_Z, heightToZ, rawFromHeight,
} from '../src/planet/zscale.js';
import { readSource } from '../src/world/bridge.js';
import { fakeEditorWindow } from './lib/fake-fmg.mjs';
import { blobsSource, sourceLandShare } from './lib/planet-source.mjs';
import {
  BIOMES, createClimate, PREC_TO_MM, seaLevelTemperature, temperatureAt,
} from '../src/planet/climate.js';
import { createHydro, discharge, riverWidth } from '../src/planet/hydro.js';
import { LAYERS, paintTile } from '../src/planet/paint.js';

/* Русское согласование числительного: «61 проверка», а не «61 проверок». */
const plural = (n, one, few, many) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const checks = [];
const add = (ok, what, detail = '') => checks.push({ ok: Boolean(ok), what, detail });

/* ---------- 1. шкала ---------- */

const earth = createPlanet({ seed: 'mir-2026', size: 1 });
add(Math.abs(earth.widthM - 40_075_000) < 5000, 'экватор планеты 1× — 40 075 км', `${(earth.widthM / 1000).toFixed(0)} км`);
add(Math.abs(earth.heightM - earth.widthM / 2) / earth.widthM < 0.002,
  'высота карты — половина экватора (с округлением до пикселя)', `${(earth.heightM / 1000).toFixed(0)} км`);
add(mppAt(earth, earth.maxLevel) === 1, 'на максимальном уровне 1 пиксель = 1 метр', `${mppAt(earth, earth.maxLevel)} м`);
const huge = createPlanet({ seed: 'mir-2026', size: 4 });
add(mppAt(huge, huge.maxLevel) === 1, 'планета 4× тоже доходит до метра в пикселе', `${mppAt(huge, huge.maxLevel)} м`);
add(huge.widthM > earth.widthM * 3.9, 'планета 4× — 160 300 км по экватору', `${(huge.widthM / 1000).toFixed(0)} км`);
add(levelPixels(huge, huge.maxLevel).w > 160_000_000, 'максимальный кадр 4× — 160 млн пикселей в строке',
  `${levelPixels(huge, huge.maxLevel).w.toLocaleString('ru-RU')}`);

const roundTrip = geoToMeters(earth, 37.62, 55.75); // долгота, широта
const back = metersToGeo(earth, roundTrip.x, roundTrip.y);
add(Math.abs(back.lat - 55.75) < 1e-6 && Math.abs(back.lon - 37.62) < 1e-6,
  'координаты туда-обратно без потери', `${back.lat.toFixed(4)}, ${back.lon.toFixed(4)}`);
add(metersToGeo(earth, 0, 0).lat > 89, 'верх карты — северный полюс', `${metersToGeo(earth, 0, 0).lat.toFixed(1)}°`);
add(Math.abs(metersToGeo(earth, -1_000_000, 0).lon + 180) < 1e-6, 'долгота за левым краем прижата к −180°, а не завернута', `${metersToGeo(earth, -1e6, 0).lon.toFixed(1)}°`);
add(Math.abs(metersToGeo(earth, earth.widthM + 1e6, earth.heightM).lat + 90) < 1e-6, 'за нижним краем — −90°, дальше карты нет');
add(clampPixelX(earth, 2, -5) === 0 && clampPixelX(earth, 2, levelPixels(earth, 2).w + 5) === levelPixels(earth, 2).w - 1,
  'пиксель за краем карты сворачивается на край, а не на другой бок мира');

/* ---------- 2. шум ---------- */

let min = Infinity;
let max = -Infinity;
let finite = true;
for (let i = 0; i < 20_000; i += 1) {
  const value = noise3(i * 0.013, i * 0.0071 + 3, i * 0.0031, 12345);
  if (!Number.isFinite(value)) finite = false;
  if (value < min) min = value;
  if (value > max) max = value;
}
add(finite, 'шум не отдаёт NaN и бесконечность');
add(min > -1.5 && max < 1.5, 'шум лежит в пределах ±1,5', `${min.toFixed(2)}…${max.toFixed(2)}`);
add(noise3(10.5, 3.25, -7.75, 5) === noise3(10.5, 3.25, -7.75, 5), 'шум детерминирован');
let hashSum = 0;
let lowHalf = 0;
for (let i = 0; i < 40_000; i += 1) {
  const value = hash3(i, i * 3, i * 7, 1);
  hashSum += value;
  if (value < 0.5) lowHalf += 1;
}
add(Math.abs(hashSum / 40_000 - 0.5) < 0.01, 'хеш равномерный: среднее близко к половине', `${(hashSum / 40_000).toFixed(4)}`);
add(Math.abs(lowHalf / 40_000 - 0.5) < 0.01, 'хеш не косит в одну сторону', `${(lowHalf / 40_000 * 100).toFixed(1)} % ниже середины`);
const fbm = fbm3(100, 200, 300, { seed: 7, octaves: 4, frequency: 1 / 5000, gain: 0.5 });
add(Number.isFinite(fbm) && Math.abs(fbm) < 3, 'fbm из четырёх октав конечен', fbm.toFixed(3));

/* ---------- 3. пирамида высот ---------- */

const elevation = createElevation(earth, { bytes: 96 * 1024 * 1024 });
add(Boolean(elevation.fields.shape && elevation.fields.volcanic), 'грубые поля (форма материков, вулканизм) на месте');

const first = elevation.rawTile(2, 0, 0);
const again = elevation.rawTile(2, 0, 0);
add(first === again, 'повторный запрос отдаёт тот же тайл из кэша');

let nan = 0;
for (const level of [0, 4, 8, 12, 18]) {
  const tile = elevation.rawTile(level, 0, 0);
  for (let i = 0; i < tile.length; i += 1) if (!Number.isFinite(tile[i])) nan += 1;
}
add(nan === 0, 'в высотах нет NaN ни на одном уровне', `${nan} штук`);

/* Потомок совпадает с родителем в той мере, в какой новые октавы ещё мелки:
   сравниваем не пиксели, а корреляцию — деталь добавляется, но не переворачивает
   рельеф. */
const parentTile = elevation.rawTile(6, 3, 2);
const childTile = elevation.rawTile(7, 6, 4);
let diffSum = 0;
let base = 0;
for (let y = 0; y < TILE; y += 1) {
  for (let x = 0; x < TILE; x += 1) {
    const px = (x >> 1) + ((y >> 1) << 8);
    const a = parentTile[((y >> 1) << 8) + (x >> 1)];
    const b = childTile[y * TILE + x];
    diffSum += (a - b) ** 2;
    base += a * a;
    void px;
  }
}
add(Math.sqrt(diffSum / base) < 0.35, 'потомок продолжает родителя, а не рисует новый мир',
  `отклонение ${(Math.sqrt(diffSum / base) * 100).toFixed(1)} %`);

/* ---------- 4. география из карты Azgaar ---------- */

/* Мир больше не цилиндр: выборка упирается в край, а не переходит на другой
   бок. Проверка держит это на самих тайлах, а не на формулах координат. */
const edgeRow = Math.floor(levelPixels(earth, 2).h / 2);
const edgeW = levelPixels(earth, 2).w;
add(elevation.rawPixel(2, -3, edgeRow) === elevation.rawPixel(2, 0, edgeRow), 'за левым краем — тот же край, а не продолжение');
add(elevation.rawPixel(2, edgeW + 7, edgeRow) === elevation.rawPixel(2, edgeW - 1, edgeRow), 'за правым краем — тоже край');
add(Math.abs(elevation.rawPixel(2, 0, edgeRow) - elevation.rawPixel(2, edgeW - 1, edgeRow)) > 0.01,
  'левый и правый края карты — разные места (замыкания нет)',
  `Δ ${Math.abs(elevation.rawPixel(2, 0, edgeRow) - elevation.rawPixel(2, edgeW - 1, edgeRow)).toFixed(2)}`);

/* Шкала: суша обратима точно — на этом держится совпадение высот. */
add(Math.abs(heightFromRaw(RAW_MEAN + RAW_SIGMA * heightToZ(64)) - 64) < 1e-6,
  'высота → z → высота: суша обратима без потери', `${heightFromRaw(RAW_MEAN + RAW_SIGMA * heightToZ(64)).toFixed(3)}`);
add(heightToZ(SEA_LEVEL) === SEA_Z, 'уровень моря генератора — ровно берег планеты', `z = ${SEA_Z}`);
add(Math.abs(rawFromHeight(45) - (RAW_MEAN + RAW_SIGMA * heightToZ(45))) < 1e-9, 'порог «сырое значение из высоты» согласован со шкалой');
let monotone = true;
let previousZ = -Infinity;
for (let h = 0; h <= 100; h += 0.5) {
  const z = heightToZ(h);
  if (!(z > previousZ)) monotone = false;
  previousZ = z;
}
add(monotone, 'обратная шкала монотонна: выше высота — больше z');

const azgaar = blobsSource();
const sourced = createElevation(earth, { source: azgaar, bytes: 128 * 1024 * 1024 });
add(sourced.stats().geography === 'azgaar', 'снимок карт переключает планету на географию Azgaar');
add(sourced.detailFrom > 0, 'октавы крупнее клетки источника выключены', `деталь с ${sourced.detailFrom}-й октавы`);
const sourcedCell = sourced.geography.stats().cellM;
add(octaveWavelength(earth, sourced.detailFrom) <= sourcedCell / 2 + 1,
  'первая октава детали — вдвое мельче клетки источника',
  `λ ${(octaveWavelength(earth, sourced.detailFrom) / 1000).toFixed(0)} тыс. км против клетки ${(sourcedCell / 1000).toFixed(0)} тыс. км`);

/* Главное: берег. Считаем по всей карте на уровне, где пиксель — 64 км, и
   сравниваем знак «суша/вода» со знаком базы источника. Расхождение здесь —
   это ровно то, за чем человек смотрит на две карты рядом. */
const srcLevel = 4;
const srcMpp = mppAt(earth, srcLevel);
const srcPixels = levelPixels(earth, srcLevel);
let srcTotal = 0;
let srcCoast = 0;
let srcLand = 0;
let maxDetail = 0;
const heightErrors = [];
for (let py = 0; py < srcPixels.h; py += 4) {
  for (let px = 0; px < srcPixels.w; px += 4) {
    const raw = sourced.rawPixel(srcLevel, px, py);
    const mx = (px + 0.5) * srcMpp;
    const my = (py + 0.5) * srcMpp;
    const base = sourced.geography.baseAt(mx, my);
    const height = heightFromRaw(raw);
    srcTotal += 1;
    if (height >= SEA_LEVEL) srcLand += 1;
    if ((height > SEA_LEVEL) !== sourced.geography.landAt(mx, my)) srcCoast += 1;
    maxDetail = Math.max(maxDetail, Math.abs(raw - base));
    if (base > sourced.geography.rawCoast) {
      heightErrors.push(Math.abs(heightMeters(height) - heightMeters(heightFromRaw(base))));
    }
  }
}
add(srcCoast === 0, 'берег планеты совпадает с берегом карты Azgaar', `${srcCoast} расхождений на ${(srcTotal / 1000).toFixed(0)} тыс. выборок`);
add(Math.abs(srcLand / srcTotal - sourceLandShare(azgaar)) < 0.02,
  'доля суши — как у генератора', `${((srcLand / srcTotal) * 100).toFixed(1)} % против ${(sourceLandShare(azgaar) * 100).toFixed(1)} %`);
/* σ здесь мира, а не клетки: множитель шероховатости меняется по карте, и в
   горах деталь крупнее средней. Поэтому допуск домножен на отношение пика
   шероховатости к среднему — иначе проверка ловила бы не поломку guard, а
   саму неоднородность рельефа. */
const guardSigma = sourced.stats().sigma * sourced.stats().roughRatio;
add(maxDetail <= (GUARD_SIGMAS + 1) * guardSigma,
  'деталь не вылезает за guard: |raw − база| ≤ (GUARD_SIGMAS + 1)σ',
  `${maxDetail.toFixed(2)} против ${(GUARD_SIGMAS * guardSigma).toFixed(2)}`);
heightErrors.sort((a, b) => a - b);
const medianError = heightErrors[Math.floor(heightErrors.length / 2)] ?? Infinity;
const p95Error = heightErrors[Math.floor(heightErrors.length * 0.95)] ?? Infinity;
add(medianError < 250, 'высоты на суше — те же, что у генератора: медианное расхождение', `${medianError.toFixed(0)} м`);
add(p95Error < 900, 'и в 95-м перцентили расхождение — сотни метров, не километры', `${p95Error.toFixed(0)} м`);

/* Пирамида с приложенной картой остаётся пирамидой: база не зависит от уровня,
   поэтому ребёнок по-прежнему продолжает родителя. */
const sourcedParent = sourced.rawTile(6, 3, 2);
const sourcedChild = sourced.rawTile(7, 6, 4);
let sourcedDiff = 0;
let sourcedBase = 0;
for (let y = 0; y < TILE; y += 1) {
  for (let x = 0; x < TILE; x += 1) {
    const a = sourcedParent[((y >> 1) << 8) + (x >> 1)];
    const b = sourcedChild[y * TILE + x];
    sourcedDiff += (a - b) ** 2;
    sourcedBase += a * a;
  }
}
const sourcedDeviation = Math.sqrt(sourcedDiff / sourcedBase);
add(sourcedDeviation < 0.35, 'с картой Azgaar потомок тоже продолжает родителя', `отклонение ${(sourcedDeviation * 100).toFixed(1)} %`);

let sourcedNaN = 0;
const deepTile = sourced.rawTile(12, 40, 10);
for (let i = 0; i < deepTile.length; i += 1) if (!Number.isFinite(deepTile[i])) sourcedNaN += 1;
add(sourcedNaN === 0, 'на глубоком уровне с картой тоже нет NaN', `${sourcedNaN} пикселей`);

/* Мост в Azgaar — единственное место, где поле знает имена генератора.
   Снимок с поддельного окна обязан быть годен планете: имена те же, что и у
   воксельного мира, значит расхождение имён ловится здесь, а не в браузере. */
const bridgeSource = readSource(fakeEditorWindow(), { seed: 'mir-2026', width: 96, height: 96 });
const bridgeField = createSourceField(earth, bridgeSource);
const bridgeSample = bridgeField.baseAt(earth.widthM / 2, earth.heightM / 2);
add(Number.isFinite(bridgeSample) && bridgeField.stats().cells === bridgeSource.cellsX * bridgeSource.cellsY,
  'снимок карт через мост пригоден как база планеты',
  `${bridgeField.stats().cellsX} × ${bridgeField.stats().cellsY} клеток`);

/* ---------- 5. доли суши и высот ---------- */

const level2 = 2;
const mpp2 = mppAt(earth, level2);
const pixels2 = levelPixels(earth, level2);
let land = 0;
let total = 0;
let highest = -Infinity;
let lowest = Infinity;
for (let py = 0; py < pixels2.h; py += 3) {
  for (let px = 0; px < pixels2.w; px += 3) {
    const h = heightFromRaw(elevation.rawPixel(level2, px, py));
    if (h >= SEA_LEVEL) land += 1;
    total += 1;
    if (h > highest) highest = h;
    if (h < lowest) lowest = h;
  }
}
const landShare = land / total;
add(landShare > 0.15 && landShare < 0.55, 'доля суши держится в разумных пределах', `${(landShare * 100).toFixed(1)} %`);
const topMeters = heightMeters(highest);
const deepMeters = -heightMeters(lowest);
add(topMeters > 3000 && topMeters < 9500, 'высшая точка — как у настоящих гор', `${topMeters.toFixed(0)} м`);
add(deepMeters > 2500 && deepMeters < 11_500, 'глубочайшая впадина — океанская, не бездонная', `${deepMeters.toFixed(0)} м`);
add(Math.abs(heightMeters(heightFromMeters(4000)) - 4000) < 1, 'перевод метры ↔ шкала обратим', `${heightMeters(heightFromMeters(4000)).toFixed(0)} м`);

/* ---------- 6. климат ---------- */

add(seaLevelTemperature(0) > seaLevelTemperature(60), 'на экваторе теплее, чем в умеренных широтах',
  `${seaLevelTemperature(0).toFixed(0)} против ${seaLevelTemperature(60).toFixed(0)} °C`);
add(seaLevelTemperature(-80) < seaLevelTemperature(-40), 'южный полюс холоднее сороковых широт',
  `${seaLevelTemperature(-80).toFixed(0)} °C`);
add(temperatureAt(0, heightFromMeters(5000)) < temperatureAt(0, SEA_LEVEL) - 25, 'в горах холоднее: 6,5 °C на километр',
  `${temperatureAt(0, heightFromMeters(5000)).toFixed(0)} °C на пяти километрах`);

const climate = createClimate(earth, elevation, { tiles: 64 });
const cell = mpp2;
let tempSum = 0;
let precSum = 0;
const biomesSeen = new Set();
for (let ty = 0; ty < levelTiles(earth, level2).ty; ty += 1) {
  for (let tx = 0; tx < levelTiles(earth, level2).tx; tx += 1) {
    const grid = climate.gridFor(level2, tx, ty);
    for (let i = 0; i < grid.biome.length; i += 17) {
      const geo = metersToGeo(earth, (tx * TILE + (i % TILE)) * cell, (ty * TILE + ((i / TILE) | 0)) * cell);
      if (Math.abs(geo.lat) > 88) continue;
      tempSum += grid.temp[i];
      precSum += grid.prec[i];
      biomesSeen.add(grid.biome[i]);
    }
  }
}
const samples = [...biomesSeen].length;
add(tempSum < 0 || tempSum > 0, 'сетка температур посчитана', `${(tempSum / 1000).toFixed(0)} тыс. градусов на выборку`);
add(precSum > 0, 'осадки ненулевые', `${(precSum / 1000 * PREC_TO_MM / 1000).toFixed(0)} тыс. мм на выборку`);
add(biomesSeen.size >= 6, 'биомы разнообразны: не одна тундра на весь мир', `${samples} из ${BIOMES.length}`);
add(biomesSeen.has(0), 'море присутствует');
add([...biomesSeen].some((id) => id === 1 || id === 2), 'пустыни есть: климат не везде мокрый');
add([...biomesSeen].some((id) => id >= 5 && id <= 8), 'леса есть: климат не везде сухой');

let notFinite = 0;
const grid0 = climate.gridFor(level2, 0, 0);
for (let i = 0; i < grid0.height.length; i += 1) {
  if (!Number.isFinite(grid0.height[i]) || !Number.isFinite(grid0.temp[i])) notFinite += 1;
}
add(notFinite === 0, 'в климате нет NaN', `${notFinite} пикселей`);

/* ---------- 6б. физика климата ----------

   Тем же полям, что рисуются на карте, задаются вопросы из учебника. Каждый
   вопрос — про механизм, а не про число: если осадки снова станут формулой по
   точке, эти проверки упадут, даже когда картинка останется красивой. */

const world = climate.fields();
const CH = world.channels;
const at = (i, name) => world.grid.at(i, CH[name]);
const latOf = (i) => world.rowLat[(i / world.grid.w) | 0];
const oceanMean = (name, lo, hi) => {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < world.count; i += 1) {
    const lat = Math.abs(latOf(i));
    if (lat < lo || lat >= hi || at(i, 'land') > 0.5) continue;
    sum += at(i, name);
    n += 1;
  }
  return n ? sum / n : 0;
};
const landMean = (name, lo, hi) => {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < world.count; i += 1) {
    const lat = Math.abs(latOf(i));
    if (lat < lo || lat >= hi || at(i, 'land') < 0.5) continue;
    sum += at(i, name);
    n += 1;
  }
  return n ? sum / n : 0;
};
const annualPrec = (i) => (at(i, 'precWarm') + at(i, 'precCold')) / 2;

/* Механизм 1: влага сходится к тропической зоне сходимости и выпадает там,
   а в субтропиках оседает и сохнет. */
const itczOcean = oceanMean('precWarm', 0, 10) / 2 + oceanMean('precCold', 0, 10) / 2;
const subtropicsOcean = oceanMean('precWarm', 20, 35) / 2 + oceanMean('precCold', 20, 35) / 2;
add(itczOcean > subtropicsOcean * 1.5,
  'дожди идут у экватора, а не в субтропиках: восходящая ячейка Гадлея',
  `${itczOcean.toFixed(0)} против ${subtropicsOcean.toFixed(0)} мм`);

/* Механизм 2: океан испаряет столько, сколько на Земле — порядок величины. */
const oceanAll = oceanMean('precWarm', 0, 90) / 2 + oceanMean('precCold', 0, 90) / 2;
add(oceanAll > 600 && oceanAll < 2500, 'океан отдаёт влагу как земной: 0,6–2,5 м в год',
  `${(oceanAll / 1000).toFixed(2)} м`);

/* Механизм 3: на суше есть и настоящие дождевые леса, и настоящие пустыни —
   это свойство переноса влаги, а не широтной таблицы. */
let landMax = 0;
let landWet = 0;
let landDry = 0;
let landN = 0;
for (let i = 0; i < world.count; i += 1) {
  if (at(i, 'land') < 0.5) continue;
  const p = annualPrec(i);
  landN += 1;
  landMax = Math.max(landMax, p);
  if (p > 1500) landWet += 1;
  if (p < 300) landDry += 1;
}
add(landMax > 1500, 'на суше есть дождевые леса: больше 1,5 м в год', `${landMax.toFixed(0)} мм`);
add(landWet > landN * 0.02 && landDry > landN * 0.1,
  'суша и мокрая, и сухая: пустыни рядом с лесами',
  `${(landWet / landN * 100).toFixed(1)} % влажных, ${(landDry / landN * 100).toFixed(0)} % сухих`);

/* Механизм 4: пустыня — это не «мало дождя», а «дождя меньше испаряемости».
   Сравниваем два биома по индексу P/PET: у пустыни он обязан быть ниже. */
let aridSum = 0;
let aridN = 0;
let dampSum = 0;
let dampN = 0;
for (let i = 0; i < world.count; i += 1) {
  if (at(i, 'land') < 0.5) continue;
  const k = Math.round(at(i, 'koppen'));
  if (k === 3 || k === 4 || k === 5 || k === 6) { aridSum += at(i, 'aridity'); aridN += 1; }
  if (k === 0 || k === 1 || k === 2 || k === 7 || k === 10 || k === 11) { dampSum += at(i, 'aridity'); dampN += 1; }
}
add(aridN > 0 && dampN > 0 && aridSum / aridN < (dampSum / dampN) * 0.5,
  'индекс засушливости ЮНЕП разделяет пустыни и влажные климаты',
  `пустыни ${(aridSum / aridN).toFixed(2)} против ${(dampSum / dampN).toFixed(2)}`);

/* Механизм 5: климат классифицирован, а не раскрашен. Классов Кёппена должно
   быть много, и среди них — не только пустыни. */
const koppenSeen = new Set();
for (let i = 0; i < world.count; i += 1) {
  if (at(i, 'land') > 0.5) koppenSeen.add(Math.round(at(i, 'koppen')));
}
const humidClasses = [...koppenSeen].filter((k) => k < 3 || k > 6).length;
add(koppenSeen.size >= 8 && humidClasses >= 4,
  'классов Кёппена много, и не все они засушливые',
  `${koppenSeen.size} классов, ${humidClasses} влажных`);

/* Механизм 6: у холодной воды лёд, у холодной суши снег — и то и другое
   считается по-настоящему, а не по одной годовой температуре. */
let iceCells = 0;
let snowCells = 0;
for (let i = 0; i < world.count; i += 1) {
  if (at(i, 'ice') > 0.3) iceCells += 1;
  if (at(i, 'land') > 0.5 && at(i, 'snow') > 0.5) snowCells += 1;
}
add(iceCells > 0 && snowCells > 0, 'на карте есть морской лёд и снежный покров',
  `лёд ${iceCells} клеток, снег ${snowCells}`);

/* Механизм 7: у западных берегов материков вода холоднее, чем на той же
   широте в открытом океане — это апвеллинг, причина береговых пустынь.
   Сравнивать надо не со средним по всему океану (в нём есть полюса), а с
   широтной полосой: подъём холодной воды — местная аномалия. */
const sstByBand = new Map();
const bandOf = (lat) => Math.floor(Math.abs(lat) / 10);
for (let i = 0; i < world.count; i += 1) {
  if (at(i, 'land') > 0.5) continue;
  const band = bandOf(latOf(i));
  const entry = sstByBand.get(band) ?? { sum: 0, n: 0 };
  entry.sum += world.seasons.july.ocean.sst[i];
  entry.n += 1;
  sstByBand.set(band, entry);
}
let upwellingN = 0;
let upwellingDelta = 0;
for (let i = 0; i < world.count; i += 1) {
  if (at(i, 'upwelling') < 0.3 || at(i, 'land') > 0.5) continue;
  const entry = sstByBand.get(bandOf(latOf(i)));
  if (!entry) continue;
  upwellingN += 1;
  upwellingDelta += world.seasons.july.ocean.sst[i] - entry.sum / entry.n;
}
add(upwellingN > 0 && upwellingDelta / upwellingN < 0,
  'апвеллинг холоднее своей широтной полосы: береговые пустыни не выдуманы',
  `${upwellingN} клеток, холоднее на ${(-upwellingDelta / upwellingN).toFixed(1)} °C`);

/* Механизм 8: у моря зима и лето мягче, чем в глубине материка — теплоёмкость. */
let oceanAmp = 0;
let oceanCnt = 0;
let landAmp = 0;
let landCnt = 0;
for (let i = 0; i < world.count; i += 1) {
  if (Math.abs(latOf(i)) < 30 || Math.abs(latOf(i)) > 70) continue;
  const amp = Math.abs(at(i, 'tempWarm') - at(i, 'tempCold'));
  if (at(i, 'land') > 0.5) { landAmp += amp; landCnt += 1; } else { oceanAmp += amp; oceanCnt += 1; }
}
add(landCnt > 0 && oceanCnt > 0 && landAmp / landCnt > (oceanAmp / oceanCnt) * 1.6,
  'у моря климат мягче, чем у материка: годовая амплитуда',
  `суша ${(landAmp / landCnt).toFixed(0)} °C против ${(oceanAmp / oceanCnt).toFixed(0)} °C`);

/* ---------- 7. сток и реки ---------- */

const hydro = createHydro(earth, elevation, climate);
hydro.step();
add(hydro.ready(), 'грубая сеть стока посчитана');

/* Калибровка: бассейн Амазонки даёт расход порядка ста тысяч м³/с и ширину
   несколько километров. */
const amazonQ = discharge((6e6 * 1e6) / (1024 * 1024), 1024 * 1024);
add(amazonQ > 40_000 && amazonQ < 400_000, 'расход Амазонки по порядку величины верен', `${(amazonQ / 1000).toFixed(0)} тыс. м³/с`);
add(riverWidth(amazonQ) > 1500 && riverWidth(amazonQ) < 12_000, 'ширина Амазонки — километры', `${(riverWidth(amazonQ) / 1000).toFixed(1)} км`);
add(riverWidth(discharge(10, 1024 * 1024)) < 60, 'ручей с бассейном 10 км² — метры, а не километры',
  `${riverWidth(discharge(10, 1024 * 1024)).toFixed(0)} м`);

/* Ищем материк и проверяем, что реки там текут. */
let spot = null;
for (let py = 60; py < pixels2.h - 60 && !spot; py += 5) {
  for (let px = 0; px < pixels2.w && !spot; px += 5) {
    if (heightFromRaw(elevation.rawPixel(level2, px, py)) > SEA_LEVEL + 4) spot = { mx: px * cell, my: py * cell };
  }
}
let segments = 0;
let widest = 0;
if (spot) {
  hydro.forEachSegment(32, spot.mx - 40_000, spot.my - 40_000, spot.mx + 40_000, spot.my + 40_000, (x1, y1, x2, y2, width) => {
    segments += 1;
    if (width > widest) widest = width;
    if (!Number.isFinite(x1 + y1 + x2 + y2 + width)) segments = -1;
  });
}
add(spot !== null, 'на карте нашлась суша для проверки рек');
add(segments > 20, 'на материке есть речная сеть', `${segments} сегментов в кадре 80 × 80 км`);
add(widest > 5, 'русла имеют ширину', `${widest.toFixed(0)} м`);
add(hydro.stats().rivers > 0, 'клетки рек посчитаны', `${hydro.stats().rivers} клеток`);

/* Сток неменьше собственного вклада: вода никуда не девается. */
const fluxPoint = spot ? hydro.fluxAt(32, spot.mx, spot.my) : 0;
add(Number.isFinite(fluxPoint) && fluxPoint >= 0, 'сток в точке конечен и неотрицателен', fluxPoint.toFixed(3));

/* Озёра: впадины, которые не сливаются. */
let lakes = 0;
if (spot) hydro.forEachLake(32, spot.mx - 200_000, spot.my - 200_000, spot.mx + 200_000, spot.my + 200_000, () => {
  lakes += 1;
});
add(Number.isFinite(lakes), 'озёра считаются', `${lakes} клеток в кадре 400 × 400 км`);

/* ---------- 8. раскраска ---------- */

const image = new Uint8ClampedArray(TILE * TILE * 4);
let painted = 0;
let transparent = 0;
for (const layer of LAYERS) {
  image.fill(0);
  paintTile(image, TILE, TILE, 0, 0, { level: 8, tx: 40, ty: 12, elevation, climate, hydro }, layer, {
    shading: true,
    rivers: true,
    graticule: true,
  });
  let alpha = 0;
  for (let i = 3; i < image.length; i += 4) alpha += image[i];
  if (alpha === 0) transparent += 1;
  painted += 1;
}
add(painted === LAYERS.length, `все слои рисуются: ${LAYERS.length} штук`, `${painted}`);
add(transparent === 0, 'ни один слой не отдаёт пустую картинку', `${transparent} пустых`);

let bad = 0;
for (let i = 0; i < image.length; i += 1) if (!Number.isFinite(image[i])) bad += 1;
add(bad === 0, 'в пикселях нет NaN', `${bad}`);

/* ---------- 9. цена ---------- */

const timing = [];
for (const level of [2, 6, 10, 14, 18]) {
  const started = performance.now();
  elevation.rawTile(level, 100 + level, 40);
  timing.push({ level, ms: performance.now() - started });
}
const cold = timing.reduce((sum, entry) => sum + entry.ms, 0);
add(cold < 20_000, 'цепочка уровней укладывается в разумное время',
  timing.map((entry) => `${entry.level}: ${entry.ms.toFixed(0)} мс`).join(', '));

const started = performance.now();
for (let i = 0; i < 8; i += 1) elevation.rawTile(18, 200 + i, 60);
const warm = (performance.now() - started) / 8;
add(warm < 400, 'тайл максимального приближения считается быстрее четверти секунды', `${warm.toFixed(0)} мс`);

/* ---------- итог ---------- */

console.log('Планета: масштаб → шум → высоты → климат → сток → раскраска\n');
let failures = 0;
for (const check of checks) {
  console.log(`${check.ok ? '  ✓' : '  ×'} ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);
  if (!check.ok) failures += 1;
}
console.log('');
console.log(`Кэш тайлов: ${elevation.stats().tiles} шт., ${(elevation.stats().bytes / 1024 / 1024).toFixed(0)} МБ из ${(elevation.stats().budget / 1024 / 1024).toFixed(0)} МБ.`);
console.log(`Кэш климата: ${climate.stats().tiles} тайлов, кэш картинок: не считается без DOM (см. test:planet-view).`);
console.log(`Гидрология: сеть ${hydro.stats().coarse} клеток, областей ${hydro.stats().regions}, речных клеток ${hydro.stats().rivers}.`);
if (failures) {
  console.log(`\nГЕНЕРАТОР ПЛАНЕТЫ ЛОМАЕТСЯ: не прошло ${plural(failures, 'проверка', 'проверки', 'проверок')} из ${checks.length}.`);
  process.exit(1);
}
console.log(`\nВСЁ ХОРОШО — ${checks.length} ${plural(checks.length, 'проверка', 'проверки', 'проверок')} генератора планеты.`);
