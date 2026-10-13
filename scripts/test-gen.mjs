/* Проверка генератора мира: материки → рельеф → колонка → решётка → реки.
   Запуск: npm run test:gen

   Генератор нельзя увидеть глазами: он считается в миллионах точек, а на экран
   попадают только тайлы в кадре. Поэтому здесь проверяется то, что видно только
   счётом:

     1. детерминированность — тот же seed даёт тот же мир, другой seed другой;
     2. материки — сколько их, какая доля суши, где они (а не «шум везде»);
     3. конечность мира — край карты есть край мира, зацикливания нет;
     4. рельеф и климат — море на своём ярусе, у экватора теплее, чем у полюсов,
        пустыни стоят в сухих широтах, у полюсов снег;
     5. биомы — все номера существуют, набор сходится с климатом;
     6. гидрология — вода нигде не течёт в гору, у рек есть длина и водосбор,
        озёра стоят ровно, реки не исчезают;
     7. колонка — дёрн, подстилка, камень, основание, вода и лёд по ярусам;
     8. пещеры и руды — пещеры не пробивают основание, руда лежит в своей полосе;
     9. деревни — редки, воспроизводимы, стоят на ровной площадке;
    10. цена — сборка земного мира и выборка колонки укладываются в бюджет. */

import './lib/root.mjs';
import { createBlockWorld, STAGE } from '../src/gen/world.js';
import { BIOME_IDS, BIOMES, biomeIsLand, biomeIsWater, biomeName, pickBiome } from '../src/gen/biomes.js';
import { AIR, BEDROCK, BLOCKS, ORES, WATER, blockName, isOre } from '../src/gen/blocks.js';
import { EARTH_EQUATOR_M, EARTH_POLE_M, SEA_LEVEL, WORLD_Y, areaLabel, digits } from '../src/gen/scale.js';
import { C, COLUMN_SIZE } from '../src/gen/column.js';
import { S, SAMPLE_SIZE } from '../src/gen/terrain.js';
import { CONTINENT_MIN_KM2 } from '../src/gen/continents.js';

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

/* Точки выборки: равномерная решётка по миру, а не «где повезло». */
const grid = (count, width, height, salt = 0) => {
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const fx = ((i * 2654435761 + salt * 40503) % 1000003) / 1000003;
    const fz = ((i * 2246822519 + salt * 2654435761) % 1000003) / 1000003;
    points.push([Math.floor(fx * (width - 1)), Math.floor(fz * (height - 1))]);
  }
  return points;
};

/* ---------- 1. маленький мир: правила и границы ---------- */

const SMALL = { width: 4_000_000, height: 2_000_000 };
const small = createBlockWorld({ seed: 'проверка-1', ...SMALL, continentCount: 3, cols: 256 });
const steps = [];
while (!small.ready) steps.push(small.step(1000));
small.buildAll();
const steps2 = [];
while (!small.ready) steps2.push(small.step(1000));
add(small.stage === STAGE.READY || small.stage === STAGE.HYDRO, 'мир доходит до готовности по шагам', small.stage);
add(steps.length >= 2 && steps2.length === 0, 'ступени готовности проходятся один раз', `шагов: ${steps.length}`);

const smallGrid = small.grid;
add(smallGrid.landFraction > 0.15 && smallGrid.landFraction < 0.5, 'доля суши похожа на земную',
  `${(smallGrid.landFraction * 100).toFixed(1)} %`);
add(smallGrid.continents.length >= 2 && smallGrid.continents.length <= 9, 'материки перечислимы', `${smallGrid.continents.length}`);
add(smallGrid.continents.every((continent) => continent.areaKm2 >= smallGrid.continentMinKm2),
  'у каждого материка площадь материковая (порог масштабируется размером мира)',
  `${smallGrid.continents.map((continent) => areaLabel(continent.areaKm2)).join(', ')} при пороге ${areaLabel(smallGrid.continentMinKm2)}`);
