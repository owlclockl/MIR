/* RegionGrid / MapArtGrid arithmetic adapted from XaeroPlus, MIT,
   Copyright (c) 2022 rfresh2. Sages coordinates are Azgaar source-map units,
   NOT Minecraft blocks. Browser host clips to visible bounds; map-art origin
   is fixed at -64 so zoomed grids remain stable while panning. */
export function gridGeometry(mode, source, visible = [0, 0, 1, 1], zoom = 0) {
  if (!['coordinates', 'regions', 'mapart'].includes(mode)) return { lines: [], labels: [] };
  const step = mode === 'regions' ? 512 : mode === 'mapart' ? 128 * 2 ** Math.max(0, Math.min(4, Math.trunc(zoom))) : null;
  const sx = step || source.width / 12; const sy = step || source.height / 6;
  const offset = mode === 'mapart' ? -64 : 0;
  const minX = Math.max(0, visible[0]) * source.width; const minY = Math.max(0, visible[1]) * source.height;
  const maxX = Math.min(1, visible[2]) * source.width; const maxY = Math.min(1, visible[3]) * source.height;
  const lines = []; const labels = [];
  if (maxX < minX || maxY < minY) return { lines, labels };
  for (let x = offset + Math.ceil((minX - offset) / sx) * sx; x <= maxX && lines.length < 256; x += sx) lines.push([x / source.width, minY / source.height, x / source.width, maxY / source.height]);
  for (let y = offset + Math.ceil((minY - offset) / sy) * sy; y <= maxY && lines.length < 512; y += sy) lines.push([minX / source.width, y / source.height, maxX / source.width, y / source.height]);
  if (mode === 'regions') {
    for (let x = Math.floor(minX / 512); x <= Math.floor(maxX / 512) && labels.length < 256; x += 1) {
      for (let y = Math.floor(minY / 512); y <= Math.floor(maxY / 512) && labels.length < 256; y += 1) labels.push({ u: (x * 512 + 264) / source.width, v: (y * 512 + 264) / source.height, text: `r.${x}.${y}` });
    }
  }
  return { lines, labels };
}
export function paintGrid(ctx, settings, source, r, camera) {
  const visible = [-r.x / r.width, -r.y / r.height, (camera.width - r.x) / r.width, (camera.height - r.y) / r.height];
  const { lines, labels } = gridGeometry(settings.gridMode, source, visible, settings.gridZoom);
  ctx.strokeStyle = 'rgba(245,230,210,0.4)'; ctx.lineWidth = 1; ctx.beginPath();
  for (const [u1, v1, u2, v2] of lines) { ctx.moveTo(r.x + u1 * r.width, r.y + v1 * r.height); ctx.lineTo(r.x + u2 * r.width, r.y + v2 * r.height); }
  ctx.stroke();
  if (settings.labels && r.width / source.width >= 0.1) {
    ctx.font = '12px Inter, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#182321'; ctx.lineWidth = 3;
    for (const p of labels) { const x = r.x + p.u * r.width; const y = r.y + p.v * r.height; ctx.strokeText(p.text, x, y); ctx.fillText(p.text, x, y); }
  }
}
