import { canonicalUV, planetGeometry } from '../world/geodesy.js';
import { landColor, oceanColor, terrainLight } from './terrain-style.js';
/* Metre-column adapter over Azgaar, NOT a terrain generator or 3D engine.
   Only visible 64x64 LOD tiles are materialized. Water and ground share the
   same world-aligned integer lattice; no Canvas river polylines. */
import { sampleSurface, mapRect } from './raster.js';
import { smoothHeight, heightMeters } from './height.js';
export const BLOCK_METERS = 1;
export const TILE_BLOCKS = 64;
export const MAX_BLOCK_TILES = 128;
export const MAX_VISIBLE_SAMPLES = 262144;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const COLORS = [[40, 77, 143], [211, 191, 119], [173, 158, 122], [143, 158, 70], [109, 154, 67], [72, 126, 59], [62, 119, 60], [39, 105, 55], [47, 112, 76], [78, 110, 91], [150, 157, 128], [223, 230, 222], [76, 111, 73]];

export function blockLOD(camera) {
  const r = mapRect(camera); const mpp = camera.worldWidth / r.width;
  const area = Math.min(camera.width * mpp, camera.worldWidth) * Math.min(camera.height * mpp, camera.worldHeight);
  return 2 ** Math.max(0, Math.ceil(Math.log2(Math.max(1, mpp * 2, Math.sqrt(area / MAX_VISIBLE_SAMPLES)))));
}