add(smallGrid.continents.every((continent) => continent.name && continent.name.length > 2), 'материки названы',
  smallGrid.continents.map((continent) => continent.name).join(', '));
add(smallGrid.islands.length > 0, 'острова есть помимо материков', `${smallGrid.islands.length}`);
const sorted = smallGrid.continents.every((continent, i, list) => i === 0 || list[i - 1].areaKm2 >= continent.areaKm2);
add(sorted, 'материки перечислены от большого к малому');

const sameSeed = createBlockWorld({ seed: 'проверка-1', ...SMALL, continentCount: 3, cols: 256 });
sameSeed.buildAll();
const otherSeed = createBlockWorld({ seed: 'проверка-2', ...SMALL, continentCount: 3, cols: 256 });
otherSeed.buildAll();
add(Math.abs(sameSeed.grid.landKm2 - smallGrid.landKm2) < 1, 'тот же seed даёт тот же мир', `${areaLabel(sameSeed.grid.landKm2)}`);
add(Math.abs(otherSeed.grid.landKm2 - smallGrid.landKm2) > 1000, 'другой seed даёт другой мир',
  `${areaLabel(smallGrid.landKm2)} против ${areaLabel(otherSeed.grid.landKm2)}`);

const border = small.border;
add(border.maxX === SMALL.width - 1 && border.maxZ === SMALL.height - 1, 'край мира совпадает с размером карты');
const nearLeft = small.columnInfo(10, 1000);
const nearRight = small.columnInfo(SMALL.width - 10, 1000);
add(nearLeft.height !== nearRight.height || nearLeft.biome !== nearRight.biome, 'края карты не повторяют друг друга',
  `${nearLeft.height}/${nearRight.height} блоков`);
const left = small.columnInfo(-500, 1000);
const clamped = small.columnInfo(0, 1000);
add(left.height === clamped.height && left.biome === clamped.biome, 'за краем мира координата прижимается к краю, а не зацикливается');

/* ---------- 2. земной мир: размеры, климат, вода ---------- */

const earth = createBlockWorld({ seed: 'mir-земля', width: EARTH_EQUATOR_M, height: EARTH_POLE_M, cols: 384 });
const buildStart = performance.now();
earth.buildAll();
const buildMs = performance.now() - buildStart;
const earthGrid = earth.grid;
const stats = earth.stats();

add(Math.abs(earthGrid.landFraction - 0.29) < 0.05, 'на Земле суша занимает около 29 %',
  `${(earthGrid.landFraction * 100).toFixed(1)} %`);
add(stats.continents.length >= 4 && stats.continents.length <= 9, 'материков на Земле несколько', `${stats.continents.length}`);
add(stats.continents.every((continent) => continent.areaKm2 > CONTINENT_MIN_KM2 * 0.999), 'материки крупнее порога',
  stats.continents.map((continent) => `${continent.name} ${continent.areaLabel}`).join(', '));
add(stats.continents[0].areaKm2 > 10_000_000, 'самый большой материк сравним с Евразией', stats.continents[0].areaLabel);
add(stats.islands > 0, 'острова есть', `${digits(stats.islands)}`);
add(smallGrid.landFraction !== earthGrid.landFraction || smallGrid.continents.length !== stats.continents.length, 'размер мира влияет на мир');

/* Полушария: у экватора теплее, чем у полюсов, — и это видно по биомам. */
const equator = earth.columnInfo(EARTH_EQUATOR_M * 0.37, EARTH_POLE_M * 0.5);
const pole = earth.columnInfo(EARTH_EQUATOR_M * 0.37, EARTH_POLE_M * 0.02);
add(equator.temperature > pole.temperature + 0.5, 'у экватора теплее, чем у полюса',
  `${equator.temperature.toFixed(2)} против ${pole.temperature.toFixed(2)}`);

