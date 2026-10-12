/* Грубые глобальные поля: общая решётка для всего, что меняется на сотнях и
   тысячах километров.

   Зачем отдельный модуль. Всё «научное» в этом генераторе — тектоника,
   эрозия, океан, осадки — считается не по тайлам, а один раз на грубой
   решётке мира. Причины две:

     • **Физика глобальна.** Климат и сток зависят от того, что творится в
       тысяче километров на ветру, поэтому решать их в пределах одного кадра
       нельзя в принципе.
     • **Пирамида должна оставаться точной.** Значение поля в точке не зависит
       от уровня приближения: родитель и ребёнок видят одно и то же число. Тайл
       любого уровня строится из одних и тех же полей плюс октавы детали, и
       берег не «плывёт» при приближении.

   Шаг решётки выбирается по размеру планеты (десятки километров). Дальше
   поле опрашивается билинейно — это дешёвая операция на пиксель, и именно
   поэтому тайлы рисуются за считанные миллисекунды, а вся тяжёлая работа
   делается один раз. */

import { clamp } from './scale.js';

/** Больше этого числа клеток грубая решётка не строит: 786 432 ≈ 2⁴·3·2¹². */
export const MAX_CELLS = 1_200_000;

const bilinear = (grid, mx, my, channel, target) => {
  const { w, h, channels, data, invX, invY } = grid;
  let fx = mx * invX;
  let fy = my * invY;
  if (fx < 0) fx = 0;
  else if (fx > w - 1) fx = w - 1;
  if (fy < 0) fy = 0;
  else if (fy > h - 1) fy = h - 1;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = x0 + 1 < w ? x0 + 1 : x0;
  const y1 = y0 + 1 < h ? y0 + 1 : y0;
  const tx = fx - x0;
  const ty = fy - y0;
  for (let c = 0; c < channels; c += 1) {
    const index = y0 * w + x0;
    const a = data[(index) * channels + c];
    const b = data[(index + (x1 - x0)) * channels + c];
    const d = data[(index + (y1 - y0) * w) * channels + c];
    const e = data[(index + (y1 - y0) * w + (x1 - x0)) * channels + c];
    const top = a + (b - a) * tx;
    const bottom = d + (e - d) * tx;
    target[c] = top + (bottom - top) * ty;
  }
  return channel === undefined ? target : target[channel];
};

/**
 * Грубая решётка мира.
 *
 * @param {object} planet — геометрия из scale.js
 * @param {{cells?: number, channels?: number, fill?: function(Float32Array,
 *   number, number):void, smooth?: number}} options
 *   `cells` — сколько клеток по ширине мира (по умолчанию из шага `cell`);
 *   `fill(out, mx, my)` заполняет вектор каналов в точке; `smooth` — сколько
 *   раз сгладить поле (нужно там, где значение приходит из точечных вычислений)
 */
