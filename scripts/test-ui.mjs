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

const html = readFileSync(fromRoot('mir.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://127.0.0.1:9999/',   // «страница» не хаб: его на этом порту нет
  pretendToBeVisual: true,
});
const { window } = dom;
window.HTMLMediaElement.prototype.play = () => Promise.resolve(); // jsdom не декодирует звуки
window.HTMLMediaElement.prototype.pause = () => {};
window.fetch = globalThis.fetch;            // jsdom без fetch — отдаём ему node-овский
window.AbortSignal = globalThis.AbortSignal;
window.crypto.subtle = globalThis.crypto.subtle;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (sel) => window.document.querySelector(sel);
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

/* Проверяем обе группы меню: модальные действия не пересоздают страницу. */
const shellBeforeMenus = $('.shell');
click('[data-action="open-settings"]');
await wait(50);
ok('обычное меню открывает настройки без перезагрузки', $('.dialog__title')?.textContent === 'Настройки' && $('.shell') === shellBeforeMenus);
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
const form = $('form[data-form="register"]');
form.elements.name.value = name;
form.elements.password.value = 'secret123';
form.elements.password2.value = 'secret123';
form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(2500);

ok('аккаунт создан на хабе', ($('.profile')?.textContent || '').includes(name), $('.profile')?.textContent?.trim());
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

$('[data-role="admin-key"]').value = 'mir-admin';
$('form[data-form="admin-login"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(600);
ok('заводской ключ пускает в панель', !!$('[data-action="admin-tab"]'), $('[data-role="form-error"]')?.textContent?.trim());
ok('в панели виден список игроков', !!$('[data-role="admin-search"]'));
click('[data-action="admin-tab"][data-tab="system"]');
await wait(150);
ok('диагностика показывает локальный режим', /только этот браузер/.test($('.admin-stats')?.textContent || ''));
click('[data-action="close-modal"]');
await wait(100);
ok('панель закрывается, меню на месте', !$('.dialog') && !!$('.shell'));

ok('ошибок в консоли по-прежнему нет', errors.length === 0, errors.join(' | '));

console.log(bad ? '\nПЛОХО' : '\nВСЁ ХОРОШО');
process.exit(bad ? 1 : 0);