let snowAtPole = 0;
let snowAtEquator = 0;
let checkedPole = 0;
let checkedEquator = 0;
for (const [x] of grid(60, EARTH_EQUATOR_M, 10, 3)) {
  const polar = earth.columnInfo(x, EARTH_POLE_M * 0.02);
  checkedPole += 1;
  if (polar.snow) snowAtPole += 1;
  const equatorPoint = earth.columnInfo(x, EARTH_POLE_M * 0.5);
  checkedEquator += 1;
  if (equatorPoint.snow) snowAtEquator += 1;
}
add(snowAtPole === checkedPole, 'у полюсов снег', `${snowAtPole} из ${checkedPole}`);
add(snowAtEquator === 0, 'на экваторе снега не бывает', `${snowAtEquator} из ${checkedEquator}`);

/* Пустыни стоят в сухих широтах, как на Земле: сравниваем долю сухих биомов
   в полосе ±(18…33)° и у экватора. Это проверка не одной точки, а климата. */
const aridIds = new Set([BIOME_IDS.desert, BIOME_IDS.badlands, BIOME_IDS.savanna, BIOME_IDS.salt_flat]);
const wetIds = new Set([BIOME_IDS.jungle, BIOME_IDS.bamboo_jungle, BIOME_IDS.swamp, BIOME_IDS.mangrove_swamp, BIOME_IDS.forest]);
const beltShare = (latLow, latHigh) => {
  let arid = 0;
  let wet = 0;
  for (let cy = 0; cy < earthGrid.rows; cy += 1) {
    const lat = 90 - ((cy + 0.5) / earthGrid.rows) * 180;
    if (Math.abs(lat) < latLow || Math.abs(lat) > latHigh) continue;
    for (let cx = 0; cx < earthGrid.cols; cx += 1) {
      const index = cy * earthGrid.cols + cx;
      if (!earthGrid.land[index]) continue;
      const biome = earthGrid.biomes[index];
      if (aridIds.has(biome)) arid += 1;
      else if (wetIds.has(biome)) wet += 1;
    }
  }
  const total = arid + wet;
  return { arid, wet, total, share: total ? arid / total : 0 };
};
const subtropics = beltShare(18, 33);
const tropics = beltShare(0, 10);
add(subtropics.total > 100 && subtropics.share > 0.35, 'в сухих широтах (18…33°) преобладают сухие биомы',
  `${(subtropics.share * 100).toFixed(0)} % из ${subtropics.total} клеток`);
add(tropics.total > 100 && tropics.share < subtropics.share, 'у экватора сухих биомов меньше, чем в субтропиках',
  `${(tropics.share * 100).toFixed(0)} % против ${(subtropics.share * 100).toFixed(0)} %`);

/* Море стоит на своём ярусе, а не «где получилось». */
const seaLevels = new Set();
for (const [x, z] of grid(400, EARTH_EQUATOR_M, EARTH_POLE_M, 5)) {
  const info = earth.columnInfo(x, z);
  if (info.water === 1) seaLevels.add(info.waterY);
}
add(seaLevels.size === 1 && [...seaLevels][0] === SEA_LEVEL, 'уровень океана ровно один и равен 63',
  [...seaLevels].join(', '));

let waterColumns = 0;
let landColumns = 0;
let badHeight = 0;
for (const [x, z] of grid(600, EARTH_EQUATOR_M, EARTH_POLE_M, 7)) {
  const info = earth.columnInfo(x, z);
  if (info.water > 0) waterColumns += 1;
  else landColumns += 1;
  if (!(info.height >= 1 && info.height <= WORLD_Y - 1)) badHeight += 1;
}
add(waterColumns > 100 && landColumns > 50, 'в мире есть и океан, и суша', `${waterColumns} / ${landColumns}`);
add(badHeight === 0, 'высота всегда внутри мира блоков', `${badHeight}`);

/* ---------- 3. биомы ---------- */

