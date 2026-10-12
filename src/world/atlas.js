/* Атлас блоков: 46 тайлов, нарисованных пикселями.

Ни одного файла-текстуры: тайлы рисуются процедурно в Uint8Array при первом

открытии карты, поэтому репозиторий и однофайловая сборка не тяжелеют, а PWA

не просит новых ресурсов в precache. Индекс в TILES = позиция в атласе, и

порядок пополнения — только в конец (иначе старые сохранения начнут

показывать чужие текстуры).

Отсюда же берутся цвета для 2D-карты блоками (src/world/layers.js): срез

красится средним цветом тайла той грани, которую видно, — поэтому картинка

слоя и атлас не разъезжаются, даже когда палитру правят. */

import { ATLAS_COLUMNS, ATLAS_SIZE, TILE_PX, TILES } from './blocks.js';

import { clamp, rand01 } from './math.js';

/* ---------- атлас ---------- */

const hex = (value) => [(value >> 16) & 255, (value >> 8) & 255, value & 255];

/**

* kind — способ рисования, tones — палитра от тёмного к светлому.

* Индекс в TILES = позиция в атласе, поэтому порядок ключей не важен.

*/

const TILE_SPEC = {
  stone: { kind: 'speckle', tones: [0x6a6a70, 0x7c7c82, 0x8a8a90, 0x96969c] },

  cobble: { kind: 'cobble', tones: [0x5c5c62, 0x74747a, 0x8b8b91, 0x9d9da3] },

  dirt: { kind: 'speckle', tones: [0x5b3f27, 0x6b4a2d, 0x7c5836, 0x8a6440] },

  grass: { kind: 'grass_top', tones: [0x3d6b28, 0x4f8033, 0x63953f, 0x78a94e] },

  grass_side: { kind: 'grass_side', tones: [0x3d6b28, 0x557f36, 0x6b4a2d, 0x7c5836] },

  sand: { kind: 'grain', tones: [0xd9c58a, 0xe3d09b, 0xecdcaa, 0xf3e7bd] },

  sandstone: { kind: 'bands', tones: [0xd3bd85, 0xdfca96, 0xc9b078, 0xe8d5a8] },

  gravel: { kind: 'cobble', tones: [0x6d6a66, 0x82807c, 0x95938f, 0x6a6864] },

  clay: { kind: 'speckle', tones: [0x9aa2ac, 0xa7afb9, 0xb3bbc5, 0xbcc4ce] },

  snow: { kind: 'grain', tones: [0xe6eef5, 0xf0f6fa, 0xf7fbfd, 0xffffff] },

  ice: { kind: 'ice', tones: [0x7fb6d8, 0x9ccbe6, 0xbfe2f2, 0xe8f6ff], alpha: 226 },

  packed_ice: { kind: 'speckle', tones: [0x6e9fc4, 0x86b4d6, 0x9dc8e4, 0xb4daf0] },

  podzol: { kind: 'speckle', tones: [0x4a3a1f, 0x5c4626, 0x6d5531, 0x53412a] },

  moss: { kind: 'grass_top', tones: [0x2f4a20, 0x3d5f28, 0x4c7233, 0x5c8540] },

  peat: { kind: 'speckle', tones: [0x37281c, 0x453024, 0x4f3b2c, 0x5a4534] },

  salt: { kind: 'crust', tones: [0xd7dbe0, 0xe6e9ec, 0xf2f4f6, 0xc9cfd6] },

  basalt: { kind: 'columns', tones: [0x3a3a40, 0x47474d, 0x53535a, 0x2f2f35] },

  obsidian: { kind: 'speckle', tones: [0x16121f, 0x1e1930, 0x272041, 0x3a2f5e] },

  magma: { kind: 'lava', tones: [0x2a1508, 0x6e2a08, 0xd85a10, 0xffb43c] },

  bedrock: { kind: 'cobble', tones: [0x2f2f33, 0x3c3c42, 0x4a4a52, 0x232327] },

  water: { kind: 'water', tones: [0x1d4e7e, 0x2a6ba6, 0x3f8ac4, 0x74b9e6], alpha: 190 },

  lava: { kind: 'lava', tones: [0x5e1a03, 0xa83a06, 0xe87214, 0xffc955] },

  oak_log: { kind: 'log_side', tones: [0x3f2d1c, 0x5a4326, 0x6d5233, 0x7d6040] },

  birch_log: { kind: 'birch_log', tones: [0xd8d5cc, 0xc2bfb6, 0x8b8880, 0x565349] },

  spruce_log: { kind: 'log_side', tones: [0x3b2a1a, 0x4a3620, 0x5a4429, 0x6b5236] },

  jungle_log: { kind: 'log_side', tones: [0x43301c, 0x533c22, 0x634a2c, 0x705535] },

  acacia_log: { kind: 'log_side', tones: [0x563a26, 0x66452c, 0x775336, 0x846041] },

  mangrove_log: { kind: 'log_side', tones: [0x4a2f26, 0x5b3a2d, 0x6c4738, 0x7b5444] },

  oak_leaves: { kind: 'leaves', tones: [0x2c521c, 0x396824, 0x477c2e, 0x558f3a] },

  birch_leaves: { kind: 'leaves', tones: [0x3a6329, 0x497636, 0x5a8a46, 0x6c9c58] },

  spruce_leaves: { kind: 'leaves', tones: [0x1d3f2a, 0x275137, 0x316343, 0x3c7551] },

  jungle_leaves: { kind: 'leaves', tones: [0x24571d, 0x306b27, 0x3d8031, 0x4c953d] },

  acacia_leaves: { kind: 'leaves', tones: [0x4a5f22, 0x5a7129, 0x6b8433, 0x7c9740] },

  swamp_leaves: { kind: 'leaves', tones: [0x3a5320, 0x4a6528, 0x5a7832, 0x6a8b3f] },

  tall_grass: { kind: 'blades', tones: [0x4c7a2e, 0x5d8c38, 0x6f9e46], alpha: 255 },

  fern: { kind: 'frond', tones: [0x2f5c22, 0x3d6f2b, 0x4d8237], alpha: 255 },

  cactus: { kind: 'cactus', tones: [0x2c6b2e, 0x3a8039, 0x4a9448, 0x5aa657] },

  dead_bush: { kind: 'twigs', tones: [0x6a4a26, 0x7d5a2f, 0x8f6a3b], alpha: 255 },

  lily: { kind: 'lily', tones: [0x2f6b28, 0x3f7f33, 0x52933f], alpha: 255 },

  kelp: { kind: 'kelp', tones: [0x2a5c3a, 0x367046, 0x448554], alpha: 232 },

  reeds: { kind: 'blades', tones: [0x53682d, 0x647a37, 0x768d46], alpha: 255 },

  sapling: { kind: 'sapling', tones: [0x4a3520, 0x3d6b28, 0x4f8033], alpha: 255 },

  coal_ore: { kind: 'ore', tones: [0x1d1d21, 0x2b2b30, 0x3a3a40], base: 'stone' },

  iron_ore: { kind: 'ore', tones: [0xb08a6a, 0xc79f7d, 0xdab595], base: 'stone' },

  gold_ore: { kind: 'ore', tones: [0xc9a227, 0xe6c14a, 0xf7dd7a], base: 'stone' },

  gem_ore: { kind: 'ore', tones: [0x3fb6a8, 0x5fd0c4, 0x8fe6dd], base: 'stone' },
};

