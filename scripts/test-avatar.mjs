/* Смоук-проверка выбора аватарки: `pickAvatarFile()` из `src/ui/avatar.js`
   открывается в jsdom, и выбор файла разыгрывается так, как его делает
   человек. Запуск:
     npm i --no-save jsdom      (разово: jsdom нужен только здесь)
     npm run test:avatar

   Зачем именно это место. В Android WebView (то есть внутри `MIR.apk`)
   клик по `<input type="file">`, который не прикреплён к документу, не
   открывает выбор файла: кнопка «Добавить аватарку» не делает ничего и
   ничего не говорит. Вторая ловушка — порядок событий на телефоне:
   сначала окну возвращают фокус и только потом заполняется `input.files`,
   поэтому «отмену» нельзя признавать по первому же фокусу. Обе ловушки
   проверяются здесь, а не на телефоне. */

import { JSDOM } from 'jsdom';
import './lib/root.mjs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://example.test/',
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;

const { pickAvatarFile } = await import('../src/ui/avatar.js');

const picture = () =>
  new window.File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'foto.png', { type: 'image/png' });

const fieldInDocument = () => document.body.querySelector('input[type="file"]');

let passed = 0;
let failed = 0;
const check = (ok, what, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? '  ✓' : '  ×'} ${what}${detail ? ` — ${detail}` : ''}`);
};

console.log('Выбор аватарки: pickAvatarFile в jsdom\n');

/* --- 1. Выбор файла доходит до страницы ------------------------- */
const choosing = pickAvatarFile();
const field = fieldInDocument();
check(
  Boolean(field),
  'поле выбора файла появляется в документе до клика',
  field ? 'есть в <body>' : 'клик по detached-полю WebView игнорирует',
);
if (field) {
  check(field.accept.includes('image/'), 'поле просит только картинки', field.accept);
  check(
    field.style.position === 'fixed' && field.style.opacity === '0',
    'поле не видно игроку (не ломает вёрстку)',
    `${field.style.position}, opacity ${field.style.opacity}`,
  );
  check(field.tabIndex === -1, 'поле не попадает в обход табом', `tabIndex ${field.tabIndex}`);

  const chosen = picture();
  Object.defineProperty(field, 'files', { value: [chosen], configurable: true });
  field.dispatchEvent(new window.Event('change'));
}
const picked = await choosing;
check(
  picked instanceof window.File && picked.name === 'foto.png',
  'страница получает тот файл, что выбрал игрок',
  picked?.name ?? 'ничего не пришло',
);
check(!fieldInDocument(), 'поле убирается из документа после выбора');

/* --- 2. Отмена не вешает интерфейс ------------------------------- */
const cancelling = pickAvatarFile();
const second = fieldInDocument();
check(Boolean(second), 'повторный выбор тоже открывает поле');
if (second) {
  Object.defineProperty(second, 'files', { value: [], configurable: true });
  /* Телефон вернул фокус, файла нет: игра должна сдаться сама, а не ждать. */
  window.dispatchEvent(new window.Event('focus'));
}
const cancelled = await cancelling;
check(cancelled === null, 'отмена выбора возвращает null, а не висит', String(cancelled));
check(!fieldInDocument(), 'поле убирается и после отмены');

/* --- 3. Файл, пришедший позже фокуса, не теряется ---------------- */
const slow = pickAvatarFile();
const third = fieldInDocument();
if (third) {
  Object.defineProperty(third, 'files', { value: [], configurable: true });
  window.dispatchEvent(new window.Event('focus'));
  /* Android заполняет input.files уже после того, как окно получило фокус. */
  await new Promise((resolve) => setTimeout(resolve, 150));
  const late = picture();
  Object.defineProperty(third, 'files', { value: [late], configurable: true });
}
const latePicked = await slow;
check(
  latePicked instanceof window.File,
  'файл, появившийся после возврата фокуса, не теряется',
  latePicked?.name ?? 'страница сдалась раньше',
);
check(!fieldInDocument(), 'в документе не осталось лишних полей выбора файла');

console.log('');
window.close();
if (failed) {
  console.log(`ПЛОХО: не прошло проверок — ${failed} из ${passed + failed}.`);
  process.exit(1);
}
console.log(`ВСЁ ХОРОШО — ${passed} проверок выбора аватарки.`);
process.exit(0);
