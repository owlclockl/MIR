/* Одна команда вместо длинного списка: `npm test`.

   Зачем. Проверок в проекте много, и у каждой свой набор условий: часть
   работает на голом Node, часть — на jsdom, часть требует собранных
   `dist/` и `mir.html`, а три живые проверки (хаб, прямой канал, интерфейс)
   вообще не запускаются без поднятого сервера. Запомнить это нельзя, а
   забытая проверка — это сломанная сборка у игрока. Здесь один список, одно
   место, где видно, что прошло, что упало и что пропущено и почему.

   Что делает:

   1. собирает dist/ (`npm run build`), а `mir.html` — только если рядом
      лежат зависимости встроенного редактора Azgaar (`npm run fmg:install`);
      иначе честно предупреждает, что автономная сборка может быть старой;
   2. гоняет проверки, которым не нужна сеть, — от отступов и артефактов
      сборки до лобби против настоящего хаба (тот поднимается в процессе);
   3. пропускает jsdom-проверки, если пакета нет, и говорит, чем его
      поставить (`npm i --no-save jsdom`);
   4. печатает итог и напоминает про живые проверки — они запускаются
      вручную, потому что требуют сервера или полифила WebRTC.

   Ключи:
     node scripts/test-all.mjs            только то, что работает без сети
     node scripts/test-all.mjs --no-build не собирать dist/ и mir.html
     node scripts/test-all.mjs --live     плюс живые проверки: те, которым
                                          нужен поднятый сервер. Адрес
                                          проверка находит сама — пробует
                                          4173 (`npm run serve`) и 8787
                                          (`npm run host:dev`); свой адрес
                                          задаётся в MIR_HUB. `test:p2p`
                                          пойдёт, только если поставлен
                                          полифил WebRTC для Node. */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fromRoot } from './lib/root.mjs';

const args = new Set(process.argv.slice(2));
const withLive = args.has('--live');
const withBuild = !args.has('--no-build');

const hasPackage = (name) =>
  import(name).then(
    () => true,
    () => false,
  );

const npmRun = (script, env = null) => {
  console.log(`\n$ npm run ${script}`);
  const result = spawnSync('npm', ['run', script], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...(env ? { env: { ...process.env, ...env } } : {}),
  });
  return result.status === 0;
};

/* Проверки без сети. Порядок — от дешёвых и общих к дорогим и частным:
   если сломаны артефакты сборки, остальное смотреть уже незачем. */
const OFFLINE = [
  ['lint', 'код: имена, дубли ключей, недостижимые ветки'],
  ['test:build', 'артефакты сборки: ссылки, версия, кэш SW, бюджеты, шрифты'],
  ['test:spacing', 'отступы: шкала, поля, шкала экранов'],
  ['test:structure', 'структура: слои, циклы, входы, потолки'],
  ['test:voxel', 'мир блоками: поле → чанк → плоский ярус'],
  ['test:planet', 'карта планеты: шкала, климат, сток, раскраска'],
  ['test:realtime', 'ядро лобби: уборка, лимиты, кадры по кускам'],
  ['test:worker', 'адаптер хостинга: хранение и перезапуск объекта'],
];

/* Правила кода живут в devDependency (`eslint`), потому что нужны только
   разработчику: в собранной игре их нет. Если пакет не поставлен (например,
   скрипты скачали архивом), проверка честно пропускается. */
const hasLint = await hasPackage('eslint');

/* Проверки, которым нужен jsdom (ставится разово и живёт вне package.json). */
const NEEDS_JSDOM = [
  ['test:voxel-view', 'вид карты блоками: ползунок, пресеты, dispose'],
  ['test:planet-view', 'вид карты планеты: слои, колесо, перенос'],
  ['test:avatar', 'выбор аватарки: поле, кадрирование, отмена'],
  ['test:perf', 'отзывчивость меню: разбор базы, перерисовки'],
  ['test:lobby-client', 'клиент лобби против настоящего хаба'],
];

/* Живые проверки: нужен сервер (или полифил WebRTC) — запускаются вручную. */
const LIVE = [
  ['test:hub', 'хаб по адресу: аккаунты, друзья, панель, сигналинг'],
  ['test:ui', 'mir.html и web в jsdom: слоты, iframe Azgaar, хаб'],
  ['test:p2p', 'прямой канал: два клиента, живой WebRTC'],
];

const hasJsdom = await hasPackage('jsdom');
/* Полифил WebRTC для Node: без него живой прямой канал в проверке не поднять. */
const hasDatachannel = await hasPackage('node-datachannel/polyfill');

