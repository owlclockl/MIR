# XaeroPlus и поиск исходников самого World Map

Проверка 2026-10-14 по прямому запросу перенести весь исходный код.

## 1. Присланный XaeroPlus — настоящий MIT-проект

https://github.com/rfresh2/XaeroPlus, default branch `1.20.1`, проверенная
ревизия `18eac052d8ab6c7885976a0ff3fd215de857f6bd`, версия 2.37.0.

Полный снимок **345 отслеживаемых файлов**, 274 из них Java, перенесён
без изменений в `vendor/xaeroplus/upstream/`. SHA-256 и список всех путей —
`vendor/xaeroplus/upstream-manifest.json`. Это не ссылка на внешний сабмодуль
и не урезанная выборка. Сборочные файлы, ресурсы и шейдеры тоже сохранены.

MIT даёт право переноса при сохранении уведомления. Лицензия сохранена и
в исходниках, и в работающем браузерном интерфейсе. Описание адаптации:
[vendor/xaeroplus/SAGES-INTEGRATION.md](../vendor/xaeroplus/SAGES-INTEGRATION.md).

## 2. Это не исходники World Map

README XaeroPlus: «client-side Minecraft mod that **depends on and modifies**
the Xaero's WorldMap and Minimap mods». README также требует три отдельных JAR.

`common/build.gradle.kts` отдельно объявляет World Map, Minimap и XaeroLib.
`settings.gradle.kts` задаёт зависимости `maven.modrinth:xaeros-world-map`,
`maven.modrinth:xaeros-minimap`, `xaero.lib:xaerolib-*` и мод-лоадеры.
Проверенная версия: Minecraft 1.20.1, World Map 1.47.0, Minimap 26.6.0,
XaeroLib 1.7.3. Core-движка World Map в коде XaeroPlus нет.

Скопировать Java-классы в Vite — не значит исполнить Minecraft, OpenGL,
миксины, блоки/чанки, Java-библиотеки и Fabric/Forge в браузере.
Ни один из этих компонентов не выдаётся за работающий в The civilization of the sages.

## 3. Что найдено по самому World Map

- Поиск GitHub по имени дал `lawjack000/XaeroWorldMap`: это снова каталоги
  готовой карты (`Multiplayer_*`), не исходники движка.
- Найден
  [неофициальный репозиторий с пометкой deobf, World Map 1.40.2 / Forge 1.12](https://github.com/MayorovGandon/XaerosWorldMap_1.40.2_Forge_1.12-deobf).
  Его дерево `51ec9f68d94a6180e68cb01f96513da07f408f7e` не усечено и содержит
  259 Java-файлов, в том числе `xaero/map/MapWriter.java`. Это найденное
  представление кода основного мода, а не только карта или плагин.
  Но это **не подтверждённая авторская публикация**, и лицензии/NOTICE/COPYING
  в дереве нет; GitHub licenseInfo — null. MIT-лицензия XaeroPlus на этот
  отдельный код не распространяется. Репозиторий не копировался в The civilization of the sages,
  исполняемые файлы из него не скачивались.
- Официальный исходный репозиторий World Map с подтверждёнными условиями
  полного переноса по итогам этой проверки **не установлен**. Это результат
  конкретного поиска, не утверждение, что такого исходника нигде не существует.
  Поиск GitHub Code не является исчерпывающим: он не выдал MapWriter.java
  даже для найденного deobf-дерева.

## 4. Что действительно используется в The civilization of the sages

На основе MIT-кода сделан браузерный картографический порт, не очередной только
визуальный пресет: Line/Ellipse, ColorHelper, Drawing.snap, RegionGrid,
MapArtGrid и DrawOrderHelper. После уточнения пользователь выбрал все
картографические функции в браузере The civilization of the sages, а не Minecraft-мост/новый блочный мир.
В поверхности работают все шесть режимов рисования, правка и история объектов,
порядок/видимость слоёв, сетки, миникарта, JSON/GeoJSON и PNG, личные настройки.
Управление и ограничения файлов — [surface-map.md](surface-map.md).
Canvas/хранилище/обработка ввода — новый адаптер для The civilization of the sages, не оригинальные
OpenGL/SQLite подсистемы. Все эти границы записаны в таблице интеграции.

**Полного работающего порта всего XaeroPlus или самого World Map нет.**
Остальные Java-файлы скопированы в точности, но не запускаются браузером.
Для полного переноса нужны подтверждённые исходники и права на базовый мод,
а затем отдельный большой перенос его зависимостей и игровых данных.
Текущий генератор Azgaar и профиль земного масштаба сохранены; удалённый
движок The civilization of the sages не восстанавливался.
