import { BIOME, BLOCK, CHUNK_SIZE, WORLD_HEIGHT } from './world.js';

const MAP_RASTER_WIDTH = 360;
const MAP_RASTER_HEIGHT = 180;
const VIEW_SIDE = 24;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.5;
const worldMapCache = new WeakMap();

const BIOME_COLORS = Object.freeze({
  [BIOME.DEEP_OCEAN]: '#123947',
  [BIOME.COASTAL_WATER]: '#245a69',
  [BIOME.COAST]: '#b6a875',
  [BIOME.GRASSLAND]: '#708d69',
  [BIOME.FOREST]: '#466d55',
  [BIOME.DESERT]: '#b58d58',
  [BIOME.TAIGA]: '#607a70',
  [BIOME.TUNDRA]: '#a4b6aa',
  [BIOME.HIGHLANDS]: '#848b83',
});

const MATERIAL_COLORS = Object.freeze({
  [BLOCK.GRASS]: '#6d966a',
  [BLOCK.DIRT]: '#886747',
  [BLOCK.STONE]: '#6b7880',
  [BLOCK.SAND]: '#c8b982',
  [BLOCK.WATER]: '#39788a',
  [BLOCK.SNOW]: '#d8e5df',
});

const getContext = (canvas) => {
  try {
    return canvas?.getContext?.('2d') ?? null;
  } catch {
    return null;
  }
};

const rgb = (hex) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const scaleRgb = (color, factor) =>
  `rgb(${color.map((channel) => Math.max(0, Math.min(255, Math.round(channel * factor)))).join(',')})`;

const getViewportMetrics = (width, zoom) => {
  const safeZoom = clamp(Number(zoom) || 1, MIN_ZOOM, MAX_ZOOM);
  const viewSide = Math.max(8, Math.round(VIEW_SIDE / safeZoom));
  const tileWidth = Math.min(26, width / (viewSide + 5)) * safeZoom;
  return { zoom: safeZoom, viewSide, tileWidth };
};

/** Переводит смещение мыши при перетаскивании из пикселей в координаты мира. */
export const cameraPanDelta = (width, height, dragX, dragY, zoom = 1) => {
  if (!(width > 0 && height > 0)) return { x: 0, z: 0 };
  const { tileWidth } = getViewportMetrics(width, zoom);
  const halfWidth = tileWidth / 2;
  const halfHeight = tileWidth * 0.52 / 2;
  if (!(halfWidth > 0 && halfHeight > 0)) return { x: 0, z: 0 };
  const worldX = (-dragX / halfWidth - dragY / halfHeight) / 2;
  const worldZ = (dragX / halfWidth - dragY / halfHeight) / 2;
  return { x: worldX || 0, z: worldZ || 0 };
};

const getMapData = (world) => {
  const length = MAP_RASTER_WIDTH * MAP_RASTER_HEIGHT;
  const heights = new Uint8Array(length);
  const biomes = new Uint8Array(length);
  const depths = new Uint8Array(length);
  const land = new Uint8Array(length);

  for (let py = 0; py < MAP_RASTER_HEIGHT; py += 1) {
    const v = (py + 0.5) / MAP_RASTER_HEIGHT;
    for (let px = 0; px < MAP_RASTER_WIDTH; px += 1) {
      const u = (px + 0.5) / MAP_RASTER_WIDTH;
      const sample = world.sampleAtNormalized(u, v);
      const index = py * MAP_RASTER_WIDTH + px;
      heights[index] = sample.height;
      biomes[index] = sample.biome;
      depths[index] = sample.waterDepth;
      land[index] = sample.land ? 1 : 0;
    }
  }

  return { heights, biomes, depths, land };
};

const heightColor = (height) => {
  if (height < 18) return [15, 49, 64];
  if (height < 29) return [22, 66, 77];
  if (height < 35) return [37, 88, 93];
  if (height < 45) return [126, 132, 92];
  if (height < 57) return [105, 132, 85];
  if (height < 68) return [136, 132, 87];
  if (height < 78) return [137, 126, 108];
  return [204, 218, 209];
};

