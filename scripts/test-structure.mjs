/* Проверка структуры исходников: границы модулей, слои, размеры.

   Запуск: npm run test:structure

   Зачем. Сборка и браузер молчат о том, что модуль потянул соседа «не по
   чину»: `src/world/` может импортировать кнопку из интерфейса, `src/data/` —
   разметку экрана, а `main.js` — вырасти до пяти тысяч строк, и всё это
   соберётся и заработает. Проблема проявится позже: правка одного экрана
   ломает другой, а вынести модуль становится дорого. Здесь границы проверяются
   как факт, а не как договорённость:

     1. Слои. Что кому можно импортировать — таблица LAYERS ниже. Мир не знает
        об интерфейсе, данные не знают об игре, вид карты блоками не знает о
        лобби.
     2. Циклы. Модули, импортирующие друг друга по кругу, в ESM работают через
        раз (одна из сторон получает недособранный объект), а причина поломки
        не видна в стеке. Цикл — ошибка, а не стиль.
     3. Достижимость. Каждый модуль обязан быть кому-то нужен: либо он связан
        импортами с `src/main.js`, `src/sw.js`, либо перечислен в ORPHANS с
        объяснением. Мёртвый модуль — это код, который никто не читает и никто
        не удаляет.
     4. Потолок размера. Файл, который растёт без конца, перестаёт быть
        модулем. Потолки стоят по текущему размеру (см. SIZES): уменьшать
        можно, увеличивать — только сознательно, с записью в журнале.

   Чего здесь нет. Мы не смотрим на качество кода и не спорим о стиле: за
   имена и недостижимые ветки отвечает `npm run lint`, за поведение — проверки
   проекта. Здесь только карта. */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fromRoot } from './lib/root.mjs';

/* ---------- слои -----------------------------------------------------

   Каждая запись: каталог → правила для его модулей. `inside` — свои файлы,
   `allow` — чужие, которые ему действительно нужны, `why` — объяснение,
   чтобы правило не выглядело вкусовщиной. Правило «только своё» — самое
   частое: слой, который ни на кого не опирается, можно проверить отдельно и
   вынести без разговоров. */

const LAYERS = {
  'src/world': {
    allow: [],
    why: 'мир блоками — чистая логика: поле, чанки, ярусы; об интерфейсе он не знает и знать не должен',
  },
  'src/data': {
    allow: [],
    why: 'данные и транспорт (хранилище, хаб, прямой канал, лобби) не знают ни о разметке, ни о генерации мира',
  },
  'src/ui': {
    allow: ['src/data'],
    why: 'показ может читать состояние (store.js), но не генерацию мира и не игру',
  },
  'src/planet': {
    allow: ['src/ui/icons.js', 'src/ui/dom.js'],
    why: 'планета — скрытый режим показа: ей нужны значки и мелочи разметки, и больше ничего',
  },
  'src/game': {
    allow: ['src/data', 'src/world', 'src/ui'],
    why: 'экран карты соединяет данные, мир и показ — ему можно смотреть во все три стороны',
  },
};

/* ---------- исключения -----------------------------------------------

   Модуль без импортов из игры: держим сознательно, с причиной. */

const ORPHANS = {
  'src/planet': 'скрытый режим: в интерфейсе его нет, проверяет его npm run test:planet',
};

/* Потолки размера: текущий размер как предел. Список — «горячие» файлы,
   которым в следующий раз нужен не потолок повыше, а разделение. Для
   остальных действует общий потолок. */

const SIZE_LIMIT = 900;
const SIZES = {
  'src/main.js': 3700, // меню: окна, экраны мира и лобби, обработчики
  'src/data/store.js': 1800, // состояние, аккаунты, друзья, админ-слой
  'src/ui/admin-panel.js': 1100, // разметка служебной панели
  'src/world/layers.js': 1050, // ярусы, наложения, подписи
  'src/game/world-view.js': 950, // показ мира блоками
  'src/data/p2p.js': 900, // прямой канал
  'server/hub-core.mjs': 1100, // вся логика хаба
  'server/hub-lobby.mjs': 850, // лобби на хабе
  'server/serve.mjs': 800, // раздача и туннель
};

/* ---------- разбор импортов ------------------------------------------ */

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|mjs)$/.test(name)) out.push(full);
  }
  return out;
};

/* Импорты берём только статические: динамические `import()` в исходниках
   игры не используются, а в проверках они ведут за пределы src/. */
