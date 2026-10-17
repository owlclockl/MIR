/* Проверка бренд-страницы: файлы, палитра и логотипы.

   Запуск: npm run test:brand

   Зачем. Бренд-страница живёт вне сборки: её не поймает test:build, а
   расхождение «в документе один цвет, в интерфейсе другой» замечают уже
   по скриншотам. Здесь мы сверяем то, что можно проверить без браузера:

     1. Все файлы, на которые ссылается brand/index.html, лежат на месте.
     2. Палитра страницы совпадает с токенами src/style.css, а заявленный
        контраст — с посчитанным по WCAG (допуск 0.1).
     3. Логотипы используют ту же геометрию знака (r 8.2, точка r 2.4) и
        не содержат <text>: буквы обязаны быть контурами.
     4. Шрифты страницы — настоящие woff2, лицензии OFL лежат рядом.
     5. Страница не тянет внешних ресурсов: открывается локально. */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import './lib/root.mjs';

const pagePath = 'brand/index.html';
const page = readFileSync(pagePath, 'utf8');
const css = readFileSync('src/style.css', 'utf8');
const brandCss = readFileSync('brand/brand.css', 'utf8');

const checks = [];
const check = (name, fn) => {
  try {
    fn();
    checks.push({ ok: true, name });
  } catch (error) {
    checks.push({ ok: false, name, detail: error.message });
  }
};

/* ---------- 1. Ссылки страницы ---------------------------- */

