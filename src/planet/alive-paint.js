/* Живой мир на холсте: облака, ночь, огни, сияние, ветер, реки и дрейф.

   Что это. `alive.js` считает мир — здесь он рисуется. Вид зовёт `setView`
   при смене кадра, `step` каждый кадр и `draw` поверх тайлов; всё остальное —
   внутри.

   Как рисуется. Явления разного размера требуют разной цены, и цена выбрана
   по явлению:

     • Мягкие поля (облачность, терминатор, снежный покров) считаются не в
       экранных пикселях, а в маленьком буфере — 150–220 пикселей по ширине
       кадра — и растягиваются на холст с сглаживанием. Это и дешевле, и
       честнее: у облачной гряды нет резкого края, а у терминатора — ступеньки.
     • Огни городов — точки: они собираются в буфер того же рода и выводятся
       сложением (`lighter`), потому что свет складывается, а не заслоняет.
     • Вихри, сияние и дрейф — векторные: спираль урагана должна остаться
       спиралью на любом приближении, а берег будущего мира — линией.
     • Частицы (ветер, течения, реки) — тысячи чёрточек; они собираются в один
       путь на скорость, чтобы кадр стоил три вызова холста, а не три тысячи.

   Порядок наложения — как в природе: снег и лёд лежат на земле, облака плывут
   над ними, ночь гасит всё сразу, огни и сияние светят в темноте, ветер и
   реки — это уже условные знаки поверх картинки, а дрейф — будущее. */

import { clamp, geoToMeters, metersToGeo } from './scale.js';
import { julyWeight, subsolarPoint } from './alive.js';

/** Слои, которые можно включать и выключать: подпись, подсказка, id. */
export const ALIVE_LAYERS = [
  { id: 'clouds', name: 'Облака', hint: 'Облачность и вихри: циклоны идут по штормовым путям' },
  { id: 'rain', name: 'Осадки', hint: 'Дождь и снег там, где облака пересыщены' },
  { id: 'night', name: 'Ночь', hint: 'Терминатор, сумерки и ночная сторона планеты' },
  { id: 'lights', name: 'Огни', hint: 'Свет поселений на ночной стороне' },
  { id: 'aurora', name: 'Сияние', hint: 'Полярное сияние в авроральном овале' },
  { id: 'flows', name: 'Ветер и течения', hint: 'Частицы в поле ветра и океанских течений' },
  { id: 'rivers', name: 'Реки', hint: 'Течение воды по руслам от истока к устью' },
  { id: 'season', name: 'Снег и лёд', hint: 'Сезонный покров: снег и морской лёд' },
  { id: 'volcanoes', name: 'Вулканы', hint: 'Извержения и дым над вулканами' },
  { id: 'drift', name: 'Дрейф', hint: 'Берег будущего мира и движение плит' },
];

/** Расписание пересборки мягких буферов, миллисекунды. Облака и ночь
    пересобираются чаще (они движутся), сезон — раз в полторы секунды. */
const REBUILD_MS = { clouds: 140, night: 120, lights: 260, season: 1500 };

/** Ширина мягкого буфера: шире — дороже, уже — видно клетки. */
const SOFT_WIDTH = 176;
const LIGHT_WIDTH = 240;
/** При каком масштабе видны реки, вулканы и города: раньше — просто мелко. */
const RIVER_MPP = 3000;
const VOLCANO_MPP = 6000;

const makeBuffer = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return { canvas, ctx: canvas.getContext('2d'), width: canvas.width, height: canvas.height };
};

/**
 * Живой мир на холсте. Наружу — четыре вещи: задать кадр, шагнуть во времени,
 * нарисовать и рассказать, что нарисовано (для проверок и строки состояния).
 */