/** Индекс пикселя атласа для (x, y) внутри тайла. */

/**

* Пиксельный атлас: 8 × 8 тайлов по 32 px. Пишем прямо в RGBA-буфер — это

* быстрее и предсказуемее, чем десятки тысяч fillRect, и не зависит от

* сглаживания канваса.

*/

export const buildAtlas = (seed = 0x5eed) => {
  const size = ATLAS_SIZE;

  const data = new Uint8ClampedArray(size * size * 4);

  const put = (tile, x, y, color, alpha) => {
    const row = ((tile / ATLAS_COLUMNS) | 0) * TILE_PX + y;

    const col = (tile % ATLAS_COLUMNS) * TILE_PX + x;

    if (row < 0 || col < 0 || row >= size || col >= size) return; // кисть может выйти за тайл

    const at = (row * size + col) << 2;

    const [r, g, b] = typeof color === 'number' ? hex(color) : color;

    data[at] = r;

    data[at + 1] = g;

    data[at + 2] = b;

    data[at + 3] = alpha === undefined ? 255 : alpha;
  };

  const fill = (tile, color, alpha) => {
    for (let y = 0; y < TILE_PX; y += 1) for (let x = 0; x < TILE_PX; x += 1) put(tile, x, y, color, alpha);
  };

  TILES.forEach((name, tile) => {
    const spec = TILE_SPEC[name] ?? { kind: 'speckle', tones: [0x888888, 0x999999, 0xaaaaaa, 0xbbbbbb] };

    const tones = spec.tones.map(hex);

    const tone = (i) => tones[((i % tones.length) + tones.length) % tones.length];

    const alpha = spec.alpha ?? 255;

    /* Шум колонки тайла: детерминированно по имени, чтобы атлас не менялся от

сборки к сборке. */

    const n = (x, y, scale, salt) => valueNoise(seed + tile * 131, x, y, scale, salt);

    switch (spec.kind) {
      case 'grain':

      case 'speckle': {
        for (let y = 0; y < TILE_PX; y += 1) {
          for (let x = 0; x < TILE_PX; x += 1) {
            const coarse = n(x, y, spec.kind === 'grain' ? 12 : 5, 1);

            const fine = n(x, y, 24, 2);

            const i = Math.floor(coarse * 2.4 + fine * 1.6);

            put(tile, x, y, tone(i), alpha);
          }
        }

        break;
      }

      case 'cobble': {
        /* Каменные «глыбы»: сетка ячеек с рваными швами. */

        const cells = 4;

        const step = TILE_PX / cells;

        for (let cy = 0; cy < cells; cy += 1) {
          for (let cx = 0; cx < cells; cx += 1) {
            const shade = Math.floor(n(cx * 7 + 3, cy * 11 + 5, 3, 3) * 2.6);

            const jx = Math.round(n(cx, cy, 1, 4) * 2) - 1;

            const jy = Math.round(n(cx, cy, 1, 5) * 2) - 1;

            for (let y = 0; y < step - 1; y += 1) {
              for (let x = 0; x < step - 1; x += 1) {
                const edge = x === 0 || y === 0 || x === step - 2 || y === step - 2;

                put(tile, cx * step + x + jx, cy * step + y + jy, edge ? tone(0) : tone(1 + shade), alpha);
              }
            }
          }
        }

        break;
      }

      case 'bands': {
        for (let y = 0; y < TILE_PX; y += 1) {
          const band = Math.floor(y / 5) % 2;

          for (let x = 0; x < TILE_PX; x += 1) {
            put(tile, x, y, tone(band + (n(x, y, 9, 6) > 0.6 ? 2 : 0)), alpha);
          }
        }

        break;
      }

      case 'columns': {
        for (let y = 0; y < TILE_PX; y += 1) {
          for (let x = 0; x < TILE_PX; x += 1) {
            const col = Math.floor(x / 6);

            put(tile, x, y, tone((col % 3) + (n(x, y, 7, 7) > 0.7 ? 1 : 0)), alpha);
          }
        }

        break;
      }

      case 'crust': {
        for (let y = 0; y < TILE_PX; y += 1) {
          for (let x = 0; x < TILE_PX; x += 1) {
            const v = n(x, y, 6, 8);

            put(tile, x, y, tone(v > 0.72 ? 3 : v > 0.4 ? 1 : 0), alpha);
          }
        }

        break;
      }

      case 'grass_top': {
        for (let y = 0; y < TILE_PX; y += 1) {
          for (let x = 0; x < TILE_PX; x += 1) {
            const v = n(x, y, 7, 9) * 2.2 + n(x, y, 19, 10);

            put(tile, x, y, tone(Math.floor(v)), alpha);
          }
        }

        break;
      }

      case 'grass_side': {
        const fringe = 6;

        for (let x = 0; x < TILE_PX; x += 1) {
          const edge = fringe + Math.round(n(x, 0, 5, 11) * 4);

          for (let y = 0; y < TILE_PX; y += 1) {
            const grassy = y < edge;

            const v = n(x, y, 8, 12) * 1.8;

            put(tile, x, y, tone(grassy ? Math.floor(v) : 2 + Math.floor(v / 2)), alpha);
          }
        }

        break;
      }

      case 'leaves': {
        for (let y = 0; y < TILE_PX; y += 1) {
          for (let x = 0; x < TILE_PX; x += 1) {
            const clump = n(x, y, 4, 13);

            const hole = n(x, y, 16, 14);

            if (hole > 0.86 && clump < 0.5) {
              put(tile, x, y, tone(0), 0);

              continue;
            }

            put(tile, x, y, tone(Math.floor(clump * 3 + (hole > 0.6 ? 1 : 0))), 255);
          }
        }

        break;
      }

      case 'ice': {
        for (let y = 0; y < TILE_PX; y += 1) {
          for (let x = 0; x < TILE_PX; x += 1) {
            const crack = Math.abs(((x + y) % 11) - 5) < 1 && n(x, y, 4, 15) > 0.35;

            put(tile, x, y, tone(crack ? 0 : Math.floor(n(x, y, 6, 16) * 3)), alpha);
          }
        }

        break;
      }

      case 'water': {
        for (let y = 0; y < TILE_PX; y += 1) {
          for (let x = 0; x < TILE_PX; x += 1) {
            const wave = Math.sin((x + y * 0.4) * 0.7) * 0.5 + 0.5;

            const v = wave * 2.2 + n(x, y, 10, 17);

            put(tile, x, y, tone(Math.floor(v)), Math.floor(alpha + (v > 3 ? 30 : 0)));
          }
        }

        break;
      }

      case 'lava': {
        for (let y = 0; y < TILE_PX; y += 1) {
          for (let x = 0; x < TILE_PX; x += 1) {
            const blob = n(x, y, 4, 18);

            const hot = n(x, y, 9, 19);

            put(tile, x, y, tone(blob > 0.66 ? (hot > 0.55 ? 3 : 2) : blob > 0.4 ? 1 : 0), alpha);
          }
        }

        break;
      }

      case 'ore': {
        const stone = TILE_SPEC[spec.base].tones.map(hex);

        for (let y = 0; y < TILE_PX; y += 1) {
          for (let x = 0; x < TILE_PX; x += 1) {
            const v = n(x, y, 5, 20);

            put(tile, x, y, stone[Math.floor(v * 3)], 255);
          }
        }

        for (let b = 0; b < 5; b += 1) {
          const bx = 3 + Math.floor(rand01(seed + tile, b, 3, 21) * (TILE_PX - 8));

          const by = 3 + Math.floor(rand01(seed + tile, b, 7, 22) * (TILE_PX - 8));

          const r = 2 + Math.floor(rand01(seed + tile, b, 11, 23) * 2.2);

          for (let y = -r; y <= r; y += 1) {
            for (let x = -r; x <= r; x += 1) {
              if (Math.abs(x) + Math.abs(y) > r) continue;

              put(tile, bx + x, by + y, tone(x === -r || y === -r ? 0 : x === r || y === r ? 2 : 1), 255);
            }
          }
        }

        break;
      }

      case 'log_side': {
        for (let y = 0; y < TILE_PX; y += 1) {
          for (let x = 0; x < TILE_PX; x += 1) {
            const stripe = Math.floor(x / 4) % 2;

            const grain = n(x, y, 3, 24);

            put(tile, x, y, tone(grain > 0.8 ? 3 : stripe ? 1 : 2), alpha);
          }
        }

        break;
      }

      case 'birch_log': {
        for (let y = 0; y < TILE_PX; y += 1) {
          for (let x = 0; x < TILE_PX; x += 1) {
            put(tile, x, y, tone(n(x, y, 8, 25) > 0.5 ? 0 : 1), alpha);
          }
        }

        for (let k = 0; k < 5; k += 1) {
          const by = 2 + Math.floor(rand01(seed + tile, k, 26, 1) * (TILE_PX - 4));

          const bx = Math.floor(rand01(seed + tile, k, 27, 2) * (TILE_PX - 8));

          const len = 3 + Math.floor(rand01(seed + tile, k, 28, 3) * 6);

          for (let x = 0; x < len; x += 1) for (let y = 0; y < 2; y += 1) put(tile, bx + x, by + y, tone(2), 255);
        }

        break;
      }

      case 'cactus': {
        for (let y = 0; y < TILE_PX; y += 1) {
          for (let x = 0; x < TILE_PX; x += 1) {
            const edge = x < 2 || x > TILE_PX - 3;

            const spine = (y % 7 === 0 && (x % 5 === 2 || x % 5 === 4)) || edge;

            put(tile, x, y, tone(spine ? 3 : edge ? 0 : Math.floor(n(x, y, 6, 30) * 2) + 1), alpha);
          }
        }

        break;
      }

      case 'blades': {
        fill(tile, 0, 0);

        for (let b = 0; b < 9; b += 1) {
          const base = 2 + Math.floor(rand01(seed + tile, b, 31, 1) * (TILE_PX - 4));

          const height = 10 + Math.floor(rand01(seed + tile, b, 32, 2) * (TILE_PX - 12));

          const lean = Math.round((rand01(seed + tile, b, 33, 3) - 0.5) * 8);

          for (let i = 0; i < height; i += 1) {
            const x = base + Math.round((lean * i) / height);

            const y = TILE_PX - 1 - i;

            put(tile, x, y, tone(i > height - 6 ? 2 : i % 3 === 0 ? 1 : 0), 255);

            if (i % 4 === 0) put(tile, x + 1, y, tone(1), 255);
          }
        }

        break;
      }

      case 'frond':

      case 'kelp': {
        /* Старт прозрачный: растение рисуется поверх «воздуха», а не поверх

чёрного квадрата. */

        fill(tile, 0, 0);

        const stem = TILE_PX >> 1;

        for (let y = 3; y < TILE_PX - 1; y += 1) {
          const sway = Math.round(Math.sin(y * 0.35) * 2);

          put(tile, stem + sway, y, tone(0), alpha);

          const arm = Math.max(1, Math.round((TILE_PX - y) / 5));

          for (let a = 1; a <= arm; a += 1) {
            put(tile, stem + sway - a, y - (a % 2), tone(1), alpha);

            put(tile, stem + sway + a, y - (a % 2), tone(2), alpha);
          }
        }

        break;
      }

      case 'twigs': {
        fill(tile, 0, 0);

        for (let b = 0; b < 7; b += 1) {
          const angle = -Math.PI / 2 + (b / 6 - 0.5) * 1.7;

          const len = 8 + rand01(seed + tile, b, 34, 4) * 14;

          for (let t = 0; t < len; t += 1) {
            const x = Math.round(TILE_PX / 2 + Math.cos(angle) * t + Math.sin(t * 0.6) * 1.5);

            const y = Math.round(TILE_PX - 2 + Math.sin(angle) * t);

            put(tile, x, y, tone(t > len - 4 ? 1 : 0), 255);
          }
        }

        break;
      }

      case 'lily': {
        fill(tile, 0, 0);

        const c = TILE_PX / 2;

        for (let y = 0; y < TILE_PX; y += 1) {
          for (let x = 0; x < TILE_PX; x += 1) {
            const d = Math.hypot(x - c, y - c);

            const notch = Math.abs(Math.atan2(y - c, x - c) - -0.6) < 0.35 && d < c;

            if (d < c - 1.5 && !notch) put(tile, x, y, tone(d > c - 4 ? 0 : Math.floor(n(x, y, 6, 35) * 2) + 1), 255);
          }
        }

        break;
      }

      case 'sapling': {
        fill(tile, 0, 0);

        const stem = TILE_PX >> 1;

        for (let y = TILE_PX - 1; y > TILE_PX / 2; y -= 1) put(tile, stem, y, tone(0), 255);

        for (let y = 4; y < TILE_PX / 2 + 2; y += 1) {
          const r = Math.max(1, Math.round((TILE_PX / 2 - y) / 2.2));

          for (let x = -r; x <= r; x += 1) put(tile, stem + x, y, tone(Math.abs(x) === r ? 1 : 2), 255);
        }

        break;
      }

      default:
        fill(tile, tone(1), alpha);
    }
  });

  return { size, data };
};

