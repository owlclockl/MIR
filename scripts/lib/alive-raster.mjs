/* Живой мир в обычный буфер RGBA — без холста и без браузера.

   Зачем. Вид рисует живой мир на холсте, а проверить картинку можно только
   глазами в браузере. Этот модуль повторяет те же слои простыми операциями
   над пикселями: облака, ночь, огни, снег, ветер, вулканы и берег будущего
   мира ложатся прямо в буфер, из которого `planet-preview.mjs` собирает PNG.

   Это не второй движок, а именно проверка: числа и формулы берутся из
   `alive.js`, а здесь только наложение. Если картинка получилась не такой,
   значит, дело в наложении — а не в физике. */

import { clamp } from '../../src/planet/scale.js';
import { julyWeight } from '../../src/planet/alive.js';

const mix = (rgba, index, red, green, blue, alpha) => {
  if (alpha <= 0.002) return;
  const a = alpha > 1 ? 1 : alpha;
  const back = 1 - a;
  rgba[index] = rgba[index] * back + red * a;
  rgba[index + 1] = rgba[index + 1] * back + green * a;
  rgba[index + 2] = rgba[index + 2] * back + blue * a;
  rgba[index + 3] = 255;
};

/** Сложение света: огни и сияние не заслоняют картинку, а подсвечивают её. */
const add = (rgba, index, red, green, blue, weight) => {
  if (weight <= 0.002) return;
  rgba[index] = clamp(rgba[index] + red * weight, 0, 255);
  rgba[index + 1] = clamp(rgba[index + 1] + green * weight, 0, 255);
  rgba[index + 2] = clamp(rgba[index + 2] + blue * weight, 0, 255);
  rgba[index + 3] = 255;
};

const line = (rgba, width, height, x1, y1, x2, y2, color, alpha) => {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = Math.round(x1 + (x2 - x1) * t);
    const y = Math.round(y1 + (y2 - y1) * t);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    mix(rgba, (y * width + x) * 4, color[0], color[1], color[2], alpha);
  }
};

/**
 * Наложить живой мир на готовую картинку.
 *
 * `origin` — левый верхний пиксель кадра в пикселях уровня, `mpp` — метров на
 * пиксель: по ним пиксель превращается в точку мира, а дальше всё считает
 * `alive.js`.
 */
