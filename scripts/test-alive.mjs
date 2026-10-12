/* Живой мир: время, погода, огни, вулканы, сияние и дрейф. Запуск: npm run test:alive

   Зачем отдельная проверка. `test:planet` отвечает на вопрос «правильный ли
   получился мир», а здесь проверяется другое: правильно ли он живёт. Ошибки
   такого рода не видны ни в одной картинке:

     • Солнце, посчитанное по чужой формуле, даёт правдоподобные сумерки — но
       не даёт полярного дня и полярной ночи.
     • Погода, у которой нет ни переноса, ни релаксации к климатологии, стоит
       на месте или разъезжается в «всё покрыто облаками».
     • Огни горят и днём, если ночную сторону никто не считает.
     • Дрейф, переносящий поле шагами, размазывает материк в пятно за
       несколько миллионов лет — и это видно только на длинном сроке.
     • Вихри не зарождаются вовсе, если полоса зарождения не совпала с тёплой
       водой: в кадре всё тихо, и никто не замечает.

   Поэтому здесь и числа астрономии, и длинные прогоны, и поведение вихрей.
   Мир один на всю проверку: построение занимает несколько секунд, и это
   нормально — проверка идёт минуту, а не кадр. */

import './lib/root.mjs';
import { createPlanet, geoToMeters, metersToGeo } from '../src/planet/scale.js';
import { createElevation } from '../src/planet/elevation.js';
import { createClimate } from '../src/planet/climate.js';
import { createHydro } from '../src/planet/hydro.js';
import {
  CLOCK_MODES, DAYS_PER_YEAR, RAIN_CAP, WARM_POOL_QUANTILE, clockModeById, createAurora, createClock,
  createDrift, createFlowField, createLivingWorld, createSeasonFields, dateLabel, dayLengthHours,
  hourLabel, julyWeight, seasonMix, solarDeclination, sunAt, windSpeedAt,
} from '../src/planet/alive.js';
import { ALIVE_LAYERS } from '../src/planet/alive-paint.js';

const plural = (n, one, few, many) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const checks = [];
const add = (ok, what, detail = '') => checks.push({ ok: Boolean(ok), what, detail });

/* ---------- 1. Солнце ---------- */

const earth = createPlanet({ seed: 'живой-мир', size: 1 });
const june = solarDeclination(172);
const december = solarDeclination(355);
add(Math.abs(june - 23.44) < 0.4 && Math.abs(december + 23.44) < 0.4,
  'склонение Солнца доходит до наклона оси и обратно',
  `${june.toFixed(2)}° в июне, ${december.toFixed(2)}° в декабре`);

const noon = sunAt(earth, earth.widthM / 2, earth.heightM / 2, { day: 172, hour: 12 });
add(Math.abs(noon.altitude - 66.6) < 1,
  'полдень на экваторе в июне: Солнце на высоте 90° − наклон',
  `${noon.altitude.toFixed(1)}°`);
add(Math.abs(dayLengthHours(0, june) - 12) < 0.2, 'на экваторе день круглый год 12 часов',
  `${dayLengthHours(0, june).toFixed(2)} ч`);
add(dayLengthHours(80, june) === 24 && dayLengthHours(80, december) === 0,
  'за полярным кругом есть полярный день и полярная ночь',
  `21 июня ${dayLengthHours(80, june)} ч, 21 декабря ${dayLengthHours(80, december)} ч`);
add(dayLengthHours(-35, december) > dayLengthHours(35, december),
  'в декабре южное полушарие греется сильнее северного',
  `${dayLengthHours(-35, december).toFixed(1)} ч против ${dayLengthHours(35, december).toFixed(1)} ч`);

/* Полдень местный: в 12:00 по Гринвичу Солнце выше всего на нулевом меридиане. */
const heights = [0, 6, 12, 18].map((hour) => sunAt(earth, earth.widthM / 2, earth.heightM / 2, { day: 172, hour }).altitude);
add(heights[2] === Math.max(...heights), 'в полдень Солнце выше, чем утром и вечером', heights.map((v) => v.toFixed(0)).join('° / ') + '°');
const west = sunAt(earth, 0, earth.heightM / 2, { day: 172, hour: 12 });
add(west.altitude < -60, 'на антиподе полдня — глубокая ночь', `${west.altitude.toFixed(0)}°`);
add(noon.daylight > 0.9 && west.night > 0.9, 'день и ночь в кадре различимы', `день ${noon.daylight.toFixed(2)}, ночь ${west.night.toFixed(2)}`);

