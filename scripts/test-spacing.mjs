/* Проверка отступов: единая шкала и совпадение полей у однотипных блоков.

   Запуск: npm run test:spacing

   Зачем отдельный тест. Отступы нельзя увидеть в обычных проверках: css
   не исполняется, а «на глаз» расхождение в 2 пикселя между шапкой окна и
   его телом замечают уже пользователи. Здесь мы разбираем src/style.css
   как текст и следим за тремя вещами:

     1. В gap/padding/margin/inset стоят только токены шкалы (--sp-*).
        Своё число (7px, 13px, 17px) — ошибка: именно из-за них блоки
        перестают совпадать друг с другом.
     2. Поля внутри одного компонента заданы одним токеном: шапка, тело и
        вкладки окна — --dialog-pad; шапка, список и подвал панели друзей —
        --panel-pad-x; сцена, шапка и подвал — --pad-x.
     3. Однотипные блоки имеют одну плотность: строки списков (--row-pad),
        блоки с рамкой (--box-pad).

   Плюс структурные проверки: одно правило — один раз (иначе поздняя правка
   молча перекрывает раннюю, и «поле 18» неожиданно становится «полем 15»),
   и :root не переопределяет токены дважды. */

import { readFileSync } from 'node:fs';
import './lib/root.mjs';

const css = readFileSync('src/style.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/* Свойства, которые мы считаем отступами. Размеры (width/height) и
   типографику (letter-spacing, text-indent) сюда не берём: это не ритм. */
const SPACING_PROPS =
  /^(gap|row-gap|column-gap|padding|padding-(block|inline|top|right|bottom|left)|margin|margin-(block|inline|top|right|bottom|left)|inset|inset-(block|inline)|top|right|bottom|left)$/;

/* Значения, которые не обязаны быть токеном: ноль, растяжение по центру,
   волосяная линия и проценты для центрирования. */
const ALLOWED_LITERAL = new Set(['0', 'auto', '50%', '100%', '1px']);
const FUNCTIONS = /(clamp|calc|max|min)\(/;

const SCALE = ['2', '4', '6', '8', '10', '12', '14', '16', '20', '24', '32'];

const checks = [];
const add = (ok, what, detail = '') => checks.push({ ok, what, detail });

/* ---------- разбор CSS на правила с учётом @media ------------------ */

function parseRules(text, scope = '') {
  const rules = [];
  let index = 0;
  for (;;) {
    const open = text.indexOf('{', index);
    if (open === -1) break;
    const selector = text.slice(index, open).trim();
    let depth = 1;
    let close = open + 1;
    while (close < text.length && depth > 0) {
      if (text[close] === '{') depth += 1;
      else if (text[close] === '}') depth -= 1;
      close += 1;
    }
    const body = text.slice(open + 1, close - 1);
    if (selector.startsWith('@')) rules.push(...parseRules(body, `${scope} ${selector}`.trim()));
    else rules.push({ scope, selector, body });
    index = close;
  }
  return rules;
}

const rules = parseRules(css);

const declarations = (body) =>
  body
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf(':');
      return { prop: part.slice(0, at).trim(), value: part.slice(at + 1).trim() };
    });

const spacingDecls = (body) => declarations(body).filter((d) => SPACING_PROPS.test(d.prop));

const findRule = (selector, scope = '') =>
  rules.filter((rule) => rule.selector === selector && rule.scope === scope);

/** Значение по пробелам, но не внутри скобок: clamp(a, 2vw, b) — один кусок. */
const splitValue = (value) => {
  const out = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (/\s/.test(char) && depth === 0) {
      if (current) out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) out.push(current);
  return out;
};

/** Значение свойства в правиле (первое совпадение). */
const declared = (selector, prop, scope = '') => {
  for (const rule of findRule(selector, scope))
    for (const decl of declarations(rule.body)) if (decl.prop === prop) return decl.value;
  return null;
};

/* ---------- 1. шкала: токены объявлены ровно как задумано ---------- */

const rootBlocks = findRule(':root');
const rootDecls = rootBlocks.flatMap((rule) => declarations(rule.body));
const tokenValue = (name) => rootDecls.find((decl) => decl.prop === name)?.value ?? null;

