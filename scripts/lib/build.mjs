/* Сборка проекта: одна точка входа для всех форматов.

   Раньше каждый сборщик (.exe, .apk, mir.html) сам вызывал Vite и сам же
   переписывал готовый HTML — отсюда и расхождения между версиями. Теперь
   сборок ровно две, и обе живут здесь:

     buildWeb()        — dist/ для сервера, хаба, установщика и хостинга;
     buildSingleHtml() — mir.html: самодостаточный файл для file:// и .apk.

   Логику встраивания и подстановки версии делают плагины из
   scripts/lib/vite-mir.mjs, здесь — только запуск и проверка результата. */

import { writeFileSync } from 'node:fs';
import { build as viteBuild } from 'vite';
import './root.mjs';
import { singleFileHtml } from './vite-mir.mjs';

/**
 * Веб-сборка в dist/. Возвращает список файлов сборки.
 * @param {{ logLevel?: string }} [options]
 */
export async function buildWeb({ logLevel = 'warn' } = {}) {
  /* Режим ровно тот же, что у `npm run build`: от него зависит значение
     import.meta.env.MODE внутри бандла. Разные режимы давали разные файлы
     при одном и том же коде — и лишнюю пересборку у игроков. */
  const result = await viteBuild({ mode: 'production', logLevel });
  const output = Array.isArray(result) ? result.flatMap((item) => item.output ?? []) : result.output ?? [];
  return output;
}

/**
 * Однофайловая сборка mir.html.
 * @param {{ write?: boolean, logLevel?: string }} [options]
 *   write: false — только вернуть HTML, ничего не писать (нужно .apk);
 *   по умолчанию файл ещё и обновляется на диске.
 */
export async function buildSingleHtml({ write = true, logLevel = 'warn' } = {}) {
  /* Сборка идёт в память: на диск попадает ровно один файл — mir.html. */
  const result = await viteBuild({
    mode: 'single',
    logLevel,
    build: { write: false },
  });

  /* Готовую разметку берём из результата сборки, а если Vite её не вернул
     (зависит от версии) — из состояния плагина, которое он записал. */
  const output = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output ?? []);
  const htmlAsset = output.find((item) => item.type === 'asset' && item.fileName.endsWith('.html'));
  const html = htmlAsset ? String(htmlAsset.source) : singleFileHtml();
  if (!html)
    throw new Error(
      'Однофайловая сборка не отдала HTML — плагин mir:single-file не сработал. ' +
        'Проверьте режим сборки: нужен `mode: "single"`.',
    );

  if (write) writeFileSync('mir.html', html);
  return html;
}

export { buildWeb as default };