/* ---------- 2. Часы ---------- */

const dayClock = createClock({ mode: 'day' });
for (let i = 0; i < 3; i += 1) dayClock.tick(0.1);
add(dayClock.dayOfYear() === 172 && Math.abs(dayClock.hour - 12.6) < 0.05,
  'в «сутках» идёт час, а день года стоит',
  `${hourLabel(dayClock.hour)} за 0,3 с`);
const yearClock = createClock({ mode: 'year' });
const startDay = yearClock.dayOfYear();
const startAbsolute = yearClock.day;
for (let i = 0; i < 240; i += 1) yearClock.tick(0.1);
/* За 24 секунды проходит ровно год: день года возвращается к началу, а
   абсолютный счётчик дней прибавляет 365,24. */
add(Math.abs(yearClock.day - startAbsolute - DAYS_PER_YEAR) < 1
  && Math.abs(yearClock.dayOfYear() - startDay) < 1
  && yearClock.hour === 12,
  'в «году» за 24 секунды проходит ровно год',
  `+${(yearClock.day - startAbsolute).toFixed(1)} суток, час ${hourLabel(yearClock.hour)}`);

const epochClock = createClock({ mode: 'epoch', day: 172, hour: 12 });
epochClock.tick(8);
add(Math.abs(epochClock.ma - 1) < 1e-6 && epochClock.dayOfYear() === 172 && epochClock.hour === 12,
  'в «эпохе» идут миллионы лет, а сутки стоят', `${epochClock.ma.toFixed(2)} млн лет`);

const paused = createClock({ mode: 'day' });
paused.running = false;
paused.tick(10);
add(paused.hour === 12 && paused.day === 172, 'на паузе время стоит');

add(dateLabel(1) === '1 января' && dateLabel(172) === '21 июня' && hourLabel(3.5) === '03:30',
  'подписи даты и часа читаются человеком', `${dateLabel(172)}, ${hourLabel(3.5)}`);
add(CLOCK_MODES.length === 3 && clockModeById('нет такого').id === 'day',
  'режимов времени три, незнакомый сводится к суткам');

/* ---------- 3. Мир ---------- */

const started = performance.now();
const elevation = createElevation(earth, { bytes: 96 * 1024 * 1024 });
const climate = createClimate(earth, elevation, { tiles: 64 });
const hydro = createHydro(earth, elevation, climate);
const clock = createClock({ mode: 'day' });
const living = createLivingWorld({ planet: earth, elevation, climate, hydro, seed: 'живой-мир', clock });
const seasonFields = createSeasonFields({ climate });
add(performance.now() - started < 30_000, 'мир строится за считанные секунды',
  `${((performance.now() - started) / 1000).toFixed(1)} с`);

/* ---------- 4. Климатология: где облачно, а где ясно ---------- */

const sampleBand = (latFrom, latTo, count = 400) => {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < count; i += 1) {
    const lon = (i / count) * 360 - 180;
    const lat = latFrom + (i % 7) / 6 * (latTo - latFrom);
    const { x, y } = geoToMeters(earth, lon, lat);
    sum += living.weather.cloudAt(x, y);
    n += 1;
  }
  return sum / n;
};
const wet = sampleBand(0, 8);
const dry = sampleBand(20, 30);
add(wet > dry + 0.05, 'облаков больше в экваториальной зоне, чем в широтах пустынь',
  `${wet.toFixed(2)} против ${dry.toFixed(2)}`);
const weatherNow = living.weather.stats();
add(weatherNow.cover > 0.15 && weatherNow.cover < 0.8, 'облачность — это облака, а не «всё небо» и не «чистое небо»',
  `средняя ${weatherNow.cover.toFixed(2)}`);

