/* ===========================================================
   WebSocket-сервер для хаба на ПК (RFC 6455) — без зависимостей.

   Нужен лобби для живой синхронизации карты: HTTP с опросом дал бы
   секунды задержки, а кадр карты уходит по событию, сразу. Модуль
   знает только протокол: рукопожатие, маскирование, фрагменты, ping,
   закрытие. Что делать с сообщениями — решает ядро (hub-lobby.mjs).

   Соединение, которое получает ядро, похоже на хостинговое:
     send(text | Uint8Array), close(code, reason).

   Nagle отключён: кадры карты и ход лобби не должны ждать склейки.
   =========================================================== */

import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
/* Клиент, который перестал читать, копит очередь в памяти хаба. Отключаем
   его раньше, чем очередь станет проблемой для остальных. */
const MAX_BUFFERED_BYTES = 64 * 1024 * 1024;

const OP_CONTINUATION = 0x0;
const OP_TEXT = 0x1;
const OP_BINARY = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

const frameHeader = (opcode, length) => {
  if (length < 126) {
    return Buffer.from([0x80 | opcode, length]);
  }
  if (length < 0x10000) {
    const header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return header;
  }
  const header = Buffer.alloc(10);
  header[0] = 0x80 | opcode;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return header;
};

/**
 * Принимает обновление соединения до WebSocket. Возвращает false, если
 * запрос не WebSocket (тогда сокет уже закрыт).
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:net').Socket} socket
 * @param {Buffer} head — данные, которые клиент успел прислать вместе с запросом
 * @param {{ open(conn): void, message(conn, data): void, close(conn): void }} handlers
 */
export function acceptWebSocket(req, socket, head, handlers) {
  const key = req.headers['sec-websocket-key'];
  const upgrade = String(req.headers.upgrade || '').toLowerCase();
  if (!key || upgrade !== 'websocket' || req.headers['sec-websocket-version'] !== '13') {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return false;
  }
  const accept = createHash('sha1').update(`${key}${GUID}`).digest('base64');
  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'),
  );
  socket.setNoDelay(true);
  socket.setTimeout(0);
  /* Keepalive ловит разрыв, о котором TCP молчит часами (телефон ушёл из сети). */
  socket.setKeepAlive(true, 15_000);

  let closed = false;
  let fragments = null; // { opcode, parts, size }
  /* Входящие куски копим списком и склеиваем, только когда набрался весь
     текущий кадр: склейка на каждом куске TCP давала квадратичную работу
     (кадр карты в 16 МБ приходит сотнями кусков). */
  let pieces = [];
  let pendingBytes = 0;
  let need = 0; // сколько байт нужно для текущего кадра, когда его заголовок разобран

  const finish = () => {
    if (closed) return;
    closed = true;
    handlers.close(conn);
  };

  const sendControl = (opcode, payload = Buffer.alloc(0)) => {
    if (closed || socket.destroyed) return;
    socket.write(Buffer.concat([frameHeader(opcode, payload.length), payload]));
  };

  const conn = {
    send(data) {
      if (closed || socket.destroyed) return;
      if (socket.writableLength > MAX_BUFFERED_BYTES) {
        conn.close(4008, 'slow');
        return;
      }
      const isText = typeof data === 'string';
      const body = isText ? Buffer.from(data, 'utf8') : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      socket.cork();
      socket.write(frameHeader(isText ? OP_TEXT : OP_BINARY, body.length));
      socket.write(body);
      socket.uncork();
    },
    close(code = 1000, reason = '') {
      if (closed) return;
      const text = Buffer.from(String(reason).slice(0, 120), 'utf8');
      const payload = Buffer.alloc(2 + text.length);
      payload.writeUInt16BE(code, 0);
      text.copy(payload, 2);
      sendControl(OP_CLOSE, payload);
      closed = true;
      socket.end();
      handlers.close(conn);
    },
  };

  const deliver = (opcode, payload) => {
    if (opcode === OP_TEXT) handlers.message(conn, payload.toString('utf8'));
    else handlers.message(conn, new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength));
  };

  const onFrame = (fin, opcode, payload) => {
    if (opcode === OP_CLOSE) {
      sendControl(OP_CLOSE, payload.subarray(0, 2));
      closed = true;
      socket.end();
      handlers.close(conn);
      return;
    }
    if (opcode === OP_PING) {
      sendControl(OP_PONG, payload);
      return;
    }
    if (opcode === OP_PONG) return;

    if (opcode === OP_TEXT || opcode === OP_BINARY) {
      if (fragments) return fail(1002);
      if (fin) return deliver(opcode, payload);
      fragments = { opcode, parts: [payload], size: payload.length };
      return undefined;
    }
    if (opcode === OP_CONTINUATION) {
      if (!fragments) return fail(1002);
      fragments.parts.push(payload);
      fragments.size += payload.length;
      if (fragments.size > MAX_MESSAGE_BYTES) return fail(1009);
      if (fin) {
        const whole = Buffer.concat(fragments.parts, fragments.size);
        const { opcode: first } = fragments;
        fragments = null;
        deliver(first, whole);
      }
      return undefined;
    }
    return fail(1002);
  };

  function fail(code) {
    conn.close(code, 'protocol');
  }

  /* Оставляем недособранный кусок до следующих данных. wanted — сколько байт
     нужно для кадра целиком (0, если заголовок ещё не полный). */
  const park = (rest, wanted) => {
    pieces = rest.length ? [rest] : [];
    pendingBytes = rest.length;
    need = wanted;
  };

  const feed = (chunk) => {
    if (closed) return;
    pieces.push(chunk);
    pendingBytes += chunk.length;
    if (pendingBytes < need) return;
    let buffer = pieces.length === 1 ? pieces[0] : Buffer.concat(pieces, pendingBytes);
    pieces = [];
    pendingBytes = 0;
    need = 0;
    while (!closed) {
      if (buffer.length < 2) return park(buffer, 0);
      const b0 = buffer[0];
      const b1 = buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let length = b1 & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return park(buffer, 0);
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return park(buffer, 0);
        const big = buffer.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE_BYTES)) return fail(1009);
        length = Number(big);
        offset = 10;
      }
      /* Клиент обязан маскировать свои кадры (RFC 6455, 5.1). */
      if (!masked) return fail(1002);
      if (opcode >= 0x8 && (!fin || length > 125)) return fail(1002);
      if (length > MAX_MESSAGE_BYTES) return fail(1009);
      const total = offset + 4 + length;
      if (buffer.length < total) return park(buffer, total);
      const mask = buffer.subarray(offset, offset + 4);
      const payload = Buffer.allocUnsafe(length);
      for (let i = 0; i < length; i += 1) payload[i] = buffer[offset + 4 + i] ^ mask[i & 3];
      buffer = buffer.subarray(total);
      onFrame(fin, opcode, payload);
    }
  };

  socket.on('data', feed);
  socket.on('close', finish);
  socket.on('end', finish);
  socket.on('error', finish);

  handlers.open(conn);
  if (head && head.length) feed(head);
  return true;
}
