# Источники генератора мира

> **Текущее устройство.** Собственный основной генератор MIR удалён.
> Рабочая карта временно открывается в Azgaar, дополнительная планетарная
> модель (`src/planet/`) сохранена. Подбор нового движка и разбор присланных
> репозиториев — [continent-research.md](continent-research.md).

Ниже — источники существующей планетарной модели: тектоника, эрозия,
атмосфера, океан, осадки и биомы. У планеты может быть источником географии
Azgaar. Источники не означают реконструкцию настоящей Земли: растр Кёппена,
границы плит и топография Земли в приложении не используются.

## Генераторы рельефа, климата и биомов: полные конвейеры и отдельные механизмы

Источники этого раздела собраны для переработки `src/planet/` (см.
[`docs/planet-physics.md`](planet-physics.md)): у каждого механизма модели есть
прототип или опубликованное описание. Репозитории — не зависимости: ничего не
копируется и не подключается, взят **подход** и проверены числа.

### Тектоника и охлаждение дна

- [`raguilar011095/planet_heightmap_generation`](https://github.com/raguilar011095/planet_heightmap_generation) — ближайший полный конвейер: сфера Фибоначчи и Вороной, «farthest-point» семена плит, доменное искажение, затем ледниковая, водная и тепловая эрозия, сезонные ветры с ITCZ и Кориолисом, круговороты, осадки переносом с орографией, Кёппен и набор настраиваемых проверок, сравнивающих модельный Кёппен с земным.
- [`kgsherman/tectonics`](https://github.com/kgsherman/tectonics) — плиты сохраняют собственную систему отсчёта (кватернион накапливается), поэтому движение твёрдое, без размывания; климат: баротропные течения Стоммела, дрейф Экмана, апвеллинг у берегов и экватора, полулагранжева адвекция температуры, Кёппен — Гейгер после Beck et al. (2018) с проверкой по 80 городам.
- [tectonics.js, заметка 2017-09-16](https://davidson16807.github.io/tectonics.js/) — остывание коры → плотность → погружение; геофизическая рамка вместо случайных скоростей плит.
- [`OpenLyceum/PlateTectonics`](https://github.com/OpenLyceum/PlateTectonics); [Seton et al., 2020, *G-Cubed*](https://doi.org/10.1029/2020GC009214); [TracTec: возрастные сетки дна (arXiv:1910.03351)](https://arxiv.org/pdf/1910.03351) — связь возраста океанского дна с глубиной и изохронами; полупространственная модель охлаждения (Parsons & Sclater, 1977), GDH1 и Stein & Stein (1992).

### Гипсометрия и уровень моря

- Bird, 2003 (PB2002) — границы плит; NOAA ETOPO/DEM, USGS, Global Volcanism Program — эталоны гипсометрии, к которым подгонялись доли площадей и глубины.
- Azgaar Fantasy Map Generator (`vendored`) — шкала высот 0…100, уровень моря 20, палитра и пригодность биомов; взяты как контракт совместимости.

### Эрозия и перенос осадков

- [FastScape, документация моделей](https://fastscape.readthedocs.io/en/latest/models.html) — эталонная постановка: базовое поднятие, врезание по степенному закону, диффузия склонов, D8 по обновлённой поверхности, неявный метод Гаусса — Зейделя; `sediment_model` разделяет коренную породу и осадки.
- Braun & Willett, 2013, *Geomorphology* 180–179:170 — неявная степенная эрозия и её устойчивость.
- Cordonnier et al., 2016, *CGF* [10.1111/cgf.12820](https://doi.org/10.1111/cgf.12820); ACM TOG 2023 [10.1145/3592787](https://doi.org/10.1145/3592787) и [`H-Schott/StreamPowerErosion`](https://github.com/H-Schott/StreamPowerErosion) — большие шаги времени в степенной эрозии.
- [`daveaddams91-dev/terrain-erosion-engine`](https://github.com/daveaddams91-dev/terrain-erosion-engine), [`karhu/terrain-erosion`](https://github.com/karhu/terrain-erosion), [`konaeAkira/erosion-sim`](https://github.com/konaeAkira/erosion-sim), [jobtalle, «Simulating hydraulic erosion»](https://jobtalle.com/simulating_hydraulic_erosion.html) — практические реализации и калибровки.
- [`Guy-Shalev/terrain-generator`](https://github.com/Guy-Shalev/terrain-generator) — порядок стадий (плиты → рельеф → цепочки горячих точек → гребневый шум → берега → осадки → эрозия → климат → озёра → биомы), которому следует конвейер `src/planet/`.
- [`Hafting/tergen`](https://github.com/Hafting/tergen) (Freeciv) — движение плит по ходам, погода и сток, влияющий на эрозию.

### Климат, осадки, биомы

- [`Mindwerks/worldengine`](https://github.com/Mindwerks/worldengine) и [`dpaulat/worldengine-cpp`](https://github.com/dpaulat/worldengine-cpp) — фазы: плиты → шум → осадки (широта и дождевая тень) → эрозия → гидрология → влажность → биом по **зонам жизни Холдриджа**; в документации прямо сказано, что Кёппену нужны сезоны, которых у годовых средних нет — отсюда в модели два сезона и две классификации.
- [Holdridge life zones (worldengine docs)](https://worldengine.readthedocs.io/en/latest/biomes.html) — биотемпература (месяцы < 0 °C и > 30 °C считаются нулём), отношение PET, пояса 24/18/12/6/3/1,5 °C, 36 ячеек и эктоны по расстоянию.
- [Amit Patel, «Mapgen4: rainfall»](https://simblob.blogspot.com/2018/09/mapgen4-rainfall.html) — испарять из воды, влагу несёт ветер, ёмкость падает с высотой, излишек выпадает; обход клеток по `cos θ·x + sin θ·y` — прямая параллель с обходом «против ветра» в `precip.js`.
- [Azgaar, «Biomes generation and rendering»](https://azgaar.wordpress.com/2017/06/30/biomes-generation-and-rendering/) — матрица «температура × осадки» (использована как слой совместимости).
- Hargreaves & Samani, 1985 — испаряемость `PET = 0,408·0,0023·Ra·(T + 17,8)·√ΔT`; FAO-56 — справочник по ET₀ и множителю скрытой теплоты.
- Lieth, 1975 — модель продуктивности Майами (`NPP` как минимум тепловой и водной кривых).
- Beck et al., 2018, *Scientific Data* 5:180214 — критерии Кёппена — Гейгера и пороги сухости; используется как алгоритм классификации, а не как растр Земли.

### Обзорные репозитории

- [`FreezeDriedMangos/realistic-planet-generation-and-simulation`](https://github.com/FreezeDriedMangos/realistic-planet-generation-and-simulation), [`dunkean/neural-earth`](https://github.com/dunkean/neural-earth), [`MzIbang/Hyang`](https://github.com/MzIbang/Hyang), [`MightyBOBcnc/nixis`](https://github.com/MightyBOBcnc/nixis), [`ctkrug/erosion`](https://github.com/ctkrug/erosion), [`TheDatawiz-dot/Worldsmith`](https://github.com/TheDatawiz-dot/Worldsmith) — обзоры подходов и частные механизмы (климат по широте и влаге, эрозия по потоку, биомы по теплу и воде).

## Процедурная картография

- [Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator) — временная рабочая карта после удаления собственного генератора. В репозитории сохранены исходники, ресурсы и MIT-лицензия; локальная адаптация описана в [`vendor/azgaar-fantasy-map-generator/MIR-INTEGRATION.md`](../vendor/azgaar-fantasy-map-generator/MIR-INTEGRATION.md). Географию Azgaar может читать отдельный вид планеты.
- [Martin O'Leary, “Generating fantasy maps”](https://mewo2.com/notes/terrain/) — практические заметки о генерации высот, берегов и речных сетей; этот материал также указан как источник вдохновения в README Azgaar.
- [Amit Patel, “Polygonal Map Generation for Games”](http://www-cs-students.stanford.edu/~amitp/game-programming/polygon-map-generation) — связность ячеек, высотные поля, реки и климатические признаки для игровых карт; также процитирован upstream-проектом.

## Климат и биомы

- H. E. Beck et al. (2018), [“Present and future Köppen-Geiger climate classification maps at 1-km resolution”](https://doi.org/10.1038/sdata.2018.214), *Scientific Data* 5, 180214. Исследование классифицирует климат по сезонным температуре и осадкам, использует несколько климатических наборов и обсуждает связь климатических типов с растительностью; статья и данные опубликованы по CC BY.

### Как эти данные применены в The civilization of the sages

- Встроенный Azgaar поставляется с собственными режимами генерации,
  картографическими стилями, слоями и средствами ручного редактирования.
  Игра не меняет формат его карты и сохраняет
  экспорт upstream. Отдельный вид планеты может читать снимок этой географии.
- Модель планеты (`src/planet/`) самостоятельна: она использует снимок Azgaar,
  когда редактор уже построил карту, и процедурную основу, если снимка нет.
  Её тектоника и климат не заменяют удалённый основной генератор.
- Публичный Köppen-Geiger растр не включён в приложение: он описывает Землю, а
  игровой мир имеет произвольные seed, континенты и климат. Такое наложение
  создало бы ложную точность; вместо него использованы только общие принципы
  температурно-влажностной классификации.
- Панорамирование, масштабирование и клавиши направления дают привычную
  навигацию по карте; проверки измеряют pan/zoom и границы мира, но не
  претендуют на сравнительное исследование жанра.