/* Суточный ход конвекции: над тропической сушей после полудня облаков больше,
   чем в те же часы над океаном. Проверяется по форсирующему полю погоды: это
   то, к чему поле облачности подтягивается, и оно не зависит от того, успел ли
   перенос дойти до места. */
const tropicalCloud = (hour) => {
  let land = 0;
  let sea = 0;
  let landN = 0;
  let seaN = 0;
  for (let i = 0; i < 600; i += 1) {
    const lon = (i / 600) * 360 - 180;
    const lat = -20 + (i % 11) * 4;
    const { x, y } = geoToMeters(earth, lon, lat);
    const local = ((hour + lon / 15) % 24 + 24) % 24;
    /* Смотрим только на сушу и только в те часы, когда разница должна быть
       видна: 15:00 — пик конвекции, 03:00 — её минимум. */
    if (local < 14 || local > 16) {
      if (!(local < 2 || local > 4)) continue;
    }
    if (climate.landAt(x, y) > 0.6) {
      land += living.weather.fields().cloud[climate.fields().grid.cellOf(x, y)];
      landN += 1;
    } else {
      sea += living.weather.fields().cloud[climate.fields().grid.cellOf(x, y)];
      seaN += 1;
    }
  }
  return { land: landN ? land / landN : 0, sea: seaN ? sea / seaN : 0, landN, seaN };
};
const afternoonCloud = tropicalCloud(15 + 12);
const nightCloud = tropicalCloud(3 + 12);
add(afternoonCloud.landN > 0 && nightCloud.landN > 0, 'на карте нашлась тропическая суша для проверки суточного хода',
  `${afternoonCloud.landN} точек после полудня, ${nightCloud.landN} ночью`);
add(afternoonCloud.land - nightCloud.land > 0.001 || afternoonCloud.land > nightCloud.land,
  'над тропической сушей после полудня облаков больше, чем ночью',
  `${afternoonCloud.land.toFixed(2)} в 15:00 против ${nightCloud.land.toFixed(2)} в 03:00`);

/* ---------- 5. Погода в движении ---------- */

const before = Float32Array.from(living.weather.cloud);
for (let i = 0; i < 24; i += 1) living.weather.step(1);
let changed = 0;
let maxJump = 0;
for (let i = 0; i < before.length; i += 1) {
  const delta = Math.abs(living.weather.cloud[i] - before[i]);
  if (delta > 0.001) changed += 1;
  if (delta > maxJump) maxJump = delta;
}
add(changed > before.length * 0.2, 'за сутки погода успевает измениться',
  `${((changed / before.length) * 100).toFixed(0)} % клеток, максимум ${maxJump.toFixed(2)}`);
add(maxJump < 0.95, 'погода меняется, а не срывается: за час поле не переворачивается',
  `максимум ${maxJump.toFixed(2)} за час`);

/* ---------- 6. Вихри: рождаются, живут и не выходят из мира ---------- */

let hurricanes = 0;
let cyclones = 0;
let outside = 0;
for (let i = 0; i < 900; i += 1) {
  living.weather.step(1);
  for (const system of living.weather.systems) {
    if (system.kind === 'hurricane') hurricanes += 1;
    else cyclones += 1;
    const { lat } = metersToGeo(earth, system.x, system.y);
    if (Math.abs(lat) > 88 || system.x < -earth.widthM || system.x > earth.widthM * 2) outside += 1;
  }
}
const spawned = living.weather.stats().spawned;
add(spawned.cyclones > 0 && spawned.hurricanes > 0, 'за год модельной погоды рождаются и циклоны, и ураганы',
  `циклонов ${spawned.cyclones}, ураганов ${spawned.hurricanes}`);
add(cyclones > 0 && hurricanes > 0, 'вихри не только рождаются, но и живут в кадре',
  `циклоно-часов ${cyclones}, урагано-часов ${hurricanes}`);
add(outside === 0, 'вихри не уходят за пределы мира', `${outside} выходов`);
add(living.weather.stats().warmPoolSst > 20 && living.weather.stats().warmPoolSst < 28,
  'порог зарождения урагана взят у тёплой воды этого мира',
  `${living.weather.stats().warmPoolSst.toFixed(2)} °C при кванте ${WARM_POOL_QUANTILE}`);