/** Дешёвый value-noise по целочисленной решётке — только для атласа. */

const valueNoise = (seed, x, y, scale, salt) => {
  const gx = x / scale;

  const gy = y / scale;

  const x0 = Math.floor(gx);

  const y0 = Math.floor(gy);

  const fx = gx - x0;

  const fy = gy - y0;

  const at = (ix, iy) => rand01(seed, ix, iy, (salt || 0) + 101);

  const sx = fx * fx * (3 - 2 * fx);

  const sy = fy * fy * (3 - 2 * fy);

  const a = at(x0, y0);

  const b = at(x0 + 1, y0);

  const c = at(x0, y0 + 1);

  const d = at(x0 + 1, y0 + 1);

  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
};

/**

* Средний цвет каждого тайла: 2D-карте не нужно знать про UV и пиксели, ей

* нужна краска блока. Прозрачные пиксели (у растений и воды их много) в среднее

* не входят — иначе трава на срезе выглядела бы чёрной.

*/

export const buildTileColors = (atlas) => {
  const colors = [];

  for (let slot = 0; slot < TILES.length; slot += 1) {
    const col = (slot % ATLAS_COLUMNS) * TILE_PX;

    const row = Math.floor(slot / ATLAS_COLUMNS) * TILE_PX;

    let r = 0;

    let g = 0;

    let b = 0;

    let seen = 0;

    for (let y = row; y < row + TILE_PX; y += 1) {
      for (let x = col; x < col + TILE_PX; x += 1) {
        const i = (y * ATLAS_SIZE + x) * 4;

        if (atlas.data[i + 3] < 40) continue;

        r += atlas.data[i];

        g += atlas.data[i + 1];

        b += atlas.data[i + 2];

        seen += 1;
      }
    }

    /* Целые каналы: палитра уходит в Uint8ClampedArray, и дробные средние

округлились бы на нём, а не здесь — тест сверял бы не то, что видно. */

    colors.push(seen ? [Math.round(r / seen), Math.round(g / seen), Math.round(b / seen)] : [255, 0, 255]);
  }

  return colors;
};
