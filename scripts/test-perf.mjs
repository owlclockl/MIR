/* Проверка, что интерфейс не делает лишней работы.

   Зачем отдельная проверка: подтормаживание меню не видно в обычных
   тестах — они смотрят на разметку, а не на цену её перерисовки. Здесь
   собранный `mir.html` открывается в jsdom с «тяжёлой» базой (40
   аккаунтов, у каждого аватарка ~20 КБ), и мы считаем то, что реально
   греет телефон:

     — сколько байт JSON разбирается на одно действие
       (в локальном режиме база с аватарками — сотни килобайт);
     — сколько раз пересобираются панели и читается `innerHTML`
       (чтение — это сериализация всей панели целиком);
     — не пересоздаётся ли окно, когда приходят новые данные, и не
       проигрывается ли заново анимация открытия.

   Запуск:
     npm i --no-save jsdom            (разово)
     npm run single && npm run test:perf

   Проверка ничего не собирает сама: она смотрит на mir.html, то есть на
   то, что получает игрок. */

import { readFileSync } from 'node:fs';
import { fromRoot } from './lib/root.mjs';

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.error('Нет jsdom. Поставьте его разово: npm i --no-save jsdom');
  process.exit(1);
}

const USERS = 40;
const FRIENDS = 20;
const AVATAR_BYTES = 20 * 1024;

const avatar = (seed) =>
  `data:image/webp;base64,${Buffer.alloc(AVATAR_BYTES, seed % 255).toString('base64')}`;

const now = Date.now();
const users = [];
for (let i = 0; i < USERS; i += 1) {
  users.push({
    id: `u_${i}`,
    name: `player${i}`,
    nameKey: `player${i}`,
    salt: 'a'.repeat(32),
    passHash: 'b'.repeat(64),
    avatar: avatar(i + 2),
    friends: [],
    inviteCode: `ABCD-EF${String(i).padStart(2, '0')}`,
    createdAt: now - i * 86_400_000,
    seenAt: now,
    online: true,
  });
}
users[0].friends = users.slice(1, 1 + FRIENDS).map((u) => u.id);
for (const user of users.slice(1, 1 + FRIENDS)) user.friends = ['u_0'];

const stats = { parses: 0, parseBytes: 0, writes: 0, writeBytes: 0, reads: 0, readBytes: 0, regionWrites: 0 };

const html = readFileSync(fromRoot('mir.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://127.0.0.1:9999/',
  pretendToBeVisual: true,
  beforeParse(window) {
    /* Сети в проверке нет: приложение обязано уйти в локальный режим. */
    window.fetch = () => Promise.reject(new Error('нет сети'));
    window.localStorage.setItem('mir:users', JSON.stringify(users));
    window.localStorage.setItem('mir:requests', JSON.stringify([]));
    window.localStorage.setItem(
      'mir:session',
      JSON.stringify({ userId: 'u_0', token: null, hub: null, since: now }),
    );
    window.HTMLMediaElement.prototype.play = () => Promise.resolve();
    window.HTMLMediaElement.prototype.pause = () => {};

    const parse = window.JSON.parse;
    window.JSON.parse = (text, ...rest) => {
      stats.parses += 1;
      stats.parseBytes += String(text).length;
      return parse(text, ...rest);
    };

    const proto = window.Element.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
    Object.defineProperty(proto, 'innerHTML', {
      configurable: true,
      get() {
        const value = descriptor.get.call(this);
        stats.reads += 1;
        stats.readBytes += value.length;
        return value;
      },
      set(value) {
        const text = String(value);
        stats.writes += 1;
        stats.writeBytes += text.length;
        if (this.dataset?.region) stats.regionWrites += 1;
        return descriptor.set.call(this, text);
      },
    });
  },
});

const { window } = dom;
const $ = (sel) => window.document.querySelector(sel);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await wait(2000);

let bad = 0;
const ok = (what, condition, detail = '') => {
  console.log(`${condition ? '  ✓' : '  ×'} ${what}${detail ? ` — ${detail}` : ''}`);
  if (!condition) bad += 1;
};

const reset = () => {
  stats.parses = 0;
  stats.parseBytes = 0;
  stats.writes = 0;
  stats.writeBytes = 0;
  stats.reads = 0;
  stats.readBytes = 0;
  stats.regionWrites = 0;
};

const click = (selector) => {
  const node = $(selector);
  if (!node) throw new Error(`нет элемента ${selector}`);
  node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
};