add(windSpeedAt(45) > windSpeedAt(5) && windSpeedAt(45) > windSpeedAt(75),
  'скорость ветра в западных ветрах выше, чем в пассатах и у полюса',
  `${windSpeedAt(5).toFixed(1)} / ${windSpeedAt(45).toFixed(1)} / ${windSpeedAt(75).toFixed(1)} м/с`);

/* Осадки: неотрицательны, ограничены сверху и идут там, где небо закрыто. */
let wetCells = 0;
let maxRain = 0;
let rainAboveCloud = 0;
for (let i = 0; i < 4000; i += 1) {
  const lon = (i / 4000) * 360 - 180;
  const lat = -80 + (i % 53) * 3;
  const { x, y } = geoToMeters(earth, lon, lat);
  const rain = living.weather.rainAt(x, y);
  if (rain > 0.2) {
    wetCells += 1;
    if (living.weather.cloudAt(x, y) < 0.3) rainAboveCloud += 1;
  }
  if (rain > maxRain) maxRain = rain;
}
add(maxRain <= RAIN_CAP * 2, 'ливень не превращается в потоп', `максимум ${maxRain.toFixed(1)} мм/ч`);
add(wetCells > 0, 'дождь где-то идёт', `${wetCells} точек из 4000`);
add(rainAboveCloud < wetCells * 0.1, 'дождь идёт из облаков, а не из чистого неба',
  `${rainAboveCloud} случаев из ${wetCells} (${((rainAboveCloud / wetCells) * 100).toFixed(1)} %)`);

/* ---------- 7. Сезонные поля: снег и лёд ходят за Солнцем ---------- */

const snowPoint = geoToMeters(earth, 30, 62);
const julySnow = seasonFields.snowAt(snowPoint.x, snowPoint.y, 1);
const januarySnow = seasonFields.snowAt(snowPoint.x, snowPoint.y, 0);
add(januarySnow > julySnow + 0.2, 'на 62° с. ш. зимой снег, летом его нет',
  `${julySnow.toFixed(2)} в июле против ${januarySnow.toFixed(2)} в январе`);
let iceWinter = 0;
let iceSummer = 0;
let iceEdgeWinter = 0;
let iceEdgeSummer = 0;
let iceTropical = 0;
let iceSamples = 0;
let edgeSamples = 0;
for (let i = 0; i < 900; i += 1) {
  const lon = (i / 900) * 360 - 180;
  const lat = 68 + (i % 13) * 1.4;
  const { x, y } = geoToMeters(earth, lon, lat);
  if (climate.landAt(x, y) > 0.3) continue;
  iceSamples += 1;
  iceWinter = Math.max(iceWinter, seasonFields.iceAt(x, y, 0));
  iceSummer = Math.max(iceSummer, seasonFields.iceAt(x, y, 1));
}
/* Край льда: там, где зимой лёд есть, а летом его нет, граница видна глазом. */
for (let i = 0; i < 1200; i += 1) {
  const lon = (i / 1200) * 360 - 180;
  const lat = 58 + (i % 17) * 0.6;
  const { x, y } = geoToMeters(earth, lon, lat);
  if (climate.landAt(x, y) > 0.3) continue;
  edgeSamples += 1;
  iceEdgeWinter += seasonFields.iceAt(x, y, 0);
  iceEdgeSummer += seasonFields.iceAt(x, y, 1);
}
for (let i = 0; i < 200; i += 1) {
  const { x, y } = geoToMeters(earth, (i / 200) * 360 - 180, (i % 9) - 4);
  iceTropical = Math.max(iceTropical, seasonFields.iceAt(x, y, 0.5));
}
add(iceSamples > 0 && iceWinter > 0.5, 'в полярных морях зимой стоит лёд',
  `${iceSamples} морских точек, максимум ${iceWinter.toFixed(2)}`);
add(iceEdgeWinter > iceEdgeSummer && iceTropical < 0.02, 'у льда есть край: зимой он спускается южнее, а в тропиках льда нет вовсе',
  `на 58–68° зимой ${(iceEdgeWinter / Math.max(edgeSamples, 1)).toFixed(3)}, летом ${(iceEdgeSummer / Math.max(edgeSamples, 1)).toFixed(3)}`);

