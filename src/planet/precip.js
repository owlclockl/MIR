/* Осадки: влага идёт с ветром и выпадает там, где воздух поднимается.

   До этого модуля осадки считались «по точке»: широтный пояс × близость океана
   плюс наветренный перепад высот. Работало, но у такой модели нет главного —
   **памяти**. Дождь над материком зависит от того, что было на ветру за тысячу
   километров: пустыня Намиб суха не потому, что далеко от океана (она у самого
   берега), а потому, что воздух пришёл с холодной воды и влагу уже отдал.

   Здесь влага переносится по-настоящему, одним проходом по ветру:

     1. **Испарение.** Над океаном вода испаряется тем сильнее, чем она теплее
        (холодная вода почти не испаряет — отсюда береговые пустыни). Над сушей
        испаряет то, что выпало раньше: влага возвращается в воздух и выпадает
        снова — это recycling, и он даёт влажные леса в глубине материков.
     2. **Перенос.** Воздух идёт по господствующему ветру; влага доносится из
        наветренных клеток. Схема upwind — та же, что в моделях переноса
        примеси: значение берётся у соседа, с которого дует ветер.
     3. **Ёмкость.** Тёплый воздух держит больше пара (Клаузиус — Клапейрон:
        +7 % на градус). Лишнее выпадает — так образуются тропические ливни и
        сухие полярные пустыни: при −40 °C в воздухе практически нечего носить.
     4. **Подъём.** Воздух поднимается по наветренному склону и остывает;
        ёмкость падает, излишек выпадает дождём. За хребтом воздух опускается и
        сохнет: дождевая тень получается сама, без отдельного правила.
     5. **Конвекция и фронты.** Восходящая ячейка Гадлея даёт дожди у экватора
        (ITCZ), нисходящая в субтропиках — сушь на 25–30° широты: отсюда Сахара
        и австралийские пустыни. Умеренные широты питает полярный фронт.
        Положение ITCZ смещается за Солнцем, поэтому муссоны и сухие зимы
        получаются сезонным ходом, а не назначенным порогом широты.

   Две вещи, без которых модель даёт чепуху, и обе — про размерность.

   **Влага измеряется в миллиметрах осаждаемой воды**, а не в «единицах»:
   столб воздуха при насыщении при 15 °C держит около 26 мм воды, при 25 °C —
   51 мм, при 0 °C — 9 мм, при −40 °C — 0.6 мм. Это и есть ёмкость, и она
   берётся из атмосферы (`capacity`, мм).

   **Осадки — это перенос, а не одна выпадшая капля.** За сезон воздух успевает
   пройти клетку `passages` раз (`U·T/L` ≈ 1800 раз на клетку 52 км) и каждый
   раз приносит свой столб воды. Поэтому выпадение доли влаги в клетке даёт
   `ΔW · passages` миллиметров за сезон, и вклад одной клетки получается
   физическим: 2 % от 20 мм за проход — это 730 мм за сезон, ровно как у
   настоящего воздуха, идущего над материком.

   Сумма осадков при этом автоматически равна испарению с наветренной стороны:
   сколько воды поднялось над океаном, столько и выпало над сушей. Это главное
   достоинство схемы перед формулой по точке — водный баланс сходится сам.

   Два сезона (июль и январь) считаются отдельно: годовые суммы — среднее, а их
   разница даёт сезонность осадков, нужную Кёппену и земледелию. */

import { clamp } from './scale.js';
import { itczLatitude } from './atmosphere.js';

/** Осаждаемая вода при насыщении при 15 °C, мм: столько держит столб воздуха. */
export const W0_MM = 26;
/** Средняя скорость переноса, м/с: пассаты и западный перенос вместе. */
const WIND_SPEED = 6;
/* Испарение над тёплым океаном за сезон, мм: источник всей влаги мира.

   Отсюда, а не из долей выпадения, берётся вся сумма осадков. В схеме переноса
   доли задают, *где* влага выпадет, а её количество задаёт источник: сколько
   воды поднялось над океаном, столько и выпадет — над океаном и над сушей
   вместе. Поэтому число выведено из земного баланса: средний по океану слой
   испарения около 1200 мм/год при среднем множителе тёплости около 0.5 даёт
   1300–1400 мм за сезон в самой тёплой воде. */
