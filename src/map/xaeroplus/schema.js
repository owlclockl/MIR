/* Browser data model. Upstream snapshots stay immutable. */
export const DRAWING_TYPES = ['line', 'infinite', 'highlight', 'ellipse', 'text'];
export const LAYERS = { rivers: 'Реки', grid: 'Сетки', drawings: 'Рисунки', pins: 'Метки' };
const finite = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
export const cleanDrawings = (items) => Array.isArray(items) ? items.filter((s) => s && DRAWING_TYPES.includes(s.type)
  && ['u1', 'v1', 'u2', 'v2'].every((k) => finite(s[k], 0, 1))
  && Number.isInteger(s.color) && finite(s.color, -2147483648, 4294967295)
  && (s.type === 'text' ? typeof s.text === 'string' && s.text.trim() : s.type === 'ellipse' || s.type === 'highlight' ? s.u1 !== s.u2 && s.v1 !== s.v2 : s.u1 !== s.u2 || s.v1 !== s.v2)
).slice(0, 256).map((s) => ({ type: s.type, u1: s.u1, v1: s.v1, u2: s.u2, v2: s.v2, color: s.color | 0,
  width: finite(s.width, 1, 8) ? s.width : 2, ...(s.type === 'text' ? { text: s.text.trim().slice(0, 160), fontSize: finite(s.fontSize, 8, 40) ? s.fontSize : 16 } : {}) })) : [];
export const cleanPins = (items) => Array.isArray(items) ? items.filter((p) => p && finite(p.u, 0, 1) && finite(p.v, 0, 1)).slice(0, 64)
  .map((p) => ({ u: p.u, v: p.v, name: String(p.name || 'Метка').slice(0, 40) })) : [];
export function cleanSettings(raw = {}) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const ids = Array.isArray(raw.order) ? raw.order : typeof raw.order === 'string' ? loadDrawOrder(raw.order) : [];
  const order = [...new Set(ids.filter((id) => Object.hasOwn(LAYERS, id)))];
  for (const id of Object.keys(LAYERS)) if (!order.includes(id)) order.push(id);
  return {
    relief: raw.relief !== false, minimap: raw.minimap !== false, labels: raw.labels !== false,
    gridMode: ['none', 'coordinates', 'regions', 'mapart'].includes(raw.gridMode) ? raw.gridMode : 'none',
    gridZoom: Number.isInteger(raw.gridZoom) && finite(raw.gridZoom, 0, 4) ? raw.gridZoom : 0,
    color: /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : '#ff0000',
    alpha: Number.isInteger(raw.alpha) && finite(raw.alpha, 20, 255) ? raw.alpha : 200,
    lineWidth: finite(raw.lineWidth, 1, 8) ? raw.lineWidth : 2,
    fontSize: finite(raw.fontSize, 8, 40) ? raw.fontSize : 16,
    order, layers: Object.fromEntries(Object.keys(LAYERS).map((id) => [id, raw.layers?.[id] !== false])),
  };
}

/* Translation of util/DrawOrderHelper.java, Copyright (c) 2022 rfresh2, MIT.
   Browser validation of known layers is performed separately in cleanSettings. */
export const loadDrawOrder = (value) => String(value || '').split('|').filter((id) => id.trim()).map((id) => id.trim());
export const serializeDrawOrder = (ids) => ids.join('|');

/** Snapshot-based browser host undo/redo. Includes pins + drawings atomically. */
const clone = (state) => JSON.parse(JSON.stringify(state));
export class EditHistory {
  constructor() { this.past = []; this.future = []; }
  record(state) { this.past.push(clone(state)); if (this.past.length > 64) this.past.shift(); this.future = []; }
  undo(state) { if (!this.past.length) return null; this.future.push(clone(state)); return this.past.pop(); }
  redo(state) { if (!this.future.length) return null; this.past.push(clone(state)); return this.future.pop(); }
  clear() { this.past = []; this.future = []; }
}