const baseColor = (index, layer, data) => {
  if (layer === 'height') return heightColor(data.heights[index]);
  if (layer === 'biomes') return rgb(BIOME_COLORS[data.biomes[index]] ?? '#52645a');
  if (!data.land[index]) {
    const depth = Math.min(1, data.depths[index] / 34);
    return [
      Math.round(15 + depth * 7),
      Math.round(47 + depth * 31),
      Math.round(58 + depth * 41),
    ];
  }
  const height = data.heights[index];
  if (height >= 79) return [197, 213, 204];
  if (height >= 69) return [128, 127, 113];
  if (height >= 57) return [135, 128, 83];
  if (height <= 43 || data.biomes[index] === BIOME.DESERT || data.biomes[index] === BIOME.COAST)
    return [171, 153, 103];
  if (data.biomes[index] === BIOME.FOREST) return [64, 103, 76];
  if (data.biomes[index] === BIOME.TAIGA) return [83, 116, 105];
  if (data.biomes[index] === BIOME.TUNDRA) return [148, 166, 151];
  return [86, 126, 78];
};

const makeMapRaster = (canvas, world, layer, data) => {
  const raster = canvas.ownerDocument.createElement('canvas');
  raster.width = MAP_RASTER_WIDTH;
  raster.height = MAP_RASTER_HEIGHT;
  const context = getContext(raster);
  if (!context) return null;

  const image = context.createImageData(MAP_RASTER_WIDTH, MAP_RASTER_HEIGHT);
  for (let py = 0; py < MAP_RASTER_HEIGHT; py += 1) {
    for (let px = 0; px < MAP_RASTER_WIDTH; px += 1) {
      const index = py * MAP_RASTER_WIDTH + px;
      const west = data.heights[py * MAP_RASTER_WIDTH + Math.max(0, px - 1)];
      const east = data.heights[py * MAP_RASTER_WIDTH + Math.min(MAP_RASTER_WIDTH - 1, px + 1)];
      const north = data.heights[Math.max(0, py - 1) * MAP_RASTER_WIDTH + px];
      const south = data.heights[Math.min(MAP_RASTER_HEIGHT - 1, py + 1) * MAP_RASTER_WIDTH + px];
      const slope = (west - east) * 0.007 + (north - south) * 0.004;
      const shade = clamp(0.92 + slope, 0.7, 1.12);
      const color = baseColor(index, layer, data);
      const offset = index * 4;
      image.data[offset] = Math.round(color[0] * shade);
      image.data[offset + 1] = Math.round(color[1] * shade);
      image.data[offset + 2] = Math.round(color[2] * shade);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return raster;
};

const getMapRaster = (canvas, world, layer) => {
  let cache = worldMapCache.get(world);
  if (!cache) {
    cache = { data: getMapData(world), rasters: new Map() };
    worldMapCache.set(world, cache);
  }
  if (!cache.rasters.has(layer))
    cache.rasters.set(layer, makeMapRaster(canvas, world, layer, cache.data));
  return cache.rasters.get(layer);
};

const drawRivers = (context, world, width, height) => {
  if (!world.rivers?.length) return;
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = 'rgba(128, 195, 205, 0.78)';
  context.lineWidth = Math.max(1.2, width / 720);
  for (const river of world.rivers) {
    context.beginPath();
    let drawing = false;
    for (const point of river.points) {
      if (!point.land) {
        drawing = false;
        continue;
      }
      const x = point.x * width;
      const y = point.z * height;
      if (!drawing) context.moveTo(x, y);
      else context.lineTo(x, y);
      drawing = true;
    }
    context.stroke();
  }
  context.restore();
};

const drawContinentLabels = (context, world, width, height) => {
  if (!world.continentCenters?.length) return;
  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const fontSize = clamp(width / 68, 9, 15);
  context.font = `700 ${fontSize}px Manrope, Inter, system-ui, sans-serif`;
  context.lineWidth = Math.max(2.5, width / 320);
  context.lineJoin = 'round';
  for (const center of world.continentCenters) {
    const x = center.x * width;
    const y = center.z * height;
    context.strokeStyle = 'rgba(6, 12, 13, 0.78)';
    context.strokeText(center.name.toLocaleUpperCase('ru-RU'), x, y);
    context.fillStyle = 'rgba(229, 234, 218, 0.92)';
    context.fillText(center.name.toLocaleUpperCase('ru-RU'), x, y);
    context.fillStyle = 'rgba(231, 237, 221, 0.86)';
    context.beginPath();
    context.arc(x, y + fontSize * 0.92, Math.max(1.5, width / 480), 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
};

/** Рисует процедурный атлас мира: рельеф, климат, реки и названия материков. */
export const drawWorldMap = (canvas, world, camera = null, layer = 'biomes') => {
  const context = getContext(canvas);
  if (!context || !world) return;
  const width = canvas.width;
  const height = canvas.height;
  const mapLayer = ['biomes', 'height', 'relief'].includes(layer) ? layer : 'biomes';
  const raster = getMapRaster(canvas, world, mapLayer);

  context.clearRect(0, 0, width, height);
  context.fillStyle = '#102a34';
  context.fillRect(0, 0, width, height);
  if (raster) {
    context.imageSmoothingEnabled = true;
    context.drawImage(raster, 0, 0, width, height);
  }

  context.save();
  context.strokeStyle = 'rgba(218, 232, 221, 0.1)';
  context.lineWidth = 1;
  for (let index = 1; index < 5; index += 1) {
    const x = Math.round((width * index) / 5) + 0.5;
    const y = Math.round((height * index) / 5) + 0.5;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.strokeStyle = 'rgba(218, 232, 221, 0.34)';
  context.strokeRect(0.5, 0.5, width - 1, height - 1);
  context.restore();

  drawRivers(context, world, width, height);
  drawContinentLabels(context, world, width, height);

  if (camera && Number.isFinite(camera.x) && Number.isFinite(camera.z)) {
    const x = ((camera.x + 0.5) / world.widthCells) * width;
    const y = ((camera.z + 0.5) / world.depthCells) * height;
    context.save();
    context.shadowColor = 'rgba(238, 220, 156, 0.9)';
    context.shadowBlur = 18;
    context.fillStyle = '#f4d984';
    context.beginPath();
    context.arc(x, y, Math.max(5, width / 120), 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = '#111b1c';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, Math.max(8, width / 85), 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }
};

const polygon = (context, points, fill, stroke = null) => {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1)
    context.lineTo(points[index].x, points[index].y);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 0.65;
    context.stroke();
  }
};

const materialColor = (material, x, z, shade = 1) => {
  const color = rgb(MATERIAL_COLORS[material] ?? '#52645a');
  const variationHash = (Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263)) >>> 0;
  const variation = (0.92 + (variationHash % 13) / 100) * shade;
  return scaleRgb(color, variation);
};

const getSurfaceColor = (column, x, z) => {
  if (column.water) return materialColor(column.topMaterial, x, z);
  const color = rgb(BIOME_COLORS[column.biome] ?? MATERIAL_COLORS[column.topMaterial] ?? '#52645a');
  const variationHash = (Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263)) >>> 0;
  return scaleRgb(color, 0.92 + (variationHash % 13) / 100);
};

/** Рисует изометрическую местность вокруг камеры; масштаб задаёт camera.zoom. */
export const drawVoxelView = (canvas, world, camera) => {
  const context = getContext(canvas);
  if (!context || !world || !camera) return;
  const width = canvas.width;
  const height = canvas.height;
  const { zoom, viewSide } = getViewportMetrics(width, camera.zoom);
  const focusX = clamp(Number(camera.x) || 0, 0, world.widthCells - 1);
  const focusZ = clamp(Number(camera.z) || 0, 0, world.depthCells - 1);
  const originX = Math.floor(focusX - viewSide / 2);
  const originZ = Math.floor(focusZ - viewSide / 2);
  const tileWidth = Math.min(26, width / (viewSide + 5)) * zoom;
  const tileHeight = tileWidth * 0.52;
  const halfWidth = tileWidth / 2;
  const halfHeight = tileHeight / 2;
  const verticalScale = 1.15 * zoom;
  const centerX = width / 2;
  const centerY = height / 2 + 14;
  const columns = Array.from({ length: viewSide + 2 }, (_, localZ) =>
    Array.from({ length: viewSide + 2 }, (_, localX) => world.getColumn(
      originX + localX - 1,
      originZ + localZ - 1,
    )),
  );

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#172126');
  gradient.addColorStop(0.58, '#11181c');
  gradient.addColorStop(1, '#0b1013');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const drawSide = (points, material, x, z, shade) =>
    polygon(context, points, materialColor(material, x, z, shade), 'rgba(5, 10, 12, 0.34)');

  for (let diagonal = 0; diagonal <= (viewSide - 1) * 2; diagonal += 1) {
    const startX = Math.max(0, diagonal - viewSide + 1);
    const endX = Math.min(viewSide - 1, diagonal);
    for (let localX = startX; localX <= endX; localX += 1) {
      const localZ = diagonal - localX;
      const column = columns[localZ + 1][localX + 1];
      if (!column) continue;

      const screenX = centerX + (localX - localZ) * halfWidth;
      const groundY = centerY + (localX + localZ - (viewSide - 1)) * halfHeight;
      const topY = groundY - column.topY * verticalScale;
      const north = { x: screenX, y: topY - halfHeight };
      const east = { x: screenX + halfWidth, y: topY };
      const south = { x: screenX, y: topY + halfHeight };
      const west = { x: screenX - halfWidth, y: topY };

      const eastNeighbor = columns[localZ + 1][localX + 2];
      const southNeighbor = columns[localZ + 2][localX + 1];
      const eastDepth = Math.max(0, column.topY - (eastNeighbor?.topY ?? 0)) * verticalScale;
      const southDepth = Math.max(0, column.topY - (southNeighbor?.topY ?? 0)) * verticalScale;

      if (!column.water && eastDepth > 0.2) {
        drawSide([
          east,
          south,
          { x: south.x, y: south.y + eastDepth },
          { x: east.x, y: east.y + eastDepth },
        ], column.surfaceMaterial, originX + localX, originZ + localZ, 0.68);
      }
      if (!column.water && southDepth > 0.2) {
        drawSide([
          south,
          west,
          { x: west.x, y: west.y + southDepth },
          { x: south.x, y: south.y + southDepth },
        ], column.surfaceMaterial, originX + localX, originZ + localZ, 0.56);
      }

      polygon(
        context,
        [north, east, south, west],
        getSurfaceColor(column, originX + localX, originZ + localZ),
        'rgba(4, 9, 11, 0.23)',
      );
    }
  }

  const focusLocalX = focusX - originX;
  const focusLocalZ = focusZ - originZ;
  const focusColumn = world.getColumn(focusX, focusZ);
  if (focusColumn && focusLocalX >= 0 && focusLocalX < viewSide && focusLocalZ >= 0 && focusLocalZ < viewSide) {
    const screenX = centerX + (focusLocalX - focusLocalZ) * halfWidth;
    const groundY = centerY + (focusLocalX + focusLocalZ - (viewSide - 1)) * halfHeight;
    const screenY = groundY - focusColumn.topY * verticalScale - halfHeight * 0.1;
    context.save();
    context.shadowColor = 'rgba(244, 217, 132, 0.85)';
    context.shadowBlur = 14;
    polygon(context, [
      { x: screenX, y: screenY - 8 },
      { x: screenX + 6, y: screenY },
      { x: screenX, y: screenY + 8 },
      { x: screenX - 6, y: screenY },
    ], '#f4d984', '#182022');
    context.restore();
  }

  context.fillStyle = 'rgba(232, 238, 233, 0.76)';
  context.font = '600 13px Inter, system-ui, sans-serif';
  context.fillText(`КАМЕРА · ОБЗОР ${viewSide}×${viewSide}`, 18, 27);
  context.fillStyle = 'rgba(192, 216, 201, 0.58)';
  context.font = '11px Inter, system-ui, sans-serif';
  context.fillText(`чанк ${CHUNK_SIZE}×${CHUNK_SIZE} · высота ${world.worldHeight || WORLD_HEIGHT} · ${zoom.toFixed(1)}×`, 18, 45);
};
