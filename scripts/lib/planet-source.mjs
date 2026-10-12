/* Синтетический снимок карт Azgaar — тот же формат, что отдаёт readSource.

   Нужен там, где настоящего документа редактора нет: в `npm run test:planet`
   (Node без DOM) и в `scripts/planet-preview.mjs` (там же). Формат — ровно то,
   что мост достаёт из окна: решётка клеток `cellsX × cellsY` с шагом `spacing`
   в пикселях карты `width × height`, высоты в шкале 0…100 и уровнем моря 20.
   Поэтому проверка смотрит на настоящие поля, а не на удобные тесту.

   Карта нарочно простая: два материка, островная дуга, залив и горный хребет.
   Сложная карта ничего не добавила бы — проверяется берег, а он здесь везде
   разный: пологий, крутой, косой и разорванный. */

/** Массив круглых «материков» в нормированных координатах карты. */
const BLOBS = [
  { x: 0.3, y: 0.45, r: 0.26, h: 62 }, // большой континент с горой в центре
  { x: 0.74, y: 0.62, r: 0.17, h: 44 },
  { x: 0.55, y: 0.2, r: 0.07, h: 34 }, // остров
  { x: 0.12, y: 0.78, r: 0.05, h: 30 },
];
/** Хребет — полоса через первый континент: проверяем, что он не «пережёг» берег. */
const RIDGE = { x: 0.16, y: 0.4, dx: 0.3, dy: 0.12 };
/** Залив, вдающийся в большой континент: берег внутри него — самый трудный. */
const BAY = { x: 0.42, y: 0.5, r: 0.09 };

/**
 * @param {object} [options] размер карты и решётки клеток
 * @returns {object} снимок для createSourceField / createElevation({ source })
 */
export const blobsSource = ({
  cellsX = 100,
  cellsY = 63,
  spacing = 16,
  width = 1600,
  height = 1000,
  seaLevel = 20,
} = {}) => {
  const cellH = new Float32Array(cellsX * cellsY);
  for (let cy = 0; cy < cellsY; cy += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      const u = (cx + 0.5) / cellsX;
      const v = (cy + 0.5) / cellsY;
      let h = 4; // открытый океан: дно далеко, но не за бесконечность
      /* Пологая abyssal plain к полюсам, чтобы глубина не была константой. */
      h += 6 * Math.max(0, 0.6 - Math.abs(v - 0.5));
      for (const blob of BLOBS) {
        const d = Math.hypot(u - blob.x, (v - blob.y) * 2) / blob.r;
        const t = Math.max(0, 1 - d);
        if (t > 0) h = Math.max(h, seaLevel + blob.h * t ** 1.25);
      }
      /* Хребет: косая полоса, высота поперёк — треугольником. */
      const along = (u - RIDGE.x) * RIDGE.dy - (v - RIDGE.y) * RIDGE.dx;
      const across = Math.abs((u - RIDGE.x) * RIDGE.dx + (v - RIDGE.y) * RIDGE.dy) / 0.05;
      if (Math.abs(along) < 0.2 && across < 1 && h > seaLevel) h += 30 * (1 - across);
      /* Залив: режет сушу до воды — именно так проверяется «деталь не топит». */
      const bay = Math.hypot(u - BAY.x, (v - BAY.y) * 2) / BAY.r;
      if (bay < 1) h = Math.min(h, seaLevel - 4 * (1 - bay));
      cellH[cy * cellsX + cx] = h;
    }
  }
  const total = cellsX * cellsY;
  let land = 0;
  for (let i = 0; i < total; i += 1) if (cellH[i] > seaLevel) land += 1;
  const cellFloat = new Uint8Array(total);
  const cellTemp = new Int8Array(total);
  const cellPrec = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    cellFloat[i] = cellH[i] > seaLevel ? 4 : 0;
    cellTemp[i] = 12;
    cellPrec[i] = 20;
  }
  return {
    width,
    height,
    spacing,
    cellsX,
    cellsY,
    seaLevel,
    cellH,
    cellBiome: cellFloat,
    cellTemp,
    cellPrec,
    /* Остальные поля снимка для планеты не используются (реки и озёра у
       генератора свои), но пусть будут: формат — он и есть формат. */
    cellFeature: new Uint16Array(total),
    features: [],
    rivers: [],
    stats: { cells: total, land, rivers: 0, lakes: 0, riversSkipped: 0 },
  };
};

/** Доля суши в самом снимке — с ней сравнивается доля суши планеты. */
export const sourceLandShare = (source) => {
  const total = source.cellsX * source.cellsY;
  let land = 0;
  for (let i = 0; i < total; i += 1) if (source.cellH[i] > source.seaLevel) land += 1;
  return land / total;
};