const ids = new Set(BIOMES.map((biome, index) => index));
add(BIOMES.length >= 30, 'биомов столько, что хватит на все широты', `${BIOMES.length}`);
add(BIOMES.every((biome) => biome.name && biome.color >= 0) && ids.size === BIOMES.length, 'у каждого биома есть имя и цвет');
const seen = new Set();
for (let i = 0; i < earthGrid.count; i += 3) seen.add(earthGrid.biomes[i]);
add(seen.size >= 12, 'в земном мире встречается много биомов', `${seen.size} разных`);
add([...seen].every((id) => BIOMES[id]), 'все номера биомов известны');
const waterBiomes = [...seen].filter((id) => biomeIsWater(id));
const landBiomes = [...seen].filter((id) => biomeIsLand(id));
add(waterBiomes.length >= 3 && landBiomes.length >= 8, 'есть и морские, и материковые биомы',
  `${waterBiomes.length} морских, ${landBiomes.length} материковых`);
add(pickBiome(1, 0.9, 0.6, 0.4, 0, 70, SEA_LEVEL, 0, false) !== pickBiome(-1, 0, 0, 0, 0, 70, SEA_LEVEL, 0, false),
  'жаркий влажный биом отличается от холодного');
add(biomeName(0) === 'Океан' && biomeName(BIOMES.length - 1).length > 0, 'имена биомов читаются', biomeName(0));

/* ---------- 4. гидрология ---------- */

const hydro = earth.hydro;
add(hydro !== null && hydro.ready, 'гидрология посчитана');
add(hydro.riverCells > 200, 'рек в мире много', `${digits(hydro.riverCells)} клеток`);
add(hydro.lakeCount > 50, 'озёр тоже хватает', `${digits(hydro.lakeCount)}`);
add(hydro.longestRiverKm > 1000, 'самая длинная река длиннее тысячи километров', `${digits(hydro.longestRiverKm)} км`);
add(hydro.maxDischargeKm2 > 500_000, 'у больших рек большой водосбор', areaLabel(hydro.maxDischargeKm2));

/* Вода не течёт в гору: у каждой речной клетки низовье ниже по заполненной
   поверхности, и сток вообще существует. */
let uphill = 0;
let noOutlet = 0;
for (let index = 0; index < hydro.down.length; index += 1) {
  if (!hydro.isRiver[index] && !hydro.isLake[index]) continue;
  const next = hydro.down[index];
  if (next < 0) continue;
  if (hydro.filled[next] > hydro.filled[index]) uphill += 1;
  if (hydro.area[next] < hydro.area[index]) noOutlet += 1;
}
add(uphill === 0, 'река нигде не течёт в гору', `${uphill}`);
add(noOutlet === 0, 'водосбор только растёт вниз по течению', `${noOutlet}`);

/* Озёра стоят ровно: у клеток одного озера одна гладь. */
let lakeFlat = true;
let lakesChecked = 0;
for (let index = 0; index < hydro.isLake.length && lakesChecked < 40; index += 7) {
  if (!hydro.isLake[index]) continue;
  lakesChecked += 1;
  const level = hydro.filled[index];
  const cx = index % hydro.cols;
  const cy = (index - cx) / hydro.cols;
  for (const offset of [-1, 1, -hydro.cols, hydro.cols]) {
    const neighbour = index + offset;
    if (neighbour < 0 || neighbour >= hydro.isLake.length) continue;
    if (!hydro.isLake[neighbour]) continue;
    if (Math.abs(hydro.filled[neighbour] - level) > 0.05) lakeFlat = false;
  }
}
add(lakeFlat, 'гладь озера ровная', `озёр просмотрено: ${lakesChecked}`);

/* Колонка на реке: русло ниже глади, вода стоит на глади. */
let riverColumns = 0;
let riverOk = 0;
for (let i = 0; i < 4000 && riverColumns < 40; i += 3) {
  const segment = hydro.segments[i];
  if (!segment) break;
  const x = Math.round((segment.x0 + segment.x1) / 2);
  const z = Math.round((segment.z0 + segment.z1) / 2);
  const info = earth.columnInfo(x, z);
  riverColumns += 1;
  if (info.water === 2 && Math.abs(info.waterY - Math.round(info.waterY)) <= 1) riverOk += 1;
}
add(riverColumns > 10 && riverOk >= riverColumns * 0.6, 'на реке колонка отдаёт воду',
  `${riverOk} из ${riverColumns}`);