const EVAPORATION_MM = 2400;
/** Доля выпавшего, возвращающаяся в воздух над сушей (recycling). В Амазонии
   так возвращается до половины дождя; в одномерной модели хватает четверти —
   остальное приносят океан и соседние клетки.

   Число не «на глаз»: у Земли суша возвращает в воздух около двух третей
   выпавшего над ней дождя (испарение с суши ≈ 0,65 от осадков над сушей), и
   именно этот возврат, а не далёкий океан, питает дожди в глубине материков. */
const RECYCLE = 0.65;
/** Подъём, при котором выпадает половина влаги, м на клетку. */
const LIFT_SCALE = 320;
/** Максимальная доля влаги, которую может выжать один хребет. */
const LIFT_MAX = 0.5;
/** Сколько влаги теряется за клетку пути просто так: 1,2 % на 52 км — путь
   «высыхания» около 4000 км. Это фоновый дождь устойчивого воздуха, и он не
   зависит от насыщения: морось идёт и из ненасыщенного облака. */
const TRAVEL_LOSS = 0.012;
/** Доля излишка над ёмкостью, выпадающая за одну клетку: водяной пар
   конденсируется не мгновенно, и на фронте дождь растянут на сотни километров. */
const OVERFLOW_RELAX = 0.25;
/** Скорость конвективного выжимания влаги в полосе ITCZ, доля за клетку.
    Это не произвольный множитель: доля за клетку задаёт длину пути, на котором
    воздух теряет влагу. 5 % на 52 км — это несколько тысяч километров, как у
    настоящих пассатов, которые доносят влагу от Атлантики до Анд. */
const CONVECTIVE_STRIP = 0.05;
/** Ширина зоны конвекции, градусы. */
const CONVECTIVE_WIDTH = 9;
/** Скорость выжимания на полярном фронте, доля за клетку. Полоса фронтов —
   это и есть умеренный пояс: циклоны идут чередой и выжимают влагу из
   западного переноса почти непрерывно, поэтому здесь она выше конвективной. */
const FRONTAL_STRIP = 0.06;
/** Полуширина полосы фронтов, градусы: 45–65° — там, где проходят циклоны. */
const FRONTAL_WIDTH = 16;
/** Предел годовых осадков в клетке, мм: на Земле больше Черрапунджи (11 872)
   не выпадает нигде, а в одномерной схеме отдельная клетка может переполниться
   сходимостью и испортить всю шкалу карты. Лишнее просто не учитывается. */
export const MAX_ANNUAL_MM = 12000;
/** Провал дождей в субтропической зоне оседания (ложбина сухости), доля. */
const SUBSIDENCE = 0.55;
/** Насколько полно воздух соседней строки перемешивается с местным.
    Меридиональная составляющая ветра вдвое слабее зональной, и полное
    смешивание (как в чистой upwind-схеме по двум осям) работает как сток:
    внутренние области больших материков получали бы меньше ста миллиметров в
    год даже под экватором, чего не бывает ни в Амазонии, ни в Конго. */
const MERIDIONAL_MIX = 0.6;

/**
 * Порядок обхода строк — против ветра.
 *
 * Обход должен быть таким, чтобы наветренная строка была посчитана раньше. У
 * господствующих ветров меридиональная составляющая направлена **от гребня
 * субтропиков** (там, где сходятся ячейки Гадлея и Феррела): к экватору несут
 * пассаты, к полюсу — западный перенос. Значит, порядок задаётся расстоянием
 * до этого гребня: сначала он сам, потом обе стороны. Это одна монотонная
 * величина, и «север» с «югом» тут не важны — обход идёт не по широте, а от
 * источника.
 *
 * Ошибка в этой функции стоит дорого и не видна: при обходе «от полюса к
 * умеренным широтам» полярные области получали влагу со стороны полюса, где
 * ей неоткуда взяться, и годовые суммы падали до десяти миллиметров — тундра
 * на всей планете.
 */
