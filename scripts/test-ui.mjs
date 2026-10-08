/* Смоук-проверка интерфейса: настоящий `mir.html` открывается в jsdom,
   и по нему кликают, как человек, — генератор мира, окна меню и настройки,
   общий хаб, подключение по адресу, регистрацию, профиль и отключение.

   Зачем: собранный файл — это то, что получает игрок. Проверки логики
   (`test:hub`, `test:p2p`) не видят разметку, а опечатка в обработчике
   ломает именно её, и молча.

   Запуск:
     npm run build && npm run single
     npm run host:dev                 (или web preview с API и dist/)
     npm i --no-save jsdom            (разово: jsdom нужен только здесь)
     npm run test:ui -- http://127.0.0.1:4173

   Адрес сервера можно задать аргументом: `npm run test:ui -- http://127.0.0.1:4173`. */

import { readFileSync } from 'node:fs';
import { fromRoot } from './lib/root.mjs';

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.error('Нет jsdom. Поставьте его разово: npm i --no-save jsdom');
  process.exit(1);
}

const HUB = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/+$/, '');

/* Подставные «новости о сборке»: страница обязана решить, что на сервере
   вышла новая версия, и сказать об этом — не перезагружая игру сама. */
const SERVER_BUILD = { version: '99.0.0', build: 'deadbeef' };
const fetchStub = (w) => (input, init) =>
  String(input).includes('mir-build.json')
    ? Promise.resolve({ ok: true, json: async () => ({ ...SERVER_BUILD, builtAt: '' }) })
    : globalThis.fetch(input, init);

const html = readFileSync(fromRoot('mir.html'), 'utf8');
const testCanvasContext = () => ({
  createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
  createLinearGradient: () => ({ addColorStop() {} }),
  clearRect() {}, fillRect() {}, drawImage() {}, putImageData() {},
  save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
  stroke() {}, strokeRect() {}, strokeText() {}, arc() {}, fill() {}, fillText() {},
});
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://127.0.0.1:9999/',   // «страница» не хаб: его на этом порту нет
  pretendToBeVisual: true,
  /* fetch нужен уже на старте: приложение сразу проверяет новую сборку. */
  beforeParse(w) {
    w.fetch = fetchStub(w);
    w.HTMLCanvasElement.prototype.getContext = function () {
      return this.__testCanvasContext ??= testCanvasContext();
    };
  },
});
const { window } = dom;
window.HTMLMediaElement.prototype.play = () => Promise.resolve(); // jsdom не декодирует звуки
window.HTMLMediaElement.prototype.pause = () => {};
window.fetch = fetchStub(window);           // jsdom без fetch — отдаём ему node-овский
window.AbortSignal = globalThis.AbortSignal;
window.crypto.subtle = globalThis.crypto.subtle;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* Отдельная «страница» на том же mir.html — для проверок перезагрузки:
   браузер отдаёт ей ту же localStorage, что была у прошлой страницы. */
const bootPage2 = (saved, pageUrl = `${HUB}/`) => {
  const origin = new URL(pageUrl).origin;
  return new JSDOM(html, {
    runScripts: 'dangerously',
    url: pageUrl,
    pretendToBeVisual: true,
    beforeParse(w) {
      w.HTMLMediaElement.prototype.play = () => Promise.resolve();
      w.HTMLMediaElement.prototype.pause = () => {};
      /* В браузере относительные запросы (хаб «у себя») ходят на адрес
         страницы; fetch из Node так не умеет — подставляем origin. */
      w.fetch = (input, init) => globalThis.fetch(new URL(String(input), origin).href, init);
      w.AbortSignal = globalThis.AbortSignal;
      w.crypto.subtle = globalThis.crypto.subtle;
      for (const [key, value] of Object.entries(saved ?? {})) w.localStorage.setItem(key, value);
    },
  });
};

const dumpStorage = (w) => {
  const out = {};
  for (let i = 0; i < w.localStorage.length; i += 1) {
    const key = w.localStorage.key(i);
    out[key] = w.localStorage.getItem(key);
  }
  return out;
};

/* Хаб пускает 10 регистраций в минуту с одного адреса — это защита от
   чужих, а не от проверки. Если проверку запустили сразу после такой же
   (или после `test:hub`), регистрация упирается в лимит: ждём окно и
   повторяем, но так же не проходим дальше, если ошибка другая.
   count() и submit() — чтобы работать и в основном окне, и в отдельном. */
