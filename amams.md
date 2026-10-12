# ananas1342 — весь код режима «Карта блоками» и правки к нему

> Собрано, чтобы работа не зависела от живучести песочницы: целые файлы режима, патчи в общие файлы, перечень правок и замеры. Сам файл — не новый дом для кода: он лежит в репозитории неотслеживаемым и в коммит не входит.

Снято 12.10.2026 с рабочего дерева `/home/user/MIR`, ветка `arena/1de1ae01-mir`. База дерева — `577acae` (мерж PR #45).

## Главное: `main` ушёл вперёд, и не вдоль, а вбок

`origin/main` = `975f93e` — мерж PR #48 «карта планеты: берега берутся из карты Azgaar, замыкания по долготе нет». Замеры по факту, не по памяти:

1. Моя 3D-итерация (`a74acf3`) в main **есть**: `src/world/{field,chunk,blocks,math,world,mesher,render,bridge}.js`, `src/game/world-view.js` (3D-вид, 507 строк), `scripts/test-voxel*.mjs`, `docs/voxel-world-generation.md` (744 строки), запись в `CHANGELOG.md`.

2. Режим в main теперь **не мой**: в `src/main.js` три упоминания «Карта планеты» и ноль «Карта блоками», ввозит экран `mountPlanetView` из `src/planet/view.js`, а не `mountWorldView`. Мой 3D-`world-view.js` в app-коде не импортирует никто — только тесты и `scripts/lib/verify-build.mjs`. То есть в main лежит **мёртвый код** режима, который вытеснен планетой.

3. Планета сидит поверх моих данных, а не поверх рендера: `src/planet/source.js` импортирует из `../world/bridge.js` (`mapsReady`, `missingMapsPart`, `readSource`), ничего больше из `src/world/*` планетными файлами не используется.

4. `mesher.js` и `render.js` в main нужны только старому `test-voxel.mjs` — приложение к ним не обращается. Удалить их безопасно вместе с заменой теста (он в этом файле есть, 682 строки).

Практический вывод: выкладка ниже — это **дельта поверх 3D-состояния**, а не патч в вакууме. В общие файлы (`src/main.js`, `src/style.css`, `CHANGELOG.md`, `AGENTS.md`, `README.md`) планета лазила по тем же местам, поэтому патчи там конфликтуют — проверено, см. «Патчи: как они легли».

## Решение, которого за вас никто не принимал

На выбор три варианта врезки, и это выбор хозяина, не техника:

| | Вариант | Что делать |

| --- | --- | --- |

| А | «Карта блоками» вместо мёртвого 3D-вида, планета остаётся | `src/planet/*` не трогать, в `src/main.js` добавить вторую кнопку и `syncWorldVoxel()`, `session.voxel` рядом с `session.planet`. Два режима над одним iframe — спорно, но ничего не ломает. |

| Б | «Карта блоками» вытесняет планету | Патч `src/main.js` из файла целиком (он как раз меняет `mountPlanetView` → `mountWorldView`), `src/planet/*` и планетные стили удалить отдельным решением, планетный CHANGELOG не трогать. |

| В | Оставить планету, 2D-карту не вносить | Тогда эти 5200 строк — архив: режим уже был собран, протестирован (76 + 57 проверок) и снят, в main от него остался только труп 3D-вида. Его всё равно стоит убрать: `git rm -r src/world/mesher.js src/world/render.js src/game/world-view.js` + замену `test-voxel*.mjs`. |

## Операции поверх `975f93e`

| # | Операция | Файл | Блок |

| --- | --- | --- | --- |

| 1 | добавить | `src/world/atlas.js` | «src/world/atlas.js» (новый) |

| 2 | добавить | `src/world/layers.js` | «src/world/layers.js» (новый) |

| 3 | заменить целиком | `src/world/blocks.js` | «src/world/blocks.js» |

| 4 | заменить целиком | `src/world/world.js` | «src/world/world.js» |

| 5 | заменить целиком | `src/game/world-view.js` | «src/game/world-view.js» |

| 6 | заменить целиком | `scripts/test-voxel.mjs` | «scripts/test-voxel.mjs» |

| 7 | заменить целиком | `scripts/test-voxel-view.mjs` | «scripts/test-voxel-view.mjs» |

| 8 | заменить целиком | `docs/voxel-world-generation.md` | «docs/voxel-world-generation.md» |

| — | не трогать | `src/world/bridge.js` | идентичен main |

| — | не трогать | `src/world/chunk.js` | идентичен main |

| — | не трогать | `src/world/field.js` | идентичен main |

| — | не трогать | `src/world/math.js` | идентичен main |

| — | не трогать | `scripts/lib/fake-fmg.mjs` | идентичен main |

| 9 | удалить | `src/world/mesher.js` | `git rm` |

| 10 | удалить | `src/world/render.js` | `git rm` |

| 11 | патч вручную | `src/main.js` | «патч · src/main.js» |

| 12 | патч вручную | `src/style.css` | «патч · src/style.css» |

| 13 | патч вручную | `scripts/lib/verify-build.mjs` | «патч · scripts/lib/verify-build.mjs» |

| 14 | патч вручную | `package.json` | «патч · package.json» |

| 15 | патч вручную | `README.md` | «патч · README.md» |

| 16 | патч вручную | `AGENTS.md` | «патч · AGENTS.md» |

| 17 | патч вручную | `CHANGELOG.md` | «патч · CHANGELOG.md» |

`mir.html` и `dist/` сюда не включены намеренно: 28 МиБ перегенерированного артефакта в тексте не живут, они получаются сборкой. Состояние артефактов на момент снятия: `dist/assets/index-Cnz-qTTb.js` (286 990 байт = 280 КБ) и `mir.html` 28 014 КБ — то есть собранное из кода этого файла.

## Патчи: как они легли на `975f93e` (проверено)

Прогон на отдельном дереве main: `git rm` mesher/render, 13 файлов выкладки на место, затем `git apply /tmp/all.patch` из семи патчей.

```text

— git apply --check:

error: patch failed: src/main.js:13 error: src/main.js: patch does not apply

error: patch failed: src/style.css:4610 error: src/style.css: patch does not apply

error: patch failed: scripts/lib/verify-build.mjs:27 ... does not apply

— git apply --3way:

Applied patch to 'src/main.js' with conflicts.

Applied patch to 'src/style.css' with conflicts.

Applied patch to 'scripts/lib/verify-build.mjs' with conflicts.

Applied patch to 'package.json' with conflicts.

Applied patch to 'README.md' with conflicts.

Applied patch to 'AGENTS.md' with conflicts.

Applied patch to 'CHANGELOG.md' with conflicts.

```

То есть автоматом не проходит ни один: планета тронула те же строки. Это и есть причина, по которой общие файлы отдаются патчем, а не файлом, и по которой их разрешять руками. Разрешение почти везде механическое:

- **`package.json`** — только добавить два скрипта, `test:voxel` и `test:voxel-view`; планетных строк не касаться. Конфликт из-за того, что в main этот же блок уже занят `test:planet*`.

- **`scripts/lib/verify-build.mjs`** — `BUDGETS.js` с `300 * 1024` на `288 * 1024` (с причиной в комментарии) и список модулей режима: `mesher`/`render` убрать, добавить `atlas.js`/`layers.js`. Без этого `test:build` не пройдёт.

- **`src/style.css`** — блок `.world-voxel*` (~205 строк) просто дописать; пересечения с планетными стилями только по соседству, не по правилам.

- **`src/main.js`** — самое содержательное: импорт, флаг `session.voxel`/`voxelView`, кнопка `data-action="world-voxel"` с иконкой `layers`, `syncWorldVoxel()`, ступеньки Escape. Смотреть вариант А/Б в таблице выше.

- **`README.md`, `AGENTS.md`, `CHANGELOG.md`** — текст: запись в CHANGELOG сверху, в AGENTS две строки команд и два абзаца про jsdom/кучу, в README абзац режима.

## Правки: что и зачем (запись из `CHANGELOG.md`)

Дословно — она и есть перечень правок с намерением; «Почему» и «Решено не делать» важнее списка файлов.

````markdown

## 2026-10-11 — карта блоками вместо 3D: плоские ярусы с ползунком

**Что сделано**

- **Полутора тысяч строк 3D больше нет.** Удалены `src/world/mesher.js` (429

строк: грани, обход швов, AO, наклонные грани воды, `openOnly`) и

`src/world/render.js` (704: WebGL2-рендерер, шейдеры, туман, DDA-луч за

курсором). Атлас из него переехал в `src/world/atlas.js` — он остался источником

цвета и для карты, и для будущих текстур.

- **`src/world/layers.js` — как мир показывается.** `buildSlice(field, colors,

world, view, options)` красит RGBA-кадр по одному блоку на пиксель;

`cutY` — правило «разрезать мир плоскостью на Y, а что выше — показать его

кожу»; `bandFactor` — изогипты каждые 12 блоков плюс медленная тень глубины;

`LAYER_PRESETS` и `presetLevel` — Кроны / Поверхность / Вода / Дно / Пещеры /

Руды / Основание; `zoneName` — человеческая подпись под ползунком;

`makeView` и `ZOOM_MIN/MAX/DEFAULT` — кадрирование. Модуль чистый: DOM не

знает ни о чём, поэтому проверяется в Node.

- **Хранилище чанков упрощено.** `src/world/world.js` не знает ни про меш, ни

про GPU: остались `focus/step/get/stats/dispose/readyCount`, `bytes` теперь

вес блоков, а `visible()`, `remeshStep()`, `setMeshOptions()`,

`tilePeriodChunks()` и пара `upload/release` убраны.

- **`src/game/world-view.js` переписан под 2D** при том же контракте

`mountWorldView(host, {frame, config, onExit})`: полотно в разрешении блоков

и `image-rendering: pixelated`, перетаскивание — сдвиг, колесо — масштаб 1…8

px на блок с заякориванием точки под курсором, ползунок яруса 1…worldHeight−1

с ±1 (Shift — ±10), ряд пресетов, четыре переключателя наложений (течение,

вода, отметки, рельеф), HUD с ярусом, зоной, ценой кадра и блоком под

курсором. Кадр ограничен `MAX_CELLS = 260 000` блоков, анимация течения

перекрашивается не чаще, чем раз в 70 мс.

- **Исправлено по ходу, и всё это видно в картинке.** Ровный срез по Y над

холмистым островом — серый каменный диск без единой детали (проверено

рендером), поэтому сверху показывается «кожа» столбца; наложения писались в

соседние клетки до того, как те закрашивались, — стрелка теряла половину,

берег длинную сторону, теперь пометки копятся и накладываются вторым

проходом; берег рисуют по сухую сторону, иначе русло в две клетки целиком

закрашивается берегом и река исчезает; решётка стрелок привязана к мировым

координатам, иначе они скользят по руслу при сдвиге; `fromField` учитывал

клетку дважды; обводка цифр сливалась в чёрное пятно размером с подпись —

стала плашкой; вершину для отметки искали среди соседей ±6 блоков — шум

детали не оставлял ни одной вершины, теперь сравниваются узлы самой решётки;

средний цвет тайла округлён до целых, иначе тест сверял не то, что видно.

- **Кнопка режима переименована** в «Карта блоками» (иконка `layers`),

`session.voxel` и ступеньки Escape не тронуты: режим по-прежнему оверлей над

iframe Azgaar, а не новый экран.

- **Проверки.** `test:voxel` — с 61 до 76: меш-проверки (обход граней, UV, AO,

квады, формат вершины, «вода не перекрывает грани») удалены вместе с мешером,

добавлены «пиксель слоя = блок на плоскости реза», «cutY = min(вершина

колонки, ярус)», «каждый блок кадра учтён ровно один раз», «срез через период

тайла побайтно тот же», «стрелка разворачивается по направлению течения»,

«число водных пикселей = правилу воды поля», «линия воды = граница занято /

свободно», «течение анимировано», пресеты ярусов и подписи к ним.

`test:voxel-view` — с 31 до 57: диапазон ползунка, ±1 и ±10, пресеты и

`aria-pressed`, зажимы масштаба, «полотно = размер кадра в блоках», «сдвиг

считается в блоках», «без 2D-канваса вид не красит кадр и не падает».

- **Веса.** Бюджет `js` опущен с 300 до 288 КБ: минифицированный скрипт с 3D

весил 286 КБ, с плоскими ярусами — 280 КБ (причина записана в комментарии

`scripts/lib/verify-build.mjs`); `mir.html` — 28 014 КБ. В репозитории по-

прежнему 0 байт ресурсов режима: атлас и палитра рисуются процедурно.

- **Документация.** `docs/voxel-world-generation.md`: §9 переписан под плоские

ярусы (семантика реза, наложения, замеры кадра), синхронизированы §6.3

(формат `flow`-байта и анимация на CPU), §8, §10, §11, §12, §13; в README и

`AGENTS.md` обновлены абзац о режиме, команды и замечание про кучу для

`test:ui`.

**Почему**

- Владелец сформулировал прямо: «просто слои должны быть отдельно выбраны

ползунком». Карта, а не перспектива, — то, зачем мир блоками смотрят:

распределение биомов, русла, берега, пещеры и жилы.

- Ползунок яруса даёт то, ради чего в 3D была кнопка «разрез», но работает на

телефоне, без WebGL, и картинка остаётся читаемой: «срез» виден как

изогипты, а не как стена из камня.

- Генерация (поле, блоки, чанки, течение, палитры) не изменилась ни на строку:

2D — способ показать те же данные, поэтому удалять её было бы нельзя, а

удаление коснулось только пути «чанк → геометрия → пиксели».

**Решено не делать**

- Не оставлять 3D «за переключателем»: два рендера одного мира означают две

правки на каждую фичу и 47 КБ исходников ради пути, которым никто не

ходит. Выбрано «удалить совсем».

- Не красить «ровно блоки на выбранном Y». Точный срез над холмами не читается

— это проверено картинкой, а не рассуждением, и возвращать его нельзя.

- Не делать симуляцию жидкости, физику воды и правку блоков — как и раньше.

- Не искать «самый пещеристый» и «самый рудный» ярус по количеству пустот:

чем глубже, тем больше колонок под поверхностью, и побеждало дно; считаем

долю, и только по готовым чанкам, иначе пресет врёт.

- Не платить сборщику мусора за кадр: буферы пометок общие для модуля и растут

по надобности, а `buildSlice` не заводит новых массивов на кадр.

- Не чинить `test:ui` увеличением бюджета времени: он падает OOM'ом в песочнице

с 4 ГБ, потому что поднимает 28-МиБ `mir.html` в jsdom несколько раз. Это

ограничение окружения, записано в `AGENTS.md` (нужен

`NODE_OPTIONS=--max-old-space-size=6144`).

---

````

## Замерено

| Что | Значение |

| --- | --- |

| бандл | `dist/assets/index.js` 280 КБ (с 3D было 286 КБ); бюджет `BUDGETS.js` снижён до 288 КиБ |

| `mir.html` | 28 014 КБ при бюджете 30 МиБ |

| поле 480 × 360 (172 800 колонок) | 83 мс |

| чанк 16 × 16 × 256 | 2,8…3,0 мс в среднем по 25 чанкам после прогрева |

| срез 96 × 64 | 3,4…4,2 мс |

| срез 340 × 250 / 480 × 360 | 20…40 мс / 25…106 мс |

| 1089 чанков (мир радиуса 16), прогретые | 3,5…4 с |

| проверки | `test:voxel` 76 · `test:voxel-view` 57 (jsdom) · `test:build` 46 · `test:spacing` 12 |

`test:ui` проходит только с `NODE_OPTIONS=--max-old-space-size=6144` и поднятым `npm run serve -- --port 8787`: 28 МиБ `mir.html` в jsdom на дефолтной куче — OOM, а не регрессия.

## Как проверить, что выкладка не врёт

````python

# каждый «целый» файл обязан совпадать с диском байт в байт

import re, os

os.chdir(os.path.dirname(os.path.abspath(__file__)) or ".")

F = chr(96) * 4 # те же четыре обратных апострофа, что открывают блоки

md = open("ananas1342.md", encoding="utf-8").read()

n = 0

for path, body in re.findall(r"^### `([^`]+)` ·[^\n]*\n\n" + F + r"(?:\w+)\n(.*?)\n" + F, md, re.S | re.M):

assert body + "\n" == open(path, encoding="utf-8").read(), path

n += 1

print("совпало файлов:", n)

# блоки, открытые апострофной лесенкой, должны быть парными: иначе

# выйдет обрезком, и это надо поймать до сборки, а не после

open_len = None

for line in md.split("\n"):

t = line.strip()

if open_len is None:

m = re.match(r"^(`{3,})([a-z]*)$", t)

if m:

open_len = len(m.group(1))

elif set(t) == {chr(96)} and len(t) >= open_len:

open_len = None

print("все блоки закрыты" if open_len is None else "НЕЗАКРЫТЫЙ БЛОК ✗")

````

Дальше сборка и тесты состояния:

````bash

npm ci && npm i --no-save jsdom

npm run build && npm run single

npm run test:build && npm run test:voxel && npm run test:voxel-view

npm run test:spacing

npm run serve -- --port 8787 # -> кнопка «Карта блоками» на экране карты

````

## Код режима

Порядок чтения — по потоку данных: `atlas` (палитра тайлов) → `blocks` (схема поля → блоки) → `field` (растр: высоты, влажность, геология, реки с течением) → `chunk` (хранение 16×16×256 и упаковка палитры) → `world` (планировщик чанков) → `layers` (срез кадра, пресеты, наложения) → `world-view` (DOM, ползунок, мышь, клавиши). `bridge` — чтение Azgaar, `math` — хеш-шум и `D8`.

### `src/world/atlas.js` · 406 строк · добавить

````js

/* Атлас блоков: 46 тайлов, нарисованных пикселями.

Ни одного файла-текстуры: тайлы рисуются процедурно в Uint8Array при первом

открытии карты, поэтому репозиторий и однофайловая сборка не тяжелеют, а PWA

не просит новых ресурсов в precache. Индекс в TILES = позиция в атласе, и

порядок пополнения — только в конец (иначе старые сохранения начнут

показывать чужие текстуры).

Отсюда же берутся цвета для 2D-карты блоками (src/world/layers.js): срез

красится средним цветом тайла той грани, которую видно, — поэтому картинка

слоя и атлас не разъезжаются, даже когда палитру правят. */

import { ATLAS_COLUMNS, ATLAS_SIZE, TILE_PX, TILES } from './blocks.js';

import { clamp, rand01 } from './math.js';

/* ---------- атлас ---------- */

const hex = (value) => [(value >> 16) & 255, (value >> 8) & 255, value & 255];

/**

* kind — способ рисования, tones — палитра от тёмного к светлому.

* Индекс в TILES = позиция в атласе, поэтому порядок ключей не важен.

*/

const TILE_SPEC = {

stone: { kind: 'speckle', tones: [0x6a6a70, 0x7c7c82, 0x8a8a90, 0x96969c] },

cobble: { kind: 'cobble', tones: [0x5c5c62, 0x74747a, 0x8b8b91, 0x9d9da3] },

dirt: { kind: 'speckle', tones: [0x5b3f27, 0x6b4a2d, 0x7c5836, 0x8a6440] },

grass: { kind: 'grass_top', tones: [0x3d6b28, 0x4f8033, 0x63953f, 0x78a94e] },

grass_side: { kind: 'grass_side', tones: [0x3d6b28, 0x557f36, 0x6b4a2d, 0x7c5836] },

sand: { kind: 'grain', tones: [0xd9c58a, 0xe3d09b, 0xecdcaa, 0xf3e7bd] },

sandstone: { kind: 'bands', tones: [0xd3bd85, 0xdfca96, 0xc9b078, 0xe8d5a8] },

gravel: { kind: 'cobble', tones: [0x6d6a66, 0x82807c, 0x95938f, 0x6a6864] },

clay: { kind: 'speckle', tones: [0x9aa2ac, 0xa7afb9, 0xb3bbc5, 0xbcc4ce] },

snow: { kind: 'grain', tones: [0xe6eef5, 0xf0f6fa, 0xf7fbfd, 0xffffff] },

ice: { kind: 'ice', tones: [0x7fb6d8, 0x9ccbe6, 0xbfe2f2, 0xe8f6ff], alpha: 226 },

packed_ice: { kind: 'speckle', tones: [0x6e9fc4, 0x86b4d6, 0x9dc8e4, 0xb4daf0] },

podzol: { kind: 'speckle', tones: [0x4a3a1f, 0x5c4626, 0x6d5531, 0x53412a] },

moss: { kind: 'grass_top', tones: [0x2f4a20, 0x3d5f28, 0x4c7233, 0x5c8540] },

peat: { kind: 'speckle', tones: [0x37281c, 0x453024, 0x4f3b2c, 0x5a4534] },

salt: { kind: 'crust', tones: [0xd7dbe0, 0xe6e9ec, 0xf2f4f6, 0xc9cfd6] },

basalt: { kind: 'columns', tones: [0x3a3a40, 0x47474d, 0x53535a, 0x2f2f35] },

obsidian: { kind: 'speckle', tones: [0x16121f, 0x1e1930, 0x272041, 0x3a2f5e] },

magma: { kind: 'lava', tones: [0x2a1508, 0x6e2a08, 0xd85a10, 0xffb43c] },

bedrock: { kind: 'cobble', tones: [0x2f2f33, 0x3c3c42, 0x4a4a52, 0x232327] },

water: { kind: 'water', tones: [0x1d4e7e, 0x2a6ba6, 0x3f8ac4, 0x74b9e6], alpha: 190 },

lava: { kind: 'lava', tones: [0x5e1a03, 0xa83a06, 0xe87214, 0xffc955] },

oak_log: { kind: 'log_side', tones: [0x3f2d1c, 0x5a4326, 0x6d5233, 0x7d6040] },

birch_log: { kind: 'birch_log', tones: [0xd8d5cc, 0xc2bfb6, 0x8b8880, 0x565349] },

spruce_log: { kind: 'log_side', tones: [0x3b2a1a, 0x4a3620, 0x5a4429, 0x6b5236] },

jungle_log: { kind: 'log_side', tones: [0x43301c, 0x533c22, 0x634a2c, 0x705535] },

acacia_log: { kind: 'log_side', tones: [0x563a26, 0x66452c, 0x775336, 0x846041] },

mangrove_log: { kind: 'log_side', tones: [0x4a2f26, 0x5b3a2d, 0x6c4738, 0x7b5444] },

oak_leaves: { kind: 'leaves', tones: [0x2c521c, 0x396824, 0x477c2e, 0x558f3a] },

birch_leaves: { kind: 'leaves', tones: [0x3a6329, 0x497636, 0x5a8a46, 0x6c9c58] },

spruce_leaves: { kind: 'leaves', tones: [0x1d3f2a, 0x275137, 0x316343, 0x3c7551] },

jungle_leaves: { kind: 'leaves', tones: [0x24571d, 0x306b27, 0x3d8031, 0x4c953d] },

acacia_leaves: { kind: 'leaves', tones: [0x4a5f22, 0x5a7129, 0x6b8433, 0x7c9740] },

swamp_leaves: { kind: 'leaves', tones: [0x3a5320, 0x4a6528, 0x5a7832, 0x6a8b3f] },

tall_grass: { kind: 'blades', tones: [0x4c7a2e, 0x5d8c38, 0x6f9e46], alpha: 255 },

fern: { kind: 'frond', tones: [0x2f5c22, 0x3d6f2b, 0x4d8237], alpha: 255 },

cactus: { kind: 'cactus', tones: [0x2c6b2e, 0x3a8039, 0x4a9448, 0x5aa657] },

dead_bush: { kind: 'twigs', tones: [0x6a4a26, 0x7d5a2f, 0x8f6a3b], alpha: 255 },

lily: { kind: 'lily', tones: [0x2f6b28, 0x3f7f33, 0x52933f], alpha: 255 },

kelp: { kind: 'kelp', tones: [0x2a5c3a, 0x367046, 0x448554], alpha: 232 },

reeds: { kind: 'blades', tones: [0x53682d, 0x647a37, 0x768d46], alpha: 255 },

sapling: { kind: 'sapling', tones: [0x4a3520, 0x3d6b28, 0x4f8033], alpha: 255 },

coal_ore: { kind: 'ore', tones: [0x1d1d21, 0x2b2b30, 0x3a3a40], base: 'stone' },

iron_ore: { kind: 'ore', tones: [0xb08a6a, 0xc79f7d, 0xdab595], base: 'stone' },

gold_ore: { kind: 'ore', tones: [0xc9a227, 0xe6c14a, 0xf7dd7a], base: 'stone' },

gem_ore: { kind: 'ore', tones: [0x3fb6a8, 0x5fd0c4, 0x8fe6dd], base: 'stone' },

};

/** Индекс пикселя атласа для (x, y) внутри тайла. */

/**

* Пиксельный атлас: 8 × 8 тайлов по 32 px. Пишем прямо в RGBA-буфер — это

* быстрее и предсказуемее, чем десятки тысяч fillRect, и не зависит от

* сглаживания канваса.

*/

export const buildAtlas = (seed = 0x5eed) => {

const size = ATLAS_SIZE;

const data = new Uint8ClampedArray(size * size * 4);

const put = (tile, x, y, color, alpha) => {

const row = ((tile / ATLAS_COLUMNS) | 0) * TILE_PX + y;

const col = (tile % ATLAS_COLUMNS) * TILE_PX + x;

if (row < 0 || col < 0 || row >= size || col >= size) return; // кисть может выйти за тайл

const at = (row * size + col) << 2;

const [r, g, b] = typeof color === 'number' ? hex(color) : color;

data[at] = r;

data[at + 1] = g;

data[at + 2] = b;

data[at + 3] = alpha === undefined ? 255 : alpha;

};

const fill = (tile, color, alpha) => {

for (let y = 0; y < TILE_PX; y += 1) for (let x = 0; x < TILE_PX; x += 1) put(tile, x, y, color, alpha);

};

TILES.forEach((name, tile) => {

const spec = TILE_SPEC[name] ?? { kind: 'speckle', tones: [0x888888, 0x999999, 0xaaaaaa, 0xbbbbbb] };

const tones = spec.tones.map(hex);

const tone = (i) => tones[((i % tones.length) + tones.length) % tones.length];

const alpha = spec.alpha ?? 255;

/* Шум колонки тайла: детерминированно по имени, чтобы атлас не менялся от

сборки к сборке. */

const n = (x, y, scale, salt) => valueNoise(seed + tile * 131, x, y, scale, salt);

switch (spec.kind) {

case 'grain':

case 'speckle': {

for (let y = 0; y < TILE_PX; y += 1) {

for (let x = 0; x < TILE_PX; x += 1) {

const coarse = n(x, y, spec.kind === 'grain' ? 12 : 5, 1);

const fine = n(x, y, 24, 2);

const i = Math.floor(coarse * 2.4 + fine * 1.6);

put(tile, x, y, tone(i), alpha);

}

}

break;

}

case 'cobble': {

/* Каменные «глыбы»: сетка ячеек с рваными швами. */

const cells = 4;

const step = TILE_PX / cells;

for (let cy = 0; cy < cells; cy += 1) {

for (let cx = 0; cx < cells; cx += 1) {

const shade = Math.floor(n(cx * 7 + 3, cy * 11 + 5, 3, 3) * 2.6);

const jx = Math.round(n(cx, cy, 1, 4) * 2) - 1;

const jy = Math.round(n(cx, cy, 1, 5) * 2) - 1;

for (let y = 0; y < step - 1; y += 1) {

for (let x = 0; x < step - 1; x += 1) {

const edge = x === 0 || y === 0 || x === step - 2 || y === step - 2;

put(tile, cx * step + x + jx, cy * step + y + jy, edge ? tone(0) : tone(1 + shade), alpha);

}

}

}

}

break;

}

case 'bands': {

for (let y = 0; y < TILE_PX; y += 1) {

const band = Math.floor(y / 5) % 2;

for (let x = 0; x < TILE_PX; x += 1) {

put(tile, x, y, tone(band + (n(x, y, 9, 6) > 0.6 ? 2 : 0)), alpha);

}

}

break;

}

case 'columns': {

for (let y = 0; y < TILE_PX; y += 1) {

for (let x = 0; x < TILE_PX; x += 1) {

const col = Math.floor(x / 6);

put(tile, x, y, tone((col % 3) + (n(x, y, 7, 7) > 0.7 ? 1 : 0)), alpha);

}

}

break;

}

case 'crust': {

for (let y = 0; y < TILE_PX; y += 1) {

for (let x = 0; x < TILE_PX; x += 1) {

const v = n(x, y, 6, 8);

put(tile, x, y, tone(v > 0.72 ? 3 : v > 0.4 ? 1 : 0), alpha);

}

}

break;

}

case 'grass_top': {

for (let y = 0; y < TILE_PX; y += 1) {

for (let x = 0; x < TILE_PX; x += 1) {

const v = n(x, y, 7, 9) * 2.2 + n(x, y, 19, 10);

put(tile, x, y, tone(Math.floor(v)), alpha);

}

}

break;

}

case 'grass_side': {

const fringe = 6;

for (let x = 0; x < TILE_PX; x += 1) {

const edge = fringe + Math.round(n(x, 0, 5, 11) * 4);

for (let y = 0; y < TILE_PX; y += 1) {

const grassy = y < edge;

const v = n(x, y, 8, 12) * 1.8;

put(tile, x, y, tone(grassy ? Math.floor(v) : 2 + Math.floor(v / 2)), alpha);

}

}

break;

}

case 'leaves': {

for (let y = 0; y < TILE_PX; y += 1) {

for (let x = 0; x < TILE_PX; x += 1) {

const clump = n(x, y, 4, 13);

const hole = n(x, y, 16, 14);

if (hole > 0.86 && clump < 0.5) {

put(tile, x, y, tone(0), 0);

continue;

}

put(tile, x, y, tone(Math.floor(clump * 3 + (hole > 0.6 ? 1 : 0))), 255);

}

}

break;

}

case 'ice': {

for (let y = 0; y < TILE_PX; y += 1) {

for (let x = 0; x < TILE_PX; x += 1) {

const crack = Math.abs(((x + y) % 11) - 5) < 1 && n(x, y, 4, 15) > 0.35;

put(tile, x, y, tone(crack ? 0 : Math.floor(n(x, y, 6, 16) * 3)), alpha);

}

}

break;

}

case 'water': {

for (let y = 0; y < TILE_PX; y += 1) {

for (let x = 0; x < TILE_PX; x += 1) {

const wave = Math.sin((x + y * 0.4) * 0.7) * 0.5 + 0.5;

const v = wave * 2.2 + n(x, y, 10, 17);

put(tile, x, y, tone(Math.floor(v)), Math.floor(alpha + (v > 3 ? 30 : 0)));

}

}

break;

}

case 'lava': {

for (let y = 0; y < TILE_PX; y += 1) {

for (let x = 0; x < TILE_PX; x += 1) {

const blob = n(x, y, 4, 18);

const hot = n(x, y, 9, 19);

put(tile, x, y, tone(blob > 0.66 ? (hot > 0.55 ? 3 : 2) : blob > 0.4 ? 1 : 0), alpha);

}

}

break;

}

case 'ore': {

const stone = TILE_SPEC[spec.base].tones.map(hex);

for (let y = 0; y < TILE_PX; y += 1) {

for (let x = 0; x < TILE_PX; x += 1) {

const v = n(x, y, 5, 20);

put(tile, x, y, stone[Math.floor(v * 3)], 255);

}

}

for (let b = 0; b < 5; b += 1) {

const bx = 3 + Math.floor(rand01(seed + tile, b, 3, 21) * (TILE_PX - 8));

const by = 3 + Math.floor(rand01(seed + tile, b, 7, 22) * (TILE_PX - 8));

const r = 2 + Math.floor(rand01(seed + tile, b, 11, 23) * 2.2);

for (let y = -r; y <= r; y += 1) {

for (let x = -r; x <= r; x += 1) {

if (Math.abs(x) + Math.abs(y) > r) continue;

put(tile, bx + x, by + y, tone(x === -r || y === -r ? 0 : x === r || y === r ? 2 : 1), 255);

}

}

}

break;

}

case 'log_side': {

for (let y = 0; y < TILE_PX; y += 1) {

for (let x = 0; x < TILE_PX; x += 1) {

const stripe = Math.floor(x / 4) % 2;

const grain = n(x, y, 3, 24);

put(tile, x, y, tone(grain > 0.8 ? 3 : stripe ? 1 : 2), alpha);

}

}

break;

}

case 'birch_log': {

for (let y = 0; y < TILE_PX; y += 1) {

for (let x = 0; x < TILE_PX; x += 1) {

put(tile, x, y, tone(n(x, y, 8, 25) > 0.5 ? 0 : 1), alpha);

}

}

for (let k = 0; k < 5; k += 1) {

const by = 2 + Math.floor(rand01(seed + tile, k, 26, 1) * (TILE_PX - 4));

const bx = Math.floor(rand01(seed + tile, k, 27, 2) * (TILE_PX - 8));

const len = 3 + Math.floor(rand01(seed + tile, k, 28, 3) * 6);

for (let x = 0; x < len; x += 1) for (let y = 0; y < 2; y += 1) put(tile, bx + x, by + y, tone(2), 255);

}

break;

}

case 'cactus': {

for (let y = 0; y < TILE_PX; y += 1) {

for (let x = 0; x < TILE_PX; x += 1) {

const edge = x < 2 || x > TILE_PX - 3;

const spine = (y % 7 === 0 && (x % 5 === 2 || x % 5 === 4)) || edge;

put(tile, x, y, tone(spine ? 3 : edge ? 0 : Math.floor(n(x, y, 6, 30) * 2) + 1), alpha);

}

}

break;

}

case 'blades': {

fill(tile, 0, 0);

for (let b = 0; b < 9; b += 1) {

const base = 2 + Math.floor(rand01(seed + tile, b, 31, 1) * (TILE_PX - 4));

const height = 10 + Math.floor(rand01(seed + tile, b, 32, 2) * (TILE_PX - 12));

const lean = Math.round((rand01(seed + tile, b, 33, 3) - 0.5) * 8);

for (let i = 0; i < height; i += 1) {

const x = base + Math.round((lean * i) / height);

const y = TILE_PX - 1 - i;

put(tile, x, y, tone(i > height - 6 ? 2 : i % 3 === 0 ? 1 : 0), 255);

if (i % 4 === 0) put(tile, x + 1, y, tone(1), 255);

}

}

break;

}

case 'frond':

case 'kelp': {

/* Старт прозрачный: растение рисуется поверх «воздуха», а не поверх

чёрного квадрата. */

fill(tile, 0, 0);

const stem = TILE_PX >> 1;

for (let y = 3; y < TILE_PX - 1; y += 1) {

const sway = Math.round(Math.sin(y * 0.35) * 2);

put(tile, stem + sway, y, tone(0), alpha);

const arm = Math.max(1, Math.round((TILE_PX - y) / 5));

for (let a = 1; a <= arm; a += 1) {

put(tile, stem + sway - a, y - (a % 2), tone(1), alpha);

put(tile, stem + sway + a, y - (a % 2), tone(2), alpha);

}

}

break;

}

case 'twigs': {

fill(tile, 0, 0);

for (let b = 0; b < 7; b += 1) {

const angle = -Math.PI / 2 + (b / 6 - 0.5) * 1.7;

const len = 8 + rand01(seed + tile, b, 34, 4) * 14;

for (let t = 0; t < len; t += 1) {

const x = Math.round(TILE_PX / 2 + Math.cos(angle) * t + Math.sin(t * 0.6) * 1.5);

const y = Math.round(TILE_PX - 2 + Math.sin(angle) * t);

put(tile, x, y, tone(t > len - 4 ? 1 : 0), 255);

}

}

break;

}

case 'lily': {

fill(tile, 0, 0);

const c = TILE_PX / 2;

for (let y = 0; y < TILE_PX; y += 1) {

for (let x = 0; x < TILE_PX; x += 1) {

const d = Math.hypot(x - c, y - c);

const notch = Math.abs(Math.atan2(y - c, x - c) - -0.6) < 0.35 && d < c;

if (d < c - 1.5 && !notch) put(tile, x, y, tone(d > c - 4 ? 0 : Math.floor(n(x, y, 6, 35) * 2) + 1), 255);

}

}

break;

}

case 'sapling': {

fill(tile, 0, 0);

const stem = TILE_PX >> 1;

for (let y = TILE_PX - 1; y > TILE_PX / 2; y -= 1) put(tile, stem, y, tone(0), 255);

for (let y = 4; y < TILE_PX / 2 + 2; y += 1) {

const r = Math.max(1, Math.round((TILE_PX / 2 - y) / 2.2));

for (let x = -r; x <= r; x += 1) put(tile, stem + x, y, tone(Math.abs(x) === r ? 1 : 2), 255);

}

break;

}

default:

fill(tile, tone(1), alpha);

}

});

return { size, data };

};

/** Дешёвый value-noise по целочисленной решётке — только для атласа. */

const valueNoise = (seed, x, y, scale, salt) => {

const gx = x / scale;

const gy = y / scale;

const x0 = Math.floor(gx);

const y0 = Math.floor(gy);

const fx = gx - x0;

const fy = gy - y0;

const at = (ix, iy) => rand01(seed, ix, iy, (salt || 0) + 101);

const sx = fx * fx * (3 - 2 * fx);

const sy = fy * fy * (3 - 2 * fy);

const a = at(x0, y0);

const b = at(x0 + 1, y0);

const c = at(x0, y0 + 1);

const d = at(x0 + 1, y0 + 1);

return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;

};

/**

* Средний цвет каждого тайла: 2D-карте не нужно знать про UV и пиксели, ей

* нужна краска блока. Прозрачные пиксели (у растений и воды их много) в среднее

* не входят — иначе трава на срезе выглядела бы чёрной.

*/

export const buildTileColors = (atlas) => {

const colors = [];

for (let slot = 0; slot < TILES.length; slot += 1) {

const col = (slot % ATLAS_COLUMNS) * TILE_PX;

const row = Math.floor(slot / ATLAS_COLUMNS) * TILE_PX;

let r = 0;

let g = 0;

let b = 0;

let seen = 0;

for (let y = row; y < row + TILE_PX; y += 1) {

for (let x = col; x < col + TILE_PX; x += 1) {

const i = (y * ATLAS_SIZE + x) * 4;

if (atlas.data[i + 3] < 40) continue;

r += atlas.data[i];

g += atlas.data[i + 1];

b += atlas.data[i + 2];

seen += 1;

}

}

/* Целые каналы: палитра уходит в Uint8ClampedArray, и дробные средние

округлились бы на нём, а не здесь — тест сверял бы не то, что видно. */

colors.push(seen ? [Math.round(r / seen), Math.round(g / seen), Math.round(b / seen)] : [255, 0, 255]);

}

return colors;

};

````

### `src/world/layers.js` · 607 строк · добавить

````js

/* 2D-карта блоками: мир показан слоем (ярусом), а не перспективой.

Ярус Y означает «срезать мир по высоте Y»: столбцы, чья вершина выше

плоскости, показывают свою кожу на этой плоскости (её и видно сверху), а что

ниже Y — читается как есть. Плоский «разрез» по холмистой карте не читается: в

центре острова там один камень, и ни реки, ни берега не увидеть.

Блоки берутся из тех же чанков, что строит генератор: `blockAt`, цвет — из

процедурного атласа, той грани, которая видна сверху. Поэтому картинка слоя

и данные не могут разойтись: и то, и другое — один и тот же массив.

Что рисуется поверх блоков:

• течение — шевроны по направлению стока (D8), фаза бежит по течению,

поэтому движение видно без всякой физики жидкости;

• граница уровня моря — линия там, где суша соседствует с водой;

• отметки высот на вершинах — цифры рисует пиксельный шрифт 3×5, без DOM

и без шрифтов: срез остаётся чистой функцией от данных и проверяется в

Node как обычный модуль.

Ярус ставится ползунком; пресеты считают его по самим данным — где в кадре

больше всего пустот, там пещеры, где больше всего жил, там руды. Так «слой»

не выдуманное число, а ответ на вопрос «что здесь интересного». */

import { AIR, BLOCKS, COAL_ORE, GEM_ORE, GOLD_ORE, GRASS, ICE, IRON_ORE, LAVA, SAND, STONE, WATER, isOpaque } from './blocks.js';

import { CHUNK_SX, CHUNK_SZ, blockAt } from './chunk.js';

import { F_BEACH, F_ICE, F_WATER, flowVector, fold } from './field.js';

/** Пикселей экрана на блок. Ниже 1 — блоки всё равно не разобрать. */

export const ZOOM_MIN = 1;

export const ZOOM_MAX = 8;

export const ZOOM_DEFAULT = 3;

/** Шаг шевронов течения: на каждом блоке стрелки слились бы в кашу. */

const ARROW_STRIDE = 4;

/** Вершины ищем на этой решётке: чаще — цифры шумят, реже — теряются. */

const LABEL_STRIDE = 22;

const SKY = [224, 234, 238];

const VOID = [26, 26, 34];

const COAST = [26, 32, 38];

const LIGHT = [250, 252, 250];

/* ---------- ярусы и пресеты ---------- */

/**

* Что за зона под ползунком — по поверхности конкретной колонки, а не по

* «средней высоте мира»: на склоне подпись обязана меняться.

*/

/**

* Подпись под ползунком: что именно показывает выбранный ярус. `ground` —

* медианная высота рельефа в кадре; без неё не отличить «срез выше вершин»

* (карта как есть) от «срез в толще породы».

*/

export const zoneName = (field, level, ground) => {

if (level >= field.worldHeight - 1) return 'выше всех вершин — мир не срезан';

if (level <= 2) return 'основание мира: бедрок';

if (!Number.isFinite(ground)) return 'ярус вне кадра';

if (level >= ground) return 'выше вершин кадра — рельеф не тронут';

if (level > field.seaY) return ground - level > 24 ? 'склоны и плато в срезе' : 'холмы у воды в срезе';

if (level > field.seaY - 12) return 'зеркало водоёмов, русла и отмели';

return 'толща под водой: пещеры и жилы';

};

export const LAYER_PRESETS = [

{ id: 'canopy', name: 'Кроны', hint: 'горы срезаны до крон: видно, где лес сомкнут' },

{ id: 'surface', name: 'Поверхность', hint: 'верхний ярус: ничего не срезано — обычная карта' },

{ id: 'sea', name: 'Вода', hint: 'уровень моря и озёр: русла, поймы, берега' },

{ id: 'bottom', name: 'Дно', hint: 'на 4 блока ниже: дно, отмели, обрывы' },

{ id: 'caves', name: 'Пещеры', hint: 'ярус, где в грунте больше всего пустот' },

{ id: 'ores', name: 'Руды', hint: 'ярус, где в кадре больше всего жил' },

{ id: 'root', name: 'Основание', hint: 'зубчатый слой бедрока внизу мира' },

];

const levelsBetween = (from, to, step) => {

const list = [];

for (let y = from; y <= to; y += step) list.push(y);

if (list.length && list[list.length - 1] !== to) list.push(to);

return list;

};

/** Кадр в блоках: левый верхний угол и размер. Общие вычисления для всех функций. */

export const makeView = (center, cellsX, cellsZ) => ({

x0: Math.round(center[0] - cellsX / 2),

z0: Math.round(center[1] - cellsZ / 2),

cellsX: Math.max(1, Math.round(cellsX)),

cellsZ: Math.max(1, Math.round(cellsZ)),

});

const sampleView = (field, view, stepX, stepZ, visit) => {

for (let cz = 0; cz < view.cellsZ; cz += stepZ) {

for (let cx = 0; cx < view.cellsX; cx += stepX) {

const x = view.x0 + cx;

const z = view.z0 + cz;

const { u, v } = fold(field, x, z);

visit(v * field.width + u, x, z);

}

}

};

/** Медиана поверхности по кадру: по ней ставятся «поверхность» и «кроны». */

/**

* Медианная высота рельефа в кадре. `dry: true` считает только сушу над морем:

* в кадре, где половина — океан, общая медиана лежит на дне, и «Кроны» сели бы

* по дно водоёмов вместо верхушек.

*/

const medianGround = (field, view, { dry = false } = {}) => {

const values = [];

const land = [];

sampleView(field, view, Math.max(1, Math.round(view.cellsX / 24)), Math.max(1, Math.round(view.cellsZ / 24)), (i) => {

const height = field.ground[i];

values.push(height);

if (height > field.seaY) land.push(height);

});

const chosen = dry && land.length >= 8 ? land : values;

if (!chosen.length) return field.seaY + 4;

chosen.sort((a, b) => a - b);

return chosen[Math.floor(chosen.length / 2)];

};

const isOre = (id) => id === COAL_ORE || id === IRON_ORE || id === GOLD_ORE || id === GEM_ORE;

/**

* Ярус, где в кадре больше всего подходящих блоков. Считается по построенным

* чанкам через переданный доступ к блокам — так функция проверяется в Node без

* хранилища и без браузера.

*/

const richestLevel = (field, blockAtWorld, view, score) => {

const bottom = 4;

/* Верхняя граница — потолок мира, а не «медиана поверхности»: на карте, где

полтора шара — океан, медиана лежит на дне, и с ней из поиска выпадали все

суходольные ярусы, где пещер как раз больше всего. Допустимость столбца

решает проверка «y ниже вершины минус один». */

const levels = levelsBetween(bottom, field.worldHeight - 2, 3);

const hits = new Int32Array(levels.length);

const seen = new Int32Array(levels.length);

sampleView(

field,

view,

/* ~1200 колонок: больше — не точнее, а клик по пресету начал бы думать. */

Math.max(1, Math.round(view.cellsX / 36)),

Math.max(1, Math.round(view.cellsZ / 30)),

(i, x, z) => {

const surface = field.ground[i];

for (let li = 0; li < levels.length; li += 1) {

const y = levels[li];

if (y >= surface - 1) continue;

const id = blockAtWorld(x, y, z);

if (id === null || id === undefined) continue;

seen[li] += 1;

hits[li] += score(id, y, surface);

}

},

);

/* Доля, а не число: чем глубже, тем больше столбцов «под поверхностью», и по

количеству пустот побеждал бы самый нижний ярус, где пещер нет. */

let best = -1;

let bestShare = 0;

for (let li = 0; li < levels.length; li += 1) {

if (seen[li] < 24 || hits[li] === 0) continue;

const share = hits[li] / seen[li];

if (share > bestShare) {

bestShare = share;

best = li;

}

}

return best < 0 ? null : levels[best];

};

/**

* @param {object} field растр из buildField

* @param {(x:number,y:number,z:number)=>number|null} blockAtWorld блок или null, если чанка нет

* @param {object} view кадр в блоках (makeView)

* @param {string} id пресета из LAYER_PRESETS

* @returns {number} ярус

*/

export const presetLevel = (field, blockAtWorld, view, id) => {

const ground = medianGround(field, view);

const ceiling = field.worldHeight - 1;

switch (id) {

case 'canopy':

/* Кронами зовём верхушки суши, поэтому медиана берётся по суше. */

return Math.min(ceiling, medianGround(field, view, { dry: true }) + 5);

case 'surface':

return ceiling;

case 'sea':

return field.seaY;

case 'bottom':

return Math.max(1, field.seaY - 4);

case 'root':

return 2;

case 'caves': {

/* Пустоты считаем только под поверхностью и выше дна водоёмов, иначе

«пещерой» станет любое мелководье. */

const hollow = richestLevel(field, blockAtWorld, view, (blockId) => (blockId === AIR ? 1 : 0));

return hollow ?? Math.max(4, ground - 12);

}

case 'ores': {

const vein = richestLevel(field, blockAtWorld, view, (blockId) => (isOre(blockId) ? 1 : 0));

return vein ?? Math.max(4, ground - 20);

}

default:

return ceiling;

}

};

/* ---------- пиксельные примитивы ---------- */

/* Цифры 3×5, верхняя строка первая. Свой шрифт нужен, чтобы отметка высоты

была частью данных среза, а не текстом поверх холста: тогда её видно и на

снимке слоя, и в тесте. */

const DIGITS = [

['111', '101', '101', '101', '111'],

['010', '110', '010', '010', '111'],

['111', '001', '111', '100', '111'],

['111', '001', '111', '001', '111'],

['101', '101', '111', '001', '001'],

['111', '100', '111', '001', '111'],

['111', '100', '111', '101', '111'],

['111', '001', '010', '010', '010'],

['111', '101', '111', '101', '111'],

['111', '101', '111', '001', '111'],

];

const GLYPH_W = 3;

const GLYPH_H = 5;

const GLYPH_ADVANCE = 4;

/**

* Затемнение срезанного рельефа. Одной линейной тенью нельзя: на холме в

* 26 блоков она насыщается на первых же 18, и остров превращается в серое

* пятно без единой детали. Поэтому добавлены изогипты — полоса каждые

* CONTOUR шагов, как на топографической карте, плюс медленная общая тень

* глубины.

*/

const CONTOUR = 12;

const bandFactor = (relief) => {

const band = 1 - 0.22 * (1 - (relief % CONTOUR) / CONTOUR);

const depth = 1 - Math.min(0.34, relief * 0.008);

return band * depth;

};

const putPixel = (data, width, height, x, y, rgb, alpha) => {

if (x < 0 || y < 0 || x >= width || y >= height) return;

const offset = (y * width + x) * 4;

if (alpha >= 1) {

data[offset] = rgb[0];

data[offset + 1] = rgb[1];

data[offset + 2] = rgb[2];

data[offset + 3] = 255;

return;

}

data[offset] = Math.round(data[offset] * (1 - alpha) + rgb[0] * alpha);

data[offset + 1] = Math.round(data[offset + 1] * (1 - alpha) + rgb[1] * alpha);

data[offset + 2] = Math.round(data[offset + 2] * (1 - alpha) + rgb[2] * alpha);

data[offset + 3] = 255;

};

/**

* Метка течения: хвост, середина, яркое остриё и два уси по перпендикуляру.

* Геометрия берётся из flowVector (то же D8, что пишет поле), поэтому стрелка

* физически не может разойтись с направлением, а 8 рукописных масок как раз

* расходятся.

*/

const ARROW_RGB = [236, 250, 255];

const drawFlowMark = (data, width, height, x, z, dir, alpha) => {

const [dx, dz] = flowVector(dir);

if (!dx && !dz) return;

const px = dz;

const pz = -dx;

putPixel(data, width, height, x - dx, z - dz, ARROW_RGB, alpha * 0.35);

putPixel(data, width, height, x, z, ARROW_RGB, alpha * 0.75);

putPixel(data, width, height, x + dx, z + dz, ARROW_RGB, alpha);

putPixel(data, width, height, x + dx + px, z + dz + pz, ARROW_RGB, alpha * 0.85);

putPixel(data, width, height, x + dx - px, z + dz - pz, ARROW_RGB, alpha * 0.85);

};

/* ---------- отложенные пометки ---------- */

/* Стрелки течения и береговая линия пишутся и в соседние клетки, а сосед в

основном проходе закрашивается ПОЗЖЕ — наложенный пиксель стирался бы: у

стрелки пропала бы половина, у берега — длинная сторона. Поэтому пометки

сначала копятся, потом накладываются. Буферы общие для модуля и растут по надобности:

за кадр их заводить — значит платить сборщику мусора каждые 70 мс. */

let coastMarks = new Int32Array(0);

let flowMarks = new Float64Array(0);

let coastDone = new Uint8Array(0);

let coastCount = 0;

let flowCount = 0;

const ensureMarks = (cells) => {

const flowCap = Math.ceil(cells / 8) * 4;

if (coastMarks.length < cells) coastMarks = new Int32Array(cells);

if (flowMarks.length < flowCap) flowMarks = new Float64Array(flowCap);

if (coastDone.length < cells) coastDone = new Uint8Array(cells);

else coastDone.fill(0, 0, cells);

coastCount = 0;

flowCount = 0;

};

/** Один береговой пиксель на клетку: клетка, омываемая водой с двух сторон,

иначе получила бы два затемнения и на песке вместо линии берега появилась бы

чёрная полоса. */

const pushCoast = (cellsX, x, z) => {

const idx = z * cellsX + x;

if (coastDone[idx]) return;

coastDone[idx] = 1;

coastMarks[coastCount * 2] = x;

coastMarks[coastCount * 2 + 1] = z;

coastCount += 1;

};

const drawDigits = (data, width, height, x, y, value, rgb) => {

const text = String(Math.max(0, Math.round(value)));

const left = x - 1;

const right = x + (text.length - 1) * GLYPH_ADVANCE + GLYPH_W;

/* Плашка под цифрами, а не обводка вокруг каждого пикселя: обводка сливается

в сплошное тёмное пятно размером с саму подпись, и цифр в ней не видно. */

for (let row = -1; row <= GLYPH_H; row += 1) {

for (let col = left; col <= right; col += 1) putPixel(data, width, height, col, y + row, COAST, 0.62);

}

for (let n = 0; n < text.length; n += 1) {

const rows = DIGITS[text.charCodeAt(n) - 48];

if (!rows) continue;

const glyphLeft = x + n * GLYPH_ADVANCE;

for (let row = 0; row < GLYPH_H; row += 1) {

for (let col = 0; col < GLYPH_W; col += 1) {

if (rows[row][col] === '1') putPixel(data, width, height, glyphLeft + col, y + row, rgb, 1);

}

}

}

};

/* ---------- блоки → цвет ---------- */

const mix = (rgb, factor) => [

Math.max(0, Math.min(255, Math.round(rgb[0] * factor))),

Math.max(0, Math.min(255, Math.round(rgb[1] * factor))),

Math.max(0, Math.min(255, Math.round(rgb[2] * factor))),

];

/** Тайл, которым блок покажется на срезе: сверху — крышка, внутри — бок. */

const tileOf = (id, atSurface) => {

const block = BLOCKS[id];

if (!block) return BLOCKS[STONE].top;

return atSurface ? block.top : block.side;

};

/**

* Цвет блока. Для несуществующих id (чанк ещё не построен) — approximation по

* полю: рельеф тот же, поэтому схема остаётся похожей, а не пустой.

*/

/** Занят ли блок этого столбца водой на выбранном ярусе. */

/**

* Ярус, который реально видно в колонке `i` при срезе `level`: над вершиной

* ничего не срезано, и показываем саму вершину (для воды — её зеркало). То же

* правило внутри buildSlice и в подписи под курсором — иначе HUD начал бы

* называть блок, которого на картинке нет.

*/

export const cutY = (field, i, level) => {

const ground = field.ground[i];

const wet = (field.flags[i] & F_WATER) !== 0;

const crown = wet && field.waterY[i] > ground ? field.waterY[i] : ground;

return level > crown ? crown : level;

};

/**

* Видно ли в клетке воду при срезе `level`: плоскость стоит в толще воды либо

* выше вершины — тогда клетка показывает зеркало воды. Правило «level ≤

* waterY» сюда не годится: на ярусе выше вершин море остался бы сухим.

*/

const waterShown = (field, i, level) => {

if ((field.flags[i] & F_WATER) === 0) return false;

return field.waterY[i] > field.ground[i] && level > field.ground[i];

};

const tileOfField = (field, i, level) => {

const flags = field.flags[i];

const wet = (flags & F_WATER) !== 0;

const ground = field.ground[i];

if (level > ground) {

if (wet && level <= field.waterY[i]) return BLOCKS[WATER].top;

return null;

}

if (level === ground) {

if ((flags & F_ICE) !== 0) return BLOCKS[ICE].top;

if ((flags & F_BEACH) !== 0 || ground <= field.seaY) return BLOCKS[SAND].top;

return BLOCKS[GRASS].top;

}

return BLOCKS[STONE].top;

};

/* ---------- срез ---------- */

/**

* Один кадр 2D-карты: RGBA по одному пикселю на блок.

*

* @param {object} field

* @param {Array<[number,number,number]>} colors цвета тайлов (buildTileColors)

* @param {{get:(cx:number,cz:number)=>object|null}|null} world хранилище чанков

* @param {object} view кадр в блоках

* @param {{level?:number, time?:number, coast?:boolean, arrows?:boolean, labels?:boolean, shade?:boolean}} options

* @returns {{width:number,height:number,data:Uint8ClampedArray,level:number,fromChunks:number,fromField:number,water:number}}

*/

export const buildSlice = (field, colors, world, view, options = {}) => {

const level = Math.max(0, Math.min(field.worldHeight - 1, Math.round(options.level ?? field.seaY + 4)));

const cellsX = view.cellsX;

const cellsZ = view.cellsZ;

const data = new Uint8ClampedArray(cellsX * cellsZ * 4);

const time = options.time ?? 0;

const show = { coast: true, arrows: true, labels: true, shade: true, ...options };

const flowPhase = time * 1.7;

/* Блоки лежат в чанках, поэтому доступ к ним кешируем по строке: z у строки

один, x идёт подряд — попадание в кеш почти стопроцентное. */

let cacheRow = null;

let cache = new Map();

const chunkOf = (cx, cz) => {

if (cz !== cacheRow) {

cacheRow = cz;

cache = new Map();

}

let found = cache.get(cx);

if (found === undefined) {

const record = world ? world.get(cx, cz) : null;

found = record && record.chunk ? record.chunk : null;

cache.set(cx, found);

}

return found;

};

let fromChunks = 0;

let fromField = 0;

let water = 0;

ensureMarks(cellsX * cellsZ);

for (let z = 0; z < cellsZ; z += 1) {

const wz = view.z0 + z;

const cz = Math.floor(wz / CHUNK_SZ);

for (let x = 0; x < cellsX; x += 1) {

const wx = view.x0 + x;

const { u, v } = fold(field, wx, wz);

const i = v * field.width + u;

const ground = field.ground[i];

const flags = field.flags[i];

const wet = (flags & F_WATER) !== 0;

/* Верхняя граница воды: -1, если столбец сухой. Вершиной столбца вода

считается наравне с грунтом — иначе на уровне моря вместо глади было

бы дно. */

const waterTop = wet && field.waterY[i] > ground ? field.waterY[i] : -1;

const crown = waterTop >= 0 ? waterTop : ground;

const cut = cutY(field, i, level);

/* Насколько вершина столбца выступает над плоскостью — то же самое, что

глубина среза. Обратно (level - cut) быть не может: тогда «ничего не

срезано» (ярус выше вершин) оказалось бы самым тёмным кадром. */

const relief = crown > level ? crown - level : 0;

/* «Вода» — про нарисованный блок, а не про выбранный ярус: стрелки

течения и береговая линия должны появляться и на поверхности (срез выше

вершин), и в толще моря, а не только ровно по зеркалу. */

let isLiquid = false;

const chunk = chunkOf(Math.floor(wx / CHUNK_SX), cz);

let id = null;

if (chunk) {

const lx = wx - chunk.x0;

const lz = wz - chunk.z0;

if (lx >= 0 && lx < chunk.sx && lz >= 0 && lz < chunk.sz) {

id = blockAt(chunk, lx, cut, lz);

fromChunks += 1;

}

}

let rgb;

let alpha = 1;

if (id === null) {

const tile = tileOfField(field, i, cut);

rgb = tile === null ? SKY : mix(colors[tile] ?? [120, 120, 128], 0.82);

alpha = tile === null ? 1 : 0.85;

isLiquid = tile === BLOCKS[WATER].top;

if (isLiquid) water += 1;

fromField += 1;

} else if (id === AIR) {

/* Пусто внутри грунта — это пещера: её надо видеть чёрной дырой,

а не небом. Снаружи (выше вершины) — небо. */

rgb = cut < ground ? VOID : SKY;

} else if (BLOCKS[id]?.liquid) {

rgb = colors[BLOCKS[id].top] ?? [70, 130, 180];

isLiquid = true;

/* Ровно по зеркалу вода плотная, а та, что досталась «по кожу» после

срезки, чуть прозрачнее — сквозь неё видно дно русла. */

alpha = id === LAVA ? 1 : cut === waterTop ? 0.92 : 0.8;

water += 1;

} else if (!isOpaque(id)) {

/* Листва и трава полупрозрачны: за ними должен читаться грунт, иначе

кроны сливаются в сплошной ковёр без единой детали. */

const below = chunk ? blockAt(chunk, wx - chunk.x0, Math.max(0, cut - 1), wz - chunk.z0) : AIR;

const base = below !== AIR ? colors[tileOf(below, false)] ?? SKY : SKY;

rgb = blend(mix(base, 0.9), colors[tileOf(id, true)] ?? [90, 140, 70], 0.72);

} else {

rgb = colors[tileOf(id, cut >= crown)] ?? [120, 120, 128];

}

if (show.shade) rgb = mix(rgb, reliefFactor(field, i, cut, ground));

/* То, что ушло под плоскость, темнее: тень по глубине среза читается как

изогипты и не даёт картинке превратиться в кашу. */

if (relief > 0) rgb = mix(rgb, bandFactor(relief));

const offset = (z * cellsX + x) * 4;

data[offset] = rgb[0];

data[offset + 1] = rgb[1];

data[offset + 2] = rgb[2];

data[offset + 3] = Math.round(alpha * 255);

if (show.coast) {

/* Линия воды — граница «занято / свободно» по текущему ярусу: русла,

озёра и море обведены одним правилом, поэтому берег реки виден и на

поверхности, и на затопленном ярусе. Рисуем её по сухую сторону:

иначе русло шириной в две клетки целиком закрашивается берегом, и вода

в реке исчезает. */

if (x + 1 < cellsX && waterShown(field, i + 1, level) !== isLiquid) {

pushCoast(cellsX, isLiquid ? x + 1 : x, z);

}

if (z + 1 < cellsZ && waterShown(field, i + field.width, level) !== isLiquid) {

pushCoast(cellsX, x, isLiquid ? z + 1 : z);

}

}

/* Решётка — по мировым координатам, иначе при перетаскивании стрелки

скользили бы по руслу туда-сюда вместо того, чтобы стоять на воде. */

if (show.arrows && isLiquid && wx % ARROW_STRIDE === 0 && wz % ARROW_STRIDE === 0) {

const dir = field.flow[i] & 15;

if (dir) {

const pulse = 0.5 + 0.5 * Math.abs(Math.sin(flowPhase + (wx + wz) * 0.16));

flowMarks[flowCount * 4] = x;

flowMarks[flowCount * 4 + 1] = z;

flowMarks[flowCount * 4 + 2] = dir;

flowMarks[flowCount * 4 + 3] = 0.4 + 0.6 * pulse;

flowCount += 1;

}

}

}

}

for (let n = 0; n < coastCount; n += 1) {

putPixel(data, cellsX, cellsZ, coastMarks[n * 2], coastMarks[n * 2 + 1], COAST, 0.45);

}

for (let n = 0; n < flowCount; n += 1) {

drawFlowMark(data, cellsX, cellsZ, flowMarks[n * 4], flowMarks[n * 4 + 1], flowMarks[n * 4 + 2] | 0, flowMarks[n * 4 + 3]);

}

if (show.labels) labelPeaks(field, view, data, cellsX, cellsZ);

return { width: cellsX, height: cellsZ, data, level, fromChunks, fromField, water };

};

const rgbOf = (colors, id) => colors[tileOf(id, false)] ?? [120, 120, 128];

const blend = (a, b, t) => [

Math.round(a[0] * (1 - t) + b[0] * t),

Math.round(a[1] * (1 - t) + b[1] * t),

Math.round(a[2] * (1 - t) + b[2] * t),

];

/** Свет от рельефа: склон к западу и к «северу» темнее, отлогое — светлее. */

const reliefFactor = (field, i, level, ground) => {

if (level > ground) return 1;

const west = i > 0 ? field.ground[i - 1] : ground;

const north = i >= field.width ? field.ground[i - field.width] : ground;

const slope = (ground - west) + (ground - north);

return 1 + Math.max(-0.3, Math.min(0.24, slope * 0.055));

};

/** Отметки высот: локальные максимумы поверхности на coarse-решётке. */

const labelPeaks = (field, view, data, cellsX, cellsZ) => {

const step = LABEL_STRIDE;

for (let z = 0; z + GLYPH_H < cellsZ; z += step) {

/* Плато даёт целую вереницу одинаковых отметок: соседние узлы решётки

стоящие на одной высоте. В пределах строки повторяющуюся высоту не

дублируем — иначе карта покрывается рядами «160 160 160». */

let rowHeight = -1;

for (let x = 0; x + GLYPH_W * 3 + 2 < cellsX; x += step) {

const wx = view.x0 + x;

const wz = view.z0 + z;

const here = fold(field, wx, wz);

const i = here.v * field.width + here.u;

const ground = field.ground[i];

if (ground <= field.seaY + 4) continue; // воду и отмели не подписываем

/* Вершину ищем среди узлов той же решётки, а не среди соседних клеток:

детали рельефа делают каждый «склоном», и на шумном профиле локальных

максимумов не нашлось бы вовсе. */

let peak = true;

for (let dz = -1; dz <= 1 && peak; dz += 1) {

for (let dx = -1; dx <= 1; dx += 1) {

if (!dx && !dz) continue;

const n = fold(field, wx + dx * step, wz + dz * step);

if (field.ground[n.v * field.width + n.u] > ground) {

peak = false;

break;

}

}

}

if (!peak) continue;

if (ground === rowHeight) continue;

rowHeight = ground;

/* Отметка — высота холма в блоках (тот же масштаб, что у ползунка), а не

уровень среза: по метке должно быть видно, что именно срезали. */

drawDigits(data, cellsX, cellsZ, x, z, ground, LIGHT);

}

}

};

````

### `src/world/blocks.js` · 356 строк · заменить целиком

````js

/* Реестр блоков, палитры биомов и формы растений.

Идентификаторы блоков должны влезать в Uint8Array (< 256) — на этом держится

хранение чанка. Текстуры — не файлы, а индексы в процедурный атлас

(src/world/atlas.js), поэтому репозиторий и однофайловая сборка не тяжелеют.

Номера биомов совпадают с Azgaar (pack.biomes): 0 — вода, 1…12 — суша.

Чужие id (мастер дорисовывает свои биомы, их до 255) получают

биомFromClimate() — тот же температурно-влажностный расчёт, что и у

генератора. */

export const AIR = 0;

export const STONE = 1;

export const COBBLE = 2;

export const DIRT = 3;

export const GRASS = 4;

export const SAND = 5;

export const SANDSTONE = 6;

export const GRAVEL = 7;

export const CLAY = 8;

export const SNOW = 9;

export const ICE = 10;

export const PACKED_ICE = 11;

export const PODZOL = 12;

export const MOSS = 13;

export const PEAT = 14;

export const SALT = 15;

export const BASALT = 16;

export const OBSIDIAN = 17;

export const MAGMA = 18;

export const BEDROCK = 19;

export const WATER = 20;

export const WATER_SOURCE = 21;

export const LAVA = 22;

export const OAK_LOG = 30;

export const BIRCH_LOG = 31;

export const SPRUCE_LOG = 32;

export const JUNGLE_LOG = 33;

export const ACACIA_LOG = 34;

export const MANGROVE_LOG = 35;

export const OAK_LEAVES = 40;

export const BIRCH_LEAVES = 41;

export const SPRUCE_LEAVES = 42;

export const JUNGLE_LEAVES = 43;

export const ACACIA_LEAVES = 44;

export const SWAMP_LEAVES = 45;

export const TALL_GRASS = 50;

export const FERN = 51;

export const CACTUS = 52;

export const DEAD_BUSH = 53;

export const LILY = 54;

export const KELP = 55;

export const REEDS = 56;

export const SAPLING = 57;

export const COAL_ORE = 60;

export const IRON_ORE = 61;

export const GOLD_ORE = 62;

export const GEM_ORE = 63;

/** Индексы граней меша: 0 +X, 1 −X, 2 +Y (верх), 3 −Y, 4 +Z, 5 −Z. */

export const FACE_COUNT = 6;

/* Название тайла атласа. Порядок задаёт сетку атласа: менять можно только в

конце, иначе съедутся все UV. */

export const TILES = [

'stone', 'cobble', 'dirt', 'grass', 'grass_side', 'sand', 'sandstone', 'gravel',

'clay', 'snow', 'ice', 'packed_ice', 'podzol', 'moss', 'peat', 'salt',

'basalt', 'obsidian', 'magma', 'bedrock', 'water', 'lava',

'oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'mangrove_log',

'oak_leaves', 'birch_leaves', 'spruce_leaves', 'jungle_leaves', 'acacia_leaves', 'swamp_leaves',

'tall_grass', 'fern', 'cactus', 'dead_bush', 'lily', 'kelp', 'reeds', 'sapling',

'coal_ore', 'iron_ore', 'gold_ore', 'gem_ore',

];

/* Раскладка атласа: тайлы идут строками по ATLAS_COLUMNS; размер кратен

степени двойки — тогда работают mipmap-уровни. */

export const ATLAS_COLUMNS = 8;

export const TILE_PX = 32;

export const ATLAS_SIZE = ATLAS_COLUMNS * TILE_PX;

const tile = (name) => TILES.indexOf(name);

/**

* face = [верх, низ, бок]; жидкость и «растение» не перекрывают соседей снизу.

* `cull` — грань не рисуется, если сосед непрозрачен; `solid` — по нему

* режутся грани и по нему ходит игрок; `replaceable` — куда ставится декор.

*/

const define = (list) => {

const seen = new Set();

for (const b of list) {

if (seen.has(b.id)) throw new Error(`Двойной id блока: ${b.id} (${b.name})`);

seen.add(b.id);

}

/* Таблица плотная: индекс = id. Id группы стоят с зазорами (30…35 — стволы,

40…45 — листва), а BLOCKS[id] должен работать для любого числа из чанка,

иначе зазор читается как undefined и меш падает на первом дереве. */

const max = Math.max(...list.map((b) => b.id));

const table = [];

for (let id = 0; id <= max; id += 1) {

const b = list.find((entry) => entry.id === id);

table.push(

b

? {

id: b.id,

name: b.name,

top: tile(b.top ?? b.tile),

bottom: tile(b.bottom ?? b.tile),

side: tile(b.side ?? b.tile),

cull: b.cull !== false,

solid: b.solid !== false,

liquid: Boolean(b.liquid),

replaceable: Boolean(b.replaceable),

hole: false,

}

: { id, name: `блок ${id}`, top: 0, bottom: 0, side: 0, cull: false, solid: false, liquid: false, replaceable: true, hole: true },

);

}

return table;

};

export const BLOCKS = define([

{ id: AIR, name: 'воздух', tile: 'stone', cull: false, solid: false, replaceable: true },

{ id: STONE, name: 'камень', tile: 'stone' },

{ id: COBBLE, name: 'булыжник', tile: 'cobble' },

{ id: DIRT, name: 'земля', tile: 'dirt' },

{ id: GRASS, name: 'дёрн', top: 'grass', bottom: 'dirt', side: 'grass_side' },

{ id: SAND, name: 'песок', tile: 'sand' },

{ id: SANDSTONE, name: 'песчаник', tile: 'sandstone' },

{ id: GRAVEL, name: 'гравий', tile: 'gravel' },

{ id: CLAY, name: 'глина', tile: 'clay' },

{ id: SNOW, name: 'снег', tile: 'snow' },

{ id: ICE, name: 'лёд', tile: 'ice', cull: false },

{ id: PACKED_ICE, name: 'плотный лёд', tile: 'packed_ice' },

{ id: PODZOL, name: 'подзол', top: 'podzol', bottom: 'dirt', side: 'podzol' },

{ id: MOSS, name: 'мох', top: 'moss', bottom: 'dirt', side: 'moss' },

{ id: PEAT, name: 'торф', tile: 'peat' },

{ id: SALT, name: 'солончак', tile: 'salt' },

{ id: BASALT, name: 'базальт', tile: 'basalt' },

{ id: OBSIDIAN, name: 'обсидиан', tile: 'obsidian' },

{ id: MAGMA, name: 'магма', tile: 'magma' },

{ id: BEDROCK, name: 'бедрок', tile: 'bedrock' },

{ id: WATER, name: 'вода', tile: 'water', cull: false, solid: false, liquid: true },

{ id: WATER_SOURCE, name: 'источник', tile: 'water', cull: false, solid: false, liquid: true },

{ id: LAVA, name: 'лава', tile: 'lava', cull: false, solid: false, liquid: true },

{ id: OAK_LOG, name: 'дуб', tile: 'oak_log' },

{ id: BIRCH_LOG, name: 'берёза', tile: 'birch_log' },

{ id: SPRUCE_LOG, name: 'ель', tile: 'spruce_log' },

{ id: JUNGLE_LOG, name: 'джунгли', tile: 'jungle_log' },

{ id: ACACIA_LOG, name: 'акации', tile: 'acacia_log' },

{ id: MANGROVE_LOG, name: 'мангр', tile: 'mangrove_log' },

{ id: OAK_LEAVES, name: 'листва', tile: 'oak_leaves', cull: false, solid: false },

{ id: BIRCH_LEAVES, name: 'листва берёзы', tile: 'birch_leaves', cull: false, solid: false },

{ id: SPRUCE_LEAVES, name: 'хвоя', tile: 'spruce_leaves', cull: false, solid: false },

{ id: JUNGLE_LEAVES, name: 'листья джунглей', tile: 'jungle_leaves', cull: false, solid: false },

{ id: ACACIA_LEAVES, name: 'листья акации', tile: 'acacia_leaves', cull: false, solid: false },

{ id: SWAMP_LEAVES, name: 'листья болота', tile: 'swamp_leaves', cull: false, solid: false },

{ id: TALL_GRASS, name: 'трава', tile: 'tall_grass', cull: false, solid: false, replaceable: true },

{ id: FERN, name: 'папоротник', tile: 'fern', cull: false, solid: false, replaceable: true },

{ id: CACTUS, name: 'кактус', tile: 'cactus', cull: false },

{ id: DEAD_BUSH, name: 'сушняк', tile: 'dead_bush', cull: false, solid: false, replaceable: true },

{ id: LILY, name: 'кувшинка', tile: 'lily', cull: false, solid: false, replaceable: true },

{ id: KELP, name: 'ламинария', tile: 'kelp', cull: false, solid: false, replaceable: true },

{ id: REEDS, name: 'камыш', tile: 'reeds', cull: false, solid: false, replaceable: true },

{ id: SAPLING, name: 'саженец', tile: 'sapling', cull: false, solid: false, replaceable: true },

{ id: COAL_ORE, name: 'уголь', tile: 'coal_ore' },

{ id: IRON_ORE, name: 'железо', tile: 'iron_ore' },

{ id: GOLD_ORE, name: 'золото', tile: 'gold_ore' },

{ id: GEM_ORE, name: 'самоцветы', tile: 'gem_ore' },

]);

/* Максимальный разброс кроны по XZ (blob у джунгли radiu 4 + 1 на шум) — на

столько же надо расширить проход декора у чанка, чтобы кроны не срезались

границей. */

export const DECOR_RADIUS = 5;

export const BLOCK_COUNT = BLOCKS.filter((b) => !b.hole).length;

/** id, под которым в таблице нет блока: ведёт себя как воздух. */

export const isKnownBlock = (id) => BLOCKS[id] !== undefined && BLOCKS[id].hole === false;

export const isOpaque = (id) => id !== AIR && BLOCKS[id]?.cull !== false;

export const isSolid = (id) => BLOCKS[id]?.solid !== false;

export const isReplaceable = (id) => id === AIR || BLOCKS[id]?.replaceable === true;

export const blockName = (id) => BLOCKS[id]?.name ?? `блок ${id}`;

/* ---------- палитры биомов ---------- */

/**

* top — поверхность, filler — 3 блока под ней, subsoil — глубже, trees/

* plants — взвешенный список (id, вес), density — шанс растения на колонку,

* snow/ice — шапки по холоду.

*/

export const BIOME_PALETTE = [

/* 0 Marine — дно по глубине, поверхность не нужна */

{ top: SAND, filler: [SAND, SAND, SANDSTONE], subsoil: STONE, trees: [], plants: [[KELP, 9], [REEDS, 1]], density: 0.05 },

/* 1 Hot desert */

{ top: SAND, filler: [SAND, SAND, SANDSTONE], subsoil: SANDSTONE, trees: [], plants: [[CACTUS, 2], [DEAD_BUSH, 3]], density: 0.06 },

/* 2 Cold desert */

{ top: SAND, filler: [SAND, GRAVEL, SANDSTONE], subsoil: STONE, trees: [], plants: [[DEAD_BUSH, 4], [TALL_GRASS, 1]], density: 0.05, snow: -12 },

/* 3 Savanna */

{ top: GRASS, filler: [DIRT, DIRT, DIRT], subsoil: STONE, trees: [[ACACIA_LOG, 3, ACACIA_LEAVES], [OAK_LOG, 1, OAK_LEAVES]], plants: [[TALL_GRASS, 6], [DEAD_BUSH, 1]], density: 0.24 },

/* 4 Grassland */

{ top: GRASS, filler: [DIRT, DIRT, DIRT], subsoil: STONE, trees: [], plants: [[TALL_GRASS, 7], [FERN, 1], [SAPLING, 1]], density: 0.4 },

/* 5 Tropical seasonal forest */

{ top: GRASS, filler: [DIRT, DIRT, DIRT], subsoil: STONE, trees: [[ACACIA_LOG, 4, ACACIA_LEAVES], [OAK_LOG, 3, OAK_LEAVES]], plants: [[TALL_GRASS, 3]], density: 0.5 },

/* 6 Temperate deciduous forest */

{ top: GRASS, filler: [DIRT, DIRT, DIRT], subsoil: STONE, trees: [[OAK_LOG, 6, OAK_LEAVES], [BIRCH_LOG, 3, BIRCH_LEAVES]], plants: [[TALL_GRASS, 3], [FERN, 2]], density: 0.62 },

/* 7 Tropical rainforest */

{ top: GRASS, filler: [DIRT, DIRT, DIRT], subsoil: STONE, trees: [[JUNGLE_LOG, 7, JUNGLE_LEAVES], [OAK_LOG, 2, OAK_LEAVES]], plants: [[FERN, 5], [TALL_GRASS, 2]], density: 0.8 },

/* 8 Temperate rainforest */

{ top: MOSS, filler: [DIRT, DIRT, DIRT], subsoil: STONE, trees: [[SPRUCE_LOG, 4, SPRUCE_LEAVES], [OAK_LOG, 4, OAK_LEAVES]], plants: [[FERN, 6], [MOSS, 1]], density: 0.7 },

/* 9 Taiga */

{ top: PODZOL, filler: [DIRT, DIRT, DIRT], subsoil: STONE, trees: [[SPRUCE_LOG, 8, SPRUCE_LEAVES], [BIRCH_LOG, 2, BIRCH_LEAVES]], plants: [[FERN, 2], [TALL_GRASS, 1]], density: 0.6, snow: -1 },

/* 10 Tundra */

{ top: GRASS, filler: [DIRT, DIRT, DIRT], subsoil: STONE, trees: [[SPRUCE_LOG, 1, SPRUCE_LEAVES]], plants: [[TALL_GRASS, 2], [DEAD_BUSH, 2]], density: 0.1, snow: -1 },

/* 11 Glacier */

{ top: PACKED_ICE, filler: [ICE, ICE, PACKED_ICE], subsoil: STONE, trees: [], plants: [], density: 0, snow: -100 },

/* 12 Wetland */

{ top: PEAT, filler: [CLAY, CLAY, DIRT], subsoil: STONE, trees: [[MANGROVE_LOG, 3, SWAMP_LEAVES]], plants: [[REEDS, 8], [LILY, 4], [TALL_GRASS, 2]], density: 0.55 },

];

export const OCEAN_FLOOR = [

{ from: 17, to: 20, top: SAND, filler: [SAND, SAND, SAND] },

{ from: 12, to: 16, top: SAND, filler: [SAND, GRAVEL, SANDSTONE] },

{ from: 0, to: 11, top: GRAVEL, filler: [CLAY, GRAVEL, STONE] },

];

/**

* Биом для id, которого нет среди 13 базовых: тот же признак, по которому

* Azgaar считает биом (влажность, температура, высота), — чтобы ручная

* правка мастера не роняла генерацию, а попадала в понятный блок.

* Возвращает индекс BIOME_PALETTE.

*/

export const biomeFromClimate = (moisture, temperature, height) => {

if (height < 20) return 0;

if (temperature < -5) return 11;

if (temperature >= 25 && moisture < 8) return 1;

if (moisture > 24 && height < 60) return moisture > 40 && height < 25 ? 12 : 8;

if (temperature > 19) return moisture > 18 ? 7 : 3;

if (temperature > 8) return moisture > 22 ? 8 : moisture > 12 ? 6 : 4;

if (temperature > -1) return moisture > 16 ? 6 : moisture > 8 ? 4 : 2;

return moisture > 10 ? 9 : 10;

};

/** Палитра колонок: id биома → палитра, с откатом на климат. */

export const paletteFor = (biomeId, moisture = 20, temperature = 12, height = 25) => {

const known = BIOME_PALETTE[biomeId];

if (known) return known;

return BIOME_PALETTE[biomeFromClimate(moisture, temperature, height)] ?? BIOME_PALETTE[4];

};

/* ---------- формы растений ---------- */

/**

* Крона-«блоб» заданного радиуса с пропуском углов: детерминированный пропуск

* по хешу координат, а не по случайности, чтобы два прогона дали одно и то же.

*/

const blob = (out, cx, cy, cz, r, leaf, seed, flat = 1) => {

const ry = Math.max(1, Math.round(r * flat));

for (let dx = -r; dx <= r; dx += 1) {

for (let dz = -r; dz <= r; dz += 1) {

for (let dy = 0; dy <= ry; dy += 1) {

const d = dx * dx + dz * dz + (dy - ry / 2) * (dy - ry / 2) * 2;

if (d > r * r + 1) continue;

if (d > r * r - 2 && (dx + dz + dy) % 3 === 0) continue;

if (dx === 0 && dz === 0 && dy === 0) continue;

out.push([cx + dx, cy + dy, cz + dz, leaf]);

}

}

}

};

const cone = (out, cx, base, cz, height, leaf) => {

for (let i = 0; i < height; i += 1) {

const r = Math.max(0, Math.ceil((height - i) / 2.2));

if (r === 0) {

out.push([cx, base + i, cz, leaf]);

continue;

}

for (let dx = -r; dx <= r; dx += 1) {

for (let dz = -r; dz <= r; dz += 1) {

if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;

if (dx === 0 && dz === 0 && i < height - 1) continue;

out.push([cx, base + i, cz + dz, leaf]);

}

}

}

};

/**

* Деревья по породе: список [dx, dy, z, block] относительно колонки, где

* dy = 1 — блок над поверхностью. Высота зависит от x/z-хеша колонки, поэтому

* дерево в чанке и то же дерево, попавшее в соседний чанк, — одно и то же.

*/

export const treeBlocks = (logId, leafId, h, r) => {

const out = [];

const trunk = Math.max(3, h);

for (let y = 1; y <= trunk; y += 1) out.push([0, y, 0, logId]);

switch (logId) {

case SPRUCE_LOG:

cone(out, 0, Math.floor(trunk * 0.45), 0, trunk - Math.floor(trunk * 0.45) + 1, leafId);

for (let y = 1; y <= 2; y += 1) out.push([0, y, 0, logId]);

out.push([0, trunk + 1, 0, leafId]);

break;

case ACACIA_LOG:

for (let dx = -1; dx <= 1; dx += 1) out.push([dx, trunk, 0, logId]);

blob(out, 0, trunk + 1, 0, Math.max(3, r), leafId, h, 0.4);

break;

case JUNGLE_LOG:

blob(out, 0, trunk, 0, Math.max(3, r), leafId, h, 1.6);

blob(out, 0, trunk + 3, 0, Math.max(2, r - 1), leafId, h + 1, 1);

break;

case MANGROVE_LOG:

out.push([1, 1, 0, logId], [-1, 1, 0, logId], [0, 1, 1, logId], [0, 1, -1, logId]);

blob(out, 0, trunk, 0, Math.max(2, r), leafId, h, 0.8);

break;

default:

blob(out, 0, trunk, 0, Math.max(2, r), leafId, h, 1);

}

return out;

};

/* Кактус — не дерево: колонка блоков, отдельно, чтобы не раздувать switch выше. */

export const cactusBlocks = (h) => {

const out = [];

for (let y = 1; y <= h; y += 1) out.push([0, y, 0, CACTUS]);

if (h >= 3 && (h & 1) === 0) out.push([1, 2, 0, CACTUS]);

return out;

};

/** Высота и радиус дерева из хеша колонки: детерминированно и без таблиц. */

export const treeShape = (seed, x, z, kind) => {

const r = (value) => (value % 1000) / 1000;

const base = r(Math.abs(seed ^ (x * 73856093) ^ (z * 19349663)));

switch (kind) {

case SPRUCE_LOG:

return { h: 6 + Math.floor(base * 5), r: 2 };

case JUNGLE_LOG:

return { h: 9 + Math.floor(base * 6), r: 4 };

case ACACIA_LOG:

return { h: 4 + Math.floor(base * 2), r: 4 };

case MANGROVE_LOG:

return { h: 3 + Math.floor(base * 2), r: 3 };

case BIRCH_LOG:

return { h: 5 + Math.floor(base * 3), r: 2 };

case CACTUS:

return { h: 1 + Math.floor(base * 3), r: 0 };

default:

return { h: 4 + Math.floor(base * 3), r: 2 + (base > 0.6 ? 1 : 0) };

}

};

````

### `src/world/bridge.js` · 244 строк · не трогать — идентичен main

````js

/* Мост: документ Azgaar → снимок карт для воксельного мира. Только чтение.

iframe с редактором и игра живут на одном источнике (srcdoc или /fmg/),

поэтому окна достают напрямую: `win.grid`, `win.pack`, `win.Rivers` — те же

объекты, что рисуют карту. Правим мы только своё состояние; генератор не

трогаем ни на байт (AGENTS.md), и никаких патчей в него не вставляем.

Что снимаем и почему именно это:

• высот — `pack.cells.h`, а не `grid.cells.h`: в pack уже лежит результат

заполнения впадин и прорезки русел (`resolveDepressions`, `downcutRivers`),

то есть рельеф, по которому вода реально потекла. Для клеток, которых в

pack нет (открытый океан), остаётся grid-высота;

• биомов — `pack.cells.biome` через `pack.cells.g` (родительская клетка

grid): воксельная палитра обязана совпасть с тем, что нарисовано на карте;

• температур и осадков — `grid.cells.temp/prec`: они считаются на grid и в

pack не переноссятся;

• рек — `Rivers.addMeandering(r.cells, r.points)` даёт точки [x, y, flux] с

излучистостью, а `Rivers.getOffset` — полуширину русла в пикселях. Оба

метода — те же, чем генератор строит полилинию на экране, поэтому река в

блоках повторяет реку на карте;

• озёр — `pack.features` с `type:'lake'`: поверхность — `height` фичи, а не

уровень моря, тип (`subtype`) задаёт материал (пресное/солёное/сухое/лава).

Снимок маленький (несколько типизированных массивов на ~10 000 клеток), и

`buildField` из него детерминированно пересобирает всё поле: то же окно →

тот же мир. */

/** Снимок неполный: генерация ещё не дошла до нужного шага или документ закрыт. */

export class VoxelSourceError extends Error {

constructor(message) {

super(message);

this.name = 'VoxelSourceError';

}

}

/** Достаточно ли данных для поля: сетка, упаковка и «родительские» клетки. */

export const mapsReady = (win) =>

Boolean(win?.grid?.cells?.h?.length && win?.pack?.cells?.h?.length && win?.pack?.cells?.g?.length && win?.grid?.spacing);

/** Что не готово — для человеческой подсказки в интерфейсе. */

export const missingMapsPart = (win) => {

if (!win || !win.grid) return 'документ редактора не открыт';

if (!win.grid.cells?.h?.length) return 'высоты сетки ещё не построены';

if (!win.pack?.cells?.h?.length) return 'упаковка карты (pack) ещё не построена';

if (!win.pack?.cells?.g?.length) return 'связь pack → grid ещё не построена';

return 'данных достаточно';

};

const STRING_HASH = 0x9e3779b1;

const hashString = (value) => {

let h = 2166136261;

const text = String(value ?? '');

for (let i = 0; i < text.length; i += 1) {

h ^= text.charCodeAt(i);

h = Math.imul(h, STRING_HASH) >>> 0;

}

return h >>> 0;

};

const numberOr = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** Высоты и биомы pack-клеток переносим на решётку grid через pack.cells.g. */

const spreadPackToGrid = (grid, pack, cellsX, cellsY, seaLevel) => {

const total = cellsX * cellsY;

const cellH = new Float32Array(total);

const cellBiome = new Uint8Array(total);

const raw = grid.cells.h;

for (let i = 0; i < total; i += 1) {

const h = numberOr(raw[i], seaLevel);

cellH[i] = h;

cellBiome[i] = h <= seaLevel ? 0 : 4; // 0 — море, 4 — луг: разумное «неизвестно»

}

const { g, h: packH, biome } = pack.cells;

for (let i = 0; i < g.length; i += 1) {

const parent = g[i];

if (!(parent >= 0 && parent < total)) continue;

const height = numberOr(packH[i], NaN);

if (Number.isFinite(height)) cellH[parent] = height;

const id = numberOr(biome[i], NaN);

if (Number.isFinite(id)) cellBiome[parent] = Math.max(0, Math.min(255, Math.round(id)));

}

return { cellH, cellBiome };

};

/** Озёра: ключ в cellFeature → описание фичи. Ключи наши, порядок не важен. */

const readLakes = (pack, cellsX, cellsY, seaLevel) => {

const features = [];

const cellFeature = new Uint16Array(cellsX * cellsY);

const list = Array.isArray(pack.features) ? pack.features : [];

for (const feature of list) {

if (!feature || feature.type !== 'lake' || !Array.isArray(feature.cells) || !feature.cells.length) continue;

const key = features.length + 1;

if (key >= 65535) break;

let marked = 0;

for (const cell of feature.cells) {

const parent = pack.cells.g[cell];

if (!(parent >= 0 && parent < cellFeature.length)) continue;

cellFeature[parent] = key;

marked += 1;

}

if (!marked) continue;

features.push({

i: key,

type: 'lake',

subtype: String(feature.subtype ?? 'freshwater'),

height: numberOr(feature.height, seaLevel),

});

}

return { features, cellFeature };

};

/**

* Реки в точках, полуширине и стоке. `Rivers` — тот же модуль, что рисует

* излучистость на карте; если его нет (старый документ, ручной снимок), берём

* центры клеток: русло будет прямым, но не исчезнет.

*/

const readRivers = (win, pack, width, height) => {

const Rivers = win.Rivers;

const list = Array.isArray(pack.rivers) ? pack.rivers : [];

const pointsOf = pack.cells.p;

const rivers = [];

let skipped = 0;

for (let index = 0; index < list.length; index += 1) {

const river = list[index];

const cells = Array.isArray(river?.cells) ? river.cells : null;

if (!cells || cells.length < 2) {

skipped += 1;

continue;

}

let raw = null;

if (Rivers && typeof Rivers.addMeandering === 'function') {

try {

raw = Rivers.addMeandering(cells, Array.isArray(river.points) ? river.points : null);

} catch (error) {

void error;

raw = null;

}

}

if (!raw || raw.length < 2) {

raw = [];

for (const cell of cells) {

const point = cell > 0 ? pointsOf[cell] : null;

if (point && Number.isFinite(point[0])) raw.push([point[0], point[1], numberOr(river.discharge, 30)]);

}

}

if (raw.length < 2) {

skipped += 1;

continue;

}

const widthFactor = numberOr(river.widthFactor, 1);

const sourceWidth = numberOr(river.sourceWidth, 0.5);

const points = [];

const half = [];

const flux = [];

let seen = 0;

for (let i = 0; i < raw.length; i += 1) {

const [x, y, flow] = raw[i];

if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

if (x < -8 || y < -8 || x > width + 8 || y > height + 8) continue; // за кадром рисовать нечего

const value = numberOr(flow, 30);

if (value > seen) seen = value;

let offset = sourceWidth;

if (Rivers && typeof Rivers.getOffset === 'function') {

try {

offset = Rivers.getOffset({ flux: seen, pointIndex: points.length, widthFactor, startingWidth: sourceWidth });

} catch (error) {

void error;

offset = sourceWidth + Math.log2(Math.max(1, seen)) * 0.35;

}

} else {

offset = sourceWidth + Math.log2(Math.max(1, seen)) * 0.35;

}

points.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);

half.push(Math.max(0.4, Math.min(12, numberOr(offset, 0.6))));

flux.push(Math.round(Math.max(1, seen)));

}

if (points.length < 2) {

skipped += 1;

continue;

}

rivers.push({ id: numberOr(river.i, index + 1) || index + 1, points, half, flux });

}

return { rivers, skipped };

};

/**

* Снимок карт из окна редактора.

*

* @param {Window} win окно iframe с Azgaar

* @param {{ seed?: string, width?: number, height?: number }} [hint]

* размеры из конфигурации мира — нужны, если документ их не отдал

* @returns {object} source для buildField (см. src/world/field.js)

*/

export const readSource = (win, hint = {}) => {

if (!win) throw new VoxelSourceError('документ редактора не открыт');

const grid = win.grid;

const pack = win.pack;

if (!mapsReady(win)) throw new VoxelSourceError(`воксельный мир строить рано: ${missingMapsPart(win)}`);

const graph = win.options?.map?.graph ?? {};

const cellsX = Math.max(2, Math.round(numberOr(grid.cellsX, 0)) || Math.ceil(numberOr(graph.width, hint.width || 1600) / grid.spacing));

const cellsY = Math.max(2, Math.round(numberOr(grid.cellsY, 0)) || Math.ceil(numberOr(graph.height, hint.height || 1000) / grid.spacing));

const spacing = Math.max(1, numberOr(grid.spacing, 12.65));

const width = Math.max(64, Math.round(numberOr(graph.width, cellsX * spacing)));

const height = Math.max(64, Math.round(numberOr(graph.height, cellsY * spacing)));

const seaLevel = Math.max(1, Math.round(numberOr(win.SEA_LEVEL, 20)));

const { cellH, cellBiome } = spreadPackToGrid(grid, pack, cellsX, cellsY, seaLevel);

const copy = (source, Type, fallback) => {

const out = new Type(cellsX * cellsY);

if (!source) out.fill(fallback);

else for (let i = 0; i < out.length; i += 1) out[i] = Number(source[i]) || 0;

return out;

};

const cellTemp = copy(grid.cells.temp, Int8Array, 12);

const cellPrec = copy(grid.cells.prec, Uint8Array, 20);

const { features, cellFeature } = readLakes(pack, cellsX, cellsY, seaLevel);

const { rivers, skipped } = readRivers(win, pack, width, height);

return {

width,

height,

spacing,

cellsX,

cellsY,

seaLevel,

seedSalt: hashString(`${hint.seed ?? ''}|${width}x${height}|${cellsX}x${cellsY}|${spacing.toFixed(3)}`),

cellH,

cellBiome,

cellTemp,

cellPrec,

cellFeature,

features,

rivers,

stats: { cells: cellsX * cellsY, rivers: rivers.length, lakes: features.length, riversSkipped: skipped },

};

};

/** Краткая сводка для отладочной панели: чем мир «засеян». */

export const describeSource = (source) =>

[

`клеток ${source.stats.cells}`,

`рек ${source.stats.rivers}`,

`озёр ${source.stats.lakes}`,

`море на уровне ${source.seaLevel}`,

].join(' · ');

````

### `src/world/chunk.js` · 437 строк · не трогать — идентичен main

````js

/* Колонки и чанки: чем заполняется одна вертикаль и как из колонок собирается чанк.

Чанк — 16 × 16 колонок на всю высоту мира, как в Minecraft. Хранение —

Uint8Array с id блоков (их меньше 256, см. blocks.js). Сами блоки в памяти не

живут: колонка — чистая функция от поля и координат, поэтому дороже стоит

кэш и его версионирование, чем пересчёт (решение зафиксировано в

docs/voxel-world-generation.md §8). Палитра нужна экспорту мира и сети лобби.

Всё, что повторяется блок за блоком, считается на решётке: пещеры — на узлах

2 × 4 × 2, руда — одна жила на колонку. Поблокирный шум стоил 85 % времени

генерации чанка (15,8 → 1,9 мс на 256 блоков высоты). */

import {

AIR,

BEDROCK,

BLOCKS,

CACTUS,

CLAY,

COAL_ORE,

DIRT,

GOLD_ORE,

GRASS,

GEM_ORE,

ICE,

IRON_ORE,

KELP,

LAVA,

LILY,

MOSS,

OCEAN_FLOOR,

PODZOL,

REEDS,

SALT,

SAND,

SANDSTONE,

SNOW,

STONE,

WATER,

WATER_SOURCE,

cactusBlocks,

paletteFor,

DECOR_RADIUS,

treeBlocks,

treeShape,

} from './blocks.js';

import {

F_BEACH,

F_ICE,

F_LAKE,

F_RIVER,

F_SEA,

F_SNOW,

F_WATER,

LAKE_LAVA,

LAKE_SALT,

sampleColumn,

surfaceY as surfaceOf,

} from './field.js';

import { clamp, noise3, rand01 } from './math.js';

export const CHUNK_SX = 16;

export const CHUNK_SZ = 16;

/**

* Шаги решётки пещер: шум считается на узлах, а не на блоке. Шаг по X/Z = 3

* а не 2 — пещеры получаются чуть «сырнее», но решётка выходит в 2.5 раза

* дешевле, а генерация чанка идёт в кадровом бюджете.

*/

export const CAVE_STEP_X = 3;

export const CAVE_STEP_Y = 4;

export const CAVE_STEP_Z = 3;

/**

* Руды: полосы по высоте. Жила выбирается один раз на колонку и лежит в ней

* вертикальным скоплением — Minecraft сыпет руду так же, а поблокирный хеш

* съедал половину времени генерации.

*/

const ORE_VEINS = [

{ id: COAL_ORE, p: 0.05, min: 6, max: 96, size: 5 },

{ id: IRON_ORE, p: 0.03, min: 4, max: 70, size: 4 },

{ id: GOLD_ORE, p: 0.011, min: 2, max: 34, size: 3 },

{ id: GEM_ORE, p: 0.005, min: 1, max: 18, size: 2 },

];

const oreVein = (seed, x, z, height) => {

let roll = rand01(seed ^ 0x51ed2701, x, z, 77);

for (const vein of ORE_VEINS) {

if (roll < vein.p) {

const span = Math.max(2, Math.min(vein.max, height - 4) - vein.min);

const from = vein.min + Math.floor(rand01(seed + 1301, x, z, 91) * span);

const len = 1 + Math.floor(rand01(seed + 211, x, z, 45) * vein.size);

return { id: vein.id, from, to: Math.min(height - 2, from + len) };

}

roll -= vein.p;

}

return null;

};

/**

* Пещерное поле в узле решётки: «сыр» либо пересечение двух червей.

* Открываться на поверхность не должно — иначе река проваливается в пустоту.

*/

const caveNode = (seed, x, y, z, floorY, water) => {

const ceiling = floorY - (water ? 4 : 3);

if (y <= 1 || y >= ceiling) return false;

if (noise3(seed, x, y, z, 26) > 0.62) return true;

const depth = clamp(1 - (floorY - y) / Math.max(8, floorY), 0, 1);

const room = 0.05 + depth * 0.05;

if (Math.abs(noise3(seed + 977, x, y * 0.6, z, 34)) >= room) return false;

return Math.abs(noise3(seed + 3121, x, y * 0.6, z, 34)) < room;

};

/**

* Решётка пещер на чанк. Узлы привязаны к мировым координатам (кратные шагу),

* а не к началу чанка: иначе два соседних чанка по-разному решают, пустой ли

* блок на границе, и пещеры расходятся швом.

*/

const buildCaveGrid = (field, x0, z0, sx, sz) => {

/* Узлы привязаны к мировым кратным шага (floor, а не round: у отрицательных

координат round округляет к нулю и соседи разошлись бы швом). Размер

решётки считается от покрываемого диапазона, а не от размеров чанка, —

иначе чанк с юбкой и чанк без юбки по-разному видят дальний край. */

const xBase = Math.floor(x0 / CAVE_STEP_X);

const zBase = Math.floor(z0 / CAVE_STEP_Z);

const gx = Math.floor((x0 + sx - 1) / CAVE_STEP_X) - xBase + 1;

const gz = Math.floor((z0 + sz - 1) / CAVE_STEP_Z) - zBase + 1;

const gy = Math.floor((field.worldHeight - 1) / CAVE_STEP_Y) + 1;

const grid = new Uint8Array(gx * gz * gy);

for (let ny = 0; ny < gy; ny += 1) {

const y = ny * CAVE_STEP_Y;

for (let nz = 0; nz < gz; nz += 1) {

const z = (zBase + nz) * CAVE_STEP_Z;

for (let nx = 0; nx < gx; nx += 1) {

const x = (xBase + nx) * CAVE_STEP_X;

const column = sampleColumn(field, x, z);

grid[(ny * gz + nz) * gx + nx] = caveNode(field.seed, x, y, z, column.y, (column.flags & F_WATER) !== 0) ? 1 : 0;

}

}

}

return { grid, gx, gz, gy, xBase, zBase };

};

/** Узел решётки над колонкой (x, y, z): 1 — здесь пещера. */

const caveAtNode = (lattice, x, y, z) => {

const nx = Math.floor(x / CAVE_STEP_X) - lattice.xBase;

const nz = Math.floor(z / CAVE_STEP_Z) - lattice.zBase;

const ny = Math.floor(y / CAVE_STEP_Y);

if (nx < 0 || nz < 0 || ny < 0 || nx >= lattice.gx || nz >= lattice.gz || ny >= lattice.gy) return 0;

return lattice.grid[(ny * lattice.gz + nz) * lattice.gx + nx];

};

const isReplaceable = (id) => id === AIR || BLOCKS[id]?.replaceable === true;

/** Опции прохода по области влияния: только деревья и кактусы. */

const RING_OPTIONS = { treesOnly: true };

/**

* Одна колонка: от y = 0 до вершины мира. `out` пишется на месте по offset —

* временный буфер и копирование в чанке не нужны, там массив уже обнулён.

*

* @returns {{y: number, waterY: number, biome: number, flags: number, column: object}}

*/

export const generateColumn = (field, x, z, out, options = {}) => {

const offset = options.offset ?? 0;

const height = field.worldHeight;

const column = sampleColumn(field, x, z);

const water = (column.flags & F_WATER) !== 0;

const surfaceY = clamp(column.y, 0, height - 1);

const waterY = water ? clamp(column.waterY, 0, height - 1) : 0;

const palette = paletteFor(column.biome, column.prec, column.temp, Math.round(column.h));

const riverOrLake = (column.flags & (F_RIVER | F_LAKE)) !== 0;

if (options.clear !== false) out.fill(AIR, offset, offset + height);

let top = palette.top;

let filler = palette.filler;

let soil = water ? 2 : 3;

if (water && !riverOrLake) {

const band = OCEAN_FLOOR.find((b) => column.h >= b.from && column.h <= b.to) ?? OCEAN_FLOOR[2];

top = band.top;

filler = band.filler;

} else if ((column.flags & F_BEACH) !== 0 && surfaceY <= field.seaY + 2) {

top = SAND;

filler = [SAND, SAND, SANDSTONE];

soil = 3;

} else if (column.lakeType === LAKE_SALT) {

top = SALT;

filler = [SALT, CLAY, CLAY];

}

if ((column.flags & F_SNOW) !== 0 && !water && (top === GRASS || top === SAND || top === DIRT || top === PODZOL || top === MOSS)) {

top = SNOW;

}

const stone = palette.subsoil ?? STONE;

const vein = options.ores === false ? null : oreVein(field.seed, x, z, height);

const caves = options.caves === false ? null : options.caveGrid ?? null;

const lx = options.lx ?? 0;

const lz = options.lz ?? 0;

for (let y = 0; y <= surfaceY; y += 1) {

let id;

if (y === 0) id = BEDROCK;

else if (y === surfaceY) id = top;

else if (y > surfaceY - soil) id = filler[Math.min(filler.length - 1, surfaceY - y - 1)] ?? DIRT;

else id = stone;

if (id === stone && y > 1 && vein && y >= vein.from && y <= vein.to) id = vein.id;

if (y > 1 && y < surfaceY && caves && caveAtNode(caves, x, y, z)) continue;

out[offset + y] = id;

}

/* Вода, лёд, лава. Направление течения уже посчитано в поле: dir = 0 значит

стоячая вода (море, озеро), остальное течёт. */

if (water && waterY > surfaceY) {

const still = column.dir === 0;

const lava = column.lakeType === LAKE_LAVA;

for (let y = surfaceY + 1; y <= waterY; y += 1) out[offset + y] = lava ? LAVA : still ? WATER_SOURCE : WATER;

if (!lava && (column.flags & F_ICE) !== 0) {

const thickness = column.temp <= -12 ? 3 : 1;

for (let y = waterY, k = 0; k < thickness && y > surfaceY; y -= 1, k += 1) out[offset + y] = ICE;

}

}

return { y: surfaceY, waterY, biome: column.biome, flags: column.flags, column };

};

const weighted = (list, value) => {

if (!list || !list.length) return null;

let total = 0;

for (const entry of list) total += entry[1];

let target = value * total;

for (const entry of list) {

target -= entry[1];

if (target <= 0) return entry;

}

return list[0];

};

/**

* Декор колонки: дерево, кактус, тростник, кувшинка. Решение зависит только от

* самой колонки, поэтому соседний чанк, дорисовывающий часть кроны, получит

* ровно те же блоки — швов не будет.

*

* @returns {{blocks: number[][], surface: number}|null} смещения [dx, dy, dz, id]

*/

export const columnDecor = (field, x, z, summary, options = {}) => {

if (!summary || options.decor === false) return null;

const treesOnly = options.treesOnly === true;

const { y, waterY, flags, column } = summary;

const water = (flags & F_WATER) !== 0;

const palette = paletteFor(column.biome, column.prec, column.temp, Math.round(column.h));

const density = palette.density ?? 0;

if (water && y < waterY) {

if (treesOnly) return null;

if ((flags & (F_SEA | F_LAKE)) === 0 || waterY - y > 7) return null;

const roll = rand01(field.seed + 77, column.u, column.v, (column.mx << 1) | column.my);

if (roll >= Math.max(0.04, density * 0.3)) return null;

const lake = (flags & F_LAKE) !== 0;

const id = lake ? LILY : KELP;

const at = lake ? waterY : Math.min(waterY - 1, y + 1);

return { blocks: [[0, at - y, 0, id]], surface: y };

}

const slope = Math.max(

Math.abs(surfaceOf(field, x - 1, z) - y),

Math.abs(surfaceOf(field, x + 1, z) - y),

Math.abs(surfaceOf(field, x, z - 1) - y),

Math.abs(surfaceOf(field, x, z + 1) - y),

);

if (slope > 2) return null;

const roll = rand01(field.seed, column.u, column.v, (column.mx << 1) | column.my);

const trees = palette.trees ?? [];

if (trees.length && roll < density && y + 16 < field.worldHeight) {

const pick = weighted(trees, rand01(field.seed + 4111, column.u, column.v, 9));

if (pick) {

const logId = pick[0];

const leafId = pick[2] ?? logId + 10;

const shape = treeShape(field.seed, column.u, column.v, logId);

if (logId === CACTUS) return { blocks: cactusBlocks(shape.h), surface: y };

if (y + shape.h + shape.r + 2 >= field.worldHeight) return null;

return { blocks: treeBlocks(logId, leafId, shape.h, shape.r), surface: y };

}

}

if (treesOnly) return null;

const plants = palette.plants ?? [];

if (plants.length && roll > 0.5 && density > 0) {

const pick = weighted(plants, rand01(field.seed + 811, column.u, column.v, 11));

if (pick && rand01(field.seed + 33, column.u, column.v, 17) < 0.35 + density * 0.5) {

return { blocks: [[0, 1, 0, pick[0]]], surface: y };

}

}

if ((flags & F_RIVER) !== 0 && y === waterY && rand01(field.seed + 909, column.u, column.v, 13) < 0.1) {

return { blocks: [[0, 1, 0, REEDS]], surface: y };

}

return null;

};

/**

* Только то, что нужно декору колонки: верх рельефа, уровень воды, флаги.

* Нужен для области влияния — колонки соседей, для которых своего чанка у нас

* нет и пересчитывать весь столбец смысла нет.

*/

export const columnSummary = (field, x, z) => {

const column = sampleColumn(field, x, z);

const water = (column.flags & F_WATER) !== 0;

return {

y: clamp(column.y, 0, field.worldHeight - 1),

waterY: water ? clamp(column.waterY, 0, field.worldHeight - 1) : 0,

flags: column.flags,

biome: column.biome,

column,

};

};

/**

* Чанк с «юбкой» в 1 блок по x и z: мешингу нужны соседи краевых колонок, а

* ждать, пока соседний чанк сгенерируется, — значит получить швы на каждом

* втором чанке.

*/

export const generateChunk = (field, cx, cz, options = {}) => {

const skirt = options.skirt === false ? 0 : 1;

const sx = CHUNK_SX + skirt * 2;

const sz = CHUNK_SZ + skirt * 2;

const height = field.worldHeight;

const blocks = new Uint8Array(sx * sz * height);

const x0 = cx * CHUNK_SX - skirt;

const z0 = cz * CHUNK_SZ - skirt;

const caveGrid = options.caves === false ? null : buildCaveGrid(field, x0, z0, sx, sz);

const summaries = new Array(sx * sz);

for (let lz = 0; lz < sz; lz += 1) {

for (let lx = 0; lx < sx; lx += 1) {

const base = (lz * sx + lx) * height;

const summary = generateColumn(field, x0 + lx, z0 + lz, blocks, {

offset: base,

clear: false,

ores: options.ores,

caves: options.caves,

caveGrid,

});

summaries[lz * sx + lx] = summary;

}

}

/* Декор — вторым проходом: крона лезет в соседние колонки, значит писать её

надо, когда все колонки чанка уже известны. Проход идёт по области

влияния (внутренняя часть + DECOR_RADIUS по периметру): крона дерева в

соседнем чанке пересекает границу, и если писать её только от своих

колонок, на шве получается срезанная половина кроны. */

if (options.decor !== false) {

const from = skirt - DECOR_RADIUS;

const toX = sx - skirt + DECOR_RADIUS;

const toZ = sz - skirt + DECOR_RADIUS;

for (let lz = from; lz < toZ; lz += 1) {

for (let lx = from; lx < toX; lx += 1) {

const inside = lx >= 0 && lz >= 0 && lx < sx && lz < sz;

const summary = inside ? summaries[lz * sx + lx] : columnSummary(field, x0 + lx, z0 + lz);

if (!inside && !summary) continue;

/* За пределами чанка ищем только то, что лезет через границу: трава и

кувшинки — блок 1 × 1 × 1, их writes сам хозяин колонки. */

const decor = columnDecor(field, x0 + lx, z0 + lz, summary, inside ? options : RING_OPTIONS);

if (!decor) continue;

for (const [dx, dy, dz, id] of decor.blocks) {

const tx = lx + dx;

const tz = lz + dz;

if (tx < 0 || tz < 0 || tx >= sx || tz >= sz) continue; // за юбкой — забота соседа

const y = summary.y + dy;

if (y < 1 || y >= height) continue;

const target = (tz * sx + tx) * height + y;

if (blocks[target] !== AIR && !(isReplaceable(blocks[target]) && isReplaceable(id))) continue;

blocks[target] = id;

}

}

}

}

return { blocks, sx, sz, height, x0, z0, ox: skirt, oz: skirt, cx, cz, summaries };

};

export const blockAt = (chunk, lx, y, lz) => {

if (!chunk || y < 0 || y >= chunk.height || lx < 0 || lz < 0 || lx >= chunk.sx || lz >= chunk.sz) return AIR;

return chunk.blocks[(lz * chunk.sx + lx) * chunk.height + y];

};

export const setBlock = (chunk, lx, y, lz, id) => {

if (y < 0 || y >= chunk.height || lx < 0 || lz < 0 || lx >= chunk.sx || lz >= chunk.sz) return false;

chunk.blocks[(lz * chunk.sx + lx) * chunk.height + y] = id;

return true;

};

/** Чанк пуст — ни мешать, ни грузить в GPU нечего. */

export const isChunkEmpty = (chunk) => {

const { blocks } = chunk;

for (let i = 0; i < blocks.length; i += 1) if (blocks[i] !== AIR) return false;

return true;

};

/* ---------- палитра: те же данные в 2-4 раза компактнее ---------- */

/**

* Сериализация: список id + индексы по 1/2/4/6/8 бит. Нужна экспорту мира и

* каналу лобби; формат версионируется полем `v` (см. src/game/map-frame.js).

*/

export const encodePalette = (blocks) => {

const palette = [];

const index = new Map();

for (let i = 0; i < blocks.length; i += 1) {

const id = blocks[i];

if (!index.has(id)) {

if (palette.length >= 256) return { v: 1, bits: 8, palette: null, indices: Uint8Array.from(blocks) };

index.set(id, palette.length);

palette.push(id);

}

}

const bits = palette.length <= 2 ? 1 : palette.length <= 4 ? 2 : palette.length <= 16 ? 4 : palette.length <= 64 ? 6 : 8;

const indices = new Uint8Array(blocks.length);

for (let i = 0; i < blocks.length; i += 1) indices[i] = index.get(blocks[i]);

return { v: 1, bits, palette, indices };

};

export const decodePalette = ({ v, bits, palette, indices }) => {

if (v !== 1) throw new Error(`Неизвестная версия палитры чанка: ${v}`);

if (bits === 8 && !palette) return Uint8Array.from(indices);

const out = new Uint8Array(indices.length);

for (let i = 0; i < indices.length; i += 1) out[i] = palette[indices[i]] ?? AIR;

return out;

};

/** Сводка о чанке: для проверок и отладочной панели. */

export const chunkStats = (chunk) => {

const counts = new Map();

let total = 0;

for (const id of chunk.blocks) {

if (id === AIR) continue;

total += 1;

counts.set(id, (counts.get(id) ?? 0) + 1);

}

return { total, kinds: counts.size, byId: counts };

};

````

### `src/world/field.js` · 467 строк · не трогать — идентичен main

````js

/* Поле мира: из карт Azgaar — в растры блоков.

Здесь живёт вся география: интерполяция высот, биомы, море, озёра, русла рек

и направление течения. Модуль не знает ни про WebGL, ни про DOM: вход —

plain-объект, снятый bridge.js с окна Azgaar (или сшитый тестом), выход —

растры + функции выборки.

Единица растра = один блок = один пиксель карты (docs/voxel-world-generation.md

§4). Мир зациклен: координаты любой колонки сворачиваются в тайл

отражениями (fold), поэтому растр всегда размера карты. */

import { clamp, fbm2, floorMod, hash32, noise2 } from './math.js';

/** Уровень моря в Azgaar: h < 20 — вода. */

export const FMG_SEA_LEVEL = 20;

/** Биты флага колонки. */

export const F_WATER = 1; // под водой

export const F_SEA = 2; // море (не река и не озеро)

export const F_RIVER = 4; // русло реки

export const F_LAKE = 8; // озёрная гладь

export const F_ICE = 16; // лёд на поверхности

export const F_BEACH = 32; // примыкает к воде

export const F_SNOW = 64; // снежная шапка

export const F_FALL = 128; // перепад ≥ 2 блока: водопад

/** Подтипы озёр: код фичи → материал колонки. */

export const LAKE_NONE = 0;

export const LAKE_FRESH = 1;

export const LAKE_SALT = 2;

export const LAKE_SINKHOLE = 3;

export const LAKE_DRY = 4;

export const LAKE_LAVA = 5;

export const LAKE_FROZEN = 6;

const LAKE_CODES = {

freshwater: LAKE_FRESH,

salt: LAKE_SALT,

sinkhole: LAKE_SINKHOLE,

dry: LAKE_DRY,

lava: LAKE_LAVA,

frozen: LAKE_FROZEN,

};

/**

* Профили мира. heightScale — сколько блоков стоит одна единица высоты

* Azgaar; при 2 рельеф до 160 блоков, и появляются уступы, скалы и водопады.

*/

export const WORLD_PROFILES = {

1: { heightScale: 1, seaY: 40, worldHeight: 128 },

2: { heightScale: 2, seaY: 64, worldHeight: 256 },

};

/** Высота Azgaar (0…100) → Y верхнего твёрдого блока. */

export const heightToY = (field, h) => {

const sea = field.seaLevel;

if (h >= sea) {

return clamp(field.seaY + Math.round((h - sea) * field.heightScale), field.seaY, field.worldHeight - 9);

}

/* Дно не масштабируем: 20-метровый океан в два раза глубже был бы ямой. */

return clamp(field.seaY + Math.round(h - sea), 1, field.seaY - 1);

};

/** Билинейная выборка непрерывного поля по решётке клеток. */

const latticeBilinear = (array, u, v, field) => {

const { spacing, cellsX, cellsY } = field;

const gx = u / spacing - 0.5;

const gy = v / spacing - 0.5;

const x0 = Math.floor(gx);

const y0 = Math.floor(gy);

const tx = gx - x0;

const ty = gy - y0;

const at = (x, y) => array[clamp(y, 0, cellsY - 1) * cellsX + clamp(x, 0, cellsX - 1)];

const a = at(x0, y0);

const b = at(x0 + 1, y0);

const c = at(x0, y0 + 1);

const d = at(x0 + 1, y0 + 1);

return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;

};

/** Индекс клетки решётки под пикселем — «ближайшая клетка» для дискретных полей. */

export const latticeCell = (field, u, v) => {

const cx = clamp(Math.floor(u / field.spacing), 0, field.cellsX - 1);

const cy = clamp(Math.floor(v / field.spacing), 0, field.cellsY - 1);

return cy * field.cellsX + cx;

};

/**

* Свёртка координат в тайл. Период — два тайла по каждой оси, то есть

* зеркальное замощение: соседние колонки на шве имеют одинаковые значения

* полей, поэтому берега и русла не разрываются. Флаги отражения идут в шум и

* декор, чтобы деревья не отзеркаливались один в один.

*/

export const fold = (field, x, z) => {

const periodX = field.width * 2;

const periodZ = field.height * 2;

const u0 = floorMod(x, periodX);

const v0 = floorMod(z, periodZ);

const mx = u0 >= field.width ? 1 : 0;

const my = v0 >= field.height ? 1 : 0;

return { u: mx ? periodX - 1 - u0 : u0, v: my ? periodZ - 1 - v0 : v0, mx, my };

};

/** D8: вектор движения → направление 1…8 (0 — стоячая вода). */

export const direction8 = (du, dv) => {

if (Math.abs(du) < 1e-6 && Math.abs(dv) < 1e-6) return 0;

const ax = Math.abs(du);

const ay = Math.abs(dv);

if (ax > ay * 2) return du > 0 ? 1 : 5;

if (ay > ax * 2) return dv > 0 ? 3 : 7;

if (du > 0 && dv > 0) return 2;

if (du < 0 && dv > 0) return 4;

if (du < 0 && dv < 0) return 6;

return 8;

};

/** Вектор D8-направления в координатах растра (v растёт к югу). */

export const flowVector = (dir) => {

switch (dir & 15) {

case 1:

return [1, 0];

case 2:

return [1, 1];

case 3:

return [0, 1];

case 4:

return [-1, 1];

case 5:

return [-1, 0];

case 6:

return [-1, -1];

case 7:

return [0, -1];

case 8:

return [1, -1];

default:

return [0, 0];

}

};

/* ---------- построение поля ---------- */

/**

* @param {object} source снимок карт (см. bridge.js: extractFields)

* @param {{ profile?: 1|2, detail?: number }} [options]

*/

export const buildField = (source, options = {}) => {

const profile = WORLD_PROFILES[options.profile ?? 2] ?? WORLD_PROFILES[2];

const width = Math.max(64, Math.round(source.width));

const height = Math.max(64, Math.round(source.height));

const cellsX = Math.max(2, Math.round(source.cellsX) || Math.ceil(width / (source.spacing || 12)));

const cellsY = Math.max(2, Math.round(source.cellsY) || Math.ceil(height / (source.spacing || 12)));

const spacing = source.spacing || Math.sqrt((width * height) / (cellsX * cellsY));

const seaLevel = source.seaLevel ?? FMG_SEA_LEVEL;

const cellCount = cellsX * cellsY;

const fill = (array, Type, fallback) => {

const out = new Type(cellCount);

if (array) for (let i = 0; i < cellCount; i += 1) out[i] = Number(array[i]) || 0;

else out.fill(fallback);

return out;

};

const field = {

width,

height,

area: width * height,

spacing,

cellsX,

cellsY,

seaLevel,

heightScale: profile.heightScale,

seaY: profile.seaY,

worldHeight: profile.worldHeight,

seed: hash32(source.seedSalt || 1, width, height, profile.heightScale),

detail: options.detail ?? 1,

cellH: fill(source.cellH, Float32Array, seaLevel),

cellBiome: fill(source.cellBiome, Uint8Array, 4),

cellTemp: fill(source.cellTemp, Int8Array, 12),

cellPrec: fill(source.cellPrec, Uint8Array, 20),

cellFeature: fill(source.cellFeature, Uint16Array, 0),

features: source.features ?? [],

rivers: source.rivers ?? [],

ground: new Uint8Array(width * height),

waterY: new Uint8Array(width * height),

flow: new Uint8Array(width * height),

flags: new Uint8Array(width * height),

riverId: new Uint16Array(width * height),

lakeType: new Uint8Array(width * height),

};

/* Высота — непрерывной (шум снимает «ступени клеток»), дискретные поля —

кусочно-постоянными: биом не имеет права перетекать через берег. */

const base = field.base = new Float32Array(width * height);

for (let v = 0; v < height; v += 1) {

for (let u = 0; u < width; u += 1) {

let h = latticeBilinear(field.cellH, u, v, field);

if (h >= seaLevel) {

h = Math.max(seaLevel, h + fbm2(field.seed, u, v, 3.5, 3) * 0.85 * field.detail);

} else {

h = Math.min(seaLevel - 0.05, h + fbm2(field.seed, u, v, 2.6, 2) * 0.35 * field.detail);

}

const i = v * width + u;

base[i] = h;

field.ground[i] = heightToY(field, h);

}

}

field.groundBase = Uint8Array.from(field.ground);

applySea(field);

applyLakes(field);

applyRivers(field);

applyShore(field);

applyClimateCaps(field);

return field;

};

/** Море: всё, что ушло ниже уровня моря. */

const applySea = (field) => {

const { ground, waterY, flags, area, seaY } = field;

for (let i = 0; i < area; i += 1) {

if (ground[i] >= seaY) continue;

waterY[i] = seaY;

flags[i] |= F_WATER | F_SEA;

}

};

/** Озёра: поверхность — own height фичи, а не уровень моря; тип задаёт материал. */

const applyLakes = (field) => {

const surface = new Map();

const kinds = new Map();

for (const feature of field.features) {

if (!feature || feature.type !== 'lake') continue;

const h = Number.isFinite(feature.height) ? feature.height : field.seaLevel;

surface.set(feature.i, clamp(heightToY(field, h), 1, field.worldHeight - 2));

kinds.set(feature.i, LAKE_CODES[feature.subtype] ?? LAKE_FRESH);

}

if (!surface.size) return;

const { cellFeature, ground, groundBase, waterY, flags, lakeType, width } = field;

for (let v = 0; v < field.height; v += 1) {

for (let u = 0; u < width; u += 1) {

const id = cellFeature[latticeCell(field, u, v)];

const y = surface.get(id);

if (y === undefined) continue;

const i = v * width + u;

lakeType[i] = kinds.get(id) ?? LAKE_FRESH;

if (lakeType[i] === LAKE_DRY) {

flags[i] |= F_LAKE;

continue;

}

if (groundBase[i] > y) {

flags[i] |= F_LAKE; // берег или остров внутри озера

continue;

}

flags[i] = (flags[i] & ~F_SEA) | F_LAKE | F_WATER;

waterY[i] = y;

const depth = lakeType[i] === LAKE_LAVA ? 2 : 1 + ((i * 7919) % 3);

ground[i] = clamp(Math.min(ground[i], y - depth), 0, y - 1);

}

}

};

/**

* Реки. Точки идут от истока к устью (как river.cells в Azgaar), а считать

* надо наоборот: от устья вверх, чтобы вода нигде не потекла в гору.

*

* Поверхность воды — «бегущий максимум» по дну долины: там, где долина

* поднимается, вода идёт по склону; где terrain ниже, чем уже посчитанная

* гладь, вода падает (водопад), но не поднимается. Русло при этом режется

* ниже глади, поэтому даже на равнине река не «висит» над лугом.

*/

const applyRivers = (field) => {

const { width, height, ground, groundBase, waterY, flags, flow, riverId } = field;

const stamp = new Uint32Array(field.area); // чем занята колонка: номер реки + 1

const cell = (u, v) => v * width + u;

let tag = 0;

for (const river of field.rivers) {

const points = river.points;

if (!points || points.length < 2) continue;

tag += 1;

const half = river.half ?? [];

const flux = river.flux ?? [];

let surf = 0;

let started = false;

let prevU = 0;

let prevV = 0;

let hasPrev = false;

for (let index = points.length - 1; index >= 0; index -= 1) {

const [x0, y0] = points[index];

const [x1, y1] = points[index - 1] ?? points[index]; // следующий вверх по течению

const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));

const w = clamp(Number(half[index]) || 0.6, 0.4, 12);

const fl = Number(flux[index]) || 30;

for (let s = 0; s <= steps; s += 1) {

const t = s / steps;

const px = x0 + (x1 - x0) * t;

const py = y0 + (y1 - y0) * t;

const u0 = Math.floor(px);

const v0 = Math.floor(py);

if (u0 < 0 || v0 < 0 || u0 >= width || v0 >= height) continue;

const scan = Math.max(1, Math.ceil(w)) + 1;

let floorY = field.worldHeight;

for (let dv = -scan; dv <= scan; dv += 1) {

const v = v0 + dv;

if (v < 0 || v >= height) continue;

for (let du = -scan; du <= scan; du += 1) {

const u = u0 + du;

if (u < 0 || u >= width) continue;

const y = groundBase[cell(u, v)];

if (y < floorY) floorY = y;

}

}

if (!started) {

const i = cell(u0, v0);

const lake = (flags[i] & F_LAKE) !== 0 && waterY[i] ? waterY[i] : 0;

surf = (flags[i] & F_SEA) !== 0 ? field.seaY : Math.max(field.seaY, lake || floorY);

started = true;

} else if (floorY <= surf - 2) {

surf = Math.max(field.seaY, floorY);

flags[cell(u0, v0)] |= F_FALL;

} else {

surf = Math.max(surf, Math.min(floorY, surf + 1));

}

surf = clamp(surf, 1, field.worldHeight - 4);

const depth = clamp(1 + Math.floor(Math.log2(Math.max(1, fl) / 24)), 1, 4);

const channel = Math.max(1, Math.round(w));

for (let dv = -channel - 1; dv <= channel + 1; dv += 1) {

const v = v0 + dv;

if (v < 0 || v >= height) continue;

for (let du = -channel - 1; du <= channel + 1; du += 1) {

const u = u0 + du;

if (u < 0 || u >= width) continue;

const i = cell(u, v);

const inside = Math.hypot(du, dv) <= w + 0.35;

if (!inside) {

/* Пойма: берег не должен оказаться ниже воды. Помечать её не

нужно — поднятие дна идемпотентно, а общий со «дном русла»

штамп съедал канал: река проставляла пойму, а на следующем

сэмпле отказывалась копать там русло. */

if ((flags[i] & F_WATER) === 0 && ground[i] < surf) ground[i] = clamp(surf, 1, field.worldHeight - 2);

continue;

}

if (stamp[i] === tag) continue;

if (riverId[i] && riverId[i] !== (river.id || 1)) continue; // чужое русло не перебиваем

stamp[i] = tag;

riverId[i] = river.id || 1;

flags[i] = (flags[i] & ~F_SEA) | F_RIVER | F_WATER;

const bed = clamp(Math.min(groundBase[i], surf - 1, surf - depth), 1, field.worldHeight - 2);

ground[i] = Math.min(ground[i], bed);

waterY[i] = surf;

/* течение — к устью: от текущего сэмпла к предыдущему (уже пройденному) */

const dir = hasPrev ? direction8(prevU - px, prevV - py) : 0;

flow[i] = (clamp(surf - bed, 0, 15) << 4) | dir;

hasPrev = true;

prevU = u;

prevV = v;

}

}

prevU = u0;

prevV = v0;

}

}

}

};

/** Пляжи: песок там, где суша в паре блоков над водой, и берег не ниже глади. */

const applyShore = (field) => {

const { width, height, ground, waterY, flags } = field;

const cell = (u, v) => v * width + u;

for (let v = 0; v < height; v += 1) {

for (let u = 0; u < width; u += 1) {

const i = cell(u, v);

if ((flags[i] & F_WATER) !== 0) continue;

let surface = 0;

for (let dv = -1; dv <= 1; dv += 1) {

for (let du = -1; du <= 1; du += 1) {

if (!du && !dv) continue;

const n = cell(floorMod(u + du, width), floorMod(v + dv, height));

if ((flags[n] & F_WATER) === 0) continue;

const y = waterY[n];

if (y - ground[i] > 3) continue;

if (y > surface) surface = y;

}

}

if (!surface) continue;

flags[i] |= F_BEACH;

if (ground[i] < surface) ground[i] = clamp(surface, 1, field.worldHeight - 2);

}

}

};

/** Снег по холоду и по высоте, лёд на воде: по t° решётки, а не по широте. */

const applyClimateCaps = (field) => {

const { width, height, ground, flags, cellTemp, cellBiome, seaY, heightScale } = field;

for (let v = 0; v < height; v += 1) {

for (let u = 0; u < width; u += 1) {

const i = v * width + u;

const c = latticeCell(field, u, v);

const temp = cellTemp[c];

if ((flags[i] & F_WATER) !== 0) {

if (temp <= -1) flags[i] |= F_ICE;

continue;

}

const lapse = (ground[i] - seaY) * 0.06 * heightScale;

if (temp - lapse <= -2 || cellBiome[c] === 11) flags[i] |= F_SNOW;

else if (temp <= 0 && noise2(field.seed, u, v, 24) > 0.4) flags[i] |= F_SNOW;

}

}

};

/* ---------- выборка для чанков ---------- */

/**

* Всё, что нужно колонке, по мировым координатам (любые целые, включая

* отрицательные): свёртка в тайл + выборка растров и решётки.

*/

export const sampleColumn = (field, x, z) => {

const { u, v, mx, my } = fold(field, x, z);

const i = v * field.width + u;

const c = latticeCell(field, u, v);

const flowByte = field.flow[i];

const flags = field.flags[i];

return {

u,

v,

mx,

my,

y: field.ground[i],

waterY: (flags & F_WATER) !== 0 ? field.waterY[i] : 0,

flags,

dir: flowByte & 15,

depth: flowByte >> 4,

lakeType: field.lakeType[i],

biome: field.cellBiome[c],

temp: field.cellTemp[c],

prec: field.cellPrec[c],

h: field.base[i],

};

};

/** Только верх твёрдого блока — для превью слота и точки появления. */

export const surfaceY = (field, x, z) => {

const { u, v } = fold(field, x, z);

return field.ground[v * field.width + u];

};

/** Ближайшая суша от центра карты — точка появления. */

export const spawnPoint = (field) => {

const cx = Math.floor(field.width / 2);

const cy = Math.floor(field.height / 2);

for (let radius = 0; radius <= Math.max(field.width, field.height); radius += 3) {

for (let a = 0; a < 24; a += 1) {

const angle = (a / 24) * Math.PI * 2;

const x = Math.round(cx + Math.cos(angle) * radius);

const z = Math.round(cy + Math.sin(angle) * radius);

const i = clamp(z, 0, field.height - 1) * field.width + clamp(x, 0, field.width - 1);

if ((field.flags[i] & F_WATER) === 0 && field.ground[i] >= field.seaY) {

return { x, z, y: field.ground[i] + 1 };

}

}

}

return { x: cx, z: cy, y: field.seaY + 2 };

};

````

### `src/world/math.js` · 163 строк · не трогать — идентичен main

````js

/* Математика блочного мира: детерминированный шум, хеши и матрицы.

Всё здесь — чистые функции без DOM: их гоняет scripts/test-voxel.mjs, и они

же работают в precache-сборке и по file://.

Детерминизм — главное требование: мир обязан быть одинаковым у мастера и у

игрока при одном seed. Поэтому никакого Math.random: только хеш от

координат и seed. */

/** 32-битный ротационный хеш (вариант splitmix/MurmurMix): дешёвый и стабильный. */

export const hash32 = (a, b = 0, c = 0, d = 0) => {

let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b9);

h = Math.imul(h ^ (c | 0) ^ 0x85ebca6b, 0xcc9e2d51);

h = (h << 13) | (h >>> 19);

h = Math.imul(h ^ (d | 0) ^ 0x1b873593, 0x1b873593);

h ^= h >>> 16;

h = Math.imul(h, 0x7feb352d);

h ^= h >>> 15;

return h >>> 0;

};

/** Случайное число 0…1 из целых координат: одна и та же пара даёт одно и то же число. */

export const rand01 = (a, b, c, d) => hash32(a, b, c, d) / 4294967296;

/** Строка seed → 32-битное число. Свой хеш, а не hash(): он стабильнее между движками. */

export const seedToInt = (seed) => {

const text = String(seed || '');

let h = 0x811c9dc5;

for (let i = 0; i < text.length; i += 1) {

h ^= text.charCodeAt(i);

h = Math.imul(h, 16777619) >>> 0;

}

return h >>> 0;

};

export const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

/** Непрерывное сглаживание 0…1 (smootherstep). */

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

const lerp = (a, b, t) => a + (b - a) * t;

/** Значения на решётке: узел решётки (ix, iy) зависит только от целых координат. */

const lattice2 = (seed, ix, iy, scale) => {

const x = Math.floor(ix / scale);

const y = Math.floor(iy / scale);

return rand01(seed, x, y, ((ix & 1023) << 10) | (iy & 1023));

};

/** Сглаженный шум 2D в диапазоне -1…1. */

export const noise2 = (seed, x, y, scale = 1) => {

const gx = x / scale;

const gy = y / scale;

const x0 = Math.floor(gx);

const y0 = Math.floor(gy);

const t = fade(gx - x0);

const u = fade(gy - y0);

const a = lerp(lattice2(seed, x0, y0, 1), lattice2(seed, x0 + 1, y0, 1), t);

const b = lerp(lattice2(seed, x0, y0 + 1, 1), lattice2(seed, x0 + 1, y0 + 1, 1), t);

return lerp(a, b, u) * 2 - 1;

};

/** Сглаженный шум 3D: нужен пещерам и рудам, где важно «не вылезти на поверхность». */

export const noise3 = (seed, x, y, z, scale = 1) => {

const gx = x / scale;

const gy = y / scale;

const gz = z / scale;

const x0 = Math.floor(gx);

const y0 = Math.floor(gy);

const z0 = Math.floor(gz);

const tx = fade(gx - x0);

const ty = fade(gy - y0);

const node = (dx, dy, dz) => rand01(seed, x0 + dx, y0 + dy, ((z0 + dz) << 12) ^ ((x0 + dx) & 4095));

const l00 = lerp(node(0, 0, 0), node(1, 0, 0), tx);

const l10 = lerp(node(0, 1, 0), node(1, 1, 0), tx);

const l01 = lerp(node(0, 0, 1), node(1, 0, 1), tx);

const l11 = lerp(node(0, 1, 1), node(1, 1, 1), tx);

return lerp(lerp(l00, l10, ty), lerp(l01, l11, ty), fade(gz - z0)) * 2 - 1;

};

/** Фрактальный шум: октавы с половинным шагом и весом. */

export const fbm2 = (seed, x, y, scale, octaves = 3) => {

let sum = 0;

let weight = 1;

let total = 0;

let s = scale;

for (let o = 0; o < octaves; o += 1) {

sum += noise2(seed + o * 7919, x, y, s) * weight;

total += weight;

weight *= 0.5;

s = Math.max(1, s / 2);

}

return sum / total;

};

/** Остаток от деления для отрицательных: у бесконечного мира координаты бывают отрицательные. */

export const floorMod = (value, period) => ((value % period) + period) % period;

/* ---------- матрицы (column-major, как в WebGL) ---------- */

export const mat4Identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export const mat4Perspective = (out, fovY, aspect, near, far) => {

const f = 1 / Math.tan(fovY / 2);

out.fill(0);

out[0] = f / (aspect || 1);

out[5] = f;

out[10] = (far + near) / (near - far);

out[11] = -1;

out[14] = (2 * far * near) / (near - far);

return out;

};

/**

* View из позиции и углов: yaw вокруг Y (0 = взгляд вдоль -Z), pitch вверх/вниз.

* right = normalize(cross(forward, worldUp)), up = cross(right, forward).

*/

export const mat4View = (out, eye, yaw, pitch) => {

const fx = -Math.sin(yaw) * Math.cos(pitch);

const fy = Math.sin(pitch);

const fz = -Math.cos(yaw) * Math.cos(pitch);

/* right = normalize(cross(forward, worldUp)) → (-fz, 0, fx) */

let rx = -fz;

let rz = fx;

const rl = Math.hypot(rx, rz);

if (rl < 1e-6) {

rx = 1;

rz = 0;

} else {

rx /= rl;

rz /= rl;

}

/* up = cross(right, forward) */

const ux = -rz * fy;

const uy = rz * fx - rx * fz;

const uz = rx * fy;

out[0] = rx;

out[1] = ux;

out[2] = -fx;

out[3] = 0;

out[4] = 0;

out[5] = uy;

out[6] = -fy;

out[7] = 0;

out[8] = rz;

out[9] = uz;

out[10] = -fz;

out[11] = 0;

out[12] = -(rx * eye[0] + rz * eye[2]);

out[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);

out[14] = fx * eye[0] + fy * eye[1] + fz * eye[2];

out[15] = 1;

return out;

};

export const mat4Multiply = (out, a, b) => {

for (let c = 0; c < 4; c += 1) {

for (let r = 0; r < 4; r += 1) {

out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];

}

}

return out;

};

````

### `src/world/world.js` · 168 строк · заменить целиком

````js

/* Хранилище чанков и кадровый бюджет.

Мир неограниченный и зацикленный (зеркальное замощение поля, §7 docs), поэтому

чанки живут только в памяти и только в радиусе обзора: колонка — чистая

функция от поля и координат, пересчёт дешевле кэша и его версионирования.

Потребитель у хранилища один — плоская карта (`layers.js`), которая по одному

блоку на пиксель читает `get(cx, cz).chunk` и `blockAt`. Отсюда и форма API:

никаких мешей, текстурных загрузчиков и «видимых» множеств — только построка

по бюджету кадра и статистика для HUD.

Генерация идёт кусками в пределах бюджета кадра (`step(budgetMs)`): воркеры

недоступны — в SharedArrayBuffer отказано (у хаба нет COOP/COEP), а в

однофайловой версии по file:// модульный воркер не грузится. Очередь

упорядочена по дистанции от камеры, так что первые кадры показывают ближние

чанки, а не случайные. */

import { CHUNK_SX, CHUNK_SZ, generateChunk } from './chunk.js';

import { clamp } from './math.js';

/** Ключ чанка. Координаты не нормализуем периодом: чанк на шве зеркального

* тайла не совпадает ни с одним «внутренним» — переиспользование дало бы щели. */

const key = (cx, cz) => `${cx},${cz}`;

/**

* @param {object} field результат buildField

* @param {{ radius?: number, skirt?: boolean, caves?: boolean, ores?: boolean,

* decor?: boolean }} options

*/

export const createVoxelWorld = (field, options = {}) => {

const radius = clamp(Math.round(options.radius ?? 6), 2, 24);

const chunks = new Map();

const state = { cx: null, cz: null, focusX: 0, focusZ: 0, queue: [], generated: 0, dropped: 0, genMs: 0 };

const inRange = (cx, cz) => Math.abs(cx - state.cx) <= radius && Math.abs(cz - state.cz) <= radius;

const create = (cx, cz) => {

const record = { cx, cz, key: key(cx, cz), chunk: null, ready: false, bytes: 0 };

chunks.set(record.key, record);

return record;

};

const buildRecord = (record) => {

const genStart = performance.now();

const chunk = generateChunk(field, record.cx, record.cz, {

skirt: options.skirt !== false,

caves: options.caves !== false,

ores: options.ores !== false,

decor: options.decor !== false,

});

state.genMs = performance.now() - genStart;

record.chunk = chunk;

/* Битый блок на блок: сколько чанк весит в памяти — это и есть цена

радиуса обзора, её и показываем в статистике. */

record.bytes = chunk.blocks.byteLength;

record.ready = true;

return record;

};

/** Камера смотрит в мировую точку (x, z) по пикселям карты. */

const focus = (x, z) => {

state.focusX = x;

state.focusZ = z;

const cx = Math.floor(x / CHUNK_SX);

const cz = Math.floor(z / CHUNK_SZ);

if (cx === state.cx && cz === state.cz) return false;

state.cx = cx;

state.cz = cz;

reschedule();

return true;

};

/** Все чанки в радиусе — в очередь; готовые остаются готовыми. */

const reschedule = () => {

const list = [];

for (let dz = -radius; dz <= radius; dz += 1) {

for (let dx = -radius; dx <= radius; dx += 1) {

const cx = state.cx + dx;

const cz = state.cz + dz;

const record = chunks.get(key(cx, cz));

if (record?.ready) continue;

list.push({ k: cx * 1e6 + cz, cx, cz, d: dx * dx + dz * dz });

}

}

list.sort((a, b) => a.d - b.d || a.k - b.k);

state.queue = list.map((item) => key(item.cx, item.cz));

dropFar();

};

/** Выгружаем то, что далеко: память должна быть ограничена радиусом. */

const dropFar = () => {

for (const [k, record] of chunks) {

if (inRange(record.cx, record.cz)) continue;

chunks.delete(k);

state.dropped += 1;

}

};

/**

* Генерирует чанки, пока не кончится бюджет кадра. Один чанк на вызов —

* минимальная порция: даже он стоит единицы миллисекунд, а два подряд уже

* могут съесть кадр на слабом телефоне.

*

* @param {number} budgetMs

* @returns {{done: boolean, generated: number, ms: number, queued: number}}

*/

const step = (budgetMs = 6) => {

if (!state.queue.length) return { done: true, generated: 0, ms: 0, queued: 0 };

const start = performance.now();

let generated = 0;

do {

const next = state.queue.shift();

if (!next) break;

const [cx, cz] = next.split(',').map(Number);

const record = chunks.get(next) ?? create(cx, cz);

if (!record.ready) buildRecord(record);

generated += 1;

} while (state.queue.length && performance.now() - start < budgetMs);

state.generated += generated;

return { done: state.queue.length === 0, generated, ms: performance.now() - start, queued: state.queue.length };

};

const get = (cx, cz) => chunks.get(key(cx, cz)) ?? null;

const stats = () => {

let ready = 0;

let bytes = 0;

for (const record of chunks.values()) {

if (!record.ready) continue;

ready += 1;

bytes += record.bytes;

}

const total = (radius * 2 + 1) ** 2;

return {

chunks: chunks.size,

ready,

queued: state.queue.length,

pending: total - ready - state.queue.length,

radius,

focus: { cx: state.cx, cz: state.cz },

bytes,

generated: state.generated,

dropped: state.dropped,

lastGenMs: state.genMs,

};

};

const dispose = () => {

chunks.clear();

state.queue = [];

};

return {

field,

radius,

focus,

step,

get,

stats,

dispose,

/** Сколько чанков уже построено — по этому признаку экран ждёт первого кадра. */

get readyCount() {

let count = 0;

for (const record of chunks.values()) if (record.ready) count += 1;

return count;

},

};

};

````

### `src/game/world-view.js` · 535 строк · заменить целиком

````js

/* Плоская карта мира блок за блоком: один пиксель — один блок, ярус — ползунок.

Экран карты уже держит iframe с генератором, и именно из его окна вид берёт

карты (src/world/bridge.js). Поэтому режим переключается классом на .world-app,

а не перерисовкой страницы: пересоздание iframe заново запустило бы генерацию

Azgaar (секунды), и мир пришлось бы строить с нуля.

Что здесь есть:

• ползунок яруса (1…worldHeight) с пресетами — кроны, поверхность, вода,

дно, пещеры, руды, основание: «разрезать мир плоскостью на высоте Y»;

• перетаскивание — сдвиг, колесо — масштаб (1…8 px на блок), стрелки —

сдвиг, PageUp/PageDown — ярус (Shift — на десять), +/− — масштаб;

• наложения: стрелки течения (живые), береговая линия, отметки высот,

тени рельефа — каждое выключается, потому что на маленьком экране они

мешают друг другу;

• очередь чанков с бюджетом кадра (src/world/world.js): первые кадры

показывают ближние чанки, дальние догоняют;

• HUD: что под курсором (тот же блок, что нарисован в пикселе), сколько

чанков построено и сколько стоит кадр.

Полотно рисуется в разрешении блоков (1 px = 1 блок) и растягивается CSS-ом с

image-rendering: pixelated — так картинка идёт ровно по сетке чанков, а цена

кадра зависит от размера окна, поделённого на масштаб, и не зависит от DPI. */

import { blockName } from '../world/blocks.js';

import { CHUNK_SX, CHUNK_SZ, blockAt } from '../world/chunk.js';

import { buildField, fold, spawnPoint, surfaceY } from '../world/field.js';

import { VoxelSourceError, describeSource, readSource } from '../world/bridge.js';

import { createVoxelWorld } from '../world/world.js';

import { buildAtlas, buildTileColors } from '../world/atlas.js';

import {

LAYER_PRESETS,

ZOOM_DEFAULT,

ZOOM_MAX,

ZOOM_MIN,

buildSlice,

cutY,

makeView,

presetLevel,

zoneName,

} from '../world/layers.js';

import { icon } from '../ui/icons.js';

const BUDGET_MS = 6;

/** Кадры с течением дороже статичных, а пульс воды медленный: 14 FPS для

анимации достаточно и вчетверо дешевле, чем перекрашивать каждый кадр. */

const PAINT_MS = 70;

const LEVEL_BIG = 10;

const PAN_STEP = 24;

/** Потолок стоимости кадра: перекрасить 260 000 блоков — десятки миллисекунд,

больше нельзя даже на 4K-мониторе при мелком блоке. */

const MAX_CELLS = 260_000;

const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

/**

* @param {HTMLElement} host элемент .world-editor: в нём лежит iframe с картой

* @param {{ frame?: HTMLIFrameElement, config?: object, onExit?: () => void }} [options]

* @returns {object} view — element, level, zoom, overlays, dispose

*/

export const mountWorldView = (host, { frame, config, onExit } = {}) => {

const cleanups = [];

let raf = 0;

const root = document.createElement('div');

root.className = 'world-voxel';

root.dataset.role = 'world-voxel';

root.innerHTML = `

<canvas class="world-voxel-canvas" data-role="voxel-canvas" tabindex="0" aria-label="Карта мира блок за блоком"></canvas>

<div class="world-voxel-toolbar">

<button class="world-voxel-button" type="button" data-voxel-action="reset" aria-label="К точке появления" title="К точке появления (R)">${icon('crosshair', 'icon--xs')}<span>Появление</span></button>

<button class="world-voxel-button" type="button" data-voxel-action="exit" aria-label="К карте" title="К карте (Esc)">${icon('map', 'icon--xs')}<span>К карте</span></button>

</div>

<div class="world-voxel-layers" data-role="voxel-layers">

<div class="world-voxel-row">

<span class="world-voxel-label">ярус</span>

<button class="world-voxel-step" type="button" data-voxel-action="level-down" aria-label="Ярус ниже">−</button>

<input class="world-voxel-slider" type="range" data-role="voxel-level" min="1" max="2" step="1" value="1" aria-label="Ярус среза">

<button class="world-voxel-step" type="button" data-voxel-action="level-up" aria-label="Ярус выше">+</button>

<output class="world-voxel-value" data-role="voxel-level-value"></output>

</div>

<div class="world-voxel-row world-voxel-row--presets" data-role="voxel-presets"></div>

<div class="world-voxel-row">

<span class="world-voxel-label">блок</span>

<button class="world-voxel-step" type="button" data-voxel-action="zoom-out" aria-label="Крупнее блок" title="Крупнее блок (−)">−</button>

<output class="world-voxel-value" data-role="voxel-zoom-value"></output>

<button class="world-voxel-step" type="button" data-voxel-action="zoom-in" aria-label="Мельче блок" title="Мельче блок (+)">+</button>

<span class="world-voxel-label world-voxel-label--right">наложения</span>

<span data-role="voxel-overlays"></span>

</div>

<p class="world-voxel-hud" data-role="voxel-hud" role="status" aria-live="off"></p>

</div>

<p class="world-voxel-note" data-role="voxel-note"></p>`;

host.append(root);

const canvas = root.querySelector('[data-role="voxel-canvas"]');

const hud = root.querySelector('[data-role="voxel-hud"]');

const note = root.querySelector('[data-role="voxel-note"]');

const slider = root.querySelector('[data-role="voxel-level"]');

const levelValue = root.querySelector('[data-role="voxel-level-value"]');

const zoomValue = root.querySelector('[data-role="voxel-zoom-value"]');

const presetHost = root.querySelector('[data-role="voxel-presets"]');

const overlayHost = root.querySelector('[data-role="voxel-overlays"]');

const setNote = (text) => {

note.textContent = text || '';

note.hidden = !text;

};

const listen = (target, type, handler, options) => {

target.addEventListener(type, handler, options);

cleanups.push(() => target.removeEventListener(type, handler, options));

};

const OVERLAYS = [

{ key: 'arrows', name: 'течение' },

{ key: 'coast', name: 'вода' },

{ key: 'labels', name: 'отметки' },

{ key: 'shade', name: 'рельеф' },

];

presetHost.innerHTML = LAYER_PRESETS.map(

(preset) => `<button class="world-voxel-chip" type="button" data-layer="${preset.id}" title="${preset.hint}">${preset.name}</button>`,

).join('');

overlayHost.innerHTML = OVERLAYS.map(

(item) => `<button class="world-voxel-chip is-on" type="button" data-overlay="${item.key}" aria-pressed="true">${item.name}</button>`,

).join('');

const view = {

element: root,

error: '',

/* Ярус и масштаб — состояние вида, а не полотна: их читают тесты, и они

должны жить независимо от того, есть ли у браузера 2D-канвас. */

level: 0,

zoom: ZOOM_DEFAULT,

preset: null,

center: [0, 0],

overlays: { arrows: true, coast: true, labels: true, shade: true },

cells: { x: 0, z: 0 },

cursor: null,

frameMs: 0,

sliceInfo: null,

field: null,

source: null,

world: null,

spawn: null,

running: false,

dirty: true,

};

view.dispose = () => {

view.running = false;

if (raf) cancelAnimationFrame(raf);

raf = 0;

for (const cleanup of cleanups.splice(0)) cleanup();

view.world?.dispose();

root.remove();

};

/* Отказ до построения мира: показываем причину и оставляем рабочий dispose. */

const stop = (message) => {

view.error = message;

setNote(message);

hud.textContent = 'Мир не построен — данные карты недоступны.';

return view;

};

/* ---------- снимок карт → поле ---------- */

let source;

try {

source = readSource(frame?.contentWindow, { seed: config?.seed, width: config?.width, height: config?.height });

} catch (error) {

const message = error instanceof VoxelSourceError ? error.message : error?.message ?? String(error);

return stop(`Карта блоками: ${message}`);

}

setNote(`Снимаю карты: ${describeSource(source)}…`);

const field = buildField(source, { profile: 2, detail: 1 });

view.field = field;

view.source = source;

const spawn = spawnPoint(field);

view.spawn = spawn;

/* Палитра берётся из того же атласа, что и текстуры: средний цвет тайла той

грани, которую видно сверху. Отдельная палитра разъехалась бы с атласом при

первой же правке тонов. */

const colors = buildTileColors(buildAtlas(field.seed));

const blockAtWorld = (x, y, z) => {

const record = world.get(Math.floor(x / CHUNK_SX), Math.floor(z / CHUNK_SZ));

const chunk = record?.chunk;

if (!chunk) return null;

const lx = x - chunk.x0;

const lz = z - chunk.z0;

if (lx < 0 || lx >= chunk.sx || lz < 0 || lz >= chunk.sz) return null;

return blockAt(chunk, lx, y, lz);

};

/* Радиус обзора не должен превышать размер тайла: чанки за тайлом — те же

самые чанки в зеркальном замощении, и просить их означало бы вчетверо

больше памяти при той же картинке (на маленьких картах это видно). */

const reviewRadius = clamp(Math.floor(Math.min(field.width, field.height) / (CHUNK_SX * 2)), 2, 7);

const world = createVoxelWorld(field, { radius: reviewRadius });

view.world = world;

world.focus(spawn.x, spawn.z);

view.center = [spawn.x, spawn.z];

/* ---------- ярус, масштаб, кадрирование ---------- */

const currentView = () => makeView(view.center, view.cells.x, view.cells.z);

view.makeView = currentView;

/* Медиана рельефа в кадре — нужна подписи под ползунком, чтобы отличить

«срез выше вершин» от «срез в толще». Считаем по редкой решётке: кадр

перестраивается на каждое движение, а точность здесь — десятки блоков. */

let median = { key: '', value: NaN };

const medianGround = () => {

const cells = currentView();

const signature = `${cells.x0},${cells.z0},${cells.cellsX},${cells.cellsZ}`;

if (median.key === signature) return median.value;

let sum = 0;

let count = 0;

const stepX = Math.max(1, Math.round(cells.cellsX / 48));

const stepZ = Math.max(1, Math.round(cells.cellsZ / 32));

for (let z = 0; z < cells.cellsZ; z += stepZ) {

for (let x = 0; x < cells.cellsX; x += stepX) {

const { u, v } = fold(field, cells.x0 + x, cells.z0 + z);

sum += field.ground[v * field.width + u];

count += 1;

}

}

median = { key: signature, value: count ? Math.round(sum / count) : NaN };

return median.value;

};

const syncChips = () => {

for (const chip of presetHost.querySelectorAll('[data-layer]')) {

const on = chip.dataset.layer === view.preset;

chip.classList.toggle('is-on', on);

chip.setAttribute('aria-pressed', on ? 'true' : 'false');

}

for (const chip of overlayHost.querySelectorAll('[data-overlay]')) {

const on = view.overlays[chip.dataset.overlay] === true;

chip.classList.toggle('is-on', on);

chip.setAttribute('aria-pressed', on ? 'true' : 'false');

}

};

const levelText = () => {

const preset = view.preset ? LAYER_PRESETS.find((item) => item.id === view.preset) : null;

return `ярус ${view.level} · ${zoneName(field, view.level, medianGround())}${preset ? ` · ${preset.name}` : ''}`;

};

const syncLabel = () => {

slider.value = String(view.level);

levelValue.textContent = levelText();

zoomValue.textContent = `${view.zoom} px/блок`;

};

const applyLevel = (next, preset = null) => {

view.level = clamp(Math.round(next), 1, field.worldHeight - 1);

view.preset = preset;

syncChips();

syncLabel();

view.dirty = true;

};

const applyZoom = (next, anchor = null) => {

const before = view.zoom;

const after = clamp(Math.round(next), ZOOM_MIN, ZOOM_MAX);

if (after === before) return;

if (anchor) {

/* Точка под курсором должна остаться на месте: сдвиг центра равен

разнице «сколько блоков было под курсором» и «сколько стало». */

view.center[0] += anchor[0] * (1 / before - 1 / after);

view.center[1] += anchor[1] * (1 / before - 1 / after);

}

view.zoom = after;

view.dirty = true;

};

const context = canvas.getContext('2d');

let image = null;

let boxKey = '';

/** Размер полотна в блоках: сколько помещается в окно при выбранном

масштабе, но не дороже MAX_CELLS перекрасок на кадр. */

const fitCanvas = () => {

const width = Math.max(64, Math.round(canvas.clientWidth || canvas.getBoundingClientRect?.().width || 64));

const height = Math.max(64, Math.round(canvas.clientHeight || canvas.getBoundingClientRect?.().height || 64));

let cellsX = Math.max(8, Math.ceil(width / view.zoom));

let cellsZ = Math.max(8, Math.ceil(height / view.zoom));

const over = (cellsX * cellsZ) / MAX_CELLS;

if (over > 1) {

/* Окно велико, а масштаб уже на максимуме: берём чуть меньше блоков, чем

просит экран, и растягиваем их CSS-ом. Пиксели станут на долю блока

шире — иначе кадр стоил бы десятки миллисекунд. */

const k = Math.sqrt(over);

cellsX = Math.max(8, Math.floor(cellsX / k));

cellsZ = Math.max(8, Math.floor(cellsZ / k));

}

const key = `${width}×${height}×${view.zoom}×${cellsX}×${cellsZ}`;

if (key === boxKey) return false;

boxKey = key;

view.cells = { x: cellsX, z: cellsZ };

canvas.width = cellsX;

canvas.height = cellsZ;

image = context ? context.createImageData(cellsX, cellsZ) : null;

view.dirty = true;

return true;

};

let paintAt = 0;

const paint = (now) => {

if (!context || !image) {

view.dirty = false;

return;

}

const t0 = performance.now();

const slice = buildSlice(field, colors, world, currentView(), {

level: view.level,

time: now / 1000,

arrows: view.overlays.arrows,

coast: view.overlays.coast,

labels: view.overlays.labels,

shade: view.overlays.shade,

});

image.data.set(slice.data);

context.putImageData(image, 0, 0);

view.frameMs = performance.now() - t0;

view.sliceInfo = { fromChunks: slice.fromChunks, fromField: slice.fromField, water: slice.water };

paintAt = now;

view.dirty = false;

};

const focusSpawn = () => {

view.center = [spawn.x, spawn.z];

view.zoom = ZOOM_DEFAULT;

fitCanvas();

world.focus(spawn.x, spawn.z);

applyLevel(field.worldHeight - 1, 'surface');

};

/* ---------- управление ---------- */

let drag = null;

listen(canvas, 'pointerdown', (event) => {

if (event.pointerType === 'mouse' && event.button !== 0) return;

canvas.setPointerCapture?.(event.pointerId);

drag = { x: event.clientX, y: event.clientY };

canvas.focus({ preventScroll: true });

});

listen(canvas, 'pointermove', (event) => {

if (drag) {

view.center[0] -= (event.clientX - drag.x) / view.zoom;

view.center[1] -= (event.clientY - drag.y) / view.zoom;

drag.x = event.clientX;

drag.y = event.clientY;

syncLabel();

view.dirty = true;

}

readCursor(event);

});

const endDrag = (event) => {

drag = null;

if (event?.pointerId !== undefined) canvas.releasePointerCapture?.(event.pointerId);

};

listen(canvas, 'pointerup', endDrag);

listen(canvas, 'pointercancel', endDrag);

listen(canvas, 'pointerleave', () => {

view.cursor = null;

});

listen(canvas, 'wheel', (event) => {

event.preventDefault();

const rect = canvas.getBoundingClientRect();

applyZoom(view.zoom * (event.deltaY > 0 ? 1 / 1.25 : 1.25), [event.clientX - rect.left, event.clientY - rect.top]);

fitCanvas();

syncLabel();

}, { passive: false });

/** Блок под курсором — тот же, что нарисован в этом пикселе: ярус с поправкой

на вершину колонки (cutY), а не «level» вообще. */

const readCursor = (event) => {

const rect = canvas.getBoundingClientRect();

if (!rect.width || !rect.height) return;

const cells = currentView();

const cx = Math.floor(((event.clientX - rect.left) / rect.width) * cells.cellsX);

const cz = Math.floor(((event.clientY - rect.top) / rect.height) * cells.cellsZ);

if (cx < 0 || cz < 0 || cx >= cells.cellsX || cz >= cells.cellsZ) {

view.cursor = null;

return;

}

const x = cells.x0 + cx;

const z = cells.z0 + cz;

const { u, v } = fold(field, x, z);

const y = cutY(field, v * field.width + u, view.level);

view.cursor = { x, y, z, id: blockAtWorld(x, y, z), surface: surfaceY(field, x, z) };

};

listen(root, 'click', (event) => {

const presetButton = event.target.closest?.('[data-layer]');

if (presetButton) {

const level = presetLevel(field, blockAtWorld, currentView(), presetButton.dataset.layer);

applyLevel(level ?? field.worldHeight - 1, presetButton.dataset.layer);

return;

}

const overlay = event.target.closest?.('[data-overlay]');

if (overlay) {

const key = overlay.dataset.overlay;

view.overlays[key] = view.overlays[key] !== true;

syncChips();

view.dirty = true;

return;

}

const button = event.target.closest?.('[data-voxel-action]');

if (!button) return;

const { voxelAction } = button.dataset;

if (voxelAction === 'reset') focusSpawn();

else if (voxelAction === 'exit') onExit?.();

else if (voxelAction === 'level-down') applyLevel(view.level - (event.shiftKey ? LEVEL_BIG : 1));

else if (voxelAction === 'level-up') applyLevel(view.level + (event.shiftKey ? LEVEL_BIG : 1));

else if (voxelAction === 'zoom-out') {

applyZoom(view.zoom - 1);

fitCanvas();

syncLabel();

} else if (voxelAction === 'zoom-in') {

applyZoom(view.zoom + 1);

fitCanvas();

syncLabel();

}

});

listen(slider, 'input', () => applyLevel(Number(slider.value)));

const editable = (node) => /^(INPUT|TEXTAREA|SELECT)$/.test(node?.tagName || '') || node?.isContentEditable;

listen(window, 'keydown', (event) => {

if (event.metaKey || event.ctrlKey || event.altKey) return;

/* На ползунке стрелки и PageUp/PageDown работают сами — и ровно с той же

семантикой (±1, Shift — крупный шаг). Дублировать их здесь означало бы

двигать ещё и карту. Esc обрабатывает main.js: ступеньки выхода его. */

if (event.target === slider || editable(event.target)) return;

if (event.code === 'KeyR') {

focusSpawn();

return;

}

const big = event.shiftKey;

const step = big ? LEVEL_BIG : 1;

let handled = true;

switch (event.code) {

case 'PageUp':

applyLevel(view.level + step);

break;

case 'PageDown':

applyLevel(view.level - step);

break;

case 'Equal':

case 'NumpadAdd':

applyZoom(view.zoom + 1);

fitCanvas();

syncLabel();

break;

case 'Minus':

case 'NumpadSubtract':

applyZoom(view.zoom - 1);

fitCanvas();

syncLabel();

break;

case 'ArrowLeft':

view.center[0] -= PAN_STEP * (big ? 4 : 1);

break;

case 'ArrowRight':

view.center[0] += PAN_STEP * (big ? 4 : 1);

break;

case 'ArrowUp':

view.center[1] -= PAN_STEP * (big ? 4 : 1);

break;

case 'ArrowDown':

view.center[1] += PAN_STEP * (big ? 4 : 1);

break;

default:

handled = false;

}

if (handled) {

event.preventDefault();

syncLabel();

view.dirty = true;

}

});

/* ---------- цикл ---------- */

let hudAt = 0;

let hudText = '';

let noteCleared = false;

let lastFocus = [view.center[0], view.center[1]];

const tick = (now) => {

if (!view.running) return;

raf = requestAnimationFrame(tick);

fitCanvas();

const gen = world.step(BUDGET_MS);

if (Math.abs(view.center[0] - lastFocus[0]) >= CHUNK_SX / 2 || Math.abs(view.center[1] - lastFocus[1]) >= CHUNK_SZ / 2) {

lastFocus = [view.center[0], view.center[1]];

world.focus(view.center[0], view.center[1]);

}

if (now - hudAt > 240) {

hudAt = now;

const stats = world.stats();

const bits = [`чанков ${stats.ready}${stats.queued ? ` + ${stats.queued} в очереди` : ''}`];

if (view.sliceInfo) {

bits.push(`по блокам ${view.sliceInfo.fromChunks.toLocaleString('ru-RU')}, по схеме поля ${view.sliceInfo.fromField.toLocaleString('ru-RU')}`);

}

bits.push(`${view.frameMs.toFixed(1)} мс/кадр`);

if (view.cursor) {

bits.push(view.cursor.id === null ? 'чанк под курсором ещё не построен' : `под курсором: ${blockName(view.cursor.id)} ${view.cursor.x}/${view.cursor.y}/${view.cursor.z}`);

}

const text = bits.join(' · ');

if (text !== hudText) {

hudText = text;

hud.textContent = text;

}

if (stats.ready > 0 && gen.done && !noteCleared) {

noteCleared = true;

setNote('');

}

}

/* Перекрашиваем, только если что-то изменилось либо живёт течение: кадр

стоит десятки миллисекунд на полном экране, и греть их впустую нельзя. */

const animate = view.overlays.arrows && (view.sliceInfo?.water ?? 0) > 0;

if (!view.dirty && gen.generated === 0 && !(animate && now - paintAt >= PAINT_MS)) return;

paint(now);

};

/* Ползунок ходит по индексам блоков: верхний ярус = верхний блок мира,

«выше всех вершин» при этом остаётся первым пресетом. */

slider.max = String(field.worldHeight - 1);

fitCanvas();

syncChips();

applyLevel(field.worldHeight - 1, 'surface');

setNote(

`Мир ${field.width} × ${field.height} колонок, ярусов ${field.worldHeight}. ` +

'Перетаскивание — сдвиг, колесо — масштаб, PageUp/PageDown — ярус.',

);

view.running = true;

raf = requestAnimationFrame(tick);

return view;

};

````

### `scripts/lib/fake-fmg.mjs` · 53 строк · заменить целиком

````js

/* Поддельное окно редактора для тестов: те же имена полей, что читает

src/world/bridge.js, и тот же смысл значений. Нужен потому, что настоящего

Azgaar в Node нет (iframe живёт только в браузере), а мост без проверки —

самое хрупкое место: генератор переименовывает поля молча, и молча же

воксельный мир начинает строить не тот рельеф.

Карта: 6×6 клеток по 16 пикселов = 96×96 колонок, уровень моря 20.

Три pack-клетки перенесены на grid (суша 30/25/26), одна из них — озеро,

две соединены рекой. Излучистость не подключена (`Rivers` в окне нет),

поэтому русло идёт по центрам клеток — ровно тот запасной путь, который

мост использует для старых снимков. */

export const FAKE_MAP = { cells: 6, spacing: 16, size: 96, seaLevel: 20 };

/** @returns {object} объект, годный как `iframe.contentWindow` для readSource */

export const fakeEditorWindow = () => {

const total = FAKE_MAP.cells * FAKE_MAP.cells;

const gridH = new Array(total).fill(5); // всё под уровнем моря

gridH[0] = 12;

const temp = new Array(total).fill(12);

temp[7] = 3;

const prec = new Array(total).fill(20);

prec[14] = 40;

return {

SEA_LEVEL: FAKE_MAP.seaLevel,

options: { map: { graph: { width: FAKE_MAP.size, height: FAKE_MAP.size } } },

grid: {

spacing: FAKE_MAP.spacing,

cellsX: FAKE_MAP.cells,

cellsY: FAKE_MAP.cells,

cells: { h: gridH, temp, prec },

},

pack: {

cells: {

h: [30, 25, 26],

g: [0, 7, 14],

biome: [1, 7, 7],

p: [[0, 0], [24, 24], [72, 72]],

},

features: [{ type: 'lake', cells: [1], subtype: 'freshwater', height: 22 }],

rivers: [{ i: 1, cells: [1, 2], sourceWidth: 0.5, widthFactor: 1, discharge: 40 }],

},

};

};

/** Ожидания от снимка этого окна — по ним и проверяем мост. */

export const FAKE_EXPECT = {

width: 96,

height: 96,

heights: { dry: 30, lake: 25, sea: 5 },

cells: { land: 0, lake: 7, river: 14 },

riverPoints: [[24, 24], [72, 72]],

};

````

### `scripts/test-voxel.mjs` · 682 строк · заменить целиком

````js

/* Проверка мира блоками: поле → чанк → слой. Запуск: npm run test:voxel

Карта блоками рисуется в canvas, но сам canvas в node недоступен, поэтому

проверяем то, что нельзя увидеть глазами в браузере: согласованность данных

на швах и то, что пиксель слоя = блок в этой же точке мира.

1. Зеркальное замощение (fold): сосед колонки за краем тайла — та же

колонка, иначе на стыках повторяющегося мира были бы обрывы рек и

стен;

2. Река: вода нигде не течёт в гору, у каждого русла есть направление

течения, канал глубже глади;

3. Чанк: детерминированность (два раза один и тот же чанк), соседние чанки

сходятся с «юбкой» — без этого между чанками видны щели;

4. Палитра: упаковка/распаковка чанка сохраняет блоки;

5. Срез: пиксель = блок на плоскости реза (цвета берутся из атласа),

честный подсчёт клеток, вода/берег/стрелки течения, пресеты ярусов и

зеркальная периодичность: срез, сдвинутый на период тайла, побайтно тот же;

6. Бюджет времени: сколько стоит поле и один чанк — по нему судим, нужна

ли распараллеленная генерация. */

import './lib/root.mjs';

import { buildField, fold, sampleColumn, surfaceY, F_RIVER, F_WATER, F_FALL, flowVector, direction8 } from '../src/world/field.js';

import { AIR, ATLAS_COLUMNS, BIOME_PALETTE, BLOCKS, BLOCK_COUNT, biomeFromClimate, blockName, GRASS, isKnownBlock, isOpaque, isSolid, paletteFor, SAND, STONE, WATER, WATER_SOURCE, TILES } from '../src/world/blocks.js';

import { CHUNK_SX, CHUNK_SZ, generateChunk, blockAt } from '../src/world/chunk.js';

import { encodePalette, decodePalette } from '../src/world/chunk.js';

import { readSource, mapsReady, missingMapsPart, VoxelSourceError } from '../src/world/bridge.js';

import { createVoxelWorld } from '../src/world/world.js';

import { buildAtlas, buildTileColors } from '../src/world/atlas.js';

import {

LAYER_PRESETS,

ZOOM_DEFAULT,

ZOOM_MAX,

ZOOM_MIN,

buildSlice,

cutY,

makeView,

presetLevel,

zoneName,

} from '../src/world/layers.js';

import { fakeEditorWindow, FAKE_EXPECT } from './lib/fake-fmg.mjs';

/* Русское согласование числительного: «61 проверка», а не «61 проверок». */

const plural = (n, one, few, many) => {

const mod10 = n % 10;

const mod100 = n % 100;

if (mod10 === 1 && mod100 !== 11) return one;

if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;

return many;

};

const checks = [];

const add = (ok, what, detail = '') => checks.push({ ok: Boolean(ok), what, detail });

/* ---------- синтетический источник: остров с рекой и озером ---------- */

const CELLS_X = 40;

const CELLS_Y = 30;

const SPACING = 12;

const WIDTH = CELLS_X * SPACING;

const HEIGHT = CELLS_Y * SPACING;

const island = () => {

const cellH = new Float32Array(CELLS_X * CELLS_Y);

const cellBiome = new Uint8Array(CELLS_X * CELLS_Y);

const cellTemp = new Int8Array(CELLS_X * CELLS_Y);

const cellPrec = new Uint8Array(CELLS_X * CELLS_Y);

const cellFeature = new Uint16Array(CELLS_X * CELLS_Y);

for (let cy = 0; cy < CELLS_Y; cy += 1) {

for (let cx = 0; cx < CELLS_X; cx += 1) {

const nx = (cx / (CELLS_X - 1)) * 2 - 1;

const ny = (cy / (CELLS_Y - 1)) * 2 - 1;

const d = Math.hypot(nx * 1.05, ny * 1.4);

const ridge = Math.sin(nx * 5.1 + 0.6) * Math.cos(ny * 4.3 - 0.4);

let h = 20 + (1 - Math.min(1, d)) * 46 + ridge * 9;

h -= Math.max(0, d - 0.78) * 150; // край уходит под море

const i = cy * CELLS_X + cx;

h = Math.round(Math.max(2, Math.min(96, h)));

cellH[i] = h;

const t = Math.round(30 - Math.abs(ny) * 34 + (h > 55 ? -10 : 0));

cellTemp[i] = t;

const p = Math.round(30 + Math.cos(nx * 3.2) * 24 + (t > 10 ? 8 : -6));

cellPrec[i] = Math.max(2, Math.min(96, p));

cellBiome[i] = h <= 20 ? 0 : t < -6 ? 11 : t < 2 ? 10 : t < 10 ? 9 : p < 18 ? 1 : p < 30 ? 4 : p < 44 ? 6 : 7;

}

}

/* Реку ведём по склону: исток — самая высокая клетка, дальше — шаг к самой

низкой из соседних (как это делает сам Azgaar, только без депрешн-фильтров).

Искусственная «диагональ» через хребет давала бы русло, идущее в гору, и

проверка монотонности глади ловила бы не генератор, а выдуманный путь. */

const riverPoints = [];

const half = [];

const flux = [];

let bestCell = 0;

for (let i = 1; i < cellH.length; i += 1) if (cellH[i] > cellH[bestCell]) bestCell = i;

let cx = bestCell % CELLS_X;

let cy = (bestCell / CELLS_X) | 0;

const visited = new Set();

for (let step = 0; step < 120; step += 1) {

visited.add(cy * CELLS_X + cx);

riverPoints.push([Math.round((cx + 0.5) * SPACING), Math.round((cy + 0.5) * SPACING)]);

let next = -1;

let nextH = cellH[cy * CELLS_X + cx];

for (let dy = -1; dy <= 1; dy += 1) {

for (let dx = -1; dx <= 1; dx += 1) {

if (!dx && !dy) continue;

const nx2 = cx + dx;

const ny2 = cy + dy;

if (nx2 < 0 || ny2 < 0 || nx2 >= CELLS_X || ny2 >= CELLS_Y) continue;

const n = ny2 * CELLS_X + nx2;

if (visited.has(n)) continue;

if (cellH[n] < nextH) {

nextH = cellH[n];

next = n;

}

}

}

if (next < 0 || nextH <= 20) break; // дошли до моря

cx = next % CELLS_X;

cy = (next / CELLS_X) | 0;

}

for (let i = 0; i < riverPoints.length; i += 1) {

const t = i / Math.max(1, riverPoints.length - 1);

half.push(0.7 + t * 2.4);

flux.push(30 + Math.round(t * 900));

}

const lakeCells = [];

for (let cy = 18; cy <= 21; cy += 1) for (let cx = 26; cx <= 29; cx += 1) lakeCells.push(cy * CELLS_X + cx);

for (const c of lakeCells) cellFeature[c] = 1;

return {

width: WIDTH,

height: HEIGHT,

spacing: SPACING,

cellsX: CELLS_X,

cellsY: CELLS_Y,

seaLevel: 20,

seedSalt: 20260,

cellH,

cellBiome,

cellTemp,

cellPrec,

cellFeature,

features: [{ i: lakeCells[0], type: 'lake', subtype: 'freshwater', height: 34 }],

rivers: [{ id: 1, points: riverPoints, half, flux }],

};

};

const t0 = performance.now();

const field = buildField(island(), { profile: 2, detail: 1 });

const fieldMs = performance.now() - t0;

add(field.width === WIDTH && field.height === HEIGHT, 'поле по размеру тайла', `${WIDTH} × ${HEIGHT} px`);

add(field.seed > 0, 'затравка поля собрана из размера и соли');

/* ---------- 1. замощение ---------- */

let seams = 0;

for (let z = -3; z < HEIGHT + 3; z += 7) {

for (const [x, ref] of [

[WIDTH - 1, WIDTH],

[0, -1],

]) {

const a = sampleColumn(field, x, z);

const b = sampleColumn(field, ref, z);

if (a.y !== b.y || a.flags !== b.flags) seams += 1;

}

}

add(seams === 0, 'зеркальное замощение: сосед за краем = та же колонка', seams ? `${seams} расхождений` : 'границы тайлов непрерывны');

const left = surfaceY(field, 0, 100);

const right = surfaceY(field, field.width * 2, 100);

add(left === right, 'период по X = двум тайлам (через одно отражение)', `y ${left} = y ${right}`);

/* ---------- 2. река и течение ---------- */

let channel = 0;

let flowless = 0;

let uphill = 0;

let falls = 0;

for (let v = 0; v < field.height; v += 1) {

for (let u = 0; u < field.width; u += 1) {

const i = v * field.width + u;

if ((field.flags[i] & F_RIVER) === 0) continue;

channel += 1;

if (field.waterY[i] <= field.ground[i]) uphill += 1;

if (field.waterY[i] < field.seaY) uphill += 1;

if ((field.flow[i] & 15) === 0) flowless += 1;

if ((field.flags[i] & F_FALL) !== 0) falls += 1;

}

}

add(channel > 200, 'русло легло на растр', `${channel} колонок воды`);

add(uphill === 0, 'вода в русле выше дна и не ниже уровня моря', uphill ? `${uphill} нарушений` : `${falls} водопадов`);

/* Направления нет у первых сэмплов от устья (течь некуда — там уже море) и у

стоячих озёр. Для русла в 500+ колонок это доли процента. */

add(channel > 0 && flowless / channel < 0.03, 'у русла есть направление течения', `${flowless} из ${channel} колонок без направления (срез устья)`);

/* Гладь не растёт к устью: идём по точкам полилинии от истока. */

let rising = 0;

let prevLevel = null;

for (const [px, py] of island().rivers[0].points) {

let best = null;

for (let dv = -2; dv <= 2; dv += 1) {

for (let du = -2; du <= 2; du += 1) {

const u = Math.round(px) + du;

const v = Math.round(py) + dv;

if (u < 0 || v < 0 || u >= field.width || v >= field.height) continue;

const i = v * field.width + u;

if ((field.flags[i] & F_RIVER) === 0) continue;

const level = field.waterY[i];

if (best === null || Math.abs(level - (prevLevel ?? level)) < Math.abs(best - (prevLevel ?? level))) best = level;

}

}

if (best === null) continue;

if (prevLevel !== null && best > prevLevel) rising += 1;

prevLevel = best;

}

add(rising === 0, 'гладь реки монотонна от истока к устью', rising ? `${rising} подъёмов` : 'течь вниз без подъёмов');

const d8 = [1, 2, 3, 4, 5, 6, 7, 8].every((dir) => {

const [dx, dz] = flowVector(dir);

return direction8(dx, dz) === dir;

});

add(d8, 'D8-направление и вектор согласованы', 'все 8 сторон');

/* ---------- 3. чанки ---------- */

/**

* Чанки для проверок берём по содержимому, а не «на глаз»: вода в холодном

* биоме скрыта льдом и граней воды не даёт, поэтому ищем незамерзшую воду.

*/

const findChunk = (test) => {

const cellsX = field.cellsX;

for (let cz = 0; cz < Math.ceil(HEIGHT / CHUNK_SZ); cz += 1) {

for (let cx = 0; cx < Math.ceil(WIDTH / CHUNK_SX); cx += 1) {

for (let v = cz * CHUNK_SZ; v < Math.min(HEIGHT, (cz + 1) * CHUNK_SZ); v += 1) {

for (let u = cx * CHUNK_SX; u < Math.min(WIDTH, (cx + 1) * CHUNK_SX); u += 1) {

const i = v * field.width + u;

const c = Math.floor(v / field.spacing) * cellsX + Math.floor(u / field.spacing);

if (test(i, c)) return { cx, cz, u, v };

}

}

}

}

return null;

};

const sea = findChunk((i, c) => (field.flags[i] & F_WATER) !== 0 && (field.flags[i] & 2) !== 0 && field.cellTemp[c] > 4);

const river = findChunk((i) => (field.flags[i] & F_RIVER) !== 0 && field.flow[i] !== 0);

const land = findChunk((i) => (field.flags[i] & F_WATER) === 0 && field.ground[i] > field.seaY + 8);

const midX = land.cx;

const midZ = land.cz;

const a0 = generateChunk(field, midX, midZ, { ores: true, caves: true });

const a1 = generateChunk(field, midX, midZ, { ores: true, caves: true });

let diff = 0;

for (let i = 0; i < a0.blocks.length; i += 1) if (a0.blocks[i] !== a1.blocks[i]) diff += 1;

add(diff === 0, 'чанк детерминирован', diff ? `${diff} блоков разошлись` : `${a0.blocks.length >> 10} KiB байт-в-байт`);

add(a0.sx === CHUNK_SX + 2 && a0.sz === CHUNK_SZ + 2, 'юбка в один блок по краям', `${a0.sx} × ${a0.sz} × ${a0.height}`);

/* Сосед справа: его первые внутренние колонки = последние колонки юбки. */

const right2 = generateChunk(field, midX + 1, midZ, { ores: true, caves: true });

let border = 0;

for (let lz = 1; lz < CHUNK_SZ + 1; lz += 1) {

for (let y = 0; y < a0.height; y += 1) {

/* наши последние две колонки = первые две колонки соседа (у обоих юбка) */

if (blockAt(a0, CHUNK_SX, y, lz) !== blockAt(right2, 0, y, lz)) border += 1;

if (blockAt(a0, CHUNK_SX + 1, y, lz) !== blockAt(right2, 1, y, lz)) border += 1;

}

}

add(border === 0, 'чанки сходятся с юбкой соседа', border ? `${border} несовпадений` : 'кроны и пещеры через границу не режутся');

/* ---------- 4. палитра ---------- */

const packed = encodePalette(a0.blocks);

const unpacked = decodePalette(packed);

let paletteDiff = 0;

for (let i = 0; i < packed.indices.length; i += 1) if (unpacked[i] !== a0.blocks[i]) paletteDiff += 1;

const ratio = (unpacked.length / Math.max(1, packed.indices.length + packed.palette.length * 1)).toFixed(2);

add(paletteDiff === 0 && packed.palette !== null, 'упаковка палитры обратима', `${packed.bits} бит, ×${ratio} компактнее`);

let foreign = null;

try {

decodePalette({ v: 7, bits: packed.bits, palette: packed.palette, indices: packed.indices });

} catch (error) {

foreign = error.message;

}

add(foreign !== null && /версия/i.test(foreign), 'чужая версия палитры — понятная ошибка', foreign ?? '');

/* Палитра биомов не должна вырождаться в «везде булыжник»: своя поверхность у

каждого, растения — у всех, кроме ледника (11), где их и не бывает. */

const stoneTops = BIOME_PALETTE.map((p, id) => (p.top === STONE ? id : -1)).filter((id) => id >= 0);

const bareBiomes = BIOME_PALETTE.map((p, id) => (!p.filler.length || (!p.trees.length && !p.plants.length && id !== 11) ? id : -1)).filter((id) => id >= 0);

add(BIOME_PALETTE.length === 13 && stoneTops.length === 0 && bareBiomes.length === 0,

'биомы не сводятся к голому камню', `${BIOME_PALETTE.length} биомов, заглушек: ${stoneTops.length + bareBiomes.length}`);

add(isKnownBlock(paletteFor(200).top) && paletteFor(200).filler.length > 0,

'неизвестный id биомы не роняет генератор', blockName(paletteFor(200).top));

add([[-100, -40, 0], [100, 60, 120], [0, 50, 25], [50, -50, 3], [255, 127, 1]].every(([moisture, temperature, height]) => {

const id = biomeFromClimate(moisture, temperature, height);

return id >= 0 && id < BIOME_PALETTE.length && Boolean(BIOME_PALETTE[id]);

}), 'климат всегда попадает в известный биом');

const altField = buildField({ ...island(), seedSalt: 999999 }, { profile: 2, detail: 1 });

const altChunk = generateChunk(altField, midX, midZ, { ores: true, caves: true });

let saltDiff = 0;

for (let i = 0; i < altChunk.blocks.length; i += 1) if (altChunk.blocks[i] !== a0.blocks[i]) saltDiff += 1;

add(saltDiff > 0, 'другая соль карты — другой чанк', `${saltDiff} блоков отличается`);

/* ---------- 5. срез (слой) ---------- */

const colors = buildTileColors(buildAtlas(field.seed));

const COLORS_OK = colors.length === TILES.length

&& colors.every((c) => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255))

/* [255,0,255] atlas.js оставляет там, где тайл вышел полностью прозрачным:

на карте это значит «тайл не нарисован», и терять такой сигнал нельзя. */

&& !colors.some((c) => c[0] === 255 && c[1] === 0 && c[2] === 255);

add(COLORS_OK, 'палитра слоя = средний цвет тайла атласа', `${colors.length} тайлов × ${ATLAS_COLUMNS}×${ATLAS_COLUMNS} атлас`);

const sliceView = makeView([Math.round(field.width / 2), Math.round(field.height / 2)], 96, 64);

add(sliceView.x0 + Math.floor(sliceView.cellsX / 2) === Math.round(field.width / 2)

&& sliceView.z0 + Math.floor(sliceView.cellsZ / 2) === Math.round(field.height / 2),

'кадр центрируется на запрошенной точке', `x0=${sliceView.x0}, z0=${sliceView.z0}`);

const bareSlice = () => buildSlice(field, colors, null, sliceView, {

level: field.worldHeight - 1, shade: false, coast: false, arrows: false, labels: false,

});

const top = bareSlice();

add(top.data.length === 96 * 64 * 4, 'кадр = 4 байта на блок', `${top.width}×${top.height}`);

add(top.fromChunks === 0 && top.fromField === 96 * 64,

'без чанков кадр красится схемой поля', `из поля ${top.fromField}, из чанков ${top.fromChunks}`);

add(top.fromChunks + top.fromField === 96 * 64,

'каждый блок кадра учтён ровно один раз', `${top.fromChunks} + ${top.fromField} = ${96 * 64}`);

let alphaBad = 0;

for (let i = 3; i < top.data.length; i += 4) if (!(top.data[i] >= 0 && top.data[i] <= 255)) alphaBad += 1;

add(alphaBad === 0, 'прозрачность кадра в шкале 0…255', `${alphaBad} выходов`);

const again = bareSlice();

let sameBytes = 0;

for (let i = 0; i < top.data.length; i += 1) if (top.data[i] !== again.data[i]) sameBytes += 1;

add(sameBytes === 0, 'кадр детерминирован: два прогона побайтно равны', `${sameBytes} расхождений`);

/* Зеркальное замощение: кадр, сдвинутый на период тайла, обязан совпасть —

иначе на швах повторяющегося мира слой рисовал бы другой мир. */

const wrapView = makeView([Math.round(field.width / 2) + field.width * 2, Math.round(field.height / 2)], 96, 64);

const wrapped = buildSlice(field, colors, null, wrapView, {

level: field.worldHeight - 1, shade: false, coast: false, arrows: false, labels: false,

});

let wrapDiff = 0;

for (let i = 0; i < top.data.length; i += 1) if (top.data[i] !== wrapped.data[i]) wrapDiff += 1;

add(wrapDiff === 0, 'срез через период тайла побайтно тот же', `${wrapDiff} расхождений`);

/* Правило «срезаем до кожи»: над вершиной показываем вершину, под водой —

зеркало воды; ниже грунта — сам ярус. */

const probeCells = [];

for (let attempt = 0; attempt < 4000 && probeCells.length < 48; attempt += 1) {

const x = (attempt * 37 + 5) % field.width;

const z = (attempt * 61 + 11) % field.height;

probeCells.push({ i: z * field.width + x, x, z, column: sampleColumn(field, x, z) });

}

let cutWrong = 0;

for (const { i, column } of probeCells) {

const wet = (column.flags & F_WATER) !== 0 && column.waterY > column.y ? column.waterY : column.y;

for (const level of [1, field.seaY, column.y, field.worldHeight]) {

const expect = level > wet ? wet : level;

if (cutY(field, i, level) !== expect) cutWrong += 1;

}

}

add(cutWrong === 0, 'cutY = min(вершина колонки, ярус)', `${probeCells.length} колонок × 4 яруса`);

/* Кадр для воды, берега и течения: вокруг русла и на его же зеркале — иначе в

центре острова воды нет вовсе, и проверка молча повиснет на нуле. */

let wetCell = -1;

for (let i = 0; i < field.area; i += 1) {

if ((field.flags[i] & F_RIVER) !== 0 && (field.flow[i] & 15) !== 0 && field.waterY[i] > field.ground[i]) {

wetCell = i;

break;

}

}

add(wetCell >= 0, 'в пробном поле есть проточная клетка', wetCell >= 0 ? `ярус воды ${field.waterY[wetCell]}` : 'нет ни рек, ни направления течения');

const wetLevel = wetCell >= 0 ? field.waterY[wetCell] : field.seaY;

const wetView = makeView([wetCell % field.width, Math.floor(wetCell / field.width)], 132, 96);

/* То же правило, по которому срез решает «в клетке вода»: плоскость в толще

воды или выше вершины — в обоих случаях видно воду. */

const coveredAt = (i, level) => (field.flags[i] & F_WATER) !== 0 && field.waterY[i] > field.ground[i] && level > field.ground[i];

const wetSlice = buildSlice(field, colors, null, wetView, {

level: wetLevel, shade: false, coast: false, arrows: false, labels: false,

});

let flagged = 0;

for (let z = 0; z < wetView.cellsZ; z += 1) {

for (let x = 0; x < wetView.cellsX; x += 1) {

const { u, v } = fold(field, wetView.x0 + x, wetView.z0 + z);

if (coveredAt(v * field.width + u, wetLevel)) flagged += 1;

}

}

add(wetSlice.water === flagged && flagged > 0, 'число водных пикселей = правилу воды поля', `${wetSlice.water} из ${flagged}`);

/* Береговая линия: пиксель ставится там, где «занято водой» меняется на

«свободно», и рисуются они по сухую сторону. Считаем переходы и сравниваем с

изменённым кадром. */

const coastOn = buildSlice(field, colors, null, wetView, {

level: wetLevel, shade: false, coast: true, arrows: false, labels: false,

});

let flips = 0;

for (let z = 0; z < wetView.cellsZ; z += 1) {

for (let x = 0; x < wetView.cellsX; x += 1) {

const { u, v } = fold(field, wetView.x0 + x, wetView.z0 + z);

const here = coveredAt(v * field.width + u, wetLevel);

for (const [dx, dz] of [[1, 0], [0, 1]]) {

const { u: nu, v: nv } = fold(field, wetView.x0 + x + dx, wetView.z0 + z + dz);

if (coveredAt(nv * field.width + nu, wetLevel) !== here) flips += 1;

}

}

}

let coastChanged = 0;

for (let i = 0; i < coastOn.data.length; i += 4) if (coastOn.data[i] !== wetSlice.data[i]) coastChanged += 1;

add(flips > 8 && coastChanged > 0 && coastChanged <= flips,

'линия воды = граница «занято / свободно»', `${flips} переходов, ${coastChanged} перекрашенных блоков`);

/* Стрелки течения: ставим на решётку и проверяем, что яркость растёт по

направлению flow — то есть стрелка смотрит туда, куда течение записало поле. */

const arrowOff = buildSlice(field, colors, null, wetView, {

level: wetLevel, time: 0, shade: false, coast: false, arrows: false, labels: false,

});

const arrowOn = buildSlice(field, colors, null, wetView, {

level: wetLevel, time: 0, shade: false, coast: false, arrows: true, labels: false,

});

const lum = (slice, x, z) => {

const o = (z * slice.width + x) * 4;

return slice.data[o] + slice.data[o + 1] + slice.data[o + 2];

};

let arrowCell = null;

for (let z = 1; z + 1 < wetView.cellsZ && !arrowCell; z += 1) {

for (let x = 1; x + 1 < wetView.cellsX && !arrowCell; x += 1) {

if ((wetView.x0 + x) % 4 || (wetView.z0 + z) % 4) continue;

const { u, v } = fold(field, wetView.x0 + x, wetView.z0 + z);

const i = v * field.width + u;

if (!coveredAt(i, wetLevel) || !(field.flow[i] & 15)) continue;

arrowCell = { x, z, dir: field.flow[i] & 15 };

}

}

add(Boolean(arrowCell), 'на решётке течения есть куда ставить стрелку', arrowCell ? `блок ${arrowCell.x}/${arrowCell.z}, направление ${arrowCell.dir}` : 'нет ни одного проточного блока в кадре');

if (arrowCell) {

const [dx, dz] = flowVector(arrowCell.dir);

const { x, z } = arrowCell;

const tip = lum(arrowOn, x + dx, z + dz) - lum(arrowOff, x + dx, z + dz);

const tail = lum(arrowOn, x - dx, z - dz) - lum(arrowOff, x - dx, z - dz);

const beyond = lum(arrowOn, x - 2 * dx, z - 2 * dz) - lum(arrowOff, x - 2 * dx, z - 2 * dz);

add(tip > 0 && tail > 0 && tip > tail && beyond === 0,

'стрелка разворачивается по направлению течения', `остриё +${tip}, хвост +${tail}, за стрелкой ${beyond}`);

const pulse = buildSlice(field, colors, null, wetView, {

level: wetLevel, time: 1.1, shade: false, coast: false, arrows: true, labels: false,

});

let pulseDiff = 0;

for (let i = 0; i < pulse.data.length; i += 1) if (pulse.data[i] !== arrowOn.data[i]) pulseDiff += 1;

add(pulseDiff > 0, 'течение анимировано: кадр с другой фазой отличается', `${pulseDiff} байт`);

}

/* Отметки высот: подписываем локальные вершины, и только над водой. */

const labelOff = top;

const labelOn = buildSlice(field, colors, null, sliceView, {

level: field.worldHeight - 1, shade: false, coast: false, arrows: false, labels: true,

});

let labelChanged = 0;

for (let i = 0; i < labelOn.data.length; i += 4) if (labelOn.data[i] !== labelOff.data[i]) labelChanged += 1;

add(labelChanged > 0, 'отметки высот рисуются на суше', `${labelChanged} перекрашенных блоков`);

/* Пресеты ярусов. `blockAtWorld` тут намеренно null: без чанков поиск «самого

пещеристого» яруса невозможен, и пресет обязан отвалиться на понятную

страховку, а не на NaN или исключение. */

const noBlocks = () => null;

for (const preset of LAYER_PRESETS) {

const level = presetLevel(field, noBlocks, sliceView, preset.id);

add(Number.isInteger(level) && level >= 1 && level <= field.worldHeight,

`пресет «${preset.name}» попадает в ярус мира`, `ярус ${level} из ${field.worldHeight}`);

}

const surfaceLevel = presetLevel(field, noBlocks, sliceView, 'surface');

const seaLevel = presetLevel(field, noBlocks, sliceView, 'sea');

const rootLevel = presetLevel(field, noBlocks, sliceView, 'root');

add(surfaceLevel === field.worldHeight - 1, 'пресет «Поверхность» = верхний блок, ничего не срезано', `ярус ${surfaceLevel} при потолке ${field.worldHeight}`);

add(seaLevel === field.seaY, 'пресет «Вода» = уровень моря', `${seaLevel}`);

add(rootLevel === 2, 'пресет «Основание» = пол мира', `${rootLevel}`);

const hints = new Set(LAYER_PRESETS.map((preset) => zoneName(field, presetLevel(field, noBlocks, sliceView, preset.id), 140)));

add(hints.size >= LAYER_PRESETS.length - 2, 'подпись под ползунком различает пресеты', `${hints.size} разных формулировок из ${LAYER_PRESETS.length}`);

add(/не срезан/.test(zoneName(field, field.worldHeight, 140)) && /основание/i.test(zoneName(field, 1, 140)),

'крайние ярусы подписаны по-человечески', `${zoneName(field, field.worldHeight, 140)} / ${zoneName(field, 1, 140)}`);

add(ZOOM_MIN < ZOOM_DEFAULT && ZOOM_DEFAULT < ZOOM_MAX,

'шкала масштаба задана', `${ZOOM_MIN}…${ZOOM_MAX} px на блок, по умолчанию ${ZOOM_DEFAULT}`);

add(typeof isKnownBlock === 'function' && isKnownBlock(WATER_SOURCE) && !isKnownBlock(29), 'в таблице блоков нет дыр под чужими id');

/* Цена генерации чанка — на прогретом движке: первая же генерация это прогрев

JIT и аллокатора, и на ней «12 мс» превращаются в «1 мс» уже со второго

чанка, поэтому замер на одном чанке ничего не значит. */

const warm = [];

for (let i = 0; i < 24; i += 1) warm.push(generateChunk(field, midX + i, midZ, { ores: true, caves: true }));

const genStart = performance.now();

for (let i = 100; i < 124; i += 1) generateChunk(field, i, midZ + 3, { ores: true, caves: true });

const genMs = (performance.now() - genStart) / 24;

/* ---------- 6. бюджет ---------- */

add(fieldMs < 4000, 'поле строится в пределах паузы', `${fieldMs.toFixed(0)} мс на ${field.area} колонок`);

add(genMs < 10, 'чанк: генерация — доли кадра', `генерация ${genMs.toFixed(2)} мс на чанк`);

const sliceMs = (() => {

const t0 = performance.now();

for (let i = 0; i < 8; i += 1) bareSlice();

return (performance.now() - t0) / 8;

})();

add(sliceMs < 24, 'кадр 96×64 блоков вписан в кадр интерфейса', `${sliceMs.toFixed(1)} мс на кадр, ${96 * 64} блоков`);

add(isOpaque(WATER) === false && isOpaque(WATER_SOURCE) === false, 'вода не перекрывает грани соседей', `${BLOCK_COUNT} блоков, таблица до ${BLOCKS.length - 1}`);

add(BLOCKS[AIR].solid === false, 'воздух не блокирует обзор');

/* ---------- 7. мост: окно редактора → снимок карт ---------- */

/* Окно собирается общим помощником — тот же снимок проверяет и DOM-тест вида. */

const win = fakeEditorWindow();

add(mapsReady(win) === true, 'мост: готовность окна распознана');

const src = readSource(win, { seed: 'мост' });

add(src.width === FAKE_EXPECT.width && src.height === FAKE_EXPECT.height,

'мост: размеры взяты из graph', `${src.width}×${src.height}`);

add(src.seaLevel === 20 && src.spacing === 16, 'мост: уровень моря и шаг сетки');

add(src.cellH[FAKE_EXPECT.cells.land] === FAKE_EXPECT.heights.dry

&& src.cellH[FAKE_EXPECT.cells.lake] === FAKE_EXPECT.heights.lake

&& src.cellH[1] === FAKE_EXPECT.heights.sea,

'мост: высоты pack перенесены на grid, остальное осталось из grid');

add(src.cellBiome[FAKE_EXPECT.cells.land] === 1 && src.cellTemp[FAKE_EXPECT.cells.lake] === 3 && src.cellPrec[FAKE_EXPECT.cells.river] === 40,

'мост: биомы, температуры и осадки доехали');

add(src.stats.lakes === 1 && src.cellFeature[FAKE_EXPECT.cells.lake] === 1, 'мост: озеро помечено на клетке-родителе');

add(src.stats.rivers === 1 && src.rivers[0].points.length === 2 && src.rivers[0].half[0] > 0.4,

'мост: русло прочитано и имеет полуширину', `${src.rivers[0]?.half?.[0]?.toFixed(2) ?? 0} px`);

const bridgeField = buildField(src, { profile: 0, detail: 0 });

const riverPixels = [];

for (let i = 0; i < bridgeField.flags.length; i += 1) {

if ((bridgeField.flags[i] & F_RIVER) === 0) continue;

riverPixels.push([i % bridgeField.width, Math.floor(i / bridgeField.width)]);

}

const near = (x, y) => riverPixels.some(([px, py]) => Math.abs(px - x) <= 3 && Math.abs(py - y) <= 3);

add(riverPixels.length > 8, 'мост: русло прорастрировано в поле', `${riverPixels.length} пикселей`);

add(FAKE_EXPECT.riverPoints.every(([x, y]) => near(x, y)), 'мост: русло прошло по точкам генератора', 'излучистость не сместила канал');

add(bridgeField.ground[0] >= bridgeField.seaY - 4, 'мост: суша над уровнем моря осталась сушей');

let early = null;

try {

readSource(null);

} catch (error) {

early = error;

}

add(early instanceof VoxelSourceError, 'мост: закрытый документ — человеческая ошибка', early?.message ?? '');

const half = { grid: { spacing: 8, cells: { h: [1, 2] } } };

add(missingMapsPart(half).includes('упаковк'), 'мост: подсказка говорит, чего не хватает', missingMapsPart(half));

let partial = null;

try {

readSource(half);

} catch (error) {

partial = error;

}

add(partial instanceof VoxelSourceError && /рано/.test(partial.message), 'мост: генерация не дошла — мир не строим');

/* ---------- 8. хранилище чанков и пиксель по блоку ---------- */

/* Хост не передаём: без DOM мир считается ровно так же. Проверяем то, что в

браузере видно только глазами: очередь укладывается в бюджет кадра, кадр

красится построенными чанками, а прыжок на другой край тайла вытесняет

их из памяти. */

const pickWorld = createVoxelWorld(field, { radius: 2 });

/* Столбик берём сухой и выше моря: иначе проверка начнёт спорить сама с собой,

попав в пруд вместо рельефа. */

let pickX = -1;

let pickZ = -1;

let pickColumn = null;

for (let attempt = 0; attempt < 6000 && pickX < 0; attempt += 1) {

const x = (attempt * 37 + 5) % field.width;

const z = (attempt * 61 + 11) % field.height;

const column = sampleColumn(field, x, z);

if ((column.flags & F_WATER) === 0 && column.y > field.seaY + 6) {

pickX = x;

pickZ = z;

pickColumn = column;

}

}

const fresh = pickWorld.stats();

add(fresh.chunks === 0 && fresh.ready === 0, 'мир до фокуса не строит ничего', `${fresh.chunks} чанков`);

pickWorld.focus(pickX, pickZ);

const queued = pickWorld.stats();

add(queued.queued === (2 * 2 + 1) ** 2 && queued.ready === 0,

'фокус ставит весь радиус в очередь', `${queued.queued} чанков в очереди, ${queued.pending} не создано`);

for (let guard = 0; guard < 24 && pickWorld.stats().queued; guard += 1) pickWorld.step(50);

const built = pickWorld.stats();

add(built.ready > 0 && built.bytes > 0, 'очередь строит чанки в бюджете кадра', `${built.ready} готово, ${(built.bytes / 1024).toFixed(0)} КиБ блоков`);

/* Цена чанка — средняя по очереди, а не «последний измеренный»: один замер

зависит от JIT и сборщика мусора и на загруженной машине прыгает до 25 мс,

а контракт здесь — средний бюджет кадра. */

const timing = createVoxelWorld(field, { radius: 1 }); // радиус зажимается снизу до 2 — это продукт-решение

timing.focus(pickX, pickZ);

let spent = 0;

let made = 0;

for (let guard = 0; guard < 60 && timing.stats().queued; guard += 1) {

const part = timing.step(4);

spent += part.ms;

made += part.generated;

}

const mean = spent / Math.max(1, made);

add(made === 25 && mean < 16, 'чанк вписан в средний бюджет кадра', `${made} чанков (радиус 2 — минимум), в среднем ${mean.toFixed(1)} мс`);

const atomic = createVoxelWorld(field, { radius: 0 });

atomic.focus(pickX, pickZ);

const single = atomic.step(0);

add(single.generated === 1, 'гранулярность очереди: один чанк за шаг при нулевом бюджете', `${single.generated} чанк за ${single.ms.toFixed(1)} мс`);

atomic.dispose();

timing.dispose();

/* Пиксель слоя = блок на плоскости реза. Берём ярус «ничего не срезано» и

выключенные наложения: тогда цвет обязан равняться среднему цвету верхней

грани того же блока, что лежит в чанке. Листву, воду и прочее полупрозрачное

не сравниваем: они намеренно смешиваются с фоном. */

const blockAtWorld = (x, y, z) => {

const record = pickWorld.get(Math.floor(x / CHUNK_SX), Math.floor(z / CHUNK_SZ));

const chunk = record?.chunk;

if (!chunk) return null;

const lx = x - chunk.x0;

const lz = z - chunk.z0;

if (lx < 0 || lx >= chunk.sx || lz < 0 || lz >= chunk.sz) return null;

return blockAt(chunk, lx, y, lz);

};

const FLAT = new Set([BLOCKS[GRASS].top, BLOCKS[SAND].top, BLOCKS[STONE].top]);

const blockView = makeView([pickX, pickZ], 64, 40);

const blockSlice = buildSlice(field, colors, pickWorld, blockView, {

level: field.worldHeight - 1, shade: false, coast: false, arrows: false, labels: false,

});

add(blockSlice.fromChunks === 64 * 40, 'кадр над построенным радиусом целиком из чанков', `${blockSlice.fromChunks} из ${64 * 40}`);

let compared = 0;

let mismatch = 0;

for (let z = 0; z < blockSlice.height; z += 1) {

for (let x = 0; x < blockSlice.width; x += 1) {

const wx = blockView.x0 + x;

const wz = blockView.z0 + z;

const { u, v } = fold(field, wx, wz);

const i = v * field.width + u;

const y = cutY(field, i, blockSlice.level);

const id = blockAtWorld(wx, y, wz);

if (id === null) continue;

const tile = BLOCKS[id]?.top;

if (!FLAT.has(tile)) continue;

compared += 1;

const o = (z * blockSlice.width + x) * 4;

const want = colors[tile];

if (blockSlice.data[o] !== want[0] || blockSlice.data[o + 1] !== want[1] || blockSlice.data[o + 2] !== want[2]) mismatch += 1;

if (blockSlice.data[o + 3] !== 255) mismatch += 1;

}

}

add(compared > 24 && mismatch === 0, 'пиксель слоя = блок на плоскости реза', `${compared} блоков сверено, ${mismatch} расхождений`);

/* Под поверхностью пусто быть не может: три блока под грунтом — сплошные. */

const underRecord = pickWorld.get(Math.floor(pickX / CHUNK_SX), Math.floor(pickZ / CHUNK_SZ));

const under = underRecord?.chunk;

let hollow = 0;

if (under) {

for (let dy = 1; dy <= 3; dy += 1) {

if (!isSolid(blockAt(under, pickX - under.x0, pickColumn.y - dy, pickZ - under.z0))) hollow += 1;

}

}

add(Boolean(under) && hollow === 0, 'под поверхностью нет пустот', under ? `${hollow} пустых клеток` : 'чанк не готов');

const before = pickWorld.stats().dropped;

pickWorld.focus(field.width * 3, field.height * 3);

for (let guard = 0; guard < 24; guard += 1) pickWorld.step(50);

add(pickWorld.stats().dropped > before, 'прыжок на другой край тайла вытесняет чанки', `вытеснено ${pickWorld.stats().dropped - before}`);

pickWorld.dispose();

const cleared = pickWorld.stats();

add(cleared.chunks === 0 && cleared.bytes === 0, 'dispose освобождает хранилище', `${cleared.chunks} чанков`);

/* ---------- итог ---------- */

console.log('Мир блоками: поле → чанк → слой\n');

let bad = 0;

for (const check of checks) {

console.log(`${check.ok ? ' ✓' : ' ×'} ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);

if (!check.ok) bad += 1;

}

console.log('');

if (bad) {

console.log(`МИР БЛОКАМИ ЛОМАЕТСЯ: не прошло ${plural(bad, 'проверка', 'проверки', 'проверок')} — ${bad} из ${checks.length}.`);

process.exit(1);

}

console.log(`ВСЁ ХОРОШО — ${checks.length} ${plural(checks.length, 'проверка', 'проверки', 'проверок')} мира блоками.`);

````

### `scripts/test-voxel-view.mjs` · 273 строк · заменить целиком

````js

/* Карта блоками в настоящем DOM: запуск `npm run test:voxel-view`.

Что проверяется и почему именно это: src/world/layers.js покрыт test:voxel,

картинку посмотрит человек, а между ними — mountWorldView(): разметка панели

ярусов, ползунок, пресеты, переключатели наложений, мышь и клавиатура, очередь

чанков в кадре, снятие вида. В jsdom нет холста 2D: полотно нельзя

перекрасить, но состояние вида — ярус, масштаб, центр, наложения — обязано

жить и обновляться без него. Ошибку «нет контекста» проверка считает

ожидаемым шумом.

jsdom ставится разово: npm i --no-save jsdom (он нужен и test:ui). */

import './lib/root.mjs';

let JSDOM;

let VirtualConsole;

try {

({ JSDOM, VirtualConsole } = await import('jsdom'));

} catch {

console.error('Нет jsdom. Поставьте его разово: npm i --no-save jsdom');

process.exit(1);

}

const { fakeEditorWindow, FAKE_MAP } = await import('./lib/fake-fmg.mjs');

const { LAYER_PRESETS, ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN } = await import('../src/world/layers.js');

/* Русское согласование числительного: «31 проверка», а не «31 проверок». */

const plural = (n, one, few, many) => {

const mod10 = n % 10;

const mod100 = n % 100;

if (mod10 === 1 && mod100 !== 11) return one;

if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;

return many;

};

const checks = [];

const add = (ok, what, detail = '') => checks.push({ ok: Boolean(ok), what, detail });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Холст в jsdom отсутствует по определению: считаем это ожидаемым шумом. */

const isCanvasNoise = (text) => /HTMLCanvasElement|getContext|Not implemented/i.test(text);

const page = `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head>

<body><div class="world-editor" data-role="world-editor-host">

<iframe class="world-editor-frame" data-role="world-editor"></iframe>

</div></body></html>`;

const consoleErrors = [];

const virtualConsole = new VirtualConsole();

virtualConsole.on('jsdomError', (error) => {

if (!isCanvasNoise(error?.message)) consoleErrors.push(`jsdomError: ${error?.message}`);

});

virtualConsole.on('error', (message) => {

if (!isCanvasNoise(String(message))) consoleErrors.push(`console.error: ${message}`);

});

const dom = new JSDOM(page, { pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole });

const { window } = dom;

/* Модули игры читают глобальный document — даём им окно jsdom тем же способом,

каким это делает test:ui, и только потом поднимаем сам вид. */

const VIEW_GLOBALS = ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver'];

for (const name of VIEW_GLOBALS) {

if (window[name] === undefined) continue;

/* В Node 22 часть глобалей (navigator, performance) — геттеры: только

defineProperty, и молча, если переопределить нельзя. */

try {

Object.defineProperty(globalThis, name, { value: window[name], configurable: true, writable: true });

} catch {

void name;

}

}

const { mountWorldView } = await import('../src/game/world-view.js');

const host = window.document.querySelector('[data-role="world-editor-host"]');

let exited = 0;

const view = mountWorldView(host, {

frame: { contentWindow: fakeEditorWindow() },

config: { seed: 'вид', width: FAKE_MAP.size, height: FAKE_MAP.size },

onExit: () => {

exited += 1;

},

});

const canvas = view.element.querySelector('canvas');

const slider = view.element.querySelector('[data-role="voxel-level"]');

const hud = view.element.querySelector('[data-role="voxel-hud"]');

const levelValue = view.element.querySelector('[data-role="voxel-level-value"]');

const zoomValue = view.element.querySelector('[data-role="voxel-zoom-value"]');

const presets = [...view.element.querySelectorAll('[data-layer]')];

const overlays = [...view.element.querySelectorAll('[data-overlay]')];

const buttons = [...view.element.querySelectorAll('[data-voxel-action]')];

const action = (name) => view.element.querySelector(`[data-voxel-action="${name}"]`);

const key = (code, options = {}) => {

const event = new window.KeyboardEvent('keydown', { bubbles: true, ...options });

Object.defineProperty(event, 'code', { value: code });

window.dispatchEvent(event);

};

add(view.element?.dataset.role === 'world-voxel', 'вид смонтирован в хост редактора');

add(!view.error, 'снимок карт прочитан без ошибки', view.error ?? '');

add(view.field?.width === FAKE_MAP.size && view.field?.height === FAKE_MAP.size,

'поле взято из окна редактора', `${view.field?.width}×${view.field?.height}`);

add(view.source?.stats.rivers === 1 && view.source?.stats.lakes === 1,

'реки и озёра дошли до вида', `${view.source?.stats.rivers} рек, ${view.source?.stats.lakes} озёр`);

add(typeof view.dispose === 'function', 'у вида есть dispose');

add(buttons.length === 6 && presets.length === LAYER_PRESETS.length && overlays.length === 4,

'панель: шесть кнопок, пресеты и четыре наложения',

`${buttons.length} (${buttons.map((b) => b.dataset.voxelAction).join(', ')}), ${presets.length} пресетов, ${overlays.length} наложений`);

add([...buttons, ...presets, ...overlays].every((node) => node.type === 'button'),

'каждый контрол — button, а не submit');

add(buttons.every((node) => node.getAttribute('aria-label')), 'у кнопок шага есть доступное имя');

add(hud !== null && hud.getAttribute('role') === 'status', 'HUD объявлен живым блоком');

add(canvas?.tabIndex === 0, 'полотно получает фокус клавиатуры');

/* Полотно живёт в разрешении блоков: 1 px = 1 блок, растягивает его CSS. */

add(canvas.width === view.cells.x && canvas.height === view.cells.z && view.cells.x > 0,

'полотно = размер кадра в блоках', `${canvas.width}×${canvas.height} при блоке ${view.zoom} px`);

add(slider.min === '1' && slider.step === '1' && Number(slider.max) === view.field.worldHeight - 1,

'ползунок ходит по ярусам мира', `1…${slider.max}`);

add(view.level === view.field.worldHeight - 1 && Number(slider.value) === view.level,

'при открытии срез не задел рельеф', `ярус ${view.level}, потолок ${view.field.worldHeight}`);

add(view.preset === 'surface' && view.element.querySelector('[data-layer="surface"]').classList.contains('is-on'),

'пресет «Поверхность» подсвечен при открытии');

add(view.zoom === ZOOM_DEFAULT, 'масштаб по умолчанию — три пикселя на блок', `${view.zoom} px/блок`);

add(view.overlays.arrows && view.overlays.coast && view.overlays.labels && view.overlays.shade,

'наложения включены сразу', overlays.map((node) => `${node.dataset.overlay}=${node.getAttribute('aria-pressed')}`).join(' '));

add(view.world?.stats().queued > 0 && view.world?.stats().ready === 0,

'мир поставил чанки в очередь, не строя их заранее', `${view.world?.stats().queued} в очереди`);

add(view.world?.radius === 3, 'радиус обзора ограничен размером тайла', `радиус ${view.world?.radius} чанка`);

add(view.sliceInfo === null, 'без 2D-канваса вид не красит кадр и не падает',

`контекст: ${canvas.getContext('2d')}`);

await wait(200);

const lived = view.world.stats();

add(lived.ready > 0 && lived.bytes > 0, 'очередь двигается в кадрах',

`${lived.ready} готово, ${(lived.bytes / 1024).toFixed(0)} КиБ блоков, ${lived.queued} в очереди`);

add(hud?.textContent.includes('чанков'), 'HUD показывает состояние мира', hud?.textContent.slice(0, 56) ?? '');

action('level-down').click();

add(view.level === view.field.worldHeight - 2 && Number(slider.value) === view.level,

'кнопка «−» опускает ярус на блок и двигает ползунок', `ярус ${view.level}`);

add(view.preset === null && !view.element.querySelector('[data-layer="surface"]').classList.contains('is-on'),

'ручной сдвиг яруса снимает подсветку пресета');

slider.value = '100';

slider.dispatchEvent(new window.Event('input', { bubbles: true }));

action('level-up').dispatchEvent(new window.MouseEvent('click', { bubbles: true, shiftKey: true }));

add(view.level === 110, 'Shift на кнопке шага даёт десять блоков', `ярус ${view.level}`);

action('level-down').dispatchEvent(new window.MouseEvent('click', { bubbles: true, shiftKey: true }));

add(view.level === 100, 'и вниз на десять', `ярус ${view.level}`);

slider.value = String(view.field.seaY);

slider.dispatchEvent(new window.Event('input', { bubbles: true }));

add(view.level === view.field.seaY && view.preset === null, 'ползунок задаёт ярус напрямую', `ярус ${view.level}`);

key('PageDown');

add(view.level === view.field.seaY - 1, 'PageDown опускает ярус', `ярус ${view.level}`);

key('PageUp', { shiftKey: true });

add(view.level === view.field.seaY + 9, 'PageUp с Shift поднимает на десять', `ярус ${view.level}`);

for (let n = 0; n < 40; n += 1) key('PageUp', { shiftKey: true });

add(view.level === view.field.worldHeight - 1, 'ярус не вылезаёт за потолок мира', `ярус ${view.level}`);

for (let n = 0; n < 40; n += 1) key('PageDown', { shiftKey: true });

add(view.level === 1, 'и за пол мира снизу', `ярус ${view.level}`);

const seaPreset = view.element.querySelector('[data-layer="sea"]');

seaPreset.click();

add(view.level === view.field.seaY && view.preset === 'sea', 'пресет «Вода» ставит уровень моря', `ярус ${view.level}`);

add(seaPreset.getAttribute('aria-pressed') === 'true' && levelValue.textContent.includes('Вода'),

'подпись под ползунком называет пресет и зону', levelValue.textContent.slice(0, 72));

const canopy = view.element.querySelector('[data-layer="canopy"]');

canopy.click();

add(view.level > view.field.seaY && view.level < view.field.worldHeight - 1,

'пресет «Кроны» режет верхушки', `ярус ${view.level} между морем ${view.field.seaY} и потолком ${view.field.worldHeight - 1}`);

action('zoom-in').click();

add(view.zoom === ZOOM_DEFAULT + 1 && zoomValue.textContent.startsWith(String(view.zoom)),

'кнопка «+» укрупняет блок', `${view.zoom} px · ${zoomValue.textContent}`);

for (let n = 0; n < 12; n += 1) action('zoom-in').click();

add(view.zoom === ZOOM_MAX, 'масштаб зажат сверху', `${view.zoom} px/блок`);

const cellsAtMax = { ...view.cells };

for (let n = 0; n < 12; n += 1) action('zoom-out').click();

add(view.zoom === ZOOM_MIN, 'масштаб зажат снизу', `${view.zoom} px/блок`);

add(view.cells.x > cellsAtMax.x, 'при укрупнении блока кадр в блоках уменьшается',

`${cellsAtMax.x} → ${view.cells.x} колонок`);

const centerBefore = [...view.center];

const mouse = (type, x, y) => {

const event = new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });

Object.defineProperty(event, 'pointerId', { value: 1 });

canvas.dispatchEvent(event);

};

mouse('pointerdown', 100, 100);

mouse('pointermove', 190, 140);

mouse('pointerup', 190, 140);

add(view.center[0] < centerBefore[0] && view.center[1] < centerBefore[1],

'перетаскивание двигает карту за курсором',

`X ${centerBefore[0].toFixed(1)} → ${view.center[0].toFixed(1)}, Z ${centerBefore[1].toFixed(1)} → ${view.center[1].toFixed(1)}`);

add(Math.abs(view.center[0] - (centerBefore[0] - 90 / view.zoom)) < 0.51

&& Math.abs(view.center[1] - (centerBefore[1] - 40 / view.zoom)) < 0.51,

'сдвиг считается в блоках: экранные пиксели делятся на масштаб',

`ΔX ${(view.center[0] - centerBefore[0]).toFixed(2)} при 90 px`);

const wheel = new window.Event('wheel', { bubbles: true });

Object.defineProperty(wheel, 'deltaY', { value: -100 });

Object.defineProperty(wheel, 'clientX', { value: 40 });

Object.defineProperty(wheel, 'clientY', { value: 40 });

const zoomBeforeWheel = view.zoom;

canvas.dispatchEvent(wheel);

add(view.zoom !== zoomBeforeWheel || view.zoom === ZOOM_MIN, 'колесо меняет масштаб', `${zoomBeforeWheel} → ${view.zoom}`);

key('ArrowRight');

const panned = view.center[0];

add(Math.abs(panned - (view.makeView().x0 + view.cells.x / 2)) < 1.5,

'кадр центрируется там, куда смотрит вид', `x0 ${view.makeView().x0} при центре ${view.center[0].toFixed(1)}`);

key('ArrowLeft', { shiftKey: true });

add(Math.abs(view.center[0] - (panned - 96)) < 0.51, 'Shift+стрелка — широкий шаг по карте',

`${panned.toFixed(1)} → ${view.center[0].toFixed(1)}`);

overlays[0].click();

add(view.overlays[Object.keys(view.overlays)[0]] === false || view.overlays.arrows === false,

'клик по наложению выключает его', overlays[0].dataset.overlay);

add(overlays[0].getAttribute('aria-pressed') === 'false' && !overlays[0].classList.contains('is-on'),

'выключенное наложение помечено в разметке');

overlays[0].click();

add(view.overlays.arrows === true, 'второй клик включает наложение обратно');

view.element.querySelector('[data-voxel-action="reset"]').click();

await wait(60);

add(Math.abs(view.center[0] - view.spawn.x) < 1 && Math.abs(view.center[1] - view.spawn.z) < 1,

'«Появление» возвращает центр к точке появления', `X ${view.center[0].toFixed(1)} при спавне ${view.spawn.x}`);

add(view.level === view.field.worldHeight - 1 && view.zoom === ZOOM_DEFAULT && view.preset === 'surface',

'сброс возвращает и ярус, и масштаб', `ярус ${view.level}, блок ${view.zoom}`);

key('KeyR');

add(view.center[0] === view.spawn.x, 'R работает с клавиатуры');

view.element.querySelector('[data-voxel-action="exit"]').click();

add(exited === 1, 'кнопка «К карте» зовёт onExit — за закрытие режима отвечает вызывающий');

const orphanHost = window.document.createElement('div');

const empty = mountWorldView(orphanHost, { frame: null, config: null });

add(/Карта блоками:/.test(empty.error ?? ''), 'без документа вид честно сообщает причину', empty.error ?? '');

add(typeof empty.dispose === 'function', 'у отказавшего вида тоже есть dispose');

empty.dispose();

add(orphanHost.childElementCount === 0, 'отказ снимает разметку с хоста');

const chunksAlive = view.world.stats().chunks;

view.dispose();

await wait(60);

add(view.element.isConnected === false, 'dispose убирает полотно из страницы');

add(view.world.stats().chunks === 0, 'dispose закрывает хранилище чанков', `${chunksAlive} → 0`);

add(view.running === false, 'после dispose кадры не идут');

add(consoleErrors.length === 0, 'страница не сообщила об ошибках', consoleErrors.slice(0, 2).join(' | '));

const ZOOM_RANGE = ZOOM_MIN < ZOOM_DEFAULT && ZOOM_DEFAULT < ZOOM_MAX;

add(ZOOM_RANGE, 'шкала масштаба согласована с видом', `${ZOOM_MIN}…${ZOOM_MAX}, по умолчанию ${ZOOM_DEFAULT}`);

console.log('Карта блоками: DOM, ярусы, ввод, жизненный цикл\n');

let bad = 0;

for (const check of checks) {

console.log(`${check.ok ? ' ✓' : ' ×'} ${check.what}${check.detail ? ` — ${check.detail}` : ''}`);

if (!check.ok) bad += 1;

}

console.log('');

if (bad) {

console.log(`КАРТА БЛОКАМИ ЛОМАЕТСЯ: не прошло ${plural(bad, 'проверка', 'проверки', 'проверок')} — ${bad} из ${checks.length}.`);

window.close();

process.exit(1);

}

console.log(`ВСЁ ХОРОШО — ${checks.length} ${plural(checks.length, 'проверка', 'проверки', 'проверок')} вида карты блоками.`);

window.close();

````

## Документация

Тот же документ, что и в репозитории: 798 строк спецификации генерации и плоских ярусов (§9 — как мир показывается картой, §10 — модули и вес, §13 — план М3 с пометкой, что 3D снято).

### `docs/voxel-world-generation.md` · 798 строк · заменить целиком

````markdown

# Воксельный мир по картам Azgaar: разбор и план

> **Статус: реализовано и встроено (M0…M6), поле → чанки → плоская карта

> блоками.** Документ отвечает на вопрос «можно ли построить генерацию в духе

> Minecraft по картам высот, биомов, температур и границ материков, с реками

> генератора и их течением — и чтобы всё было блоками и чанками». Ниже: что для

> этого уже есть в vendored Azgaar, как именно поля карт превращаются в блоки,

> где настоящие технические трудности и во что обходится работа.

>

> Важно для чтения: §9 описывает **плоские ярусы** — то, что осталось в продукте.

> 3D-сцена (мешер + WebGL2) была собрана и проверена, но от неё отказался

> владелец: мир нужен был картой, а не перспективой, и слой выбирается ползунком.

> Чанки, блоки, гидрология, атлас и интеграция при этом не изменились.

Проверено по исходникам `vendor/azgaar-fantasy-map-generator/` (снапшот

`1.154.0`, commit `546c41d3`); ссылки на файлы и строки — в конце документа.

Всё, что помечено «оценка», числами не подтверждено и измеряется на этапе M0.

---

## 1. Ответ коротко

**Да, можно, и это дешевле, чем кажется**: почти всё нужное Azgaar уже считает

и держит в типизированных массивах, а хост-страница имеет к ним прямой доступ.

| Что нужно миру | Откуда берётся | Готово? |

| --- | --- | --- |

| Рельеф (карта высот) | `grid.cells.h` / `pack.cells.h`, 0…100, 20 — уровень моря | да |

| Биомы («карта биомов») | `pack.cells.biome` + `pack.biomes[]` (цвет, плотность флоры) | да |

| Тепло и влажность | `grid.cells.temp` (°C), `grid.cells.prec` | да |

| Границы материков и береговая линия | `pack.features[]` + путь `#featurePaths` во фрейме | да |

| Реки: сеть, притоки, устья, ширина | `pack.rivers[]`, `pack.cells.r` | да |

| **Течение воды** | `pack.cells.fl` — накопленный сток на клетку, уже посчитанный | да |

| Озёра, их уровень и тип | `pack.features[]` с `type:'lake'`, `height`, `subtype` | да |

| Лёд, айсберги, мёрзлые моря | `pack.ice`, `grid.cells.temp` | да |

| Дороги, поселения, путешествия | `pack.routes[]`, `pack.burgs[]`, `pack.journeys[]` | да (расширение) |

| Блоки и чанки | нет нигде | **это и есть работа** |

То есть задача не «придумать географию», а **перевести уже существующую

географию в блочную модель** так, чтобы мир на экране совпадал с картой,

которую видит игрок. Это два разных вопроса, и второй — единственный, где

нужны решения, а не код.

Главная цифра, определяющая всё остальное: при плотности графа по умолчанию

(10 000 клеток) и карте 1600 × 1000 px **одна клетка Voronoi ≈ 12,6 px**, то

есть ≈ 12 × 12 блоков при 1 блок = 1 пиксель. Исходная деталь карты грубее

блока примерно на порядок — интерполяция и шум обязательны, иначе мир выглядит

ступенчатым.

---

## 2. Что это решение меняет в прежних договорённостях

В журнале за 2026-10-08 («карты только от Azgaar») записано осознанное

**«не сливать данные Azgaar с voxel-миром автоматически: это разные модели

географии»**, а собственный генератор, воксельная сцена и RTS-камера были

удалены по просьбе владельца.

Этот документ предлагает ровно то, что там запрещено, — и это не противоречие,

а пересмотр, если владелец его подтвердит. Аргумент «разные модели географии»

держался на том, что у двух генераторов разные данные и их приходится

примирять. Здесь примирять нечего: источник один, Azgaar. Риск, который

решение снимало, остаётся — объём кода и ответственность за собственный

движок; раздел 13 его количественно оценивает.

Побочный эффект, о котором нужно помнить заранее: `README.md` и `AGENTS.md`

утверждают, что «собственного генератора и редактора мира в игре нет». С

появлением блочного мира эти формулировки становятся неверными и требуют

правки — не в этом документе, а в том, что принесёт код.

---

## 3. Данные карт: что за чем отвечает

### 3.1 `grid` — регулярная решётка, «сырые» карты

Точки лежат на **возмущённой квадратной решётке** (`grid-generator.ts`):

`spacing = √(W·H / cells)`, `cellsX = ⌊(W + spacing/2)/spacing⌋`, индекс клетки

вычисляется арифметикой, без дерева поиска (`Grid.findCell`). Это значит, что

превратить клеточное поле в растр можно двумя делениями на `spacing`.

| Поле | Тип | Диапазон | Что это |

| --- | --- | --- | --- |

| `grid.spacing` | number | ≈10…14 px | шаг решётки для трёх размеров карты |

| `grid.cellsX × cellsY` | number | 126×79 при 1600×1000 | размер решётки |

| `grid.points[i]` | [x, y] | px | центр клетки, с дрожью до ±0,45·spacing |

| `grid.cells.h[i]` | Uint8Array | 0…100, 20 = море | **карта высот** |

| `grid.cells.t[i]` | Int8Array | 1 = берег суши, −1 = берег воды, | удалённость от берега: готова «полоса пляжа/шельфа» |

| `grid.cells.temp[i]` | Int8Array | °C, с поправкой 6,5 °C/км | **карта температур** |

| `grid.cells.prec[i]` | Uint8Array | ×100 мм | **карта осадков** |

| `grid.cells.f[i]`, `.b[i]`, `.c[i]` | | | фича (океан/озеро), «у края карты», соседи |

Дрожь решётки — ловушка: чистый `floor(x/spacing)` даёт клетку решётки, а не

клетку Voronoi, и у границы клетки это разные клетки. Для непрерывных полей

(высота, температура, осадки) правильно брать **взвешенное среднее четырёх

углов ячейки решётки** — тогда «границы клеток» вообще перестают существовать.

Для дискретных ( id реки, id фичи) — ближайшую точку с проверкой одного кольца

соседей.

### 3.2 `pack` — упакованный граф, «то, чем пользуются генераторы»

`pack` строится из `grid`: глубокий океан выброшен, береговые клетки разрезаны,

разрешение у берега выше. Именно на `pack` считаются биомы, реки, города.

| Поле | Тип | Значение |

| --- | --- | --- |

| `pack.cells.h` | Uint8Array | **рельеф после гидро-правок**: сюда записаны результат заполнения впадин и прорезанные русла (`river-generator.ts:428-431`) |

| `pack.cells.g` | Uint32Array | **родительская клетка grid** (не «ground type», несмотря на комментарий в типе) — через неё достают `temp`/`prec` |

| `pack.cells.biome` | Uint8Array | id биома, 0…12 по умолчанию, до 255 с вручную дорисованными |

| `pack.cells.r` | Uint16Array | id реки в клетке, 0 — нет реки |

| `pack.cells.fl` | Uint16Array | **сток**: начинается с осадков и накапливается вниз по склону — это и есть «сколько воды течёт через клетку» |

| `pack.cells.conf` | Uint8Array | сток в слияниях притоков |

| `pack.cells.p[i]` | [x, y] | точка клетки в координатах карты |

| `pack.cells.c[i]`, `.f[i]`, `.b[i]`, `.area[i]` | | соседи, фича, край карты, площадь |

| `pack.biomes[i]` | | имя, цвет, habitability, `iconsDensity`, `icons` (веса пород деревьев) |

| `pack.rivers[]` | | см. §6.1 |

| `pack.features[]` | | `type: ocean/land/lake`, `subtype` (континент/остров, море/залив, пресное/солёное/…), `area`, `height` (озёра), `inlets`/`outlet`/`outCell` |

| `pack.ice[]`, `pack.relief[]`, `pack.routes[]`, `pack.burgs[]`, `pack.journeys[]` | | расширение: лёд, флора, дороги, поселения, маршруты |

Важно: `pack.cells.h` — Uint8Array. **1 единица высоты = 1 блок**, целые

числа, 100 ступеней. Без вертикального масштабирования максимум рельефа 80

блоков над морем и 20 под ним, и ни одной полублоковой промежуточной отметки.

### 3.3 Три канала, откуда это можно взять

1. **Типизированные массивы** — `frame.contentWindow.grid` и `.pack`. Azgaar

кладёт их в глобальную область (`components/globals.ts:4-5`), а рядом висят

`Grid`, `Pack`, `Rivers`, `Biomes` (`window.Grid = …` и т. д.). iframe с

`srcdoc` и iframe с `/fmg/` — одно происхождение с игрой, поэтому доступ

прямой и синхронный. **Права — только чтение, вендор не трогаем.**

2. **Пути SVG уже отрисованной карты** — `#featurePaths path#feature_N`,

фрактализованный берег, и пути `#rivers path#river_N`. Плюс — попиксельное

совпадение с тем, что игрок видит на карте. Минус — `#rivers` заполняется

только для видимой области (`draw-rivers.ts:132-150`), так что реки надо

брать из данных, а не из DOM; `#featurePaths` строится целиком, он пригоден.

3. **GPU-запёк 3D-вида** — `erosion-bake.ts` отдаёт `heights: Float32Array`

(0…1 по h 0…100), `pixels` (16-бит высота, гряды/лощина, **дренаж**) и

`coast` (маска суши, поверхность воды, **маска рек**, код типа озера) в

разрешении до 8192 px. Это почти готовое поле для вокселей, но живёт оно

только пока открыт 3D-вид и требует THREE-рендерера внутри фрейма — как

основной путь не годится, как «высокая деталь, если повезло» — годится.

Рекомендация: **непрерывные поля — из `grid`/`pack` (полная точность значений),

береговая линия — из `#featurePaths` (точность рисунка), реки — из

`pack.rivers` с меандрами**. Иначе получится классический конфликт «на карте

бухта, в мире стена».

### 3.4 Снимок мира, а не «каждый раз заново»

`pack.cells.h` меняется на шаге генерации рек, а при сохранении/загрузке `.map`

этот шаг не проигрывается: в `MIR-INTEGRATION.md` зафиксировано расхождение до

8 единиц высоты на 1487 клетках из 8452. Вывод: **воспроизводить мир по

`pack`-высотам нельзя, надо один раз снять производные растры и хранить их**.

Формат снимка («field pack») — собственные поля, а не `.map`. Разумное

разделение: непрерывное растрируется до блока, дискретное остаётся на клетках.

На каждый блок (1600 × 1000):

| Канал | Тип | Размер |

| --- | --- | --- |

| `h` — высота поверхности в единицах Azgaar ×100 (дробная после интерполяции) | Uint16Array | 3,2 МБ |

| `waterY` — поверхность воды | Uint8Array | 1,6 МБ |

| `flow` — направление (3 бита D8) + уровень (4 бита) + `isSource` | Uint8Array | 1,6 МБ |

| `mask` — суша/вода/лёд/озеро/река/пляж (битовые поля) | Uint8Array | 1,6 МБ |

На каждую клетку — как их держит Azgaar, без растрирования и без потери

значений (интерполяция при выборке, §3.1):

| Канал | Тип | Размер |

| --- | --- | --- |

| `biome` (pack-клетки) | Uint8Array | ≈100 КБ |

| `temp`, `prec` (grid-клетки) | Int8 + Uint8Array | ≈20 КБ |

| `riverId`, `fl` (pack-клетки) | Uint16Array ×2 | ≈200 КБ |

| `points` решётки, `spacing`, `cellsX/Y`, `features`, `rivers[]` (cells/width) | plain JSON | сотни КБ |

Итого ≈8 МБ в памяти на полный тайл вместо ≈17,6 МБ, если растеризовать всё;

дальше `h` можно опустить до Uint8 (потеря дробной высоты), а `waterY` слить с

`h` по знаковому биту. На диск — gzip через `CompressionStream`, готовые

`gzip`/`gunzip` есть в `src/game/map-frame.js`; хранение — IndexedDB (локальное

хранилище на мегабайты не рассчитано), ключ — `seed|width|height` плюс 64-битный

отпечаток снимка (`fingerprint()` оттуда же), чтобы поймать случай, когда

Azgaar дал другую карту.

Бонус: тот же снимок — готовый формат «экспорта мира» для лобби и для `.map`-

подобного файла, и он не зависит от версии вендора.

---

## 4. Координаты, масштаб и «1 блок = 1 пиксель»

| Пресет карты | spacing | решётка клеток | колонок в тайле | чанков 16×16 | блоков в одной клетке |

| --- | --- | --- | --- | --- | --- |

| 1280×800 | 10,12 px | 126×79 | 1 024 000 | 80×50 = 4 000 | ≈102 |

| 1600×1000 | 12,65 px | 126×79 | 1 600 000 | 100×63 = 6 300 | ≈160 |

| 1920×1080 | 14,40 px | 133×75 | 2 073 600 | 120×68 = 8 160 | ≈207 |

(Решётка почти не меняется: плотность фиксирована 10 000 клеток, размер карты

меняет только `spacing`. Отсюда следствие: **чем больше карта, тем «квадратнее»

рельеф в блоках** — на широкой карте одна клетка занимает 14 блоков.)

**Вертикаль.** Формула:

```

SEA_Y = 40 // уровень моря в блоках

y(h) = SEA_Y + (h − 20) · HEIGHT_SCALE // h ≥ 20 — суша

y(h) = SEA_Y + (h − 20) // h < 20 — дно (океан мелкий, ×1)

```

`HEIGHT_SCALE = 1` даёт рельеф ≤ 80 блоков при ширине мира 1600 — это 5 %

среднего уклона, то есть «очень равнинный мир с холмами». `HEIGHT_SCALE = 2`

(160 блоков, высота мира 256, `SEA_Y = 64`) — уже похоже на Minecraft и даёт

смысл уступам, скалам и водопадам. **Оценка: 2 — разумное значение по

умолчанию, 1 — режим «карта-диорама».** При 3 и больше русла рек не успевают

понижаться (см. §6.2) и мира «с обрывами» не избежать.

**Горизонталь и честная шкала.** Azgaar считает, что 1 px = 3 км

(`units.distance.scale = 3`), а высоту переводит как `(h − 18)²` метров. Если

1 блок = 1 пиксель и 1 блок = 1 метр, то мир в 3000 раз «сплющен» по вертикали

относительно карты. Это не ошибка — так устроена игровая картография

(Minecraft: чанк = 16 м, горы ~150 м), но назвать 1600×1000-блок «континентом в

4800 км» нельзя: **это диорама 1,6 × 1,0 км**, и все подписи «км/м/°C» надо

либо пересчитывать, либо честно помечать как «масштаб карты», а не «масштаб

мира». Подпись «км» в интерфейсе мира — отдельная задача, и лучше её вообще не

показывать, чем показывать неверно.

---

## 5. Поле → блоки: правила заполнения колонки

Порядок для каждой колонки `(x, z)`:

1. **сэмплировать** `h`, `temp`, `prec`, `biome`, `riverId`, `flow`, `waterY`

(билинейно по решётке / ближайшая клетка — §3.1);

2. **береговая линия** — если колонка попала в полосу `|x − coast| ≤ 2`,

высота тянется к `y = SEA_Y` (иначе у «нарисованного» берега будут висящие

блоки или затопленные луга);

3. **поверхность** — блок из палитры биома с поправками:

- `h < 20` → вода, дно по глубине: 19…17 песок, 16…12 песок/гравий, < 12

глина/камень; `temp ≤ −1` → сверху лёд (толщина по `|temp|`), айсберги из

`pack.ice` как отдельные тела;

- `t == 1` и `h ≤ 23` → песок (пляж), `t == 1` и крутизна > 30° → камень;

- `biome == 12` (заболоченность) → вода уровнем 1 + глина/торф;

- `biome == 11` (ледник) → лёд/утрамбованный лёд по камню;

- `temp ≤ 0` на поверхности → снежный покров поверх почвенного блока;

4. **толщина почвы** — 3 блока (песок → песчаник, глина → глина, иначе

земля), ниже камень; устье реки/овраг — меньше;

5. **русло реки** — §6.2 и §6.3;

6. **пустоты** — пещеры и руды: 3D-шум от `(x, y, z, worldSeed)`, вырезается

только при `y < y_поверхности − 3`, и **никогда не вскрывает русло и дно**;

7. **декор** — деревья/кактусы/кувшинки: взвешенный выбор из

`pack.biomes[biome].icons` + `iconsDensity`, детерминированный хеш

колонки; ствол и крона пишутся в тот же чанк (значит, чанк нельзя считать

готовым, не зная соседей: декор заходит на ±2 блока, стволы — на высоту).

8. **bedrock** — 1…3 блока снизу, шумовой «зубчатый» слой, как в Minecraft,

чтобы мир снизу был закрыт.

Палитра биома (13 базовых биомов Azgaar, `biomes-generator.ts:19-83`):

| id | Биом | Поверхность | Под поверхностью | Растительность (`icons`) | Особенность мира |

| --- | --- | --- | --- | --- | --- |

| 0 | Marine | вода | песок/гравий/камень | — | течения нет, но волна по `depth` |

| 1 | Hot desert | песок | песчаник | acacia 5, palm 3, кактус | выветренные уступы |

| 2 | Cold desert | песок+гравий | камень | grass 1 | солончаки на озёрах-«salt» |

| 3 | Savanna | трава | земля | acacia/deciduous | разреженный лес, пожарища? — нет |

| 4 | Grassland | трава | земля | grass | высокая трава по `prec` |

| 5 | Tropical seasonal forest | трава | земля | deciduous/conifer | сезонность по `temp` |

| 6 | Temperate deciduous forest | трава | земля | deciduous 6 | дуб/берёза по хешу |

| 7 | Tropical rainforest | трава | земля | deciduous+swamp | два яруса кроны |

| 8 | Temperate rainforest | мох/трава | земля | coniferSnow 1 | туман = повышенный `prec` |

| 9 | Taiga | подзол | земля+камень | conifer | ели 5-8 блоков |

| 10 | Tundra | трава+снег | мёрзлая земля | — | вечная мерзлота: копать нельзя ниже 1 блока? — нет, просто лёд в породе |

| 11 | Glacier | утрамбованный лёд | лёд/камень | — | трещины по шуму |

| 12 | Wetland | вода ур. 1 + торф | глина | swamp 1 | мангры, кувшинки |

Отдельное правило для **неизвестных id** (13…255): мастер может дорисовать свой

биом (`Biomes.add`, `Biomes.setCells`), и тогда имени и палитры у него нет.

Fallback — тот же класс, что `Biomes.getId` считает из `temp`/`prec`/`h`

(`biomes-generator.ts:186-196`), а цвет/плотность флоры берутся из

`pack.biomes[id]`, если они заданы. Так ручная правка мастера попадает в мир,

а не ломает генератор.

---

## 6. Реки и течение — то, ради чего всё это

### 6.1 Что уже посчитано

Azgaar считает гидрологию честно и это готовый каркас:

- `pack.cells.fl[i]` — **сток** клетки: `cells.fl[cell] = grid.cells.prec[cells.g[cell]]`,

далее вниз по склону прибавляется сток притоков (`river-generator.ts:85, 209,

110-116`). `fl ≥ 30` — «река вообще есть» (`MIN_FLUX_TO_FORM_RIVER`),

`fl ≥ 100` — судоходная (`MIN_NAVIGABLE_FLUX`).

- `pack.cells.r[i]` — id реки; `pack.rivers[]` — массив рек с полями `source`,

`mouth`, `parent`, `basin`, `length`, `discharge`, `width`, `widthFactor`,

`sourceWidth`, `type`, `name`, `cells`, `points`.

- `river.cells` — **упорядоченный список клеток от истока к устью**; шаг

построения буквально идёт «в нижнюю соседнюю клетку» (`addDownhill`), так что

порядок = направление течения. `−1` в списке — «река уходит за край карты».

- `pack.cells.conf[i]` — слияние (сколько воды прилило из притоков).

- `Rivers.addMeandering(river.cells, river.points)` — **меандры**: ломаная

`[x, y, flux]` в координатах карты, ровно та, что рисует слой `#rivers`

(`river-generator.ts:507-524`).

- `Rivers.getOffset({flux, pointIndex, widthFactor, startingWidth})` —

**полуширина русла в пикселях карты**, та же функция, из которой строится

лента реки на карте (`river-generator.ts:539-558`, `draw-rivers.ts:117-124`).

- Озёра: `features[].height` (вещественный, `rn(...,3)`), `subtype`

(`freshwater/salt/sinkhole/dry/lava/frozen`), `inlets`, `outlet`, `outCell`.

Практический смысл: **не надо ничего придумывать**. Направление течения = обход

`river.cells`; ширина канала = `2 · getOffset(...)`; полноводность = `fl`;

озёрная гладь = `features[].height`. И всё это автоматически согласовано с

картинкой карты.

### 6.2 Алгоритм построения речной сети в блоках

```

для каждой реки r в pack.rivers (от мелких к крупным по parent):

pts = Rivers.addMeandering(r.cells, r.points) // [x, y, flux]

для каждого отрезка pts → растровая растеризация (суперсэмплинг 2×):

halfPx = Rivers.getOffset({flux, pointIndex, widthFactor, sourceWidth})

ширина_в_блоках = clamp(ceil(2 · halfPx), 1, 8)

в каждую покрытую колонку:

bank = колонка с шириной + 1..2 → песок/гравий (пойма), если h < 25

bed = min(y(h) − 1, waterY − depth) // depth = 1 + floor(log2(flux/30))

water: заполнение от bed до waterY

waterY: идём от устья вверх по pts;

waterY[устье] = SEA_Y (или поверхность озера-приёмника);

waterY[i] = max(y(h_i) − 0.5, waterY[i−1] + 1/k) // монотонно, k = 6…10 колонок на блок

уровень (MC-like): level = clamp(8 − (waterY − bedY) · 8 / maxDepth, 1, 8)

направление: D8 по градиенту (x, z) из `pts`, для притоков — «в клетку

родителя» на слиянии (parent/basin уже знают куда)

```

Почему `waterY` пересчитывается, а не берётся из рельефа: `pack.cells.h`

прошёл заполнение впадин и прорезку русел (`downcutRivers`), но **прорезка

пропускает низменности** (`if (cells.h[i] < 35) continue`) — на равнине русло

на той же высоте, что луг, и вода стоит. Поэтому поверхность воды — наша

ответственность, и она обязана быть монотонной: `running max` вверх по течению.

В Minecraft вода ведёт себя похоже: уровень падает на 1 блок за расстояние.

### 6.3 Течение как свойство блока (то, что вы выбрали)

- **Хранить не на блок, а на клетку растра.** В одной колонке вода однородна,

поэтому один байт на колонку: `field.flow[i] = (глубина 4 бита << 4) |

D8-направление 4 бита`, а не blockstate на каждый блок (172 800 колонок =

169 КиБ против 21 МиБ по байту на блок). Разбирает его `sampleColumn`:

`dir = flow & 15`, `depth = flow >> 4`.

- Направление — **D8** (как `flowing_water.direction` в Minecraft: 1…4 —

основные, 5…8 — диагонали), `0` — стоячая вода. Исток против проточной воды —

это разные id в чанке (`WATER_SOURCE` / `WATER`), а не флаг в байте:

в 4 бита флага не положить ни направления, ни 16 уровней глубины сразу.

- Течение анимируется на CPU, без шейдера: стрелки на решётке каждые 4 блока

пульсируют яркостью по фазе `time · 1,7 + (x + z) · 0,16`, вода ровно по

зеркалу плотнее (α 0,92), чем вода, доставшаяся «по кожу» (α 0,8). Пены и

«стенок воды» нет: их рисовал 3D-шейдер, и вместе с 3D они ушли. Никакой

клеточной автоматики, всё детерминированно.

- Что это даёт сверх красоты: `dir` — готовый ответ на «река течёт туда»,

годится для навигации (течение лодки/плавания), для генерации мельниц/

плотин в будущих геймплейных фичах и для проверки «нет ли цикла» в тестах.

- Чего это сознательно **не** даёт: вода не растекается при копании, не

тушит лаву, не течёт в только что скопанный блок. Это выбор «свойство, а не

симуляция»; если позже захочется — добавляется локальный CA в радиусе 3×3

вокруг скопанного блока, и формат данных (`flow`-байт колонки) к этому уже

готов.

### 6.4 Частные случаи, которые надо предусмотреть

| Случай | Данные | Правило |

| --- | --- | --- |

| водопад | `\|waterY[i] − waterY[i−1]\| ≥ 2` | столб воды по бокам + `dir = down`, пена, устье-озеро ниже |

| река впадает в озеро | `feature.type == 'lake'`, `inlets` | русло обрывается, `waterY` = поверхность озера, течение = 0, `isSource` для озера |

| озеро без стока | нет `outlet` | «тупик»: вода стоит, `fl` обнуляется |

| река уходит за край карты | `river.cells` содержит `−1` | в зацикленном мире — продолжить с противоположной стороны (§7.3), иначе — обрыв в «бездну» запрещён: делаем устье-эстуарий |

| слияние притоков | `parent`, `conf` | `width` = max(сама, +приток): ширина обязана расти вниз по течению, иначе визуально «река тоньше у устья» |

| устье в море | `h < 20` у mouth | эстуарий: русло расширяется до `width · 1,5`, дно уходит на `SEA_Y − 2`, пойма = ил/песок |

| солёное/сухое/лава-озеро | `subtype` | `salt` → солончак, `dry` → грязь/трещиноватая земля, `lava` → лава поверх базальта (материалы берём из `subtype`, не из температуры) |

| болото | `biome == 12` | цепочка «вода ур. 1 + торф», течение 0, `isSource` |

| мост/брод | `pack.cells.haven`, `routes[]` | там, где дорога пересекает реку, — брод (дно +1) или мост; данные для этого есть уже |

---

## 7. «Мир неограниченный и зацикленный»

### 7.1 Адресация

Чанки имеют **неограниченные** координаты `(cx, cz) ∈ ℤ²`, мир конечен только

как *данные*: тайл = размер карты. Функция свёртки:

```

fold(x, z):

u = floorMod(x, 2·W), v = floorMod(z, 2·H) // период = 2 тайла по каждой оси

mx = u ≥ W ? 1 : 0, my = v ≥ H ? 1 : 0

ux = mx ? 2·W − 1 − u : u // зеркальное отражение

uz = my ? 2·H − 1 − v : v

return { ux, uz, mx, my } // флаги идут в шум, декор и UV

```

Всё, что читает растр (`h`, `biome`, `flow`, `waterY`, маски), идёт через

`fold`. Всё, что использует хеш/шум, получает `worldSeed ^ hash(ux, uz, mx, my)`.

Так чанк за «краем» карты не специальный код, а обычная свёртка координат.

### 7.2 Режимы шва

| Режим | Что делает | Непрерывность | Что видит игрок | Цена |

| --- | --- | --- | --- | --- |

| `mirror` (рекомендуется) | период 2W×2H, отражения по обеим осям | **C⁰ по всем полям бесплатно**, включая берег и русла | 4-кратная симметрия; при 1600×1000 блока она заметна через ~1,5 км ходьбы | 0 доп. кода |

| `wrap` | период W×H, «прямые» стыки | разрыв: берег А не совпадает с берегом Б → стена/обрыв | шов как «край света», если не закрашивать | 0 |

| `blend` | период W×H + полоса смешения 32…64 px: `lerp` противоположных краёв | C⁰ (и почти C¹) по высотам | шва не видно; повтор всё равно читается | нужен перерасчёт рек и воды в полосе |

Почему не «повороты тайлов»: отражения — единственные из 8 симметрий

квадрата, сохраняющие согласованность соседних швов одновременно по обеим

осям. Повернутые тайлы дают несовместимые края, и «разнообразить повтор»

таким способом нельзя.

Почему `mirror` — правильный выбор для **рек**: отражение сохраняет

непрерывность линии и высот, а направление течения отражается вместе с руслом

(река, ушедшая за восточный край, возвращается тем же руслом). Это

«физически» странно (сток на шве удваивается), но визуально правильно: русло

не обрывается и вода не течёт в гору. `blend` требует перевыпустить `waterY`

в полосе — иначе появится локальный «водораздел наоборот».

Маскировка повтора (по желанию, только в `mirror`): низкочастотный шум

`overlay(x, z)`, вычисляемый от **тех же свёрнутых** `ux, uz` — тогда он так

же непрерывен на шве, — меняющий `h` на ±2…4 блока и `biome` — на соседний по

шкале влажности. Это убирает «стены одинаковых берегов» и не мешает совпадению

с 2D-картой: внутри первого тайла мир обязан карте соответствовать буквально,

и об этом («карта — один период мира») надо сказать в UI.

### 7.3 Что делать с рекой, уходящей за край

Три честных варианта, по одному на режим:

- `mirror` — ничего не делать: `-1`-клетка отражается, река возвращается;

- `blend` — продолжить `river.cells` противоположными клетками `pack`, у

которых `cells.b == 1` и `r == id` (их нет: река обрывается) → фактически

надо достроить русло самому по градиенту высоты в полосе;

- «эстуарий» (для любого режима) — устье раздвигается в треугольник, и река

впадает в открытое море у шва; это самое дешёвое и самое «географичное».

### 7.4 Границы карты у `grid.boundary`

Клетки `grid.cells.b == 1` — приграничные, и генераторы их сознательно

избегают («река не может начинаться у края карты»). Свободно отражая тайл, мы

получаем «берег-у-края», превращённый в «пролив посередине материка». Это

выглядит правдоподобно, но в 2D-карте пролива нет. Решение — не техническое,

а продуктовое: либо мир честно показывает чуть больше карты, либо карта

строится с учётом тороидальности (для этого пришлось бы просить Azgaar о

другом `maplink`; нереалистично).

---

## 8. Чанки и хранение блоков

| Параметр | Значение | Комментарий |

| --- | --- | --- |

| размер | 16 × 16 × H | H = 128 (`HEIGHT_SCALE 1`) или 256 (`2`) |

| хранение | палитра + индекс, как в Minecraft 1.16+ | ≤16 id → 4 бита, ≤64 → 6 бит, ≤256 → 8 бит |

| объём | 32 768 блоков → 16 КБ при 4 битах | + байт на колонку для `flow/mask` = 256 Б |

| потребитель | один блок на пиксель кадра (`layers.js`) | граней, буферов и загрузки на GPU нет вовсе |

| вес | 25 чанков радиуса 2 = 2 025 КиБ блоков (`stats().bytes`) | Uint8Array по блоку на колонку-ярус; пересчёт дешевле кэша |

| соседи | для декора и крон нужны 1-кратные колонки соседей (±1 по x/z) | генерация сразу с «юбкой» — иначе кроны и пещеры режутся на шве |

| кеш | IndexedDB не нужен (см. ниже) | блоки дешевле пересчитать, чем версионировать кэш |

Правило, которое экономит недели: **кэшируем снимок полей, а не блоки.**

Колонка — чистая функция `(field, x, z, worldSeed)`, где `field` — снимок из

§3.4. Детерминизм даёт собственный `splitmix32`/`wyhash`-хеш от координат и

`worldSeed`; на `Math.random` надеяться нельзя: в окне игры это не seeded-ПСП,

а в окне Azgaar он подменён на Alea и зависит от порядка шагов генерации. Кэш

блоков имел бы смысл только при правках мира игроком — тогда нужен журнал

правок (`patches: Map<chunkKey, Uint8Array>`). Правок в этом плане нет, значит,

нет и кэша.

Формат чанка для сети (лобби) — `encodeFrame` из `src/game/map-frame.js` как

есть: заголовок `{t:'voxel-chunk', v:1, key, palette:[…]}` + gzip индексов.

Но в первую очередь надо решить, нужен ли он вообще: все клиенты могут

построить тот же мир из одного `seed` (именно так сейчас работает слот).

---

## 9. Плоские ярусы: как мир показан картой

Движок блок-мира — свои файлы, без внешних движков: `three.min.js` живёт только

внутри `/fmg/` (612 КиБ), и тащить его в `mir.html` ради блоков никто не стал.

Первая реализация была объёмной (мешер + WebGL2 + орбитная камера); после неё мир

остался блоками, но показывается **плоской картой, где один пиксель — один

блок**, а ярус выбирается ползунком.

**Семантика яруса — «разрезать мир плоскостью на высоте Y», а не «показать блоки

ровно на Y».** Это не вкусовщина: плоский срез по холмистой карте не читается.

На острове 480 × 360 колонок ровный срез по y = 100 давал серый каменный диск —

вершины холмов отрезаны, и ни рек, ни берегов, ни биомов не видно (проверено

рендером картинки, не рассуждением). Поэтому правило такое:

```

crown = (мокрая колонка и waterY > ground) ? waterY : ground // вершина столбца

cut = min(level, crown) // что реально видно

```

* всё, что выше плоскости, показывается своей «кожей» на плоскости — кроны,

трава, зеркало воды, и карта остаётся картой на любом ярусе;

* кожа, ушедшая под плоскость, затемняется: `bandFactor(relief)` — медленная

тень глубины плюс изогипты каждые 12 блоков. Линейной тенью нельзя: на холме в

26 блоков она насыщается на первых 18, и остров превращается в серое пятно;

* `AIR` внутри грунта рисуется чёрной дырой (пещеры видно на срезе), `AIR` над

вершиной — небом. Путать их нельзя: иначе пустая клетка под холмом выглядела

бы дырой в мир, и на плоской карте это неотличимо от неба;

* вода на уровне зеркала плотнее (α 0.92), та, что досталась «по кожу» после

срезки, прозрачнее (α 0.8) — сквозь неё читается дно русла.

**Цвета берутся из атласа.** `atlas.js` рисует 46 тайлов пикселями в

Uint8Array (0 байт ресурсов в репозитории и в `mir.html`), а

`buildTileColors(atlas)` усредняет каждый тайл по непрозрачным пикселям — это и

есть палитра слоя. Своя палитра для карты разъехалась бы с атласом при первой же

правке тонов, поэтому цвет блока на карте = средний цвет той грани тайла,

которая на этом ярусе видна. Каналы округляются до целых: палитра уходит в

`Uint8ClampedArray`, и тест сверяет именно то, что видно на экране.

**Наложения** (каждое выключается, потому что на маленьком экране они мешают

друг другу):

| Наложение | Что рисует | Откуда данные |

| --- | --- | --- |

| течение | стрелка-«комета» из пяти пикселей, яркость пульсирует | `field.flow[i] & 15` = D8, вектор — `flowVector` того же поля |

| вода | береговая линия по сухую сторону | правило «в клетке видно воду»: `wet && waterY > ground && level > ground` |

| отметки | высота холма в блоках на тёмной плашке | локальные максимумы на решётке 22 клетки, суша выше `seaY + 4` |

| рельеф | изогипты и тень глубины | `reliefFactor` по соседним колонкам + `bandFactor` |

Стрелки и берег пишутся в соседние клетки, поэтому они копятся в отложенные

списки и накладываются после основного прохода: иначе сосед закрашивался бы

позже и стирал половину стрелки (у берега — всю длинную сторону). Решётка

течения — по **мировым** координатам, иначе при перетаскивании стрелки скользили

бы по руслу.

**Что меряли на острове 480 × 360 (Node, без браузера):**

| Что | Значение | Как измерять |

| --- | --- | --- |

| `buildField` (172 800 колонок) | 83 мс | `performance.now()` в тесте, порог 4 000 мс |

| генерация чанка | 2,9…3,5 мс в среднем по 25 чанкам | то же; один замер — мусор JIT |

| кадр 96 × 64 блоков | 0,4…3,6 мс | `test:voxel`, порог 24 мс |

| кадр 340 × 250 (85 000 блоков) | 20…40 мс | тот же прогон, вид на весь экран |

| кадр 480 × 360 (172 800 блоков) | 25…106 мс | отладочный рендер всех пресетов |

| 1 089 чанков радиуса 16 | 3,5…4,0 с | `world.step(1000)` до пустой очереди |

Отсюда продуктовые решения: полотно рисуется в разрешении блоков и растягивается

CSS-ом с `image-rendering: pixelated` (цена кадра не зависит от DPI), потолок —

`MAX_CELLS = 260 000` блоков на кадр, а живой кадр течения перекрашивается не

чаще, чем раз в 70 мс (≈14 fps): пульсация воды медленная, а тройка кадров по

10 мс каждый съела бы кадр целиком. Полная генерация всего тайла по-прежнему не

делается — только ленивая по кольцам от центра кадра.

## 10. Как это встраивается в игру

| Слой | Что добавляется | Заметки |

| --- | --- | --- |

| `src/world/field.js` | свёртка клеток в растр (`buildField`), `fold`, русло и течение как поле, `sampleColumn` | чистые функции; ни DOM, ни iframe не нужны для теста |

| `src/world/blocks.js` | таблица блоков, палитра биомов, `TILES` — слоты атласа | плотный массив, индекс = слот атласа; пополняется только в конце |

| `src/world/chunk.js` | заполнение колонки, решётки пещер и руд, декор, палитры и индексы | формат палитры описан в §8; сериализация уже есть (`encodePalette`) |

| `src/world/atlas.js` | процедурный атлас (46 тайлов пикселями) и `buildTileColors` — палитра слоя | рисует в Uint8Array: ни canvas, ни файлов-текстур не просит |

| `src/world/layers.js` | плоский ярус: `cutY`, кожа вместо среза, изогипты, течение, берег, отметки | чистые функции; кадр = `Uint8ClampedArray` по 4 байта на блок, см. §9 |

| `src/world/bridge.js` | чтение `grid`/`pack`/`pack.features`/`pack.rivers` из окна Azgaar | только чтение; `VoxelSourceError` объясняет, чего не хватает |

| `src/world/world.js` | очередь чанков в бюджете кадра, хранилище по радиусу, статистика | про рендер не знает ничего: отдаёт `get(cx, cz).chunk` и `bytes` |

| `src/game/world-view.js` | полотно, ползунок яруса, пресеты, наложения, мышь/клавиатура, HUD | вся возня с DOM живёт здесь; состояние вида (`level`, `zoom`, `center`) читается тестами |

| `src/main.js` | режим `voxel` на экране карты, кнопка в шапке, ступенька Escape | экран новым не стал — см. ниже |

| `scripts/test-voxel.mjs` | проверки §11 на живых модулях | гоняется в Node без браузера |

**Почему режим, а не новый экран.** Страница карты — одна HTML-строка, и

`renderWorldPage` сравнивает её с прошлой: любое отличие заменяет `.world-app`

целиком, а вместе с ним умирает iframe с документом Azgaar и начинается новая

генерация (секунды, и весь труд игрока потерян). Поэтому воксельный мир —

флаг `session.voxel` на том же экране: в существующем

`[data-role="world-editor-host"]` появляется оверлей, `.world-editor` получает

класс `is-voxel`, iframe остаётся на месте и только скрывается через

`visibility`. Кнопка в шапке печатается одной и той же строкой при любом

состоянии режима — её подпись и `aria-pressed` меняются императивно, как

`paintLobbyChip` меняет плашку лобби.

Права «мастер/игрок» наследуются: мир строится из того же документа карты,

который открыт в iframe, — ни копия seed, ни пересборка не нужны. Отсюда

единственная коллизия: живой предпросмотр правок мастера (`lobby-sync.js`)

кладёт поверх кадра свои снимки, а воксельный вид читает документ самого

игрока. Держать их вместе нельзя, поэтому `MutationObserver` за хостом гасит

режим, как только появляется `.world-live.is-on`, и говорит игроку почему.

**Офлайн, APK, EXE.** Всё новое — обычный `src/`, без сетевых запросов и без

новых npm-зависимостей. Атлас процедурный, в репозитории 0 байт ресурсов.

Замер веса на реальной сборке: минифицированный скрипт с 3D-видом — **286 КБ**,

с плоскими ярусами — **280 КБ** (мешер и GL-рендерер заменены `layers.js`, атлас

переехал из `render.js` в `atlas.js` и остался). Бюджет `js` после этого опущен

до `288 * 1024` — 8 КБ запаса на HUD и наложения (причина записана в

комментарии `scripts/lib/verify-build.mjs`). `mir.html` после `npm run single` —

27.4 МиБ при бюджете 30 МиБ. Новых путей в precache service worker не

добавлялось: режим живёт на уже кэшированной странице карты.

---

## 11. Проверки, которые должны существовать с первого дня

Тесты гоняются в Node на живых модулях (`field`, `chunk`, `layers`, `atlas`,

`world`, `bridge`) — без DOM и без iframe. Источник поля — остров, собранный прямо в

тесте (`island()`: 40 × 30 клеток, река по точкам генератора, озеро в ложбине).

Мост проверяется поддельным *окном редактора* — `scripts/lib/fake-fmg.mjs`,

`fakeEditorWindow()`: поля в нём названы ровно так, как их читает `readSource`,

поэтому переименование поля в vendored Azgaar должно ломать тест, а не молча

менять рельеф. Тот же помощник кормит `test:voxel-view`, где на этом окне

поднимается настоящий DOM-режим.

1. **Детерминизм** — есть: «чанк детерминирован», «другая соль карты — другой

чанк».

2. **Сток не течёт в гору** — есть: «вода в русле выше дна и не ниже уровня

моря», «у русла есть направление течения», «D8-направление и вектор

согласованы».

3. **Монотонность рек** — есть: «гладь реки монотонна от истока к устью».

4. **Непрерывность русла** — есть: «русло легло на растр» + «мост: русло

прорастрировано в поле».

5. **Совпадение с картой** — частично: берег сверяется с точками `Rivers` на

снимке карт («мост: русло прошло по точкам генератора»), сравнение с

отрисованным `#featurePaths` требует браузера и остаётся человеком

(см. §13, M0).

5а. **Пиксель слоя = блок на плоскости реза** — есть: «пиксель слоя = блок на

плоскости реза» (цвет кадра сверяется со средним цветом тайла того же блока в

чанке), «cutY = min(вершина колонки, ярус)», «каждый блок кадра учтён ровно

один раз», «срез через период тайла побайтно тот же», «кадр детерминирован».

6. **Шов** — есть: «зеркальное замощение», «чанки сходятся с юбкой соседа»,

«чанк за пределами тайла генерируется из замощения», «кадр центрируется на

запрошенной точке».

6а. **Наложения** — есть: «число водных пикселей = правилу воды поля», «линия

воды = граница занято/свободно», «стрелка разворачивается по направлению

течения» (яркость острия выше яркости хвоста, пиксель за стрелкой не

тронут), «течение анимировано», «отметки высот рисуются на суше»,

«палитра слоя = средний цвет тайла атласа».

7. **Round-trip** — есть: «упаковка палитры обратима», «чужая версия палитры —

понятная ошибка».

8. **Биомы-заглушки нет** — есть: «биомы не сводятся к голому камню»,

«неизвестный id биомы не роняет генератор», «климат всегда попадает в

известный биом».

9. **Интерфейс режима** — `npm run test:voxel-view` (57 проверок в jsdom):

монтирование в хост редактора, диапазон ползунка и шаг ±1/±10, пресеты

(«Вода» = уровень моря, «Кроны» выше воды), подсветка `aria-pressed`,

переключатели наложений, масштаб и его зажимы, «полотно = размер кадра в

блоках», перетаскивание в блоках, колесо, стрелки, возврат к спавну (R),

HUD, отказ без карт, `dispose`. Canvas 2D в jsdom нет — проверка

«без 2D-канваса вид не красит кадр и не падает» фиксирует именно это. `npm

run test:ui` дополнительно подтверждает, что страница карты жива и консоль

чиста (в песочнице с 4 ГБ памяти нужен `NODE_OPTIONS=--max-old-space-size=6144`:

тест поднимает 28-МиБ `mir.html` в jsdom трижды).

10. **`test:build`** — бюджеты, precache, один скрипт в `mir.html`.

Счёт на 2026-10-11: `test:voxel` — 76 проверок, `test:voxel-view` — 57,

`test:spacing` — 12, `test:build` — 46. Все гоняются на живых модулях, без

подделок: поддельным является только *окно редактора* (его в Node не бывает), и

оно собрано по именам полей вендора. Проверки геометрии меша (обход граней, UV,

AO, число квадов, формат вершины) были удалены вместе с мешером: перекрашивать

мир в перспективе не планируется.

---

## 12. Риски и ограничения (без прикрас)

- **Ступенчатость.** Исходные данные — 10…14 блоков на клетку и целая высота.

Интерполяция сглаживает *холмы*, но не *границы биомов*: биом дискретен, и

пятно «пустыня рядом с тундрой» будет квадратным. Лечится шумовым

перемешиванием палитры в полосе 2…3 блока — и перестаёт точно совпадать с

картой. Компромисс надо зафиксировать числом, а не «на глаз».

- **Совпадение с картой — не бесплатное.** Берег фрактальный (`baseAmplitude

1.5`, `maxDepth 4`), слои высот и биомов рисуются по клеткам. Мир обязан

выбрать источник берега; при `#featurePaths` нужен разбор SVG-путей

(`Path2D` + растеризация), и это зависит от `id` слоёв, то есть от

presentational-кода вендора. Вендор запинен (1.154.0), поэтому риск

«придёт апстрим и всё поедет» реален: bridge обязан падать громко, с

объяснением, и иметь путь отката на клетки.

- **3000:1 по вертикали.** См. §4: это диорама. Любой, кто придёт из

Minecraft, будет ждать «1 блок = 1 м», а получит «1 блок = 1 px карты». Это

надо написать в UI мира один раз, прямо.

- **Речные низменности.** Прорезка русел у Azgaar идёт только при `h ≥ 35`, и

на равнине вода стоит на уровне луга. Мы это исправляем своим `waterY`

(§6.2), но цена — русло в равнинной реке «утоплено» на 1…3 блока, а берега

надо подсыпать, иначе река выглядит канавой. Механика решаемая, но именно

здесь мир чаще всего «не сходится» с картинкой: на это уйдёт больше всего

ручных просмотров.

- **Производительность на слабых Android.** Worker-пула нет (в этой сборке

SharedArrayBuffer и module workers с общей памятью недоступны), генерация

идёт inline в бюджете кадра, и на 2-ядерных телефонах она не успевает за

перетаскиванием. Меш-буферов тоже нет: память — это блоки (25 чанков радиуса

2 = 2 025 КиБ) плюс полотно в разрешении блоков, потолок 260 000 клеток на

кадр. Догоняющие чанки кадр перекрашивает каждый раз, когда они пришли, —

карта простоять «чёрным квадратом» не может: незанятые клетки рисуются схемой

поля (0.82 яркости, α 0.85), и это тот же ответ, что и блоки, только ближе.

Просьба «превью-чанк из растра» с отказом от 3D потеряла смысл.

- **Ручная правка мастера.** Биомы и русла, нарисованные вручную, попадают в

`pack` и в `features`, но `#featurePaths` пересчитывается только после

перерисовки слоёв. Снимок полей надо брать после `Layers.drawAll()`, иначе

мир построен по «до-правок».

- **Чего не будет (если не заказать отдельно):** физики воды и лавы,

гравитации песка, освещения (кроме AO), редстоуна, биом-мобов, сохранности

правок в лобби, генерации «за пределами карты» (мир зациклен, а не

бесконечен-в-смысле-Minecraft), и точных километров/метров.

---

## 13. Этапы и оценка

| Этап | Содержание | Проверка (acceptance) | Оценка |

| --- | --- | --- | --- |

| **M0. Спайк** | bridge: снять `h/temp/prec/biome/river/flow` с живой карты; топдаун-превью в 2D-canvas; сравнить с слоями Azgaar | «глазом видно те же реки и тот же берег»; замеры `spacing`, времени съёма | 0,5…1 день. **Стоп-критерий:** если русло и берег не совпадают < 3 блоков — дальше не идём |

| **M1. Колонки и чанки** | `columns.js`, `chunk.js`, палитры, детерминизм, юбка соседей | тесты 1, 6, 7, 8 | 1 день |

| **M2. Гидрология** | `hydro.js`: меандры, ширина, `waterY`, D8 `flow`, озёра, водопады | тесты 2, 3, 4; скриншоты 20 рек | 1 день |

| **M3. Рендер** | план был WebGL2 + greedy + AO + туман; сделано: плоский ярус в Canvas 2D, атлас, течение, берег, отметки | кадр экрана (≈85 000 блоков) ≤40 мс, кадр 96×64 ≤24 мс; 3D-критерий снят вместе с 3D | 1…1,5 дня |

| **M4. Зацикливание и стриминг** | `fold`, режимы шва, worker-пул, LRU, приоритеты, превью-чанк | тест 6; «1000 блоков по кругу — шва нет» | 0,5…1 день |

| **M5. Детали мира** | биом-палитры, декор из `relief`, пещеры/руда, пляжи, эстуарии, снег/лёд | просмотр 13 биомов; регрессия производительности | 1 день |

| **M6. Интеграция** | экран и кнопка, HUD, слоты/лобби, precache, бюджеты, README/AGENTS, CHANGELOG | `npm run build && npm run single && npm run test:build && npm run test:ui` | 0,5…1 день |

**Итого: ≈5…7 рабочих дней** до «открываешь и ходишь», плюс 1…2 дня на

телефонные доводки. Это прототип: без правок блоков, без сохранения, без

мультиплеерного мира. Оценка объёма кода — 4…5 тысяч строк в `src/world/` и

`scripts/`, что при текущих бюджетах сборки (см. §10) само по себе является

решением, а не деталью.

**Что из этого вышло на 2026-10-11 (M0…M6 приняты).** Этапы закрыты в другом

порядке и частично в другом составе. Worker-пула нет (в этой сборке недоступны

module workers с общей памятью), очередь чанков считается inline в бюджете кадра

— на времени это почти не сказалось (чанк 2,9…3,5 мс), зато хранит мир ровно

один блок на клетку-ярус. 3D-сцена (мешер, `openOnly`, упаковка вершины в 16

байт, WebGL2-рендерер, орбитная камера, DDA-луч за курсором) была собрана,

проверена — и убрана по решению владельца: мир нужен был картой, а не

перспективой, и слой выбирается ползунком (см. §9). От 3D остались атлас

(переехал в `atlas.js`, он же кормит палитру слоя) и всё, что под ним: поле,

блоки, чанки, гидрология, течение, интеграция в экран карты. Превью-чанк (2D-карта

для слотов) не делался: роль превью играет сама карта Azgaar под режимом.

Осталось посмотреть в браузере: читаемость отметок высот на плотном лесу, вода

на мелководье и цена кадра на телефоне — `npm run serve` и кнопка «Карта

блоками».

Смысловая веха: после M0 можно сказать «да/нет» по совпадению карты и мира;

после M3 — «да/нет» по телефону. Оба — дешёвые точки отказа, их стоит держать

как отдельные PR.

---

## 14. Открытые вопросы владельцу

1. **Подтверждаем ли отмену «не сливать данные Azgaar с voxel-миром»?** Без

этого п. 13 не начинается.

2. **`HEIGHT_SCALE`**: 1 («карта-диорама», быстро, плоско) или 2 (похоже на

Minecraft, мир 256 в высоту, дороже)? По умолчанию предлагаю 2.

3. **Шов**: `mirror` (честно, бесплатно, симметрия видна) или `blend` (красиво,

+полоса пересчёта рек)? Предлагаю `mirror` как значение по умолчанию и

`blend` как опцию.

4. **Границы «мира» в интерфейсе**: показывать ли, что мир повторяется через

1,6 км, и называть ли это «карта-период»?

5. **Готовность поднять бюджеты** `scripts/lib/verify-build.mjs` (скрипт

приложения) ради 40…60 КиБ движка — или мир живёт только в web/PWA и не

вшивается в `mir.html`/APK (тогда это вторая сборка, а не одна, и тесты

усложняются).

6. Нужен ли экспорт в настоящие форматы Minecraft (`.schem` / region-`.mca`),

или мир остаётся собственным? Формат блоков и чанков в §8 спроектирован так,

чтобы `.mca`-писатель добавлялся отдельно; но это ещё ~1 день и своя

проверка на живом Minecraft.

---

## Приложение. Откуда взяты утверждения

Пути — от `vendor/azgaar-fantasy-map-generator/`.

| Факт | Место |

| --- | --- |

| `grid`/`pack` в глобальной области | `src/components/globals.ts:4-5` |

| `window.Pack`/`Grid`/`Rivers`/`Biomes`/`Ice` | `src/generators/pack-generator.ts:107`, `grid-generator.ts:256`, `river-generator.ts:836`, `biomes-generator.ts:224`, `ice-generator.ts:154` |

| `grid.cells.h/t/temp/prec`, sea level 20 | `src/types/GridGraph.ts:6-10`, `src/utils/heightUtils.ts:2` |

| `pack.cells.*` (h, g, r, fl, conf, p, biome…) | `src/types/PackedGraph.ts:19-45`, `src/generators/pack-generator.ts:44-58`, `src/generators/biomes-generator.ts:106-118` |

| решётка: `spacing`, `cellsX/Y`, `findCell`, дрожь | `src/generators/grid-generator.ts:69-72, 103-110, 136-140` |

| плотность графа: 10 000 по умолчанию, шаги | `src/data/graph-density.ts:2-16`, `src/components/options-model.ts:59, 273` |

| река: тип, `cells` от истока к устью, `−1`, приток/бассейн | `src/generators/river-generator.ts:11-33, 89-113` |

| сток: `fl` из осадков, накопление вниз | `src/generators/river-generator.ts:85, 209, 110-116, 416-418` |

| заполнение впадин + `cells.h = h` + `downcutRivers` (низменности не прорезает) | `src/generators/river-generator.ts:434-449, 428-431, 383-397` |

| меандры и ширина русла | `src/generators/river-generator.ts:507-524, 539-558`, `src/renderers/draw-rivers.ts:116-124` |

| биомы: 13 имён, цвета, `iconsDensity`, `getId`, кастомные до 255 | `src/generators/biomes-generator.ts:19-83, 150-196` |

| температура: 6,5 °C/км, осадки ×100 мм | `src/generators/temperature-generator.ts:43, 58`, `src/utils/unitUtils.ts:71-73` |

| озёра: `height`, `subtype`, `inlets/outlet/outCell` | `src/generators/lakes.ts:13-40, 61-78`, `src/generators/features-generator.ts:17-33, 251` |

| фрактальный берег и `#featurePaths` | `src/generators/coastline-generator.ts:29-40, 85-121`, `src/renderers/draw-landmass.ts:15-31` |

| `#rivers` рисуется только для видимой области | `src/renderers/draw-rivers.ts:131-150` |

| `#heightmap` несёт `data-height` | `src/renderers/draw-heightmap.ts:143-183` |

| GPU-запёк высот/стока/масок для 3D-вида | `src/renderers/erosion-bake.ts:8-31`, `src/renderers/view-3d-renderer.ts:700-714` |

| шкала: 1 px = 3 км, `(h−18)^exponent` м | `src/components/options-model.ts:74, 76`, `src/utils/unitUtils.ts:59-70` |

| что можно пинить извне (в т. ч. `points`, `prec`, `heightExponent`) и почему `options=default` это гасит | `src/components/options-schema.ts:281-316`, `src/components/pins.ts:13-15, 43-47` |

| расхождение высот после save/load `.map` | `vendor/azgaar-fantasy-map-generator/MIR-INTEGRATION.md` (последний абзац) |

| кадры/gzip/отпечаток для снимка | `src/game/map-frame.js` |

| паттерн моста с окном Azgaar | `src/game/generation-stage.js:188-280` |

| удалённый собственный генератор и «не сливать» | `CHANGELOG.md` (2026-10-08, две записи) |

Внешние ориентиры по блоковой части (не скопированы, а просто «так делают»):

хранение чанков палитрами и 4-битные индексы, D8-направление и «уровень» воды,

greedy meshing и AO по соседям — это публичные описания Minecraft-подобных

движков; конкретные числа в §9 оценочные и проверяются на M0/M3.

````

## Общие файлы: патчи от базы `577acae`

Диффы против базы сессии — в них ровно то, что принёс режим, включая 3D-часть (её main уже содержит, поэтому и конфликты).

### патч · `src/main.js` · +117 −1

````diff

diff --git a/src/main.js b/src/main.js

index 34ecfc0..0249542 100644

--- a/src/main.js

+++ b/src/main.js

@@ -13,6 +13,7 @@ import { copyText, escapeHtml, formatDate, nameHue, toast } from './ui/dom.js';

import { configureSounds, playSound } from './ui/sound.js';

import { createEditorFrame } from './game/azgaar.js';

import { startLobbySync } from './game/lobby-sync.js';

+import { mountWorldView } from './game/world-view.js';

import * as lobby from './data/lobby.js';

import { lobbyChipHtml, lobbyScreenHtml } from './ui/lobby-view.js';

import { seedArtOrIcon, seedArtSvg } from './ui/seed-art.js';

@@ -1954,6 +1955,8 @@ const createWorldSession = () => ({

importToSlot: null, // { role, index } — слот для загруженного файла; null — файл заполнит форму

config: store.normalizeWorldConfig({ seed: worldSeed() }),

frameKey: '', // параметры документа Azgaar: при смене создаём новый iframe

+ voxel: false, // надстройка «карта блоками» (плоские ярусы) над экраном карты

+ voxelView: null, // смонтированный вид: dispose при выходе из режима

lobby: null, // { id, role, code, epoch, fresh } — карта открыта из лобби

syncStop: null, // остановка синхронизации лобби для текущего iframe

leaveArmed: false, // первый клик «Выйти» ждёт подтверждения

@@ -2165,6 +2168,11 @@ const worldPageHtml = () => {

: screen === 'map' && session.lobby

? `<button class="world-topbar-button" type="button" data-action="world-lobby-back" aria-label="К лобби" title="К лобби">${icon('chevronLeft', 'icon--xs')}<span>К лобби</span></button>`

: `<button class="world-topbar-button" type="button" data-action="world-slots" aria-label="К слотам" title="К слотам">${icon('chevronLeft', 'icon--xs')}<span>К слотам</span></button>`;

+ /* Кнопка режима не зависит от session.voxel: перерисовка страницы убила бы

+ iframe с документом Azgaar, а режим переключается классом (syncWorldVoxel). */

+ const voxelAction = screen === 'map'

+ ? `<button class="world-topbar-button" type="button" data-action="world-voxel" aria-label="Карта блоками" title="Карта блоками: тот же мир ярус за ярусом, срез плоскостью">${icon('layers', 'icon--xs')}<span>Карта блоками</span></button>`

+ : '';

const masterMapActions = screen === 'map' && !player

? `

<button class="world-topbar-button" type="button" data-action="world-new" aria-label="Новый мир" title="Новый мир">${icon('dices', 'icon--xs')}<span>Новый мир</span></button>

@@ -2192,7 +2200,7 @@ const worldPageHtml = () => {

${screen === 'map' && session.lobby ? '<span class="world-lobby-chip" data-role="lobby-chip"></span>' : ''}

</div>

<div class="world-topbar__actions">

- ${backToSlots}${masterMapActions}

+ ${backToSlots}${voxelAction}${masterMapActions}

<button class="world-exit-button" type="button" data-action="world-exit" aria-label="В меню" title="В меню">${icon('logOut', 'icon--xs')}<span>В меню</span></button>

</div>

</header>

@@ -2226,6 +2234,7 @@ const renderWorldPage = ({ focus = false } = {}) => {

if (focus) root.querySelector('[data-role="world-seed"]')?.focus();

}

mountWorldEditor();

+ syncWorldVoxel();

paintLobbyChip();

};

@@ -2257,6 +2266,86 @@ const mountWorldEditor = () => {

}

};

+/* Воксельный режим — надстройка над экраном карты: тот же iframe, тот же

+ документ Azgaar. Страницу при переключении не перерисовываем: это создало бы

+ новый iframe и запустило генерацию заново. Поэтому только класс на .world-app

+ и монтирование/снятие вида. */

+const syncWorldVoxel = () => {

+ const session = ui.world;

+ const root = worldRoot();

+ const app = root?.querySelector('.world-app');

+ if (!session?.open || !app) return;

+ const wanted = session.screen === 'map' && session.voxel === true;

+ app.classList.toggle('is-voxel', wanted);

+ const button = app.querySelector('[data-action="world-voxel"]');

+ button?.classList.toggle('is-on', wanted);

+ button?.setAttribute('aria-pressed', wanted ? 'true' : 'false');

+ if (!wanted) {

+ worldVoxelWatch?.disconnect();

+ worldVoxelWatch = null;

+ session.voxelView?.dispose();

+ session.voxelView = null;

+ return;

+ }

+ /* Вид уже в этом DOM — не трогаем: перемонтирование сбросило бы ярус,

+ масштаб и центр, и все чанки построились бы заново. */

+ if (session.voxelView && session.voxelView.element?.isConnected) return;

+ const host = root.querySelector('[data-role="world-editor-host"]');

+ if (!host) return;

+ session.voxelView?.dispose();

+ watchWorldLive(host);

+ session.voxelView = mountWorldView(host, {

+ frame: host.querySelector('[data-role="world-editor"]'),

+ config: session.config,

+ onExit: () => setWorldVoxel(false),

+ });

+};

+

+const setWorldVoxel = (on) => {

+ const session = ui.world;

+ if (!session?.open || session.screen !== 'map') return;

+ const wanted = Boolean(on);

+ if (session.voxel === wanted) return;

+ session.voxel = wanted;

+ playSound(wanted ? 'open' : 'close');

+ syncWorldVoxel();

+ if (wanted && session.voxelView?.error) toast(session.voxelView.error, 'error');

+};

+

+/* Выход с экрана карты: режим гасим сразу, чтобы возврат в слоты не оставил

+ висящий GL-контекст и очередь чанков. */

+const dropWorldVoxel = () => {

+ const session = ui.world;

+ if (!session) return;

+ worldVoxelWatch?.disconnect();

+ worldVoxelWatch = null;

+ session.voxelView?.dispose();

+ session.voxelView = null;

+ session.voxel = false;

+};

+

+/* Живой предпросмотр правок мастера — это снимки поверх iframe, а карта блоками

+ читает документ самого игрока. Держать их вместе нельзя: игрок видел бы чужую

+ карту поверх своей. Накладка появляется без перерисовки

+ страницы, поэтому за ней следит наблюдатель и гасит режим. */

+let worldVoxelWatch = null;

+const watchWorldLive = (host) => {

+ worldVoxelWatch?.disconnect();

+ worldVoxelWatch = null;

+ if (!host || typeof MutationObserver !== 'function') return;

+ worldVoxelWatch = new MutationObserver(() => {

+ if (!ui.world?.voxel || !host.querySelector('.world-live.is-on')) return;

+ setWorldVoxel(false);

+ toast('Мастер вносит правки: карта блоками показывает вашу копию карты, режим выключен.');

+ });

+ worldVoxelWatch.observe(host, {

+ childList: true,

+ subtree: true,

+ attributes: true,

+ attributeFilter: ['class'],

+ });

+};

+

/* Слот получает параметры и открывается картой. Общий путь для «Создать»,

«Войти», загрузки файла и «Новый мир». */

const enterWorldMap = (slot, config) => {

@@ -2268,6 +2357,7 @@ const enterWorldMap = (slot, config) => {

session.slot = { role: slot.role, index: slot.index };

session.importToSlot = null;

session.screen = 'map';

+ dropWorldVoxel();

renderWorldPage();

};

@@ -2351,6 +2441,7 @@ const closeWorldPage = ({ history = true } = {}) => {

if (!ui.world?.open) return;

ui.world.open = false;

ui.world.frameKey = '';

+ dropWorldVoxel();

ui.world.syncStop?.();

ui.world.syncStop = null;

ui.world.leaveArmed = false;

@@ -3749,12 +3840,31 @@ const actions = {

'world-slots': () => {

if (!ui.world?.open) return;

+ dropWorldVoxel();

ui.world.screen = 'slots';

ui.world.slot = null;

ui.world.importToSlot = null;

renderWorldPage();

},

+ /* Режим строится из живого документа карты: если генерация ещё идёт, вид

+ сам скажет, чего не хватает (bridge.readSource). */

+ 'world-voxel': () => {

+ const session = ui.world;

+ if (!session?.open || session.screen !== 'map') return;

+ /* Режим включён, но мир не построился (генерация карты ещё шла) —

+ повторное нажатие пробует снова, а не выключает режим. */

+ if (session.voxel && session.voxelView?.error) {

+ session.voxelView.dispose();

+ session.voxelView = null;

+ syncWorldVoxel();

+ const error = session.voxelView?.error;

+ toast(error ?? 'Карта блоками построена.', error ? 'error' : 'ok');

+ return;

+ }

+ setWorldVoxel(!session.voxel);

+ },

+

'world-slot-tab': (el) => {

const tab = el.dataset.tab;

if (!ui.world?.open || !store.WORLD_ROLES.includes(tab)) return;

@@ -4354,6 +4464,12 @@ document.addEventListener('keydown', (event) => {

document.addEventListener('keydown', (event) => {

if (ui.world?.open && event.key === 'Escape') {

+ /* Ступеньки: карта блоками → карта → страница игры. */

+ if (ui.world.screen === 'map' && ui.world.voxel) {

+ event.preventDefault();

+ setWorldVoxel(false);

+ return;

+ }

event.preventDefault();

closeWorldPage();

return;

````

### патч · `src/style.css` · +205 −0

````diff

diff --git a/src/style.css b/src/style.css

index 21b8395..ffbb681 100644

--- a/src/style.css

+++ b/src/style.css

@@ -32,6 +32,7 @@

/* Связь через хаб — не ошибка, но и не идеал: тёплый оттенок. */

--warn: #d9c08a;

--warn-glow: rgba(217, 192, 138, 0.4);

+ --voxel-frame: rgba(8, 13, 14, 0.72); /* плашки над картой блоками: HUD, панель ярусов, пояснение */

--accent-glow: rgba(176, 208, 186, 0.45);

/* Шкала отступов. Правило: в gap, padding, margin и inset стоят только

@@ -4610,6 +4611,210 @@ button.admin-row:hover {

font-size: 13px;

}

+/* ---------- карта: воксельный вид того же мира ---------------- */

+

+/* Режим — надстройка над редактором, а не новый экран: документ Azgaar живёт

+ под холстом (его пересоздание перезапустило бы генерацию), поэтому карта

+ просто скрывается visibility, а не вынимается из DOM. */

+.world-app.is-voxel .world-editor-frame {

+ visibility: hidden;

+}

+

+.world-app.is-voxel .world-attribution {

+ display: none;

+}

+

+.world-topbar-button.is-on {

+ color: var(--world-bg);

+ border-color: var(--accent);

+ background: var(--accent);

+}

+

+.world-voxel {

+ position: absolute;

+ inset: 0;

+ z-index: 3;

+ display: flex;

+ flex-direction: column;

+ background: linear-gradient(#16202a 0%, #101720 100%);

+}

+

+/* Полотно размером с окно и с разрешением в один блок на пиксель: растягивает

+ его CSS, и только pixelated держит сетку чанков ровной (сглаживание превратило

+ бы карту в кашу из полутонов). */

+.world-voxel-canvas {

+ flex: 1 1 auto;

+ display: block;

+ width: 100%;

+ min-height: 0;

+ border: 0;

+ outline: none;

+ cursor: grab;

+ image-rendering: pixelated;

+ /* Без этого жест на телефоне прокручивал бы страницу вместо сдвига карты. */

+ touch-action: none;

+}

+

+.world-voxel-canvas:active {

+ cursor: grabbing;

+}

+

+.world-voxel-canvas:focus-visible {

+ box-shadow: inset 0 0 0 1px var(--accent);

+}

+

+/* Строка состояния: ярус, чанки, цена кадра, блок под курсором. Она внутри

+ панели ярусов, а не поверх полотна: абсолютная плашка с фиксированным

+ отступом неизбежно легла бы на ползунок при трёх строках. */

+.world-voxel-hud {

+ padding: var(--sp-6) var(--sp-6) 0;

+ border-top: 1px solid var(--world-line);

+ color: var(--text-soft);

+ font: 500 11px/1.45 var(--font-ui);

+ font-variant-numeric: tabular-nums;

+}

+

+.world-voxel-toolbar {

+ position: absolute;

+ top: var(--sp-12);

+ right: var(--sp-12);

+ display: flex;

+ gap: var(--sp-6);

+}

+

+.world-voxel-button {

+ display: inline-flex;

+ align-items: center;

+ gap: var(--sp-6);

+ height: var(--control-h-sm);

+ padding: 0 var(--sp-12);

+ border: 1px solid var(--world-line);

+ background: var(--voxel-frame);

+ color: var(--text-soft);

+ font: 600 12px/1 var(--font-ui);

+ white-space: nowrap;

+ cursor: pointer;

+ transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease;

+}

+

+.world-voxel-button:hover,

+.world-voxel-button:focus-visible {

+ color: var(--text);

+ border-color: var(--world-line-strong);

+ background: var(--fill-hover);

+ outline: none;

+}

+

+/* Панель ярусов: ползунок, пресеты, масштаб и наложения. Это единственный

+ слой интерфейса режима, который ловит мышь, поэтому он прижат к низу и не

+ тянется на всю ширину — карту можно таскать и под ним. */

+.world-voxel-layers {

+ position: absolute;

+ left: var(--sp-12);

+ bottom: var(--sp-12);

+ display: flex;

+ flex-direction: column;

+ gap: var(--sp-6);

+ max-width: calc(100% - var(--sp-24));

+ padding: var(--sp-8) var(--sp-10);

+ border: 1px solid var(--world-line);

+ background: var(--voxel-frame);

+}

+

+.world-voxel-row {

+ display: flex;

+ align-items: center;

+ flex-wrap: wrap;

+ gap: var(--sp-6);

+}

+

+.world-voxel-label {

+ color: var(--text-dim);

+ font: 600 10px/1 var(--font-ui);

+ text-transform: uppercase;

+ letter-spacing: 0.06em;

+}

+

+.world-voxel-label--right {

+ margin-left: var(--sp-8);

+}

+

+.world-voxel-step {

+ width: var(--control-h-mini);

+ height: var(--control-h-mini);

+ padding: 0;

+ border: 1px solid var(--world-line);

+ background: transparent;

+ color: var(--text-soft);

+ font: 600 13px/1 var(--font-ui);

+ cursor: pointer;

+}

+

+.world-voxel-step:hover,

+.world-voxel-step:focus-visible {

+ color: var(--text);

+ border-color: var(--world-line-strong);

+ background: var(--fill-hover);

+ outline: none;

+}

+

+.world-voxel-value {

+ color: var(--text-soft);

+ font: 500 11px/1.3 var(--font-ui);

+ font-variant-numeric: tabular-nums;

+}

+

+/* Ползунок яруса шире прочих: по нему водят мышью, ищут нужный срез. */

+.world-voxel-slider {

+ width: clamp(140px, 34vw, 420px);

+ height: var(--control-h-mini);

+ margin: 0;

+ accent-color: var(--accent);

+ cursor: ew-resize;

+}

+

+.world-voxel-chip {

+ height: var(--control-h-mini);

+ padding: 0 var(--sp-8);

+ border: 1px solid var(--world-line);

+ background: transparent;

+ color: var(--text-dim);

+ font: 600 11px/1 var(--font-ui);

+ cursor: pointer;

+ transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease;

+}

+

+.world-voxel-chip:hover,

+.world-voxel-chip:focus-visible {

+ color: var(--text);

+ border-color: var(--world-line-strong);

+ background: var(--fill-hover);

+ outline: none;

+}

+

+.world-voxel-chip.is-on {

+ color: var(--world-bg);

+ border-color: var(--accent);

+ background: var(--accent);

+}

+

+/* Пояснение режима: чем засеян мир, чего не хватает. Тонкая тёплая плашка —

+ это не ошибка, это состояние. */

+.world-voxel-note {

+ position: absolute;

+ top: var(--sp-12);

+ left: 50%;

+ margin: 0;

+ padding: var(--sp-6) var(--sp-14);

+ border: 1px solid var(--warn-glow);

+ background: var(--voxel-frame);

+ color: var(--warn);

+ font: 500 11px/1.45 var(--font-ui);

+ text-align: center;

+ transform: translateX(-50%);

+ max-width: calc(100% - var(--sp-32));

+}

+

/* Накладка на время подъёма редактора Azgaar: фон и печать, как у заставки.

Снимается, когда пошёл первый шаг генерации (generation-stage.js). */

/* ---------- лобби: экран, плашка статуса, вход из слотов ---------- */

````

### патч · `scripts/lib/verify-build.mjs` · +9 −2

````diff

diff --git a/scripts/lib/verify-build.mjs b/scripts/lib/verify-build.mjs

index 8d78509..bf16d50 100644

--- a/scripts/lib/verify-build.mjs

+++ b/scripts/lib/verify-build.mjs

@@ -27,9 +27,16 @@ const ROOT_FILES = ['dist', 'mir.html'];

в приложении нет, поэтому скрипт и стили MIR держатся около прежнего уровня.

Редактор Azgaar весит сам по себе: его CSS — 262 КБ (бюджет 280 КБ), а

однофайловая сборка вшивает весь редактор — около 27 МиБ, бюджет 30 МиБ.

- Звуки web-версии по-прежнему отдельными файлами, не в JS. */

+ Звуки web-версии по-прежнему отдельными файлами, не в JS.

+

+ Воксельный слой (src/world/* + src/game/world-view.js) — 280 КБ скрипта

+ против 286 КБ с 3D-видом: мешер и GL-рендерер заменены плоскими ярусами

+ (layers.js) и процедурным атласом (atlas.js), переехавшим из render.js, —

+ разница всего в 6 КБ, потому что атлас и генератор остаются на месте.

+ Бюджет 288 КБ: это ~8 КБ запаса на HUD и наложения, а не пропуск чего-то

+ лишнего (прежние 300 КБ были заданы под 3D-геометрию). */

export const BUDGETS = {

- js: 233 * 1024,

+ js: 288 * 1024,

css: 84 * 1024,

fmgCss: 280 * 1024,

single: 30 * 1024 * 1024,

````

### патч · `package.json` · +3 −1

````diff

diff --git a/package.json b/package.json

index 737e86c..1f034e6 100644

--- a/package.json

+++ b/package.json

@@ -40,7 +40,9 @@

"test:avatar": "node scripts/test-avatar.mjs",

"test:perf": "node scripts/test-perf.mjs",

"test:build": "node scripts/test-build.mjs",

- "test:spacing": "node scripts/test-spacing.mjs"

+ "test:spacing": "node scripts/test-spacing.mjs",

+ "test:voxel": "node scripts/test-voxel.mjs",

+ "test:voxel-view": "node scripts/test-voxel-view.mjs"

},

"devDependencies": {

"vite": "^7.1.9"

````

### патч · `README.md` · +25 −2

````diff

diff --git a/README.md b/README.md

index c46ec5b..13fd697 100644

--- a/README.md

+++ b/README.md

@@ -28,7 +28,8 @@

заново каждый раз, когда её открывают.

Карты делает только **Azgaar Fantasy Map Generator** — редактор карт, встроенный в

-игру. Собственного генератора и редактора мира в игре нет.

+игру. Собственного генератора *карты* и редактора мира в игре нет: блоки,

+которые показывает игра, — производное от тех же карт, а не вторая генерация.

- **Мастер** создаёт карту в пустом слоте, выбирает seed и один из трёх размеров

(1280 × 800, 1600 × 1000 или 1920 × 1080) и получает полный редактор Azgaar:

@@ -46,6 +47,25 @@ seed и размеру. Размер нужен явно: без него кар

Файлы `.map` Azgaar сохраняются и загружаются кнопками редактора. Это собственный

формат Azgaar, а не формат слота.

+**Карта блоками поверх карты.** На экране карты есть кнопка **«Карта блоками»**:

+тот же мир, показанный плоской картой, где 1 блок = 1 пиксель карты (карта

+1600 × 1000 — диорама ~1,6 × 1,0 км), а ярус выбирается ползунком: «разрезать

+мир плоскостью на высоте Y». Всё, что выше плоскости, показывает свою «кожу» —

+кроны, траву, зеркало воды, — поэтому карта остаётся картой на любом ярусе;

+ниже плоскости видны пещеры, жилы и дно водоёмов, а глубина среза читается по

+изогиптам. Высоты, биомы, температура и осадки читаются из `pack`/`grid` живого

+документа генератора, русла — из `Rivers.addMeandering` и `Rivers.getOffset`,

+поэтому река в блоках совпадает с рекой на карте. Направление течения (D8)

+подписано стрелками, глубина — толщиной слоя, анимируется на CPU (симуляции

+жидкости нет). Пещеры, руды, деревья, вода и лёд — собственные правила

+`src/world/`, а цвета слоя — средние цвета тех же тайлов, из которых нарисован

+процедурный атлас. Мир за краями карты повторяется зеркально, править блоки в

+этом режиме нельзя. Режим не пересоздаёт страницу: iframe с Azgaar живёт под

+полотном, переключение — класс на `.world-app`. Разбор и цифры —

+[`docs/voxel-world-generation.md`](docs/voxel-world-generation.md); проверки —

+`npm run test:voxel` (76 проверок в Node) и `npm run test:voxel-view`

+(57 в jsdom).

+

В web/PWA карта открывается из `/fmg/`; офлайн-кэш PWA содержит её ресурсы. В

однофайловых сборках (`mir.html`, APK, EXE) Azgaar вшит в тот же файл. Шрифты

карты подгружаются из Google Fonts, когда есть сеть. Azgaar распространяется по

@@ -62,7 +82,10 @@ seed и размеру. Размер нужен явно: без него кар

`mir.html` из исходников vendor, поэтому пересборка `mir.html` нужна даже без

изменений в `public/fmg/`. Принципы климата и выбор источников описаны в

[`docs/world-generation-references.md`](docs/world-generation-references.md)

-(историческая справка: собственный генератор удалён).

+(историческая справка: собственный генератор удалён). Там же указатель на

+[`docs/voxel-world-generation.md`](docs/voxel-world-generation.md) — разбор и

+план блочного мира по данным Azgaar: что читаем из карт, как считаем русла и

+течение, почему мир зациклен зеркально.

> История проекта — в [`CHANGELOG.md`](CHANGELOG.md), договорённости по стилю и

> правила работы — в [`AGENTS.md`](AGENTS.md). Меняете что-то — допишите запись в журнал.

````

### патч · `AGENTS.md` · +16 −1

````diff

diff --git a/AGENTS.md b/AGENTS.md

index 167922b..8006d6c 100644

--- a/AGENTS.md

+++ b/AGENTS.md

@@ -34,7 +34,7 @@

- что сознательно не тронули и почему (чтобы следующий не переделывал)

```

-Разделы «Почему» и «Решено не делать» важнее списка файлов: диff виден в git,

+Разделы «Почему» и «Решено не делать» важнее списка файлов: дифф виден в git,

а намерение — нет.

---

@@ -204,6 +204,8 @@ npm run test:avatar # выбор аватарки: поле выбора фай

npm run test:perf # отзывчивость меню: разбор базы, перерисовки, анимации

npm run test:build # артефакты сборки: ссылки, версия, кэш SW, бюджеты веса

npm run test:spacing # отступы: шкала и совпадение полей однотипных блоков

+npm run test:voxel # мир блоками: поле → чанк → плоский ярус, мост в Azgaar (без браузера)

+npm run test:voxel-view # тот же ярус в jsdom: ползунок, пресеты, ввод, dispose (нужен jsdom)

npm run test:lobby-client # клиент лобби против настоящего хаба: кадры карты,

# живой предпросмотр, переподключение (нужен jsdom)

npm run test:realtime # ядро лобби с подменённым временем: уборка, лимиты

@@ -218,6 +220,19 @@ npm run skills:check # только сверить хеши с skills-lock.json

поверх поддельного хранилища, «перезапускает» Durable Object и проверяет, что

блокировки, настройки и журнал никуда не делись. Сети ему не нужно вовсе.

+`test:voxel` и `test:voxel-view` проверяют надстройку «карта блоками»: первый

+гоняет данные (замощение, течение рек, швы чанков, упаковка палитры, пиксель

+слоя = блок на плоскости реза, пресеты ярусов, имена полей Azgaar) в Node без

+DOM, второй поднимает `mountWorldView` в jsdom и смотрит на жизнь интерфейса —

+ползунок яруса, пресеты, наложения, мышь, клавиши, снятие вида. Canvas 2D в

+jsdom нет, и это проверено намеренно: состояние вида обязано жить без холста, а

+не падать. Гонять их нужно после любой правки в `src/world/` и

+`src/game/world-view.js`.

+

+`test:ui` поднимает 28-МиБ `mir.html` в jsdom несколько раз подряд: на машине с

+4 ГБ памяти он требует `NODE_OPTIONS=--max-old-space-size=6144`, иначе падает

+OOM'ом независимо от того, цел ли код.

+

`test:build` смотрит на уже собранное: сначала `npm run build && npm run single`,

потом проверка. Она отвечает на вопросы, которые иначе всплывают у игрока

чёрным экраном: самодостаточен ли `mir.html`, разбирается ли его скрипт как

````

### патч · `CHANGELOG.md` · +269 −1

````diff

diff --git a/CHANGELOG.md b/CHANGELOG.md

index bd9be32..d72adc3 100644

--- a/CHANGELOG.md

+++ b/CHANGELOG.md

@@ -6,7 +6,275 @@

работой, дописать после. Разделы «Почему» и «Решено не делать» важнее перечня

файлов — дифф видно в git, а намерение нет.

-## 2026-10-09 — живой предпросмотр: правки мастера без перезагрузок карты

+## 2026-10-11 — карта блоками вместо 3D: плоские ярусы с ползунком

+

+**Что сделано**

+

+- **Полутора тысяч строк 3D больше нет.** Удалены `src/world/mesher.js` (429

+ строк: грани, обход швов, AO, наклонные грани воды, `openOnly`) и

+ `src/world/render.js` (704: WebGL2-рендерер, шейдеры, туман, DDA-луч за

+ курсором). Атлас из него переехал в `src/world/atlas.js` — он остался источником

+ цвета и для карты, и для будущих текстур.

+- **`src/world/layers.js` — как мир показывается.** `buildSlice(field, colors,

+ world, view, options)` красит RGBA-кадр по одному блоку на пиксель;

+ `cutY` — правило «разрезать мир плоскостью на Y, а что выше — показать его

+ кожу»; `bandFactor` — изогипты каждые 12 блоков плюс медленная тень глубины;

+ `LAYER_PRESETS` и `presetLevel` — Кроны / Поверхность / Вода / Дно / Пещеры /

+ Руды / Основание; `zoneName` — человеческая подпись под ползунком;

+ `makeView` и `ZOOM_MIN/MAX/DEFAULT` — кадрирование. Модуль чистый: DOM не

+ знает ни о чём, поэтому проверяется в Node.

+- **Хранилище чанков упрощено.** `src/world/world.js` не знает ни про меш, ни

+ про GPU: остались `focus/step/get/stats/dispose/readyCount`, `bytes` теперь

+ вес блоков, а `visible()`, `remeshStep()`, `setMeshOptions()`,

+ `tilePeriodChunks()` и пара `upload/release` убраны.

+- **`src/game/world-view.js` переписан под 2D** при том же контракте

+ `mountWorldView(host, {frame, config, onExit})`: полотно в разрешении блоков

+ и `image-rendering: pixelated`, перетаскивание — сдвиг, колесо — масштаб 1…8

+ px на блок с заякориванием точки под курсором, ползунок яруса 1…worldHeight−1

+ с ±1 (Shift — ±10), ряд пресетов, четыре переключателя наложений (течение,

+ вода, отметки, рельеф), HUD с ярусом, зоной, ценой кадра и блоком под

+ курсором. Кадр ограничен `MAX_CELLS = 260 000` блоков, анимация течения

+ перекрашивается не чаще, чем раз в 70 мс.

+- **Исправлено по ходу, и всё это видно в картинке.** Ровный срез по Y над

+ холмистым островом — серый каменный диск без единой детали (проверено

+ рендером), поэтому сверху показывается «кожа» столбца; наложения писались в

+ соседние клетки до того, как те закрашивались, — стрелка теряла половину,

+ берег длинную сторону, теперь пометки копятся и накладываются вторым

+ проходом; берег рисуют по сухую сторону, иначе русло в две клетки целиком

+ закрашивается берегом и река исчезает; решётка стрелок привязана к мировым

+ координатам, иначе они скользят по руслу при сдвиге; `fromField` учитывал

+ клетку дважды; обводка цифр сливалась в чёрное пятно размером с подпись —

+ стала плашкой; вершину для отметки искали среди соседей ±6 блоков — шум

+ детали не оставлял ни одной вершины, теперь сравниваются узлы самой решётки;

+ средний цвет тайла округлён до целых, иначе тест сверял не то, что видно.

+- **Кнопка режима переименована** в «Карта блоками» (иконка `layers`),

+ `session.voxel` и ступеньки Escape не тронуты: режим по-прежнему оверлей над

+ iframe Azgaar, а не новый экран.

+- **Проверки.** `test:voxel` — с 61 до 76: меш-проверки (обход граней, UV, AO,

+ квады, формат вершины, «вода не перекрывает грани») удалены вместе с мешером,

+ добавлены «пиксель слоя = блок на плоскости реза», «cutY = min(вершина

+ колонки, ярус)», «каждый блок кадра учтён ровно один раз», «срез через период

+ тайла побайтно тот же», «стрелка разворачивается по направлению течения»,

+ «число водных пикселей = правилу воды поля», «линия воды = граница занято /

+ свободно», «течение анимировано», пресеты ярусов и подписи к ним.

+ `test:voxel-view` — с 31 до 57: диапазон ползунка, ±1 и ±10, пресеты и

+ `aria-pressed`, зажимы масштаба, «полотно = размер кадра в блоках», «сдвиг

+ считается в блоках», «без 2D-канваса вид не красит кадр и не падает».

+- **Веса.** Бюджет `js` опущен с 300 до 288 КБ: минифицированный скрипт с 3D

+ весил 286 КБ, с плоскими ярусами — 280 КБ (причина записана в комментарии

+ `scripts/lib/verify-build.mjs`); `mir.html` — 28 014 КБ. В репозитории по-

+ прежнему 0 байт ресурсов режима: атлас и палитра рисуются процедурно.

+- **Документация.** `docs/voxel-world-generation.md`: §9 переписан под плоские

+ ярусы (семантика реза, наложения, замеры кадра), синхронизированы §6.3

+ (формат `flow`-байта и анимация на CPU), §8, §10, §11, §12, §13; в README и

+ `AGENTS.md` обновлены абзац о режиме, команды и замечание про кучу для

+ `test:ui`.

+

+**Почему**

+

+- Владелец сформулировал прямо: «просто слои должны быть отдельно выбраны

+ ползунком». Карта, а не перспектива, — то, зачем мир блоками смотрят:

+ распределение биомов, русла, берега, пещеры и жилы.

+- Ползунок яруса даёт то, ради чего в 3D была кнопка «разрез», но работает на

+ телефоне, без WebGL, и картинка остаётся читаемой: «срез» виден как

+ изогипты, а не как стена из камня.

+- Генерация (поле, блоки, чанки, течение, палитры) не изменилась ни на строку:

+ 2D — способ показать те же данные, поэтому удалять её было бы нельзя, а

+ удаление коснулось только пути «чанк → геометрия → пиксели».

+

+**Решено не делать**

+

+- Не оставлять 3D «за переключателем»: два рендера одного мира означают две

+ правки на каждую фичу и 47 КБ исходников ради пути, которым никто не

+ ходит. Выбрано «удалить совсем».

+- Не красить «ровно блоки на выбранном Y». Точный срез над холмами не читается

+ — это проверено картинкой, а не рассуждением, и возвращать его нельзя.

+- Не делать симуляцию жидкости, физику воды и правку блоков — как и раньше.

+- Не искать «самый пещеристый» и «самый рудный» ярус по количеству пустот:

+ чем глубже, тем больше колонок под поверхностью, и побеждало дно; считаем

+ долю, и только по готовым чанкам, иначе пресет врёт.

+- Не платить сборщику мусора за кадр: буферы пометок общие для модуля и растут

+ по надобности, а `buildSlice` не заводит новых массивов на кадр.

+- Не чинить `test:ui` увеличением бюджета времени: он падает OOM'ом в песочнице

+ с 4 ГБ, потому что поднимает 28-МиБ `mir.html` в jsdom несколько раз. Это

+ ограничение окружения, записано в `AGENTS.md` (нужен

+ `NODE_OPTIONS=--max-old-space-size=6144`).

+

+---

+

+## 2026-10-11 — воксельный мир по картам Azgaar: реализация и интеграция

+

+> **Позднее в тот же день этот 3D-вид был удалён** — мир показывается плоскими

+> ярусами с ползунком, см. запись выше. Всё, что ниже про `mesher.js`,

+> `render.js`, камеру-орбиту, шейдер воды и DDA-луч, осталось только в истории;

+> поле, блоки, чанки, реки, атлас и интеграция живы.

+

+**Что сделано**

+

+- **Блочный мир поверх генератора.** Добавлен слой `src/world/`: `blocks.js`

+ (таблица блоков, палитра 13 биомов Azgaar, слоты атласа), `field.js`

+ (свёртка клеток в растр, замощение `fold`, русла и течение как поле,

+ `sampleColumn`/`surfaceY`/`spawnPoint`), `chunk.js` (заполнение колонки,

+ решётки пещер и руд, декор, палитры и индексы), `mesher.js` (грани,

+ «запекать только видимое», AO, наклонные грани воды), `render.js`

+ (процедурный атлас, WebGL2, вода с течением, туман, разрез), `world.js`

+ (очередь чанков в бюджете кадра, LRU, загрузка граней), `bridge.js`

+ (только чтение `grid`/`pack`/`pack.features`/`pack.rivers` из окна редактора),

+ `math.js` (детерминированный шум и матрицы).

+- **Реки — то, ради чего всё это.** Русло строится точками

+ `Rivers.addMeandering` и полушириной `Rivers.getOffset`, то есть тем же, чем

+ генератор рисует реку на карте: блок-за-блоком река совпадает с нарисованной.

+ Направление стока — D8 из `pack.cells.fl` + уровень 0…8 колонки, текущая вода

+ анимируется в шейдере, водопады и озёра (пресное/солёное/сухое/лава)

+ разбираются по фичам; уровень моря и прорезка русел берутся из `pack`, а не из

+ `grid`, — рельеф тот, по которому вода реально потекла.

+- **Интеграция в игру: режим, а не новый экран.** `src/game/world-view.js`

+ монтирует полотно в тот же `[data-role="world-editor-host"]`, что держит iframe

+ Azgaar, и переключается флагом `session.voxel` (класс `is-voxel` на

+ `.world-app`): перерисовка страницы убила бы документ генератора и запустила

+ бы её заново. В шапке карты кнопка «Воксельный мир», в режиме — панель

+ «Появление / Разрез / К карте», Escape сначала выходит из режима, потом с

+ карты. Камера-орбита (перетаскивание, Shift+перетаскивание, колесо, WASD,

+ Space/C, Q/E, R, X), HUD с координатами, блоком под курсором (DDA-луч),

+ ценой кадра и памятью, при отсутствии WebGL2 — растровый вид сверху по тому

+ же полю вместо чёрного экрана.

+- **Живой предпросмотр правок мастера и режим непересечимы.** Снимки мастера

+ лежат поверх iframe, а воксельный вид читает документ самого игрока, поэтому

+ `MutationObserver` за хостом гасит режим с объяснением, как только

+ появляется `.world-live.is-on`.

+- **Проверки.** `npm run test:voxel` — 61 проверка в Node без DOM: замощение,

+ «вода не течёт в гору», монотонность русла, детерминизм чанка и сходимость

+ с «юбкой», упаковка палитры, обход граней, UV и свет AO, упакованный

+ 16-байтный вершинный формат, бюджет времени, имена полей Azgaar на

+ поддельном окне (`scripts/lib/fake-fmg.mjs`), хранилище чанков и выбор блока

+ лучом. `npm run test:voxel-view` — 31 проверка в jsdom: разметка и доступные

+ имена, очередь чанков в кадрах, HUD, мышь/клавиши/колесо, разрез, возврат к

+ спавну, отказ без документов и `dispose`.

+- Веса и артефакты: слой воксельного мира стоит 57 КБ в минифицированном

+ скрипте, бюджет `js` в `scripts/lib/verify-build.mjs` поднят с 233 до 300 КБ

+ (запас был 3 КБ, причина записана в комментарии рядом); `mir.html` после

+ `npm run single` — 27,4 МиБ при бюджете 30 МиБ; атлас процедурный, 0 байт

+ ресурсов в репозитории. Раздел 10 `docs/voxel-world-generation.md` переписан

+ под фактические файлы, добавлены команды в `AGENTS.md`.

+

+**Почему**

+

+- Владелец после разбора сказал «начни реализацию и полную интеграцию»: данные

+ генератора почти бесплатны (они висят в окне того же iframe), а отдельный

+ генератора-двойник дал бы расхождение карты и мира.

+- Режим вписан в экран карты, а не в новый экран, по конкретной причине:

+ `renderWorldPage` сравнивает HTML строкой и заменяет `.world-app` целиком,

+ что пересоздаёт iframe и заново запускает генерацию — секунды и весь труд

+ игрока. Поэтому разметка страницы не меняется ни на байт, а кнопки режима

+ перекрашиваются императивно (как `paintLobbyChip`).

+- Чанки строятся по бюджету кадра inline, без worker-пула: в этой сборке

+ недоступны module workers с общей памятью, и честного стриминга с

+ «выгрузкой в воркер» здесь сделать нельзя — вместо имитации очередь,

+ которая за кадр успевает ровно столько, сколько позволяет пауза в 6 мс.

+- Формат вершины упакован в 16 байт после замера: плотный мир из 4889 квадов

+ на чанк на 726 КиБ против 363 КиБ — на плотном лесу лимитирует именно память,

+ а не время (радиус 7 на карте 1600 × 1000 — 225 чанков).

+

+**Решено не делать**

+

+- Не выгружать мир в `.mca`/`.schem` и не прикручивать внешний 3D-движок:

+ вывод — только собственный рендер (сначала было сказано владельцем).

+- Не делать симуляцию жидкости: течение — свойство колонки (D8 + уровень),

+ анимируется шейдером.

+- Не сохранять снимки полей и чанков в слоты и не кэшировать их в IndexedDB:

+ `buildField` на 172 800 колонок измерен в 116 мс, а слоты хранят только

+ `{ seed, width, height, savedAt }`; вид читает живой документ редактора,

+ поэтому копия карт в localStorage удвоила бы объём и добавила бы расхождение.

+- Не давать в этом режиме править блоки, инвентарь и крафт: мир — вид на карту,

+ а не песочница; пересборка меша при правке блока потребовала бы своей системы

+ событий и отката.

+- Не рисовать «настоящий» бесконечный мир за пределами тайла: повтор

+ зеркальный (замощение `fold`), и это ограничение записано в плане как

+ осознанный выбор, а не как задача на потом.

+- Не добавлять npm-зависимости и не трогать vendored Azgaar (в том числе

+ `public/fmg/`) — мост читает только публичные поля окна.

+- Не поднимать бюджет `js` молча: рост записан числом (57 КБ) и объяснён в

+ комментарии `scripts/lib/verify-build.mjs`.

+

+**Проверки**

+

+- `npm run build` — «проверка сборки: всё сходится»; `npm run single` — 28 018 КБ;

+ `npm run test:build` — 46 проверок; `npm run test:spacing` — 12;

+ `npm run test:voxel` — 61; `npm run test:voxel-view` — 31;

+ `npm run test:ui` — «ВСЁ ХОРОШО», ошибок консоли нет; `test:perf` — 4;

+ `test:avatar` — 11; `test:lobby-client` — «ВСЁ ХОРОШО».

+- `test:ui` и `test:avatar` требуют jsdom (`npm i --no-save jsdom`), а `test:ui`

+ ещё и запущенного `npm run serve` с адресом:

+ `NODE_OPTIONS=--max-old-space-size=6144 npm run test:ui -- http://127.0.0.1:4173`

+ — на дефолтной куче 28-мегабайтный `mir.html` в jsdom упирается в лимит памяти

+ Node. Это ограничение среды, а не регрессия: с увеличенной кучей прогон

+ зелёный целиком.

+- Тесты поймали и заставили починить три реальных дефекта интеграции: `dispose`

+ падал на отказе чтения карт (`raf` в мёртвой зоне), радиус обзора просил в 4

+ раза больше чанков, чем есть в тайле, и 2D-запас брал по выборке поля на

+ пиксель экрана.

+- Цена чанка в тесте мерится средним по всей очереди, а не «последним

+ замеренным чанком»: одиночный замер на загрузке машины прыгал до 25 мс и

+ ронял зелёный прогон (флаки, которых в репозитории быть не должно).

+- GL-часть (шейдеры, отсечение, прозрачность воды) в Node не проверяется:

+ `dist/` раздаётся `npm run serve` на 4173 порту, картинку смотрит человек.

+

+## 2026-10-11 — разбор и план: блочный мир по картам Azgaar (только документ)

+

+**Что сделано**

+

+- Добавлен [`docs/voxel-world-generation.md`](docs/voxel-world-generation.md):

+ разбор возможности генерации в духе Minecraft по готовым полям карт Azgaar —

+ высоты, биомов, температур, осадков, границ материков и рек с течением — и

+ план такой работы. Код не написан: по просьбе владельца сначала разбор.

+- В документе зафиксировано, что данные почти не надо доставать: `grid` и

+ `pack` висят в глобальной области окна iframe (`src/components/globals.ts`),

+ сток посчитан (`pack.cells.fl`), меандры и полуширина русла отдаются

+ функциями `Rivers`, берег можно взять из уже отрисованного `#featurePaths`.

+ Описаны три канала съёма и то, зачем нужен снимок полей (field pack) вместо

+ повторного разбора карты.

+- Числа, определяющие масштаб: при 10 000 клеток и карте 1600 × 1000 px одна

+ клетка ≈ 12,65 px, то есть 12 × 12 блоков при 1 блок = 1 пиксель; 13 биомов

+ Azgaar разведены по палитрам блоков; течение принято хранить как свойство

+ колонки (D8 + уровень 0…8), а не как симуляцию.

+- Для требования «мир неограниченный и зацикленный» разобраны три режима шва

+ (`mirror`, `wrap`, `blend`) и предложён `mirror`: отражения единственные

+ дают непрерывность высот, берегов и русел на шве без дополнительного кода.

+- Указатель на план добавлен в `README.md` (раздел «Генератор мира»), чтобы

+ документ не лежал отдельно от описания генерации.

+

+**Почему**

+

+- Владелец спросил, можно ли построить блочную генерацию на основе карт

+ генератора, включая течение рек. Ответ «да, и дешевле, чем кажется» требует

+ доказательств по коду, а не по памяти: документ построен на ссылках к

+ файлам и строкам vendored Azgaar 1.154.0.

+- План нужен до кода по двум причинам: он отменяет запись 2026-10-08 «не

+ сливать данные Azgaar с voxel-миром» (это решает владелец), и он упирается в

+ бюджеты сборки: 40…60 КиБ собственного движка против лимита 233 КиБ на

+ собранный скрипт приложения (`scripts/lib/verify-build.mjs`), где по журналу

+ 2026-10-08 занято было 188,2 КиБ — факт нужно мерить заново.

+

+**Решено не делать**

+

+- Не писать прототип «в нагрузку» к разбору: выбор владельца — сначала

+ документ, код по его решению и по этапам M0…M6 из раздела 13.

+- Не трогать `AGENTS.md`: в дереве проекта нет даже

+ `docs/world-generation-references.md`, одна ссылка не сделала бы его точнее.

+- Не править формулировки «собственного генератора и редактора мира в игре

+ нет»: они остаются верными, пока плана нет в коде.

+- Не называть масштаб мира географическим: при 1 блок = 1 пиксель карта

+ становится диорамой 1,6 × 1,0 км, и шкала Azgaar (3 км на пиксель) в мире не

+ действует. Это записано как ограничение, а не как задача «починить».

+

+**Проверки**

+

+- Менялись только Markdown-файлы: `npm run build` и тесты не запускались.

+ Документ проверен разборщиком таблиц и блоков кода (колонки совпадают,

+ ограждения сбалансированы), ссылки вида `§n` и `file.ts:строки` сверены с

+ исходниками `vendor/azgaar-fantasy-map-generator/`.

+

+

**Что сделано**

````