const importsOf = (file) => {
  const text = readFileSync(file, 'utf8');
  const found = [];
  for (const match of text.matchAll(/(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
    const spec = match[1];
    if (!spec.startsWith('.')) continue; // пакет или node:* — не наша карта
    found.push(resolve(dirname(file), spec));
  }
  return found;
};

const projectFile = (abs) => relative(fromRoot(), abs).split('\\').join('/');

/* ---------- проверки -------------------------------------------------- */

const checks = [];
const add = (ok, what, detail = '') => checks.push({ ok, what, detail });

const files = [...walk(fromRoot('src')), ...walk(fromRoot('server'))];
const graph = new Map(files.map((file) => [file, importsOf(file).filter((target) => files.includes(target))]));

/* 1. Слои */
const layerBreaks = [];
for (const [dir, rule] of Object.entries(LAYERS)) {
  const prefix = `${dir}/`;
  for (const file of files.map(projectFile).filter((name) => name.startsWith(prefix))) {
    for (const target of graph.get(resolve(fromRoot(), file))) {
      const to = projectFile(target);
      if (to.startsWith(prefix)) continue;
      /* Разрешённое — тоже каталог: `src/data` пускает любой свой файл. */
      if (rule.allow.some((dir) => to === dir || to.startsWith(`${dir}/`))) continue;
      layerBreaks.push(`${file} → ${to}`);
    }
  }
}
add(
  layerBreaks.length === 0,
  'слои не перепутаны (мир, данные, показ, игра)',
  layerBreaks.length ? layerBreaks.join('; ') : `${Object.keys(LAYERS).length} каталога с правилами`,
);

/* 2. Циклы: обход в глубину с цветами (белый — не заходили, серый — в пути,
   чёрный — закончили). Серый сосед и есть цикл. */
const WHITE = 0;
const GREY = 1;
const BLACK = 2;
const color = new Map(files.map((file) => [file, WHITE]));
const stack = [];
const cycles = [];
const visit = (file) => {
  color.set(file, GREY);
  stack.push(file);
  for (const next of graph.get(file) ?? []) {
    if (color.get(next) === GREY) {
      const from = stack.indexOf(next);
      cycles.push([...stack.slice(from), next].map(projectFile).join(' → '));
    } else if (color.get(next) === WHITE) visit(next);
  }
  stack.pop();
  color.set(file, BLACK);
};
for (const file of files) if (color.get(file) === WHITE) visit(file);
add(
  cycles.length === 0,
  'в импортах нет циклов',
  cycles.length ? cycles.join('; ') : `${files.length} модулей, циклов нет`,
);

/* 3. Достижимость от входов игры: меню и service worker. */
/* Входы: страница, service worker и два способа поднять хаб на ПК
   (`npm run serve` и `npm run host:dev` — второй берёт тот же hub.mjs).
   Воркер хостинга сюда не входит: он адаптер и стартует у Cloudflare. */
const ENTRIES = ['src/main.js', 'src/sw.js', 'server/serve.mjs', 'server/hub.mjs'].map((name) =>
  resolve(fromRoot(), name),
);
const reached = new Set();
const queue = [...ENTRIES];
while (queue.length) {
  const file = queue.pop();
  if (reached.has(file)) continue;
  reached.add(file);
  for (const next of graph.get(file) ?? []) queue.push(next);
}
const orphans = files
  .filter((file) => !reached.has(file))
  .map(projectFile)
  .filter((name) => !Object.keys(ORPHANS).some((dir) => name.startsWith(`${dir}/`)))
  .sort();
add(
  orphans.length === 0,
  'у каждого модуля есть вход (или он в списке исключений)',
  orphans.length ? `ни к чему не подключены: ${orphans.join(', ')}` : `достижимо ${reached.size} модулей из ${files.length}`,
);

/* 4. Размеры. Потолок берётся из списка, иначе общий; превышение — ошибка,
   а заметное уменьшение (файл стал вдвое меньше потолка) — не беда, просто
   сообщаем: пора опустить потолок. */
const overLimit = [];
const canLower = [];
let largest = { name: '', lines: 0 };
for (const file of files) {
  const name = projectFile(file);
  const lines = readFileSync(file, 'utf8').split('\n').length;
  const limit = SIZES[name] ?? SIZE_LIMIT;
  if (lines > largest.lines) largest = { name, lines };
  if (lines > limit) overLimit.push(`${name}: ${lines} при потолке ${limit}`);
  /* Про запас говорим только там, где потолок поставлен руками: у общего
     потолка в 900 строк запас в 400 — это норма, а не повод что-то менять. */
  else if (name in SIZES && lines * 2 < limit)
    canLower.push(`${name}: ${lines} при потолке ${limit}`);
}
add(
  overLimit.length === 0,
  'модули не выросли выше потолка',
  overLimit.length
    ? overLimit.join('; ')
    : `самый большой — ${largest.name} (${largest.lines} строк, потолок ${SIZES[largest.name] ?? SIZE_LIMIT})`,
);
if (canLower.length)
  console.log(
    `  · потолок можно опустить (файл стал вдвое меньше):\n      ${canLower.join('\n      ')}\n`,
  );

/* ---------- итог ------------------------------------------------------ */

console.log('Проверка структуры: src/ и server/\n');
let bad = 0;
for (const check of checks) {
  console.log(`${check.ok ? '  ✓' : '  ×'} ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);
  if (!check.ok) bad += 1;
}
console.log('');
if (bad) {
  console.log(`СТРУКТУРА ПОЕХАЛА: не прошло проверок — ${bad} из ${checks.length}.`);
  console.log('Правила слоёв и потолки — в scripts/test-structure.mjs, объяснение — в AGENTS.md.');
  process.exit(1);
}
console.log(`ВСЁ ХОРОШО — ${checks.length} проверок структуры.`);
