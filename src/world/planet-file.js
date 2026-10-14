import { createBlockField } from '../map/blocks.js';
import { cleanDrawings, cleanPins, cleanSettings } from '../map/xaeroplus/schema.js';
export const PLANET_FORMAT = 'Sages unified planet';
export const MAX_PLANET_BYTES = 32 * 1024 * 1024;
const arrayTypes = { Float32Array, Uint8Array, Int8Array, Uint16Array };
const fields = { cellH: Float32Array, cellBiome: Uint8Array, cellTemp: Int8Array, cellPrec: Uint8Array, cellFeature: Uint16Array, packHeight: Uint8Array, packBiome: Uint8Array, packLake: Uint16Array };
const fail = message => { throw new Error(`Файл планеты: ${message}`); };
function encoded(a) {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { type: a.constructor.name, data: btoa(binary) };
}
function decoded(raw, Type, length, optional) {
  if (raw === null && optional) return null;
  if (!raw || raw.type !== Type.name || typeof raw.data !== 'string' || raw.data.length !== 4 * Math.ceil(length * Type.BYTES_PER_ELEMENT / 3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw.data)) fail('неверный размер массива');
  const binary = atob(raw.data);
  if (binary.length !== length * Type.BYTES_PER_ELEMENT) fail('повреждён массив');
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new Type(bytes.buffer);
}
export const planetKey = config => `${config.seed}|${config.width}x${config.height}`;
export function stringifyPlanet({ config, source, pins = [], annotations = [], settings = {}, camera }) {
  if (!source) fail('география ещё не готова');
  const text = JSON.stringify({ format: PLANET_FORMAT, version: 1, config, source,
    pins: cleanPins(pins), annotations: cleanDrawings(annotations), settings: cleanSettings(settings), camera,
    precision: '1 metre address grid; interpolated coarse terrain, not measured metre-resolution data',
  }, (_, value) => ArrayBuffer.isView(value) && arrayTypes[value.constructor.name] ? encoded(value) : value);
  if (new TextEncoder().encode(text).length > MAX_PLANET_BYTES) fail('больше 32 МиБ');
  return text;
}
export function parsePlanet(text) {
  if (typeof text !== 'string' || text.length > MAX_PLANET_BYTES || new TextEncoder().encode(text).length > MAX_PLANET_BYTES) fail('больше 32 МиБ');
  const data = JSON.parse(text);
  if (data?.format !== PLANET_FORMAT || data.version !== 1) fail('неподдерживаемый формат');
  const c = data.config;
  if (!c || typeof c.seed !== 'string' || !c.seed.trim() || c.seed.length > 48 || ![c.width, c.height].every(n => Number.isFinite(n) && n > 0 && n <= 200_000_000)) fail('параметры мира');
  const raw = data.source;
  if (!raw || ![raw.width, raw.height, raw.cellsX, raw.cellsY].every(n => Number.isInteger(n) && n >= 2 && n <= 16384) || raw.cellsX * raw.cellsY > 1_000_000) fail('размер сетки');
  if (!(raw.spacing >= 1 && raw.spacing <= 16384 && Number.isFinite(raw.spacing)) || !(raw.seaLevel >= 1 && raw.seaLevel <= 100) || !(raw.heightExponent >= 1 && raw.heightExponent <= 3)) fail('единицы высоты');
  if (raw.topology !== undefined && raw.topology !== 'ellipsoid') fail('топология');
  if (raw.topology === 'ellipsoid' && (c.width < 1_000_000 || c.height < c.width * .48 || c.height > c.width * .5)) fail('размер эллипсоида');
  if (![raw.physicalWidth, raw.physicalHeight].every(n => Number.isFinite(n) && n > 0 && n <= 200_000_000)) fail('физический размер');
  if (c.width >= 1_000_000 && (raw.physicalWidth !== c.width || raw.physicalHeight !== c.height || c.height < c.width * .48 || c.height > c.width * .5)) fail('несогласованный масштаб');
  const source = { physicalWidth: raw.physicalWidth, physicalHeight: raw.physicalHeight, width: raw.width, height: raw.height, cellsX: raw.cellsX, cellsY: raw.cellsY, spacing: raw.spacing, seaLevel: raw.seaLevel, heightExponent: raw.heightExponent, seedSalt: Number(raw.seedSalt) | 0, topology: raw.topology };
  for (const [key, Type] of Object.entries(fields)) {
    const pack = key.startsWith('pack');
    const length = pack ? raw.width * raw.height : raw.cellsX * raw.cellsY;
    if (pack && length > 3_000_000 && raw[key] !== null) fail('растровая маска слишком велика');
    source[key] = decoded(raw[key], Type, length, pack);
  }
  if (![...source.cellH].every(n => Number.isFinite(n) && n >= 0 && n <= 100)) fail('неверные высоты');
  if (!Array.isArray(raw.features) || raw.features.length > 65534 || !Array.isArray(raw.rivers) || raw.rivers.length > 16384) fail('озёра или реки');
  source.features = raw.features.map((f, i) => {
    if (f?.i !== i + 1 || f.type !== 'lake' || !Number.isFinite(f.height) || f.height < 0 || f.height > 100 || typeof f.subtype !== 'string' || f.subtype.length > 64) fail('озеро');
    return { i: f.i, type: 'lake', subtype: f.subtype, height: f.height };
  });
  let points = 0;
  source.rivers = raw.rivers.map(r => {
    if (!r || !Number.isFinite(r.id) || !Array.isArray(r.points) || !Array.isArray(r.half) || !Array.isArray(r.flux) || r.points.length < 2 || r.points.length !== r.half.length || r.points.length !== r.flux.length || (points += r.points.length) > 250000) fail('русло');
    for (let i = 0; i < r.points.length; i++) {
      const p = r.points[i];
      if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || p[0] < -8 || p[1] < -8 || p[0] > source.width + 8 || p[1] > source.height + 8 || !Number.isFinite(r.half[i]) || r.half[i] < 0 || r.half[i] > 64 || !Number.isFinite(r.flux[i]) || r.flux[i] < 0 || r.flux[i] > 1e12) fail('точка реки');
    }
    return { id: r.id, points: r.points, half: r.half, flux: r.flux };
  });
  source.stats = { cells: source.cellsX * source.cellsY, rivers: source.rivers.length, lakes: source.features.length, riversSkipped: 0 };
  // Preflight the same bounded spatial index used by the renderer, BEFORE
  // an imported file is allowed to replace a slot. Schema-valid hostile river
  // networks must not fail only after the current world has been overwritten.
  createBlockField(source, source.physicalWidth, source.physicalHeight);
  const pins = cleanPins(data.pins), annotations = cleanDrawings(data.annotations);
  if (!Array.isArray(data.pins) || !Array.isArray(data.annotations) || pins.length !== data.pins.length || annotations.length !== data.annotations.length || pins.length > 64 || annotations.length > 256) fail('неверные метки или рисунки');
  let camera;
  if (data.camera) {
    const raw = data.camera;
    if (![raw.x, raw.y, raw.zoom].every(Number.isFinite) || raw.x < 0 || raw.x > 1 || raw.y < 0 || raw.y > 1 || raw.zoom < 1 || raw.zoom > 1e12) fail('камера');
    camera = { x: raw.x, y: raw.y, zoom: raw.zoom, worldWidth: source.physicalWidth, worldHeight: source.physicalHeight };
  }
  return { config: { seed: c.seed, width: c.width, height: c.height }, source, pins, annotations, settings: cleanSettings(data.settings), camera };
}
