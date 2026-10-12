/* ===========================================================
   Анимация создания карты: ход генерации и плавное появление.

   Azgaar строит карту в одном длинном проходе по шагам конвейера
   (GenerationPipeline, 40 шагов). Его собственная загрузка видна
   только для очень плотных сеток, поэтому для обычных размеров
   пользователь видит пустой экран. Здесь мы:

   • подменяем шаги конвейера из родительского окна: до и после каждого
     шага обновляем подпись и полосу прогресса в самом iframe;
   • между шагами отдаём управление браузеру (setTimeout 0) — иначе
     подписи не успели бы отрисоваться: шаги синхронные;
   • по завершении проигрываем появление карты.

   Мы не меняем сами шаги и результат: только наблюдаем за ними.
   Событие с номером шага уходит в onEvent — его берёт синхронизация
   лобби, чтобы показать игрокам прогресс мастера.
   =========================================================== */

const PATCHED = '__mirStage';
const VEIL_ID = 'mir-gen-veil';
const STYLE_ID = 'mir-gen-style';
/* Сколько ждём, пока в iframe появится конвейер. Документ Azgaar
   поднимается за секунды, так что дольше — это уже сбой. */
const ATTACH_DEADLINE_MS = 120_000;

/* Подписи шагов — по-русски, как в остальном интерфейсе. Неизвестный
   идентификатор показываем как есть, чтобы новый шаг не потерялся. */
export const GENERATION_STEP_LABELS = {
  grid: 'Сетка ячеек',
  heightmap: 'Высоты рельефа',
  markupGrid: 'Суша и море',
  depressionLakes: 'Глубокие впадины',
  nearSeaLakes: 'Озёра у побережья',
  mapSize: 'Размер карты',
  temperatures: 'Температура',
  precipitation: 'Осадки',
  clearPack: 'Подготовка упаковки',
  clearGraphOverride: 'Сброс ручных правок',
  regraph: 'Пересборка ячеек',
  markupPack: 'Разметка ячеек',
  defaultRuler: 'Линейка',
  rivers: 'Реки',
  biomes: 'Биомы',
  featureGroups: 'Группы объектов',
  ice: 'Ледники',
  goods: 'Товары',
  rankCells: 'Плотность населения',
  cultures: 'Культуры',
  culturesExpand: 'Расселение культур',
  burgs: 'Города',
  states: 'Государства',
  routes: 'Торговые пути',
  religions: 'Религии',
  burgsSpecify: 'Детали городов',
  stateStatistics: 'Статистика государств',
  stateForms: 'Формы правления',
  provinces: 'Провинции',
  provincePoles: 'Центры провинций',
  riversSpecify: 'Детали рек',
  featureNames: 'Названия объектов',
  markets: 'Рынки',
  production: 'Производство',
  taxes: 'Налоги',
  military: 'Военные силы',
  markers: 'Маркеры',
  zones: 'Зоны',
  addedLabels: 'Надписи',
  journeys: 'Маршруты путешествий',
};

export const generationStepLabel = (id) => GENERATION_STEP_LABELS[id] ?? String(id);

const STYLE = `
#mir-gen-veil{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(ellipse at center,#16221f 0%,#0a0f0e 72%);color:#dbe8df;
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;opacity:0;pointer-events:none;transition:opacity .7s ease}
#mir-gen-veil.is-on{opacity:1;pointer-events:auto}
.mir-gen-box{display:grid;justify-items:center;gap:14px;width:min(78vw,300px);text-align:center}
.mir-gen-seal{width:44px;height:44px;animation:mir-gen-spin 7s linear infinite}
@keyframes mir-gen-spin{to{transform:rotate(360deg)}}
.mir-gen-stage{margin:0;min-height:14px;font-size:11px;font-weight:500;letter-spacing:.26em;text-transform:uppercase;color:#c9dccd}
.mir-gen-count{margin:0;font-size:10px;letter-spacing:.2em;color:rgba(201,220,205,.55);font-variant-numeric:tabular-nums}
.mir-gen-track{width:100%;height:2px;background:rgba(201,220,205,.14);overflow:hidden}
.mir-gen-fill{display:block;height:100%;width:0;background:linear-gradient(90deg,rgba(216,193,132,.3),rgba(216,193,132,.95))}
#map.mir-reveal{animation:mir-reveal 1.2s cubic-bezier(.2,.7,.2,1) both}
@keyframes mir-reveal{from{opacity:0;filter:blur(10px);transform:scale(1.02)}to{opacity:1;filter:none;transform:none}}
@media (prefers-reduced-motion:reduce){.mir-gen-seal{animation:none}#map.mir-reveal{animation:none}}
`;