const refs = [...page.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((ref) => !ref.startsWith('#') && !ref.startsWith('http') && !ref.startsWith('mailto:'));

for (const ref of new Set(refs)) {
  check(`ссылка существует: ${ref}`, () => {
    const clean = ref.split('#')[0].split('?')[0];
    /* /logo.svg — файл из public/ (страницу раздаёт dev-сервер из корня
       проекта); остальные ссылки — относительные от brand/. */
    const target = clean.startsWith('/')
      ? resolve('public', clean.slice(1))
      : resolve(dirname(pagePath), clean);
    assert.ok(existsSync(target), `нет файла ${target}`);
  });
}

check('нет внешних ресурсов', () => {
  const external = [...page.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(external, [], `внешние ресурсы: ${external.join(', ')}`);
});

/* ---------- 2. Палитра и контраст ------------------------- */

const tokenOf = (name) => {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `в src/style.css нет токена --${name}`);
  return match[1].toLowerCase();
};

const tokens = {
  '--bg': '#080d0e',
  '--panel': '#0d1415',
  '--surface-raised': '#121c1b',
  '--accent': '#c2d9c9',
  '--gold': '#d8c184',
  '--text': '#eef2ef',
  '--text-soft': '#c2cbc5',
  '--text-dim': '#9ca8a0',
  '--text-faint': '#7b8880',
  '--danger': '#d99999',
};

for (const [token, expected] of Object.entries(tokens)) {
  check(`токен ${token} совпадает со страницей`, () => {
    /* --panel в приложении полупрозрачный (rgba); сравниваем его базовый
       цвет — тот же #0d1415, что на странице. */
    const inCss =
      token === '--panel'
        ? (() => {
            const rgba = css.match(/--panel:\s*rgba\((\d+),\s*(\d+),\s*(\d+)/);
            assert.ok(rgba, 'в src/style.css нет --panel');
            return `#${rgba
              .slice(1, 4)
              .map((part) => Number(part).toString(16).padStart(2, '0'))
              .join('')}`;
          })()
        : tokenOf(token === '--danger' ? 'danger' : token.slice(2));
    assert.equal(inCss, expected, `${token}: style.css ${inCss}, страница ${expected}`);
    assert.ok(page.includes(expected), `значения ${expected} нет на странице`);
  });
}

const luminance = (hex) => {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const ratioRows = page
  .split('<div class="swatch">')
  .slice(1)
  .map((block) => block.match(/data-hex="(#[0-9a-f]{6})"[\s\S]*?<b>(\d+\.\d)<\/b>/))
  .filter(Boolean)
  .map((match) => [match[0], match[1], match[2]]);
check('на странице есть заявленный контраст', () => assert.ok(ratioRows.length >= 6));

for (const [, hex, stated] of ratioRows) {
  check(`контраст ${hex} = ${stated}: 1`, () => {
    const actual = contrast(hex, '#080d0e');
    assert.ok(
      Math.abs(actual - Number(stated)) < 0.1,
      `для ${hex} посчитано ${actual.toFixed(2)}, заявлено ${stated}`,
    );
  });
}

/* ---------- 3. Логотипы ----------------------------------- */

const logos = [
  'public/logo.svg',
  'public/logo-ink.svg',
  'public/logo-stacked.svg',
  'public/logo-stacked-ink.svg',
  'public/logo-sages.svg',
  'public/logo-sages-ink.svg',
  'public/logo-mark.svg',
  'public/logo-mark-ink.svg',
  'public/logo-mono.svg',
];

for (const file of logos) {
  check(`логотип: ${file}`, () => {
    assert.ok(existsSync(file), 'файла нет');
    const svg = readFileSync(file, 'utf8');
    assert.match(svg, /r="8\.2"/, 'нет кольца r 8.2');
    assert.match(svg, /r="2\.4"/, 'нет точки r 2.4');
    assert.match(svg, /stroke-width="1\.7"/, 'нет штриха 1.7');
    assert.doesNotMatch(svg, /<text[\s>]/, 'буквы набраны текстом, а не контурами');
    assert.match(svg, /<path d="M[^"]+"/, 'нет контуров букв');
    assert.match(svg, /role="img"/, 'нет роли img');
    assert.match(svg, /aria-labelledby="title desc"/, 'нет доступного названия');
  });
}

check('ink-редакции используют тёмную палитру', () => {
  for (const file of ['public/logo-ink.svg', 'public/logo-stacked-ink.svg', 'public/logo-mark-ink.svg']) {
    const svg = readFileSync(file, 'utf8');
    assert.match(svg, /#24362f/, `${file}: нет тёмного шалфея`);
    assert.match(svg, /#7a5c26/, `${file}: нет тёмного золота`);
    assert.doesNotMatch(svg, /#c2d9c9|#d8c184/, `${file}: остались экранные цвета`);
  }
});

check('страница перечисляет все логотипы', () => {
  for (const file of logos) {
    const url = file.replace('public/', '/');
    assert.ok(page.includes(url), `на странице нет ссылки на ${file}`);
  }
});

/* ---------- 4. Шрифты и лицензии --------------------------- */

check('шрифты — woff2 с лицензиями', () => {
  const files = [
    'manrope-cyrillic-700.woff2',
    'manrope-latin-700.woff2',
    'inter-cyrillic-400.woff2',
    'inter-cyrillic-500.woff2',
    'inter-cyrillic-600.woff2',
    'inter-latin-400.woff2',
    'inter-latin-500.woff2',
    'inter-latin-600.woff2',
  ];
  for (const file of files) {
    const buffer = readFileSync(`brand/fonts/${file}`);
    assert.equal(buffer.subarray(0, 4).toString('latin1'), 'wOF2', `${file}: не woff2`);
    assert.ok(brandCss.includes(`fonts/${file}`), `в brand.css нет @font-face для ${file}`);
  }
  assert.ok(existsSync('brand/fonts/LICENSE-Manrope.txt'));
  assert.ok(existsSync('brand/fonts/LICENSE-Inter.txt'));
});

/* ---------- 5. Страница документа ------------------------- */

check('страница: язык, заголовок, навигация', () => {
  assert.match(page, /<html lang="ru"/);
  assert.match(page, /<title>Бренд-система — The civilization of the sages<\/title>/);
  assert.match(page, /class="skip-link"/);
  for (const id of ['znak', 'logotip', 'cvet', 'bumaga', 'shrift', 'interfeys', 'golos', 'fajly']) {
    assert.ok(page.includes(`id="${id}"`), `нет главы #${id}`);
    assert.ok(page.includes(`href="#${id}"`), `нет ссылки на #${id}`);
  }
});

check('метод описан шагами, id страницы уникальны', () => {
  const steps = (page.match(/<li>\s*<strong>/g) || []).length;
  assert.ok(steps >= 8, `в «Порядке работы» ${steps} шагов, ожидалось 8`);
  const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], [], `повторяющиеся id: ${duplicates.join(', ')}`);
  /* Содержание и верхняя навигация должны ссылаться на каждую главу. */
  for (const id of ['znak', 'logotip', 'cvet', 'bumaga', 'shrift', 'interfeys', 'golos', 'fajly']) {
    const links = (page.match(new RegExp(`href="#${id}"`, 'g')) || []).length;
    assert.ok(links >= 2, `на главу #${id} ведёт ${links} ссылок, ожидалось не меньше двух`);
  }
});

check('переключатель поверхности полный', () => {
  for (const surface of ['night', 'deep', 'raised', 'paper']) {
    assert.ok(page.includes(`data-surface-set="${surface}"`), `нет поверхности ${surface}`);
  }
  assert.match(page, /data-surface="night"/);
});

/* ---------- Итог ------------------------------------------ */

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  if (!item.ok) console.log(`  × ${item.name} — ${item.detail}`);
}
if (failed.length) {
  console.log(`Бренд-страница: ${failed.length} из ${checks.length} проверок не прошли`);
  process.exit(1);
}
console.log(`Бренд-страница: все проверки пройдены (${checks.length})`);