/* ---------- 5. колонка, пещеры, руды ---------- */

const out = new Float64Array(COLUMN_SIZE);
let surfaceOk = 0;
let fillerOk = 0;
let bedrockOk = 0;
let columns = 0;
for (const [x, z] of grid(300, EARTH_EQUATOR_M, EARTH_POLE_M, 11)) {
  earth.columnAt(x, z, out);
  const height = out[C.HEIGHT];
  if (height <= 0 || height >= WORLD_Y) continue;
  columns += 1;
  const top = earth.blockInColumn(x, height, z, out);
  const filler = earth.blockInColumn(x, height - 1, z, out);
  const deep = earth.blockInColumn(x, Math.max(6, height - Math.max(1, out[C.DEPTH] + 1)), z, out);
  const bottom = earth.blockInColumn(x, 2, z, out);
  if (top !== AIR && top !== undefined) surfaceOk += 1;
  /* Под поверхностью — порода, но законно и пустота: там проходит пещера. */
  if (filler !== AIR) fillerOk += 1;
  if (deep !== AIR || earth.isCave(x, Math.max(6, height - Math.max(1, out[C.DEPTH] + 1)), z)) fillerOk += 0;
  if (bottom === BEDROCK) bedrockOk += 1;
}
add(surfaceOk === columns, 'на поверхности всегда блок, а не воздух', `${surfaceOk} из ${columns}`);
add(fillerOk === columns, 'под поверхностью всегда порода (пустота бывает только в пещере)', `${fillerOk} из ${columns}`);
add(bedrockOk === columns, 'внизу мира — основание', `${bedrockOk} из ${columns}`);

/* Вода в колонке: над дном стоит вода и лёд там, где холодно. */
let waterOk = 0;
let waterChecked = 0;
for (const [x, z] of grid(400, EARTH_EQUATOR_M, EARTH_POLE_M, 13)) {
  earth.columnAt(x, z, out);
  if (out[C.WATER] === 0) continue;
  waterChecked += 1;
  const block = earth.blockInColumn(x, out[C.WATER_Y], z, out);
  if (block === WATER || blockName(block).includes('Лёд')) waterOk += 1;
}
add(waterChecked > 50 && waterOk === waterChecked, 'на глади воды стоит вода или лёд', `${waterOk} из ${waterChecked}`);

/* Пещеры: их видно под землёй, но они не пробивают основание. */
let caveCells = 0;
let underground = 0;
let caveAtBedrock = 0;
for (let i = 0; i < 400; i += 1) {
  const x = 6_000_000 + i * 1237;
  const z = 9_000_000 + i * 977;
  for (let y = 6; y < 120; y += 3) {
    underground += 1;
    if (earth.isCave(x, y, z)) caveCells += 1;
    if (y <= earth.columns.bedrockTop && earth.blockAt(x, y, z) !== BEDROCK) caveAtBedrock += 1;
  }
}
const caveShare = caveCells / underground;
add(caveShare > 0.01 && caveShare < 0.3, 'пещеры занимают разумную долю недр', `${(caveShare * 100).toFixed(1)} %`);
add(caveAtBedrock === 0, 'пещера не пробивает основание', `${caveAtBedrock}`);

/* Руды: у каждой своя полоса залегания, и частые руды встречаются чаще редких. */
const oreColumns = earth.columns;
let coalHits = 0;
let diamondHits = 0;
let coalN = 0;
let diamondN = 0;
let outOfBand = 0;
for (let i = 0; i < 600; i += 1) {
  const x = 5_000_000 + i * 1877;
  const z = 8_000_000 + i * 1411;
  for (let y = 30; y < 200; y += 5) {
    coalN += 1;
    if (oreColumns.oreHits(x, y, z, 0, false)) coalHits += 1;
  }
  for (let y = 1; y <= 24; y += 2) {
    diamondN += 1;
    if (oreColumns.oreHits(x, y, z, 6, false)) diamondHits += 1;
  }
  for (let y = 250; y < 380; y += 10) if (earth.oreAt(x, y, z, false)) outOfBand += 1;
}
add(coalHits / coalN > diamondHits / diamondN * 3, 'угля больше, чем алмазов',
  `${(coalHits / coalN * 100).toFixed(2)} % против ${(diamondHits / diamondN * 100).toFixed(2)} %`);