const ensureVeil = (doc) => {
  const existing = doc.getElementById(VEIL_ID);
  if (existing) return existing;
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLE;
    (doc.head || doc.documentElement).append(style);
  }
  const veil = doc.createElement('div');
  veil.id = VEIL_ID;
  veil.setAttribute('role', 'status');
  veil.setAttribute('aria-live', 'polite');
  veil.innerHTML = `
    <div class="mir-gen-box">
      <svg class="mir-gen-seal" viewBox="0 0 24 24" fill="none" stroke="#e9e9ec" stroke-width="1.2" stroke-linecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="2.4" fill="#e9e9ec" stroke="none"/>
        <path d="M12 1.6v2.6M12 19.8v2.6M1.6 12h2.6M19.8 12h2.6"/>
      </svg>
      <p class="mir-gen-stage"></p>
      <p class="mir-gen-count"></p>
      <div class="mir-gen-track"><i class="mir-gen-fill"></i></div>
    </div>`;
  (doc.body || doc.documentElement).append(veil);
  return veil;
};

const showVeil = (doc, { stage, count, ratio }) => {
  const veil = ensureVeil(doc);
  veil.querySelector('.mir-gen-stage').textContent = stage;
  veil.querySelector('.mir-gen-count').textContent = count;
  veil.querySelector('.mir-gen-fill').style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
  veil.classList.add('is-on');
};

const hideVeil = (doc, { reveal }) => {
  const veil = doc.getElementById(VEIL_ID);
  veil?.classList.remove('is-on');
  if (!reveal) return;
  const map = doc.getElementById('map');
  if (!map) return;
  /* Перезапуск анимации: класс снимаем, даём браузеру отметить это, ставим снова. */
  map.classList.remove('mir-reveal');
  void map.getBoundingClientRect();
  map.classList.add('mir-reveal');
  map.addEventListener('animationend', () => map.classList.remove('mir-reveal'), { once: true });
};

/* Подмена конвейера в окне iframe. Возвращает true, если подмена прошла. */
const patchPipeline = (win, onEvent) => {
  const pipeline = win.GenerationPipeline;
  if (!pipeline || typeof pipeline.run !== 'function' || pipeline[PATCHED]) return false;
  pipeline[PATCHED] = true;

  const doc = win.document;
  const steps = Array.isArray(pipeline.steps) ? pipeline.steps : [];
  const total = Math.max(1, steps.length);
  const pause = () => new Promise((resolve) => win.setTimeout(resolve, 0));

  steps.forEach((step, index) => {
    if (!step || typeof step.run !== 'function' || step[PATCHED]) return;
    step[PATCHED] = true;
    const original = step.run;
    step.run = async (context) => {
      const label = generationStepLabel(step.id);
      showVeil(doc, { stage: label, count: `${index + 1} / ${total}`, ratio: index / total });
      onEvent({ type: 'step', index, total, id: step.id, label });
      await pause();
      return original(context);
    };
  });

  const originalRun = pipeline.run;
  pipeline.run = function runWithStage(...args) {
    onEvent({ type: 'start', total });
    showVeil(doc, { stage: 'Подготовка', count: `0 / ${total}`, ratio: 0 });
    return originalRun.apply(this, args).then(
      (value) => {
        /* Карта в редакторе появляется после конвейера (registerMap и
           подгонка вида — синхронно сразу после него). Событие — после них. */
        win.setTimeout(() => {
          onEvent({ type: 'done' });
          hideVeil(doc, { reveal: true });
        }, 0);
        return value;
      },
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        onEvent({ type: 'error', message });
        hideVeil(doc, { reveal: false });
        throw error;
      },
    );
  };
  return true;
};

/* Скрипт, который вставляется в <head> документа Azgaar раньше всех его
   скриптов (см. injectGenerationHook). Он перехватывает присваивание
   window.GenerationPipeline и сразу сообщает родителю — до первого запуска
   генерации. Без него первый шаг (сетка) шёл бы без анимации. */
const GENERATION_HOOK = `<script>(function(){var f=window.frameElement;var v;try{Object.defineProperty(window,"GenerationPipeline",{configurable:true,get:function(){return v},set:function(x){v=x;if(f&&typeof f.__mirStagePipeline==="function")f.__mirStagePipeline(window)}})}catch(e){}})();</script>`;

