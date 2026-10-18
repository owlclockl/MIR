/* Накладка генерации карты: подключение к конвейеру Azgaar, ход шагов и
   появление. Запуск: `npm run test:stage` (jsdom ставится разово:
   npm i --no-save jsdom).

   Что проверяется и почему именно это: Azgaar строит карту одним длинным
   проходом по шагам конвейера, а родитель подменяет шаги, чтобы показать ход
   («Сетка ячеек → … → Маршруты путешествий»), прогресс и появление карты —
   src/game/generation-stage.js. Ошибки здесь видны только глазами, поэтому
   проверяем то, что глазами не увидеть с первого раза: какие события приходят
   и в каком порядке, что попадает в разметку накладки, снимается ли она и
   какими классами помечены движение и «тихий режим». CSS-анимаций jsdom не
   считает — но решение о движении видно именно в классах, и его проверяем.

   Динамика: тумблер «Анимации» в настройках игры — класс `reduce-motion` на
   `<html>` родителя. Накладка живёт в документе iframe, поэтому CSS-правило
   родителя её не достаёт: проверяем, что выключенные анимации гасят и
   вертушку (`sages-gen-quiet`), и появление карты (без `sages-reveal`). */

import './lib/root.mjs';

let JSDOM;
let VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = await import('jsdom'));
} catch {
  console.error('Нет jsdom. Поставьте его разово: npm i --no-save jsdom');
  process.exit(1);
}

/* Русское согласование числительного: «31 проверка», а не «31 проверок». */
const plural = (n, one, few, many) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const checks = [];
const add = (ok, what, detail = '') => checks.push({ ok: Boolean(ok), what, detail });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const consoleErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => consoleErrors.push(`jsdomError: ${error?.message}`));
virtualConsole.on('error', (message) => consoleErrors.push(`console.error: ${message}`));

const page = `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head>
<body><div class="world-editor" data-role="world-editor-host"></div></body></html>`;

const dom = new JSDOM(page, { pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole });
const { window } = dom;

/* Модули игры читают глобальный document — даём им окно jsdom тем же способом,
   каким это делает test:ui. */
const STAGE_GLOBALS = ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'MutationObserver'];
for (const name of STAGE_GLOBALS) {
  if (window[name] === undefined) continue;
  try {
    Object.defineProperty(globalThis, name, { value: window[name], configurable: true, writable: true });
  } catch {
    void name;
  }
}

const { injectGenerationHook, generationStepLabel, attachGenerationStage, showEditorStage, hideEditorStage } =
  await import('../src/game/generation-stage.js');

/** Кадр редактора для проверок: пара «окно + документ» вместо настоящего
    iframe. Внутри — свой jsdom: накладка живёт именно в документе Azgaar, а не
    на странице игры, и это отличие здесь и проверяется. Конвейер каждый тест
    кладёт свой: подмена читает `win.GenerationPipeline`. */
