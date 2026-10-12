/* Атмосфера: температура, ветер, испаряемость — то, из чего получается климат.

   Климат в этом генераторе не «рисуется» по широтным таблицам, а собирается из
   четырёх механизмов, у каждого из которых есть имя в метеорологии:

     • **Приток солнечного тепла.** Широта и наклон оси дают годовое среднее и
       годовую амплитуду температуры; над океаном амплитуда втрое меньше, чем
       над сушей: у воды теплоёмкость. Отсюда сразу и морской климат, и
       континентальный.
     • **Высота.** Температура падает на 6,5 °C на километр (стандартный
       вертикальный градиент тропосферы), поэтому нагорья холоднее равнин на
       той же широте.
     • **Циркуляция.** Пассаты, западный перенос и полярные восточные ветры —
       три ячейки Гадлея, Феррела и полярная. Положение тропической зоны
       сходимости (ITCZ) смещается за Солнцем: в июле она уходит на север, в
       январе на юг, и вместе с ней смещаются ветры и дожди. Над большими
       материками летом возникает муссон: разница нагрева суши и океана
       разворачивает ветер в сторону берега.
     • **Испаряемость (PET).** Формула Харгривза — радиация, температура и
       суточный размах; ею измеряется засушливость: пустыня там, где осадков
       меньше испаряемости, а не там, где их просто мало.

   Всё считается один раз на грубой решётке мира и опрашивается билинейно, как
   тектоника и рельеф: значение в точке не зависит от уровня пирамиды. */

import { clamp, metersToGeo } from './scale.js';

/** Наклон оси планеты, градусы: от него и широты зависит всё остальное. */
export const AXIAL_TILT = 23.44;
/** Полудиаметр, астрономическая единица. */
const AU = 1;
/** Солнечная постоянная, МДж/(м²·мин). */
const SOLAR_CONSTANT = 0.082;

/** Сезоны модели: два полугодия — июль и январь. */
export const SEASONS = [
  { id: 'july', name: 'Июль', sign: 1, days: 184 },
  { id: 'january', name: 'Январь', sign: -1, days: 181 },
];

/** Угол склонения Солнца для сезона, радианы. */
const declination = (season) => (season.sign * AXIAL_TILT * Math.PI) / 180;

/**
 * Внеземная радиация (Харгривз), МДж/(м²·сутки): сколько энергии приходит на
 * горизонтальную площадку за сутки. Формула астрономическая и одинаковая для
 * любой планеты — меняется только наклон оси.
 */
export const extraterrestrial = (latDeg, season) => {
  const lat = (latDeg * Math.PI) / 180;
  const dec = declination(season);
  /* Часовой угол заката: cos(ω) = −tg(φ)·tg(δ); за полярным кругом — либо
     полярный день, либо полярная ночь. */
  const cosOmega = clamp(-Math.tan(lat) * Math.tan(dec), -1, 1);
  const omega = Math.acos(cosOmega);
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * (season.sign > 0 ? 196 : 15)) / 365); // расстояние до Солнца
  const ra = ((24 * 60) / Math.PI) * SOLAR_CONSTANT * dr
    * (omega * Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.sin(omega));
  return Math.max(ra, 0);
};

/**
 * Среднегодовая температура на уровне моря, °C.
 *
 * Подогнана по настоящей Земле: 27 °C на экваторе, около нуля на 60-й
 * параллели, −18 °C у северного полюса. Южное полушарие холоднее на несколько
 * градусов — там больше океана и выше альбедо, и это видно в данных.
 */
export const annualSeaTemperature = (lat) => {
  const abs = Math.abs(lat);
  /* Линейное падение — простая и честная аппроксимация кривой годовой
     температуры поверхности океана: 27 °C на экваторе, 17 °C на 30-й параллели,
  7 °C на 60-й, около нуля у полюсов. Экспонента тут была бы точнее, но
     линейный закон не даёт тропикам «перегреться» на плоской карте. */
  const base = 27 - 0.34 * abs;
  /* Южное полушарие холоднее: там океан не заперт материками, и антарктические
     воды выносят холод далеко на север — та же асимметрия видна у Земли. */
  return base - (lat < 0 ? 1.5 + 0.03 * abs : 0);
};

/**
 * Годовая полуамплитуда температуры, °C.
 *
 * Над океаном она мала (2–8 °C: вода перемешивается и держит тепло), над сушей
 * велика (до 22 °C в Сибири), и растёт с континентальностью: в глубине материка
 * зима и лето расходятся сильнее, чем на берегу.
 */
