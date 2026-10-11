/* Математика блочного мира: детерминированный шум, хеши и матрицы.

   Всё здесь — чистые функции без DOM: их гоняет scripts/test-voxel.mjs, и они
   же работают в precache-сборке и по file://.

   Детерминизм — главное требование: мир обязан быть одинаковым у мастера и у
   игрока при одном seed. Поэтому никакого Math.random: только хеш от
   координат и seed. */

/** 32-битный ротационный хеш (вариант splitmix/MurmurMix): дешёвый и стабильный. */
export const hash32 = (a, b = 0, c = 0, d = 0) => {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b9);
  h = Math.imul(h ^ (c | 0) ^ 0x85ebca6b, 0xcc9e2d51);
  h = (h << 13) | (h >>> 19);
  h = Math.imul(h ^ (d | 0) ^ 0x1b873593, 0x1b873593);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return h >>> 0;
};

/** Случайное число 0…1 из целых координат: одна и та же пара даёт одно и то же число. */
export const rand01 = (a, b, c, d) => hash32(a, b, c, d) / 4294967296;

/** Строка seed → 32-битное число. Свой хеш, а не hash(): он стабильнее между движками. */
export const seedToInt = (seed) => {
  const text = String(seed || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

export const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

/** Непрерывное сглаживание 0…1 (smootherstep). */
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

const lerp = (a, b, t) => a + (b - a) * t;

/** Значения на решётке: узел решётки (ix, iy) зависит только от целых координат. */
const lattice2 = (seed, ix, iy, scale) => {
  const x = Math.floor(ix / scale);
  const y = Math.floor(iy / scale);
  return rand01(seed, x, y, ((ix & 1023) << 10) | (iy & 1023));
};

/** Сглаженный шум 2D в диапазоне -1…1. */
export const noise2 = (seed, x, y, scale = 1) => {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const t = fade(gx - x0);
  const u = fade(gy - y0);
  const a = lerp(lattice2(seed, x0, y0, 1), lattice2(seed, x0 + 1, y0, 1), t);
  const b = lerp(lattice2(seed, x0, y0 + 1, 1), lattice2(seed, x0 + 1, y0 + 1, 1), t);
  return lerp(a, b, u) * 2 - 1;
};

/** Сглаженный шум 3D: нужен пещерам и рудам, где важно «не вылезти на поверхность». */
export const noise3 = (seed, x, y, z, scale = 1) => {
  const gx = x / scale;
  const gy = y / scale;
  const gz = z / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const z0 = Math.floor(gz);
  const tx = fade(gx - x0);
  const ty = fade(gy - y0);
  const node = (dx, dy, dz) => rand01(seed, x0 + dx, y0 + dy, ((z0 + dz) << 12) ^ ((x0 + dx) & 4095));
  const l00 = lerp(node(0, 0, 0), node(1, 0, 0), tx);
  const l10 = lerp(node(0, 1, 0), node(1, 1, 0), tx);
  const l01 = lerp(node(0, 0, 1), node(1, 0, 1), tx);
  const l11 = lerp(node(0, 1, 1), node(1, 1, 1), tx);
  return lerp(lerp(l00, l10, ty), lerp(l01, l11, ty), fade(gz - z0)) * 2 - 1;
};

/** Фрактальный шум: октавы с половинным шагом и весом. */
export const fbm2 = (seed, x, y, scale, octaves = 3) => {
  let sum = 0;
  let weight = 1;
  let total = 0;
  let s = scale;
  for (let o = 0; o < octaves; o += 1) {
    sum += noise2(seed + o * 7919, x, y, s) * weight;
    total += weight;
    weight *= 0.5;
    s = Math.max(1, s / 2);
  }
  return sum / total;
};

/** Остаток от деления для отрицательных: у бесконечного мира координаты бывают отрицательные. */
export const floorMod = (value, period) => ((value % period) + period) % period;

/* ---------- матрицы (column-major, как в WebGL) ---------- */

export const mat4Identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export const mat4Perspective = (out, fovY, aspect, near, far) => {
  const f = 1 / Math.tan(fovY / 2);
  out.fill(0);
  out[0] = f / (aspect || 1);
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
};

/**
 * View из позиции и углов: yaw вокруг Y (0 = взгляд вдоль -Z), pitch вверх/вниз.
 * right = normalize(cross(forward, worldUp)), up = cross(right, forward).
 */
export const mat4View = (out, eye, yaw, pitch) => {
  const fx = -Math.sin(yaw) * Math.cos(pitch);
  const fy = Math.sin(pitch);
  const fz = -Math.cos(yaw) * Math.cos(pitch);
  /* right = normalize(cross(forward, worldUp)) → (-fz, 0, fx) */
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz);
  if (rl < 1e-6) {
    rx = 1;
    rz = 0;
  } else {
    rx /= rl;
    rz /= rl;
  }
  /* up = cross(right, forward) */
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  out[0] = rx;
  out[1] = ux;
  out[2] = -fx;
  out[3] = 0;
  out[4] = 0;
  out[5] = uy;
  out[6] = -fy;
  out[7] = 0;
  out[8] = rz;
  out[9] = uz;
  out[10] = -fz;
  out[11] = 0;
  out[12] = -(rx * eye[0] + rz * eye[2]);
  out[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
  out[14] = fx * eye[0] + fy * eye[1] + fz * eye[2];
  out[15] = 1;
  return out;
};

export const mat4Multiply = (out, a, b) => {
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
};