const registerWithRetry = async ({ count, submit, name, tries = 4 }) => {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    submit(name);
    await wait(2500);
    const profile = count('.profile')?.textContent || '';
    if (profile.includes(name)) return true;
    const error = count('[data-role="form-error"]')?.textContent || '';
    if (!/Слишком много запросов/.test(error)) return false;
    console.log('  · лимит регистраций хаба: ждём 20 секунд и пробуем снова');
    await wait(20_000);
  }
  return false;
};
const $ = (sel) => window.document.querySelector(sel);
const $$ = (sel) => [...window.document.querySelectorAll(sel)];
const click = (sel) => {
  const el = $(sel);
  if (!el) throw new Error(`нет элемента ${sel}`);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
};
let bad = 0;
const ok = (what, cond, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ×'} ${what}${detail ? ` — ${detail}` : ''}`);
  if (!cond) bad += 1;
};

const errors = [];
window.addEventListener('error', (e) => errors.push(e.message));
window.onerror = (m) => errors.push(String(m));

await wait(2200); // даём завершиться стартовой проверке текущего адреса-хаба

/* Веб/PWA-раздача содержит отдельную полноценную Azgaar-страницу; однофайловый
   jsdom выше проверит, что mir.html не показывает для неё битую кнопку. */
const fmgResponse = await fetch(`${HUB}/fmg/index.html?seed=MIR-UI-TEST`);
const fmgHtml = fmgResponse.ok ? await fmgResponse.text() : '';
const fmgScript = fmgHtml.match(/src="(\/fmg\/[^\"]+\.js)"/)?.[1];
const fmgScriptResponse = fmgScript ? await fetch(new URL(fmgScript, `${HUB}/`).href) : null;
const fmgThemeResponse = await fetch(`${HUB}/fmg/mir-theme.css`);
const fmgStyleResponse = await fetch(`${HUB}/fmg/styles/night.json`);
const fmgWorkerResponse = await fetch(`${HUB}/fmg/sw.js`);
const mirWorkerResponse = await fetch(`${HUB}/sw.js`);
const mirWorker = mirWorkerResponse.ok ? await mirWorkerResponse.text() : '';
ok('сервер раздаёт полноэкранный Azgaar FMG и его входной модуль', fmgResponse.ok && Boolean(fmgScriptResponse?.ok) && fmgHtml.includes('MIR — Azgaar Fantasy Map Generator'));
ok('веб-редактор получает MIR-тему и ночную картографическую палитру', fmgThemeResponse.ok && fmgStyleResponse.ok);
ok('FMG не регистрирует вложенный worker, общий worker MIR обслуживает offline-страницу', fmgWorkerResponse.status === 404 && mirWorker.includes("'/fmg/index.html'") && mirWorker.includes('ignoreSearch: url.pathname.startsWith'));

/* Веб-бандл открываем отдельно от mir.html: проверяем, что полноэкранный
   iframe действительно остаётся тем же документом при возврате в атлас. */
