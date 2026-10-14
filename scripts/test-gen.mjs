/* Проверка генератора континентов (src/gen/continent.js) без браузера:
   детерминизм от seed, доля суши, разные seed — разные миры. */
import { generateContinent, GRID_W, GRID_H } from '../src/gen/continent.js';

let failed = 0;
const ok = (name, cond, detail = '') => {
  console.log(`  ${cond ? '✓' : '×'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed += 1;
};

const a = generateContinent({ seed: 'SAGES-TEST' });
const b = generateContinent({ seed: 'SAGES-TEST' });
const c = generateContinent({ seed: 'ДРУГОЙ-СИД' });

ok('сетка полная', a.rgba.length === GRID_W * GRID_H * 4, `${GRID_W}×${GRID_H}`);
ok('тот же seed — тот же мир', Buffer.from(a.rgba).equals(Buffer.from(b.rgba)));
ok('другой seed — другой мир', !Buffer.from(a.rgba).equals(Buffer.from(c.rgba)));
ok('доля суши 30–45%', a.landShare > 0.3 && a.landShare < 0.45, `${(a.landShare * 100).toFixed(1)}%`);
ok('есть и океан, и горы', a.elevation.some((e) => e < a.seaLevel) && a.elevation.some((e) => e > 0.9));

console.log(failed ? `\nПЛОХО: ${failed} проверок.` : '\nВСЁ ХОРОШО — генератор континентов.');
process.exit(failed ? 1 : 0);