export const rowOrderKey = (lat, itcz = 0) => Math.abs(Math.abs(lat - itcz) - 30);

export const PRECIP = {
  annual: 0,
  seasonality: 1,
  convective: 2,
  orographic: 3,
  recycled: 4,
  lift: 5,
};
export const PRECIP_CHANNELS = 6;

/**
 * Осадки одного сезона, мм. Считаются одним проходом по ветру: сначала в ту
 * сторону, куда дует воздух по широте, потом по каждой строке.
 *
 * @param {object} planet — геометрия
 * @param {object} grid — грубая решётка
 * @param {{land: Uint8Array, heightM: Float32Array, rowLat: Float64Array}} masks
 * @param {object} atmosphere — сезонная атмосфера
 * @param {object} ocean — течения и температура воды того же сезона
 * @param {{previous?: Float32Array|null}} [options] — прошлый расчёт для recycling
 */
export const precipitationSeason = (planet, grid, masks, atmosphere, ocean, { previous = null } = {}) => {
  const { w, h } = grid;
  const count = w * h;
  const { land, heightM, rowLat } = masks;
  const itcz = itczLatitude(atmosphere.season);
  /* Сколько раз воздух успевает пройти клетку за сезон: столько столбов воды
     он приносит с собой, и столько же раз выпавшая доля успевает дать осадки. */
  const passages = (WIND_SPEED / grid.stepX) * atmosphere.season.days * 86400;
  const evaporationPerPass = EVAPORATION_MM / passages;

  const moisture = new Float32Array(count);
  const rain = new Float32Array(count);
  const convective = new Float32Array(count);
  const orographic = new Float32Array(count);
  const recycled = new Float32Array(count);

  /* Строки — в порядке «против ветра» (см. rowOrderKey). */
  const rows = [];
  for (let gy = 0; gy < h; gy += 1) rows.push(gy);
  rows.sort((a, b) => rowOrderKey(rowLat[a], itcz) - rowOrderKey(rowLat[b], itcz));

  /* Осадки одной клетки. Всё, что делает клетка, — принимает влагу от двух
     наветренных соседей, добавляет свою (испарение океана или возврат с суши)
     и отдаёт часть дождём. */
  const step = (index, gy, gx, itczLat, subsidence, convectiveStrip, frontalStrip) => {
    const wx = Math.abs(atmosphere.windU[index]) + 0.15;
    const wy = (Math.abs(atmosphere.windV[index]) + 0.15) * MERIDIONAL_MIX;
    const total = wx + wy;
    /* Наветренный сосед — со стороны, откуда дует местный ветер. Именно
       местный: над большим материком летом ветер разворачивается муссоном, и
       обход «всей строкой в одну сторону» оставил бы половину материка без
       влаги — что и получалось, пока обход задавался знаком ветра в середине
       строки. */
    const eastward = atmosphere.windU[index] >= 0;
    const southward = atmosphere.windV[index] >= 0;
    const x0 = eastward ? gx - 1 : gx + 1;
    /* Край карты — не стена: это развёртка планеты, и воздух, ушедший за
       западный край, возвращается с восточного. Без этого океан испарял бы
       воду в пустоту, и материки выходили бы суше настоящих. */
    const wx0 = x0 < 0 ? w - 1 : x0 >= w ? 0 : x0;
    const y0 = southward ? gy - 1 : gy + 1;
    const hasY = y0 >= 0 && y0 < h;
    const rowIndex = gy * w;
    const fromY = hasY ? moisture[y0 * w + gx] : moisture[rowIndex + gx];

    let carried = (moisture[rowIndex + wx0] * wx + fromY * wy) / total;
    let wet = 0;

    /* 1. Испарение: на океане от температуры воды (холодная вода не испаряет,
       а лёд — почти нет), на суше — от прошлого дождя. */
    if (!land[index]) {
      /* Тёплость воды: у настоящего океана испарение меняется от тропиков к
         полюсам втрое, а не в сто раз, как у насыщения пара, — воду отдаёт
         поверхностный слой, и над холодной водой он почти насыщен. Поэтому
         здесь линейная зависимость (в степени 1,5), а не экспонента. */
      const warmth = clamp((ocean.sst[index] + 6) / 32, 0, 1.12);
      carried += evaporationPerPass * warmth * Math.sqrt(warmth) * (1 - 0.8 * ocean.ice[index]);
    } else {
      const source = previous ? previous[index] : rain[index];
      const recycle = (RECYCLE * source) / passages;
      carried += recycle;
      recycled[index] = recycle * passages;
    }

    /* 2. Ёмкость: излишек над насыщением выпадает. */
    const capacity = atmosphere.capacity[index];
    if (carried > capacity) {
      const excess = (carried - capacity) * OVERFLOW_RELAX;
      wet += excess * passages;
      carried -= excess;
    }

    /* 3. Подъём по наветренному склону: чем выше поднялся воздух и чем ближе
       он к насыщению, тем больше отдаёт. За хребтом воздух опускается и сохнет
       — дождевая тень получается сама, без отдельного правила. */
    const upwindHeight = (heightM[rowIndex + wx0] * wx + (hasY ? heightM[y0 * w + gx] : heightM[index]) * wy) / total;
    const lift = heightM[index] - upwindHeight;
    if (lift > 0) {
      const share = clamp((lift / LIFT_SCALE) * clamp(carried / capacity, 0, 1), 0, LIFT_MAX);
      const liftRain = carried * share * passages;
      wet += liftRain;
      carried -= carried * share;
      orographic[index] = liftRain;
    }

    /* 4. Путь: немного влаги выпадает всегда, и это то, что делает воздух
       суше по мере ухода вглубь материка. */
    wet += carried * TRAVEL_LOSS * passages;
    carried -= carried * TRAVEL_LOSS;

    /* 5. Конвекция и фронт: влага выжимается тем сильнее, чем ближе воздух к
       насыщению, а в субтропиках оседание не даёт облакам развиться.

       Над сушей конвекция поднимается не от влаги, а от нагретой поверхности:
       летний материк даёт грозы и в сухом воздухе, и именно так работает
       муссонная Азия и сахельский дождь. Поэтому зависимость от насыщения над
       сушей мягче — часть конвекции идёт независимо от того, много ли влаги
       уже накоплено. */
    const saturation = clamp(carried / capacity, 0, 1);
    /* Над сушей конвекция глубже: нагретая поверхность поднимает воздух выше,
       и дождь из того же запаса влаги идёт сильнее. Над океаном наоборот —
       там конвекция привязана к перегреву воды и мягче, поэтому воздух уносит
       влагу к берегу, а не выливает её в море. Именно это различие делает
       тропические материки дождевыми, а не «слегка влажными». */
    const convection = (land[index] ? 1.3 : 0.75) * saturation;
    const strip = convectiveStrip * subsidence * convection + frontalStrip * saturation;
    const storm = carried * strip;
    wet += storm * passages;
    carried -= storm;
    convective[index] = storm * passages;

    rain[index] = Math.max(wet, 0);
    moisture[index] = clamp(carried, 0, 140);
  };

  for (const gy of rows) {
    const lat = rowLat[gy];
    /* Субтропическое оседание: нисходящий воздух сушит всё под собой, и там,
       где он опускается над материком, встают пустыни. Действует на конвекцию,
       а не на перенос: опускающийся воздух не даёт развиваться облакам. */
    const subsidence = 1 - SUBSIDENCE * Math.exp(-(((Math.abs(lat) - 27) / 11) ** 2));
    const convectiveStrip = CONVECTIVE_STRIP * Math.exp(-(((lat - itcz) / CONVECTIVE_WIDTH) ** 2) / 2);
    const frontalStrip = FRONTAL_STRIP * Math.exp(-(((Math.abs(lat) - 55) / FRONTAL_WIDTH) ** 2) / 2);
    /* Два прохода навстречу друг другу: в первом считаются клетки с восточным
       ветром, во втором — с западным. Клетка всегда берёт влагу со своей
       наветренной стороны, и муссонный разворот ветра больше не оставляет
       половину строки без влаги. Второй круг нужен потому, что к первому
       проходу соседи «против ветра» ещё не посчитаны. */
    for (let round = 0; round < 2; round += 1) {
      for (let gx = 0; gx < w; gx += 1) {
        const index = gy * w + gx;
        if (atmosphere.windU[index] < 0) continue;
        step(index, gy, gx, lat, subsidence, convectiveStrip, frontalStrip);
      }
      for (let gx = w - 1; gx >= 0; gx -= 1) {
        const index = gy * w + gx;
        if (atmosphere.windU[index] >= 0) continue;
        step(index, gy, gx, lat, subsidence, convectiveStrip, frontalStrip);
      }
    }
  }

  return { rain, convective, orographic, recycled, moisture, passages };
};

