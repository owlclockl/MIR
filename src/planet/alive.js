/* Живой мир: время, погода, огни, вулканы, полярное сияние и дрейф плит.

   Что это. Генератор планет считает статичные поля: рельеф, климат, реки.
   Мир получается похожим на Землю, но неподвижным — как глобус в витрине.
   Этот модуль его оживляет: над картой идёт время (сутки, год, эпоха), по ней
   едут облака и циклоны, на ночной стороне загораются города, у берегов
   расходятся течения, а материки плывут на миллионы лет вперёд вместе с
   плитами.

   У каждого явления есть имя в науке о Земле и свои единицы измерения.

     • Часы. Мир живёт в трёх масштабах времени, и в каждом движется ровно
       одна переменная: сутки — час (терминатор ползёт по карте), год — день
       года (снег, лёд, муссоны, штормовые пути), эпоха — миллионы лет (дрейф
       плит). Так сделано нарочно: если двигать всё сразу, в кадре мельтешение,
       в котором не разглядеть ни одного явления.
     • Солнце. Склонение δ = −23,44°·cos(2π(N+10)/365,24) — приближение
       Купера, ошибка меньше 0,5°; часовой угол H = 15°(t−12) + λ; высота
       sin h = sin φ·sin δ + cos φ·cos δ·cos H. Длина дня — из условия
       cos H = −tg φ·tg δ: за полярным кругом она даёт ровно 24 или 0.
     • Погода. Перенос по той же грубой решётке, что и климат:
       ∂C/∂t + v·∇C = (C₀ − C)/τ − P, где C₀ — климатологическая облачность
       сезона плюс суточная конвекция над тёплой сушей, τ = 18 ч (время жизни
       облачного поля), P — выпадение осадков. Считается полулагранжевым
       переносом по строкам — тем же методом и с теми же константами, что
       влага в precip.js: это одно и то же явление, и расходиться им незачем.
     • Вихри. Циклоны в штормовом поясе (40…68°, зимой на 6° ближе к
       экватору — штормовые пути ходят за Солнцем) и тропические ураганы там,
       где вода теплее 26,5 °C: на Земле это единственное место, где воздух
       набирает столько тепла, что вихрь не гаснет. Едут они преобладающим
       ветром: пассат несёт ураган на запад, западные ветры — на восток.
     • Огни. На ночной стороне светятся поселения: «пригодность» складывается
       из продуктивности, засушливости, мягкости климата и близости воды —
       то есть из тех же полей, по которым рисуется слой «Население».
     • Вулканы. Там, где тектоника нашла вулканизм: дуги субдукции (`arc`),
       горячие точки (`hotspot`) и рифты (`rift`). Извержение — редкое
       событие, между ними вулкан курится.
     • Сияние. Авроральный овал — кольцо на геомагнитной широте ≈ 67°,
       яркость зависит от возмущённости магнитосферы (индекс из медленного
       шума: «магнитные бури» идут волнами).
     • Дрейф. Материки едут по полю скоростей плит v = ω × (r − r₀), мм/год:
       та же формула, что вращает плиты в тектонике. Один миллиметр в год —
       это километр за миллион лет; за 50 млн лет континенты проходят тысячи
       километров, и мир становится другим. Поле высот переносится
       полулагранжево и живёт в буфере, берег перерисовывается по нулевой
       изолинии.

   Чего здесь намеренно нет: приливов (для них нужен месяц как отдельное
   тело), волн (их масштаб на карте не виден), межгодовых колебаний и
   ледниковых циклов (нужны сотни тысяч лет и отдельная динамика льда).
   Часы мира идут быстрее настоящих — иначе ни одно явление не разглядеть. */

import { clamp, geoToMeters, hashSeed, metersToGeo } from './scale.js';
import { noise2 } from './noise.js';
import { AXIAL_TILT, prevailingWind } from './atmosphere.js';
import { ERO } from './erosion.js';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Грубая решётка — та же, что у климата: одна клетка на ≈50 км. */
const weatherGridOf = (climate) => climate.fields().grid;

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/* ---------- 1. Часы мира ---------- */

export const DAYS_PER_YEAR = 365.24;
export const HOURS_PER_DAY = 24;

/** Три масштаба времени: в каждом движется одна переменная. */
export const CLOCK_MODES = [
  {
    id: 'day',
    name: 'Сутки',
    hint: 'Сутки за 12 секунд: солнце, терминатор и суточный ход облаков',
    /* Одна секунда — два часа: терминатор проходит градус за полторы
       секунды. Быстрее уже не разглядеть суточный ход облаков, а он тут
       главный герой. */
    daysPerSecond: 1 / 12,
    maPerSecond: 0,
    moves: 'hour',
  },
  {
    id: 'year',
    name: 'Год',
    hint: 'Год за 24 секунды: снег, лёд, муссоны и штормовые пути',
    daysPerSecond: DAYS_PER_YEAR / 24,
    maPerSecond: 0,
    moves: 'day',
  },
  {
    id: 'epoch',
    name: 'Эпоха',
    hint: 'Миллион лет за 8 секунд: материки расходятся на глазах',
    daysPerSecond: 0,
    maPerSecond: 0.125,
    moves: 'ma',
  },
];

export const clockModeById = (id) => CLOCK_MODES.find((mode) => mode.id === id) ?? CLOCK_MODES[0];

