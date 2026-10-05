/* Корень проекта для скриптов из scripts/ и server/.

   Скрипты читают и пишут пути относительно корня (`dist`, `mir.html`,
   `data/mir-hub.json`), а запускать их могут откуда угодно: из npm, из
   батника, двойным кликом. Поэтому при импорте этого модуля рабочий
   каталог один раз переводится в корень репозитория — дальше все
   относительные пути в сборщиках и сервере значат одно и то же. */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Абсолютный путь к корню проекта. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Путь внутри проекта: fromRoot('dist', 'index.html'). */
export const fromRoot = (...parts) => resolve(ROOT, ...parts);

if (process.cwd() !== ROOT) process.chdir(ROOT);