export function createBlockField(source, worldWidth, worldHeight) {
  if (!(worldWidth > 0 && worldHeight > 0 && Number.isFinite(worldWidth) && Number.isFinite(worldHeight))) throw new Error('Неверный размер блочной карты');
  const geometry = source.topology === 'ellipsoid' ? planetGeometry(worldWidth, worldHeight) : null;
  const elevation = (x, z) => heightMeters(source, smoothHeight(source, geometry ? x / worldWidth : clamp(x / worldWidth, 0, 1), geometry ? z / worldHeight : clamp(z / worldHeight, 0, 1)));
  // Physical river widths are an explicit cartographic adaptation: Azgaar's
  // half-width is a symbol, not a measured kilometre-wide water body.
  const radius = (river, i) => clamp((river.half[i] || .4) * 2 + Math.sqrt(river.flux?.[i] || 1) * .125, 1, 64);
  const bucketSize = Math.max(256, Math.max(worldWidth, worldHeight) / 256);
  const buckets = new Map(); const broad = []; let indexed = 0;
  for (const river of source.rivers) {
    let previousY;
    for (let i = 1; i < river.points.length; i += 1) {
      const a = river.points[i - 1]; const b = river.points[i];
      const x1 = a[0] / source.width * worldWidth; const z1 = a[1] / source.height * worldHeight;
      const x2 = b[0] / source.width * worldWidth; const z2 = b[1] / source.height * worldHeight;
      const dx = x2 - x1; const dz = z2 - z1; const length2 = dx * dx + dz * dz;
      if (!length2 || !Number.isFinite(length2)) continue;
      const r1 = radius(river, i - 1); const r2 = radius(river, i);
      const y1 = previousY ?? Math.max(0, elevation(x1, z1) - 1);
      const y2 = Math.max(0, Math.min(y1, elevation(x2, z2) - 1)); previousY = y2;
      const segment = { x1, z1, dx, dz, length2, r1, r2, y1, y2, id: river.id };
      const pad = (Math.max(r1, r2) + 2) / (geometry ? Math.max(.0001, Math.min(geometry.parallelScale(z1 / worldHeight), geometry.parallelScale(z2 / worldHeight))) : 1);
      const minX = Math.floor((Math.min(x1, x2) - pad) / bucketSize); const maxX = Math.floor((Math.max(x1, x2) + pad) / bucketSize);
      const minZ = Math.floor((Math.min(z1, z2) - pad) / bucketSize); const maxZ = Math.floor((Math.max(z1, z2) + pad) / bucketSize);
      if ((maxX - minX + 1) * (maxZ - minZ + 1) > 256) { if (broad.length >= 4096) throw new Error('Слишком много протяжённых рек'); broad.push(segment); continue; }
      if (indexed + (maxX - minX + 1) * (maxZ - minZ + 1) > 500000) throw new Error('Слишком сложная сеть рек для блочного вида');
      for (let z = minZ; z <= maxZ; z += 1) for (let x = minX; x <= maxX; x += 1) {
        const key = `${x}:${z}`; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(segment); indexed += 1;
      }
    }
  }
  function riverAt(x, z, step = 1) {
    let found = null; let best = Infinity;
    const sx = geometry ? geometry.parallelScale(z / worldHeight) : 1, sz = geometry ? geometry.meridianScale(z / worldHeight) : 1;
    const visit = (s) => {
      const t = clamp(((x - s.x1) * s.dx * sx * sx + (z - s.z1) * s.dz * sz * sz) / (s.dx ** 2 * sx ** 2 + s.dz ** 2 * sz ** 2), 0, 1);
      const distance = Math.hypot((x - s.x1 - s.dx * t) * sx, (z - s.z1 - s.dz * t) * sz);
      const r = s.r1 + (s.r2 - s.r1) * t;
      // Aggregate LOD marks cells intersecting a river. At step=1 only the
      // actual metre-column width is used, never a minimum screen linewidth.
      const threshold = step === 1 ? r : Math.max(r, step * Math.SQRT1_2);
      const score = distance - threshold;
      if (score <= 2 && score < best) { best = score; found = { id: s.id, water: score <= 0, waterY: Math.floor(s.y1 + (s.y2 - s.y1) * t), radiusM: r }; }
    };
    // The pad accounts for coarse cells crossing bucket boundaries.
    const reach = step === 1 ? 0 : Math.ceil(step * Math.SQRT1_2 / bucketSize); const bx = Math.floor(x / bucketSize); const bz = Math.floor(z / bucketSize);
    const seen = new Set();
    for (let iz = bz - reach; iz <= bz + reach; iz += 1) for (let ix = bx - reach; ix <= bx + reach; ix += 1) {
      for (const s of buckets.get(`${ix}:${iz}`) || []) if (!seen.has(s)) { seen.add(s); visit(s); }
    }
    for (const s of broad) visit(s);
    return found;
  }
  function column(x, z, step = 1) {
    x = Math.floor(x); z = Math.floor(z);
    let u = clamp((x + .5) / worldWidth, 0, 1), v = clamp((z + .5) / worldHeight, 0, 1);
    let address;
    if (geometry) {
      ({ u, v } = canonicalUV((x + .5) / worldWidth, (z + .5) / worldHeight));
      // Snap only metre-detail queries, not global LOD samples. This avoids
      // hundreds of thousands of geodesic solves for a whole-planet overview.
      if (step === 1) { address = geometry.address(u, v); ({ u, v } = address); }
    }
    const s = sampleSurface(source, u, v);
    const rawY = Math.floor(elevation(u * worldWidth, v * worldHeight));
    const terrainY = s.land ? Math.max(1, rawY) : s.lake ? rawY : Math.min(-1, rawY);
    const river = s.land ? riverAt(geometry ? u * worldWidth : x + .5, geometry ? v * worldHeight : z + .5, step) : null;
    const waterY = river?.water ? river.waterY : s.lake ? Math.floor(heightMeters(source, s.lake.height ?? s.height)) : !s.land ? 0 : null;
    const groundY = river?.water ? waterY - 2 : s.lake ? Math.min(terrainY, waterY - 2) : terrainY;
    let material = !s.land ? s.lake ? 'lake' : 'ocean' : river ? river.water ? 'river' : 'sand' : terrainY > 4400 || s.biome === 11 ? 'snow' : terrainY > 2800 ? 'stone' : s.biome === 1 || s.biome === 2 ? 'sand' : 'grass';
    if (s.lake?.subtype === 'lava') material = 'lava';
    return { x: address?.x ?? x, z: address?.z ?? z, latitude: address?.latitude, longitude: address?.longitude, groundY, terrainY, waterY, biome: s.biome, material, riverRadiusM: river?.radiusM ?? null, riverId: river?.id ?? null };
  }
  return { column, elevation, riverAt, geometry, worldWidth, worldHeight, stats: { buckets: buckets.size, indexed, broad: broad.length } };
}

