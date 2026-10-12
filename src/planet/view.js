/* Вид планеты: плоская карта на весь экран карты.

   Это не редактор и не игра, а рассматривание: колесо — приближение,
   перетаскивание — перенос, один ползунок перебирает двадцать слоёв, от рельефа
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
  const ctx = canvas.getContext('2d', { alpha: false });
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
    world = { planet, elevation: elev, climate: cli, hydro: water, tiles: tileCache };
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
      elevation: elev.stats(),
      climate: cli.stats(),
      hydro: water.stats(),
    });
    return world;
  };

  /** Уровень, на котором мир целиком влезает в кадр. */
  const fitLevel = (planet) => {
    const widthPx = canvas.clientWidth || 1200;
    for (let l = 0; l <= planet.maxLevel; l += 1) {
      if (levelPixels(planet, l).w <= widthPx) return l;
    }
    return planet.maxLevel;
  };

  /* ---------- кадр ---------- */

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = element.clientWidth || 960;
    const height = element.clientHeight || 600;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (world) {
      minLevel = fitLevel(world.planet);
      level = clamp(level, minLevel, world.planet.maxLevel);
    }
  };

  const requestVisible = () => {
    if (!world) return;
    const { planet, tiles } = world;
    const mpp = mppAt(planet, level);
    const width = canvas.clientWidth || 960;
    const height = canvas.clientHeight || 600;
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
    statusEl.textContent = [
      `${(planet.widthM / 1000).toFixed(0)} × ${(planet.heightM / 1000).toFixed(0)} тыс. км`,
      `${formatDistance(mpp)}/пиксель`,
      `уровень ${level} из ${planet.maxLevel}`,
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
    if (!world || !pointer) {
      readoutEl.textContent = 'Наведите курсор на карту: покажу высоту, биом, климат и реку под ним.';
      return;
    }
    const { planet, elevation, climate, hydro } = world;
    const mpp = mppAt(planet, level);
    const width = canvas.clientWidth || 960;
    const height = canvas.clientHeight || 600;
    const mx = centerX + (pointer.x - width / 2) * mpp;
    const my = centerY + (pointer.y - height / 2) * mpp;
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
    readoutEl.textContent = parts.join(' · ');
  };

  let frameHandle = 0;
  const frame = () => {
    if (disposed) return;
    frameHandle = requestAnimationFrame(frame);
    if (!world) return;
    const { tiles } = world;
    const width = canvas.clientWidth || 960;
    const height = canvas.clientHeight || 600;
    ctx.fillStyle = '#0a1622';
    ctx.fillRect(0, 0, width, height);
    requestVisible();
    tiles.draw(ctx, { level, centerX, centerY, width, height }, scratch);
    /* Сначала рисуем то, что есть, потом считаем: кадр не ждёт очереди. */
    tiles.work(10);
    drawStatus();
    drawReadout();
  };

  /* ---------- управление ---------- */

  /* Центр кадра прижимается к карте по обеим осям: мир не замкнут, и за
     рамкой показывать нечего — там фон, а не продолжение с другого края. */
  const clampCenter = () => {
    if (!world) return;
    const { planet } = world;
    centerX = clamp(centerX, 0, planet.widthM);
    centerY = clamp(centerY, 0, planet.heightM);
  };

  /** Приближение с удержанием точки под курсором. */
  const zoomAt = (nextLevel, anchorX, anchorY) => {
    if (!world) return;
    const target = clamp(nextLevel, minLevel, world.planet.maxLevel);
    if (target === level) return;
    const width = canvas.clientWidth || 960;
    const height = canvas.clientHeight || 600;
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

  const onWheel = (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAt(level + (event.deltaY < 0 ? 1 : -1), event.clientX - rect.left, event.clientY - rect.top);
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    /* Захват указателя есть не везде (jsdom, старые браузеры): без него
       перетаскивание просто оборвётся на выходе курсора из холста. */
    canvas.setPointerCapture?.(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    drag = { x: event.clientX, y: event.clientY, centerX, centerY };
    canvas.classList.add('is-dragging');
  };

  const onPointerMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (!drag || !world) return;
    const mpp = mppAt(world.planet, level);
    centerX = drag.centerX - (event.clientX - drag.x) * mpp;
    centerY = drag.centerY - (event.clientY - drag.y) * mpp;
    clampCenter();
  };

  const onPointerUp = (event) => {
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
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
        zoomAt(level + 1);
        break;
      case 'Minus':
      case 'NumpadSubtract':
        zoomAt(level - 1);
        break;
      case 'Escape':
        onExit?.();
        return;
      default:
        return;
    }
    event.preventDefault();
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
    if (action === 'zoom-in') zoomAt(level + 1);
    if (action === 'zoom-out') zoomAt(level - 1);
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
    applyLayer();
    seedInput.value = view.seed;
    resize();
  };

  /* ---------- монтирование ---------- */

  element.addEventListener('click', onClick);
  element.addEventListener('change', (event) => {
    if (event.target === seedInput) onSeedChange();
  });
  range.addEventListener('input', onRange);
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