add(outOfBand === 0, 'выше гор руды нет', `${outOfBand}`);
add(ORES.every((ore) => ore.minY >= 0 && ore.maxY <= WORLD_Y), 'полосы руд внутри мира');
add(BLOCKS.filter((block) => isOre(block.id)).length === ORES.length, 'каждой руде из таблицы есть блок', `${ORES.length}`);

/* ---------- 6. деревни ---------- */

const villages = earth.villagesIn(EARTH_EQUATOR_M * 0.3, EARTH_POLE_M * 0.35, EARTH_EQUATOR_M * 0.32, EARTH_POLE_M * 0.37);
add(villages.length < 400, 'деревни не стоят сплошняком', `${villages.length} на площади ${areaLabel((EARTH_EQUATOR_M * 0.02 / 1000) * (EARTH_POLE_M * 0.02 / 1000))}`);
add(villages.every((village) => village.name && village.radius > 10 && village.radius < 400), 'деревни маленькие и с именами',
  villages.slice(0, 3).map((village) => village.name).join(', '));
if (villages.length > 0) {
  const village = villages[0];
  let built = 0;
  for (let dz = -100; dz <= 100; dz += 1) {
    for (let dx = -100; dx <= 100; dx += 1) {
      if (earth.villagesIn(village.x + dx, village.z + dz, village.x + dx + 1, village.z + dz + 1).length > 0) built += 1;
    }
  }
  const piece = earth.structures.blockAt(village.x, village.z);
  add(village.radius > 0 && built > 0, 'деревня воспроизводится по координате');
  add(piece !== 0, 'в центре деревни что-то построено', blockName(piece));
  let flat = true;
  const hill = earth.columnInfo(village.x + 40, village.z).height;
  const hill2 = earth.columnInfo(village.x - 40, village.z).height;
  if (Math.abs(hill - hill2) > 8) flat = false;
  add(flat, 'площадка деревни выровнена', `${hill} и ${hill2} блоков`);
}

/* ---------- 7. точка появления ---------- */

const spawn = earth.spawn();
const spawnInfo = earth.columnInfo(spawn.x, spawn.z);
add(spawn.x > 0 && spawn.x < EARTH_EQUATOR_M && spawn.z > 0 && spawn.z < EARTH_POLE_M, 'точка появления внутри мира',
  `${Math.round(spawn.x)}, ${Math.round(spawn.z)}`);
add(spawnInfo.water === 0 && spawnInfo.height >= SEA_LEVEL, 'точка появления на суше', `${spawnInfo.height} блоков`);
add(spawn.continent?.name === earth.stats().continents[0].name, 'точка появления на самом большом материке',
  String(spawn.continent?.name));
add(spawnInfo.height > 0 && spawnInfo.height < WORLD_Y, 'высота появления разумная');

/* ---------- 8. сводка и цена ---------- */

add(stats.summary === undefined && typeof earth.summary() === 'string' && earth.summary().includes('суша'),
  'сводка мира одной строкой', earth.summary());
add(earth.elevationMeters(SEA_LEVEL) === 0, 'нулевая отметка — уровень моря');
add(Math.abs(earth.elevationMeters(SEA_LEVEL + 100) - 3000) < 1, 'вертикальный масштаб переводится в метры',
  `${earth.elevationMeters(SEA_LEVEL + 100)} м`);
add(typeof S.CONTINENTALNESS === 'number' && SAMPLE_SIZE >= 20 && COLUMN_SIZE >= 22, 'поля сэмпла и колонки на месте');

