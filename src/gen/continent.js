/* ===========================================================
   Генератор континентов (чистая реализация, 2026-10-14).

   Замена удалённым генераторам. Четыре репозитория от владельца были
   отреверсированы (pipeline, а не код — копировать нельзя: у трёх нет
   лицензии, у Jimbly лицензия запрещает использование вне Worlds FRVR):

     • spectrum-art/Continent-Generator — архитектура «плиты → напряжение
       границ → возвышение от стресса → затенённый рельеф»;
     • blslade-neumont/procedural-continent-generator — сглаживание суши
       клеточным автоматом (идея проходов simplifyLand: суша с ≥6 соседями-
       водой тонет, вода с ≥6 соседями-сушей всплывает);
     • ianjsikes/continent-generator — широтные пояса ветра, осадки от ветра,
       температура от широты и высоты, реки стоком вниз по склону;
     • Jimbly/worlds-continent-gen — влажность с дождевой тенью, озёра во
       впадинах, шельф/впадины океана, классификация биомов, слои-поля
       (elev / humidity / river / classif) как отдельные виды карты.

   Всё ниже написано с нуля под проект на этих общеизвестных приёмах.

   Конвейер:
     1. seeded RNG из строки seed (FNV-1a + mulberry32) — детерминизм;
     2. литосферные плиты (центры с обёрткой по долготе, скорости, тип коры),
        domain warp ломает прямые границы Вороного;
     3. напряжение границ: конвергенция поднимает горы (× ridged-шум),
        дивергенция роет океанические впадины;
     4. возвышение: базовый fBm (периодический по долготе) + горы у границ,
        нормализация и уровень моря по процентилю (стабильная доля суши);
     5. клеточное сглаживание берегов (2 прохода);
     6. поля расстояний BFS: до океана (суша) и до суши (океан: шельф/глубины);
     7. климат: температура ← широта+высота; влажность ← fBm + близость океана
        + широтный пояс − дождевая тень с наветренной стороны (ветер по поясам);
     8. гидрология: D8-сток и аккумуляция потока → реки; впадины без стока
        с высокой влажностью → озёра;
     9. биомы (температура × влажность × высота) и затенённый рельеф → RGBA;
        те же поля отдаются слоями: biomes/elevation/moisture/temperature/plates.

   Вход: { seed } из слота (store.js хранит ещё width/height «мира», сетка
   генерации фиксированная GRID_W×GRID_H и масштабируется холстом).
   =========================================================== */

export const GRID_W = 384;
export const GRID_H = 192;
const PLATES = 14;

/* Все параметры четырёх отреверсированных конвейеров одним объектом.
   Дефолты = прежнее поведение; панель в виде карты меняет их на лету. */
export const DEFAULT_OPTIONS = {
  plates: PLATES,        // spectrum-art: plate count
  landShare: 0.38,       // spectrum-art: land threshold (доля суши)
  mountainHeight: 1,     // spectrum-art/Jimbly: высота гор и пиков (×)
  mountainRadius: 14,    // spectrum-art: ширина зоны гор у границ плит
  warp: 1,               // spectrum-art/Jimbly: сила domain warp берегов (×)
  roughness: 1,          // spectrum-art/ianjsikes: вес ridged/детального шума (×)
  fossil: 0.35,          // spectrum-art: древние (fossil) хребты внутри плит
  plumes: 3,             // spectrum-art: число мантийных плюмов-поднятий
  rainshadow: 0.35,      // Jimbly: сила дождевой тени (0..1)
  riverThreshold: 60,    // ianjsikes/Jimbly: мин. аккумуляция потока для реки
  lakeMoisture: 0.45,    // Jimbly: мин. влажность озёр во впадинах
  sunAngle: 1,           // spectrum-art: сила затенённого рельефа (×)
};

/* Стадийность в духе blslade: конвейер — именованный список стадий;
   HUD и тесты показывают, что мир прошёл все этапы. */
export const GENERATOR_STAGES = [
  'plates', 'stress', 'elevation', 'sea-level', 'simplify-coast',
  'distance-fields', 'climate', 'wind', 'rainfall', 'rivers', 'lakes', 'biomes',
];