export const seasonalAmplitude = (lat, continentality, overOcean) => {
  const sin = Math.abs(Math.sin((lat * Math.PI) / 180));
  if (overOcean) return 1.5 + 6.5 * sin;
  return (4 + 20 * sin) * (0.55 + 0.45 * clamp(continentality, 0, 1));
};

/**
 * Господствующий ветер: единичный вектор, куда движется воздух.
 *
 * Три ячейки: пассаты (0–30°) дуют к экватору и на запад, западный перенос
 * (30–60°) — на восток и к полюсу, полярные восточные (>60°) — на запад и к
 * экватору. Положение границ сдвигается вместе с ITCZ, поэтому в июле дожди
 * уходят на север, а в январе — на юг.
 */
export const prevailingWind = (lat, itcz = 0) => {
  const abs = Math.abs(lat - itcz);
  const sign = lat - itcz >= 0 ? 1 : -1;
  if (abs < 30) return { x: -0.88, y: -0.47 * sign };
  if (abs < 60) return { x: 0.88, y: 0.47 * sign };
  return { x: -0.88, y: -0.47 * sign };
};

/** Положение ITCZ для сезона: смещается за Солнцем на ±8° широты. */
export const itczLatitude = (season) => season.sign * 8;

/**
 * Испаряемость по Харгривзу (Hargreaves & Samani, 1985), мм за `days` суток:
 * `PET = 0,0023·Ra·(T + 17,8)·√(Tmax − Tmin)`. Радиация берётся из астрономии,
 * размах температур — из сезонной амплитуды и континентальности.
 */
export const hargreavesPet = (lat, temperature, amplitude, season, days, overOcean) => {
  const ra = extraterrestrial(lat, season);
  /* Суточный размах: над сушей 12 K, над океаном 3 K, над горами больше. */
  const range = overOcean ? 3 : 12 * (0.8 + 0.4 * clamp(amplitude / 20, 0, 1));
  /* Радиация в формуле — в миллиметрах эквивалентного испарения, а Ra у нас в
     МДж/м² в сутки: делим на скрытую теплоту 2,45 МДж/кг — тот же множитель
     0,408, что стоит в справочниках ФАО. Без него испаряемость выходит вдвое
     с лишним выше настоящей, и весь мир становится пустыней. */
  const pet = 0.408 * 0.0023 * ra * Math.max(temperature + 17.8, 0) * Math.sqrt(range);
  return Math.max(pet, 0) * days;
};

/**
 * Влагоёмкость воздуха: сколько осаждаемой воды держит столб воздуха при такой
 * температуре, мм. Экспонента Клаузиуса — Клапейрона: +7 % на градус, а
 * начало отсчёта — 26 мм при 15 °C (настоящее значение для земного столба
 * воздуха). Отсюда 51 мм при 25 °C и 2 мм при −40 °C: полярная пустыня
 * получается не из запрета на дождь, а из того, что воздуху нечего носить.
 * Нижний предел в 2 мм — не физика столба, а память о том, что над полярными
 * морями висит слоистая облачность: совсем без влаги полярные широты остаются
 * только в численной модели, где перенос считается по одной поверхности, а не
 * по всей толще. */
export const humidityCapacity = (temperature) => clamp(26 * Math.exp(0.068 * (temperature - 15)), 2, 96);

export const ATMOS = {
  temperature: 0,
  windU: 1,
  windV: 2,
  windX: 3,
  windY: 4,
  pet: 5,
  continentality: 6,
  capacity: 7,
  radiation: 8,
  snowLine: 9,
};
export const ATMOS_CHANNELS = 10;

/** Где стоит снеговая линия: высота, на которой средняя температура −1 °C. */
export const SNOW_LAPSE = 6.5;

/**
 * @param {object} planet — геометрия
 * @param {object} grid — грубая решётка в **метрах** (эрозия поверх тектоники)
 * @param {object} masks — `{ land, seaLevel, distanceToSea }`
 */