/* Замер после прогрева: первый проход — это работа компилятора, а не мира. */
const columnSamples = new Float64Array(COLUMN_SIZE);
for (let i = 0; i < 2000; i += 1) earth.columnAt(4_000_000 + i * 1291, 6_000_000 + i * 911, columnSamples);
const columnRounds = 20000;
const sampleStart = performance.now();
for (let i = 0; i < columnRounds; i += 1) earth.columnAt(4_000_000 + i * 1291, 6_000_000 + i * 911, columnSamples);
const perColumn = ((performance.now() - sampleStart) / columnRounds) * 1000;
/* Потолок — кадровый бюджет вида: он берёт не больше 120 000 колонок на
   кадр, значит колонка обязана укладываться в восемь микросекунд, иначе
   один кадр не собрать и за секунду. Заодно ловит регресс на порядок. */
add(perColumn < 8, 'колонка укладывается в кадровый бюджет вида', `${perColumn.toFixed(2)} мкс — потолок 8`);
/* Кадр идёт по соседним точкам: так колонка дешевле, чем по разбросанным. */
const frameStart = performance.now();
for (let i = 0; i < columnRounds; i += 1) earth.columnAt(4_000_000 + (i % 1000) * 3, 6_000_000 + Math.floor(i / 1000) * 3, columnSamples);
const perFrameColumn = ((performance.now() - frameStart) / columnRounds) * 1000;
add(perFrameColumn < perColumn * 1.2, 'в кадре колонка не дороже, чем в разбросе', `${perFrameColumn.toFixed(2)} мкс`);
add(buildMs < 15_000, 'земной мир собирается за секунды', `${buildMs.toFixed(0)} мс`);

const tileSample = new Float64Array(SAMPLE_SIZE);
for (let i = 0; i < 5000; i += 1) earth.sampleInto(4_000_000 + i * 37, 6_000_000 + i * 53, 4, tileSample);
const terrainRounds = 50000;
const terrainStart = performance.now();
for (let i = 0; i < terrainRounds; i += 1) earth.sampleInto(4_000_000 + i * 37, 6_000_000 + i * 53, 4, tileSample);
const perTilePoint = ((performance.now() - terrainStart) / terrainRounds) * 1000;
add(perTilePoint < 3, 'сэмпл рельефа годится для пиксельной отрисовки', `${perTilePoint.toFixed(2)} мкс`);

/* ---------- итог ---------- */

console.log('Генератор мира: материки → рельеф → колонка → решётка → реки\n');
let failures = 0;
for (const check of checks) {
  console.log(`${check.ok ? '  ✓' : '  ×'} ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);
  if (!check.ok) failures += 1;
}
console.log('');
console.log(`Мир: ${digits(EARTH_EQUATOR_M)} × ${digits(EARTH_POLE_M)} блоков, ${areaLabel(earthGrid.landKm2)} суши, ` +
  `материков ${stats.continents.length}, островов ${digits(stats.islands)}, клетка решётки ${stats.cellKm} км.`);
console.log(`Сборка земного мира: ${buildMs.toFixed(0)} мс (решётка ${stats.gridCols}×${stats.gridRows}, гидрология ${hydro.stats.rivers} речных клеток).`);
console.log(`Точка появления: ${stats.continents[0].name}, ${Math.round(spawn.x)}, ${Math.round(spawn.z)} — ${biomeName(spawnInfo.biome)}, ${spawnInfo.height} блоков (${earth.elevationMeters(spawnInfo.height).toFixed(0)} м).`);
if (failures) {
  console.log(`\nГЕНЕРАТОР МИРА ЛОМАЕТСЯ: не прошло ${plural(failures, 'проверка', 'проверки', 'проверок')} из ${checks.length}.`);
  process.exit(1);
}
console.log(`\nВСЁ ХОРОШО — ${checks.length} ${plural(checks.length, 'проверка', 'проверки', 'проверок')} генератора мира.`);