const hashSeed = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

const mulberry32 = (state) => () => {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/* Периодический по X value-noise. periodX — обёртка долготы. */
const makeNoise = (rand, periodX, periodY) => {
  const values = new Float32Array(periodX * periodY);
  for (let i = 0; i < values.length; i += 1) values[i] = rand();
  const at = (x, y) => values[(((y % periodY) + periodY) % periodY) * periodX + (((x % periodX) + periodX) % periodX)];
  return (nx, ny) => {
    const x = nx * periodX;
    const y = ny * periodY;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return top + (bottom - top) * sy;
  };
};

const fbm = (noises) => (nx, ny) => {
  let sum = 0;
  let amp = 0.5;
  for (const noise of noises) {
    sum += noise(nx, ny) * amp;
    amp *= 0.5;
  }
  return sum; // ~[0, 1)
};

/* Ridged-шум (идея ianjsikes: 1−|noise| по октавам) — гребни горных хребтов. */
const ridged = (noises) => (nx, ny) => {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (const noise of noises) {
    sum += (1 - Math.abs(noise(nx, ny) * 2 - 1)) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm; // [0, 1], пики на гребнях
};

/* Соседи 8-связности с обёрткой по X; индекс или -1 за полюсом. */
const neighborIndex = (gx, gy, dx, dy) => {
  const y = gy + dy;
  if (y < 0 || y >= GRID_H) return -1;
  return y * GRID_W + ((gx + dx + GRID_W) % GRID_W);
};

/* BFS-поле расстояний (в клетках) от всех ячеек-источников; −1 недостижимо.
   Замена JFA из spectrum-art: сетка маленькая, честный BFS проще и точнее. */
const distanceField = (isSource) => {
  const dist = new Int32Array(GRID_W * GRID_H).fill(-1);
  const queue = new Int32Array(GRID_W * GRID_H);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < dist.length; i += 1) {
    if (isSource(i)) {
      dist[i] = 0;
      queue[tail] = i;
      tail += 1;
    }
  }
  while (head < tail) {
    const i = queue[head];
    head += 1;
    const gx = i % GRID_W;
    const gy = (i / GRID_W) | 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const j = neighborIndex(gx, gy, dx, dy);
        if (j >= 0 && dist[j] < 0) {
          dist[j] = dist[i] + 1;
          queue[tail] = j;
          tail += 1;
        }
      }
    }
  }
  return dist;
};

/**
 * Сгенерировать мир. Возвращает поля и RGBA-буферы слоёв GRID_W×GRID_H.
 * @param {{ seed: string }} config
 */
