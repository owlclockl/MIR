import { BLOCK, CHUNK_SIZE } from './world.js';

const MAP_RASTER_WIDTH = 240;
const MAP_RASTER_HEIGHT = 120;
const VIEW_SIDE = 24;
const worldMapCache = new WeakMap();

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

const scaleRgb = (color, factor) =>
  `rgb(${color.map((channel) => Math.max(0, Math.min(255, Math.round(channel * factor)))).join(',')})`;

const materialColor = (material, x, z, shade = 1) => {
  const colors = {
    [BLOCK.GRASS]: '#6d966a',
    [BLOCK.DIRT]: '#886747',
    [BLOCK.STONE]: '#6b7880',
    [BLOCK.SAND]: '#c8b982',
    [BLOCK.WATER]: '#39788a',
    [BLOCK.SNOW]: '#d8e5df',
  };
  const color = rgb(colors[material] ?? '#52645a');
  const variationHash = (Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263)) >>> 0;
  const variation = (0.92 + (variationHash % 13) / 100) * shade;
  return scaleRgb(color, variation);
};

const mapColor = (sample) => {
  if (!sample.land) {
    const depth = Math.min(1, sample.waterDepth / 34);
    return [
      Math.round(15 + depth * 6),
      Math.round(47 + depth * 28),
      Math.round(58 + depth * 39),
    ];
  }
  if (sample.surfaceMaterial === BLOCK.SNOW) return [201, 219, 211];
  if (sample.surfaceMaterial === BLOCK.SAND) return [178, 158, 105];
  const shade = 0.72 + Math.min(0.3, sample.depth * 0.27);
  return [
    Math.round(68 * shade),
    Math.round(119 * shade),
    Math.round(76 * shade),
  ];
};

const makeMapRaster = (canvas, world) => {
  const raster = canvas.ownerDocument.createElement('canvas');
  raster.width = MAP_RASTER_WIDTH;
  raster.height = MAP_RASTER_HEIGHT;
  const context = getContext(raster);
  if (!context) return null;

  const image = context.createImageData(MAP_RASTER_WIDTH, MAP_RASTER_HEIGHT);
  for (let py = 0; py < MAP_RASTER_HEIGHT; py += 1) {
    const v = (py + 0.5) / MAP_RASTER_HEIGHT;
    for (let px = 0; px < MAP_RASTER_WIDTH; px += 1) {
      const u = (px + 0.5) / MAP_RASTER_WIDTH;
      const sample = world.sampleAtNormalized(u, v);
      const color = mapColor(sample);
      const offset = (py * MAP_RASTER_WIDTH + px) * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return raster;
};

const getMapRaster = (canvas, world) => {
  const cached = worldMapCache.get(world);
  if (cached) return cached;
  const raster = makeMapRaster(canvas, world);
  if (raster) worldMapCache.set(world, raster);
  return raster;
};

/** Рисует карту суши и океанов; сам растр кешируется на время жизни мира. */
export const drawWorldMap = (canvas, world, position = null) => {
  const context = getContext(canvas);
  if (!context || !world) return;
  const width = canvas.width;
  const height = canvas.height;
  const raster = getMapRaster(canvas, world);

  context.clearRect(0, 0, width, height);
  context.fillStyle = '#102a34';
  context.fillRect(0, 0, width, height);
  if (raster) {
    context.imageSmoothingEnabled = true;
    context.drawImage(raster, 0, 0, width, height);
  }

  context.save();
  context.strokeStyle = 'rgba(218, 232, 221, 0.12)';
  context.lineWidth = 1;
  for (let index = 1; index < 4; index += 1) {
    const x = Math.round((width * index) / 4) + 0.5;
    const y = Math.round((height * index) / 4) + 0.5;
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

  if (position) {
    const x = ((position.x + 0.5) / world.widthCells) * width;
    const y = ((position.z + 0.5) / world.depthCells) * height;
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
  }
  context.restore();
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

const getSurfaceColor = (column, x, z) => materialColor(column.topMaterial, x, z);

/** Рисует загруженную вокруг игрока сетку из воксельных колонн в изометрии. */
export const drawVoxelView = (canvas, world, position) => {
  const context = getContext(canvas);
  if (!context || !world || !position) return;
  const width = canvas.width;
  const height = canvas.height;
  const originX = Math.floor(position.x - VIEW_SIDE / 2);
  const originZ = Math.floor(position.z - VIEW_SIDE / 2);
  const tileWidth = Math.min(26, width / (VIEW_SIDE + 5));
  const tileHeight = tileWidth * 0.52;
  const halfWidth = tileWidth / 2;
  const halfHeight = tileHeight / 2;
  const verticalScale = 1.15;
  const centerX = width / 2;
  const centerY = height / 2 + 14;
  const columns = Array.from({ length: VIEW_SIDE + 2 }, (_, localZ) =>
    Array.from({ length: VIEW_SIDE + 2 }, (_, localX) => world.getColumn(
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

  for (let diagonal = 0; diagonal <= (VIEW_SIDE - 1) * 2; diagonal += 1) {
    const startX = Math.max(0, diagonal - VIEW_SIDE + 1);
    const endX = Math.min(VIEW_SIDE - 1, diagonal);
    for (let localX = startX; localX <= endX; localX += 1) {
      const localZ = diagonal - localX;
      const column = columns[localZ + 1][localX + 1];
      if (!column) continue;

      const screenX = centerX + (localX - localZ) * halfWidth;
      const groundY = centerY + (localX + localZ - (VIEW_SIDE - 1)) * halfHeight;
      const topY = groundY - column.topY * verticalScale;
      const north = { x: screenX, y: topY - halfHeight };
      const east = { x: screenX + halfWidth, y: topY };
      const south = { x: screenX, y: topY + halfHeight };
      const west = { x: screenX - halfWidth, y: topY };
      const material = column.topMaterial;

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

      const fill = getSurfaceColor(column, originX + localX, originZ + localZ);
      polygon(context, [north, east, south, west], fill, 'rgba(4, 9, 11, 0.23)');
    }
  }

  const playerLocalX = position.x - originX;
  const playerLocalZ = position.z - originZ;
  const playerColumn = world.getColumn(position.x, position.z);
  if (playerColumn && playerLocalX >= 0 && playerLocalX < VIEW_SIDE && playerLocalZ >= 0 && playerLocalZ < VIEW_SIDE) {
    const screenX = centerX + (playerLocalX - playerLocalZ) * halfWidth;
    const groundY = centerY + (playerLocalX + playerLocalZ - (VIEW_SIDE - 1)) * halfHeight;
    const screenY = groundY - playerColumn.topY * verticalScale - halfHeight * 0.1;
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
  context.fillText(`ОБЗОР ${VIEW_SIDE}×${VIEW_SIDE} БЛОКОВ`, 18, 27);
  context.fillStyle = 'rgba(192, 216, 201, 0.58)';
  context.font = '11px Inter, system-ui, sans-serif';
  context.fillText(`чанк ${CHUNK_SIZE}×${CHUNK_SIZE} · высота ${world.worldHeight}`, 18, 45);
};