/* ---------- 8. Огни ---------- */

const lights = living.lights;
let onLand = 0;
let suitabilityUnder = 0;
let suitabilityAll = 0;
for (const point of lights.points) {
  const land = climate.landAt(point.x, point.y);
  if (land > 0.5) onLand += 1;
  suitabilityUnder += land;
}
let landCells = 0;
for (let gy = 0; gy < 40; gy += 1) {
  for (let gx = 0; gx < 60; gx += 1) {
    const x = ((gx + 0.5) / 60) * earth.widthM;
    const y = ((gy + 0.5) / 40) * earth.heightM;
    if (climate.landAt(x, y) > 0.5) landCells += 1;
    suitabilityAll += lights.at(x, y);
  }
}
add(onLand > lights.points.length * 0.9, 'огни стоят на суше', `${onLand} из ${lights.points.length}`);
add(suitabilityUnder / lights.points.length > suitabilityAll / 2400,
  'огни собираются там, где жить лучше, чем в среднем по мире',
  `${(suitabilityUnder / lights.points.length).toFixed(3)} против ${(suitabilityAll / 2400).toFixed(3)}`);
add(landCells > 0 && landCells < 2400, 'на карте есть и суша, и море', `${landCells} клеток суши из 2400`);

/* Огни горят на ночной стороне и гаснут на дневной. Половина планеты в любой
   момент ночная — это нормально; проверяется не сколько горит, а где. */
const noonClock = { day: 172, hour: 12 };
let litInDay = 0;
let darkAtNight = 0;
let litAtNight = 0;
let dayPoints = 0;
let nightPoints = 0;
for (const point of lights.points) {
  const sun = sunAt(earth, point.x, point.y, noonClock);
  if (sun.altitude > 6) {
    dayPoints += 1;
    if (sun.lights > 0.02) litInDay += 1;
  } else if (sun.altitude < -6) {
    nightPoints += 1;
    if (sun.lights > 0.9) litAtNight += 1;
    else darkAtNight += 1;
  }
}
add(dayPoints > 100 && litInDay === 0, 'днём огни не горят',
  `${litInDay} из ${dayPoints} дневных точек`);
add(nightPoints > 100 && darkAtNight === 0, 'ночью горят все города, какие есть',
  `${litAtNight} из ${nightPoints} ночных точек`);

/* ---------- 9. Сияние ---------- */

const aurora = createAurora({ seed: 'живой-мир' });
const auroraSun = { night: 1, daylight: 0, twilight: 0 };
const glowAt = (lat) => aurora.at(geoToMeters(earth, 0, lat).x, geoToMeters(earth, 0, lat).y, earth, auroraSun);
const oval = glowAt(67);
const equator = glowAt(0);
const midLat = glowAt(48);
add(oval > 0.3 && oval > midLat * 2 && equator < 0.02,
  'сияние светит в авроральном овале, а не по всей планете',
  `на 67° ${oval.toFixed(2)}, на 48° ${midLat.toFixed(2)}, на экваторе ${equator.toFixed(2)}`);
const daySun = { night: 0, daylight: 1, twilight: 0 };
const dayGlow = aurora.at(geoToMeters(earth, 0, 67).x, geoToMeters(earth, 0, 67).y, earth, daySun);
add(dayGlow < oval * 0.3, 'днём сияния не видно', `${dayGlow.toFixed(2)} против ${oval.toFixed(2)}`);

/* ---------- 10. Вулканы ---------- */