const webIndex = readFileSync(fromRoot('dist/index.html'), 'utf8');
const webScriptPath = webIndex.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1]?.replace(/^\//, '');
if (!webScriptPath) throw new Error('В dist/index.html не найден входной модуль веб-сборки');
const webCode = readFileSync(fromRoot(`dist/${webScriptPath}`), 'utf8');
const webMarkup = webIndex
  .replace(/<script type="module"[^>]*src="[^"]+"[^>]*><\/script>/, '')
  .replace('</body>', `<script>${webCode.replaceAll('</script', '<\\/script')}</script>\n  </body>`);
const webDom = new JSDOM(webMarkup, {
  runScripts: 'dangerously',
  url: `${HUB}/?fmg-smoke=${Date.now()}`,
  pretendToBeVisual: true,
  beforeParse(w) {
    w.fetch = (input, init) => fetchStub(w)(new URL(String(input), w.location.href).href, init);
    w.HTMLCanvasElement.prototype.getContext = function () {
      return this.__testCanvasContext ??= testCanvasContext();
    };
    w.AbortSignal = globalThis.AbortSignal;
    w.crypto.subtle = globalThis.crypto.subtle;
  },
});
const webWindow = webDom.window;
webWindow.HTMLMediaElement.prototype.play = () => Promise.resolve();
webWindow.HTMLMediaElement.prototype.pause = () => {};
const webClick = (selector) => webWindow.document.querySelector(selector)?.dispatchEvent(
  new webWindow.MouseEvent('click', { bubbles: true, cancelable: true }),
);
try {
  await wait(60);
  webClick('.play-button');
  await wait(40);
  const fmgOpenButton = webWindow.document.querySelector('[data-action="world-fmg-open"]');
  ok('веб-сборка показывает кнопку полного Azgaar в атласе', Boolean(fmgOpenButton));
  fmgOpenButton?.click();
  const fmgOverlay = webWindow.document.querySelector('[data-role="world-fmg-overlay"]');
  const fmgFrame = webWindow.document.querySelector('[data-role="world-fmg-frame"]');
  const worldApp = webWindow.document.querySelector('.world-app');
  const inputSeed = webWindow.document.querySelector('[data-world-setting="seed"]')?.value;
  const frameSeed = fmgFrame && new URL(fmgFrame.getAttribute('src'), webWindow.location.href).searchParams.get('seed');
  ok('Azgaar открывается поверх атласа с тем же seed и блокирует фон', Boolean(fmgOverlay && fmgFrame) && !fmgOverlay.hidden && inputSeed === frameSeed && worldApp?.hasAttribute('inert'));
  webClick('[data-action="world-fmg-back"]');
  ok('возврат прячет FMG, не выгружая iframe', fmgOverlay?.hidden && webWindow.document.querySelector('[data-role="world-fmg-frame"]') === fmgFrame && !worldApp?.hasAttribute('inert'));
  webClick('[data-action="world-fmg-open"]');
  ok('повторное открытие сохраняет тот же документ Azgaar', webWindow.document.querySelector('[data-role="world-fmg-frame"]') === fmgFrame && !fmgOverlay?.hidden);
  webWindow.document.dispatchEvent(new webWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  ok('Escape закрывает overlay, оставляя атлас на месте', fmgOverlay?.hidden && Boolean(webWindow.document.querySelector('.world-app')));
} finally {
  webWindow.close();
}

ok('меню нарисовалось', !!$('.shell') && !!$('.rail'), $('.rail__title')?.textContent?.trim());
ok('кнопка общего хаба видна до входа', !!$('[data-action="open-hub"]'));
ok('ошибок в консоли нет', errors.length === 0, errors.join(' | '));

/* Кнопка «Играть»: полноценный экран, политическая карта и RTS-камера. */
click('.play-button');
await wait(60);
ok('кнопка «Играть» открывает отдельную полноэкранную страницу, не модальное окно', !!$('#world-page-root .world-app') && !$('.dialog--world') && window.document.body.classList.contains('world-page-open'));
ok('однофайловая копия не показывает путь к неупакованному Azgaar', !$('[data-action="world-fmg-open"]'));
ok('игровая страница отражена в адресе и истории браузера', window.location.hash === '#play');
ok('генератор предлагает seed, континенты, ландшафт, климат и размер блока', !!$('[data-world-setting="seed"]') && !!$('[data-world-setting="continents"]') && !!$('[data-world-setting="landscape"]') && !!$('[data-world-setting="climate"]') && !!$('[data-world-setting="voxelSize"]'));
ok('минимальная площадь мира больше площади Земли', /2,00×/.test($('[data-world-stat="ratio"]')?.textContent || ''));
ok('предпросмотр включает слои карты и параметры цивилизаций', !!$('[data-action="world-layer"][data-layer="politics"]') && !!$('[data-world-stat="states"]') && !!$('[data-world-stat="settlements"]'));
const seedBeforeRandom = $('[data-world-setting="seed"]').value;
click('[data-action="world-random-seed"]');
ok('кнопка выдаёт новый seed и обновляет предпросмотр', seedBeforeRandom !== $('[data-world-setting="seed"]')?.value);
$('[data-world-setting="climate"]').value = 'arid';
$('[data-world-setting="climate"]').dispatchEvent(new window.Event('change', { bubbles: true }));
ok('выбранный климат отображается в атласе', /засушливый/.test($('.world-preview .world-tag')?.textContent || ''));
$('[data-world-setting="continents"]').value = '5';
$('[data-world-setting="continents"]').dispatchEvent(new window.Event('change', { bubbles: true }));
ok('предпросмотр обновляет выбранное число материков', /5 материков/.test($('.world-preview .world-tag')?.textContent || ''));
click('[data-action="world-layer"][data-layer="height"]');
ok('слои атласа переключаются без перегенерации seed', $('[data-action="world-layer"][data-layer="height"]')?.getAttribute('aria-pressed') === 'true');
click('[data-action="world-generate"]');
await wait(60);
ok('генерация показывает полевой атлас, мини-карту и локальный voxel-чанк', !!$('#world-page-root [data-role="world-focus-map"]') && !!$('[data-role="world-map"]') && !!$('[data-role="world-viewport"]') && !!$('[data-role="world-biome"]'));
ok('созданы государства, поселения и панель разведданных', /Стратегические ресурсы/.test($('[data-role="world-state-details"]')?.textContent || '') && !!$('[data-role="world-map-facts"]'));
const worldPositionBefore = $('[data-role="world-position"]')?.textContent;
click('[data-action="world-move"][data-dx="1"][data-dz="0"]');
ok('кнопка камеры перемещает обзор по миру', worldPositionBefore !== $('[data-role="world-position"]')?.textContent);
const viewport = $('[data-role="world-viewport"]');
viewport.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 560, right: 900, bottom: 560 });
const pointer = (canvas, type, x, y) => {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  (type === 'pointerdown' || type === 'pointerup' ? canvas : window.document).dispatchEvent(event);
};
const positionBeforeDrag = $('[data-role="world-position"]')?.textContent;
pointer(viewport, 'pointerdown', 300, 300);
pointer(viewport, 'pointermove', 380, 300);
pointer(viewport, 'pointerup', 380, 300);
ok('перетаскивание воксельной сцены панорамирует камеру как в RTS', positionBeforeDrag !== $('[data-role="world-position"]')?.textContent);
const focusMap = $('[data-role="world-focus-map"]');
focusMap.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 750, right: 1200, bottom: 750 });
const mapPositionBeforeDrag = $('[data-role="world-position"]')?.textContent;
pointer(focusMap, 'pointerdown', 300, 300);
pointer(focusMap, 'pointermove', 380, 340);
pointer(focusMap, 'pointerup', 380, 340);
ok('перетаскивание основной карты меняет сектор камеры', mapPositionBeforeDrag !== $('[data-role="world-position"]')?.textContent);
const mapZoomBeforeWheel = $('[data-role="world-map-zoom"]')?.textContent;
focusMap.dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120, clientX: 500, clientY: 320 }));
ok('колесо мыши масштабирует карту вокруг курсора', mapZoomBeforeWheel !== $('[data-role="world-map-zoom"]')?.textContent);
const zoomBeforeWheel = $('[data-role="world-zoom"]')?.textContent;
viewport.dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 }));
ok('колесо мыши отдельно приближает воксельную сцену', zoomBeforeWheel !== $('[data-role="world-zoom"]')?.textContent);
click('[data-action="world-camera-home"]');
ok('кнопка возврата центрирует камеру и восстанавливает масштаб', $('[data-role="world-zoom"]')?.textContent === '100%' && $('[data-role="world-map-zoom"]')?.textContent === '210%');
click('[data-action="world-layer"][data-layer="politics"]');
ok('в полном атласе отображается слой государств', $('[data-action="world-layer"][data-layer="politics"]')?.getAttribute('aria-pressed') === 'true');
click('[data-action="world-save"]');
ok('мир сохраняется на устройстве', !!window.localStorage.getItem('mir-world-last-save'));
ok('отрисовка Canvas прошла без ошибок', errors.length === 0, errors.join(' | '));
click('[data-action="world-new"]');
ok('кнопка нового мира возвращает к полноэкранным настройкам', !!$('#world-page-root .world-preview') && !$('#world-page-root [data-role="world-focus-map"]'));
click('[data-action="world-exit"]');
await wait(50);
ok('возврат закрывает игровую страницу и показывает меню', !$('#world-page-root .world-app') && !window.document.body.classList.contains('world-page-open') && !!$('.shell'));

