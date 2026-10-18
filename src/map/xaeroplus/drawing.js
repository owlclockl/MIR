/* Browser host for MIT XaeroPlus geometry. The six DrawingMode tools are
   adapted to source-map units; no Minecraft blocks or terrain are generated. */
import { Line, Ellipse, getColorWithAlpha, colorCSS, snapLine, snapEllipse, ellipseFromCenterAndRadii } from './geometry.js';

export function createAnnotation(mode, start, end, source, color, scale, snap = true, style = {}) {
  const x1 = Math.round(start.u * source.width); const z1 = Math.round(start.v * source.height);
  const x2 = Math.round(end.u * source.width); const z2 = Math.round(end.v * source.height);
  const common = { color, width: style.width || 2 };
  if (mode === 'text') return style.text?.trim() ? { type: mode, u1: start.u, v1: start.v, u2: start.u, v2: start.v, ...common, text: style.text.trim().slice(0, 160), fontSize: style.fontSize || 16 } : null;
  if (mode === 'highlight') return x1 !== x2 && z1 !== z2 ? { type: mode, u1: x1 / source.width, v1: z1 / source.height, u2: x2 / source.width, v2: z2 / source.height, ...common } : null;
  if (mode === 'ellipse') {
    const e = snap ? snapEllipse(x1, z1, x2, z2, scale) : ellipseFromCenterAndRadii(x1, z1, x2, z2);
    if (!e) return null;
    return { type: mode, u1: e.centerX / source.width, v1: e.centerZ / source.height,
      u2: (e.centerX + e.radiusX * Math.sign(x2 - x1)) / source.width,
      v2: (e.centerZ + e.radiusZ * Math.sign(z2 - z1)) / source.height, ...common };
  }
  const l = snap ? snapLine(x1, z1, x2, z2, scale) : new Line(x1, z1, x2, z2);
  if (!l.length()) return null;
  return { type: mode, u1: l.x1 / source.width, v1: l.z1 / source.height, u2: l.x2 / source.width, v2: l.z2 / source.height, ...common };
}
export function measurementLength(shape, worldWidth, worldHeight) {
  return new Line(shape.u1 * worldWidth, shape.v1 * worldHeight, shape.u2 * worldWidth, shape.v2 * worldHeight).length();
}

/** Upstream extrapolation in integer host units, then intersection with Sages'
    rectangular map instead of Minecraft's square +/-30M world border. */
export function infiniteEndpoints(s) {
  const scale = 1e12;
  const l = new Line(s.u1 * scale, s.v1 * scale, s.u2 * scale, s.v2 * scale).extrapolateToMaxCoord(1e15);
  const a = [l.x1 / scale, l.z1 / scale]; const dx = (l.x2 - l.x1) / scale; const dy = (l.z2 - l.z1) / scale;
  const points = [];
  for (const x of [0, 1]) if (dx) { const t = (x - a[0]) / dx; const y = a[1] + dy * t; if (y >= -1e-8 && y <= 1 + 1e-8) points.push([x, Math.max(0, Math.min(1, y))]); }
  for (const y of [0, 1]) if (dy) { const t = (y - a[1]) / dy; const x = a[0] + dx * t; if (x >= -1e-8 && x <= 1 + 1e-8) points.push([Math.max(0, Math.min(1, x)), y]); }
  const unique = points.filter((p, i) => !points.slice(0, i).some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-8));
  return unique.length >= 2 ? [unique[0], unique[1]] : [[s.u1, s.v1], [s.u2, s.v2]];
}
export function annotationBounds(s) {
  if (s.type === 'ellipse') return [s.u1 - Math.abs(s.u2 - s.u1), s.v1 - Math.abs(s.v2 - s.v1), s.u1 + Math.abs(s.u2 - s.u1), s.v1 + Math.abs(s.v2 - s.v1)];
  if (s.type === 'infinite') { const [a, b] = infiniteEndpoints(s); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; }
  return [Math.min(s.u1, s.u2), Math.min(s.v1, s.v2), Math.max(s.u1, s.u2), Math.max(s.v1, s.v2)];
}
export function paintAnnotations(ctx, shapes, rect, camera, preview = false) {
  const bounds = [-rect.x / rect.width, (camera.width - rect.x) / rect.width, -rect.y / rect.height, (camera.height - rect.y) / rect.height];
  ctx.lineCap = 'round';
  for (const shape of shapes) {
    if (!shape) continue;
    ctx.lineWidth = preview ? 1.5 : shape.width || 2;
    ctx.strokeStyle = colorCSS(preview ? getColorWithAlpha(shape.color, 80) : shape.color); ctx.fillStyle = ctx.strokeStyle;
    const x = rect.x + shape.u1 * rect.width; const y = rect.y + shape.v1 * rect.height;
    const x2 = rect.x + shape.u2 * rect.width; const y2 = rect.y + shape.v2 * rect.height;
    if (shape.type === 'text') {
      ctx.font = `${shape.fontSize || 16}px Inter, sans-serif`; ctx.textBaseline = 'middle'; ctx.fillText(shape.text, x, y);
    } else if (shape.type === 'highlight') {
      ctx.fillRect(Math.min(x, x2), Math.min(y, y2), Math.abs(x2 - x), Math.abs(y2 - y));
    } else if (shape.type === 'ellipse') {
      const ellipse = ellipseFromCenterAndRadii(shape.u1, shape.v1, shape.u2, shape.v2);
      if (!ellipse || !new Ellipse(ellipse.centerX, ellipse.centerZ, ellipse.radiusX, ellipse.radiusZ).intersects(...bounds)) continue;
      ctx.beginPath(); ctx.ellipse(x, y, Math.abs(x2 - x), Math.abs(y2 - y), 0, 0, Math.PI * 2); ctx.stroke();
    } else {
      const [a, b] = shape.type === 'infinite' ? infiniteEndpoints(shape) : [[shape.u1, shape.v1], [shape.u2, shape.v2]];
      if (!new Line(...a, ...b).lineClip(...bounds)) continue;
      ctx.beginPath(); ctx.moveTo(rect.x + a[0] * rect.width, rect.y + a[1] * rect.height); ctx.lineTo(rect.x + b[0] * rect.width, rect.y + b[1] * rect.height); ctx.stroke();
      if (shape.type !== 'infinite') { ctx.fillRect(x - 2, y - 2, 4, 4); ctx.fillRect(x2 - 2, y2 - 2, 4, 4); }
    }
  }
}