const sites = living.volcanoes.sites;
add(sites.length > 8, 'тектоника нашла места для вулканов', `${sites.length} вулканов`);
let onLandSites = 0;
let tooClose = 0;
let erupting = 0;
let smoking = 0;
for (let i = 0; i < sites.length; i += 1) {
  if (climate.landAt(sites[i].x, sites[i].y) > 0.5) onLandSites += 1;
  for (let j = i + 1; j < sites.length; j += 1) {
    if (Math.hypot(sites[i].x - sites[j].x, sites[i].y - sites[j].y) < 150_000) tooClose += 1;
  }
  let max = 0;
  let sum = 0;
  for (let second = 0; second < 600; second += 3) {
    const value = living.volcanoes.intensityAt(sites[i], second);
    max = Math.max(max, value);
    sum += value;
  }
  if (max > 0.5) erupting += 1;
  if (sum / 200 > 0.05) smoking += 1;
}
add(onLandSites > sites.length * 0.9, 'вулканы стоят на суше', `${onLandSites} из ${sites.length}`);
add(tooClose === 0, 'вулканы не липнут друг к другу', `${tooClose} пар ближе 150 км`);
add(erupting > sites.length * 0.5, 'большинство вулканов за десять минут успевает извергнуться',
  `${erupting} из ${sites.length}`);
add(smoking === sites.length, 'между извержениями вулкан курится, а не исчезает',
  `${smoking} из ${sites.length}`);

/* ---------- 11. Частицы ---------- */

const flow = createFlowField({ count: 200, seed: 5 });
const span = { minX: 0, minY: 0, maxX: earth.widthM, maxY: earth.heightM, mpp: 40_000 };
flow.setView(span);
const windStart = { x: flow.x[0], y: flow.y[0] };
for (let i = 0; i < 60; i += 1) flow.step(1 / 60, living.windAt);
add(Math.hypot(flow.x[0] - windStart.x, flow.y[0] - windStart.y) > 1000,
  'частица ветра сдвинулась за секунду работы', `${(Math.hypot(flow.x[0] - windStart.x, flow.y[0] - windStart.y) / 1000).toFixed(0)} км`);
let insideView = 0;
for (let i = 0; i < flow.count; i += 1) {
  const inside = flow.x[i] > span.minX - 1 && flow.x[i] < span.maxX + 1 && flow.y[i] > span.minY - 1 && flow.y[i] < span.maxY + 1;
  if (inside) insideView += 1;
}
add(insideView > flow.count * 0.8, 'частицы остаются в кадре', `${insideView} из ${flow.count}`);

/* Реки: частицы идут по руслам, а не по прямой. */
const riverView = { minX: earth.widthM * 0.25, minY: earth.heightM * 0.3, maxX: earth.widthM * 0.35, maxY: earth.heightM * 0.45, mpp: 3000 };
hydro.forEachSegment(riverView.mpp, riverView.minX, riverView.minY, riverView.maxX, riverView.maxY, () => {});
living.setView(riverView);
const riverStats = living.particles.rivers.stats();
add(riverStats.nodes > 0 && riverStats.chains > 0, 'речные частицы идут по сшитым руслам',
  `${riverStats.nodes} звеньев, ${riverStats.chains} русел`);

/* ---------- 12. Дрейф плит ---------- */

const drift = createDrift({ planet: earth, elevation });
add(drift.stats().meanSpeedMmYear > 5 && drift.stats().meanSpeedMmYear < 250,
  'скорость плит — сантиметры в год, как у настоящих',
  `${drift.stats().meanSpeedMmYear.toFixed(0)} мм/год`);
const coastStart = drift.coast().length / 4;
const heightAtStart = drift.heightAt(earth.widthM / 2, earth.heightM / 2);
drift.advance(20);
const coastLater = drift.coast().length / 4;
add(coastLater > coastStart * 0.5, 'за 20 млн лет берег не расплывается в пятно',
  `${coastStart} → ${coastLater} отрезков`);
let coastlineShift = 0;
let samples = 0;
for (let i = 0; i < 300; i += 1) {
  const x = (i / 300) * earth.widthM;
  const y = earth.heightM * 0.3;
  const before_ = elevation.heightMetersAt(10, x, y);
  const now = drift.heightAt(x, y);
  /* Высоты сравниваются там, где обе стороны «одинаково высоки»: у берега
     разница ожидаема. Здесь проверяется, что поле не выродилось в одно число. */
  if (Math.abs(before_) > 500) {
    coastlineShift += Math.abs(now - before_) > 1 ? 1 : 0;
    samples += 1;
  }
}
add(samples > 20 && coastlineShift > samples * 0.5, 'материк уехал: рельеф в точках изменился',
  `${coastlineShift} из ${samples} точек`);
