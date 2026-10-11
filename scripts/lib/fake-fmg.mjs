/* Поддельное окно редактора для тестов: те же имена полей, что читает
   src/world/bridge.js, и тот же смысл значений. Нужен потому, что настоящего
   Azgaar в Node нет (iframe живёт только в браузере), а мост без проверки —
   самое хрупкое место: генератор переименовывает поля молча, и молча же
   воксельный мир начинает строить не тот рельеф.

   Карта: 6×6 клеток по 16 пикселов = 96×96 колонок, уровень моря 20.
   Три pack-клетки перенесены на grid (суша 30/25/26), одна из них — озеро,
   две соединены рекой. Излучистость не подключена (`Rivers` в окне нет),
   поэтому русло идёт по центрам клеток — ровно тот запасной путь, который
   мост использует для старых снимков. */

export const FAKE_MAP = { cells: 6, spacing: 16, size: 96, seaLevel: 20 };

/** @returns {object} объект, годный как `iframe.contentWindow` для readSource */
export const fakeEditorWindow = () => {
  const total = FAKE_MAP.cells * FAKE_MAP.cells;
  const gridH = new Array(total).fill(5); // всё под уровнем моря
  gridH[0] = 12;
  const temp = new Array(total).fill(12);
  temp[7] = 3;
  const prec = new Array(total).fill(20);
  prec[14] = 40;
  return {
    SEA_LEVEL: FAKE_MAP.seaLevel,
    options: { map: { graph: { width: FAKE_MAP.size, height: FAKE_MAP.size } } },
    grid: {
      spacing: FAKE_MAP.spacing,
      cellsX: FAKE_MAP.cells,
      cellsY: FAKE_MAP.cells,
      cells: { h: gridH, temp, prec },
    },
    pack: {
      cells: {
        h: [30, 25, 26],
        g: [0, 7, 14],
        biome: [1, 7, 7],
        p: [[0, 0], [24, 24], [72, 72]],
      },
      features: [{ type: 'lake', cells: [1], subtype: 'freshwater', height: 22 }],
      rivers: [{ i: 1, cells: [1, 2], sourceWidth: 0.5, widthFactor: 1, discharge: 40 }],
    },
  };
};

/** Ожидания от снимка этого окна — по ним и проверяем мост. */
export const FAKE_EXPECT = {
  width: 96,
  height: 96,
  heights: { dry: 30, lake: 25, sea: 5 },
  cells: { land: 0, lake: 7, river: 14 },
  riverPoints: [[24, 24], [72, 72]],
};
