/* Вид планеты: плоская карта на весь экран карты.

   Это дополнительный вид для рассматривания, не основной редактор мира:
   колесо — приближение, перетаскивание — перенос, один ползунок перебирает слои, от рельефа
   до плотности населения. География берётся из карты Azgaar, которая живёт в
   соседнем iframe (src/planet/source.js), а деталь — из шума: любой кадр можно
   увеличивать до тех пор, пока в пикселе не останется метр. Если документа
   генератора нет или он ещё строит карту, вид не ждёт: мир собирается
   процедурно, а снимок подхватывается, как только генератор дойдёт до нужных
   шагов.

   Устройство вида:

     • **Камера — центр в метрах и уровень пирамиды.** Уровень задаёт
       разрешение: `mpp = 2^(maxLevel − level)` метров на пиксель. Приближение
       колёсом меняет уровень на единицу и удерживает точку под курсором, как в
       спутниковых картах: между уровнями картинка растягивается, а не прыгает.
     • **Кадр рисуется заново каждый раз, но из кэша.** Тайлы, попавшие в кадр,
       берутся готовыми; чего нет — подменяется родителем, растянутым вдвое, и
       заказывается в очередь (src/planet/tiles.js).
     • **Очерёдность грубая: сначала предки.** Поэтому при переносе кадр не
       пустеет: новое место сначала показывается расплывчато, потом проясняется.
     • **Никакого ожидания генерации.** Всё считается по очереди с бюджетом
       кадра; в статистике видно, сколько тайлов ещё в работе.

   Внизу — показания под курсором: широта и долгота, высота, биом, температура,
   осадки и ширина реки, если курсор стоит на воде. */

import { icon } from '../ui/icons.js';
import {
  CLOCK_MODES, createClock, createLivingWorld, createSeasonFields, dateLabel, hourLabel,
} from './alive.js';
import { ALIVE_LAYERS, createAlivePainter } from './alive-paint.js';
import { createClimate, BIOMES } from './climate.js';
import { createElevation, heightMeters, SEA_LEVEL } from './elevation.js';
import { createHydro } from './hydro.js';
import { LAYERS } from './paint.js';
import { createPlanet, levelPixels, levelTiles, metersToGeo, mppAt, TILE } from './scale.js';
import { describeSource, mapsReady, missingMapsPart, readSource } from './source.js';
import { createTiles } from './tiles.js';

const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

/** Шаги масштабной линейки: 1, 2, 5 × 10^n метров. */
const scaleSteps = [1, 2, 5];
const niceLength = (meters) => {
  const power = 10 ** Math.floor(Math.log10(Math.max(meters, 1)));
  for (const step of scaleSteps) {
    const value = step * power;
    if (value >= meters) return value;
  }
  return 10 * power;
};

/** Длина в человеческом виде: метры, километры — как привычнее. */
const formatDistance = (meters) => {
  if (meters >= 1000) return `${(meters / 1000).toLocaleString('ru-RU', { maximumFractionDigits: meters >= 10000 ? 0 : 1 })} км`;
  return `${meters.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} м`;
};

const formatGeo = (lat, lon) => {
  const ns = lat >= 0 ? 'с. ш.' : 'ю. ш.';
  const ew = lon >= 0 ? 'в. д.' : 'з. д.';
  return `${Math.abs(lat).toFixed(3)}° ${ns}, ${Math.abs(lon).toFixed(3)}° ${ew}`;
};

/**
 * Собрать вид планеты в узле `host`.
 *
 * @param {HTMLElement} host — контейнер (в проекте это .world-editor)
 * @param {object} options — seed, size (1 | 2 | 4), onExit; `frame` — iframe с
 *   Azgaar (оттуда снимается география; по умолчанию ищется в host по
 *   data-role="world-editor"), `config` — { seed, width, height } слота (нужно,
 *   если документ не отдал размеры), `source` — готовый снимок (проверки)
 * @returns {object} view — element, error, stats, dispose
 */
