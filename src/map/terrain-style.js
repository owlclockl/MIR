/* Cartographic style over measured/interpolated heights. Never changes terrain.
   Hypsometric transitions are continuous; biome colours still come from Azgaar. */
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const blend = (a, b, t) => a.map((v, i) => v + (b[i] - v) * clamp(t));
const BIOMES = [[40, 77, 143], [211, 191, 119], [173, 158, 122], [143, 158, 70], [109, 154, 67], [72, 126, 59], [62, 119, 60], [39, 105, 55], [47, 112, 76], [78, 110, 91], [150, 157, 128], [223, 230, 222], [76, 111, 73]];
export function landColor(biome, meters) {
  const base = BIOMES[biome] || BIOMES[4];
  if (biome === 11) return [...BIOMES[11]];
  const upland = blend(base, [151, 145, 112], (meters - 500) / 2300 * .65);
  const rock = blend(upland, [151, 151, 142], (meters - 1600) / 2300);
  return blend(rock, [232, 235, 231], (meters - 3800) / 1700);
}
/** Colour depth, not new bathymetry. Use interpolated ocean elevations so the
    old giant nearest-cell offshore polygons do not reappear. */
export function oceanColor(meters) {
  return blend([28, 56, 103], [55, 105, 153], Math.exp(Math.min(0, meters) / 25));
}
/** NW hillshade; exaggeration affects the light normal ONLY, never block Y. */
export function terrainLight(west, east, north, south, distance, exaggeration = 12) {
  const nx = (west - east) / (2 * distance) * exaggeration;
  const nz = (north - south) / (2 * distance) * exaggeration;
  const dot = (-.4 * nx - .4 * nz + .8246) / Math.hypot(nx, nz, 1);
  return clamp(.35 + .8 * Math.max(0, dot), .4, 1.16);
}