export function generateContinent({ seed = 'mir-2026', options = {} } = {}) {
  const opt = { ...DEFAULT_OPTIONS, ...options };
  const plateCount = Math.max(4, Math.min(32, Math.round(opt.plates)));
  const rand = mulberry32(hashSeed(String(seed)));

  /* --- плиты (spectrum-art: plates first) --- */
  const plates = Array.from({ length: plateCount }, (_, id) => ({
    id,
    x: rand(),
    y: 0.08 + rand() * 0.84,
    vx: (rand() - 0.5) * 2,
    vy: (rand() - 0.5) * 2,
    continental: rand() < 0.42,
  }));

  const elevationNoise = fbm([3, 6, 12, 24, 48, 96].map((p) => makeNoise(rand, p, Math.max(1, p >> 1))));
  const moistureNoise = fbm([2, 4, 8, 16].map((p) => makeNoise(rand, p, Math.max(1, p >> 1))));
  const ridgeNoise = ridged([12, 24, 48].map((p) => makeNoise(rand, p, Math.max(1, p >> 1))));
  const fossilNoise = ridged([3, 6].map((p) => makeNoise(rand, p, Math.max(1, p >> 1))));
  const trenchNoise = fbm([24, 48].map((p) => makeNoise(rand, p, Math.max(1, p >> 1))));
  const windNoise = makeNoise(rand, 6, 3);
  /* мантийные плюмы spectrum-art: точки поднятий внутри плит */
  const plumes = Array.from({ length: Math.max(0, Math.round(opt.plumes)) }, () => ({ x: rand(), y: 0.15 + rand() * 0.7, r: 0.05 + rand() * 0.07, h: 0.04 + rand() * 0.05 }));
  const warpNoiseX = makeNoise(rand, 3, 2);
  const warpNoiseY = makeNoise(rand, 3, 2);

  const N = GRID_W * GRID_H;
  const elevation = new Float32Array(N);
  const moisture = new Float32Array(N);
  const temperature = new Float32Array(N);
  const plateId = new Int16Array(N);
  const stress = new Float32Array(N); // конвергенция на границе: + горы, − впадины
  const rainfall = new Float32Array(N);
  const wind = new Float32Array(N); // угол ветра, радианы
  const faultDist = new Int32Array(N); // расстояние до границы плит (аналог JFA/SDF)

  for (let gy = 0; gy < GRID_H; gy += 1) {
    const ny = gy / GRID_H;
    for (let gx = 0; gx < GRID_W; gx += 1) {
      const nx = gx / GRID_W;
      const i = gy * GRID_W + gx;

      let first = null;
      let second = null;
      for (const plate of plates) {
        let dx = Math.abs(nx - plate.x);
        if (dx > 0.5) dx = 1 - dx;
        const dy = ny - plate.y;
        const d = dx * dx + dy * dy;
        if (!first || d < first.d) {
          second = first;
          first = { plate, d };
        } else if (!second || d < second.d) {
          second = { plate, d };
        }
      }
      plateId[i] = first.plate.id;
      const border = Math.sqrt(second.d) - Math.sqrt(first.d);
      const nearBorder = Math.max(0, 1 - border * opt.mountainRadius);

      const relVx = second.plate.vx - first.plate.vx;
      const relVy = second.plate.vy - first.plate.vy;
      let axisX = second.plate.x - first.plate.x;
      if (axisX > 0.5) axisX -= 1;
      if (axisX < -0.5) axisX += 1;
      const axisY = second.plate.y - first.plate.y;
      const axisLen = Math.hypot(axisX, axisY) || 1;
      const convergence = -((relVx * axisX + relVy * axisY) / axisLen);
      stress[i] = nearBorder * convergence;

      const wx = nx + (warpNoiseX(nx, ny) - 0.5) * 0.14 * opt.warp;
      const wy = ny + (warpNoiseY(nx, ny) - 0.5) * 0.22 * opt.warp;
      const base = elevationNoise((wx + 1) % 1, Math.min(0.999, Math.max(0.001, wy)));
      let e = base + (first.plate.continental ? 0.07 : -0.03);
      /* горы: стресс границы × гребни ridged-шума (хребты, а не плато) */
      e += nearBorder * Math.max(0, convergence) * (0.05 + ridgeNoise(nx, ny) * 0.16 * opt.roughness) * opt.mountainHeight;
      e -= nearBorder * Math.max(0, -convergence) * 0.07; // рифты/впадины
      /* древние хребты внутри плит (fossil ranges) и плюмы */
      e += (1 - nearBorder) * fossilNoise(nx, ny) * 0.05 * opt.fossil * opt.roughness;
      for (const plume of plumes) {
        let pdx = Math.abs(nx - plume.x);
        if (pdx > 0.5) pdx = 1 - pdx;
        const pd = Math.hypot(pdx, (ny - plume.y) * 1.6);
        if (pd < plume.r) e += plume.h * (1 - pd / plume.r);
      }
      /* океанические впадины: дивергенция × шум траншей */
      if (!first.plate.continental) e -= nearBorder * Math.max(0, -convergence) * trenchNoise(nx, ny) * 0.12;
      elevation[i] = e;
    }
  }

  /* нормализация в [0,1]; уровень моря — процентиль под долю суши из опций */
  let min = Infinity;
  let max = -Infinity;
  for (const e of elevation) {
    if (e < min) min = e;
    if (e > max) max = e;
  }
  const range = max - min || 1;
  for (let i = 0; i < N; i += 1) elevation[i] = (elevation[i] - min) / range;
  const sorted = Float32Array.from(elevation).sort();
  const seaLevel = sorted[Math.floor(sorted.length * (1 - opt.landShare))];

  /* --- клеточное сглаживание берегов (идея simplifyLand из blslade) ---
     Два прохода с порогами (6,3) и (5,4): одинокие мысы тонут, заливы-«иголки»
     всплывают; высоту лишь чуть уводим за уровень моря — рельеф не трогаем. */
  for (const [seaNeigh, landNeigh] of [[6, 3], [5, 4]]) {
    const land = new Uint8Array(N);
    for (let i = 0; i < N; i += 1) land[i] = elevation[i] >= seaLevel ? 1 : 0;
    const flip = [];
    for (let gy = 0; gy < GRID_H; gy += 1) {
      for (let gx = 0; gx < GRID_W; gx += 1) {
        const i = gy * GRID_W + gx;
        let water = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue;
            const j = neighborIndex(gx, gy, dx, dy);
            if (j < 0 || !land[j]) water += 1;
          }
        }
        if (land[i] && water >= seaNeigh) flip.push([i, seaLevel - 0.012]);
        else if (!land[i] && water < landNeigh) flip.push([i, seaLevel + 0.012]);
      }
    }
    for (const [i, e] of flip) elevation[i] = e;
  }

  /* --- поля расстояний (Jimbly: coast/ocean distance fields) --- */
  const distToOcean = distanceField((i) => elevation[i] < seaLevel);
  const distToLand = distanceField((i) => elevation[i] >= seaLevel);
  /* SDF до разломов: источники — клетки, у которых сосед из другой плиты */
  const faultDistField = distanceField((i) => {
    const gx = i % GRID_W;
    const gy = (i / GRID_W) | 0;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const j = neighborIndex(gx, gy, dx, dy);
      if (j >= 0 && plateId[j] !== plateId[i]) return true;
    }
    return false;
  });
  faultDist.set(faultDistField);
  /* шельф: мелкий океан у берегов приподнимаем, дальний — углубляем */
  for (let i = 0; i < N; i += 1) {
    if (elevation[i] < seaLevel && distToLand[i] > 0) {
      const d = distToLand[i];
      elevation[i] += d <= 2 ? 0.03 : d >= 10 ? -0.02 : 0;
    }
  }

  /* --- климат (ianjsikes: ветер по широтным поясам, осадки, температура) ---
     Пояса ветра (направление, откуда дует, в клетках/шаг выборки): пассаты у
     экватора — с востока, умеренные широты — с запада, полярные — с востока. */
  const windDx = (lat01) => (lat01 < 0.25 || lat01 > 0.75 ? 1 : -1); // +1: ветер с запада? см. ниже
  for (let gy = 0; gy < GRID_H; gy += 1) {
    const ny = gy / GRID_H;
    const lat = Math.abs(ny - 0.5) * 2; // 0 экватор, 1 полюс
    const belt = 1 - Math.abs(lat - 0.35); // влажный экватор, сухие субтропики
    /* ветер дует преимущественно вдоль параллелей; смотрим высоту НАВЕТРЕННОЙ
       точки: горы на пути потока дают дождевую тень (Jimbly rainshadow). */
    const upwind = windDx(lat) > 0 ? -6 : 6; // откуда приходит воздух
    for (let gx = 0; gx < GRID_W; gx += 1) {
      const i = gy * GRID_W + gx;
      const e = elevation[i];
      /* ветер: поясное направление + шумовая дисторсия (ianjsikes) */
      const baseAngle = upwind > 0 ? Math.PI : 0; // поток идёт против upwind-выборки
      wind[i] = baseAngle + (windNoise(nxSafe(gx), ny) - 0.5) * 1.2;
      let m = moistureNoise(nxSafe(gx), ny) * 0.8 + belt * 0.22 - 0.06;
      let rain = m;
      if (e >= seaLevel) {
        const coastal = Math.exp(-Math.max(0, distToOcean[i]) / 18) * 0.25;
        m += coastal; // океан кормит влагой
        const up = elevation[gy * GRID_W + ((gx + upwind + GRID_W) % GRID_W)];
        const shadow = clamp01((up - e) * 1.6) * opt.rainshadow; // за хребтом — суше
        m -= shadow;
        /* осадки: влажность + орографический подъём на наветренном склоне */
        rain = clamp01(m + clamp01((e - up) * 1.6) * 0.25);
      } else {
        m += 0.15;
        rain = clamp01(m + 0.1);
      }
      moisture[i] = clamp01(m);
      rainfall[i] = rain;
      temperature[i] = clamp01(1.04 - lat * 1.08 - Math.max(0, e - seaLevel) * 0.55 + (moistureNoise(nxSafe(gx), ny) - 0.5) * 0.14);
    }
  }

  /* --- гидрология (ianjsikes + Jimbly: сток вниз, аккумуляция, озёра) --- */
  mountainify(elevation, seaLevel, opt);
  const { river, lake, riverCells, lakeCells } = hydrology(elevation, moisture, seaLevel, opt);

  let land = 0;
  for (const e of elevation) if (e >= seaLevel) land += 1;

  const world = {
    seed: String(seed),
    width: GRID_W,
    height: GRID_H,
    elevation,
    moisture,
    temperature,
    plateId,
    stress,
    river,
    lake,
    rainfall,
    wind,
    faultDist,
    options: opt,
    stages: GENERATOR_STAGES,
    seaLevel,
    landShare: land / N,
    riverCells,
    lakeCells,
    plates: plateCount,
  };
  world.rgba = paint(world, 'biomes');
  return world;
}