/** Часы: час, день года, миллионы лет. Живут в модели — рисует их вид. */
export const createClock = ({ day = 172, hour = 12, ma = 0, mode = 'day' } = {}) => {
  const clock = { day, hour, ma, mode, running: true };
  clock.setMode = (id) => {
    clock.mode = clockModeById(id).id;
    if (clock.mode === 'day') clock.day = Math.round(clock.day - 0.5) + 172;
    return clock.mode;
  };
  /** Шаг времени: двигает ровно ту переменную, за которую отвечает режим. */
  clock.tick = (dtSeconds) => {
    if (!clock.running || !(dtSeconds > 0)) return 0;
    const spec = clockModeById(clock.mode);
    const days = spec.daysPerSecond * dtSeconds;
    clock.ma += spec.maPerSecond * dtSeconds;
    if (spec.moves === 'hour') clock.hour = (clock.hour + days * HOURS_PER_DAY) % HOURS_PER_DAY;
    else if (spec.moves === 'day') {
      clock.hour = 12;
      clock.day += days;
    } else clock.hour = 12;
    return days;
  };
  clock.setHour = (value) => {
    clock.hour = ((value % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;
  };
  clock.setMa = (value) => {
    clock.ma = Math.max(0, value);
  };
  clock.dayOfYear = () => {
    const wrapped = clock.day % DAYS_PER_YEAR;
    return wrapped < 0 ? wrapped + DAYS_PER_YEAR : wrapped;
  };
  /** Доля года: 0 — июньское солнцестояние, 0,5 — декабрьское. */
  clock.season = () => clock.dayOfYear() / DAYS_PER_YEAR;
  clock.spec = () => clockModeById(clock.mode);
  clock.snapshot = () => ({
    day: clock.day,
    dayOfYear: clock.dayOfYear(),
    hour: clock.hour,
    ma: clock.ma,
    mode: clock.mode,
    running: clock.running,
  });
  return clock;
};

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
/* Начало месяцев в невисокосном году — том самом, что в DAYS_PER_YEAR. */
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export const dateLabel = (dayOfYear) => {
  const day = clamp(Math.round(dayOfYear), 1, 365);
  let month = 11;
  while (month > 0 && day <= MONTH_START[month]) month -= 1;
  return `${day - MONTH_START[month]} ${MONTHS[month]}`;
};

export const hourLabel = (hour) => {
  const wrapped = ((hour % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;
  const whole = Math.floor(wrapped);
  const minutes = Math.floor((wrapped - whole) * 60);
  return `${String(whole).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/** Сезонная фаза: +1 — июль, −1 — январь. По ней ходят снег, лёд и штормы. */
export const seasonMix = (dayOfYear) => -Math.cos(((dayOfYear + 10) / DAYS_PER_YEAR) * 2 * Math.PI);

/** Доля июльской погоды в текущей: 1 в июле, 0 в январе. */
export const julyWeight = (dayOfYear) => (1 + seasonMix(dayOfYear)) / 2;

/* ---------- 2. Солнце ---------- */

/** Склонение Солнца, градусы: приближение Купера (ошибка меньше 0,5°). */
export const solarDeclination = (dayOfYear) =>
  -AXIAL_TILT * Math.cos(((dayOfYear + 10) / DAYS_PER_YEAR) * 2 * Math.PI);

/** Часовой угол, градусы: 15° на час, плюс долгота (восточнее — раньше полдень). */
export const hourAngleDeg = (hour, lon) => 15 * (hour - 12) + lon;

/** Высота Солнца над горизонтом, градусы. */
export const solarAltitudeDeg = (latDeg, declinationDeg, hourAngle) => {
  const lat = latDeg * RAD;
  const dec = declinationDeg * RAD;
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle * RAD);
  return Math.asin(clamp(sinAlt, -1, 1)) * DEG;
};

/** Азимут Солнца от севера по часовой стрелке, градусы. */
export const solarAzimuthDeg = (latDeg, declinationDeg, hourAngle) => {
  const alt = solarAltitudeDeg(latDeg, declinationDeg, hourAngle) * RAD;
  const dec = declinationDeg * RAD;
  const lat = latDeg * RAD;
  const sinAz = (-Math.cos(dec) * Math.sin(hourAngle * RAD)) / Math.max(Math.cos(alt), 1e-4);
  const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(lat)) / Math.max(Math.cos(alt) * Math.cos(lat), 1e-4);
  return (Math.atan2(sinAz, cosAz) * DEG + 360) % 360;
};

/**
 * Длина дня, часы. Незаходящее Солнце за полярным кругом даёт 24, полярная
 * ночь — 0.
 */
export const dayLengthHours = (latDeg, declinationDeg) => {
  const product = -Math.tan(latDeg * RAD) * Math.tan(declinationDeg * RAD);
  if (product <= -1) return 24;
  if (product >= 1) return 0;
  return (2 * Math.acos(product) * DEG) / 15;
};

/** Точка, над которой Солнце в зените: долгота отстаёт от времени на 15°/час. */
export const subsolarPoint = (hour, dayOfYear) => ({
  lon: 15 * (12 - hour),
  lat: solarDeclination(dayOfYear),
});

/** Светило везде, кроме одной точки, не «встаёт»: длина дня — свойство широты. */
export const localSolarHour = (hour, lon) => {
  const value = (hour + lon / 15) % HOURS_PER_DAY;
  return value < 0 ? value + HOURS_PER_DAY : value;
};

/**
 * Солнце над точкой карты: высота, азимут, длина дня и три безразмерные
 * величины для рисования — день, сумерки и ночь.
 */
export const sunAt = (planet, mx, my, clock) => {
  const { lon, lat } = metersToGeo(planet, mx, my);
  const declination = solarDeclination(clock.day);
  const hourAngle = hourAngleDeg(clock.hour, lon);
  const altitude = solarAltitudeDeg(lat, declination, hourAngle);
  return {
    lon,
    lat,
    declination,
    hourAngle,
    altitude,
    azimuth: solarAzimuthDeg(lat, declination, hourAngle),
    dayLength: dayLengthHours(lat, declination),
    localHour: localSolarHour(clock.hour, lon),
    /* Три ступени освещённости. Границы — гражданские сумерки (−6°: ещё видно
       горизонт) и конец астрономических (−18°: темно по-настоящему). */
    daylight: clamp(altitude / 10, 0, 1),
    twilight: clamp(1 - Math.abs(altitude + 2) / 8, 0, 1),
    night: clamp((-altitude - 2) / 7, 0, 1),
    /** Ночь для огней: города зажигаются раньше, чем наступит тьма. */
    lights: clamp((-altitude + 1) / 6, 0, 1),
  };
};

/* ---------- 3. Погода ---------- */

/**
 * Температура воды, ниже которой тропический циклон не заводится.
 *
 * На Земле порог — 26,5 °C, и в модели он должен быть такой же: ураган
 * питается испарением, а испарение растёт с температурой воды. Но тёплый
 * бассейн у этой планеты на градус холоднее земного (27,0 вместо 28,5), и
 * абсолютный порог не дал бы ни одного урагана. Поэтому порог считается от
 * собственной воды мира: берём самую тёплую её часть — верхние десять
 * процентов тропических вод (на Земле тёплый бассейн занимает примерно
 * столько же). Важна не цифра, а то, что ураган заводится у самой тёплой воды.
 */
export const WARM_POOL_QUANTILE = 0.9;
/** Ветер, которым меряется скорость частиц, м/с: у западных ветров это норма. */
export const WIND_REFERENCE = 12;
/** Время жизни облачного поля, часы: за сутки поле успевает дважды смениться. */
export const CLOUD_TAU_HOURS = 18;
/** Облачность, с которой начинаются осадки, и сколько миллиметров она даёт. */
export const RAIN_THRESHOLD = 0.52;
export const RAIN_PER_EXCESS = 5.5;
/** Больше этого не выпадает даже из урагана, мм/ч. */
export const RAIN_CAP = 14;
export const MAX_SYSTEMS = 34;
/** Дольше одного шага перенос не считается: за 1,5 ч ветер проходит клетку. */
export const MAX_CHUNK_HOURS = 1.5;

/**
 * Скорость ветра по широте, м/с. Направление берётся из климата (там оно
 * повёрнуто по сезону и по муссонам), а скорость — из профиля: пассаты 6 м/с,
 * западные ветры 45-х широт 12, полярные восточные 5.
 */
export const windSpeedAt = (lat) => 5.5 + 6.5 * Math.exp(-(((Math.abs(lat) - 45) / 26) ** 2));

const createRandom = (seed) => {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Погода: облачное поле, осадки и вихри.
 *
 * Поле облачности живёт на грубой решётке климата (≈50 км) — мельче смысла
 * нет: облачная гряда и есть явление такого размера. Каждый шаг: перенос
 * полулагранжевым методом по ветру, релаксация к климатологии сезона с
 * суточной конвекцией, выпадение осадков из пересыщенных клеток.
 */
export const createWeather = ({ planet, climate, seed = 0 }) => {
  const fields = climate.fields();
  const grid = fields.grid;
  const { w, h, stepX, stepY } = grid;
  /* У грубой решётки нет поля «сколько всего клеток» — считаем сами. */
  const count = w * h;
  const masks = fields.masks;
  const julyAtmosphere = fields.seasons.july.atmosphere;
  const januaryAtmosphere = fields.seasons.january.atmosphere;
  const julyOcean = fields.seasons.july.ocean;
  const januaryOcean = fields.seasons.january.ocean;
  const rand = createRandom(hashSeed(`weather|${seed}`));

  const cloud = new Float32Array(count);
  const stage = new Float32Array(count);
  const forcing = new Float32Array(count);
  const rain = new Float32Array(count);
  const baseJuly = new Float32Array(count);
  const baseJanuary = new Float32Array(count);

  const pointAt = (mx, my) => {
    const gx = clamp(Math.floor(mx / stepX), 0, w - 1);
    const gy = clamp(Math.floor(my / stepY), 0, h - 1);
    return gy * w + gx;
  };

  /** Билинейная выборка своего массива: у грубой решётки одно значение на клетку. */
  const bilinear = (array, mx, my) => {
    const fx = clamp(mx * grid.invX, 0, w - 1);
    const fy = clamp(my * grid.invY, 0, h - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = x0 + 1 < w ? x0 + 1 : x0;
    const y1 = y0 + 1 < h ? y0 + 1 : y0;
    const tx = fx - x0;
    const ty = fy - y0;
    const top = array[y0 * w + x0] + (array[y0 * w + x1] - array[y0 * w + x0]) * tx;
    const bottom = array[y1 * w + x0] + (array[y1 * w + x1] - array[y1 * w + x0]) * tx;
    return top + (bottom - top) * ty;
  };

  /* ---------- климатология облачности ---------- */

  const buildBase = (season, out) => {
    const atmosphere = season === 'july' ? julyAtmosphere : januaryAtmosphere;
    const seasonal = season === 'july' ? fields.precip.warm : fields.precip.cold;
    const orographic = fields.precip.orographic;
    const heightM = masks.heightM;
    const land = masks.land;
    for (let i = 0; i < count; i += 1) {
      /* Влажность воздуха — это отношение того, что выпадает, к тому, что
         может испариться: индекс засушливости ЮНЕП, тот же, по которому
         рисуется слой «Засушливость». Где P/PET около единицы — воздух
         насыщен и небо закрыто; в пустыне (P/PET ниже 0,2) облаков почти нет.
         Сезонная поправка: в дождливый сезон облаков больше, в сухой меньше. */
      const humidity = clamp(fields.aridity[i], 0, 1.3);
      const share = seasonal[i] / Math.max(fields.precip.annual[i] / 2, 1);
      let cover = 0.08 + 0.72 * humidity + 0.2 * orographic[i] + 0.1 * clamp(share - 1, -0.6, 0.8);
      if (!land[i] && atmosphere.temperature[i] > 11 && atmosphere.temperature[i] < 26) {
        /* Слоистые облака над прохладной водой: та самая морось сороковых
           широт, где не видно ни солнца, ни дождя. */
        cover += 0.12;
      }
      if (heightM[i] > 2500) cover -= 0.12;
      out[i] = clamp(cover, 0.02, 0.95);
    }
  };

  /* ---------- вихри ---------- */

  const systems = [];
  const state = { july: 1, hour: 12 };
  const spawnLog = { cyclones: 0, hurricanes: 0, tropicalTries: 0, warmHits: 0 };
  /* Порог урагана: квантовая доля тёплых вод тропиков, °C. Считается один раз. */
  const warmPool = (() => {
    const values = [];
    for (let gy = 0; gy < h; gy += 1) {
      const my = (gy + 0.5) * stepY;
      const lat = 90 - (my / planet.heightM) * 180;
      if (Math.abs(lat) > 32) continue;
      for (let gx = 0; gx < w; gx += 1) {
        const index = gy * w + gx;
        if (masks.land[index]) continue;
        values.push(julyOcean.sst[index]);
      }
    }
    values.sort((a, b) => a - b);
    return values.length ? values[Math.floor(values.length * WARM_POOL_QUANTILE)] : 26.5;
  })();
  const cycloneSst = clamp(warmPool, 20, 28);
  const maxSystems = clamp(Math.round(count * 0.0001), 8, MAX_SYSTEMS);

  const spawnSystem = () => {
    const season = state.july * 2 - 1;
    const south = rand() < 0.45;
    const hemisphere = south ? -1 : 1;
    /* Зимой штормовой путь идёт ближе к экватору, летом — к полюсу. */
    const winter = season * (south ? -1 : 1);
    if (rand() < 0.28) {
      /* Тропический ураган: над тёплой водой и не на самом экваторе — там нет
         силы Кориолиса, и вихрь не закрутится. */
      for (let attempt = 0; attempt < 30; attempt += 1) {
        /* Самая тёплая вода этого мира лежит узкой полосой у экватора, а
           дальше 28° её уже не хватает на ураган. Настоящему вихрю нужна и
           сила Кориолиса, поэтому полоса начинается не с нуля, а с полутора
           градусов: у самого экватора он не закрутится. */
        const lat = (1.5 + rand() * 26.5) * hemisphere;
        const { x, y } = geoToMeters(planet, rand() * 360 - 180, lat);
        if (masks.land[pointAt(x, y)]) continue;
        const index = pointAt(x, y);
        const warmth = julyOcean.sst[index] + (januaryOcean.sst[index] - julyOcean.sst[index]) * (1 - state.july);
        spawnLog.tropicalTries += 1;
        if (warmth < cycloneSst) continue;
        spawnLog.warmHits += 1;
        spawnLog.hurricanes += 1;
        systems.push({
          kind: 'hurricane',
          x,
          y,
          spin: hemisphere,
          radius: (240 + rand() * 200) * 1000,
          strength: 0.55 + rand() * 0.35,
          phase: rand() * 6.283,
          age: 0,
          life: 30 + rand() * 45,
          drift: 1,
        });
        return;
      }
      return;
    }
    const lat = clamp((40 + rand() * 26 + 6 * winter) * hemisphere, -86, 86);
    const { x, y } = geoToMeters(planet, rand() * 360 - 180, lat);
    spawnLog.cyclones += 1;
    systems.push({
      kind: 'cyclone',
      x,
      y,
      spin: hemisphere,
      radius: (500 + rand() * 420) * 1000,
      strength: 0.4 + rand() * 0.4,
      phase: rand() * 6.283,
      age: 0,
      life: 90 + rand() * 90,
      drift: 1,
    });
  };

  /** Преобладающий ветер в точке, м/с: им вихри и едут. */
  const driftVector = (mx, my, out = { x: 0, y: 0 }) => {
    const { lat } = metersToGeo(planet, mx, my);
    const itcz = 8 * (state.july * 2 - 1);
    const prevailing = prevailingWind(lat, itcz);
    const speed = windSpeedAt(lat) * 1.5;
    out.x = prevailing.x * speed;
    out.y = -prevailing.y * speed;
    return out;
  };

  const moveSystems = (hours) => {
    const vector = { x: 0, y: 0 };
    for (let i = systems.length - 1; i >= 0; i -= 1) {
      const system = systems[i];
      driftVector(system.x, system.y, vector);
      system.age += hours;
      system.x += vector.x * system.drift * hours * 3600;
      system.y += vector.y * system.drift * hours * 3600;
      const index = pointAt(system.x, system.y);
      if (system.kind === 'hurricane') {
        const { lat } = metersToGeo(planet, system.x, system.y);
        const warmth = julyOcean.sst[index] + (januaryOcean.sst[index] - julyOcean.sst[index]) * (1 - state.july);
        /* Над холодной водой и над сушей ураган теряет силу: без испарения
           ему нечем питаться. */
        if (warmth < cycloneSst - 1.0) system.strength -= 0.02 * hours;
        if (masks.land[index]) system.strength -= 0.05 * hours;
        /* За 40° ураган теряет тёплую воду и становится обычным циклоном:
           здесь он и слабеет. */
        if (Math.abs(lat) > 42) system.strength -= 0.03 * hours;
      } else {
        /* Циклон над сушей слабеет медленнее урагана: у него другой источник
           энергии — разница температур, а не тёплое море. */
        if (masks.land[index]) system.strength -= 0.003 * hours;
      }
      if (system.y < 0 || system.y > planet.heightM) system.life = 0;
      if (system.age > system.life || system.strength <= 0.06) systems.splice(i, 1);
    }
    /* Новые вихри: в среднем один за 1–2 модельных суток. */
    if (rand() < (maxSystems * hours) / 24 && systems.length < maxSystems) spawnSystem();
  };

  const systemCover = (mx, my) => {
    let cover = 0;
    for (const system of systems) {
      const dx = mx - system.x;
      const dy = my - system.y;
      const distance = Math.hypot(dx, dy);
      if (distance > system.radius * 2.4) continue;
      const radial = distance / system.radius;
      /* Спиральные полосы: у циклона они плотнее в центре и расходятся наружу. */
      const angle = Math.atan2(dy, dx) + system.phase - radial * 2.1 * system.spin;
      const bands = 0.5 + 0.5 * Math.cos(angle * 2 - radial * 5.5);
      cover += system.strength * Math.exp(-(radial ** 2) * 1.5) * (0.35 + 0.65 * bands);
    }
    return Math.min(cover, 1.1);
  };

  const systemRain = (mx, my) => {
    let intensity = 0;
    for (const system of systems) {
      const dx = mx - system.x;
      const dy = my - system.y;
      const distance = Math.hypot(dx, dy);
      if (distance > system.radius * 1.6) continue;
      const radial = distance / system.radius;
      intensity += system.strength * Math.exp(-(radial ** 2) * 2.2) * 7;
    }
    return intensity;
  };

  /* ---------- шаг переноса ---------- */

  let rowsDone = 0;
  let chunkHours = 0;
  let queueHours = 0;

  const rebuildForcing = () => {
    const land = masks.land;
    const weight = state.july;
    /* Суточный ход конвекции: максимум в 15:00 местного времени — над сушей
       кучевые облака растут после полудня и к утру исчезают. Идёт он по
       местному времени, поэтому волна послеполуденных облаков обходит планету
       с запада на восток вместе с Солнцем. */
    for (let gy = 0; gy < h; gy += 1) {
      for (let gx = 0; gx < w; gx += 1) {
        const index = gy * w + gx;
        const mx = (gx + 0.5) * stepX;
        const base = baseJanuary[index] + (baseJuly[index] - baseJanuary[index]) * weight;
        const temperature = januaryAtmosphere.temperature[index]
          + (julyAtmosphere.temperature[index] - januaryAtmosphere.temperature[index]) * weight;
        const lon = (mx / planet.widthM) * 360 - 180;
        const local = localSolarHour(state.hour, lon);
        const diurnal = 0.5 + 0.5 * Math.cos(((local - 15) / HOURS_PER_DAY) * 2 * Math.PI);
        const overLand = land[index];
        const amplitude = overLand ? 9 : 2;
        const warmth = temperature + amplitude * diurnal - (overLand ? 4 : 0);
        const convective = clamp((warmth - 8) / 16, 0, 1) * (overLand ? 0.34 : 0.06);
        forcing[index] = clamp(base + diurnal * convective, 0.02, 1);
      }
    }
  };

  const stepRows = (rows) => {
    const dt = chunkHours * 3600;
    const relax = 1 - Math.exp(-chunkHours / CLOUD_TAU_HOURS);
    const data = grid.data;
    const channels = grid.channels;
    for (let row = 0; row < rows && rowsDone < h; row += 1) {
      const gy = rowsDone;
      const my = (gy + 0.5) * stepY;
      for (let gx = 0; gx < w; gx += 1) {
        const index = gy * w + gx;
        const mx = (gx + 0.5) * stepX;
        const u = data[index * channels + 12];
        const v = data[index * channels + 13];
        const { lat } = metersToGeo(planet, mx, my);
        const speed = windSpeedAt(lat);
        const sampled = bilinear(cloud, mx - u * speed * dt, my - v * speed * dt);
        const relaxed = sampled + (forcing[index] - sampled) * relax;
        /* Осадки: то, что облако не удерживает. */
        const excess = Math.max(0, relaxed - RAIN_THRESHOLD);
        rain[index] = Math.min(excess * RAIN_PER_EXCESS, RAIN_CAP);
        stage[index] = clamp(relaxed - excess * 0.55, 0.01, 1);
      }
      rowsDone += 1;
    }
    if (rowsDone >= h) {
      /* Проход закончен — обновлённое поле становится текущим. До этого
         момента читается прежнее: перенос идёт по одному полю, а не по
         наполовину переписанному. */
      cloud.set(stage);
      rowsDone = 0;
      chunkHours = 0;
    }
  };

  const beginChunk = () => {
    chunkHours = Math.min(queueHours, MAX_CHUNK_HOURS);
    queueHours -= chunkHours;
    rebuildForcing();
    moveSystems(chunkHours);
    rowsDone = 0;
  };

  const weather = {
    cloud,
    rain,
    systems,
    stats: () => {
      let cover = 0;
      let wet = 0;
      for (let i = 0; i < count; i += 1) {
        cover += cloud[i];
        wet += rain[i];
      }
      return {
        cover: cover / count,
        rain: wet / count,
        systems: systems.length,
        hurricanes: systems.filter((system) => system.kind === 'hurricane').length,
        queuedHours: queueHours + chunkHours,
        warmPoolSst: cycloneSst,
        spawned: { ...spawnLog },
      };
    },
    cloudAt: (mx, my) => clamp(bilinear(cloud, mx, my) * 0.92 + systemCover(mx, my) * 0.9, 0, 1),
    rainAt: (mx, my) => clamp(bilinear(rain, mx, my) + systemRain(mx, my), 0, RAIN_CAP * 2),
    /** Сколько осадков уже выпало в клетке — для отрисовки капель. */
    rainField: () => rain,
    /** Синхронизация с часами: сезон задаёт климатологию, час — конвекцию. */
    sync(clock) {
      state.july = julyWeight(clock.dayOfYear());
      state.hour = clock.hour;
    },
    /** Отметить, сколько модельных часов надо прожить. */
    enqueue(hours) {
      if (hours > 0) queueHours = Math.min(queueHours + hours, 48);
    },
    /**
     * Досчитать перенос в отведённое время. Погода всегда отстаёт от часов на
     * несколько часов модели — иначе в режиме «год» перенос не сходится:
     * за один кадр ветер прошёл бы десятки клеток.
     */
    work(budgetMs = 4) {
      const deadline = now() + budgetMs;
      while (true) {
        if (rowsDone === 0 && chunkHours === 0) {
          if (queueHours <= 0) return false;
          beginChunk();
        }
        stepRows(8);
        if (now() >= deadline) return true;
      }
    },
    /** Полный шаг за `hours` часов разом — для проверок и мгновенных правок. */
    step(hours) {
      if (!(hours > 0)) return;
      queueHours += hours;
      while (queueHours > 0) {
        beginChunk();
        stepRows(h);
      }
    },
    reset() {
      buildBase('january', baseJanuary);
      buildBase('july', baseJuly);
      cloud.set(baseJuly);
      stage.fill(0);
      rain.fill(0);
      systems.length = 0;
      queueHours = 0;
      chunkHours = 0;
      rowsDone = 0;
      for (let i = 0; i < 8; i += 1) spawnSystem();
    },
    /** Поля целиком — для проверок и для рисования мягких слоёв. */
    fields: () => ({ grid, cloud, rain, base: baseJuly }),
  };
  weather.reset();
  return weather;
};

/**
 * Сезонные поля: чем сейчас является то, что в климате записано двумя
 * полугодиями. Климат хранит июль и январь (два расчёта атмосферы), а миру
 * нужен любой день года — температура, вода и снег берутся смесью по сезону.
 */
export const createSeasonFields = ({ climate }) => {
  const fields = climate.fields();
  const grid = fields.grid;
  const tempWarm = climate.channel('tempWarm');
  const tempCold = climate.channel('tempCold');
  const julyIce = fields.seasons.july.ocean.ice;
  const januaryIce = fields.seasons.january.ocean.ice;
  const at = (channel, mx, my) => grid.sample1(mx, my, channel);
  const mix = (warm, cold, mx, my, weight) => {
    const a = at(cold, mx, my);
    const b = at(warm, mx, my);
    return a + (b - a) * weight;
  };
  const mixArray = (warm, cold, mx, my, weight) => {
    const fx = clamp(mx * grid.invX, 0, grid.w - 1);
    const fy = clamp(my * grid.invY, 0, grid.h - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = x0 + 1 < grid.w ? x0 + 1 : x0;
    const y1 = y0 + 1 < grid.h ? y0 + 1 : y0;
    const tx = fx - x0;
    const ty = fy - y0;
    const blend = (array) => {
      const top = array[y0 * grid.w + x0] + (array[y0 * grid.w + x1] - array[y0 * grid.w + x0]) * tx;
      const bottom = array[y1 * grid.w + x0] + (array[y1 * grid.w + x1] - array[y1 * grid.w + x0]) * tx;
      return top + (bottom - top) * ty;
    };
    const a = blend(cold);
    const b = blend(warm);
    return a + (b - a) * weight;
  };
  return {
    grid,
    temperatureAt: (mx, my, weight) => mix(tempWarm, tempCold, mx, my, weight),
    sstAt: (mx, my, weight) => mix(climate.channel('sstWarm'), climate.channel('sstCold'), mx, my, weight),
    /**
     * Снежный покров: тает около нуля. Климат хранит снег только зимним
     * максимумом, а миру нужен покров любого дня года — он и берётся из
     * температуры: где сейчас холоднее нуля, там снег лежит.
     */
    snowAt: (mx, my, weight) => clamp(-mix(tempWarm, tempCold, mx, my, weight) / 3, 0, 1),
    /**
     * Морской лёд. Его считает океан: там лёд встаёт там, где вода хотела бы
     * быть холоднее точки замерзания, — а сама температура поверхности ниже
     * −1,8 °C не опускается. Здесь лёд каждого сезона берётся своим полем и
     * смешивается по доле года: у края льда виден ход границы.
     */
    iceAt: (mx, my, weight) => clamp(mixArray(julyIce, januaryIce, mx, my, weight), 0, 1),
  };
};

/**
 * Ночные огни: где живут люди.
 *
 * Слоя городов у грубой решётки нет, но он и не нужен: поселения садятся
 * туда, где тепло, не слишком сухо, продуктивно и близко к воде. Берём те же
 * поля, по которым рисуется слой «Население», и складываем «пригодность» —
 * так свет ложится на речные долины, берега и равнины, а пустыни и ледники
 * остаются тёмными.
 */
export const createLights = ({ planet, climate, hydro, seed = 0 }) => {
  const fields = climate.fields();
  const grid = fields.grid;
  const { w, h } = grid;
  const count = w * h;
  const rand = createRandom(hashSeed(`lights|${seed}`));
  const suitability = new Float32Array(count);
  const points = [];
  const flux = hydro.ready() ? hydro.coarse().flux : null;

  const build = () => {
    const land = fields.masks.land;
    const heightM = fields.masks.heightM;
    const july = fields.seasons.july.atmosphere;
    const january = fields.seasons.january.atmosphere;
    /* Продуктивность лежит в канале климата, а не отдельным массивом. */
    const npp = grid.channelArray(climate.channel('npp'));
    for (let i = 0; i < count; i += 1) {
      if (!land[i]) {
        suitability[i] = 0;
        continue;
      }
      const warm = Math.max(july.temperature[i], january.temperature[i]);
      const cold = Math.min(july.temperature[i], january.temperature[i]);
      const productive = clamp(npp[i] / 900, 0, 1.4);
      const wet = clamp(fields.aridity[i] / 0.6, 0, 1);
      /* Мороз убивает поселение вернее засухи: при −20 °C не живёт никто. */
      const mild = smoothstep(-16, 4, warm) * smoothstep(-30, 2, cold);
      const coast = 0.35 + 0.65 * clamp(1 - fields.masks.continentality[i] * 1.15, 0, 1);
      const river = flux ? clamp(flux[i] / 4000, 0, 0.5) : 0;
      const relief = heightM[i] > 2200 ? 0.35 : 1;
      suitability[i] = clamp((0.25 + productive) * wet * mild * coast * relief + river * mild, 0, 1);
    }
  };

  /** Точки огней: розыгрыш по пригодности — там, где она выше, городов больше. */
  const makePoints = (wanted) => {
    points.length = 0;
    const gridArea = w * h;
    for (let tries = 0; points.length < wanted && tries < wanted * 40; tries += 1) {
      const index = Math.min(gridArea - 1, Math.floor(rand() * gridArea));
      const weight = suitability[index];
      if (rand() > weight ** 1.4) continue;
      const gx = index % w;
      const gy = (index / w) | 0;
      points.push({
        x: ((gx + rand()) / w) * planet.widthM,
        y: ((gy + rand()) / h) * planet.heightM,
        size: clamp(0.3 + weight * 1.6 * rand(), 0.25, 1.8),
        twinkle: rand() * 6.283,
      });
    }
  };

  build();
  makePoints(clamp(Math.round(count * 0.006), 400, 4200));

  return {
    suitability,
    points,
    /** Сколько света приходится на точку: для подписи под курсором. */
    at(mx, my) {
      const gx = clamp(Math.floor((mx / planet.widthM) * w), 0, w - 1);
      const gy = clamp(Math.floor((my / planet.heightM) * h), 0, h - 1);
      return suitability[gy * w + gx];
    },
    stats: () => ({ points: points.length }),
  };
};

/* ---------- 5. Вулканы ---------- */

const TECT_VOLCANIC = 8;
const TECT_HOTSPOT = 10;
const TECT_ARC = 12;
const TECT_RIFT = 13;

/**
 * Вулканы: берём их из тектоники.
 *
 * Действующие вулканы стоят над зонами субдукции (дуга), над горячими точками
 * и в рифтах — ровно там, где тектоника их поставила. Извержение — редкое
 * событие: период десятки-сотни секунд модельного времени, а между ними вулкан
 * спит и только курится.
 */
export const createVolcanoes = ({ planet, elevation, seed = 0 }) => {
  const { tectonics, erosion } = elevation.terrainFields();
  /* Высота рельефа нужна отдельно: вулкан ставят там, где суша, а не там, где
     тектоника нашла вулканизм, — половина дуг и горячих точек под водой. */
  const erosionElevation = erosion.grid.channelArray(ERO.elevation);
  const grid = tectonics.grid;
  const { w, h, stepX, stepY } = grid;
  const rand = createRandom(hashSeed(`volcano|${seed}`));
  const sites = [];
  /* Полторы сотни километров: в настоящих вулканических дугах вулканы стоят
     цепочкой с шагом в десятки километров, но реже — значит, это уже одна
     вулканическая постройка, а не два вулкана. */
  const minDistance = 150_000;
  /* Оценка вулканичности в клетке. Дуга субдукции записана высотой хребта в
     метрах, горячие точки и рифты — долей единицы: приводим всё к одной мере.
     2000 м — высота дуги, при которой она считается настоящей горной. */
  const scoreOf = (index) => clamp(grid.at(index, TECT_ARC) / 2000, 0, 1) * 1.2
    + clamp(grid.at(index, TECT_HOTSPOT), 0, 1) * 1.5
    + clamp(grid.at(index, TECT_RIFT), 0, 1) * 0.6
    + clamp(grid.at(index, TECT_VOLCANIC), 0, 1) * 0.4;
  const candidates = [];
  for (let gy = 1; gy < h - 1; gy += 1) {
    for (let gx = 1; gx < w - 1; gx += 1) {
      const index = gy * w + gx;
      const score = scoreOf(index);
      if (score < 0.2) continue;
      /* Вулкан — это гора на суше: подводные дуги и гайоты тектонике видны,
         а человеку на карте нет. Берём только то, что выше уровня моря, и с
         запасом в сотню метров: берег у самой воды — не место для вулкану. */
      if (erosionElevation[index] < 120) continue;
      /* Вулкан — точка, а не полоса: берём локальные максимумы той же самой
         оценки. Сравнивать надо оценку с оценкой: прежде соседи складывались
         из двух каналов, а клетка — из четырёх, и «локальным максимумом»
         оказывалась только совсем одинокая клетка — на одном мире вулканов
         не оставалось ни одного. */
      if (score < scoreOf(index - 1) || score < scoreOf(index + 1)
        || score < scoreOf(index - w) || score < scoreOf(index + w)) continue;
      candidates.push({ index, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const candidate of candidates) {
    if (sites.length >= 90) break;
    const x = ((candidate.index % w) + 0.5) * stepX;
    const y = (((candidate.index / w) | 0) + 0.5) * stepY;
    let near = false;
    for (const site of sites) {
      if (Math.hypot(site.x - x, site.y - y) < minDistance) {
        near = true;
        break;
      }
    }
    if (near) continue;
    sites.push({
      x,
      y,
      score: candidate.score,
      /* Магма одна на всю постройку: чем сильнее вулканизм в этом месте, тем
         чаще вулкан извергается. Слабый вулкан (оценка 0,2) — раз в пять с
         половиной минут, сильный — раз в минуту; за десять минут успевают
         показать себя все, а не только избранные. */
      period: 40 + (1 - candidate.score) * 380,
      phase: rand() * 1000,
      fume: 0.25 + rand() * 0.5,
      glow: rand() * 6.283,
    });
  }

  let elapsed = 0;
  /**
   * Интенсивность извержения, 0…1. Вулкан либо курится, либо извергается, но
   * не исчезает: у спокойного вулкана остаётся дым, у извергающегося — фонтан.
   */
  const intensityAt = (site, seconds) => {
    const phase = (((seconds + site.phase) % site.period) + site.period) % site.period / site.period;
    const burst = phase < 0.18 ? Math.sin((phase / 0.18) * Math.PI) ** 2 : 0;
    const fume = site.fume * (0.55 + 0.45 * Math.cos(phase * 2 * Math.PI));
    /* Оценка места задаёт силу постройки, а не громкость одного извержения:
       слабый вулкан — это маленький конус, который тихо курится и редко
       вспыхивает, а не вулкан, у которого извержение вполсилы. */
    const strength = 0.45 + 0.55 * site.score;
    return clamp(strength * (0.3 * fume + 1.7 * burst), 0, 1);
  };

  return {
    sites,
    step(dtSeconds) {
      elapsed += dtSeconds;
    },
    intensity: (site) => intensityAt(site, elapsed),
    /** Интенсивность на заданный момент времени — для проверок. */
    intensityAt,
    /** Вулканы, попавшие в рамку: их видно только при достаточном приближении. */
    visible(minX, minY, maxX, maxY) {
      const pad = 60_000;
      return sites.filter((site) => site.x > minX - pad && site.x < maxX + pad
        && site.y > minY - pad && site.y < maxY + pad);
    },
    stats: () => ({ count: sites.length, elapsed }),
  };
};

/* ---------- 6. Полярное сияние ---------- */

/** Геомагнитная широта спокойного овала: 67° — классическая оценка. */
export const AURORA_LAT = 67;

/**
 * Полярное сияние: кольцо вокруг геомагнитного полюса, ярче к полуночи и в
 * возмущённую погоду. Возмущённость — медленный шум: «магнитные бури» идут
 * волнами по 10–20 минут модельного времени.
 */
export const createAurora = ({ seed = 0 } = {}) => {
  const salt = hashSeed(`aurora|${seed}`);
  let elapsed = 0;
  const activity = (seconds) => clamp(
    0.26 + 0.5 * noise2(seconds / 900, 0.5, salt) + 0.24 * noise2(seconds / 240, 3.5, salt + 7),
    0,
    1,
  );
  return {
    activity: () => activity(elapsed),
    /**
     * Сила сияния в точке. Овал спускается к экватору по мере возмущения, а
     * светиться сиянию мешает день: видно его только на тёмной стороне.
     */
    at(mx, my, planet, sun) {
      const { lat } = metersToGeo(planet, mx, my);
      const strength = activity(elapsed);
      const oval = AURORA_LAT - strength * 7;
      const distance = Math.abs(Math.abs(lat) - oval);
      const band = Math.exp(-((distance / 5.5) ** 2));
      return clamp(band * strength * (0.2 + 0.8 * sun.night) * 1.6, 0, 1);
    },
    step(dtSeconds) {
      elapsed += dtSeconds;
    },
    stats: () => ({ activity: activity(elapsed), elapsed }),
  };
};

/* ---------- 7. Частицы ---------- */

/** Сколько секунд живёт частица: след успевает прочертиться, а не размазаться. */
export const PARTICLE_LIFE = 2.6;

/**
 * Частицы в векторном поле: ими показаны ветер и течения.
 *
 * Скорость частицы — не скорость ветра, а доля кадра в секунду, умноженная на
 * нормированную скорость поля: 12 м/с проходят 16 % кадра за секунду. Так
 * поток виден на любом приближении, а направления и отношения скоростей
 * остаются настоящими — пассат медленнее западных ветров, Гольфстрим быстрее
 * Куросио, ровно как в климате.
 */
export const createFlowField = ({ count, seed = 0, reference = WIND_REFERENCE }) => {
  const rand = createRandom(hashSeed(`flow|${seed}`));
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const age = new Float32Array(count);
  const life = new Float32Array(count);
  const speed = new Float32Array(count);
  const dx = new Float32Array(count);
  const dy = new Float32Array(count);
  const span = { minX: 0, minY: 0, maxX: 1, maxY: 1, mpp: 1 };

  const seedParticle = (index) => {
    const width = Math.max(span.maxX - span.minX, 1);
    const height = Math.max(span.maxY - span.minY, 1);
    x[index] = span.minX + rand() * width;
    y[index] = span.minY + rand() * height;
    age[index] = rand() * PARTICLE_LIFE;
    life[index] = PARTICLE_LIFE * (0.6 + rand() * 0.8);
    speed[index] = 0;
    dx[index] = 0;
    dy[index] = 0;
  };

  return {
    count,
    x,
    y,
    age,
    life,
    speed,
    dx,
    dy,
    reference,
    /** Сколько частиц сейчас в кадре — для строки состояния. */
    stats: () => ({ count, reference }),
    setView(next) {
      span.minX = next.minX;
      span.minY = next.minY;
      span.maxX = next.maxX;
      span.maxY = next.maxY;
      span.mpp = next.mpp;
      for (let i = 0; i < count; i += 1) seedParticle(i);
    },
    step(dtSeconds, vectorAt) {
      if (!(dtSeconds > 0)) return;
      const width = Math.max(span.maxX - span.minX, 1);
      const height = Math.max(span.maxY - span.minY, 1);
      const spanMeters = Math.max(width, height);
      const scale = (spanMeters * 0.16 * dtSeconds) / reference;
      const margin = 0.08;
      for (let i = 0; i < count; i += 1) {
        const vector = vectorAt(x[i], y[i], scratch);
        const magnitude = Math.hypot(vector.x, vector.y);
        speed[i] = magnitude;
        const inverse = magnitude > 1e-6 ? 1 / magnitude : 0;
        dx[i] = vector.x * inverse;
        dy[i] = vector.y * inverse;
        x[i] += vector.x * scale;
        y[i] += vector.y * scale;
        age[i] += dtSeconds;
        const out = x[i] < span.minX - width * margin || x[i] > span.maxX + width * margin
          || y[i] < span.minY - height * margin || y[i] > span.maxY + height * margin;
        if (age[i] > life[i] || out) seedParticle(i);
      }
    },
  };
};
const scratch = { x: 0, y: 0 };

/**
 * Течение рек: частицы идут по руслам от истока к устью.
 *
 * Сегменты рек уже посчитаны гидрологией; здесь они сшиваются в цепочки — так
 * вода не «телепортируется» на середине реки, а проходит её целиком. Ширина
 * русла задаёт скорость: в широкой реке вода идёт быстрее (расход растёт
 * быстрее, чем ширина).
 */
export const createRiverFlow = ({ count, seed = 0 }) => {
  const rand = createRandom(hashSeed(`river|${seed}`));
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const age = new Float32Array(count);
  const speed = new Float32Array(count);
  const dx = new Float32Array(count);
  const dy = new Float32Array(count);
  const chain = new Int32Array(count);
  const progress = new Float32Array(count);
  const nodes = [];
  const chains = [];
  let built = 0;

  const buildChains = (segments) => {
    nodes.length = 0;
    chains.length = 0;
    for (const segment of segments) nodes.push(segment);
    if (nodes.length === 0) return;
    /* Порог сшивки: сегменты идут от центра клетки к центру её приёмника,
       поэтому конец одного и начало следующего совпадают точно. Берём среднюю
       длину сегмента — она и есть шаг клетки водосбора. */
    let total = 0;
    for (const node of nodes) total += Math.hypot(node.x2 - node.x1, node.y2 - node.y1);
    const mean = total / nodes.length;
    /* Запас в шесть клеток: часть слабых сегментов отсеяна по видимой ширине,
       поэтому между соседними звеньями одной реки бывает пропуск. */
    const link = Math.max(mean * 6, 1);
    /* Решётка ключей: искать продолжение перебором всех сегментов — это n², а
       у реки бывает несколько тысяч сегментов. */
    const keyOf = (x, y) => `${Math.floor(x / link)}:${Math.floor(y / link)}`;
    const starts = new Map();
    for (let i = 0; i < nodes.length; i += 1) {
      const key = keyOf(nodes[i].x1, nodes[i].y1);
      const list = starts.get(key);
      if (list) list.push(i);
      else starts.set(key, [i]);
    }
    const nextOf = new Int32Array(nodes.length).fill(-1);
    const hasPrev = new Uint8Array(nodes.length);
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const gx = Math.floor(node.x2 / link);
      const gy = Math.floor(node.y2 / link);
      let best = -1;
      let bestDistance = link;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const list = starts.get(`${gx + ox}:${gy + oy}`);
          if (!list) continue;
          for (const j of list) {
            if (j === i) continue;
            const distance = Math.hypot(nodes[j].x1 - node.x2, nodes[j].y1 - node.y2);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = j;
            }
          }
        }
      }
      if (best >= 0) {
        nextOf[i] = best;
        hasPrev[best] = 1;
      }
    }
    /* Цепочка начинается там, где нет предыдущего сегмента — у истока. */
    const used = new Uint8Array(nodes.length);
    for (let i = 0; i < nodes.length; i += 1) {
      if (hasPrev[i] || used[i]) continue;
      const walk = [];
      let cursor = i;
      while (cursor >= 0 && !used[cursor]) {
        used[cursor] = 1;
        walk.push(cursor);
        cursor = nextOf[cursor];
      }
      if (walk.length > 0) chains.push(walk);
    }
    built = nodes.length;
  };

  const place = (index) => {
    chain[index] = chains.length > 0 ? Math.floor(rand() * chains.length) : -1;
    progress[index] = rand() * 0.6;
    age[index] = rand() * PARTICLE_LIFE;
    speed[index] = 0;
  };

  const updatePosition = (index) => {
    const chainIndex = chain[index];
    if (chainIndex < 0 || chainIndex >= chains.length) return;
    const walk = chains[chainIndex];
    const position = clamp(progress[index], 0, 0.999) * walk.length;
    const node = nodes[walk[Math.floor(position)]];
    const t = position - Math.floor(position);
    x[index] = node.x1 + (node.x2 - node.x1) * t;
    y[index] = node.y1 + (node.y2 - node.y1) * t;
    const length = Math.max(Math.hypot(node.x2 - node.x1, node.y2 - node.y1), 1e-6);
    dx[index] = (node.x2 - node.x1) / length;
    dy[index] = (node.y2 - node.y1) / length;
  };

  for (let i = 0; i < count; i += 1) {
    chain[i] = -1;
    place(i);
  }

  return {
    count,
    x,
    y,
    age,
    speed,
    dx,
    dy,
    stats: () => ({ count, nodes: nodes.length, chains: chains.length }),
    get nodes() {
      return nodes;
    },
    setSegments(segments) {
      buildChains(segments);
      for (let i = 0; i < count; i += 1) {
        place(i);
        updatePosition(i);
      }
    },
    step(dtSeconds, bounds) {
      if (!(dtSeconds > 0) || nodes.length === 0) return;
      const spanMeters = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
      for (let i = 0; i < count; i += 1) {
        const chainIndex = chain[i];
        if (chainIndex < 0 || chainIndex >= chains.length) {
          place(i);
          continue;
        }
        const walk = chains[chainIndex];
        const at = Math.min(walk.length - 1, Math.floor(clamp(progress[i], 0, 0.999) * walk.length));
        const node = nodes[walk[at]];
        /* Широкая река несёт быстрее: скорость узла — от ширины русла. */
        const flow = clamp(Math.log10(Math.max(node.width, 1) + 1) / 2.2, 0.08, 1);
        speed[i] = flow;
        const length = Math.max(Math.hypot(node.x2 - node.x1, node.y2 - node.y1), 1);
        progress[i] += (spanMeters * 0.07 * flow * dtSeconds) / (length * walk.length);
        age[i] += dtSeconds;
        /* Дошла до устья — ищем новое русло; застряла — тоже. */
        if (progress[i] >= 1 || age[i] > PARTICLE_LIFE * 3) place(i);
        updatePosition(i);
      }
    },
  };
};

/* ---------- 8. Дрейф плит ---------- */

/** Дольше этого за один шаг материк не проезжает: берег не «прыгает». */
export const DRIFT_CHUNK_MA = 0.25;

/**
 * Дрейф плит: материки едут.
 *
 * Скорость точки — из модели Эйлера v = ω × (r − r₀): та же формула, которой
 * тектоника вращает плиты, в миллиметрах в год. Один миллиметр в год — это
 * километр за миллион лет, поэтому за 50 млн лет континенты проходят тысячи
 * километров.
 *
 * Считать это шагами «перенеси поле на 0,25 млн лет» было бы ошибкой: каждый
 * перенос размазывает берег, и после сотни шагов материк расплывается в пятно.
 * Поэтому смещение берётся в замкнутой форме — это поворот всей плиты вокруг
 * своего полюса на угол ω·T. Поле читается из исходного рельефа один раз за
 * шаг, и берег остаётся берегом на любой срок.
 */
export const createDrift = ({ planet, elevation }) => {
  const { tectonics, erosion } = elevation.terrainFields();
  const grid = erosion.grid;
  const { w, h, stepX, stepY } = grid;
  const count = w * h;
  const plates = tectonics.plates;
  const plateField = tectonics.fields.plate;
  const base = Float32Array.from(grid.channelArray(ERO.elevation));
  const current = Float32Array.from(base);
  const cosOf = new Float64Array(plates.length);
  const sinOf = new Float64Array(plates.length);

  let meanSpeed = 0;
  for (let gy = 0; gy < h; gy += 1) {
    const my = (gy + 0.5) * stepY;
    for (let gx = 0; gx < w; gx += 1) {
      const index = gy * w + gx;
      const plate = plates[plateField[index]];
      const mx = (gx + 0.5) * stepX;
      /* Миллиметр в год: ω в радианах за миллион лет, радиус в метрах. */
      meanSpeed += Math.hypot(plate.omega * (my - plate.pivot.y) * 1e-3, plate.omega * (mx - plate.pivot.x) * 1e-3);
    }
  }
  meanSpeed /= count;

  /**
   * Выборка исходного рельефа. Он не меняется — меняется только место, откуда
   * его берут. По долготе мир замыкается: планета круглая, и материк, ушедший
   * за восточный край, — это тот же материк, что входит с западного. По широте
   * замыкать нечего: там полюс.
   */
  const sampleBase = (mx, my) => {
    const x = ((mx % planet.widthM) + planet.widthM) % planet.widthM;
    const fx = clamp(x / stepX - 0.5, 0, w - 1);
    const fy = clamp(my / stepY - 0.5, 0, h - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = x0 + 1 < w ? x0 + 1 : x0;
    const y1 = y0 + 1 < h ? y0 + 1 : y0;
    const tx = fx - x0;
    const ty = fy - y0;
    const top = base[y0 * w + x0] + (base[y0 * w + x1] - base[y0 * w + x0]) * tx;
    const bottom = base[y1 * w + x0] + (base[y1 * w + x1] - base[y1 * w + x0]) * tx;
    return top + (bottom - top) * ty;
  };

  let travelled = 0;
  let target = 0;
  let queueMa = 0;
  let rowsDone = 0;
  let coast = new Float32Array(0);

  /**
   * Берег: нулевая изолиния высот. По клеткам идёт «марширующие квадраты»
   * (marching squares): у клетки четыре угла — суша или море, всего 16 случаев,
   * и в каждом линия пересекает две известные стороны. На стыке четырёх клеток
   * бывает и две линии сразу («седло») — тогда смотрим на среднее по клетке.
   */
  const buildCoast = () => {
    const segments = [];
    const push = (ax, ay, bx, by) => segments.push(ax, ay, bx, by);
    for (let gy = 0; gy < h - 1; gy += 1) {
      for (let gx = 0; gx < w - 1; gx += 1) {
        const i = gy * w + gx;
        const a = current[i];
        const b = current[i + 1];
        const c = current[i + w + 1];
        const d = current[i + w];
        const corner = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
        if (corner === 0 || corner === 15) continue;
        const x0 = gx * stepX;
        const y0 = gy * stepY;
        const x1 = x0 + stepX;
        const y1 = y0 + stepY;
        const topX = x0 + (a / (a - b)) * stepX;
        const rightY = y0 + (b / (b - c)) * stepY;
        const bottomX = x0 + (d / (d - c)) * stepX;
        const leftY = y0 + (a / (a - d)) * stepY;
        switch (corner) {
          case 1: case 14: push(topX, y0, x0, leftY); break;
          case 2: case 13: push(x1, rightY, topX, y0); break;
          case 3: case 12: push(x1, rightY, x0, leftY); break;
          case 4: case 11: push(x1, rightY, x1, y1); break;
          case 6: case 9: push(topX, y0, bottomX, y1); break;
          case 7: case 8: push(x0, leftY, bottomX, y1); break;
          case 5:
            if ((a + b + c + d) * 0.25 > 0) { push(topX, y0, x0, leftY); push(x1, rightY, x1, y1); }
            else { push(topX, y0, x1, rightY); push(x0, leftY, x1, y1); }
            break;
          case 10:
            if ((a + b + c + d) * 0.25 > 0) { push(topX, y0, x1, rightY); push(x0, leftY, x1, y1); }
            else { push(topX, y0, x0, leftY); push(x1, rightY, x1, y1); }
            break;
          default: break;
        }
      }
    }
    coast = Float32Array.from(segments);
  };

  /** Углы поворота по плитам на срок `millionYears`. */
  const prepare = () => {
    for (let p = 0; p < plates.length; p += 1) {
      const angle = plates[p].omega * target;
      cosOf[p] = Math.cos(angle);
      sinOf[p] = Math.sin(angle);
    }
  };

  const stepRows = (rows) => {
    for (let row = 0; row < rows && rowsDone < h; row += 1) {
      const gy = rowsDone;
      const my = (gy + 0.5) * stepY;
      for (let gx = 0; gx < w; gx += 1) {
        const index = gy * w + gx;
        const mx = (gx + 0.5) * stepX;
        /* Откуда приехала порода: обратный поворот вокруг полюса плиты.
           Плита плиты рознь: точка, откуда взята порода, может лежать уже на
           соседней плите. Тогда считать надо по её повороту — иначе у берега
           собирается порода «не оттуда», и граница плит размазывается. Двух
           уточнений хватает: скорости соседей отличаются в разы, а не на
           проценты. */
        let id = plateField[index];
        let sourceX = mx;
        let sourceY = my;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const plate = plates[id];
          const dx = mx - plate.pivot.x;
          const dy = my - plate.pivot.y;
          const c = cosOf[id];
          const s = sinOf[id];
          sourceX = plate.pivot.x + dx * c + dy * s;
          sourceY = plate.pivot.y - dx * s + dy * c;
          const wrapped = ((sourceX % planet.widthM) + planet.widthM) % planet.widthM;
          const other = plateField[Math.min(h - 1, Math.max(0, Math.floor(sourceY / stepY))) * w
            + Math.min(w - 1, Math.max(0, Math.floor(wrapped / stepX)))];
          if (other === id) break;
          id = other;
        }
        current[index] = sampleBase(sourceX, sourceY);
      }
      rowsDone += 1;
    }
    if (rowsDone >= h) {
      travelled = target;
      rowsDone = 0;
      buildCoast();
    }
  };

  buildCoast();
  const drift = {
    grid,
    ma: () => travelled,
    velocityAt(mx, my) {
      const gx = clamp(Math.floor(mx / stepX), 0, w - 1);
      const gy = clamp(Math.floor(my / stepY), 0, h - 1);
      const index = gy * w + gx;
      const plate = plates[plateField[index]];
      const x = -plate.omega * (my - plate.pivot.y) * 1e-3;
      const y = plate.omega * (mx - plate.pivot.x) * 1e-3;
      return { x, y, speed: Math.hypot(x, y) };
    },
    /** Берег будущего мира: отрезки в метрах карты. */
    coast: () => coast,
    heightAt: (mx, my) => sampleBase(mx, my),
    enqueue(millionYears) {
      if (millionYears > 0) queueMa = Math.min(queueMa + millionYears, 40);
    },
    /** Досчитать поворот в отведённое время: поле переносится строками. */
    work(budgetMs = 4) {
      const deadline = now() + budgetMs;
      while (true) {
        if (rowsDone === 0 && queueMa > 0) {
          target = travelled + Math.min(queueMa, DRIFT_CHUNK_MA * 4);
          queueMa = 0;
          prepare();
        }
        if (rowsDone === 0 && queueMa <= 0 && target === travelled) return false;
        stepRows(6);
        if (now() >= deadline) return true;
      }
    },
    /** Полный шаг разом — для проверок. */
    advance(millionYears) {
      if (!(millionYears > 0)) return;
      target = travelled + millionYears;
      prepare();
      stepRows(h);
    },
    reset() {
      current.set(base);
      travelled = 0;
      target = 0;
      queueMa = 0;
      rowsDone = 0;
      buildCoast();
    },
    stats: () => ({
      ma: travelled,
      queuedMa: queueMa + Math.max(0, target - travelled),
      segments: coast.length / 4,
      meanSpeedMmYear: meanSpeed,
      cells: count,
    }),
  };
  return drift;
};

/* ---------- 9. Живой мир целиком ---------- */

/**
 * Живой мир: часы, погода, огни, вулканы, сияние и дрейф в одном узле.
 *
 * Всё, что дороже кадра, шагает долями: `advance` отмечает, сколько часов (или
 * миллионов лет) надо прожить, а `work` доводит перенос по строкам под
 * отведённое время. Так вид остаётся быстрым, а мир — живым.
 */
export const createLivingWorld = ({ planet, elevation, climate, hydro, seed = 0, clock }) => {
  const salt = hashSeed(`alive|${seed}`);
  const time = clock ?? createClock();
  const weather = createWeather({ planet, climate, seed: salt });
  const lights = createLights({ planet, climate, hydro, seed: salt });
  const volcanoes = createVolcanoes({ planet, elevation, seed: salt });
  const aurora = createAurora({ seed: salt });
  const drift = createDrift({ planet, elevation });
  const wind = createFlowField({ count: 900, seed: salt + 3, reference: WIND_REFERENCE });
  const currents = createFlowField({ count: 520, seed: salt + 11, reference: 1 });
  const rivers = createRiverFlow({ count: 520, seed: salt + 23 });
  const span = { minX: 0, minY: 0, maxX: 1, maxY: 1, mpp: 1 };

  weather.sync(time);

  const windAt = (mx, my, out = { x: 0, y: 0 }) => {
    const { lat } = metersToGeo(planet, mx, my);
    const itcz = 8 * (julyWeight(time.dayOfYear()) * 2 - 1);
    const prevailing = prevailingWind(lat, itcz);
    /* Муссонная добавка: летом над нагретым материком ветер разворачивается. */
    const speed = windSpeedAt(lat) * (1 + 0.35 * Math.abs(itcz) / 8 * (Math.abs(lat) < 35 ? 1 : 0));
    out.x = prevailing.x * speed;
    out.y = -prevailing.y * speed;
    return out;
  };

  const currentAt = (mx, my, out = { x: 0, y: 0 }) => {
    const fields = climate.fields();
    const grid = fields.grid;
    const index = grid.cellOf(mx, my);
    const u = grid.data[index * grid.channels + 14];
    const v = grid.data[index * grid.channels + 15];
    const magnitude = Math.hypot(u, v);
    if (magnitude < 1e-5) {
      out.x = 0;
      out.y = 0;
      return out;
    }
    /* Течение в климате записано направлением со «скоростью» в единицах поля —
       переводим её в долю от эталонного метра в секунду. */
    const factor = clamp(magnitude * 2.4, 0.12, 1.2) / magnitude;
    out.x = u * factor;
    out.y = v * factor;
    return out;
  };

  /* ---------- сшивка рек ---------- */

  const segments = [];
  const collectRivers = (mpp, minX, minY, maxX, maxY) => {
    segments.length = 0;
    if (!hydro.hasRegions(mpp, minX, minY, maxX, maxY)) return;
    hydro.forEachSegment(mpp, minX, minY, maxX, maxY, (x1, y1, x2, y2, width) => {
      if (segments.length >= 2000) return;
      /* Вода идёт сверху вниз: у какого конца сток больше, тот и ниже по реке. */
      const downhill = (hydro.fluxAt(mpp, x2, y2) ?? 0) >= (hydro.fluxAt(mpp, x1, y1) ?? 0);
      segments.push(downhill
        ? { x1, y1, x2, y2, width }
        : { x1: x2, y1: y2, x2: x1, y2: y1, width });
    });
    rivers.setSegments(segments);
  };

  const previous = { day: time.day, ma: time.ma };
  let elapsed = 0;

  const living = {
    planet,
    clock: time,
    weather,
    lights,
    volcanoes,
    aurora,
    drift,
    particles: { wind, currents, rivers },
    /** Название момента: словами для суток и года, числом для эпохи. */
    label() {
      if (time.mode === 'epoch') return `${time.ma.toFixed(1)} млн лет`;
      if (time.mode === 'year') return dateLabel(time.dayOfYear());
      return `${dateLabel(time.dayOfYear())} · ${hourLabel(time.hour)}`;
    },
    sunAt: (mx, my) => sunAt(planet, mx, my, time),
    windAt,
    currentAt,
    seasonMix: () => seasonMix(time.dayOfYear()),
    setView(next) {
      span.minX = next.minX;
      span.minY = next.minY;
      span.maxX = next.maxX;
      span.maxY = next.maxY;
      span.mpp = next.mpp;
      wind.setView(span);
      currents.setView(span);
      collectRivers(next.mpp, next.minX, next.minY, next.maxX, next.maxY);
    },
    /**
     * Шаг мира: часы уже прокручены, здесь отмечено, сколько времени надо
     * прожить погоде и дрейфу, и обновлены частицы. Тяжёлое считается не тут,
     * а в `work` — чтобы кадр не ждал переноса.
     */
    advance(dtSeconds) {
      elapsed += dtSeconds;
      const days = time.day - previous.day;
      const millionYears = Math.max(0, time.ma - previous.ma);
      previous.day = time.day;
      previous.ma = time.ma;
      weather.sync(time);
      weather.enqueue(days * HOURS_PER_DAY);
      drift.enqueue(millionYears);
      /* Частицы живут в секундах кадра: их ход — не примета времени мира, а
         скорость течения. Слишком большой шаг размазал бы след. */
      const dt = Math.min(dtSeconds, 0.1);
      volcanoes.step(dt);
      aurora.step(dt);
      wind.step(dt, windAt);
      currents.step(dt, currentAt);
      rivers.step(dt, span);
    },
    /** Досчитать тяжёлое под бюджет кадра: сначала погода, потом дрейф. */
    work(budgetMs = 6) {
      const started = now();
      const deadline = started + budgetMs;
      weather.work(Math.max(0.5, (deadline - now()) * 0.6));
      /* Дрейф нужен только в эпохе: в сутках и годах материк не движется. */
      if (time.mode === 'epoch') drift.work(Math.max(0.5, deadline - now()));
      return now() - started;
    },
    /** Сезон мира в долях года и день года: по ним живут снег и лёд. */
    season: () => seasonMix(time.dayOfYear()),
    dayOfYear: () => time.dayOfYear(),
    stats: () => ({
      elapsed,
      weather: weather.stats(),
      lights: lights.stats(),
      volcanoes: volcanoes.stats(),
      aurora: aurora.stats(),
      drift: drift.stats(),
      particles: {
        wind: wind.stats(),
        currents: currents.stats(),
        rivers: rivers.stats(),
      },
      clock: time.snapshot(),
      seed: salt,
    }),
  };
  return living;
};
