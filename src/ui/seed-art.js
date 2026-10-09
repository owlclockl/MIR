/* ===========================================================
   Мини-карта слота: узор по seed.

   Слот хранит только seed и размер — картинки карты у игры нет. Но
   картотека из одинаковых заглушек выглядит мёртвой, поэтому каждый
   слот получает свой узор: берём hash seed и рисуем из него берег
   одного «моря», пару островов и сетку параллелей. Один seed — один
   узор, на всех устройствах и при каждом открытии.

   Это украшение, а не предпросмотр: настоящую карту делает только
   Azgaar (см. README). Палитра — своя, лесная ночь с янтарём.
   =========================================================== */

import { icon } from './icons.js';

/** 32-битный hash строки (cyrb53-подобный): одинаковый на всех платформах. */
const hashSeed = (text) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

/** Детерминированный ГПСЧ mulberry32: узор зависит только от seed. */
const makeRandom = (seedNumber) => {
  let a = seedNumber >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const round = (value) => Math.round(value * 10) / 10;

/** Берег «моря»: замкнутая линия из гармоник вокруг центра. */
const coastPath = (random, cx, cy, base, wobble) => {
  const harmonics = [1, 2, 3, 5].map((k) => ({
    k,
    amp: wobble * (0.5 + random() * 0.9) / k,
    phase: random() * Math.PI * 2,
  }));
  const points = [];
  const steps = 26;
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    let r = base;
    for (const { k, amp, phase } of harmonics) r += amp * Math.sin(k * angle + phase);
    points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return `M${points.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`;
};

/**
 * Узор мини-карты по seed. Возвращает разметку SVG (без внешних ресурсов).
 * @param {string} seed seed слота
 * @param {{ id?: string }} [options] id — для уникальных градиентов на странице
 */
export const seedArtSvg = (seed, { id } = {}) => {
  const text = String(seed || '');
  const random = makeRandom(hashSeed(text || 'мир'));
  const w = 96;
  const h = 64;
  const cx = w * (0.38 + random() * 0.24);
  const cy = h * (0.4 + random() * 0.2);
  const sea = coastPath(random, cx, cy, h * (0.3 + random() * 0.12), h * 0.16);
  const isle = coastPath(random, w * (0.66 + random() * 0.14), h * (0.28 + random() * 0.4), 3 + random() * 4, 2.4);
  const markerX = round(cx + (random() - 0.5) * w * 0.24);
  const markerY = round(cy + (random() - 0.5) * h * 0.3);
  const gridId = `mrsa-${id || 'g'}`;
  const parallel = round(h * (0.3 + random() * 0.12));
  return `<svg class="seed-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false">
    <defs>
      <pattern id="${gridId}" width="16" height="16" patternUnits="userSpaceOnUse">
        <path d="M16 0H0V16" fill="none" stroke="rgba(201,221,208,0.1)" stroke-width="0.5"/>
      </pattern>
    </defs>
    <rect width="${w}" height="${h}" fill="#0c1413"/>
    <rect width="${w}" height="${h}" fill="url(#${gridId})"/>
    <path d="M0 ${parallel}H${w}" stroke="rgba(216,193,132,0.28)" stroke-width="0.5" stroke-dasharray="3 4"/>
    <path d="${sea}" fill="rgba(201,221,208,0.07)" stroke="rgba(201,221,208,0.5)" stroke-width="1" stroke-linejoin="round"/>
    <path d="${isle}" fill="rgba(201,221,208,0.12)" stroke="rgba(201,221,208,0.36)" stroke-width="0.7"/>
    <circle cx="${markerX}" cy="${markerY}" r="2" fill="#d8c184"/>
    <circle cx="${markerX}" cy="${markerY}" r="4.6" fill="none" stroke="rgba(216,193,132,0.4)" stroke-width="0.6" stroke-dasharray="2 3"/>
  </svg>`;
};

/** Узор или нейтральная заглушка, если seed ещё не выбран. */
export const seedArtOrIcon = (seed, id) => (String(seed || '').trim() ? seedArtSvg(seed, { id }) : icon('map', 'icon--lg'));