const errors = [];
window.addEventListener('error', (event) => errors.push(event.message));

console.log(`Локальный режим: ${USERS} аккаунтов, ${FRIENDS} друзей, аватарка ~${AVATAR_BYTES / 1024} КБ`);

/* Бюджеты намеренно с запасом: важно поймать возврат «пересобираем всё
   каждый раз», а не измерять доли миллисекунды. Киловаттная база целой
   не разбирается — на неё в локальном режиме уходили десятки мегабайт
   разбора за одно переключение настройки. */
const PARSE_BUDGET = 120 * 1024; // КБ на действие
const REGION_WRITE_BUDGET = 128 * 1024; // сколько байт панелей можно перезаписать

/* ---------- 1. открытие окон ---------- */

reset();
click('[data-action="open-profile"]');
ok(
  'профиль открывается без разбора базы целиком',
  stats.parseBytes < PARSE_BUDGET,
  `разобрано ${Math.round(stats.parseBytes / 1024)} КБ, записей панелей ${stats.regionWrites}`,
);
ok('список друзей при этом не пересобирается', stats.regionWrites === 0);
ok('окно открылось', $('.dialog__title')?.textContent === 'Профиль');
const friendsDrawn = window.document.querySelectorAll('.rail .friend').length;
ok('панель друзей нарисована со всеми друзьями', friendsDrawn === FRIENDS, `строк: ${friendsDrawn}`);

/* ---------- 2. обновление данных под открытым окном ---------- */

const sameDialog = $('.dialog');
window.dispatchEvent(new window.StorageEvent('storage', { key: 'mir:session' }));
await wait(50);
ok('окно не пересобирается, когда данные не изменились', $('.dialog') === sameDialog);

/* А когда данные под окном поменялись (сохранили новый никнейм), окно
   обновляется на месте: без повторного «въезда» анимации, который
   выглядел как подтормаживание. */
const nameField = window.document.querySelector('#overlay-root input[name="name"]');
nameField.value = 'playerzero';
window.document
  .querySelector('form[data-form="change-name"]')
  .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(300);
ok(
  'обновление окна идёт без повторной анимации открытия',
  $('.dialog')?.hasAttribute('data-static') === true && /playerzero/.test($('.account__name')?.textContent || ''),
  $('.account__name')?.textContent,
);
click('[data-action="close-modal"]');
reset();

/* ---------- 3. смена настройки: панели не должны перерисовываться ---------- */

click('[data-action="open-settings"]');
reset();
const toggle = $('[data-setting="motion"]');
toggle.checked = false;
toggle.dispatchEvent(new window.Event('change', { bubbles: true }));
await wait(50);
ok(
  'переключение настройки не разбирает базу заново',
  stats.parseBytes < PARSE_BUDGET,
  `разобрано ${Math.round(stats.parseBytes / 1024)} КБ`,
);
ok(
  'неизменившиеся панели не перезаписываются',
  stats.regionWrites * AVATAR_BYTES < REGION_WRITE_BUDGET && stats.writeBytes < REGION_WRITE_BUDGET,
  `записано ${Math.round(stats.writeBytes / 1024)} КБ разметки`,
);
click('[data-action="close-modal"]');

/* ---------- 4. частые обновления связи ---------- */

reset();
for (let i = 0; i < 20; i += 1) {
  /* Так приходит замер задержки P2P: раз в пять секунд на каждый канал.
     К списку друзей он отношения не имеет. */
  window.dispatchEvent(new window.StorageEvent('storage', { key: 'mir:session' }));
}
await wait(50);
ok(
  'двадцать обновлений данных подряд не пересобирают панель',
  stats.regionWrites === 0,
  `записей панелей: ${stats.regionWrites}, разобрано ${Math.round(stats.parseBytes / 1024)} КБ`,
);

/* ---------- 5. чат: длинная переписка ---------- */

reset();
click('[data-action="open-friend"]');
await wait(50);
ok(
  'окно друга открывается на списке друзей',
  $('.dialog__title')?.textContent === 'Игрок',
  $('.dialog__title')?.textContent,
);
ok(
  'открытие окна друга не перечитывает панель',
  stats.regionWrites === 0,
  `записей панелей: ${stats.regionWrites}`,
);
click('[data-action="close-modal"]');

ok('ошибок страницы нет', errors.length === 0, errors.join(' | '));

console.log(bad ? '\nПЛОХО' : '\nВСЁ ХОРОШО');
process.exit(bad ? 1 : 0);