const missingTokens = SCALE.filter((step) => tokenValue(`--sp-${step}`) !== `${step}px`);
add(
  missingTokens.length === 0,
  'токены шкалы объявлены и совпадают со своим именем',
  missingTokens.length ? `проблемы: ${missingTokens.map((s) => `--sp-${s}`).join(', ')}` : `${SCALE.length} ступеней`,
);

const derived = ['--panel-pad-x', '--panel-pad-y', '--dialog-pad', '--row-pad', '--row-gap', '--box-pad', '--box-gap'];
const badDerived = derived.filter((name) => {
  const value = tokenValue(name);
  return !value || !/var\(--(sp-|row|box|panel|dialog)/.test(value);
});
add(
  badDerived.length === 0,
  'поля компонентов собраны из ступеней шкалы',
  badDerived.length ? `не из шкалы: ${badDerived.join(', ')}` : derived.join(', '),
);

/* ---------- 2. значение отступа — только токен --------------------- */

const offenders = [];
let spacingCount = 0;
for (const rule of rules) {
  if (rule.selector === ':root') continue; // здесь токены и определяются
  for (const decl of spacingDecls(rule.body)) {
    spacingCount += 1;
    const tokens = splitValue(decl.value);
    for (const token of tokens) {
      if (ALLOWED_LITERAL.has(token)) continue;
      if (token.startsWith('var(--')) continue;
      /* Жидкие значения (clamp/max) допустимы, но и внутри них должен быть
         токен, а не своё число. */
      if (FUNCTIONS.test(token) && decl.value.includes('var(--')) continue;
      if (/^(vh|vw|dvh|svh|%)/.test(token)) continue;
      offenders.push(`${rule.selector} { ${decl.prop}: ${decl.value} }`);
    }
  }
}
const uniqueOffenders = [...new Set(offenders)];
add(
  uniqueOffenders.length === 0,
  'все отступы взяты из шкалы (нет своих чисел)',
  uniqueOffenders.length ? uniqueOffenders.slice(0, 6).join('; ') : `${spacingCount} объявлений`,
);

/* ---------- 3. поля одного компонента совпадают -------------------- */

const family = (label, entries) => {
  const bad = entries.filter(([selector, prop, expected, scope]) => {
    const value = declared(selector, prop, scope);
    return !value || !value.includes(expected);
  });
  add(
    bad.length === 0,
    label,
    bad.length
      ? bad.map(([selector, prop]) => `${selector} { ${prop}: ${declared(selector, prop) ?? '—'} }`).join('; ')
      : entries.map(([selector, , expected]) => `${selector} → ${expected}`).join(', '),
  );
};

family('окно: шапка, тело и вкладки выровнены по --dialog-pad', [
  ['.dialog__head', 'padding', 'var(--dialog-pad)'],
  ['.dialog__body', 'padding', 'var(--dialog-pad)'],
  ['.tabs', 'margin', 'var(--dialog-pad)'],
]);

family('панель друзей: шапка, список и подвал — по --panel-pad-x', [
  ['.rail__head', 'padding-inline', 'var(--panel-pad-x)'],
  ['.rail__list', 'padding', 'var(--panel-pad-x)'],
  ['.rail__foot', 'padding', 'var(--panel-pad-x)'],
]);

family('каркас: сцена, шапка, подвал, тосты и строка обновления — по --pad-x', [
  ['.topbar__side', 'padding-inline', 'var(--pad-x)'],
  ['.stage', 'padding', 'var(--pad-x)'],
  ['.footer', 'padding', 'var(--pad-x)'],
  ['.toast-stack', 'left', 'var(--pad-x)'],
  ['.update-bar', 'padding-inline', 'var(--pad-x)'],
]);

family('строки списков: одна плотность --row-pad', [
  ['.friend', 'padding', 'var(--row-pad)'],
  ['.result', 'padding', 'var(--row-pad)'],
  ['.admin-row', 'padding', 'var(--row-pad)'],
  ['.member', 'padding', 'var(--row-pad)'],
  ['.friend', 'gap', 'var(--row-gap)'],
  ['.result', 'gap', 'var(--row-gap)'],
  ['.member', 'gap', 'var(--row-gap)'],
]);

family('блоки с рамкой: одна плотность --box-pad', [
  ['.link-box', 'padding', 'var(--box-pad)'],
  ['.chat__list', 'padding', 'var(--box-pad)'],
  ['.setting-row', 'padding', 'var(--box-pad)'],
  ['.island', 'padding', 'var(--box-pad)'],
  ['.party__param', 'padding', 'var(--box-pad)'],
]);

add(
  declared('.rail__head', 'height') === declared('.shell', 'grid-template-rows')?.split(' ')[0],
  'шапка панели друзей той же высоты, что верхняя панель',
  `${declared('.rail__head', 'height') ?? '—'} / первая строка каркаса: ${declared('.shell', 'grid-template-rows')?.split(' ')[0] ?? '—'}`,
);

/* Управление на телефоне — снизу, как в мессенджерах: панель прибита к
   нижнему краю и не уезжает вместе со страницей, а каркас закладывает под
   неё место вместе с полосой жестов — иначе последние строки контента
   прячутся за панелью. */
const shellMobilePad = declared('.shell', 'padding-bottom', '@media (max-width: 860px)');
add(
  Boolean(shellMobilePad && /var\(--tabbar-h\)/.test(shellMobilePad) && /var\(--safe-bottom\)/.test(shellMobilePad)),
  'каркас телефона оставляет место под нижнюю панель и полосу жестов',
  shellMobilePad ?? '—',
);
add(
  declared('.sidenav', 'position', '@media (max-width: 860px)') === 'fixed'
    && declared('.sidenav', 'bottom', '@media (max-width: 860px)') === '0',
  'на телефоне навигация прибита к нижнему краю экрана',
  `position: ${declared('.sidenav', 'position', '@media (max-width: 860px)') ?? '—'}, bottom: ${declared('.sidenav', 'bottom', '@media (max-width: 860px)') ?? '—'}`,
);
add(
  /var\(--tabbar-h\)/.test(declared('.sidenav', 'height', '@media (max-width: 860px)') ?? ''),
  'высота нижней панели задана токеном, а не полями на глаз',
  declared('.sidenav', 'height', '@media (max-width: 860px)') ?? '—',
);

/* Безопасные зоны объявлены токенами, чтобы каждый экран не писал env()
   заново: раньше нижнюю зону помнил только подвал, а шапка в PWA на
   телефоне уходила под системную строку. */
const safeTokens = ['--safe-top', '--safe-bottom', '--safe-left', '--safe-right'];
const missingSafe = safeTokens.filter((name) => !/env\(safe-area-inset/.test(tokenValue(name) ?? ''));
add(
  missingSafe.length === 0 && /var\(--bar-h\)/.test(tokenValue('--bar-h-safe') ?? '') && /var\(--safe-top\)/.test(tokenValue('--bar-h-safe') ?? ''),
  'безопасные зоны экрана объявлены токенами, высота шапки считает верхнюю зону',
  missingSafe.length ? `нет токенов: ${missingSafe.join(', ')}` : `${tokenValue('--bar-h-safe')}`,
);

/* Верхняя панель обязана отступать на верхнюю безопасную зону, иначе в PWA
   на телефоне её содержимое ложится под системную строку и «чёлку». */
add(
  declared('.topbar', 'padding-top') === 'var(--safe-top)',
  'шапка отступает от верхнего края экрана в PWA',
  declared('.topbar', 'padding-top') ?? '—',
);

/* ---------- 5. вёрстка для пальца ------------------------------ */

/* На телефоне поля ввода не меньше 16px: iOS приближает страницу при
   фокусе меньшего текста и обратно сама не отъезжает. */
const phoneInputs = rules
  .filter((rule) => rule.scope === '@media (max-width: 680px)' && rule.selector.includes('.input'))
  .flatMap((rule) => declarations(rule.body))
  .filter((decl) => decl.prop === 'font-size');
add(
  phoneInputs.length > 0 && phoneInputs.every((decl) => parseFloat(decl.value) >= 16),
  'на телефоне поля ввода не меньше 16px (iOS не увеличивает страницу)',
  phoneInputs.map((decl) => decl.value).join(', ') || '—',
);

/* Значок без слова на телефоне не читается, а «Настройки» живут в подвале
   навигации: спрячь его — и до настроек на телефоне не добраться. */
const phoneNavText = declared('.sidenav__text', 'display', '@media (max-width: 860px)');
const phoneNavShort = declared('.sidenav__short', 'display', '@media (max-width: 860px)');
const phoneNavFoot = declared('.sidenav__foot', 'display', '@media (max-width: 860px)');
add(
  phoneNavText !== 'none' && phoneNavShort === 'block',
  'на телефоне у пунктов навигации остаётся подпись',
  `подпись: ${phoneNavShort ?? 'не задана'}, контейнер: ${phoneNavText ?? 'не задан'}`,
);
add(
  phoneNavFoot !== 'none',
  'на телефоне «Настройки» остаются в навигации',
  `display: ${phoneNavFoot ?? 'не задан'}`,
);

/* Главный экран телефона выровнен по центру: печать, заголовок и девиз
   не прижаты к левому краю, а «Друзья» стоят посередине строки
   (кнопка «добавить» при этом остаётся справа). */
const phoneCentered = [
  ['.hero', 'text-align', 'center'],
  ['.hero', 'align-items', 'center'],
  ['.rail__heading', 'justify-content', 'center'],
  ['.stage__inner', 'justify-content', 'center'],
];
const offCenter = phoneCentered.filter(
  ([selector, prop, expected]) => declared(selector, prop, '@media (max-width: 860px)') !== expected,
);
add(
  offCenter.length === 0,
  'на телефоне главный экран отцентрован',
  offCenter.length
    ? offCenter.map(([selector, prop]) => `${selector} { ${prop}: ${declared(selector, prop, '@media (max-width: 860px)') ?? '—'} }`).join('; ')
    : 'витрина и заголовок панели друзей',
);

/* Друзья на телефоне — над витриной: кто в сети, видно сразу, без
   прокрутки мимо заголовка. */
const phoneAreas = declared('.shell', 'grid-template-areas', '@media (max-width: 860px)') ?? '';
add(
  phoneAreas.includes('rail') && phoneAreas.indexOf('rail') < phoneAreas.indexOf('stage'),
  'на телефоне панель друзей стоит над витриной',
  phoneAreas.replace(/\s+/g, ' ').trim(),
);

/* Нижняя панель уезжает при прокрутке переходом, а не перерисовкой
   разметки: класс ставит main.js, а гасит движение motionOff(). */
const tabbarTransition = declared('.sidenav', 'transition', '@media (max-width: 860px)') ?? '';
const tabbarHidden = declared('.sidenav--hidden', 'transform', '@media (max-width: 860px)');
add(
  tabbarTransition.includes('transform') && tabbarHidden === 'translateY(100%)',
  'нижняя панель прячется при прокрутке переходом',
  `${tabbarHidden ?? '—'} за ${tabbarTransition || '—'}`,
);

/* Аккаунт с аватаркой — в правой колонке шапки, а не в средней: сетка
   шапки `1fr auto 1fr`, и без явной колонки автоматическая расстановка
   отдавала блоку аккаунта именно среднюю. На телефоне аватарка из-за
   этого вставала по центру экрана вместо правого края. */
add(
  declared('.topbar__side--end', 'grid-column') === '3',
  'на телефоне аватарка аккаунта стоит справа (правая колонка шапки)',
  declared('.topbar__side--end', 'grid-column') ?? '—',
);

/* Пункты нижней панели должны влезать в узкий телефон без горизонтальной
   прокрутки: пять несжимаемых клеток по 72px на экранах уже ~400px
   уводили «Настройки» за край экрана. */
add(
  declared('.sidenav__item', 'flex', '@media (max-width: 860px)') === '1 1 72px',
  'на телефоне пункты нижней панели влезают в экран без прокрутки вбок',
  declared('.sidenav__item', 'flex', '@media (max-width: 860px)') ?? '—',
);

/* Фото-аватарка обрезается по форме аватарки: финишный слой делает её
   круглой, и без `overflow: hidden` квадратная фотография вылезает
   углами из круглой заглушки. */
add(
  declared('.avatar', 'overflow') === 'hidden',
  'фото аватарки обрезается по форме аватарки',
  declared('.avatar', 'overflow') ?? '—',
);

/* У `.input` стоит appearance: none, поэтому выпадающий список обязан
   рисовать свою стрелку — иначе он неотличим от текстового поля.
   Нативные виджеты при этом тёмные, а автозаполнение не красит поле
   в белый. */
const selectRule = rules.find((rule) => rule.scope === '' && rule.selector.includes('.input--select'));
const selectBg = selectRule
  ? declarations(selectRule.body).find((decl) => decl.prop === 'background-image')?.value ?? null
  : null;
add(
  Boolean(selectBg && selectBg.includes('data:image/svg+xml')),
  'у выпадающего списка есть своя стрелка',
  selectBg ? 'svg-шеврон' : '—',
);
add(
  rootDecls.some((decl) => decl.prop === 'color-scheme' && decl.value === 'dark'),
  'нативные виджеты тёмные (color-scheme: dark)',
  rootDecls.find((decl) => decl.prop === 'color-scheme')?.value ?? '—',
);
add(
  declared('.input:-webkit-autofill', '-webkit-text-fill-color') === 'var(--text)',
  'автозаполнение не красит поле в белый',
  declared('.input:-webkit-autofill', '-webkit-text-fill-color') ?? '—',
);

/* ---------- 4. структурные дубли ----------------------------------- */

/* Одно и то же свойство у одного селектора в одной области видимости —
   это перекрытие: ранняя запись молча теряется. Именно так «поле 18px»
   незаметно превращалось в «поле 15px». :root сюда попадает только за
   повтор свойств, и это правильно. */
/* Запасное значение для старых браузеров (100vh, следом 100dvh) — не
   перекрытие, а осознанный приём. Отличаем его так: значения совпадают,
   если вернуть «новые» единицы к старым. */
const legacyUnits = (value) => value.replace(/dvh|svh|lvh/g, 'vh').replace(/dvw|svw|lvw/g, 'vw');

const propSeen = new Map();
const duplicates = [];
for (const rule of rules)
  for (const decl of declarations(rule.body)) {
    const key = `${rule.scope}||${rule.selector}||${decl.prop}`;
    const previous = propSeen.get(key);
    if (previous !== undefined && legacyUnits(previous) !== legacyUnits(decl.value))
      duplicates.push(`${rule.scope || 'корень'}: ${rule.selector} { ${decl.prop}: ${previous} → ${decl.value} }`);
    propSeen.set(key, decl.value);
  }
add(
  duplicates.length === 0,
  'у каждого свойства одно место (нет молчаливых перекрытий)',
  duplicates.length ? duplicates.join('; ') : `${propSeen.size} объявлений`,
);

/* :root может быть не один (слои добавляют свои цвета), но отступы в нём
   должны быть объявлены ровно один раз. */
const tokenDupes = [];
const tokenSeen = new Set();
for (const block of rootBlocks)
  for (const decl of declarations(block.body)) {
    const isSpacingToken = /^--(sp-|pad-|panel-pad|dialog-pad|row-|box-)/.test(decl.prop);
    if (!isSpacingToken) continue;
    if (tokenSeen.has(decl.prop)) tokenDupes.push(decl.prop);
    tokenSeen.add(decl.prop);
  }
add(
  tokenDupes.length === 0,
  'токены отступов объявлены по одному разу',
  tokenDupes.length ? `повтор: ${tokenDupes.join(', ')}` : `${tokenSeen.size} токенов`,
);

/* ---------- итог ---------------------------------------------------- */

console.log('Проверка отступов: src/style.css\n');
let bad = 0;
for (const check of checks) {
  console.log(`${check.ok ? '  ✓' : '  ×'} ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);
  if (!check.ok) bad += 1;
}
console.log('');
if (bad) {
  console.log(`ОТСТУПЫ РАЗЪЕХАЛИСЬ: не прошло проверок — ${bad} из ${checks.length}.`);
  console.log('Правила шкалы описаны в начале src/style.css и в AGENTS.md.');
  process.exit(1);
}
console.log(`ВСЁ ХОРОШО — ${checks.length} проверок отступов.`);