/* Обновления: сервер отдаёт сборку 99.0.0, а в странице 0.8.0 — приложение
   обязано сказать об этом строкой под шапкой. Само оно ничего не
   перезагружает: перезагрузку выбирает игрок кнопкой. */
const bar = $('.update-bar');
ok(
  'строка обновления появилась и знает версию с сервера',
  !!bar && !bar.hidden && /99\.0\.0/.test(bar.textContent || ''),
  bar?.textContent?.replace(/\s+/g, ' ').trim(),
);
ok(
  'в строке есть «Обновить сейчас» и «Позже»',
  !!$('[data-action="update-apply"]') && !!$('[data-action="update-dismiss"]'),
);
click('[data-action="update-dismiss"]');
await wait(50);
ok('«Позже» убирает строку', $('[data-region="update"]')?.hidden === true);

/* Проверяем обе группы меню: модальные действия не пересоздают страницу. */
const shellBeforeMenus = $('.shell');
click('[data-action="open-settings"]');
await wait(50);
ok('обычное меню открывает настройки без перезагрузки', $('.dialog__title')?.textContent === 'Настройки' && $('.shell') === shellBeforeMenus);
ok(
  'настройки показывают состояние обновления',
  /99\.0\.0/.test($('.settings-list')?.textContent || '') && !!$('[data-action="update-apply"]'),
  $('.settings-list')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120),
);
ok(
  'уведомления телефона доступны только с service worker',
  !!$('[data-setting="notify"]') && $('[data-setting="notify"]').disabled === true,
);
ok(
  'настройки описывают звуковые эффекты игрового меню',
  /Звуки игрового меню/i.test($('.settings-list')?.textContent || '') && /окна, переключатели/i.test($('.settings-list')?.textContent || ''),
);
const soundSwitch = $('[data-setting="sound"]');
soundSwitch.checked = false;
soundSwitch.dispatchEvent(new window.Event('change', { bubbles: true }));
await wait(30);
ok('выключение звуков отключает ползунок громкости', $('[data-setting="sound"]')?.checked === false && $('[data-setting="volume"]')?.disabled === true);
$('[data-setting="sound"]').checked = true;
$('[data-setting="sound"]').dispatchEvent(new window.Event('change', { bubbles: true }));
await wait(30);
ok('звуки игрового меню снова включаются переключателем', $('[data-setting="sound"]')?.checked === true && $('[data-setting="volume"]')?.disabled === false);
click('[data-action="close-modal"]');
click('[data-action="open-hub"]');
await wait(50);
ok('дополнительное меню открывает хаб без перезагрузки', $('.dialog__title')?.textContent === 'Общий хаб' && $('.shell') === shellBeforeMenus);
click('[data-action="close-modal"]');