export function buildBlockTile(field, tx, tz, step, relief = true) {
  const size = TILE_BLOCKS; const terrain = new Uint8ClampedArray(size * size * 4); const rivers = new Uint8ClampedArray(terrain.length);
  for (let z = 0; z < size; z += 1) for (let x = 0; x < size; x += 1) {
    const mx = (tx * size + x) * step; const mz = (tz * size + z) * step;
    if (mx >= field.worldWidth || mz >= field.worldHeight || mx + step <= 0 || mz + step <= 0) continue;
    const c = field.column(mx + step / 2, mz + step / 2, step);
    const color = c.material === 'ocean' ? oceanColor(c.terrainY) : c.material === 'lava' ? [192, 67, 30] : c.material === 'lake' ? [59, 114, 141] : c.material === 'sand' ? COLORS[1] : landColor(c.biome, c.terrainY);
    let light = 1;
    if (relief && c.material !== 'ocean' && c.material !== 'lake') {
      const delta = Math.max(step, 16);
      light = terrainLight(field.elevation(mx - delta, mz), field.elevation(mx + delta, mz), field.elevation(mx, mz - delta), field.elevation(mx, mz + delta), delta, 4 + Math.min(8, Math.log2(step + 1)));
      // Physical metre steps remain visible; hillshade never alters their Y.
      if (step === 1 && Math.floor(field.elevation(mx - 1, mz - 1)) !== c.terrainY) light *= .86;
    }
    const i = (z * size + x) * 4;
    for (let k = 0; k < 3; k += 1) terrain[i + k] = Math.round(color[k] * light);
    terrain[i + 3] = 255;
    if (c.material === 'river') { const tint = step === 1 ? ((mx + mz) % 2 ? 3 : -3) : 0; rivers[i] = 52 + tint; rivers[i + 1] = 119 + tint; rivers[i + 2] = 173 + tint; rivers[i + 3] = step === 1 ? 255 : Math.round(Math.max(.06, Math.min(1, 2 * c.riverRadiusM / step)) * 255); }
  }
  return { width: size, height: size, terrain, rivers };
}

export function createBlockRenderer(field) {
  const cache = new Map(); let hits = 0; let builds = 0;
  const bitmap = (bytes, width, height) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas блоков недоступен');
    const image = ctx.createImageData(width, height); image.data.set(bytes); ctx.putImageData(image, 0, 0); return canvas;
  };
  function tile(x, z, step, relief) {
    const key = `${step}:${x}:${z}:${relief}`;
    if (cache.has(key)) { const entry = cache.get(key); cache.delete(key); cache.set(key, entry); hits += 1; return entry; }
    const pixels = buildBlockTile(field, x, z, step, relief);
    const entry = { terrain: bitmap(pixels.terrain, pixels.width, pixels.height), rivers: bitmap(pixels.rivers, pixels.width, pixels.height) };
    cache.set(key, entry); builds += 1;
    while (cache.size > MAX_BLOCK_TILES) cache.delete(cache.keys().next().value);
    return entry;
  }
  function paint(ctx, camera, relief, layer = 'terrain') {
    const r = mapRect(camera); const step = blockLOD(camera); const span = step * TILE_BLOCKS;
    const transform = ctx.getTransform?.(); const dpr = Number(transform?.a) || 1;
    const pixel = (n) => Math.round(n * dpr) / dpr;
    const x0 = Math.max(0, Math.floor((-r.x / r.width * field.worldWidth) / span));
    const z0 = Math.max(0, Math.floor((-r.y / r.height * field.worldHeight) / span));
    const x1 = Math.min(Math.ceil(field.worldWidth / span) - 1, Math.floor((camera.width - r.x) / r.width * field.worldWidth / span));
    const z1 = Math.min(Math.ceil(field.worldHeight / span) - 1, Math.floor((camera.height - r.y) / r.height * field.worldHeight / span));
    for (let z = z0; z <= z1; z += 1) for (let x = x0; x <= x1; x += 1) {
      const entry = tile(x, z, step, relief);
      // Shared rounded boundaries prevent transparent Canvas tile seams.
      const left = pixel(r.x + x * span / field.worldWidth * r.width); const top = pixel(r.y + z * span / field.worldHeight * r.height);
      const right = pixel(r.x + (x + 1) * span / field.worldWidth * r.width); const bottom = pixel(r.y + (z + 1) * span / field.worldHeight * r.height);
      ctx.drawImage(entry[layer], left, top, right - left, bottom - top);
    }
    if (!field.geometry && layer === 'terrain' && step === 1 && r.width / field.worldWidth >= 6) {
      ctx.strokeStyle = 'rgba(15,28,20,.15)'; ctx.lineWidth = .5; ctx.beginPath();
      const left = Math.max(0, Math.floor(-r.x / r.width * field.worldWidth)); const right = Math.min(field.worldWidth, Math.ceil((camera.width - r.x) / r.width * field.worldWidth));
      const top = Math.max(0, Math.floor(-r.y / r.height * field.worldHeight)); const bottom = Math.min(field.worldHeight, Math.ceil((camera.height - r.y) / r.height * field.worldHeight));
      for (let x = left; x <= right; x += 1) { const px = r.x + x / field.worldWidth * r.width; ctx.moveTo(px, 0); ctx.lineTo(px, camera.height); }
      for (let z = top; z <= bottom; z += 1) { const py = r.y + z / field.worldHeight * r.height; ctx.moveTo(0, py); ctx.lineTo(camera.width, py); }
      ctx.stroke();
    }
    return step;
  }
  return { paint, clear: () => cache.clear(), stats: () => ({ cached: cache.size, hits, builds }) };
}
