// Генерирует иконки приложения (PWA) без единой зависимости:
// рисует фирменный знак (кольцо, точка, риски) попиксельно с 4×
// суперсэмплингом и кодирует PNG через встроенный node:zlib.
//
// Запуск: node icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

/* ---------- мини-PNG-кодировщик ---------------------------- */

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
const encodePng = (size, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // фильтр «none»
    raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

/* ---------- рисование знака -------------------------------- */

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

/** Рисует пиксель кольца/фигуры с альфой по покрытию (0..1). */
const paint = (rgba, size, x, y, cover, color) => {
  if (x < 0 || y < 0 || x >= size || y >= size || cover <= 0) return;
  const i = (y * size + x) * 4;
  const a = Math.min(1, cover);
  rgba[i] = Math.round(rgba[i] * (1 - a) + color[0] * a);
  rgba[i + 1] = Math.round(rgba[i + 1] * (1 - a) + color[1] * a);
  rgba[i + 2] = Math.round(rgba[i + 2] * (1 - a) + color[2] * a);
  rgba[i + 3] = Math.round(rgba[i + 3] * (1 - a) + 255 * a);
};

/**
 * Знак «мудрецов»: кольцо, точка в центре, четыре риски по осям.
 * scale = доля размера, которую занимает рисунок (для maskable меньше).
 */
const renderSigil = (size, { scale, bg, fg }) => {
  const SS = 4; // суперсэмплинг
  const hi = size * SS;
  const buf = new Uint8Array(size * size * 4);
  const center = hi / 2;
  const ringR = center * scale * 0.62;
  const stroke = center * scale * 0.055;
  const dotR = center * scale * 0.16;
  const tickLen = center * scale * 0.13;
  const tickGap = center * scale * 0.085;
  const [bgC, fgC] = [hex(bg), hex(fg)];

  // фон
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = bgC[0];
    buf[i * 4 + 1] = bgC[1];
    buf[i * 4 + 2] = bgC[2];
    buf[i * 4 + 3] = 255;
  }

  // покрытие кольцом/точкой квадрата [x,x+1)×[y,y+1) с шагом SS на сторону
  const coverAt = (x, y, fn) => {
    let hits = 0;
    for (let sy = 0; sy < SS; sy++)
      for (let sx = 0; sx < SS; sx++)
        if (fn(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) hits++;
    return hits / (SS * SS);
  };

  const inRing = (px, py) => {
    const d = Math.hypot(px - center, py - center);
    return Math.abs(d - ringR) <= stroke / 2;
  };
  const inDot = (px, py) => Math.hypot(px - center, py - center) <= dotR;
  const tickOffset = ringR + tickGap;
  const inTicks = (px, py) => {
    const dx = Math.abs(px - center);
    const dy = Math.abs(py - center);
    const along = tickOffset <= dx && dx <= tickOffset + tickLen && dy <= stroke / 2;
    const across = tickOffset <= dy && dy <= tickOffset + tickLen && dx <= stroke / 2;
    return along || across;
  };
  const figure = (px, py) => inRing(px, py) || inDot(px, py) || inTicks(px, py);

  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // масштабируем координаты пикселя в «высокое» разрешение знака
      const cover = coverAt((x + 0.5) * SS - SS / 2 + SS / 2, (y + 0.5) * SS - SS / 2 + SS / 2, (px, py) =>
        figure(px, py),
      );
      paint(buf, size, x, y, cover, fgC);
    }
  return buf;
};

/* ---------- генерация набора -------------------------------- */

mkdirSync(new URL('./public/icons/', import.meta.url), { recursive: true });

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  // maskable: рисунок в безопасной зоне (80%), фон до краёв
  ['icon-maskable-512.png', 512, { scale: 0.8 }],
  ['apple-touch-icon.png', 180, {}],
];

for (const [name, size, opts] of targets) {
  const rgba = renderSigil(size, {
    scale: opts.scale ?? 1,
    bg: '#0b0b0d',
    fg: '#ededf0',
  });
  writeFileSync(new URL(`./public/icons/${name}`, import.meta.url), encodePng(size, rgba));
  console.log(`icons/${name} — ${size}×${size}`);
}
console.log('Готово. Иконки лежат в public/icons/.');
