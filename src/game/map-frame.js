/* ===========================================================
   Формат бинарного кадра лобби — общий для канала и синхронизации.

   Кадр: 4 байта длины заголовка (BE), JSON-заголовок, gzip-данные.
   Заголовок карты: { t:'map', lobbyId, seed, width, height, enc:'gzip' }.
   Заголовок снимка предпросмотра: { t:'live', lobbyId, vw, vh, enc:'gzip' }.

   Модуль без зависимостей: его импортируют и канал (src/data/lobby.js),
   и синхронизация (src/game/lobby-sync.js) — цикла не получается.

   Отпечаток кадра считаем без crypto.subtle: он есть только в
   защищённом контексте, а хаб на адресе локальной сети открыт по http.
   =========================================================== */

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** Версия формата заголовка: меняется при несовместимых изменениях. */
export const FRAME_VERSION = 1;

/* Сжатие — потоками браузера. Старые WebView (APK на древних телефонах)
   их не знают: тогда карта не уйдёт, и человек должен это видеть. */
export const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

export const gzip = async (text) =>
  new Uint8Array(
    await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(),
  );

export const gunzip = (bytes) =>
  new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();

/** Собирает кадр: длина заголовка, заголовок, gzip-данные. */
export const encodeFrame = async (text, header) => {
  const headerBytes = encoder.encode(JSON.stringify(header));
  const payload = await gzip(text);
  const frame = new Uint8Array(4 + headerBytes.length + payload.length);
  new DataView(frame.buffer).setUint32(0, headerBytes.length);
  frame.set(headerBytes, 4);
  frame.set(payload, 4 + headerBytes.length);
  return frame;
};

/** Разбирает кадр. Возвращает null, если кадр не похож на карту или снимок. */
export const decodeFrame = (bytes) => {
  const headerLength = peekHeaderLength(bytes);
  if (!headerLength) return null;
  try {
    const header = JSON.parse(decoder.decode(bytes.subarray(4, 4 + headerLength)));
    if (!header || typeof header !== 'object') return null;
    return { header, payload: bytes.subarray(4 + headerLength) };
  } catch {
    return null;
  }
};

/** Длина заголовка кадра или 0, если кадр обрезан. Для сортировки кадров
    каналом до полного разбора: карта и снимок идут одним бинарным потоком. */
export const peekHeaderLength = (bytes) => {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 6) return 0;
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (headerLength === 0 || 4 + headerLength > bytes.byteLength) return 0;
  return headerLength;
};

/** Тип кадра без разбора данных: 'map' | 'live' | null. */
export const peekFrameType = (bytes) => {
  const headerLength = peekHeaderLength(bytes);
  if (!headerLength || bytes.byteLength < 4 + headerLength) return null;
  try {
    const header = JSON.parse(decoder.decode(bytes.subarray(4, 4 + headerLength)));
    return header?.t === 'map' || header?.t === 'live' ? header.t : null;
  } catch {
    return null;
  }
};

/* Отпечаток данных: «этот кадр мы уже применяли». Два независимых 32-битных
   хеша (схема cyrb53) дают 64 бита — для двух подряд идущих кадров этого
   с запасом, а считается синхронно и без crypto.subtle. */
export const fingerprint = (bytes) => {
  let h1 = 0xdeadbeef ^ bytes.length;
  let h2 = 0x41c6ce57 ^ bytes.length;
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    h1 = Math.imul(h1 ^ b, 2654435761);
    h2 = Math.imul(h2 ^ b, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}${bytes.length.toString(16)}`;
};
