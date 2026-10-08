/* Смоук-проверка интерфейса: настоящий `mir.html` открывается в jsdom,
   и по нему кликают, как человек, — меню, окно «Общий хаб», подключение
   по адресу, регистрация, профиль, отключение.

   Зачем: собранный файл — это то, что получает игрок. Проверки логики
   (`test:hub`, `test:p2p`) не видят разметку, а опечатка в обработчике
   ломает именно её, и молча.

   Запуск:
     npm run host:dev                 (или любой хаб на 127.0.0.1:8787)
     npm i --no-save jsdom            (разово: jsdom нужен только здесь)
     npm run single && npm run test:ui

   Адрес хаба можно задать: `npm run test:ui -- http://127.0.0.1:4173`. */

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
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://127.0.0.1:9999/',   // «страница» не хаб: его на этом порту нет
  pretendToBeVisual: true,
  /* fetch нужен уже на старте: приложение сразу проверяет новую сборку. */
  beforeParse(w) {
    w.fetch = fetchStub(w);
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

ok('меню нарисовалось', !!$('.shell') && !!$('.rail'), $('.rail__title')?.textContent?.trim());
ok('кнопка общего хаба видна до входа', !!$('[data-action="open-hub"]'));
ok('ошибок в консоли нет', errors.length === 0, errors.join(' | '));

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
ok('знак игры — потайная кнопка панели', !!brandMark);
for (let i = 0; i < 5; i += 1) click('[data-action="admin-tap"]');
await wait(100);
ok('пять щелчков по знаку открывают вход в панель', !!$('form[data-form="admin-login"]'), $('.dialog__title')?.textContent);

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
