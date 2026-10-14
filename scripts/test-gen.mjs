/* Проверка генератора континентов (src/gen/continent.js) без браузера:
   детерминизм от seed, доля суши, гидрология, климатические поля, слои. */
import { generateContinent, paint, DEFAULT_OPTIONS, GENERATOR_STAGES, GRID_W, GRID_H } from '../src/gen/continent.js';

let failed = 0;
const ok = (name, cond, detail = '') => {
  console.log(`  ${cond ? '✓' : '×'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed += 1;
};

const t0 = Date.now();
const a = generateContinent({ seed: 'SAGES-TEST' });
const ms = Date.now() - t0;
const b = generateContinent({ seed: 'SAGES-TEST' });
const c = generateContinent({ seed: 'ДРУГОЙ-СИД' });

ok('сетка полная', a.rgba.length === GRID_W * GRID_H * 4, `${GRID_W}×${GRID_H}`);
ok('тот же seed — тот же мир', Buffer.from(a.rgba).equals(Buffer.from(b.rgba)));
ok('другой seed — другой мир', !Buffer.from(a.rgba).equals(Buffer.from(c.rgba)));
ok('доля суши 25–50%', a.landShare > 0.25 && a.landShare < 0.5, `${(a.landShare * 100).toFixed(1)}%`);
ok('есть и океан, и горы', a.elevation.some((e) => e < a.seaLevel) && a.elevation.some((e) => e > 0.9));
ok('реки текут', a.riverCells > 100, `${a.riverCells} клеток рек`);
ok('озёра встречаются', a.lakeCells > 0, `${a.lakeCells} клеток озёр`);
ok('плиты назначены всем клеткам', a.plateId.every((id) => id >= 0 && id < a.plates));
ok('климат в [0,1]', a.moisture.every((v) => v >= 0 && v <= 1) && a.temperature.every((v) => v >= 0 && v <= 1));
ok('слой плит отличается от биомов', !Buffer.from(paint(a, 'plates')).equals(Buffer.from(a.rgba)));
ok('генерация быстрая (<2 с)', ms < 2000, `${ms} мс`);
/* Перенесённые возможности четырёх конвейеров */
ok('стадии конвейера объявлены', GENERATOR_STAGES.includes('rivers') && GENERATOR_STAGES.includes('rainfall'), GENERATOR_STAGES.join(','));
ok('поля ветра и осадков есть', a.wind?.length === GRID_W * GRID_H && a.rainfall?.length === GRID_W * GRID_H);
ok('поле расстояний до разломов есть', a.faultDist?.some((d) => d > 5));
ok('слои осадков/ветра/стресса рисуются', ['rainfall', 'wind', 'stress', 'faults'].every((m) => paint(a, m).length === a.rgba.length));
const dry = generateContinent({ seed: 'SAGES-TEST', options: { landShare: 0.25 } });
ok('параметр доли суши работает', dry.landShare < a.landShare, `${(dry.landShare * 100).toFixed(0)}% < ${(a.landShare * 100).toFixed(0)}%`);
const flat = generateContinent({ seed: 'SAGES-TEST', options: { mountainHeight: 0 } });
const peaky = generateContinent({ seed: 'SAGES-TEST', options: { mountainHeight: 2 } });
ok('параметр высоты гор работает', Math.max(...peaky.elevation) >= Math.max(...flat.elevation));
ok('дефолтные опции полны', DEFAULT_OPTIONS.plates > 0 && DEFAULT_OPTIONS.riverThreshold > 0);

console.log(failed ? `\nПЛОХО: ${failed} проверок.` : '\nВСЁ ХОРОШО — генератор континентов.');
process.exit(failed ? 1 : 0);