const nxSafe = (gx) => gx / GRID_W;

/* D8-сток: каждая суша-клетка течёт в самого низкого соседа; аккумуляция —
   проходом от высоких к низким. Река — поток выше порога. Яма без стока
   (нет соседа ниже) при влажности > 0.4 — озеро. */
function hydrology(elevation, moisture, seaLevel, opt = DEFAULT_OPTIONS) {
  const N = GRID_W * GRID_H;
  const flowTo = new Int32Array(N).fill(-1);
  const accumulation = new Float32Array(N).fill(1);
  const order = [];
  for (let i = 0; i < N; i += 1) if (elevation[i] >= seaLevel) order.push(i);
  order.sort((a, b) => elevation[b] - elevation[a]);

  const isPit = new Uint8Array(N);
  for (const i of order) {
    const gx = i % GRID_W;
    const gy = (i / GRID_W) | 0;
    let best = -1;
    let bestE = elevation[i];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const j = neighborIndex(gx, gy, dx, dy);
        if (j >= 0 && elevation[j] < bestE) {
          bestE = elevation[j];
          best = j;
        }
      }
    }
    if (best < 0) isPit[i] = 1;
    flowTo[i] = best;
  }
  for (const i of order) {
    const j = flowTo[i];
    if (j >= 0) accumulation[j] += accumulation[i];
  }

  const river = new Uint8Array(N);
  const lake = new Uint8Array(N);
  let riverCells = 0;
  let lakeCells = 0;
  for (const i of order) {
    if (accumulation[i] >= opt.riverThreshold && elevation[i] >= seaLevel) {
      river[i] = 1;
      riverCells += 1;
    }
    if (isPit[i] && moisture[i] > opt.lakeMoisture && accumulation[i] >= 25) {
      lake[i] = 1;
      lakeCells += 1;
    }
  }
  /* заполнение озёр: соседи ниже кромки ямы тоже уходят под воду (Jimbly fillLakes).
     Расширяемся только от исходных ям в один ободок, иначе потоп каскадится. */
  const lakeSeeds = [];
  for (let i = 0; i < N; i += 1) if (lake[i]) lakeSeeds.push(i);
  for (const i of lakeSeeds) {
      const gx = i % GRID_W;
      const gy = (i / GRID_W) | 0;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const j = neighborIndex(gx, gy, dx, dy);
        if (j >= 0 && elevation[j] >= seaLevel && elevation[j] < elevation[i] + 0.01 && !lake[j]) {
          lake[j] = 1;
          lakeCells += 1;
        }
      }
  }
  /* прунинг рек: одиночные клетки-притоки без соседних рек срезаем */
  for (let i = 0; i < N; i += 1) {
    if (!river[i]) continue;
    const gx = i % GRID_W;
    const gy = (i / GRID_W) | 0;
    let near = 0;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const j = neighborIndex(gx, gy, dx, dy);
      if (j >= 0 && river[j]) near += 1;
    }
    if (!near && !lake[i]) {
      river[i] = 0;
      riverCells -= 1;
    }
  }
  return { river, lake, riverCells, lakeCells };
}