export const createGrid = (planet, { cells = 512, channels = 1, cell = 0, fill = null, smooth = 0 } = {}) => {
  const step = cell > 0 ? planet.widthM / Math.ceil(planet.widthM / cell) : planet.widthM / cells;
  const w = Math.max(2, Math.round(planet.widthM / step));
  const h = Math.max(2, Math.round(planet.heightM / step) + 1);
  if (w * h > MAX_CELLS) throw new Error(`Грубая решётка слишком велика: ${w}×${h}`);
  const data = new Float32Array(w * h * channels);
  const stepX = planet.widthM / w;
  const stepY = planet.heightM / (h - 1);
  const grid = {
    planet,
    w,
    h,
    channels,
    data,
    stepX,
    stepY,
    cell: stepX,
    invX: w / planet.widthM,
    invY: (h - 1) / planet.heightM,
    /** Площадь клетки, м²: по ней водосборы переводятся в км². */
    area: stepX * stepY,
    /** Индекс клетки по метрам карты (для точечных запросов). */
    cellOf(mx, my) {
      const gx = clamp(Math.floor(mx / stepX), 0, w - 1);
      const gy = clamp(Math.floor(my / stepY), 0, h - 1);
      return gy * w + gx;
    },
    /** Центр клетки в метрах карты. */
    centerOf(index) {
      return { x: ((index % w) + 0.5) * stepX, y: (((index / w) | 0) + 0.5) * stepY };
    },
    at(index, channel = 0) {
      if (channel >= channels) throw new Error(`Нет канала ${channel}: их ${channels}`);
      return data[index * channels + channel];
    },
    put(index, channel, value) {
      if (channel >= channels) throw new Error(`Нет канала ${channel}: их ${channels}`);
      data[index * channels + channel] = value;
    },
    /** Бинейная выборка с прижатием к краю: за рамкой карты земли нет. */
    sample(mx, my, target, channel) {
      return bilinear(grid, mx, my, channel, target);
    },
    /** Одно скалярное значение в точке — самый частый запрос. */
    sample1(mx, my, channel = 0) {
      if (channel >= channels) throw new Error(`Нет канала ${channel}: их ${channels}`);
      const { w: gw, h: gh, channels: gc, data: gd, invX, invY } = grid;
      let fx = mx * invX;
      let fy = my * invY;
      if (fx < 0) fx = 0;
      else if (fx > gw - 1) fx = gw - 1;
      if (fy < 0) fy = 0;
      else if (fy > gh - 1) fy = gh - 1;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = x0 + 1 < gw ? x0 + 1 : x0;
      const y1 = y0 + 1 < gh ? y0 + 1 : y0;
      const tx = fx - x0;
      const ty = fy - y0;
      const base = y0 * gw + x0;
      const a = gd[base * gc + channel];
      const b = gd[(base + (x1 - x0)) * gc + channel];
      const d = gd[(base + (y1 - y0) * gw) * gc + channel];
      const e = gd[(base + (y1 - y0) * gw + (x1 - x0)) * gc + channel];
      const top = a + (b - a) * tx;
      const bottom = d + (e - d) * tx;
      return top + (bottom - top) * ty;
    },
    /** Значение канала одним массивом — там, где нужен весь проход. */
    channelArray(channel) {
      const out = new Float32Array(w * h);
      for (let i = 0; i < w * h; i += 1) out[i] = data[i * channels + channel];
      return out;
    },
    forEach(visit, channel = 0) {
      for (let i = 0; i < w * h; i += 1) visit(data[i * channels + channel], i);
    },
    stats(channel = 0) {
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      for (let i = 0; i < w * h; i += 1) {
        const value = data[i * channels + channel];
        if (value < min) min = value;
        if (value > max) max = value;
        sum += value;
      }
      return { min, max, mean: sum / (w * h), cells: w * h };
    },
  };
  if (fill) {
    const out = new Float32Array(channels);
    for (let gy = 0; gy < h; gy += 1) {
      const my = (gy + 0.5) * stepY;
      for (let gx = 0; gx < w; gx += 1) {
        const base = (gy * w + gx) * channels;
        if (channels === 1) {
          data[base] = fill(out, (gx + 0.5) * stepX, my) ?? out[0];
          continue;
        }
        fill(out, (gx + 0.5) * stepX, my);
        for (let c = 0; c < channels; c += 1) data[base + c] = out[c];
      }
    }
  }
  if (smooth > 0) smoothGrid(grid, 0, smooth);
  return grid;
};

/**
 * Размытие поля «пять точек» (то же, что линейная диффузия на один шаг).
 * Нужно там, где поле собрано из точечных решений: без него на решётке видны
 * следы отдельных клеток — физика такого не даёт.
 */
export const smoothGrid = (grid, channel = 0, passes = 1, weight = 0.25) => {
  const { w, h, channels, data } = grid;
  let source = new Float32Array(w * h);
  let target = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) source[i] = data[i * channels + channel];
  for (let pass = 0; pass < passes; pass += 1) {
    for (let gy = 0; gy < h; gy += 1) {
      for (let gx = 0; gx < w; gx += 1) {
        const index = gy * w + gx;
        const left = gx > 0 ? source[index - 1] : source[index];
        const right = gx < w - 1 ? source[index + 1] : source[index];
        const up = gy > 0 ? source[index - w] : source[index];
        const down = gy < h - 1 ? source[index + w] : source[index];
        target[index] = source[index] + weight * (left + right + up + down - 4 * source[index]);
      }
    }
    const swap = source;
    source = target;
    target = swap;
  }
  for (let i = 0; i < w * h; i += 1) data[i * channels + channel] = source[i];
  return grid;
};

/**
 * Квантиль поля: значение, ниже которого лежит доля `q` значений.
 * Считается гистограммой, а не сортировкой: миллион значений сортировать
 * незачем, а точности 1024 корзины хватает с запасом (порог уровня моря
 * уточняется бисекцией по одной корзине).
 */
export const quantile = (grid, channel = 0, q = 0.5, buckets = 1024) => {
  const { w, h, channels, data } = grid;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < w * h; i += 1) {
    const value = data[i * channels + channel];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!(max > min)) return min;
  const width = (max - min) / buckets;
  const histogram = new Int32Array(buckets + 1);
  for (let i = 0; i < w * h; i += 1) {
    const slot = Math.floor((data[i * channels + channel] - min) / width);
    histogram[clamp(slot, 0, buckets)] += 1;
  }
  const wanted = clamp(q, 0, 1) * (w * h);
  let seen = 0;
  for (let slot = 0; slot <= buckets; slot += 1) {
    seen += histogram[slot];
    if (seen >= wanted) return min + slot * width;
  }
  return max;
};

/** Доля значений канала, проходящих проверку. */
export const share = (grid, channel, test) => {
  const { w, h, channels, data } = grid;
  let count = 0;
  for (let i = 0; i < w * h; i += 1) if (test(data[i * channels + channel])) count += 1;
  return count / (w * h);
};

/** Среднее канала. */
export const mean = (grid, channel) => {
  const { w, h, channels, data } = grid;
  let sum = 0;
  for (let i = 0; i < w * h; i += 1) sum += data[i * channels + channel];
  return sum / (w * h);
};