const frame = () => {
  const inner = new JSDOM('<!doctype html><html><head></head><body><div id="map"></div></body></html>', {
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const win = inner.window;
  const doc = win.document;
  const element = { contentWindow: win, contentDocument: doc, parentElement: null, addEventListener() {} };
  return { inner, win, doc, element };
};

/* ---------- 1. Перехватчик и подписи шагов ---------- */

const hooked = injectGenerationHook('<html><head><script src="azgaar.js"></script></head><body></body></html>');

add(
  hooked.indexOf('GenerationPipeline') > -1 && hooked.indexOf('GenerationPipeline') < hooked.indexOf('azgaar.js'),
  'перехватчик стоит раньше скриптов Azgaar',
  'иначе первый шаг (сетка) шёл бы без подписи',
);

const noHead = '<html><body>без головы</body></html>';
add(injectGenerationHook(noHead) === noHead, 'HTML без <head> возвращается как есть');

add(generationStepLabel('grid') === 'Сетка ячеек', 'шаг конвейера подписан по-русски', generationStepLabel('grid'));
add(
  generationStepLabel('новыйШаг') === 'новыйШаг',
  'незнакомый шаг показывается как есть, а не теряется',
);

/* ---------- 2. Ход генерации: события, разметка, порядок ---------- */

const scene = frame();
const stepsDone = [];
const seenInside = [];

scene.win.GenerationPipeline = {
  steps: [
    {
      id: 'grid',
      run: () => {
        stepsDone.push('grid');
        const veil = scene.doc.getElementById('sages-gen-veil');
        seenInside.push({
          stage: veil?.querySelector('.sages-gen-stage')?.textContent ?? '',
          count: veil?.querySelector('.sages-gen-count')?.textContent ?? '',
          on: veil?.classList.contains('is-on') ?? false,
          quiet: veil?.classList.contains('sages-gen-quiet') ?? false,
          fill: veil?.querySelector('.sages-gen-fill')?.style.width ?? '',
        });
      },
    },
    { id: 'rivers', run: () => stepsDone.push('rivers') },
  ],
  run: async function run() {
    for (const step of this.steps) await step.run({});
    return 'карта построена';
  },
};

const events = [];
const frameEl = scene.element;
attachGenerationStage(frameEl, { onEvent: (event) => events.push(event) });
/* Вторая подписка на тот же iframe не должна подменить конвейер ещё раз. */
attachGenerationStage(frameEl, {});

const runResult = await scene.win.GenerationPipeline.run();
await tick();
await tick();

add(runResult === 'карта построена', 'результат конвейера возвращается как есть', String(runResult));

const kinds = events.map((event) => event.type);

/* Подмена обязана сохранить и результат конвейера: Azgaar возвращает из run
   собранную карту, и проглотить её значило бы сломать открытие слота. */
add(scene.win.GenerationPipeline.__sagesStage === true, 'конвейер Azgaar подменён');

add(kinds[0] === 'start' && kinds[kinds.length - 1] === 'done', 'ход генерации кончается событием «готово»', kinds.join(' → '));
add(
  kinds.filter((kind) => kind === 'step').length === 2 && kinds.filter((kind) => kind === 'start').length === 1,
  'каждый шаг сообщает о себе ровно раз',
  `шагов ${kinds.filter((kind) => kind === 'step').length}, стартов ${kinds.filter((kind) => kind === 'start').length}`,
);
add(
  events.find((event) => event.type === 'step')?.label === 'Сетка ячеек' &&
    events.find((event) => event.type === 'step')?.total === 2,
  'событие шага несёт подпись и общее число шагов',
  events.find((event) => event.type === 'step')?.label ?? '',
);
add(stepsDone.join(',') === 'grid,rivers', 'шаги выполняются по порядку и не пропускаются', stepsDone.join(','));
add(
  seenInside[0]?.stage === 'Сетка ячеек' && seenInside[0]?.count === '1 / 2',
  'подпись и счётчик попадают в разметку накладки',
  `${seenInside[0]?.stage} · ${seenInside[0]?.count}`,
);
add(seenInside[0]?.on === true, 'на время шага накладка видна');
add(seenInside[0]?.fill === '0%' && seenInside[1] === undefined, 'полоса прогресса начинается с нуля', seenInside[0]?.fill ?? '');

const veilAfter = scene.doc.getElementById('sages-gen-veil');
add(veilAfter?.classList.contains('is-on') === false, 'после готовности накладка снята');

/* ---------- 3. Динамика: тумблер «Анимации» в игре ---------- */

add(
  scene.doc.getElementById('map')?.classList.contains('sages-reveal') === true,
  'включённые анимации — карта появляется',
  'класс появления на #map',
);
add(veilAfter?.classList.contains('sages-gen-quiet') === false, 'включённые анимации — вертушка играет');

/* Выключаем настройку на живом экране: следующий прогон обязан стать тихим. */
window.document.documentElement.classList.add('reduce-motion');
scene.doc.getElementById('map').classList.remove('sages-reveal');
seenInside.length = 0;
events.length = 0;

await scene.win.GenerationPipeline.run();
await tick();
await tick();

add(seenInside[0]?.quiet === true, 'выключенные анимации — вертушка встаёт', `quiet=${seenInside[0]?.quiet}`);
add(
  scene.doc.getElementById('map')?.classList.contains('sages-reveal') !== true,
  'выключенные анимации — карта появляется без анимации',
);
add(
  events.some((event) => event.type === 'done'),
  'переключение настройки не мешает ходу генерации',
  events.map((event) => event.type).join(' → '),
);

window.document.documentElement.classList.remove('reduce-motion');

/* ---------- 4. Ошибка конвейера ---------- */

const failed = frame();
failed.win.GenerationPipeline = {
  steps: [{ id: 'grid', run: () => {} }],
  run: async function run() {
    throw new Error('сетка не сошлась');
  },
};

const failEvents = [];
attachGenerationStage(failed.element, { onEvent: (event) => failEvents.push(event) });

let thrown = '';
try {
  await failed.win.GenerationPipeline.run();
} catch (error) {
  thrown = error instanceof Error ? error.message : String(error);
}

await tick();
await tick();

add(
  failEvents.some((event) => event.type === 'error' && String(event.message).includes('сетка не сошлась')),
  'ошибка конвейера доходит до экрана человека',
  thrown,
);
add(
  failed.doc.getElementById('sages-gen-veil')?.classList.contains('is-on') === false,
  'после ошибки накладка снята, а карта не «появляется»',
);
add(failed.doc.getElementById('map')?.classList.contains('sages-reveal') !== true, 'после ошибки появления нет');

/* ---------- 5. Накладка вне генерации ---------- */

const manual = frame();
showEditorStage(manual.element, 'Карта мастера');

add(
  manual.doc.querySelector('.sages-gen-stage')?.textContent === 'Карта мастера',
  'подпись вне генерации показывается в накладке',
);

hideEditorStage(manual.element);

add(
  manual.doc.getElementById('sages-gen-veil')?.classList.contains('is-on') === false &&
    manual.doc.getElementById('map')?.classList.contains('sages-reveal') !== true,
  'снятие накладки вне генерации не играет появление',
);

add(consoleErrors.length === 0, 'страница не сообщила об ошибках', consoleErrors.slice(0, 2).join(' | '));

console.log('Накладка генерации: ход шагов, ошибка, динамика\n');

let bad = 0;
for (const check of checks) {
  console.log(`${check.ok ? ' ✓' : ' ×'} ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);
  if (!check.ok) bad += 1;
}

console.log('');
if (bad) {
  console.log(
    `НАКЛАДКА ГЕНЕРАЦИИ ЛОМАЕТСЯ: не прошло ${plural(bad, 'проверка', 'проверки', 'проверок')} — ${bad} из ${checks.length}.`,
  );
  scene.win.close();
  failed.win.close();
  manual.win.close();
  window.close();
  process.exit(1);
}

console.log(`ВСЁ ХОРОШО — ${checks.length} ${plural(checks.length, 'проверка', 'проверки', 'проверок')} накладки генерации.`);
scene.win.close();
failed.win.close();
manual.win.close();
window.close();
process.exit(0);