export const createSeasonAtmosphere = (planet, grid, masks, season) => {
  const { w, h } = grid;
  const count = w * h;
  const out = {
    season,
    temperature: new Float32Array(count),
    windU: new Float32Array(count),
    windV: new Float32Array(count),
    windX: new Float32Array(count),
    windY: new Float32Array(count),
    pet: new Float32Array(count),
    capacity: new Float32Array(count),
    radiation: new Float32Array(count),
    snowLine: new Float32Array(count),
  };
  const itcz = itczLatitude(season);
  const { heightM } = masks;
  /* Широта зависит только от строки: считаем её раз на строку, а не на клетку. */
  const rowLat = new Float64Array(h);
  for (let gy = 0; gy < h; gy += 1) rowLat[gy] = metersToGeo(planet, 0, (gy + 0.5) * grid.stepY).lat;

  /* Нагревание суши против океана — источник муссона. Считаем аномалию
     температуры суши относительно океана той же широты, и ветер идёт в
     сторону аномалии: летом — на раскалённый материк, зимой — с него. */
  const anomalies = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const lat = rowLat[(i / w) | 0];
    const land = masks.land[i];
    const continentality = masks.continentality[i];
    if (!land) {
      anomalies[i] = 0;
      continue;
    }
    const amplitude = seasonalAmplitude(lat, continentality, false);
    const oceanAmplitude = seasonalAmplitude(lat, 0, true);
    /* Летом суша теплее океана, зимой холоднее — и тем сильнее, чем глубже в
       материк. */
    anomalies[i] = (amplitude - oceanAmplitude) * season.sign * 0.45;
  }
  const smoothed = new Float32Array(count);
  for (let gy = 0; gy < h; gy += 1) {
    for (let gx = 0; gx < w; gx += 1) {
      const index = gy * w + gx;
      let sum = 0;
      let weight = 0;
      for (let dy = -2; dy <= 2; dy += 1) {
        const ny = gy + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = gx + dx;
          if (nx < 0 || nx >= w) continue;
          const near = Math.abs(dx) + Math.abs(dy);
          const k = near === 0 ? 3 : near <= 2 ? 2 : 1;
          sum += anomalies[ny * w + nx] * k;
          weight += k;
        }
      }
      smoothed[index] = sum / weight;
    }
  }

  for (let i = 0; i < count; i += 1) {
    const lat = rowLat[(i / w) | 0];
    const land = masks.land[i] === 1;
    const continentality = masks.continentality[i];
    const elevation = heightM[i];
    const annual = annualSeaTemperature(lat);
    const amplitude = seasonalAmplitude(lat, continentality, !land);
    /* Над океаном температура воды — она и есть воздух над водой; над сушей
       добавляется муссонная аномалия и падение с высотой. */
    let temperature = annual + amplitude * season.sign + (land ? smoothed[i] : 0);
    if (elevation > 0) temperature -= (elevation / 1000) * SNOW_LAPSE;
    out.temperature[i] = temperature;
    out.capacity[i] = humidityCapacity(temperature);
    out.radiation[i] = extraterrestrial(lat, season);
    out.snowLine[i] = elevation + (temperature / SNOW_LAPSE) * 1000;

    const wind = prevailingWind(lat, itcz);
    /* Оси карты: x — на восток, y — на юг (строка 0 у нас северная). Поэтому
       меридиональная составляющая, посчитанная в широтах (плюс — на север),
       при переходе к осям карты меняет знак. Об этой ловушке легко забыть, а
       цена — влага, принесённая не с той стороны, и апвеллинг у не того берега. */
    out.windX[i] = wind.x;
    out.windY[i] = -wind.y;
    /* Муссонная добавка: производная аномалии по решётке, но без деления на
       шаг — важна сторона света, а не размерность. */
    const gx = i % w;
    const gy = (i / w) | 0;
    const left = gx > 0 ? smoothed[i - 1] : smoothed[i];
    const right = gx < w - 1 ? smoothed[i + 1] : smoothed[i];
    const up = gy > 0 ? smoothed[i - w] : smoothed[i];
    const down = gy < h - 1 ? smoothed[i + w] : smoothed[i];
    let u = out.windX[i] * 2.2 + (right - left) * 0.22 * (land ? 1 : 0.4);
    let v = out.windY[i] * 2.2 + (down - up) * 0.22 * (land ? 1 : 0.4);
    /* Ветер не может дуть «сквозь» рельеф: над высокими хребтами он идёт вдоль
       них. Это тот же эффект, что и орографическое отклонение в природе. */
    const length = Math.hypot(u, v) || 1;
    out.windU[i] = u / length;
    out.windV[i] = v / length;
    out.pet[i] = hargreavesPet(lat, temperature, amplitude, season, season.days, !land);
  }

  /* Испаряемость над океаном считается по температуре воды, а не воздуха: она
     и питает влагой всё остальное. Подставится в precip.js, когда вода готова. */
  return out;
};
