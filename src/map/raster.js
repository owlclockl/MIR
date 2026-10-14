import { canonicalUV, wrapLongitude } from '../world/geodesy.js';
import { landColor, oceanColor, terrainLight } from './terrain-style.js';
import { heightMeters, smoothHeight } from './height.js';
/* Read-only surface renderer. No terrain generation: all land, biomes and
   rivers come from the Azgaar snapshot. Grain/canopy marks are cosmetic. */
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const BIOME_NAMES = ['Океан', 'Жаркая пустыня', 'Холодная пустыня', 'Саванна', 'Луг', 'Сезонный лес', 'Лиственный лес', 'Тропический лес', 'Дождевой лес', 'Тайга', 'Тундра', 'Ледник', 'Болото'];
const poleBiomes = new WeakMap();
const FORESTS = new Set([5, 6, 7, 8, 9]);

export function sampleSurface(source, u, v) {
  if (source.topology === 'ellipsoid') ({ u, v } = canonicalUV(u, v));
  u = clamp(u, 0, 1 - Number.EPSILON); v = clamp(v, 0, 1 - Number.EPSILON);
  const cx = Math.min(source.cellsX - 1, Math.floor(u * source.width / source.spacing));
  const cy = Math.min(source.cellsY - 1, Math.floor(v * source.height / source.spacing));
  const cell = cy * source.cellsX + cx;
  const pixel = Math.floor(v * source.height) * source.width + Math.floor(u * source.width);
  const packed = source.packHeight && source.packHeight[pixel] !== 255;
  let height = packed ? source.packHeight[pixel] : source.cellH[cell];
  let biome = packed && source.packBiome ? source.packBiome[pixel] : source.cellBiome[cell];
  const lakeId = source.packLake ? source.packLake[pixel] : source.cellFeature?.[cell];
  let lake = lakeId > 0 && lakeId < 65535 ? source.features?.[lakeId - 1] : undefined;
  if (source.topology === 'ellipsoid') {
    height = smoothHeight(source, u, v);
    if (Math.min(v, 1 - v) * source.cellsY < .5) {
      let poles = poleBiomes.get(source);
      if (!poles) {
        poles = [0, source.cellsY - 1].map(row => {
          const counts = new Array(13).fill(0);
          for (let col = 0; col < source.cellsX; col++) { const b = source.cellBiome[row * source.cellsX + col]; if (b < counts.length) counts[b]++; }
          return counts.indexOf(Math.max(...counts));
        });
        poleBiomes.set(source, poles);
      }
      biome = poles[v < .5 ? 0 : 1];
    }
    if (Math.min(u, 1 - u) * source.cellsX < 1 || Math.min(v, 1 - v) * source.cellsY < 1) lake = undefined;
  }
  return { height, biome: source.topology === 'ellipsoid' && height >= source.seaLevel ? (biome || 4) : biome ?? 0, land: height >= source.seaLevel && !lake, lake, cell };
}

function grain(x, y, salt) {
  let n = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263) ^ salt;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

/** Bounded raster, independent of physical planet size. No 40-million px canvas. */
export function rasterizeSurface(source, { width = 1536, relief = true } = {}) {
  if (!source?.cellH?.length || !source.cellsX || !source.cellsY) throw new Error('Нет высот карты');
  width = clamp(Math.round(width), 64, 2048);
  const height = clamp(Math.round(width * source.height / source.width), 32, 2048);
  const data = new Uint8ClampedArray(width * height * 4);
  const du = source.spacing / source.width;
  const dv = source.spacing / source.height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width; const v = (y + 0.5) / height;
      const s = sampleSurface(source, u, v);
      const noise = grain(Math.floor(u * source.width * 2), Math.floor(v * source.height * 2), source.seedSalt);
      let color;
      let light = 1 + ((noise % 9) - 4) / 120;
      if (!s.land) {
        // Interpolated depth tint, never nearest-cell offshore polygons.
        color = s.lake ? [59, 114, 141] : oceanColor(heightMeters(source, smoothHeight(source, u, v)));
      } else {
        color = landColor(s.biome, heightMeters(source, smoothHeight(source, u, v)));
        // NW lighting from actual height differences; no new hills/noise heights.
        if (relief) {
          light *= terrainLight(smoothHeight(source, u - du, v), smoothHeight(source, u + du, v), smoothHeight(source, u, v - dv), smoothHeight(source, u, v + dv), 1, .06);
        }
        if (FORESTS.has(s.biome)) {
          // Pixel canopy texture, not individual simulated trees or metre detail.
          if (noise % 13 < 3) light *= 0.72;
          else if (noise % 13 === 4) light *= 1.15;
        }
      }
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) data[i + c] = clamp(Math.round(color[c] * light), 0, 255);
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

export function createMapCamera(worldWidth, worldHeight, width, height) {
  return { worldWidth, worldHeight, width, height, x: 0.5, y: 0.5, zoom: 1 };
}
export function mapRect(camera) {
  const fit = Math.min(camera.width / camera.worldWidth, camera.height / camera.worldHeight);
  const width = camera.worldWidth * fit * camera.zoom;
  const height = camera.worldHeight * fit * camera.zoom;
  return { x: camera.width / 2 - camera.x * width, y: camera.height / 2 - camera.y * height, width, height };
}
export function screenToMap(camera, x, y) {
  const r = mapRect(camera);
  return { u: (x - r.x) / r.width, v: (y - r.y) / r.height };
}
export function clampCamera(camera) {
  const r = mapRect(camera);
  const hx = Math.min(0.5, camera.width / (2 * r.width));
  const hy = Math.min(0.5, camera.height / (2 * r.height));
  camera.x = camera.topology === 'ellipsoid' ? wrapLongitude(camera.x) : clamp(camera.x, hx, 1 - hx);
  camera.y = camera.topology === 'ellipsoid' ? clamp(camera.y, 0, 1) : clamp(camera.y, hy, 1 - hy);
}
export function maxMapZoom(camera) {
  const fit = Math.min(camera.width / camera.worldWidth, camera.height / camera.worldHeight);
  return Math.max(64, 8 / fit);
}
export function zoomMap(camera, factor, x = camera.width / 2, y = camera.height / 2) {
  const before = screenToMap(camera, x, y);
  camera.zoom = clamp(camera.zoom * factor, 1, maxMapZoom(camera));
  const after = screenToMap(camera, x, y);
  camera.x += before.u - after.u; camera.y += before.v - after.v;
  clampCamera(camera);
}
export function scaleBar(metersPerPixel) {
  const target = Math.max(1, metersPerPixel * 100);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const distance = [5, 2, 1].map((v) => v * magnitude).find((v) => v <= target) ?? magnitude;
  return { pixels: distance / metersPerPixel, label: distance >= 1000 ? `${(distance / 1000).toLocaleString('ru-RU')} км` : `${Math.round(distance)} м` };
}
