/* Разбор tgz-архивов npm: общий код для скриптов, которые берут готовые
   ресурсы из пакетов (scripts/sounds.mjs — звуки, scripts/fonts.mjs —
   шрифты).

   Зачем свой разбор. В проекте нет зависимостей, кроме Vite: тащить
   `tar` или вызывать системный `tar` ради двух скриптов нельзя — сборка
   обязана работать на голом Node и в Windows без архиватора.

   Формат простой: gzip поверх tar, где tar — это 512-байтовый заголовок,
   затем данные, выровненные по 512 байт. Нам нужны только обычные файлы
   (тип '0' или пустой — старый формат), поэтому ссылки, каталоги и
   длинные имена не разбираем. */

import { gunzipSync } from 'node:zlib';

/** Файлы архива: имя в архиве → содержимое (без копирования данных). */
export function untar(buffer) {
  const files = new Map();
  let offset = 0;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break; // конец архива: два пустых блока подряд

    const rawSize = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
    const size = rawSize ? parseInt(rawSize, 8) : 0;
    const type = String.fromCharCode(header[156]);
    const start = offset + 512;

    if (type === '0' || type === '\u0000') {
      files.set(name, buffer.subarray(start, start + size));
    }
    offset = start + Math.ceil(size / 512) * 512;
  }

  return files;
}

/**
 * Скачать пакет с registry.npmjs.org и разобрать его.
 * @param {string} name имя пакета (например, `uisfx`)
 * @param {string} version версия пакета
 * @returns {Promise<Map<string, Buffer>>} файлы архива
 */
export async function fetchPackage(name, version) {
  const url = `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`;
  console.log(`  скачиваю ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`сервер ответил ${response.status}`);
  return untar(gunzipSync(Buffer.from(await response.arrayBuffer())));
}
