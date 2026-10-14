/*!
 * Browser translation of XaeroPlus geometry / Drawing.snap / ColorHelper.
 * Copyright (c) 2022 rfresh2 — MIT.
 * Source: rfresh2/XaeroPlus @18eac052d8ab6c7885976a0ff3fd215de857f6bd.
 * Full notice: ./license.js and vendor/xaeroplus/upstream/LICENSE.
 * Minecraft Mth calls are replaced with the equivalent JS math. No JVM/GL code.
 */
export const getColor = (r, g, b, a) => ((a & 255) << 24) | ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
export const getColorWithAlpha = (color, a) => ((a & 255) << 24) | (color & 0x00ffffff);
export const getIntR = (color) => (color >> 16) & 255;
export const getIntG = (color) => (color >> 8) & 255;
export const getIntB = (color) => color & 255;
export const getIntA = (color) => (color >> 24) & 255;
export const getColorRGBA = (color) => [getIntR(color), getIntG(color), getIntB(color), getIntA(color)].map((c) => c / 255);
// Canvas adapter, not present in upstream.
export const colorCSS = (color) => `rgba(${getIntR(color)},${getIntG(color)},${getIntB(color)},${getIntA(color) / 255})`;

// feature/render/line/Line.java — all methods, with Java record fields as properties.
export class Line {
  constructor(x1, z1, x2, z2) { Object.assign(this, { x1, z1, x2, z2 }); }
  length() { return Math.sqrt((this.x2 - this.x1) ** 2 + (this.z2 - this.z1) ** 2); }
  extrapolateToWorldBorder() { return this.extrapolateToMaxCoord(30_000_000); }
  extrapolateToMaxCoord(coord) {
    const dx = this.x2 - this.x1;
    if (dx === 0) return new Line(this.x1, -coord, this.x2, coord);
    const dz = this.z2 - this.z1;
    if (dz === 0) return new Line(-coord, this.z1, coord, this.z2);
    const slope = dz / dx; const intercept = this.z1 - slope * this.x1;
    let x1 = -coord; let z1 = slope * x1 + intercept;
    if (z1 < -coord) { z1 = -coord; x1 = (z1 - intercept) / slope; }
    else if (z1 > coord) { z1 = coord; x1 = (z1 - intercept) / slope; }
    let x2 = coord; let z2 = slope * x2 + intercept;
    if (z2 < -coord) { z2 = -coord; x2 = (z2 - intercept) / slope; }
    else if (z2 > coord) { z2 = coord; x2 = (z2 - intercept) / slope; }
    return new Line(Math.round(x1), Math.round(z1), Math.round(x2), Math.round(z2));
  }
  lineClip(rxMin, rxMax, rzMin, rzMax) {
    if (!(this.x1 < rxMin && this.x2 < rxMin) && !(this.x1 > rxMax && this.x2 > rxMax)) {
      if (!(this.z1 < rzMin && this.z2 < rzMin) && !(this.z1 > rzMax && this.z2 > rzMax)) {
        let xx1 = this.x1; let xx2 = this.x2; let zz1 = this.z1; let zz2 = this.z2;
        const m = (zz2 - zz1) / (xx2 - xx1); const n = 1 / m;
        if (xx1 < rxMin) { xx1 = rxMin; zz1 = m * (rxMin - this.x1) + this.z1; }
        else if (xx1 > rxMax) { xx1 = rxMax; zz1 = m * (rxMax - this.x1) + this.z1; }
        if (zz1 < rzMin) { zz1 = rzMin; xx1 = n * (rzMin - this.z1) + this.x1; }
        else if (zz1 > rzMax) { zz1 = rzMax; xx1 = n * (rzMax - this.z1) + this.x1; }
        if (xx2 < rxMin) { xx2 = rxMin; zz2 = m * (rxMin - this.x1) + this.z1; }
        else if (xx2 > rxMax) { xx2 = rxMax; zz2 = m * (rxMax - this.x1) + this.z1; }
        if (zz2 < rzMin) { zz2 = rzMin; xx2 = n * (rzMin - this.z1) + this.x1; }
        else if (zz2 > rzMax) { zz2 = rzMax; xx2 = n * (rzMax - this.z1) + this.x1; }
        if (!(xx1 < rxMin && xx2 < rxMin) && !(xx1 > rxMax && xx2 > rxMax)) return true;
      }
    }
    return false;
  }
  angle() {
    let degrees = Math.atan2(this.z2 - this.z1, this.x2 - this.x1) * 180 / Math.PI - 90;
    degrees %= 360;
    if (degrees >= 180) degrees -= 360;
    if (degrees < -180) degrees += 360;
    return degrees;
  }
}

// feature/render/ellipse/Ellipse.java — intersects is an AABB test, not an exact ellipse test.
export class Ellipse {
  constructor(centerX, centerZ, radiusX, radiusZ) {
    if (!(radiusX > 0) || !(radiusZ > 0)) throw new RangeError('Ellipse radii must be positive');
    Object.assign(this, { centerX, centerZ, radiusX, radiusZ });
  }
  intersects(minX, maxX, minZ, maxZ) {
    return this.centerX + this.radiusX >= minX && this.centerX - this.radiusX <= maxX && this.centerZ + this.radiusZ >= minZ && this.centerZ - this.radiusZ <= maxZ;
  }
}

// module/impl/Drawing.java: snap, getSnapThreshold, ellipseFromCenterAndRadii, snapEllipse.
export const getSnapThreshold = (scale) => Math.min(1000, Math.max(10, Math.floor(10 / scale)));
export function snapLine(x1, z1, x2, z2, scale) {
  const threshold = getSnapThreshold(scale);
  if (Math.floor(Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2)) <= threshold) return new Line(x1, z1, x2, z2);
  const xDelta = Math.abs(x2 - x1); const zDelta = Math.abs(z2 - z1);
  if (xDelta < threshold) return new Line(x1, z1, x1, z2);
  if (zDelta < threshold) return new Line(x1, z1, x2, z1);
  const dDelta = Math.abs(xDelta - zDelta);
  if (dDelta !== 0 && dDelta < threshold) {
    if (zDelta < xDelta) return new Line(x1, z1, x1 + zDelta * (x2 - x1 >= 0 ? 1 : -1), z2);
    if (xDelta < zDelta) return new Line(x1, z1, x2, z1 + xDelta * (z2 - z1 >= 0 ? 1 : -1));
  }
  return new Line(x1, z1, x2, z2);
}
export function ellipseFromCenterAndRadii(cx, cz, x, z) {
  const rx = Math.abs(x - cx); const rz = Math.abs(z - cz);
  return rx === 0 || rz === 0 ? null : new Ellipse(cx, cz, rx, rz);
}
export function snapEllipse(cx, cz, x, z, scale) {
  const ellipse = ellipseFromCenterAndRadii(cx, cz, x, z);
  if (!ellipse) return null;
  const threshold = getSnapThreshold(scale);
  if (Math.floor(Math.sqrt((x - cx) ** 2 + (z - cz) ** 2)) <= threshold) return ellipse;
  const delta = Math.abs(ellipse.radiusX - ellipse.radiusZ);
  if (delta !== 0 && delta < threshold) return new Ellipse(cx, cz, Math.min(ellipse.radiusX, ellipse.radiusZ), Math.min(ellipse.radiusX, ellipse.radiusZ));
  return ellipse;
}