export const createAlivePainter = ({ living, planet, seasonFields }) => {
  const fields = seasonFields ?? null;
  const weather = living.weather;
  const options = {
    clouds: true,
    rain: true,
    night: true,
    lights: true,
    aurora: true,
    flows: true,
    rivers: true,
    season: true,
    volcanoes: true,
    drift: true,
  };
  const view = { level: -1, centerX: 0, centerY: 0, width: 0, height: 0, mpp: 1 };
  const bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  let signature = '';
  let elapsed = 0;
  let stamp = 0;
  const due = { clouds: -1e9, night: -1e9, lights: -1e9, season: -1e9 };
  const counters = { cloudRebuilds: 0, nightRebuilds: 0, lightRebuilds: 0, seasonRebuilds: 0 };

  let cloudBuffer = null;
  let nightBuffer = null;
  let lightBuffer = null;
  let seasonBuffer = null;

  /* Сглаженная ширина буфера по кадру: буфер должен повторять пропорции кадра,
     иначе растянутые облака поедут по диагонали. */
  const bufferHeight = (width) => clamp(Math.round((width * view.height) / Math.max(view.width, 1)), 32, 512);

  const screenX = (mx) => (mx - bounds.minX) / view.mpp;
  const screenY = (my) => (my - bounds.minY) / view.mpp;
  const inView = (mx, my, pad = 0) => mx > bounds.minX - pad && mx < bounds.maxX + pad
    && my > bounds.minY - pad && my < bounds.maxY + pad;

  /** Точка карты по пикселю мягкого буфера — общая для всех слоёв. */
  const sampleAt = (px, py, width, height, out) => {
    const sx = (px + 0.5) / width;
    const sy = (py + 0.5) / height;
    out.x = bounds.minX + sx * (bounds.maxX - bounds.minX);
    out.y = bounds.minY + sy * (bounds.maxY - bounds.minY);
    return out;
  };
  const point = { x: 0, y: 0 };

  /* ---------- мягкий слой: облака и осадки ---------- */

  const rebuildClouds = () => {
    const width = SOFT_WIDTH;
    const height = bufferHeight(width);
    if (!cloudBuffer || cloudBuffer.width !== width || cloudBuffer.height !== height) {
      cloudBuffer = makeBuffer(width, height);
    }
    const image = cloudBuffer.ctx.createImageData(width, height);
    const data = image.data;
    const weight = julyWeight(living.dayOfYear());
    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        sampleAt(px, py, width, height, point);
        const cover = weather.cloudAt(point.x, point.y);
        if (cover <= 0.03) continue;
        const sun = living.sunAt(point.x, point.y);
        const rain = options.rain ? weather.rainAt(point.x, point.y) : 0;
        const snowing = fields ? fields.temperatureAt(point.x, point.y, weight) < 0 : false;
        /* Днём облако белое и светлое сверху, на закате — розовое, ночью —
           тёмно-серое: ровно так же, как на снимках со спутника. */
        const day = sun.daylight;
        const glow = sun.twilight * 0.5;
        const wet = clamp(rain / 4, 0, 1);
        const red = 132 + 118 * day + 70 * glow - 40 * wet;
        const green = 138 + 112 * day + 26 * glow - 40 * wet;
        const blue = 152 + 100 * day - 66 * glow - 20 * wet;
        const index = (py * width + px) * 4;
        data[index] = clamp(red, 26, 255);
        data[index + 1] = clamp(green, 26, 255);
        data[index + 2] = clamp(blue, 26, 255);
        /* Плотность важнее цвета: тонкая облачность почти не видна, густая
           закрывает небо. Степенная кривая даёт облакам край — иначе даже
           лёгкая дымка затягивает всю карту серой плёнкой. */
        data[index + 3] = clamp(cover ** 1.5 * (0.95 + 0.2 * (snowing ? 1 : 0)) * 255, 0, 255);
      }
    }
    cloudBuffer.ctx.putImageData(image, 0, 0);
    due.clouds = elapsed;
    counters.cloudRebuilds += 1;
  };

  /* ---------- мягкий слой: ночь и сумерки ---------- */

  const rebuildNight = () => {
    const width = SOFT_WIDTH;
    const height = bufferHeight(width);
    if (!nightBuffer || nightBuffer.width !== width || nightBuffer.height !== height) {
      nightBuffer = makeBuffer(width, height);
    }
    const image = nightBuffer.ctx.createImageData(width, height);
    const data = image.data;
    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        sampleAt(px, py, width, height, point);
        const sun = living.sunAt(point.x, point.y);
        const index = (py * width + px) * 4;
        if (sun.altitude > 6) continue;
        /* Ночь синяя, заря — тёплая: цвет берётся из высоты Солнца, а не из
           отдельной картинки. Заря узкая (ширина — градусы высоты Солнца):
           широкий тёплый пояс превратил бы планету в кольцо. */
        const golden = clamp(1 - Math.abs(sun.altitude + 1) / 3.5, 0, 1);
        const dark = clamp((-sun.altitude + 4) / 14, 0, 1);
        data[index] = clamp(10 + 130 * golden, 0, 255);
        data[index + 1] = clamp(18 + 50 * golden, 0, 255);
        data[index + 2] = clamp(42 - 16 * golden, 0, 255);
        data[index + 3] = clamp((dark * 0.78 + golden * 0.12) * 255, 0, 255);
      }
    }
    nightBuffer.ctx.putImageData(image, 0, 0);
    due.night = elapsed;
    counters.nightRebuilds += 1;
  };

  /* ---------- мягкий слой: снег, лёд и зелень ---------- */

  const rebuildSeason = () => {
    if (!fields) return;
    const width = SOFT_WIDTH;
    const height = bufferHeight(width);
    if (!seasonBuffer || seasonBuffer.width !== width || seasonBuffer.height !== height) {
      seasonBuffer = makeBuffer(width, height);
    }
    const image = seasonBuffer.ctx.createImageData(width, height);
    const data = image.data;
    const weight = julyWeight(living.dayOfYear());
    const summer = clamp((living.seasonMix() + 1) / 2, 0, 1);
    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        sampleAt(px, py, width, height, point);
        const snow = fields.snowAt(point.x, point.y, weight);
        const ice = fields.iceAt(point.x, point.y, weight);
        const index = (py * width + px) * 4;
        if (snow > 0.02) {
          /* Снег лежит на земле и не перекрывает её целиком: сквозь него видно
             рельеф, поэтому плотность умеренная. */
          data[index] = 246;
          data[index + 1] = 250;
          data[index + 2] = 255;
          data[index + 3] = clamp(snow * 210, 0, 210);
          continue;
        }
        if (ice > 0.02) {
          data[index] = 214;
          data[index + 1] = 236;
          data[index + 2] = 248;
          data[index + 3] = clamp(ice * 190, 0, 190);
          continue;
        }
        /* Умеренные широты: летом трава зеленее, зимой — бурее. Признак
           слабый, но по нему видно, что год идёт. */
        const temperature = fields.temperatureAt(point.x, point.y, weight);
        const green = clamp((temperature - 1) / 16, 0, 1) * clamp((26 - temperature) / 10, 0, 1);
        const tint = green * (0.1 + 0.08 * summer);
        if (tint > 0.01) {
          data[index] = 96;
          data[index + 1] = 150;
          data[index + 2] = 74;
          data[index + 3] = clamp(tint * 255, 0, 90);
        }
      }
    }
    seasonBuffer.ctx.putImageData(image, 0, 0);
    due.season = elapsed;
    counters.seasonRebuilds += 1;
  };

  /* ---------- мягкий слой: огни городов ---------- */

  const rebuildLights = () => {
    const width = LIGHT_WIDTH;
    const height = bufferHeight(width);
    if (!lightBuffer || lightBuffer.width !== width || lightBuffer.height !== height) {
      lightBuffer = makeBuffer(width, height);
    }
    const ctx = lightBuffer.ctx;
    ctx.clearRect(0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    for (const light of living.lights.points) {
      if (!inView(light.x, light.y, spanX * 0.05)) continue;
      const sun = living.sunAt(light.x, light.y);
      const dusk = sun.lights;
      if (dusk <= 0.02) continue;
      /* Мерцание: у города свой ритм, и он не совпадает с соседним. */
      const twinkle = 0.86 + 0.14 * Math.sin(stamp * 1.7 + light.twinkle);
      const brightness = clamp(light.size * dusk * twinkle, 0, 1.4);
      const px = Math.round(((light.x - bounds.minX) / spanX) * width);
      const py = Math.round(((light.y - bounds.minY) / spanY) * height);
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const x = px + ox;
          const y = py + oy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const fall = ox === 0 && oy === 0 ? 1 : 0.42;
          const index = (y * width + x) * 4;
          data[index] = clamp(data[index] + 255 * brightness * fall, 0, 255);
          data[index + 1] = clamp(data[index + 1] + 214 * brightness * fall, 0, 255);
          data[index + 2] = clamp(data[index + 2] + 150 * brightness * fall, 0, 255);
          data[index + 3] = clamp(data[index + 3] + 255 * brightness * fall, 0, 255);
        }
      }
    }
    ctx.putImageData(image, 0, 0);
    due.lights = elapsed;
    counters.lightRebuilds += 1;
  };

  /* ---------- вихри ---------- */

  const drawSystems = (ctx) => {
    /* Масштаб ветра: на обзорном уровне спираль урагана уже видна, а на
       предельном приближении она вылезает за кадр — рисуем только то, что
       помещается. */
    for (const system of weather.systems) {
      const radius = system.radius / view.mpp;
      if (radius < 8 || !inView(system.x, system.y, system.radius * 2.4)) continue;
      const cx = screenX(system.x);
      const cy = screenY(system.y);
      const spin = system.spin;
      const bands = system.kind === 'hurricane' ? 5 : 6;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      /* Полосы идут по логарифмической спирали: r растёт, угол отстаёт. */
      for (let band = 0; band < bands; band += 1) {
        const offset = (band / bands) * Math.PI * 2 + system.phase;
        ctx.beginPath();
        for (let step = 0; step <= 14; step += 1) {
          const t = 0.22 + (step / 14) * 0.78;
          const angle = offset + spin * t * 3.6;
          const x = cx + Math.cos(angle) * radius * t;
          const y = cy + Math.sin(angle) * radius * t * 0.82;
          if (step === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(238,246,255,${clamp(0.2 * system.strength, 0, 0.5)})`;
        ctx.lineWidth = Math.max(1.4, radius * (system.kind === 'hurricane' ? 0.1 : 0.07));
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      /* Глаз урагана: у тропического он чистый, у циклона — просто сгусток. */
      const eye = radius * (system.kind === 'hurricane' ? 0.16 : 0.24);
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(eye * 3, 3));
      gradient.addColorStop(0, system.kind === 'hurricane'
        ? 'rgba(12,22,34,0.55)'
        : 'rgba(226,238,250,0.34)');
      gradient.addColorStop(1, 'rgba(226,238,250,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(eye * 3, 3), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  /* ---------- осадки ---------- */

  const drawRain = (ctx) => {
    if (!options.rain || view.mpp > 6000) return;
    const weight = julyWeight(living.dayOfYear());
    const vector = { x: 0, y: 0 };
    const columns = clamp(Math.round(view.width / 26), 8, 42);
    const rows = clamp(Math.round(view.height / 26), 6, 28);
    const spanX = (bounds.maxX - bounds.minX) / columns;
    const spanY = (bounds.maxY - bounds.minY) / rows;
    const rain = [];
    const snow = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const mx = bounds.minX + (column + 0.5) * spanX;
        const my = bounds.minY + (row + 0.5) * spanY;
        const intensity = weather.rainAt(mx, my);
        if (intensity < 0.35) continue;
        const snowing = fields ? fields.temperatureAt(mx, my, weight) < 0 : false;
        const x = screenX(mx);
        const y = screenY(my);
        /* Фаза капли считается от координаты в мире: поле осадков не «едет»
           вместе с картой при переносе. */
        const phase = (((mx * 0.00037 + my * 0.00021 + stamp * 0.45) % 1) + 1) % 1;
        const fall = 26 * phase;
        living.windAt(mx, my, vector);
        const lean = clamp(vector.x * 2.4, -14, 14);
        if (snowing) snow.push(x, y + 8 - fall * 0.5, intensity);
        else rain.push(x, y + 10 - fall, lean, 10 + intensity * 4);
      }
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < rain.length; i += 4) {
      const x = rain[i];
      const y = rain[i + 1];
      const lean = rain[i + 2];
      const length = rain[i + 3];
      ctx.moveTo(x, y);
      ctx.lineTo(x + lean * 0.5, y + length);
    }
    ctx.strokeStyle = 'rgba(186,212,240,0.42)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < snow.length; i += 3) {
      const x = snow[i];
      const y = snow[i + 1];
      /* Снежинка — короткий штрих с круглым концом: точка без кругов. */
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.6, y + 0.6);
    }
    ctx.strokeStyle = 'rgba(236,244,252,0.55)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
  };

  /* ---------- полярное сияние ---------- */

  const drawAurora = (ctx) => {
    const strength = living.aurora.activity();
    if (strength < 0.25) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const hemisphere of [1, -1]) {
      for (let curtain = 0; curtain < 6; curtain += 1) {
        const latBase = (67 - strength * 6 + curtain * 1.6) * hemisphere;
        const points = [];
        for (let step = 0; step <= 26; step += 1) {
          const mx = bounds.minX + ((step + 0.5) / 26) * (bounds.maxX - bounds.minX);
          const lon = (mx / planet.widthM) * 360 - 180;
          const lat = latBase + 2.4 * Math.sin((lon / 180) * Math.PI * 3 + stamp * 0.5 + curtain);
          const my = ((90 - lat) / 180) * planet.heightM;
          const glow = inView(mx, my, planet.heightM * 0.12)
            ? living.aurora.at(mx, my, planet, living.sunAt(mx, my))
            : 0;
          points.push(screenX(mx), screenY(my), glow);
        }
        /* Свечение ищем по всей дуге, а рисуем одной-двумя линиями: градиент
           на каждую точку стоил бы дороже всего остального кадра. */
        let average = 0;
        for (let i = 2; i < points.length; i += 3) average += points[i];
        average /= Math.max(1, points.length / 3);
        if (average < 0.05) continue;
        const height = clamp((260_000 + 120_000 * Math.sin(stamp * 0.7 + curtain)) / view.mpp, 6, 160);
        const paint = (dy, width, alpha, color) => {
          ctx.beginPath();
          for (let i = 0; i < points.length; i += 3) {
            const x = points[i];
            const y = points[i + 1] - dy * hemisphere;
            if (points[i + 2] < 0.04) continue;
            if (i === 0 || points[i - 1] < 0.04) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = color.replace('$A', String(clamp(alpha, 0, 1)));
          ctx.lineWidth = width;
          ctx.stroke();
        };
        /* Снизу — зелёная кромка, выше — сине-фиолетовый полог: так выглядит
           сияние и на снимках из-под облаков. */
        paint(0, Math.max(2, height * 0.22), average * 0.5, 'rgba(122,255,190,$A)');
        paint(height * 0.45, Math.max(3, height * 0.4), average * 0.24, 'rgba(150,200,255,$A)');
        paint(height * 0.9, Math.max(3, height * 0.5), average * 0.16, 'rgba(200,140,255,$A)');
      }
    }
    ctx.restore();
  };

  /* ---------- ветер и течения ---------- */

  const drawStreaks = (ctx, flow, { color, reference, maxLength, minLength, maxCount }) => {
    const from = Math.max(0, flow.count - maxCount);
    const buckets = [[], [], []];
    for (let i = from; i < flow.count; i += 1) {
      const x = screenX(flow.x[i]);
      const y = screenY(flow.y[i]);
      if (x < -20 || y < -20 || x > view.width + 20 || y > view.height + 20) continue;
      const norm = clamp(flow.speed[i] / reference, 0, 1.6);
      const bucket = norm > 0.95 ? 2 : norm > 0.45 ? 1 : 0;
      const length = minLength + (maxLength - minLength) * clamp(norm, 0, 1.4);
      buckets[bucket].push(x, y, flow.dx[i] * length, flow.dy[i] * length);
    }
    ctx.save();
    ctx.lineCap = 'round';
    for (let bucket = 0; bucket < 3; bucket += 1) {
      const list = buckets[bucket];
      if (list.length === 0) continue;
      ctx.beginPath();
      for (let i = 0; i < list.length; i += 4) {
        ctx.moveTo(list[i], list[i + 1]);
        ctx.lineTo(list[i] + list[i + 2], list[i + 1] + list[i + 3]);
      }
      const alpha = [0.18, 0.3, 0.44][bucket];
      ctx.strokeStyle = `rgba(${color},${alpha})`;
      ctx.lineWidth = [1, 1.3, 1.6][bucket];
      ctx.stroke();
    }
    ctx.restore();
  };

  /* ---------- вулканы ---------- */

  const drawVolcanoes = (ctx) => {
    if (view.mpp > VOLCANO_MPP) return;
    const vector = { x: 0, y: 0 };
    const list = living.volcanoes.visible(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
    for (const site of list) {
      const intensity = living.volcanoes.intensity(site);
      if (intensity < 0.03) continue;
      const sun = living.sunAt(site.x, site.y);
      const x = screenX(site.x);
      const y = screenY(site.y);
      living.windAt(site.x, site.y, vector);
      const drift = vector.x / Math.max(Math.hypot(vector.x, vector.y), 1);
      ctx.save();
      /* Дым уходит по ветру: столб стоит, а шлейф ложится в сторону. */
      ctx.globalCompositeOperation = 'source-over';
      for (let puff = 0; puff < 7; puff += 1) {
        const t = puff / 6;
        const rise = (1 - t) * 9 - t * 2;
        const px = x + drift * t * 26;
        const py = y - 8 * t - rise * 0.6 + Math.sin(stamp * 2 + puff + site.phase) * 1.6;
        const radius = 2.4 + t * 7;
        const alpha = clamp(intensity * (0.5 - t * 0.34) * (0.5 + 0.5 * (1 - sun.daylight)), 0, 0.5);
        ctx.fillStyle = `rgba(206,198,190,${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      /* Раскалённое вулканическое окно: в темноте его видно издалека. */
      const glow = clamp(intensity * (0.35 + 0.65 * sun.night), 0, 1);
      if (glow > 0.04) {
        ctx.globalCompositeOperation = 'lighter';
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 14);
        gradient.addColorStop(0, `rgba(255,150,60,${clamp(glow * 0.9, 0, 0.9)})`);
        gradient.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  };

  /* ---------- дрейф ---------- */

  const drawDrift = (ctx) => {
    const drift = living.drift;
    if (drift.ma() < 0.05) return;
    const coast = drift.coast();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    const stride = coast.length > 24_000 ? 8 : 4;
    for (let i = 0; i < coast.length; i += stride) {
      const x1 = coast[i];
      const y1 = coast[i + 1];
      if (!inView(x1, y1, view.mpp * 40)) continue;
      ctx.moveTo(screenX(x1), screenY(y1));
      ctx.lineTo(screenX(coast[i + 2]), screenY(coast[i + 3]));
    }
    ctx.strokeStyle = 'rgba(120,214,255,0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    /* Стрелки на решётке: куда едет плита и с какой скоростью. */
    const stepX = (bounds.maxX - bounds.minX) / 7;
    const stepY = (bounds.maxY - bounds.minY) / 4;
    ctx.beginPath();
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 7; column += 1) {
        const mx = bounds.minX + (column + 0.5) * stepX;
        const my = bounds.minY + (row + 0.5) * stepY;
        const velocity = drift.velocityAt(mx, my);
        if (velocity.speed < 1) continue;
        const x = screenX(mx);
        const y = screenY(my);
        const scale = clamp(velocity.speed / 60, 0.25, 1.6) * 26;
        const dx = (velocity.x / velocity.speed) * scale;
        const dy = (velocity.y / velocity.speed) * scale;
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx, y + dy);
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(x + dx - dy * 0.28, y + dy + dx * 0.28);
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(x + dx + dy * 0.28, y + dy - dx * 0.28);
      }
    }
    ctx.strokeStyle = 'rgba(255,236,168,0.42)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  };

  /* ---------- солнце под горизонтом и над ним ---------- */

  const drawSun = (ctx) => {
    const zenith = subsolarPoint(living.clock.hour, living.dayOfYear());
    const { x, y } = geoToMeters(planet, zenith.lon, zenith.lat);
    if (!inView(x, y, view.mpp * 40)) return;
    const cx = screenX(x);
    const cy = screenY(y);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26);
    gradient.addColorStop(0, 'rgba(255,246,210,0.75)');
    gradient.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,252,236,0.9)';
    ctx.fill();
    /* Лучи: восемь коротких штрихов — так зенит узнаётся с одного взгляда. */
    ctx.beginPath();
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = (ray / 8) * Math.PI * 2 + stamp * 0.25;
      ctx.moveTo(cx + Math.cos(angle) * 9, cy + Math.sin(angle) * 9);
      ctx.lineTo(cx + Math.cos(angle) * 14, cy + Math.sin(angle) * 14);
    }
    ctx.strokeStyle = 'rgba(255,244,196,0.7)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  };

  /* ---------- наружу ---------- */

  return {
    options,
    /**
     * Кадр: куда смотрит вид. При смене кадра мягкие буферы пересобираются —
     * иначе облака «прилипли» бы к экрану, а не к миру.
     */
    setView(next) {
      const signature2 = `${next.level}|${Math.round(next.centerX / Math.max(next.mpp, 1))}|${Math.round(next.centerY / Math.max(next.mpp, 1))}|${Math.round(next.width)}|${Math.round(next.height)}`;
      view.level = next.level;
      view.centerX = next.centerX;
      view.centerY = next.centerY;
      view.width = Math.max(1, next.width);
      view.height = Math.max(1, next.height);
      view.mpp = next.mpp;
      bounds.minX = view.centerX - (view.width / 2) * view.mpp;
      bounds.minY = view.centerY - (view.height / 2) * view.mpp;
      bounds.maxX = view.centerX + (view.width / 2) * view.mpp;
      bounds.maxY = view.centerY + (view.height / 2) * view.mpp;
      if (signature2 !== signature) {
        signature = signature2;
        due.clouds = -1e9;
        due.night = -1e9;
        due.lights = -1e9;
        due.season = -1e9;
        living.setView({ minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY, mpp: view.mpp });
      }
    },
    setOptions(patch) {
      Object.assign(options, patch);
    },
    /** Шаг анимации: часы мира двигает вид, здесь — только время рисования. */
    step(dtSeconds) {
      if (!(dtSeconds > 0)) return;
      elapsed += dtSeconds * 1000;
      stamp += dtSeconds;
      if (options.clouds && elapsed - due.clouds > REBUILD_MS.clouds) rebuildClouds();
      if (options.night && elapsed - due.night > REBUILD_MS.night) rebuildNight();
      if (options.lights && elapsed - due.lights > REBUILD_MS.lights) rebuildLights();
      if (options.season && fields && elapsed - due.season > REBUILD_MS.season) rebuildSeason();
    },
    /** Нарисовать всё живое поверх тайлов. */
    draw(ctx, patch) {
      if (patch) Object.assign(options, patch);
      if (options.season && seasonBuffer) ctx.drawImage(seasonBuffer.canvas, 0, 0, view.width, view.height);
      if (options.clouds && cloudBuffer) ctx.drawImage(cloudBuffer.canvas, 0, 0, view.width, view.height);
      if (options.clouds) drawSystems(ctx);
      if (options.rain) drawRain(ctx);
      if (options.night && nightBuffer) ctx.drawImage(nightBuffer.canvas, 0, 0, view.width, view.height);
      if (options.night) drawSun(ctx);
      if (options.aurora) drawAurora(ctx);
      if (options.lights && lightBuffer) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(lightBuffer.canvas, 0, 0, view.width, view.height);
        ctx.restore();
      }
      if (options.flows) {
        drawStreaks(ctx, living.particles.wind, { color: '150,226,255', reference: 12, minLength: 4, maxLength: 18, maxCount: 900 });
        drawStreaks(ctx, living.particles.currents, { color: '96,190,222', reference: 1, minLength: 6, maxLength: 22, maxCount: 520 });
      }
      if (options.rivers && view.mpp <= RIVER_MPP) {
        drawStreaks(ctx, living.particles.rivers, { color: '150,222,255', reference: 1, minLength: 5, maxLength: 16, maxCount: 520 });
      }
      if (options.volcanoes) drawVolcanoes(ctx);
      if (options.drift) drawDrift(ctx);
    },
    stats: () => ({
      ...counters,
      buffers: {
        clouds: cloudBuffer ? `${cloudBuffer.width}×${cloudBuffer.height}` : '—',
        night: nightBuffer ? `${nightBuffer.width}×${nightBuffer.height}` : '—',
        lights: lightBuffer ? `${lightBuffer.width}×${lightBuffer.height}` : '—',
        season: seasonBuffer ? `${seasonBuffer.width}×${seasonBuffer.height}` : '—',
      },
      particles: {
        wind: living.particles.wind.count,
        currents: living.particles.currents.count,
        rivers: living.particles.rivers.count,
      },
      view: { level: view.level, mpp: view.mpp },
    }),
  };
};