/* Mountainify (идея Jimbly): самые высокие локальные пики с минимальной
   дистанцией между ними (poisson-отбор по убыванию высоты) поднимаем конусом. */
function mountainify(elevation, seaLevel, opt) {
  if (opt.mountainHeight <= 0) return;
  const candidates = [];
  for (let i = 0; i < elevation.length; i += 1) {
    if (elevation[i] > seaLevel + 0.28) candidates.push(i);
  }
  candidates.sort((a, b) => elevation[b] - elevation[a]);
  const peaks = [];
  const minSep = 16;
  for (const i of candidates) {
    if (peaks.length >= 48) break;
    const gx = i % GRID_W;
    const gy = (i / GRID_W) | 0;
    if (peaks.every(([px, py]) => Math.hypot(Math.min(Math.abs(px - gx), GRID_W - Math.abs(px - gx)), py - gy) >= minSep)) peaks.push([gx, gy, i]);
  }
  const radius = 9;
  for (const [px, py, pi] of peaks) {
    const lift = 0.1 * opt.mountainHeight * (0.6 + elevation[pi]);
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const j = neighborIndex(px, py, dx, dy);
        const d = Math.hypot(dx, dy);
        if (j >= 0 && d <= radius && elevation[j] >= seaLevel) elevation[j] = Math.min(1, elevation[j] + lift * (1 - d / radius));
      }
    }
  }
}

