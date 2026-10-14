// GeographicLib (MIT, Charles Karney): robust ellipsoidal geodesics, including
// antipodal points. This is coordinate geometry, NOT measured terrain data.
import GeographicLib from 'geographiclib-geodesic';
export const wrapLongitude = u => ((u % 1) + 1) % 1;
export function canonicalUV(u, v) {
  v = ((v % 2) + 2) % 2;
  if (v > 1) { v = 2 - v; u += .5; }
  return { u: v === 0 || v === 1 ? 0 : wrapLongitude(u), v };
}
const models = new Map();
export function planetGeometry(width, height) {
  const key = `${width}:${height}`;
  if (models.has(key)) return models.get(key);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height < width * .48 || height > width * .5) throw new Error('Планета требует экватор и полумеридиан эллипсоида');
  const a = width / (2 * Math.PI);
  let lo = 0, hi = .1;
  for (let i = 0; i < 42; i++) {
    const f = (lo + hi) / 2;
    const g = new GeographicLib.Geodesic.Geodesic(a, f);
    if (g.Inverse(90, 0, -90, 0).s12 > height) lo = f; else hi = f;
  }
  const f = (lo + hi) / 2, e2 = f * (2 - f);
  const geodesic = new GeographicLib.Geodesic.Geodesic(a, f);
  const geo = (u, v) => { const p = canonicalUV(u, v); return { lat: 90 - p.v * 180, lon: p.u * 360 - 180 }; };
  const circumference = lat => { const p = lat * Math.PI / 180; return 2 * Math.PI * a * Math.cos(p) / Math.sqrt(1 - e2 * Math.sin(p) ** 2); };
  const rows = new Map();
  function row(z) {
    z = Math.max(0, Math.min(Math.ceil(height) - 1, Math.floor(z)));
    if (rows.has(z)) return rows.get(z);
    const distance = (z + Math.min(height, z + 1)) / 2;
    const lat = geodesic.Direct(90, 0, 180, distance).lat2;
    const value = { z, lat, circumference: Math.max(1e-9, circumference(lat)), v: (90 - lat) / 180 };
    rows.set(z, value);
    if (rows.size > 512) rows.delete(rows.keys().next().value);
    return value;
  }
  function address(u, v) {
    const p = canonicalUV(u, v), point = geo(p.u, p.v);
    const z = Math.min(Math.ceil(height) - 1, Math.floor(geodesic.Inverse(90, 0, point.lat, 0).s12));
    const r = row(z), x = Math.floor(p.u * r.circumference);
    // 1 m arcs along a parallel; the closing cell of each row can be shorter.
    const center = (x + Math.min(x + 1, r.circumference)) / 2;
    return { x, z, u: center / r.circumference, v: r.v, latitude: r.lat, longitude: center / r.circumference * 360 - 180 };
  }
  const model = { a, f, geodesic, geo, address, row,
    distance(u1, v1, u2, v2) { const p = geo(u1, v1), q = geo(u2, v2); return geodesic.Inverse(p.lat, p.lon, q.lat, q.lon).s12; },
    meridianScale(v) { const phi = (90 - Math.max(0, Math.min(1, v)) * 180) * Math.PI / 180; return Math.PI * a * (1 - e2) / (1 - e2 * Math.sin(phi) ** 2) ** 1.5 / height; },
    parallelScale(v) { return Math.max(0, circumference(90 - Math.max(0, Math.min(1, v)) * 180) / width); },
  };
  models.set(key, model);
  if (models.size > 8) models.delete(models.keys().next().value);
  return model;
}

export function geodesicRoute(model, shape) {
  const p = model.geo(shape.u1, shape.v1), q = model.geo(shape.u2, shape.v2);
  const line = model.geodesic.InverseLine(p.lat, p.lon, q.lat, q.lon);
  const segments = Math.max(2, Math.min(256, Math.ceil(line.s13 / Math.max(10, model.a / 64))));
  const points = [];
  let previous = shape.u1;
  for (let i = 0; i <= segments; i++) {
    const point = line.Position(line.s13 * i / segments);
    let u = (point.lon2 + 180) / 360;
    u += Math.round(previous - u); previous = u;
    points.push([u, (90 - point.lat2) / 180]);
  }
  return points;
}
