/* ===========================================================
   Генератор континентов (чистая реализация, 2026-10-14).

   Замена удалённым генераторам. Конвейер вдохновлён архитектурой
   spectrum-art/Continent-Generator (плиты → напряжение на границах →
   возвышение → затенённый рельеф), но код написан с нуля под проект:
   у того репозитория нет лицензии, поэтому копировать его нельзя.

   Этапы:
     1. seeded RNG из строки seed (FNV-1a + mulberry32) — детерминизм;
     2. литосферные плиты: центры с обёрткой по долготе, скорости, тип коры;
     3. напряжение границ: конвергенция соседних плит поднимает горы,
        дивергенция роет океанические впадины;
     4. возвышение: базовый fBm (периодический по долготе) + горы у границ;
     5. климат: температура от широты и высоты, влажность — fBm + широтный пояс;
     6. биомы и затенённый рельеф → RGBA.

   Вход: { seed, width, height } из слота (store.js). width/height — «мировые»
   размеры карты; сетка генерации фиксированная (GRID_W×GRID_H) и масштабируется
   холстом, поэтому любая карта строится одинаково быстро (<300 мс).
   =========================================================== */

export const GRID_W = 384;
export const GRID_H = 192;
const PLATES = 14;
const SEA = 0.5; // ориентир до процентильной нормализации (см. ниже)

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

/* Периодический по X value-noise: решётка случайных значений, сглаженная
   билинейной интерполяцией с smoothstep. periodX — обёртка долготы. */
