# Замена генератора планеты / terrain

_Статус: 2026-10-14 прежние генераторы удалены; подключён новый генератор континентов `src/gen/continent.js` (чистая реализация, см. ниже)._

## Что удалено

- собственный процедурный генератор `src/gen/` (terrain, continents, hydro, biomes, blocks…);
- планетарный генератор `src/planet/` (тектоника, эрозия, климат…) и страница `planet.html`;
- Azgaar's Fantasy Map Generator: `vendor/azgaar-fantasy-map-generator/`, сборка
  `public/fmg/`, iframe-интеграция `src/game/azgaar.js`, `generation-stage.js`,
  мост `src/world/bridge.js`, синхронизация карты в лобби (`lobby-sync.js`, `map-frame.js`);
- тесты и скрипты только этих генераторов (`test:gen`, `test:planet*`, `test:alive`,
  `test:stage`, `test:world-map`, `test:ui`, `test:lobby-client`, `build-fmg`, `planet-preview`).

Экран карты в игре — заглушка «Генератор удалён». Слоты миров, seed, размер,
лобби, меню, аккаунты и хаб сохранены: новый генератор должен будет принимать
`{ seed, width, height }` из `src/data/store.js` и монтироваться на экран карты
вместо заглушки (`worldMapHtml` / `syncWorldViews` в `src/main.js`).

## Требования к новому генератору

1. Браузерный JS/TS (игра — Vite PWA + однофайловый `mir.html`), без серверной части.
2. Детерминированность от seed — иначе слоты и лобби разойдутся.
3. Лицензия, совместимая с проектом (MIT/Apache-2.0 предпочтительны; GPL — только
   осознанно, с пониманием последствий; «no license» = нельзя брать код).
4. Планета/terrain: высота, океаны, климат/биомы — то, что рисовали старые виды.

## Кандидаты с GitHub (проверено 2026-10-14)

| Репозиторий | ★ | Лицензия | Стэк | Вердикт |
|---|---:|---|---|---|
| [ZyFou/ProceduralTerrains](https://github.com/ZyFou/ProceduralTerrains) | 629 | MIT | JS, Three.js, React+Vite, GPU-terrain, есть planet mode, seed, экспорт GLB | **Главный кандидат.** Живой (обновления окт. 2026), браузерный, MIT. Минус: большой и React-ориентированный — брать движок/шейдеры, а не UI целиком. |
| [raguilar011095/planet_heightmap_generation](https://github.com/raguilar011095/planet_heightmap_generation) («World Orogen») | 114 | GPL-3.0 | JS ES-модули без сборки, Three.js: тектоника плит, климат Кёппена, эрозия, экспорт карт | Ближе всего по духу к удалённому `src/planet`. Минус: GPL-3.0 — код нельзя просто ввендорить в закрытую сборку; можно изучать подход или держать отдельным модулем с соблюдением лицензии. |
| [redblobgames/1843-planet-generation](https://github.com/redblobgames/1843-planet-generation) | 168 | Apache-2.0 | JS, сфера: Fibonacci → Delaunay/Voronoi, тектоника, биомы, реки | Эталонная методика и разбор от Red Blob Games, но сам репозиторий — недельный эксперимент («code is messy», unmaintained). Брать как архитектурный образец, а не как библиотеку. |
| [fqhd/ProceduralPlanets](https://github.com/fqhd/ProceduralPlanets) | 6 | MIT | JS, WebGL2, шумовые планеты в реальном времени | Маленький и понятный, MIT. Нет тектоники/климата — только визуальные планеты; не обновлялся с 2024. |
| [jeheydorn/nortantis](https://github.com/jeheydorn/nortantis) | 229 | AGPL-3.0 | Java 21, тектоника → hand-drawn карты | Не подходит стэком (Java, десктоп) и лицензией (AGPL). Только как референс алгоритмов. |

## Рекомендация

- Если нужен готовый браузерный движок — **ZyFou/ProceduralTerrains (MIT)**:
  подключить как источник height/biome на GPU, свой UI и слоты оставить.
- Если важнее «честная планета» (плиты → климат) — изучать **World Orogen**,
  но из-за GPL-3.0 не копировать код без решения по лицензии; альтернатива —
  реализовать конвейер по методике Red Blob Games (Apache-2.0).

## Следующий шаг

Выбрать кандидата → прототип отдельным экраном на `{ seed, width, height }` →
сравнить скорость/вес в однофайловой сборке → заменить заглушку в `src/main.js`.

## Кандидаты от владельца (проверено 2026-10-14)

| Репозиторий | Стэк | Что внутри | Лицензия | Вердикт |
|---|---|---|---|---|
| [spectrum-art/Continent-Generator](https://github.com/spectrum-art/Continent-Generator) (ссылка прислана дважды) | WebGPU/WGSL + Rust/WASM, Vite, сетка 2048×1024 | Плиты, скорости плит, напряжение границ (нормальное/касательное), JFA-поле расстояний до разломов, возвышение, затенённый рельеф; детерминирован от seed | **нет** | Лучшая архитектура из четырёх, но код копировать нельзя; WebGPU есть не везде, а сборка требует Rust/wasm-pack |
| [ianjsikes/continent-generator](https://github.com/ianjsikes/continent-generator) | Python, 2015–2017 | Perlin → height/wind/water/temperature/rainfall/biome PNG | **нет** | Не браузерный и заброшен: только идеи карт, портировать нечего |
| [blslade-neumont/procedural-continent-generator](https://github.com/blslade-neumont/procedural-continent-generator) | TypeScript, 2017 | Клеточный автомат land/sea (subdivide + simplifyLand), `Math.random` — даже не seeded | **нет** | Учебный скелет игры, не генератор континентов |
| [Jimbly/worlds-continent-gen](https://github.com/Jimbly/worlds-continent-gen) | JS, GLOV.js, 256×256 hex | Готовые поля elev/humidity/river/water_level/classif, seeded (alea+simplex) | **запрещает** использование вне Worlds FRVR | Технически самый «готовый» JS, но лицензия прямо запрещает наш случай |

**Итог:** ни один из четырёх нельзя легально ввендорить — у трёх нет лицензии
(«все права защищены» по умолчанию), у Jimbly — явный запрет. Поэтому взят
конвейер spectrum-art (плиты → напряжение границ → возвышение → климат → биомы)
и реализован с нуля чистыми средствами.

## Что подключено

`src/gen/continent.js` — детерминированный генератор: seeded RNG (FNV-1a +
mulberry32), 14 плит с обёрткой по долготе и скоростями, горы на сходящихся
границах, domain-warped fBm, уровень моря по 62-му процентилю (суша ~38%),
температура/влажность → 12 биомов, затенённый рельеф. Сетка 384×192,
вход — `{seed,width,height}` слота. Проверка: `npm run test:gen`.
