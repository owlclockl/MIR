import { infiniteEndpoints } from './drawing.js';
import { cleanDrawings, cleanPins, cleanSettings } from './schema.js';
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export function makeProject(world, drawings, pins, settings) {
  return { format: 'MIR surface annotations', version: 1, world: { key: world.key, widthM: world.widthM, heightM: world.heightM },
    drawings: cleanDrawings(drawings), pins: cleanPins(pins), settings: cleanSettings(settings) };
}
const geo = (u, v) => [u * 360 - 180, 90 - v * 180];
function uv(position) {
  if (!Array.isArray(position) || !Number.isFinite(position[0]) || !Number.isFinite(position[1]) || position[0] < -180 || position[0] > 180 || position[1] < -90 || position[1] > 90) throw new Error('Координаты GeoJSON вне карты');
  return [(position[0] + 180) / 360, (90 - position[1]) / 180];
}
// Clip an ellipse polygon to the map. Unlike clamping vertices, this retains
// the exact straight border intersections (Sutherland–Hodgman host adapter).
function clipPolygon(points) {
  for (const [axis, edge, direction] of [[0, 0, 1], [0, 1, -1], [1, 0, 1], [1, 1, -1]]) {
    const output = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i]; const b = points[(i + 1) % points.length];
      const insideA = (a[axis] - edge) * direction >= 0; const insideB = (b[axis] - edge) * direction >= 0;
      if (insideA) output.push(a);
      if (insideA !== insideB) { const t = (edge - a[axis]) / (b[axis] - a[axis]); output.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    points = output;
  }
  return points;
}
function drawingGeometry(s) {
  if (s.type === 'text') return { type: 'Point', coordinates: geo(s.u1, s.v1) };
  if (s.type === 'ellipse' || s.type === 'highlight') {
    let points = s.type === 'highlight' ? [[s.u1, s.v1], [s.u2, s.v1], [s.u2, s.v2], [s.u1, s.v2]]
      : Array.from({ length: 64 }, (_, i) => [s.u1 + Math.abs(s.u2 - s.u1) * Math.cos(i * Math.PI / 32), s.v1 + Math.abs(s.v2 - s.v1) * Math.sin(i * Math.PI / 32)]);
    points = clipPolygon(points).map(([u, v]) => geo(u, v));
    // RFC 7946 exterior rings are counterclockwise.
    const area = points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
    if (area < 0) points.reverse();
    return { type: 'Polygon', coordinates: [[...points, points[0]]] };
  }
  const endpoints = s.type === 'infinite' ? infiniteEndpoints(s) : [[s.u1, s.v1], [s.u2, s.v2]];
  return { type: 'LineString', coordinates: endpoints.map(([u, v]) => geo(u, v)) };
}
export function makeGeoJSON(drawings, pins) {
  const features = cleanDrawings(drawings).map((s) => ({ type: 'Feature', properties: { mirDrawing: s, ...(s.type === 'text' ? { name: s.text } : {}) }, geometry: drawingGeometry(s) }));
  for (const p of cleanPins(pins)) features.push({ type: 'Feature', properties: { name: p.name }, geometry: { type: 'Point', coordinates: geo(p.u, p.v) } });
  return { type: 'FeatureCollection', mirProjection: 'fictional whole-world equirectangular', features };
}
export function parseProject(text, world) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('Файл больше 2 МиБ');
  let data; try { data = JSON.parse(text); } catch { throw new Error('Не удалось прочитать JSON'); }
  if (!data || typeof data !== 'object') throw new Error('Неверный формат файла');
  if (data.type === 'FeatureCollection') {
    if (!Array.isArray(data.features) || data.features.length > 320) throw new Error('GeoJSON: максимум 320 объектов');
    const drawings = []; const pins = [];
    for (const f of data.features) {
      if (f?.type !== 'Feature') throw new Error('GeoJSON: ожидался Feature');
      const g = f?.geometry; const props = f?.properties || {};
      if (props.mirDrawing) {
        const valid = cleanDrawings([props.mirDrawing]); if (valid.length !== 1) throw new Error('Повреждённый рисунок GeoJSON');
        drawings.push(valid[0]);
      } else if (g?.type === 'Point') {
        const [u, v] = uv(g.coordinates); pins.push({ u, v, name: String(props.name || 'Метка GeoJSON') });
      } else if (g?.type === 'LineString' || g?.type === 'Polygon') {
        const rings = g.type === 'Polygon' ? g.coordinates : [g.coordinates];
        if (!Array.isArray(rings) || rings.length > 16 || !rings.length) throw new Error('Неверная геометрия GeoJSON');
        for (const ring of rings) {
          if (!Array.isArray(ring) || ring.length < (g.type === 'Polygon' ? 4 : 2) || ring.length > 257) throw new Error('GeoJSON: линия должна содержать 2…257 точек');
          if (g.type === 'Polygon' && JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1))) throw new Error('GeoJSON: кольцо полигона не замкнуто');
          for (let i = 1; i < ring.length; i += 1) {
            if (drawings.length >= 256) throw new Error('GeoJSON: максимум 256 отрезков');
            const [u1, v1] = uv(ring[i - 1]); const [u2, v2] = uv(ring[i]);
            if (u1 !== u2 || v1 !== v2) drawings.push({ type: 'line', u1, v1, u2, v2, color: -939589632, width: 2 });
          }
        }
      } else throw new Error('GeoJSON: поддержаны точки, линии и контуры полигонов');
      if (drawings.length > 256 || pins.length > 64) throw new Error('Превышен лимит: 256 рисунков и 64 метки');
    }
    const valid = cleanDrawings(drawings);
    if (valid.length !== drawings.length) throw new Error('GeoJSON содержит нулевые или неверные линии');
    return { drawings: valid, pins: cleanPins(pins) };
  }
  if (data.format !== 'MIR surface annotations' || data.version !== 1) throw new Error('Это не файл рисунков поверхности MIR');
  if (data.world?.key !== world.key || data.world?.widthM !== world.widthM || data.world?.heightM !== world.heightM) throw new Error('Seed или физический размер файла не совпадает с текущей картой');
  if (!Array.isArray(data.drawings) || !Array.isArray(data.pins) || data.drawings.length > 256 || data.pins.length > 64) throw new Error('Неверные списки или превышен лимит');
  const drawings = cleanDrawings(data.drawings); const pins = cleanPins(data.pins);
  if (drawings.length !== data.drawings.length || pins.length !== data.pins.length) throw new Error('В файле неверные координаты или типы объектов');
  return { drawings, pins, settings: cleanSettings(data.settings) };
}