const makeNoise = (rand, periodX, periodY) => {
  const values = new Float32Array(periodX * periodY);
  for (let i = 0; i < values.length; i += 1) values[i] = rand();
  const at = (x, y) => values[((y % periodY) * periodX + (x % periodX)) % values.length];
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

/**
 * Сгенерировать мир. Возвращает поля и готовый RGBA-буфер GRID_W×GRID_H.
 * @param {{ seed: string }} config
 */
export function generateContinent({ seed = 'mir-2026' } = {}) {
  const rand = mulberry32(hashSeed(String(seed)));

  /* --- плиты --- */
  const plates = Array.from({ length: PLATES }, () => ({
    x: rand(),
    y: 0.08 + rand() * 0.84,
    vx: (rand() - 0.5) * 2,
    vy: (rand() - 0.5) * 2,
    continental: rand() < 0.42, // ~42% плит несут сушу
  }));

  /* --- шумовые поля --- */
  const elevationNoise = fbm([3, 6, 12, 24, 48, 96].map((p) => makeNoise(rand, p, Math.max(1, p >> 1))));
  const moistureNoise = fbm([2, 4, 8, 16].map((p) => makeNoise(rand, p, Math.max(1, p >> 1))));
  const warpNoiseX = makeNoise(rand, 3, 2);
  const warpNoiseY = makeNoise(rand, 3, 2);

  const elevation = new Float32Array(GRID_W * GRID_H);
  const moisture = new Float32Array(GRID_W * GRID_H);
  const temperature = new Float32Array(GRID_W * GRID_H);

  for (let gy = 0; gy < GRID_H; gy += 1) {
    const ny = gy / GRID_H;
    const lat = Math.abs(ny - 0.5) * 2; // 0 — экватор, 1 — полюс
    for (let gx = 0; gx < GRID_W; gx += 1) {
      const nx = gx / GRID_W;
      const i = gy * GRID_W + gx;

      /* две ближайшие плиты (долгота — кольцо) */
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
      const border = Math.sqrt(second.d) - Math.sqrt(first.d); // ~0 на границе плит
      const nearBorder = Math.max(0, 1 - border * 14);

      /* конвергенция: скорость сближения вдоль линии центров плит */
      const relVx = second.plate.vx - first.plate.vx;
      const relVy = second.plate.vy - first.plate.vy;
      let axisX = second.plate.x - first.plate.x;
      if (axisX > 0.5) axisX -= 1;
      if (axisX < -0.5) axisX += 1;
      const axisY = second.plate.y - first.plate.y;
      const axisLen = Math.hypot(axisX, axisY) || 1;
      const convergence = -((relVx * axisX + relVy * axisY) / axisLen); // >0 — плиты сжимаются

      /* domain warp: шум, искривлённый другим шумом, ломает прямые
         границы Вороного — континенты получаются рваными, а не осколками */
      const wx = nx + (warpNoiseX(nx, ny) - 0.5) * 0.14;
      const wy = ny + (warpNoiseY(nx, ny) - 0.5) * 0.22;
      const base = elevationNoise((wx + 1) % 1, Math.min(0.999, Math.max(0.001, wy)));
      let e = base + (first.plate.continental ? 0.07 : -0.03);
      e += nearBorder * convergence * 0.13; // горы на сходящихся границах
      e -= nearBorder * Math.max(0, -convergence) * 0.07; // впадины на расходящихся
      elevation[i] = e;

      const belt = 1 - Math.abs(lat - 0.35); // влажный экватор, сухие субтропики
      moisture[i] = Math.min(1, Math.max(0, moistureNoise(nx, ny) * 0.85 + belt * 0.22 - 0.08));
      temperature[i] = Math.max(0, Math.min(1, 1.04 - lat * 1.08 - Math.max(0, e - SEA) * 0.55 + (moistureNoise(nx, ny) - 0.5) * 0.14));
    }
  }

  /* нормализация возвышения в [0,1] — стабильная доля суши при любом seed */
  let min = Infinity;
  let max = -Infinity;
  for (const e of elevation) {
    if (e < min) min = e;
    if (e > max) max = e;
  }
  const range = max - min || 1;
  for (let i = 0; i < elevation.length; i += 1) elevation[i] = (elevation[i] - min) / range;

  /* Уровень моря — 62-й процентиль: доля суши ~38% при любом seed,
     а не лотерея от формы распределения. */
  const sorted = Float32Array.from(elevation).sort();
  const seaLevel = sorted[Math.floor(sorted.length * 0.62)];

  const rgba = paint(elevation, moisture, temperature, seaLevel);
  let land = 0;
  for (const e of elevation) if (e >= seaLevel) land += 1;
  return {
    seed: String(seed),
    width: GRID_W,
    height: GRID_H,
    elevation,
    moisture,
    temperature,
    seaLevel,
    landShare: land / elevation.length,
    rgba,
  };
}

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

function paint(elevation, moisture, temperature, seaLevel) {
  const rgba = new Uint8ClampedArray(GRID_W * GRID_H * 4);
  for (let gy = 0; gy < GRID_H; gy += 1) {
    for (let gx = 0; gx < GRID_W; gx += 1) {
      const i = gy * GRID_W + gx;
      const e = elevation[i];
      const [r, g, b] = biomeColor(e, moisture[i], temperature[i], seaLevel);
      /* затенённый рельеф: свет с северо-запада по градиенту высоты */
      const left = elevation[gy * GRID_W + ((gx - 1 + GRID_W) % GRID_W)];
      const up = elevation[Math.max(0, gy - 1) * GRID_W + gx];
      const shade = Math.max(0.72, Math.min(1.22, 1 + (left - e) * 5 + (up - e) * 3));
      const o = i * 4;
      rgba[o] = r * shade;
      rgba[o + 1] = g * shade;
      rgba[o + 2] = b * shade;
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

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
    <p class="world-map-view-hud" data-role="world-map-hud" role="status"></p>`;
  host.append(root);

  let world = null;
  try {
    world = generateContinent({ seed: config?.seed || 'mir-2026' });
    const canvas = root.querySelector('[data-role="world-map-canvas"]');
    const ctx = canvas.getContext('2d');
    ctx.putImageData(new ImageData(world.rgba, world.width, world.height), 0, 0);
    root.querySelector('[data-role="world-map-hud"]').textContent =
      `Мир ${world.seed}: суша ${(world.landShare * 100).toFixed(0)}%, сетка ${world.width}×${world.height}, ` +
      `плит ${PLATES}. Генератор: плиты → горы на границах → климат → биомы.`;
  } catch (error) {
    root.querySelector('[data-role="world-map-hud"]').textContent =
      `Карта не построилась: ${error instanceof Error ? error.message : String(error)}`;
  }

  return {
    element: root,
    world,
    error: null,
    dispose() {
      root.remove();
    },
  };
}