/* Поворот сохраняет площадь: доля суши обязана остаться той же. Это и есть
   проверка того, что перенос не «съел» ни материк, ни океан. */
const landShareOf = (sample) => {
  let land = 0;
  let total = 0;
  for (let gy = 0; gy < 40; gy += 1) {
    for (let gx = 0; gx < 60; gx += 1) {
      const x = ((gx + 0.5) / 60) * earth.widthM;
      const y = ((gy + 0.5) / 40) * earth.heightM;
      if (sample(x, y) > 20) land += 1;
      total += 1;
    }
  }
  return land / total;
};
const shareBefore = landShareOf((x, y) => elevation.terrainFields().erosion.grid.sample1(x, y, 0));
const shareAfter = landShareOf((x, y) => drift.heightAt(x, y));
add(Math.abs(shareAfter - shareBefore) < 0.08, 'поворот плит сохраняет долю суши',
  `${(shareBefore * 100).toFixed(1)} % до, ${(shareAfter * 100).toFixed(1)} % после`);
add(coastLater > 3000 && coastLater < coastStart * 2, 'берег после дрейфа — это берег, а не шум',
  `${coastLater} отрезков`);
drift.reset();
add(drift.ma() === 0 && drift.coast().length / 4 === coastStart,
  'эпоха начинается заново с исходного мира',
  `${drift.ma().toFixed(2)} млн лет, ${drift.coast().length / 4} отрезков (было ${coastStart})`);

/* ---------- 13. Бюджет кадра ---------- */

const budgetClock = createClock({ mode: 'year' });
living.clock.setMode('year');
const frameTimes = [];
for (let i = 0; i < 120; i += 1) {
  budgetClock.tick(1 / 60);
  clock.tick(1 / 60);
  const frameStart = performance.now();
  living.advance(1 / 60);
  living.work(6);
  frameTimes.push(performance.now() - frameStart);
}
frameTimes.sort((a, b) => a - b);
const median = frameTimes[Math.floor(frameTimes.length / 2)];
const worst = frameTimes[frameTimes.length - 1];
add(median < 6.5, 'год живёт в кадре: медиана в пределах бюджета', `${median.toFixed(2)} мс`);
add(worst < 25, 'даже худший кадр не замирает', `${worst.toFixed(2)} мс`);

/* ---------- 14. Слои анимации ---------- */

add(ALIVE_LAYERS.length >= 8 && new Set(ALIVE_LAYERS.map((layer) => layer.id)).size === ALIVE_LAYERS.length,
  'у каждого слоя анимации своё имя и подсказка',
  `${ALIVE_LAYERS.length} слоёв: ${ALIVE_LAYERS.map((layer) => layer.name).join(', ')}`);

/* ---------- итог ---------- */

console.log('Живой мир: солнце → часы → погода → вихри → огни → вулканы → дрейф\n');
let failures = 0;
for (const check of checks) {
  console.log(`${check.ok ? '  ✓' : '  ×'} ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);
  if (!check.ok) failures += 1;
}
const weatherStats = living.weather.stats();
console.log('');
console.log(`Погода: ${weatherStats.systems} вихрей (ураганов ${weatherStats.hurricanes}), `
  + `облачность ${weatherStats.cover.toFixed(2)}, дождь ${weatherStats.rain.toFixed(2)} мм/ч, `
  + `в работе ${weatherStats.queuedHours.toFixed(1)} ч.`);
console.log(`Планета: ${living.lights.points.length} поселений, ${sites.length} вулканов, `
  + `плиты едут ${drift.stats().meanSpeedMmYear.toFixed(0)} мм/год, берег ${drift.stats().segments} отрезков.`);
if (failures) {
  console.log(`\nЖИВОЙ МИР ЛОМАЕТСЯ: не прошло ${plural(failures, 'проверка', 'проверки', 'проверок')} из ${checks.length}.`);
  process.exit(1);
}
console.log(`\nВСЁ ХОРОШО — ${checks.length} ${plural(checks.length, 'проверка', 'проверки', 'проверок')} живого мира.`);