click('[data-action="open-hub"]');
await wait(100);
ok('окно «Общий хаб» открылось', $('.dialog__title')?.textContent === 'Общий хаб', $('.dialog__title')?.textContent);
ok('состояние — локальный режим', /Только этот браузер/.test($('.link-state')?.textContent || ''), $('.link-state')?.textContent?.trim());
ok('поле адреса есть', !!$('[data-role="hub-input"]'));
ok('подсказан адрес страницы', $('[data-role="hub-input"]')?.value === 'http://127.0.0.1:9999', $('[data-role="hub-input"]')?.value);

/* Вводим адрес живого хаба и подключаемся — как человек. */
const input = $('[data-role="hub-input"]');
input.value = HUB;
input.dispatchEvent(new window.Event('input', { bubbles: true }));
$('form[data-form="connect-hub"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(2500);

ok('подключились к хабу', new RegExp(new URL(HUB).host.replace('.', '\\.')).test($('.link-state')?.textContent || ''), $('.link-state')?.textContent?.trim());
ok('появилась кнопка отключения', !!$('[data-action="hub-disconnect"]'));
ok('тост о подключении', /Хаб подключён/.test($('.toast-stack')?.textContent || ''), ($('.toast-stack')?.textContent || '').slice(0, 80));

/* Регистрируемся на хабе прямо из интерфейса. */
click('[data-action="close-modal"]');
await wait(100);
click('[data-action="open-auth"]');
await wait(100);
click('[data-action="auth-tab"][data-tab="register"]');
await wait(100);
const name = `ui${Math.floor(Math.random() * 9000) + 1000}`;
const registered = await registerWithRetry({
  count: (sel) => window.document.querySelector(sel),
  submit: (who) => {
    const node = $('form[data-form="register"]');
    node.elements.name.value = who;
    node.elements.password.value = 'secret123';
    node.elements.password2.value = 'secret123';
    node.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  },
  name,
});

ok('аккаунт создан на хабе', registered, $('.profile')?.textContent?.trim() || $('[data-role="form-error"]')?.textContent?.trim());
click('[data-action="open-profile"]');
await wait(200);
ok('в профиле виден адрес хаба', new RegExp(`Хаб ${new URL(HUB).host}`.replace(/\./g, '\\.')).test($('.account__meta')?.textContent || ''), $('.account__meta')?.textContent?.trim());
ok('в профиле есть кнопка хаба', !!$('[data-action="open-hub"]'));
click('[data-action="open-direct"]');
await wait(50);
ok('прямое подключение из профиля не перезагружает страницу', $('.dialog__title')?.textContent === 'Прямое подключение' && $('.shell') === shellBeforeMenus);
click('[data-action="close-modal"]');
click('[data-action="open-profile"]');
await wait(100);
click('[data-action="close-modal"]');
await wait(100);
ok('подвал панели: хаб и прямое подключение', !!$('.rail__foot [data-action="open-hub"]') && !!$('.rail__foot [data-action="open-direct"]'));

/* Отключаемся обратно — аккаунты снова локальные. */
click('.rail__foot [data-action="open-hub"]');
await wait(150);
click('[data-action="hub-disconnect"]');
await wait(300);
ok('после отключения — локальный режим', /Только этот браузер/.test($('.link-state')?.textContent || ''), $('.link-state')?.textContent?.trim());
/* Локальный аккаунт: панель должна видеть его в списке, помнить в
   журнале и позволять заблокировать. Регистрируемся в обычном окне —
   как человек, без заглядывания внутрь store. */
click('[data-action="open-auth"]');
await wait(100);
click('[data-action="auth-tab"][data-tab="register"]');
await wait(100);
const localName = `loc${Math.floor(Math.random() * 9000) + 1000}`;
const localForm = $('form[data-form="register"]');
localForm.elements.name.value = localName;
localForm.elements.password.value = 'secret123';
localForm.elements.password2.value = 'secret123';
localForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(600);
ok('локальный аккаунт создан', ($('.profile')?.textContent || '').includes(localName), $('.profile')?.textContent?.trim());
/* После успешной регистрации окно закрывается само — жмём «закрыть»
   только если оно ещё открыто. */
if ($('[data-action="close-modal"]')) click('[data-action="close-modal"]');
await wait(100);

/* Скрытая панель админа: вход по знаку игры и заводскому ключу.
   Проверяем в локальном режиме — там панель работает без хаба. */
const brandMark = $('[data-action="admin-tap"]');
ok('знак игры — доступная с клавиатуры потайная кнопка', !!brandMark && brandMark.getAttribute('aria-label') === 'Знак игры');
for (let i = 0; i < 6; i += 1) click('[data-action="admin-tap"]');
await wait(40);
ok('неполная комбинация не показывает вход', !$('form[data-form="admin-login"]'));
click('[data-action="admin-tap"]');
await wait(100);
ok('семь касаний за короткую серию открывают скрытый вход', !!$('form[data-form="admin-login"]'), $('.dialog__title')?.textContent);
ok('вход показан отдельными анимированными вратами', !!$('.dialog--admin-gate .admin-gate__emblem') && !!$('.admin-gate__keyline'));

$('[data-role="admin-key"]').value = 'не-тот-ключ';
$('form[data-form="admin-login"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(400);
ok('неверный ключ не пускает в панель', !$('[data-action="admin-tab"]'));

$('[data-role="admin-key"]').value = 'owlananaslwo';
$('form[data-form="admin-login"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(700);
ok('заводской ключ пускает в панель', !!$('[data-action="admin-tab"]'), $('[data-role="form-error"]')?.textContent?.trim());

/* Обзор: сводные числа и настройки — первое, что видит владелец. */
ok('панель открывается на обзоре со сводкой', !!$('.admin-tiles'), $('.admin-tile__key')?.textContent?.trim());
ok('админка собрана в отдельное адаптивное рабочее пространство', !!$('.admin-layout .admin-rail') && !!$('.admin-toolbar') && !!$('.admin-content'));
ok('обзор содержит графики регистраций и активности', $$('.admin-chart svg[role="img"]').length === 2);
ok('на обзоре видна настройка регистрации', !!$('[data-action="admin-registration"]'));
const panelTabs = $$('.admin-nav [data-action="admin-tab"]');
ok('в панели пять вкладок', panelTabs.length === 5, panelTabs.map((el) => el.dataset.tab).join(', '));
click('[data-action="admin-range"][data-value="7"]');
await wait(100);
ok('период графиков переключается без потери панели', $('[data-action="admin-range"][data-value="7"]')?.getAttribute('aria-pressed') === 'true' && $('.admin-chart__svg')?.querySelector('desc')?.textContent.includes('7 календарных дней'));
click('[data-action="admin-range"][data-value="14"]');
click('.admin-tile[data-action="admin-go"][data-tab="players"][data-filter="today"]');
await wait(100);
ok('показатель новых аккаунтов открывает фильтр за 24 часа', $('[data-action="admin-filter"][data-value="today"]')?.getAttribute('aria-pressed') === 'true');
click('[data-action="admin-tab"][data-tab="overview"]');
click('.admin-tile[data-action="admin-go"][data-tab="players"][data-filter="online"]');
await wait(100);
ok('карточка показателя открывает отфильтрованный список игроков', $('[data-action="admin-filter"][data-value="online"]')?.getAttribute('aria-pressed') === 'true');

/* Игроки: поиск, фильтры и карточка с блокировкой. */
click('[data-action="admin-tab"][data-tab="players"]');
await wait(200);
ok('во вкладке «Игроки» есть поиск и фильтры', !!$('[data-role="admin-search"]') && !!$('[data-action="admin-filter"]'));
ok('локальный аккаунт виден в списке', ($('.admin-list')?.textContent || '').includes(localName));

$('[data-role="admin-search"]').value = localName;
$('[data-role="admin-search"]').dispatchEvent(new window.Event('input', { bubbles: true }));
await wait(200);
const playerRow = $$('.admin-list [data-action="admin-open"]').find((el) => el.textContent.includes(localName));
ok('поиск находит игрока', !!playerRow, playerRow?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80));

playerRow.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(200);
ok('карточка игрока открылась', $('.dialog__title')?.textContent === 'Карточка игрока', $('.dialog__title')?.textContent);
ok('в карточке есть форма блокировки', !!$('form[data-form="admin-ban"]') && !!$('[data-role="admin-ban-reason"]'));

$('[data-role="admin-ban-reason"]').value = 'проверка интерфейса';
$('[data-role="admin-ban-reason"]').dispatchEvent(new window.Event('input', { bubbles: true }));
$('form[data-form="admin-ban"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(500);
ok('панель блокирует игрока', !!$('[data-action="admin-unban"]'), $('.account__meta--danger')?.textContent?.trim());

click('[data-action="admin-unban"]');
await wait(500);
ok('панель снимает блокировку', !$('[data-action="admin-unban"]') && !!$('form[data-form="admin-ban"]'));

/* Журнал: регистрация и действия панели записаны. */
click('[data-action="admin-back"]');
await wait(200);
click('[data-action="admin-tab"][data-tab="events"]');
await wait(200);
const journal = $('.admin-list')?.textContent || '';
ok('журнал показывает события', /Регистрация/.test(journal), journal.replace(/\s+/g, ' ').trim().slice(0, 90));
ok('в журнале видно, кого блокировали', /блокировка/i.test(journal));
const eventSearch = $('[data-role="admin-event-search"]');
eventSearch.value = localName;
eventSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
await wait(100);
ok('журнал ищет по имени игрока', ($('.admin-list')?.textContent || '').includes(localName));
$('[data-role="admin-event-search"]').value = '';
$('[data-role="admin-event-search"]').dispatchEvent(new window.Event('input', { bubbles: true }));
click('[data-action="admin-event-filter"][data-value="admin"]');
await wait(150);
ok('фильтр журнала оставляет только панель', !/Регистрация/.test($('.admin-list')?.textContent || '') && /блокировка/i.test($('.admin-list')?.textContent || ''));

/* Система: диагностика и ключ. */
click('[data-action="admin-tab"][data-tab="system"]');
await wait(200);
ok('диагностика показывает локальный режим', /только этот браузер/.test($('.admin-stats')?.textContent || ''));
ok('диагностика знает про журнал и регистрацию', /Записей в журнале/.test($('.admin-stats')?.textContent || ''));
click('[data-action="close-modal"]');
await wait(100);
ok('панель закрывается, меню на месте', !$('.dialog') && !!$('.shell'));

/* Панель блокировала локальный аккаунт, а блокировка отзывает сессию —
   входим заново: это и проверка обычного входа, и подготовка к проверке
   «локальный режим переживает обновление» ниже. */
click('[data-action="open-auth"]');
await wait(150);
{
  const loginForm = $('form[data-form="login"]');
  loginForm.elements.name.value = localName;
  loginForm.elements.password.value = 'secret123';
  loginForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(700);
}
ok('вход в локальный аккаунт работает', ($('.profile')?.textContent || '').includes(localName), $('[data-role="form-error"]')?.textContent?.trim() || 'гость');
if ($('[data-action="close-modal"]')) click('[data-action="close-modal"]');
await wait(100);

/* Перезагрузка страницы не должна выкидывать из аккаунта. Регрессия:
   страница открыта на адресе хаба, хаб подключён через окно «Общий хаб»
   (сессия записывает хаб как «тот же адрес», а в хранилище — полный URL);
   раньше при перезагрузке адреса не сходились и сессию удаляли. */
{
  const first = bootPage2(null);
  const w1 = first.window;
  const errs1 = [];
  w1.addEventListener('error', (e) => errs1.push(e.message));
  await wait(2500); // стартовая проверка хаба на адресе страницы
  const q1 = (sel) => w1.document.querySelector(sel);
  const click1 = (sel) => {
    const el = q1(sel);
    if (!el) throw new Error(`нет элемента ${sel}`);
    el.dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
  };
  click1('[data-action="open-hub"]');
  await wait(150);
  q1('[data-role="hub-input"]').value = HUB; // предложенный адрес — сам хаб
  q1('form[data-form="connect-hub"]').dispatchEvent(new w1.Event('submit', { bubbles: true, cancelable: true }));
  await wait(1500);
  click1('[data-action="close-modal"]');
  await wait(100);
  click1('[data-action="open-auth"]');
  await wait(100);
  click1('[data-action="auth-tab"][data-tab="register"]');
  await wait(100);
  const reloadName = `rl${Math.floor(Math.random() * 9000) + 1000}`;
  const reloadRegistered = await registerWithRetry({
    count: q1,
    submit: (who) => {
      const node = q1('form[data-form="register"]');
      node.elements.name.value = who;
      node.elements.password.value = 'secret123';
      node.elements.password2.value = 'secret123';
      node.dispatchEvent(new w1.Event('submit', { bubbles: true, cancelable: true }));
    },
    name: reloadName,
  });
  ok('перезагрузка: аккаунт создан, страница на адресе хаба', reloadRegistered, q1('.profile')?.textContent?.trim());
  /* Обновление страницы браузер сопровождает beforeunload — приложение на
     нём отмечает «вышел из меню». Раньше вместе с этим хаб отзывал токен
     устройства, и после F5 игрока выбрасывало из аккаунта. Без этой
     строки проверка была непохожа на настоящую перезагрузку. */
  w1.dispatchEvent(new w1.Event('beforeunload'));
  await wait(600);
  const saved = dumpStorage(w1);
  ok('«закрытие» вкладки не выбрасывает из аккаунта сразу', (q1('.profile')?.textContent || '').includes(reloadName));
  first.window.close();

  const second = bootPage2(saved); // «перезагрузка» той же страницы
  const w2 = second.window;
  const errs2 = [];
  w2.addEventListener('error', (e) => errs2.push(e.message));
  await wait(3500);
  ok('перезагрузка: вход в аккаунт сохранился', (w2.document.querySelector('.profile')?.textContent || '').includes(reloadName), w2.document.querySelector('.profile')?.textContent?.trim() || 'гость');
  ok('перезагрузка: ошибок в консоли нет', errs1.length === 0 && errs2.length === 0, [...errs1, ...errs2].join(' | '));

  /* А вот явный выход обязан убрать сессию и отозвать токен: иначе
     «Выйти» на этом устройстве оставлял бы вход открытым. */
  const q2 = (sel) => w2.document.querySelector(sel);
  const click2 = (sel) => {
    const el = q2(sel);
    if (!el) throw new Error(`нет элемента ${sel}`);
    el.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  };
  click2('[data-action="open-profile"]');
  await wait(200);
  click2('[data-action="logout"]');
  await wait(1500);
  const afterLogout = dumpStorage(w2);
  ok('«Выйти» убирает сессию из браузера', !afterLogout['mir:session']);
  const oldToken = JSON.parse(saved['mir:session']).token;
  const tokenCheck = await fetch(`${HUB}/api/state`, { headers: { Authorization: `Bearer ${oldToken}` } });
  ok('«Выйти» отзывает токен устройства на хабе', tokenCheck.status === 401, `${tokenCheck.status}`);
  ok('после выхода меню показывает гостя', !(w2.document.querySelector('.profile')?.textContent || '').includes(reloadName));
  second.window.close();
}

/* Локальный режим (mir.html на флешке, APK без хаба): вход тоже обязан
   переживать обновление — здесь сессия и аккаунты лежат в одном месте. */
{
  const localSaved = dumpStorage(window);
  const localPage = bootPage2(localSaved, 'http://127.0.0.1:9999/');
  const w3 = localPage.window;
  const errs3 = [];
  w3.addEventListener('error', (e) => errs3.push(e.message));
  await wait(3000);
  const text = w3.document.querySelector('.profile')?.textContent || '';
  ok('локальный режим: вход переживает обновление', text.includes(localName), text.replace(/\s+/g, ' ').trim() || 'гость');
  ok('локальный режим: ошибок в консоли нет', errs3.length === 0, errs3.join(' | '));
  localPage.window.close();
}

ok('ошибок в консоли по-прежнему нет', errors.length === 0, errors.join(' | '));

console.log(bad ? '\nПЛОХО' : '\nВСЁ ХОРОШО');
process.exit(bad ? 1 : 0);
