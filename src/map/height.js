import { canonicalUV } from '../world/geodesy.js';
/* Read-only interpolation of the existing Azgaar height grid. No noise,
   erosion pass or replacement world generator. Coordinates are normalized. */
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const smooth = (t) => t * t * (3 - 2 * t);
const poleHeights = new WeakMap();
export function smoothHeight(source, u, v) {
  if (source.topology === 'ellipsoid') {
    ({ u, v } = canonicalUV(u, v));
    const x = u * source.cellsX - .5;
    const y = clamp(v * source.cellsY - .5, 0, source.cellsY - 1);
    const ix = Math.floor(x), iy = Math.floor(y), nx = source.cellsX;
    const at = (col, row) => source.cellH[row * nx + ((col % nx) + nx) % nx];
    const tx = smooth(x - ix), ty = smooth(y - iy), next = Math.min(iy + 1, source.cellsY - 1);
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, next), d = at(ix + 1, next);
    let h = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    let poles = poleHeights.get(source);
    if (!poles) {
      poles = [0, 0];
      for (let col = 0; col < nx; col++) { poles[0] += at(col, 0) / nx; poles[1] += at(col, source.cellsY - 1) / nx; }
      poleHeights.set(source, poles);
    }
    // All longitudes meet at a pole. Only the outermost source row is blended;
    // no additional terrain/noise or dense global metre raster is generated.
    const cap = Math.min(v, 1 - v) * source.cellsY;
    if (cap < 1) { const pole = poles[v < .5 ? 0 : 1]; h = pole + (h - pole) * smooth(cap); }
    return h;
  }
  const x = clamp(u * source.width / source.spacing - 0.5, 0, source.cellsX - 1);
  const y = clamp(v * source.height / source.spacing - 0.5, 0, source.cellsY - 1);
  const ix = Math.floor(x); const iy = Math.floor(y);
  const nx = Math.min(ix + 1, source.cellsX - 1); const ny = Math.min(iy + 1, source.cellsY - 1);
  const tx = smooth(x - ix); const ty = smooth(y - iy);
  const a = source.cellH[iy * source.cellsX + ix]; const b = source.cellH[iy * source.cellsX + nx];
  const c = source.cellH[ny * source.cellsX + ix]; const d = source.cellH[ny * source.cellsX + nx];
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
/** Azgaar unitUtils.getHeight's metre conversion, before display rounding.
    A continuous shore blend avoids its 0->3m jump. Coast masks stay unchanged. */
export function heightMeters(source, units) {
  const exponent = source.heightExponent || 1.8;
  const sea = source.seaLevel || 20;
  const h = units - sea + 20;
  if (h >= 20) return (h - 18) ** exponent;
  if (h >= 19) return (h - 19) * 2 ** exponent;
  return h > 0 ? (h - 19) / h * 50 : -990;
}