export const mountPlanetView = (host, { seed = 'mir-2026', size = 1, onExit, frame: editorFrameElement = null, config = null, source = null } = {}) => {
  const element = document.createElement('div');
  element.className = 'planet-view';
  element.innerHTML = `
    <canvas class="planet-view__canvas" data-role="canvas"></canvas>
    <div class="planet-view__veil" data-role="veil" hidden><span>Считаю мир…</span></div>
    <section class="planet-panel" aria-label="Управление картой планеты">
      <div class="planet-panel__row">
        <label class="planet-field">
          <span class="planet-field__label">Seed</span>
          <input class="planet-field__input" type="text" data-role="seed" spellcheck="false" autocomplete="off">
        </label>
        <button class="planet-button" type="button" data-action="new-world" title="Новый мир: тот же размер, новое зерно">${icon('dices', 'icon--xs')}<span>Новый мир</span></button>
      </div>
      <div class="planet-panel__row">
        <span class="planet-field__label">Размер планеты</span>
        <div class="planet-sizes" role="radiogroup" aria-label="Размер планеты">
          ${[1, 2, 4].map((value) => `<button class="planet-size${value === size ? ' is-active' : ''}" type="button" role="radio" aria-checked="${value === size}" data-action="size" data-size="${value}"><strong>${value}×</strong><span>${Math.round((40075 * value) / 1000)} тыс. км</span></button>`).join('')}
        </div>
      </div>
      <div class="planet-panel__row planet-panel__row--source">
        <span class="planet-field__label">География</span>
        <span class="planet-source" data-role="source">—</span>
        <button class="planet-button" type="button" data-action="resync" title="Снять карту Azgaar заново: правки высот в редакторе попадут на карту планеты">${icon('refresh', 'icon--xs')}<span>С карты</span></button>
      </div>
      <label class="planet-layer">
        <span class="planet-layer__head"><span class="planet-field__label">Слой</span><strong data-role="layer-name">—</strong></span>
        <input class="planet-layer__range" type="range" min="0" max="${LAYERS.length - 1}" step="1" value="0" data-role="layer-range" aria-label="Слой карты">
        <span class="planet-layer__hint" data-role="layer-hint">—</span>
      </label>
      <div class="planet-toggles">
        <button class="planet-toggle is-on" type="button" data-action="toggle" data-toggle="shading" aria-pressed="true">${icon('mountain', 'icon--xs')}<span>Отмывка</span></button>
        <button class="planet-toggle is-on" type="button" data-action="toggle" data-toggle="rivers" aria-pressed="true">${icon('mountainSnow', 'icon--xs')}<span>Реки</span></button>
        <button class="planet-toggle" type="button" data-action="toggle" data-toggle="graticule" aria-pressed="false">${icon('globe', 'icon--xs')}<span>Сетка</span></button>
      </div>
      <div class="planet-alive">
        <div class="planet-alive__head">
          <span class="planet-field__label">Живой мир</span>
          <strong class="planet-alive__clock" data-role="clock">—</strong>
          <button class="planet-alive__play is-running" type="button" data-action="clock-toggle" aria-pressed="true" title="Пуск и остановка времени (пробел)"><span data-role="play-icon">${icon('play', 'icon--xs')}</span><span class="planet-alive__play-label" data-role="play-label">Идёт</span></button>
        </div>
        <div class="planet-modes" role="radiogroup" aria-label="Ход времени">
          ${CLOCK_MODES.map((mode) => `<button class="planet-mode${mode.id === 'day' ? ' is-active' : ''}" type="button" role="radio" aria-checked="${mode.id === 'day'}" data-action="mode" data-mode="${mode.id}" title="${mode.hint}"><span>${mode.name}</span></button>`).join('')}
        </div>
        <input class="planet-alive__range" type="range" min="0" max="24" step="0.05" value="12" data-role="clock-range" aria-label="Время суток">
        <span class="planet-alive__hint" data-role="clock-hint">—</span>
        <div class="planet-alive__layers" data-role="alive-layers">
          ${ALIVE_LAYERS.map((layer) => `<button class="planet-chip is-on" type="button" data-action="alive" data-alive="${layer.id}" aria-pressed="true" title="${layer.hint}"><span>${layer.name}</span></button>`).join('')}
        </div>
      </div>
      <div class="planet-panel__row planet-panel__row--split">
        <button class="planet-button" type="button" data-action="zoom-out" title="Отдалить (минус)">${icon('minus', 'icon--xs')}<span>Отдалить</span></button>
        <button class="planet-button" type="button" data-action="zoom-in" title="Приблизить (плюс)">${icon('plus', 'icon--xs')}<span>Приблизить</span></button>
      </div>
      <button class="planet-button planet-button--exit" type="button" data-action="exit" title="Вернуться к карте (Esc)">${icon('map', 'icon--xs')}<span>К карте</span></button>
    </section>
    <div class="planet-status" data-role="status" role="status"></div>
    <div class="planet-readout" data-role="readout"></div>
    <div class="planet-scale" data-role="scale"><i></i><span>—</span></div>
  `;

  const canvas = element.querySelector('[data-role="canvas"]');
  const veil = element.querySelector('[data-role="veil"]');
  const sourceEl = element.querySelector('[data-role="source"]');
  const statusEl = element.querySelector('[data-role="status"]');
  const readoutEl = element.querySelector('[data-role="readout"]');
  const scaleEl = element.querySelector('[data-role="scale"]');
  const seedInput = element.querySelector('[data-role="seed"]');
  const range = element.querySelector('[data-role="layer-range"]');
  const layerName = element.querySelector('[data-role="layer-name"]');
  const layerHint = element.querySelector('[data-role="layer-hint"]');
  const clockEl = element.querySelector('[data-role="clock"]');
  const clockRange = element.querySelector('[data-role="clock-range"]');
  const clockHint = element.querySelector('[data-role="clock-hint"]');
  const playButton = element.querySelector('[data-action="clock-toggle"]');
  const playLabel = element.querySelector('[data-role="play-label"]');
  const playIcon = element.querySelector('[data-role="play-icon"]');
  const ctx = canvas.getContext('2d', { alpha: false });
  /**
   * Размер кадра в пикселях. `clientWidth` — истина в браузере, но в jsdom его
   * нет вовсе, а рамку элемента всё равно знает `getBoundingClientRect`: если
   * брать размер из разных мест, щелчок и подпись считают точку по-разному.
   */
  const frameSize = () => {
    const rect = canvas.getBoundingClientRect?.();
    return {
      width: canvas.clientWidth || rect?.width || 960,
      height: canvas.clientHeight || rect?.height || 600,
    };
  };
  const scratch = document.createElement('canvas');
  scratch.width = TILE;
  scratch.height = TILE;

  const view = { element, error: null, seed, size, source, sourceNote: '' };
  let disposed = false;
  let world = null;
  let level = 0;
  let centerX = 0;
  let centerY = 0;
  let minLevel = 0;
  let pointer = null; // курсор в пикселях кадра
  let drag = null; // перетаскивание: откуда тянем и какой был центр
  let layerIndex = 0;
  const toggles = { shading: true, rivers: true, graticule: false };
  /* Часы мира одни на весь вид: их двигает кадр, а спрашивают — панель,
     подпись под курсором и погода. */
  const clock = createClock();
  let painter = null;
  const aliveToggles = Object.fromEntries(ALIVE_LAYERS.map((layer) => [layer.id, true]));
  let zoomAccumulator = 0;
  let zoomTarget = 0; // куда ведёт ступенчатое приближение
  let zoomAnchor = null; // точка под курсором, которую держим при приближении
  let zoomStepped = false; // ступень текущей цели уже сделана
  let inertia = null; // остаточный ход после перетаскивания
  let marker = null; // метка, поставленная щелчком: { x, y, at }
  let lastFrameAt = 0;

  /* ---------- география: карта Azgaar ---------- */

  /** Кадр редактора: тот же хост, что держит вид; ищем по data-role, чтобы
      вид можно было смонтировать и с явным frame (проверки, лобби). */
  const editorFrame = () => editorFrameElement ?? host?.querySelector?.('[data-role="world-editor"]');

  /**
   * Снять географию с документа редактора. Отказ — не ошибка вида: карта может
   * ещё строиться, может быть закрыта, может быть старым документом без pack.
   * Возвращаем причину человеческим языком, её видно в панели.
   */
  const readEditorSource = () => {
    const win = editorFrame()?.contentWindow;
    if (!win) return { source: null, note: 'документ Azgaar не открыт: мир процедурный' };
    if (!mapsReady(win)) return { source: null, note: `карта Azgaar не готова: ${missingMapsPart(win)}` };
    try {
      return { source: readSource(win, { seed: view.seed, width: config?.width, height: config?.height }), note: '' };
    } catch (error) {
      return { source: null, note: `карту Azgaar не прочитать: ${error instanceof Error ? error.message : String(error)}` };
    }
  };

  const setSourceNote = (text) => {
    view.sourceNote = text || '';
    if (sourceEl) sourceEl.textContent = text || '—';
  };

  /* Генератор строит карту секунд десять; за это время вид уже показан. Ждём
     с паузами, а не в кадре: кадры должны остаться плавными. */
  const SOURCE_POLL_MS = 700;
  const SOURCE_POLL_LIMIT = 160; // ~110 с: дольше — это отказ, а не ожидание
  let sourceTimer = 0;
  let sourceAttempts = 0;

  /** @returns {boolean} удалось ли снять карту (заметка в панели — в любом случае) */
  const takeSource = () => {
    const taken = readEditorSource();
    if (!taken.source) {
      setSourceNote(taken.note);
      return false;
    }
    sourceAttempts = 0;
    view.source = taken.source;
    setSourceNote(describeSource(taken.source));
    return true;
  };

  const scheduleSourcePoll = () => {
    if (disposed || view.source || sourceTimer) return;
    sourceTimer = setTimeout(() => {
      sourceTimer = 0;
      if (disposed || view.source) return;
      if (sourceAttempts++ > SOURCE_POLL_LIMIT) {
        setSourceNote('карта Azgaar так и не дошла до высот: мир остался процедурным');
        return;
      }
      if (takeSource()) rebuild();
      else scheduleSourcePoll();
    }, SOURCE_POLL_MS);
  };

  /* ---------- мир ---------- */

  const buildWorld = () => {
    const planet = createPlanet({ seed: view.seed || 'mir-2026', size: view.size });
    /* Бюджеты кэшей: тайлы высот дороже всего (их пересчёт — цепочка предков),
       поэтому им отдано больше всего; климат и картинки дешевле пересчитать. */
    const elev = createElevation(planet, { bytes: 64 * 1024 * 1024, source: view.source });
    const cli = createClimate(planet, elev, { tiles: 64 });
    const water = createHydro(planet, elev, cli);
    const tileCache = createTiles({ planet, elevation: elev, climate: cli, hydro: water });
    /* Живой мир: часы, погода, огни, вулканы и дрейф. Он же считает климат
       целиком — климатология нужна облакам, огням и снегу, — поэтому создаётся
       здесь же, за той же завесой «Считаю мир…». */
    const living = createLivingWorld({ planet, elevation: elev, climate: cli, hydro: water, seed: view.seed || 'mir-2026', clock });
    const paint = createAlivePainter({ living, planet, seasonFields: createSeasonFields({ climate: cli }) });
    world = { planet, elevation: elev, climate: cli, hydro: water, tiles: tileCache, living, painter: paint };
    /* География из карты генератора — а если её нет, процедурная: об этом
       говорит подпись в панели, и её же видно в stats(). */
    /* Отказ важнее общей фразы: «карта ещё строится» и «карты нет вовсе» — это
       разные действия человека, и терять причину при пересборке нельзя. */
    setSourceNote(
      elev.geography
        ? `${describeSource(view.source)} · деталь с ${elev.detailFrom}-й октавы`
        : view.sourceNote || 'карты Azgaar нет: материки из шума',
    );
    /* Первый кадр — весь мир: начинаем с уровня, на котором планета целиком
       помещается в экран. */
    minLevel = fitLevel(planet);
    level = minLevel;
    centerX = planet.widthM / 2;
    centerY = planet.heightM / 2;
    tileCache.setCenter(centerX, centerY);
    tileCache.setLayer(LAYERS[layerIndex].id);
    tileCache.setOptions(toggles);
    view.stats = () => ({
      ...tileCache.stats(),
      seed: planet.seed,
      geography: elev.stats().geography,
      detailFrom: elev.stats().detailFrom,
      source: elev.stats().source,
      size: planet.size,
      widthM: planet.widthM,
      heightM: planet.heightM,
      level,
      mpp: mppAt(planet, level),
      center: { x: centerX, y: centerY },
      pointer: pointer ? { x: pointer.x, y: pointer.y } : null,
      elevation: elev.stats(),
      climate: cli.stats(),
      hydro: water.stats(),
      alive: living.stats(),
      animation: paint.stats(),
      clock: clock.snapshot(),
      aliveToggles: { ...aliveToggles },
      running: clock.running,
      marker: marker ? { x: marker.x, y: marker.y } : null,
    });
    return world;
  };

  /** Уровень, на котором мир целиком влезает в кадр. */
  const fitLevel = (planet) => {
    /* Размер кадра берётся тем же способом, что и везде: в jsdom у холста нет
       ни clientWidth, ни размеров из разметки, и «своё» число здесь означало бы
       другой кадр — а значит, другой уровень, другое поле зрения и другие
       координаты точки под курсором. */
    const widthPx = frameSize().width;
    for (let l = 0; l <= planet.maxLevel; l += 1) {
      if (levelPixels(planet, l).w <= widthPx) return l;
    }
    return planet.maxLevel;
  };

  /* ---------- кадр ---------- */

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = frameSize();
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (world) {
      minLevel = fitLevel(world.planet);
      level = clamp(level, minLevel, world.planet.maxLevel);
      zoomTarget = clamp(zoomTarget, minLevel, world.planet.maxLevel);
    }
  };

  const requestVisible = () => {
    if (!world) return;
    const { planet, tiles } = world;
    const mpp = mppAt(planet, level);
    const width = frameSize().width;
    const height = frameSize().height;
    const left = centerX - (width / 2) * mpp;
    const top = centerY - (height / 2) * mpp;
    const tx0 = Math.floor(left / (TILE * mpp));
    const tx1 = Math.floor((left + width * mpp) / (TILE * mpp));
    const ty0 = Math.floor(top / (TILE * mpp));
    const ty1 = Math.floor((top + height * mpp) / (TILE * mpp));
    tiles.setCenter(centerX, centerY);
    const { tx: countX, ty: countY } = levelTiles(planet, level);
    for (let ty = ty0; ty <= ty1; ty += 1) {
      for (let tx = tx0; tx <= tx1; tx += 1) {
        /* Тайлов за рамкой карты не существует: мир не замкнут по долготе, и
           просить их с другого края — значит рисовать в кадре чужую половину. */
        if (tx < 0 || tx >= countX || ty < 0 || ty >= countY) continue;
        tiles.request(level, tx, ty);
      }
    }
  };

  const drawStatus = () => {
    if (!world) return;
    const { planet, tiles } = world;
    const stats = tiles.stats();
    const mpp = mppAt(planet, level);
    const alive = world.living.stats();
    statusEl.textContent = [
      `${(planet.widthM / 1000).toFixed(0)} × ${(planet.heightM / 1000).toFixed(0)} тыс. км`,
      `${formatDistance(mpp)}/пиксель`,
      `уровень ${level} из ${planet.maxLevel}`,
      world.living.label(),
      /* Вихри — самая говорящая часть погоды: по ним видно, что мир живёт,
         а ураганы в их числе показывают, что мир ещё и тёплый. */
      alive.weather.systems
        ? `вихрей ${alive.weather.systems}${alive.weather.hurricanes ? ` (ураганов ${alive.weather.hurricanes})` : ''}`
        : 'ясно',
      stats.queue || stats.rivers ? `в работе: ${stats.queue + stats.rivers}` : 'готово',
    ].join(' · ');
    const bar = scaleEl.querySelector('i');
    const label = scaleEl.querySelector('span');
    const wanted = mpp * 120;
    const nice = niceLength(wanted);
    bar.style.width = `${Math.round(nice / mpp)}px`;
    label.textContent = formatDistance(nice);
  };

  const drawReadout = () => {
    if (!world || (!pointer && !marker)) {
      readoutEl.textContent = 'Наведите курсор на карту: покажу высоту, биом, климат и реку под ним. Щелчок закрепит точку.';
      return;
    }
    const { planet, elevation, climate, hydro } = world;
    const mpp = mppAt(planet, level);
    const width = frameSize().width;
    const height = frameSize().height;
    /* Метка важнее курсора: если человек щёлкнул, подпись закрепляется на ней. */
    const mx = marker ? marker.x : centerX + (pointer.x - width / 2) * mpp;
    const my = marker ? marker.y : centerY + (pointer.y - height / 2) * mpp;
    if (my < 0 || my > planet.heightM || mx < 0 || mx > planet.widthM) {
      readoutEl.textContent = 'За рамкой карты ничего нет: мир не замкнут, это край проекции.';
      return;
    }
    const wrapped = mx;
    const { lon, lat } = metersToGeo(planet, wrapped, my);
    const px = Math.floor(wrapped / mpp);
    const py = Math.floor(my / mpp);
    const h = elevation.sampleHeight(level, px, py);
    const grid = climate.gridFor(level, px >> 8, py >> 8);
    const index = (py & 255) * TILE + (px & 255);
    const biome = BIOMES[grid.biome[index]]?.name ?? '—';
    const parts = [
      formatGeo(lat, lon),
      h >= SEA_LEVEL ? `высота ${Math.round(heightMeters(h))} м` : `глубина ${Math.round(-heightMeters(h))} м`,
      biome,
      `${grid.temp[index]} °C`,
      `${Math.round(grid.prec[index] * (4000 / 255))} мм/год`,
    ];
    if (h >= SEA_LEVEL) {
      const widthM = hydro.widthAt(mpp, wrapped, my);
      if (widthM >= 1) parts.push(`река ${formatDistance(widthM)}`);
    } else {
      parts.push(`глубина по шкале ${h.toFixed(1)}`);
    }
    /* Солнце: где оно сейчас над этой точкой и сколько тянется день. */
    const sun = world.living.sunAt(wrapped, my);
    parts.push(sun.altitude > -0.5
      ? `солнце ${sun.altitude.toFixed(0)}°`
      : `ночь, солнце ${sun.altitude.toFixed(0)}°`);
    parts.push(`день ${sun.dayLength.toFixed(1)} ч`);
    parts.push(`облачность ${Math.round(world.living.weather.cloudAt(wrapped, my) * 100)} %`);
    const rain = world.living.weather.rainAt(wrapped, my);
    if (rain > 0.15) parts.push(`дождь ${rain.toFixed(1)} мм/ч`);
    /* Огни видны только там, где им положено: подпись говорит, сколько света
       приходится на эту клетку, а не «есть город или нет». */
    if (world.living.lights.at(wrapped, my) > 0.25) parts.push('огни поселения');
    /* Будущий берег: в «эпохе» видно, что тут будет через миллионы лет. */
    if (world.living.clock.ma > 0.05) {
      const future = world.living.drift.heightAt(wrapped, my);
      parts.push(`через ${world.living.clock.ma.toFixed(0)} млн лет: ${future > 0 ? `суша ${Math.round(future)} м` : `море ${Math.round(-future)} м`}`);
    }
    readoutEl.textContent = (marker ? `● ${parts.join(' · ')}` : parts.join(' · '));
  };

  let frameHandle = 0;
  const frame = (stamp) => {
    if (disposed) return;
    frameHandle = requestAnimationFrame(frame);
    if (!world) return;
    const { tiles, living, painter: paint } = world;
    const width = frameSize().width;
    const height = frameSize().height;
    /* Время идёт от часов, а не от номера кадра: на 120 Гц сутки не должны
       бежать вдвое быстрее, чем на 60. Всплеск больше сотни миллисекунд
       (вкладка была свёрнута) не переносим — иначе мир прыгнет. */
    const now = typeof stamp === 'number' ? stamp : Date.now();
    const dtMs = lastFrameAt ? Math.min(now - lastFrameAt, 100) : 16;
    lastFrameAt = now;
    const dt = dtMs / 1000;

    clock.tick(dt);
    living.advance(dt);
    /* Ход после перетаскивания: карта не останавливается как вкопанная, а
       доезжает и мягко затухает. */
    if (inertia) {
      centerX -= inertia.vx * dt;
      centerY -= inertia.vy * dt;
      const decay = Math.exp(-dt / 0.22);
      inertia.vx *= decay;
      inertia.vy *= decay;
      if (Math.hypot(inertia.vx, inertia.vy) < 40) inertia = null;
      clampCenter();
    }
    /* Приближение идёт ступенями по уровню, но с паузой: колесо накапливает
       цель, а кадр ведёт к ней — так прыжок через пять уровней не мигает. */
    if (level !== zoomTarget) {
      zoomAccumulator += dtMs;
      const pace = Math.abs(zoomTarget - level) > 3 ? 22 : 52;
      /* Первая ступень — сразу: на щелчок по кнопке карта обязана ответить в
         тот же кадр, а дальше ступени идут в своём темпе. */
      if (zoomAccumulator >= pace || !zoomStepped) {
        zoomAccumulator = 0;
        zoomStepped = true;
        zoomAt(level + Math.sign(zoomTarget - level), zoomAnchor?.x, zoomAnchor?.y);
      }
    } else {
      zoomAccumulator = 0;
      zoomStepped = false;
    }

    const mpp = mppAt(world.planet, level);
    paint.setView({ level, centerX, centerY, width, height, mpp });
    paint.step(dt);
    ctx.fillStyle = '#0a1622';
    ctx.fillRect(0, 0, width, height);
    requestVisible();
    tiles.draw(ctx, { level, centerX, centerY, width, height }, scratch);
    /* Живое — поверх тайлов: облака, день и ночь, огни, частицы, вулканы. */
    paint.draw(ctx, aliveToggles);
    drawMarker(now);
    /* Сначала рисуем то, что есть, потом считаем: кадр не ждёт очереди. */
    tiles.work(9);
    living.work(5);
    drawClock();
    drawStatus();
    drawReadout();
  };

  /**
   * Метка на карте: щелчок ставит точку, вокруг неё расходятся круги.
   *
   * Круги — не украшение: они показывают, что именно эта точка закреплена в
   * подписи снизу (подпись перестаёт бегать за курсором), и по радиусу видно
   * время, прошедшее после щелчка.
   */
  const drawMarker = (now) => {
    if (!marker) return;
    const age = (now - marker.at) / 1000;
    const px = (marker.x - centerX) / (world ? mppAt(world.planet, level) : 1) + (frameSize().width) / 2;
    const py = (marker.y - centerY) / (world ? mppAt(world.planet, level) : 1) + (frameSize().height) / 2;
    if (px < -40 || py < -40 || px > (frameSize().width) + 40 || py > (frameSize().height) + 40) return;
    ctx.save();
    for (let ring = 0; ring < 3; ring += 1) {
      const phase = (age - ring * 0.55) / 1.6;
      if (phase < 0 || phase > 1) continue;
      ctx.beginPath();
      ctx.arc(px, py, 6 + phase * 46, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(126,214,255,${(1 - phase) * 0.55})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(px, py, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(178,232,255,0.95)';
    ctx.fill();
    ctx.restore();
  };

  /* ---------- управление ---------- */

  /* Центр кадра прижимается к карте по обеим осям: мир не замкнут, и за
     рамкой показывать нечего — там фон, а не продолжение с другого края. */
  const clampCenter = () => {
    if (!world) return;
    const { planet } = world;
    const mpp = mppAt(planet, level);
    const { width, height } = frameSize();
    /* Если карта целиком влезает в кадр, двигать её некуда: центр — середина
       мира. Иначе перетаскивание (и ход после него) уводило бы вид к углу, где
       карты уже нет. */
    if (width * mpp >= planet.widthM) centerX = planet.widthM / 2;
    else centerX = clamp(centerX, 0, planet.widthM);
    if (height * mpp >= planet.heightM) centerY = planet.heightM / 2;
    else centerY = clamp(centerY, 0, planet.heightM);
  };

  /** Приближение с удержанием точки под курсором. */
  const zoomAt = (nextLevel, anchorX, anchorY) => {
    if (!world) return;
    const target = clamp(nextLevel, minLevel, world.planet.maxLevel);
    if (target === level) return;
    const width = frameSize().width;
    const height = frameSize().height;
    const ax = anchorX ?? width / 2;
    const ay = anchorY ?? height / 2;
    const mpp = mppAt(world.planet, level);
    const worldX = centerX + (ax - width / 2) * mpp;
    const worldY = centerY + (ay - height / 2) * mpp;
    level = target;
    const nextMpp = mppAt(world.planet, level);
    centerX = worldX - (ax - width / 2) * nextMpp;
    centerY = worldY - (ay - height / 2) * nextMpp;
    clampCenter();
    if (world) world.tiles.setCenter(centerX, centerY);
  };

  /**
   * Приближение с намерением: цель ставится сразу, а кадр ведёт к ней
   * ступенями. Так колесо, крутящееся быстро, не рисует десяток уровней за
   * кадр — картинка едет, а не мигает.
   */
  const zoomGoal = (target, anchorX = null, anchorY = null) => {
    if (!world) return;
    zoomTarget = clamp(target, minLevel, world.planet.maxLevel);
    if (Number.isFinite(anchorX) && Number.isFinite(anchorY)) zoomAnchor = { x: anchorX, y: anchorY };
  };

  const onWheel = (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomGoal(zoomTarget + (event.deltaY < 0 ? 1 : -1), event.clientX - rect.left, event.clientY - rect.top);
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    /* Захват указателя есть не везде (jsdom, старые браузеры): без него
       перетаскивание просто оборвётся на выходе курсора из холста. */
    canvas.setPointerCapture?.(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    drag = {
      x: event.clientX,
      y: event.clientY,
      centerX,
      centerY,
      moved: 0,
      lastX: event.clientX,
      lastY: event.clientY,
      vx: 0,
      vy: 0,
      at: Date.now(),
    };
    inertia = null;
    canvas.classList.add('is-dragging');
  };

  const onPointerMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (!drag || !world) return;
    const mpp = mppAt(world.planet, level);
    const now = Date.now();
    const elapsed = Math.max(1, now - drag.at);
    /* Скорость в метрах карты в секунду: по ней кадр доезжает после отпускания.
       Ограничение — не формальность: если два события пришли в одну
       миллисекунду (быстрая мышь, разом пришедшая пачка), скорость выходит
       астрономической и кадр улетает к краю карты за один прыжок. Больше
       двух с половиной экранов в секунду карта не едет. */
    const limit = 2.5 * Math.max(frameSize().width, frameSize().height) * mpp;
    drag.vx = clamp(((event.clientX - drag.lastX) * mpp) / (elapsed / 1000), -limit, limit);
    drag.vy = clamp(((event.clientY - drag.lastY) * mpp) / (elapsed / 1000), -limit, limit);
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.at = now;
    drag.moved += Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y);
    centerX = drag.centerX - (event.clientX - drag.x) * mpp;
    centerY = drag.centerY - (event.clientY - drag.y) * mpp;
    clampCenter();
  };

  const onPointerUp = (event) => {
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (drag && world) {
      if (drag.moved < 6) {
        /* Это щелчок, а не перенос: ставим метку и закрепляем подпись на ней.
           Повторный щелчок по той же точке метку снимает — иначе её не убрать
           ничем, кроме перезагрузки мира. */
        const mpp = mppAt(world.planet, level);
        const width = frameSize().width;
        const height = frameSize().height;
        const x = centerX + (pointer.x - width / 2) * mpp;
        const y = centerY + (pointer.y - height / 2) * mpp;
        const near = marker && Math.abs((marker.x - x) / mpp) < 14 && Math.abs((marker.y - y) / mpp) < 14;
        if (near || x < 0 || y < 0 || x > world.planet.widthM || y > world.planet.heightM) marker = null;
        else marker = { x, y, at: Date.now() };
      } else if (Math.hypot(drag.vx, drag.vy) > 200) {
        inertia = { vx: drag.vx, vy: drag.vy };
      }
    }
    drag = null;
    canvas.classList.remove('is-dragging');
  };

  const onKeyDown = (event) => {
    if (event.target instanceof HTMLInputElement) return;
    const step = 120;
    const mpp = world ? mppAt(world.planet, level) : 1;
    const move = (dx, dy) => {
      centerX += dx * mpp * step;
      centerY += dy * mpp * step;
      clampCenter();
    };
    switch (event.code) {
      case 'Space':
        /* Пауза — по пробелу: время в мире идёт само, и остановить его должно
           быть проще всего. */
        flipClock();
        break;
      case 'KeyT':
        setMode(CLOCK_MODES[(CLOCK_MODES.findIndex((mode) => mode.id === clock.mode) + 1) % CLOCK_MODES.length].id);
        break;
      case 'ArrowLeft':
      case 'KeyA':
        move(-1, 0);
        break;
      case 'ArrowRight':
      case 'KeyD':
        move(1, 0);
        break;
      case 'ArrowUp':
      case 'KeyW':
        move(0, -1);
        break;
      case 'ArrowDown':
      case 'KeyS':
        move(0, 1);
        break;
      case 'Equal':
      case 'NumpadAdd':
        zoomGoal(zoomTarget + 1);
        break;
      case 'Minus':
      case 'NumpadSubtract':
        zoomGoal(zoomTarget - 1);
        break;
      case 'Escape':
        onExit?.();
        return;
      default:
        return;
    }
    event.preventDefault();
  };

  /**
   * Панель часов: подпись времени, ползунок своего масштаба и подсказка.
   *
   * Ползунок у каждого режима значит своё: в «сутках» — час, в «годе» — день
   * года, в «эпохе» — миллионы лет. Один ползунок с меняющейся шкалой честнее
   * трёх отдельных: видно, что двигаешь время, а не «что-то ещё».
   */
  const drawClock = () => {
    if (!world) return;
    const spec = clock.spec();
    clockEl.textContent = livingLabel();
    clockHint.textContent = spec.hint;
    playButton?.classList.toggle('is-running', clock.running);
    playButton?.setAttribute('aria-pressed', String(clock.running));
    if (playLabel) playLabel.textContent = clock.running ? 'Идёт' : 'Пауза';
    if (playIcon) playIcon.innerHTML = icon(clock.running ? 'pause' : 'play', 'icon--xs');
    if (clock.mode === 'day') {
      clockRange.min = '0';
      clockRange.max = '24';
      clockRange.step = '0.05';
      clockRange.value = String(clock.hour);
      clockRange.setAttribute('aria-label', 'Время суток');
    } else if (clock.mode === 'year') {
      clockRange.min = '1';
      clockRange.max = '365';
      clockRange.step = '1';
      clockRange.value = String(Math.round(clock.dayOfYear()));
      clockRange.setAttribute('aria-label', 'День года');
    } else {
      clockRange.min = '0';
      clockRange.max = '200';
      clockRange.step = '0.5';
      clockRange.value = String(Math.round(clock.ma));
      clockRange.setAttribute('aria-label', 'Миллионы лет вперёд');
    }
  };

  /** Подпись мира: сначала словами, потом числом. */
  const livingLabel = () => {
    if (clock.mode === 'epoch') return `${clock.ma.toFixed(1)} млн лет`;
    return `${dateLabel(clock.dayOfYear())} · ${hourLabel(clock.hour)}`;
  };

  const setMode = (mode) => {
    clock.setMode(mode);
    element.querySelectorAll('[data-action="mode"]').forEach((button) => {
      const active = button.dataset.mode === clock.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-checked', String(active));
    });
    if (world) materialiseDrift();
    drawClock();
  };

  /**
   * Ползунок «эпохи» может стоять где угодно: сколько лет проехать, столько и
   * едем. Назад — значит начать заново: полулагранжев перенос необратим, и
   * «отмотать» рельеф честно можно только с исходного поля.
   */
  const materialiseDrift = () => {
    if (!world) return;
    if (clock.ma <= 0) {
      world.living.drift.reset();
      return;
    }
    if (Math.abs(world.living.drift.ma() - clock.ma) > 0.5) {
      world.living.drift.reset();
      world.living.drift.enqueue(clock.ma);
    }
  };

  const flipClock = () => {
    clock.running = !clock.running;
    drawClock();
  };

  const applyLayer = () => {
    if (!world) return;
    const def = LAYERS[layerIndex];
    layerName.textContent = `${layerIndex + 1}/${LAYERS.length} · ${def.name}`;
    layerHint.textContent = def.hint;
    world.tiles.setLayer(def.id);
  };

  const flipToggle = (flag) => {
    toggles[flag] = !toggles[flag];
    const button = element.querySelector(`[data-toggle="${flag}"]`);
    button?.classList.toggle('is-on', toggles[flag]);
    button?.setAttribute('aria-pressed', String(toggles[flag]));
    world?.tiles.setOptions(toggles);
  };

  const onClick = (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'exit') {
      onExit?.();
      return;
    }
    if (action === 'zoom-in') zoomGoal(zoomTarget + 1);
    if (action === 'zoom-out') zoomGoal(zoomTarget - 1);
    if (action === 'clock-toggle') {
      flipClock();
      return;
    }
    if (action === 'mode') {
      setMode(button.dataset.mode);
      return;
    }
    if (action === 'alive') {
      const flag = button.dataset.alive;
      aliveToggles[flag] = !aliveToggles[flag];
      button.classList.toggle('is-on', aliveToggles[flag]);
      button.setAttribute('aria-pressed', String(aliveToggles[flag]));
      return;
    }
    if (action === 'resync') {
      /* Правки высот в Azgaar попадают на карту планеты только по запросу:
         пересобирать мир на каждое движение мыши значило бы терять камеру. */
      const taken = takeSource();
      if (taken) rebuild();
      else view.source = null;
      return;
    }
    if (action === 'toggle') {
      flipToggle(button.dataset.toggle);
      return;
    }
    if (action === 'new-world') {
      view.seed = String(Date.now() % 1000000);
      seedInput.value = view.seed;
      rebuild();
      return;
    }
    if (action === 'size') {
      view.size = Number(button.dataset.size);
      element.querySelectorAll('[data-action="size"]').forEach((el) => {
        const active = el === button;
        el.classList.toggle('is-active', active);
        el.setAttribute('aria-checked', String(active));
      });
      rebuild();
    }
  };

  const onRange = () => {
    layerIndex = clamp(Number(range.value) || 0, 0, LAYERS.length - 1);
    applyLayer();
  };

  /** Ползунок времени: час, день года или миллионы лет — смотря какой режим. */
  const onClockRange = () => {
    const value = Number(clockRange.value);
    if (!Number.isFinite(value)) return;
    if (clock.mode === 'day') clock.setHour(value);
    else if (clock.mode === 'year') clock.day = value;
    else {
      clock.setMa(value);
      materialiseDrift();
    }
    drawClock();
  };

  const onSeedChange = () => {
    view.seed = seedInput.value.trim() || 'mir-2026';
    rebuild();
  };

  /* ---------- сборка и пересборка ---------- */

  let buildToken = 0;
  const rebuild = () => {
    const token = ++buildToken;
    veil.hidden = false;
    world = null;
    /* Часы не сбрасываем: смена seed или размера не должна откатывать время
       на полдень — за ней смотрит человек, а не мир. */
    lastFrameAt = 0;
    try {
      buildWorld();
    } catch (error) {
      veil.hidden = true;
      view.error = error instanceof Error ? error.message : String(error);
      statusEl.textContent = `Мир не построился: ${view.error}`;
      return;
    }
    if (token !== buildToken) return;
    veil.hidden = true;
    /* Нет географии — ждём документ: генератор строит карту секунд десять, и
       снимок приходит сам, без нажатия кнопки. */
    if (!view.source) scheduleSourcePoll();
    minLevel = fitLevel(world.planet);
    level = clamp(level || minLevel, minLevel, world.planet.maxLevel);
    zoomTarget = level;
    zoomAnchor = null;
    marker = null;
    applyLayer();
    drawClock();
    seedInput.value = view.seed;
    resize();
  };

  /* ---------- монтирование ---------- */

  element.addEventListener('click', onClick);
  element.addEventListener('change', (event) => {
    if (event.target === seedInput) onSeedChange();
  });
  range.addEventListener('input', onRange);
  clockRange.addEventListener('input', onClockRange);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', () => {
    pointer = null;
  });
  window.addEventListener('keydown', onKeyDown);
  const observer = new ResizeObserver(() => resize());
  observer.observe(element);

  /* Хост не очищаем: в нём живёт iframe с документом Azgaar. Его удаление
     заставило бы генератор карты строиться заново (секунды), поэтому вид
     кладётся поверх, а документ просто скрыт классом .is-planet. */
  host.appendChild(element);
  seedInput.value = view.seed;
  applyLayer();
  drawClock();
  /* Первый снимок — сразу при монтировании: если генератор уже достроил карту,
     мир с первого кадра берёт её географию, а не пересобирается через секунду. */
  takeSource();
  rebuild();
  resize();
  frameHandle = requestAnimationFrame(frame);

  view.dispose = () => {
    disposed = true;
    if (sourceTimer) clearTimeout(sourceTimer);
    sourceTimer = 0;
    cancelAnimationFrame(frameHandle);
    observer.disconnect();
    window.removeEventListener('keydown', onKeyDown);
    element.remove();
  };

  return view;
};