/* Живым проверкам нужен адрес сервера. Порт по умолчанию разный: `npm run
   serve` слушает 4173, локальный хостинг (`npm run host:dev`) — 8787,
   поэтому пробуем оба и передаём найденный адрес проверкам через MIR_HUB —
   тот же ключ, которым его задаёт человек вручную. Свой адрес, если он
   другой, подставляется первым и пробуется раньше остальных. */
const SERVER_ADDRESSES = [
  ...new Set([process.env.MIR_HUB, 'http://127.0.0.1:4173', 'http://127.0.0.1:8787'].filter(Boolean)),
];

const findServer = async () => {
  for (const base of SERVER_ADDRESSES) {
    try {
      const response = await fetch(`${base}/api/ping`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return base;
    } catch {
      /* Этот адрес молчит — проверяем следующий. */
    }
  }
  return null;
};

console.log('Проверки проекта The civilization of the sages');
if (withBuild) {
  console.log('Собираю dist/ перед проверками.');
  if (!npmRun('build')) {
    console.error('\nСборка dist/ не прошла — проверки запускать не на чем.');
    process.exit(1);
  }
  if (existsSync(fromRoot('vendor', 'azgaar-fantasy-map-generator', 'node_modules'))) {
    if (!npmRun('single')) {
      console.error('\nАвтономная сборка не прошла — проверки запускать не на чем.');
      process.exit(1);
    }
  } else {
    console.log(
      '  ! зависимости редактора Azgaar не установлены (npm run fmg:install),' +
        '\n    поэтому mir.html не пересобран: проверки смотрят на ту сборку, что лежит в репозитории.',
    );
  }
}

if (!hasJsdom) {
  console.log('\n! jsdom не установлен: проверки вида и аватарки будут пропущены.');
  console.log('  Поставьте его разово: npm i --no-save jsdom');
}

const results = [];
const run = (script, title, skipReason = '', env = null) => {
  if (skipReason) {
    results.push({ script, title, status: 'пропущено', note: skipReason });
    console.log(`\n— ${script}: пропущено (${skipReason})`);
    return;
  }
  const started = Date.now();
  const ok = npmRun(script, env);
  results.push({ script, title, status: ok ? 'ок' : 'ОШИБКА', note: `${((Date.now() - started) / 1000).toFixed(1)} с` });
};

for (const [script, title] of OFFLINE)
  run(script, title, script === 'lint' && !hasLint ? 'нет eslint: npm ci' : '');
for (const [script, title] of NEEDS_JSDOM) run(script, title, hasJsdom ? '' : 'нет jsdom');

if (withLive) {
  const server = await findServer();
  console.log(
    server
      ? `\nЖивые проверки говорят с сервером ${server}.`
      : `\n! Ни один из адресов не ответил: ${SERVER_ADDRESSES.join(', ')}.`,
  );
  const liveEnv = server ? { MIR_HUB: server } : null;
  const liveSkip = server ? '' : 'сервер не отвечает (npm run serve либо npm run host:dev)';
  for (const [script, title] of LIVE) {
    /* Прямой канал поднимается между двумя клиентами в этом же процессе, а
       хаб нужен только как сигналинг — годится тот же поднятый сервер. */
    if (script === 'test:p2p') {
      run(
        script,
        title,
        hasDatachannel ? liveSkip : 'нужен node-datachannel: npm i --no-save node-datachannel',
        liveEnv,
      );
      continue;
    }
    run(script, title, liveSkip, liveEnv);
  }
}

/* Итог. Печатаем таблицей: важно видеть не только «прошло», но и то, что
   проверка была пропущена, — иначе «всё хорошо» обманывает. */
const failed = results.filter((item) => item.status === 'ОШИБКА');
const skipped = results.filter((item) => item.status === 'пропущено');
console.log('\n────────────── итог ──────────────');
for (const item of results) {
  console.log(`  ${item.status === 'ок' ? '✓' : item.status === 'ОШИБКА' ? '×' : '—'} ${item.script.padEnd(18)} ${item.title} (${item.note})`);
}
console.log(
  `\nПройдено: ${results.length - failed.length - skipped.length}, ошибок: ${failed.length}, пропущено: ${skipped.length}.`,
);

if (!withLive) {
  console.log('\nЖивые проверки (нужен запущенный сервер) запускаются отдельно:');
  for (const [script, title] of LIVE) console.log(`  npm run ${script.padEnd(12)} ${title}`);
  console.log('  либо всё сразу: node scripts/test-all.mjs --live');
}

process.exit(failed.length ? 1 : 0);