/**
 * Годовой ход осадков: два сезона, их среднее и разница.
 *
 * @returns {{annual: Float32Array, seasonality: Float32Array,
 *   warm: Float32Array, cold: Float32Array}}
 */
export const createPrecipitation = (planet, grid, masks, seasons) => {
  const count = grid.w * grid.h;
  /* Возврат влаги с суши считается по тому, что уже выпало, поэтому проходов
     несколько: первый даёт оценку дождя, второй и третий — дождь с учётом
     возврата. Нулевой цикл (без прошлого дождя) дал бы засушливые материки, а
     одного прохода мало: возврат — две трети дождя, и он должен успеть
     сойтись. Январь считается после июля: у воздуха нет памяти между сезонами,
     но у почвы есть. */
  const warmFirst = precipitationSeason(planet, grid, masks, seasons.july.atmosphere, seasons.july.ocean);
  const warmSecond = precipitationSeason(planet, grid, masks, seasons.july.atmosphere, seasons.july.ocean, { previous: warmFirst.rain });
  const warm = precipitationSeason(planet, grid, masks, seasons.july.atmosphere, seasons.july.ocean, { previous: warmSecond.rain });
  const coldFirst = precipitationSeason(planet, grid, masks, seasons.january.atmosphere, seasons.january.ocean, { previous: warm.rain });
  const cold = precipitationSeason(planet, grid, masks, seasons.january.atmosphere, seasons.january.ocean, { previous: coldFirst.rain });

  const annual = new Float32Array(count);
  const seasonality = new Float32Array(count);
  const column = new Float32Array(count);
  /* Ограничение шкалы применяется к самим сезонным полям, а не только к
     годовой сумме: все, кто читает осадки — раскраска, гидрология, проверки, —
     должны видеть одно и то же число. */
  for (let i = 0; i < count; i += 1) {
    const sum = (warm.rain[i] + cold.rain[i]) / 2;
    if (sum <= MAX_ANNUAL_MM) continue;
    const scale = MAX_ANNUAL_MM / sum;
    warm.rain[i] *= scale;
    cold.rain[i] *= scale;
  }
  const convective = new Float32Array(count);
  const orographic = new Float32Array(count);
  const recycled = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const a = warm.rain[i];
    const b = cold.rain[i];
    annual[i] = (a + b) / 2;
    const mean = Math.max((a + b) / 2, 1e-6);
    seasonality[i] = Math.abs(a - b) / mean;
    convective[i] = (warm.convective[i] + cold.convective[i]) / 2;
    orographic[i] = (warm.orographic[i] + cold.orographic[i]) / 2;
    recycled[i] = (warm.recycled[i] + cold.recycled[i]) / 2;
    column[i] = (warm.moisture[i] + cold.moisture[i]) / 2;
  }
  return { annual, seasonality, convective, orographic, recycled, column, warm: warm.rain, cold: cold.rain };
};