/** Вставляет перехватчик первым в <head>. Без <head> HTML возвращается как есть. */
export const injectGenerationHook = (html) => {
  const match = /<head[^>]*>/i.exec(html);
  if (!match) return html;
  const at = match.index + match[0].length;
  return html.slice(0, at) + GENERATION_HOOK + html.slice(at);
};

const COVER_CLASS = 'world-editor-cover';
/* Накладка на хосте iframe: закрывает документ Azgaar, пока он поднимается
   и до первого шага генерации. Снимается, как только пришло первое событие. */
const COVER_DEADLINE_MS = 30_000;

const showCover = (frame) => {
  const host = frame.parentElement;
  if (!host) return null;
  const cover = document.createElement('div');
  cover.className = COVER_CLASS;
  cover.setAttribute('role', 'status');
  cover.setAttribute('aria-label', 'Подготовка карты');
  cover.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M12 1.6v2.6M12 19.8v2.6M1.6 12h2.6M19.8 12h2.6"/></svg>';
  host.append(cover);
  return cover;
};

/* Состояние подключения на каждый iframe. Слушателей может быть несколько:
   анимация в createEditorFrame и синхронизация лобби подписываются
   независимо, а конвейер подменяется один раз. */
const STAGE = new WeakMap();

const removeCover = (state) => {
  if (!state.cover) return;
  state.cover.remove();
  state.cover = null;
};

const emitStage = (state, event) => {
  if (event.type === 'start' || event.type === 'step' || event.type === 'error') removeCover(state);
  for (const listener of [...state.listeners]) {
    try {
      listener(event);
    } catch (error) {
      console.error('Событие карты не обработано', error);
    }
  }
};

const startStage = (frame) => {
  const state = { listeners: new Set(), watching: null, timer: 0, cover: null, coverTimer: 0 };
  const deadline = Date.now() + ATTACH_DEADLINE_MS;

  const tryWindow = (win) => {
    if (!win || win === state.watching || !win.GenerationPipeline) return false;
    if (patchPipeline(win, (event) => emitStage(state, event))) {
      state.watching = win;
      return true;
    }
    return false;
  };

  /* Перехватчик из srcdoc зовёт сюда, как только появляется конвейер. */
  frame.__mirStagePipeline = (win) => tryWindow(win);

  const poll = () => {
    state.timer = 0;
    if (tryWindow(frame.contentWindow) || Date.now() > deadline) return;
    state.timer = setTimeout(poll, 16);
  };

  /* Документ могли заменить (srcdoc → загрузка): подключаемся к новому окну. */
  frame.addEventListener('load', () => tryWindow(frame.contentWindow));

  /* Накладка появляется, когда iframe уже вставлен в страницу. */
  state.coverTimer = setTimeout(() => {
    state.cover = showCover(frame);
    setTimeout(() => removeCover(state), COVER_DEADLINE_MS);
  }, 0);

  poll();
  return state;
};

/**
 * Подключает анимацию к iframe с редактором и (необязательно) слушателя
 * событий хода генерации. Можно вызывать сколько угодно раз для одного iframe.
 * Возвращает функцию отписки слушателя.
 *
 * Два пути подключения: перехватчик из srcdoc (вызывает сам документ, как
 * только появляется конвейер) и опрос окна — для документа по адресу /fmg/.
 *
 * @param {HTMLIFrameElement} frame
 * @param {{ onEvent?: (event: object) => void }} [options]
 *   Событие: { type: 'start', total } | { type: 'step', index, total, id, label }
 *          | { type: 'done' } | { type: 'error', message }
 */
export const attachGenerationStage = (frame, { onEvent } = {}) => {
  let state = STAGE.get(frame);
  if (!state) {
    state = startStage(frame);
    STAGE.set(frame, state);
  }
  if (!onEvent) return () => {};
  state.listeners.add(onEvent);
  return () => state.listeners.delete(onEvent);
};

/** Подпись в накладке iframe вне генерации (например, загрузка карты мастера). */
export const showEditorStage = (frame, stage) => {
  const doc = frame.contentDocument;
  if (doc?.body) showVeil(doc, { stage, count: '', ratio: 0 });
};

/** Снимает накладку, показанную showEditorStage. Без появления карты. */
export const hideEditorStage = (frame) => {
  const doc = frame.contentDocument;
  if (doc?.body) hideVeil(doc, { reveal: false });
};