/* ---------- слои-раскраски ---------- */

const BIOME_COLORS = {
  deepOcean: [16, 42, 78],
  ocean: [24, 68, 116],
  shallow: [38, 102, 156],
  beach: [196, 178, 128],
  desert: [216, 182, 110],
  savanna: [168, 168, 92],
  grass: [104, 158, 76],
  forest: [52, 116, 60],
  jungle: [26, 102, 56],
  tundra: [150, 158, 148],
  rock: [128, 122, 116],
  snow: [238, 242, 244],
};

function biomeColor(e, m, t, sea) {
  const C = BIOME_COLORS;
  if (e < sea - 0.16) return C.deepOcean;
  if (e < sea - 0.05) return C.ocean;
  if (e < sea) return C.shallow;
  if (t < 0.18) return C.snow;
  if (e > 0.93) return t < 0.4 ? C.snow : C.rock;
  if (e > 0.87) return C.rock;
  if (e < sea + 0.015) return C.beach;
  if (t < 0.32) return C.tundra;
  if (m < 0.3) return C.desert;
  if (m < 0.45) return C.savanna;
  if (t > 0.68 && m > 0.62) return C.jungle;
  if (m > 0.58) return C.forest;
  return C.grass;
}

const PLATE_PALETTE = Array.from({ length: 16 }, (_, i) => {
  const hue = (i * 137.5) % 360;
  return `hsl(${hue} 45% 45%)`;
});
const plateRgb = (id) => {
  const hue = ((id * 137.5) % 360) / 360;
  const f = (n) => {
    const k = (n + hue * 12) % 12;
    return Math.round(255 * (0.45 - 0.25 * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  };
  return [f(0), f(8), f(4)];
};

/** Раскрасить мир в одном из слоёв: biomes|elevation|moisture|temperature|plates. */
export function paint(world, mode = 'biomes') {
  const { elevation, moisture, temperature, plateId, river, lake, seaLevel, rainfall, wind, stress, faultDist } = world;
  const rgba = new Uint8ClampedArray(GRID_W * GRID_H * 4);
  for (let gy = 0; gy < GRID_H; gy += 1) {
    for (let gx = 0; gx < GRID_W; gx += 1) {
      const i = gy * GRID_W + gx;
      const e = elevation[i];
      let rgb;
      if (mode === 'elevation') {
        rgb = e < seaLevel
          ? [18, 40 + Math.round(60 * (e / seaLevel)), 110]
          : (() => { const v = Math.round(40 + 200 * ((e - seaLevel) / (1 - seaLevel || 1))); return [v, v, v]; })();
      } else if (mode === 'moisture') {
        const m = moisture[i];
        rgb = e < seaLevel ? [14, 32, 66] : [Math.round(210 * (1 - m)), Math.round(140 + 60 * m), Math.round(220 * m)];
      } else if (mode === 'temperature') {
        const t = temperature[i];
        rgb = e < seaLevel ? [14, 32, 66] : [Math.round(230 * t + 20), Math.round(120 * (1 - Math.abs(t - 0.5) * 2) + 40), Math.round(230 * (1 - t))];
      } else if (mode === 'rainfall') {
        const r = rainfall ? rainfall[i] : moisture[i];
        rgb = e < seaLevel ? [14, 32, 66] : [Math.round(230 * (1 - r)), Math.round(180 * (1 - Math.abs(r - 0.5))), Math.round(60 + 190 * r)];
      } else if (mode === 'wind') {
        const a = wind ? wind[i] : 0;
        const v = 0.5 + 0.5 * Math.sin(a * 3);
        rgb = e < seaLevel ? [Math.round(20 + 40 * v), Math.round(50 + 50 * v), 110] : [Math.round(90 + 120 * v), Math.round(140 - 60 * v), 90];
      } else if (mode === 'stress') {
        const st = stress ? stress[i] : 0;
        rgb = st > 0.02 ? [Math.round(120 + 130 * Math.min(1, st)), 70, 50] : st < -0.02 ? [50, 80, Math.round(120 + 130 * Math.min(1, -st))] : [e < seaLevel ? 24 : 90, e < seaLevel ? 50 : 95, e < seaLevel ? 90 : 80];
      } else if (mode === 'faults') {
        const d = faultDist ? Math.min(30, faultDist[i]) / 30 : 0;
        rgb = [Math.round(30 + 200 * d), Math.round(30 + 170 * d), Math.round(40 + 120 * d)];
      } else if (mode === 'plates') {
        rgb = plateRgb(plateId[i]);
        if (e < seaLevel) rgb = rgb.map((v) => Math.round(v * 0.55));
      } else {
        rgb = biomeColor(e, moisture[i], temperature[i], seaLevel);
        if (lake[i]) rgb = [46, 110, 170];
        else if (river[i] && e >= seaLevel) rgb = [52, 116, 190];
      }
      const left = elevation[gy * GRID_W + ((gx - 1 + GRID_W) % GRID_W)];
      const up = elevation[Math.max(0, gy - 1) * GRID_W + gx];
      const sun = world.options?.sunAngle ?? 1;
      const shade = Math.max(0.6, Math.min(1.35, 1 + ((left - e) * 5 + (up - e) * 3) * sun));
      const o = i * 4;
      rgba[o] = rgb[0] * shade;
      rgba[o + 1] = rgb[1] * shade;
      rgba[o + 2] = rgb[2] * shade;
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

/* ---------- вид ---------- */

const LAYERS = [
  ['biomes', 'Биомы'],
  ['elevation', 'Высота'],
  ['moisture', 'Влажность'],
  ['rainfall', 'Осадки'],
  ['temperature', 'Температура'],
  ['wind', 'Ветер'],
  ['plates', 'Плиты'],
  ['stress', 'Границы плит'],
  ['faults', 'До разломов'],
];

/* Панель параметров (spectrum-art UI controls + стадии blslade):
   [ключ, подпись, min, max, step] — всё в единицах DEFAULT_OPTIONS. */
const CONTROLS = [
  ['plates', 'Плит', 6, 24, 1],
  ['landShare', 'Доля суши', 0.2, 0.55, 0.01],
  ['mountainHeight', 'Высота гор', 0, 2, 0.1],
  ['mountainRadius', 'Ширина гор у границ', 6, 26, 1],
  ['warp', 'Излом берегов (warp)', 0, 2, 0.1],
  ['roughness', 'Рельефность', 0, 2, 0.1],
  ['fossil', 'Древние хребты', 0, 1, 0.05],
  ['rainshadow', 'Дождевая тень', 0, 1, 0.05],
  ['riverThreshold', 'Порог рек', 20, 160, 5],
  ['sunAngle', 'Тень рельефа', 0, 2, 0.1],
];

/**
 * Смонтировать карту мира в host. Возвращает { element, dispose, world }.
 * @param {HTMLElement} host
 * @param {{ config: { seed: string, width: number, height: number } }} options
 */
export function mountContinentView(host, { config } = {}) {
  const root = document.createElement('div');
  root.className = 'world-map-view';
  root.dataset.role = 'world-map-view';
  root.innerHTML = `
    <canvas class="world-map-view-canvas" data-role="world-map-canvas" width="${GRID_W}" height="${GRID_H}"
      style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated" aria-label="Сгенерированная карта мира"></canvas>
    <div class="world-map-view-toolbar" role="group" aria-label="Слой карты">
      ${LAYERS.map(([id, label]) => `<button class="world-map-view-button" type="button" data-layer="${id}" aria-pressed="${id === 'biomes'}">${label}</button>`).join('')}
    </div>
    <details class="world-map-view-settings">
      <summary>Параметры генератора</summary>
      ${CONTROLS.map(([key, label, min, max, step]) => `
        <label class="world-map-view-setting">${label}
          <input type="range" data-opt="${key}" min="${min}" max="${max}" step="${step}" value="${DEFAULT_OPTIONS[key]}" />
          <output data-opt-out="${key}">${DEFAULT_OPTIONS[key]}</output>
        </label>`).join('')}
      <p class="world-map-view-note">Стадии: ${GENERATOR_STAGES.join(' → ')}</p>
    </details>
    <p class="world-map-view-hud" data-role="world-map-hud" role="status"></p>`;
  host.append(root);

  let world = null;
  let layer = 'biomes';
  const canvas = root.querySelector('[data-role="world-map-canvas"]');
  const hud = root.querySelector('[data-role="world-map-hud"]');
  const currentOptions = () => {
    const out = {};
    root.querySelectorAll('[data-opt]').forEach((input) => { out[input.dataset.opt] = Number(input.value); });
    return out;
  };
  const draw = () => {
    if (!world) return;
    canvas.getContext('2d').putImageData(new ImageData(paint(world, layer), world.width, world.height), 0, 0);
    root.querySelectorAll('[data-layer]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layer === layer)));
  };
  const regenerate = () => {
    try {
      world = generateContinent({ seed: config?.seed || 'mir-2026', options: currentOptions() });
      draw();
      hud.textContent =
        `Мир ${world.seed}: суша ${(world.landShare * 100).toFixed(0)}%, рек ${world.riverCells}, озёр ${world.lakeCells}, ` +
        `плит ${world.plates}. Стадии: ${GENERATOR_STAGES.join(' → ')}.`;
    } catch (error) {
      hud.textContent = `Карта не построилась: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
  root.querySelectorAll('[data-layer]').forEach((b) => b.addEventListener('click', () => { layer = b.dataset.layer; draw(); }));
  let timer = 0;
  root.querySelectorAll('[data-opt]').forEach((input) => input.addEventListener('input', () => {
    const out = root.querySelector(`[data-opt-out="${input.dataset.opt}"]`);
    if (out) out.textContent = input.value;
    clearTimeout(timer);
    timer = setTimeout(regenerate, 180);
  }));
  regenerate();

  return {
    element: root,
    world,
    error: null,
    dispose() {
      root.remove();
    },
  };
}

export { PLATE_PALETTE };