export const composeAlive = ({ rgba, width, height, originX, originY, mpp, planet, living, seasonFields, options = {} }) => {
  const on = {
    clouds: true, night: true, lights: true, aurora: true, wind: true, rivers: true,
    season: true, volcanoes: true, drift: true, rain: true, ...options.layers,
  };
  const weight = julyWeight(living.dayOfYear());
  const spanX = width * mpp;
  const spanY = height * mpp;
  const minX = originX * mpp;
  const minY = originY * mpp;
  const worldX = (px) => minX + (px + 0.5) * mpp;
  const worldY = (py) => minY + (py + 0.5) * mpp;

  /* ---------- 1. снег, лёд и зелень ---------- */
  if (on.season && seasonFields) {
    for (let py = 0; py < height; py += 1) {
      const my = worldY(py);
      for (let px = 0; px < width; px += 1) {
        const mx = worldX(px);
        const index = (py * width + px) * 4;
        const snow = seasonFields.snowAt(mx, my, weight);
        if (snow > 0.05) {
          mix(rgba, index, 246, 250, 255, snow * 0.8);
          continue;
        }
        const ice = seasonFields.iceAt(mx, my, weight);
        if (ice > 0.05) {
          mix(rgba, index, 214, 236, 248, ice * 0.72);
          continue;
        }
        const temperature = seasonFields.temperatureAt(mx, my, weight);
        const green = clamp((temperature - 1) / 16, 0, 1) * clamp((26 - temperature) / 10, 0, 1);
        if (green > 0.05) mix(rgba, index, 96, 150, 74, green * 0.12);
      }
    }
  }

  /* ---------- 2. облака и вихри ---------- */
  if (on.clouds) {
    for (let py = 0; py < height; py += 1) {
      const my = worldY(py);
      for (let px = 0; px < width; px += 1) {
        const mx = worldX(px);
        const cover = living.weather.cloudAt(mx, my);
        if (cover <= 0.04) continue;
        const index = (py * width + px) * 4;
        const sun = living.sunAt(mx, my);
        const day = sun.daylight;
        const glow = sun.twilight * 0.5;
        mix(rgba, index,
          132 + 118 * day + 70 * glow,
          138 + 112 * day + 26 * glow,
          152 + 100 * day - 66 * glow,
          clamp(cover ** 1.5 * 0.95, 0, 0.92));
      }
    }
    /* Спирали вихрей — те же полосы, что и на холсте. */
    for (const system of living.weather.systems) {
      const radius = system.radius / mpp;
      if (radius < 6) continue;
      const cx = (system.x - minX) / mpp;
      const cy = (system.y - minY) / mpp;
      if (cx < -radius * 2.4 || cy < -radius * 2.4 || cx > width + radius * 2.4 || cy > height + radius * 2.4) continue;
      const bands = system.kind === 'hurricane' ? 5 : 6;
      for (let band = 0; band < bands; band += 1) {
        const offset = (band / bands) * Math.PI * 2 + system.phase;
        let previous = null;
        for (let step = 0; step <= 16; step += 1) {
          const t = 0.22 + (step / 16) * 0.78;
          const angle = offset + system.spin * t * 3.6;
          const x = cx + Math.cos(angle) * radius * t;
          const y = cy + Math.sin(angle) * radius * t * 0.82;
          if (previous) line(rgba, width, height, previous[0], previous[1], x, y, [238, 246, 255], clamp(system.strength * 0.22, 0, 0.5));
          previous = [x, y];
        }
      }
    }
  }

  /* ---------- 3. осадки ---------- */
  if (on.rain) {
    for (let py = 0; py < height; py += 4) {
      const my = worldY(py);
      for (let px = 0; px < width; px += 4) {
        const mx = worldX(px);
        const intensity = living.weather.rainAt(mx, my);
        if (intensity < 0.6) continue;
        const snowing = seasonFields ? seasonFields.temperatureAt(mx, my, weight) < 0 : false;
        const x = px + ((mx * 0.013) % 4);
        const y = py + ((my * 0.017) % 4);
        if (snowing) mix(rgba, (Math.round(y) * width + Math.round(x)) * 4, 236, 244, 252, 0.5);
        else line(rgba, width, height, x, y, x + 1, y + 6, [186, 212, 240], 0.42);
      }
    }
  }

  /* ---------- 4. ночь и сумерки ---------- */
  if (on.night) {
    for (let py = 0; py < height; py += 1) {
      const my = worldY(py);
      for (let px = 0; px < width; px += 1) {
        const mx = worldX(px);
        const sun = living.sunAt(mx, my);
        if (sun.altitude > 6) continue;
        const index = (py * width + px) * 4;
        const golden = clamp(1 - Math.abs(sun.altitude + 1) / 3.5, 0, 1);
        const dark = clamp((-sun.altitude + 4) / 14, 0, 1);
        mix(rgba, index, 10 + 130 * golden, 18 + 50 * golden, 42 - 16 * golden, dark * 0.78 + golden * 0.12);
      }
    }
  }

  /* ---------- 5. сияние ---------- */
  if (on.aurora) {
    const strength = living.aurora.activity();
    if (strength > 0.3) {
      for (const hemisphere of [1, -1]) {
        for (let curtain = 0; curtain < 5; curtain += 1) {
          const latBase = (67 - strength * 6 + curtain * 1.6) * hemisphere;
          for (let px = 0; px < width; px += 1) {
            const mx = worldX(px);
            const lon = (mx / planet.widthM) * 360 - 180;
            const lat = latBase + 2.4 * Math.sin((lon / 180) * Math.PI * 3 + curtain);
            const my = ((90 - lat) / 180) * planet.heightM;
            const py = (my - minY) / mpp;
            if (py < 0 || py >= height) continue;
            const glow = living.aurora.at(mx, my, planet, living.sunAt(mx, my));
            if (glow < 0.05) continue;
            const index = (Math.round(py) * width + px) * 4;
            add(rgba, index, 122, 255, 190, glow * 0.5);
            const upper = Math.round(py - hemisphere * 5);
            if (upper >= 0 && upper < height) {
              add(rgba, (upper * width + px) * 4, 170, 170, 255, glow * 0.18);
            }
          }
        }
      }
    }
  }

  /* ---------- 6. огни поселений ---------- */
  if (on.lights) {
    for (const point of living.lights.points) {
      if (point.x < minX || point.x > minX + spanX || point.y < minY || point.y > minY + spanY) continue;
      const sun = living.sunAt(point.x, point.y);
      if (sun.lights < 0.02) continue;
      const px = (point.x - minX) / mpp;
      const py = (point.y - minY) / mpp;
      const brightness = clamp(point.size * sun.lights, 0, 1.4);
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const x = Math.round(px) + ox;
          const y = Math.round(py) + oy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          add(rgba, (y * width + x) * 4, 255, 214, 150, brightness * (ox === 0 && oy === 0 ? 0.9 : 0.3));
        }
      }
    }
  }

  /* ---------- 7. ветер и течения ---------- */
  if (on.wind) {
    for (const [flow, color, reference] of [
      [living.particles.wind, [150, 226, 255], 12],
      [living.particles.currents, [96, 190, 222], 1],
    ]) {
      for (let i = 0; i < flow.count; i += 1) {
        if (flow.x[i] < minX || flow.x[i] > minX + spanX || flow.y[i] < minY || flow.y[i] > minY + spanY) continue;
        const norm = clamp(flow.speed[i] / reference, 0, 1.4);
        const px = (flow.x[i] - minX) / mpp;
        const py = (flow.y[i] - minY) / mpp;
        const length = 5 + 13 * norm;
        line(rgba, width, height, px, py, px + flow.dx[i] * length, py + flow.dy[i] * length, color, 0.16 + 0.26 * norm);
      }
    }
  }

  /* ---------- 8. вулканы ---------- */
  if (on.volcanoes) {
    for (const site of living.volcanoes.visible(minX, minY, minX + spanX, minY + spanY)) {
      const intensity = living.volcanoes.intensity(site);
      if (intensity < 0.05) continue;
      const px = (site.x - minX) / mpp;
      const py = (site.y - minY) / mpp;
      const sun = living.sunAt(site.x, site.y);
      for (let puff = 0; puff < 6; puff += 1) {
        const t = puff / 5;
        const x = Math.round(px + t * 4);
        const y = Math.round(py - 2 - t * 4);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        mix(rgba, (y * width + x) * 4, 206, 198, 190, clamp(intensity * (0.5 - t * 0.3), 0, 0.5));
      }
      const glow = clamp(intensity * (0.3 + 0.7 * sun.night), 0, 1);
      if (glow > 0.1) add(rgba, (Math.round(py) * width + Math.round(px)) * 4, 255, 150, 60, glow);
    }
  }

  /* ---------- 9. берег будущего мира ---------- */
  if (on.drift && living.drift.ma() > 0.05) {
    const coast = living.drift.coast();
    for (let i = 0; i < coast.length; i += 4) {
      if (coast[i] < minX - mpp * 40 || coast[i] > minX + spanX + mpp * 40) continue;
      if (coast[i + 1] < minY - mpp * 40 || coast[i + 1] > minY + spanY + mpp * 40) continue;
      line(rgba, width, height,
        (coast[i] - minX) / mpp, (coast[i + 1] - minY) / mpp,
        (coast[i + 2] - minX) / mpp, (coast[i + 3] - minY) / mpp,
        [140, 226, 255], 0.55);
    }
  }
};
