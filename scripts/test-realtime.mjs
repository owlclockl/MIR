/* Проверка живого канала лобби без сети и браузера.

   Две части:
   1. Ядро лобби (server/hub-lobby.mjs) с подменённым временем и поддельными
      сокетами: уборка пустых лобби после перезапуска хаба, закрытие молчащих
      сокетов, один запрос карты на пару секунд, бюджет по байтам.
   2. Сборка кадров WebSocket (server/ws.mjs) на настоящем TCP: кадр в 1 МБ,
      пришедший кусками разного размера, и текстовые сообщения, разрезанные
      по байту. Именно так приходят большие кадры карты.

   Запуск: npm run test:realtime
   Ничего не сохраняет и не трогает данные хаба. */

import { randomBytes } from 'node:crypto';
import { connect } from 'node:net';
import { createServer } from 'node:http';

import { CLOSE_IDLE, CLOSE_POLICY, createLobbies } from '../server/hub-lobby.mjs';
import { acceptWebSocket } from '../server/ws.mjs';

let failures = 0;
const ok = (what, detail = '') => console.log(`  ✓ ${what}${detail ? ` — ${detail}` : ''}`);
const bad = (what, detail = '') => {
  failures += 1;
  console.log(`  × ${what}${detail ? ` — ${detail}` : ''}`);
};
const expect = (what, condition, detail = '') => (condition ? ok(what, detail) : bad(what, detail));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Случайные байты пачками: getRandomValues отдаёт не больше 64 КБ за вызов. */
const randomData = (count) => {
  const out = new Uint8Array(count);
  for (let offset = 0; offset < count; offset += 65536) {
    crypto.getRandomValues(out.subarray(offset, Math.min(count, offset + 65536)));
  }
  return out;
};

/* ---------- 1. ядро лобби ---------------------------------------- */

console.log('\nЯдро лобби (подменённое время):');

let clock = 1_900_000_000_000;
const now = () => clock;

const people = new Map([
  ['u_master', { id: 'u_master', name: 'Мастер', friends: ['u_player'], tokens: ['tok-master'] }],
  ['u_player', { id: 'u_player', name: 'Игрок', friends: ['u_master'], tokens: ['tok-player'] }],
]);
const byId = (id) => people.get(id) ?? null;
const byToken = (token) => [...people.values()].find((user) => user.tokens.includes(token)) ?? null;

const makeCore = (lobbies) => {
  const db = { users: [...people.values()], lobbies, requests: [] };
  const core = createLobbies({
    db,
    auth: () => {
      throw new Error('не используется в этой проверке');
    },
    byId,
    byToken,
    banOf: () => null,
    makeCode: () => 'ABCD-EFGH',
    normalizeCode: (code) => String(code ?? '').toUpperCase(),
    hex: (bytes) => 'a'.repeat(bytes * 2),
    persistSoon: () => {},
    now,
  });
  return { db, core };
};

/* Поддельный сокет: запоминаем всё, что ядро отправило, и причину закрытия. */
const fakeConn = () => {
  const conn = {
    sent: [],
    closed: null,
    send(data) {
      conn.sent.push(data);
    },
    close(code, reason) {
      conn.closed = { code, reason };
    },
  };
  return conn;
};

const jsonOf = (conn, type) =>
  conn.sent
    .filter((item) => typeof item === 'string')
    .map((item) => JSON.parse(item))
    .filter((msg) => msg.t === type);

const connect_ = (core, token) => {
  const conn = fakeConn();
  core.socket.open(conn);
  core.socket.message(conn, JSON.stringify({ t: 'auth', token }));
  return conn;
};

/* 1а. После перезапуска хаба записей об активности нет. Лобби, созданное
   давно, не должно сноситься в первую же уборку: участники ещё придут. */
{
  const created = clock - 3 * 60 * 60_000;
  const { db, core } = makeCore([
    { id: 'l_old', code: 'OLDL-0001', masterId: 'u_master', seed: 'old', width: 1280, height: 800, members: ['u_master'], createdAt: created },
  ]);
  core.tick();
  expect('после перезапуска старое пустое лобби не сносится сразу', db.lobbies.length === 1);
  clock += 9 * 60_000;
  core.tick();
  expect('и живёт ещё до десяти минут после запуска', db.lobbies.length === 1);
  clock += 2 * 60_000;
  core.tick();
  expect('пустое лобби закрывается через десять минут без активности', db.lobbies.length === 0);
}

/* 1б. Молчащий сокет — мёртв: присутствие снимается, сокет закрывается с
   кодом idle. Пингующий сокет остаётся живым. */
{
  const { core } = makeCore([
    { id: 'l_hb', code: 'HBHB-0001', masterId: 'u_master', seed: 'hb', width: 1280, height: 800, members: ['u_master', 'u_player'], createdAt: clock },
  ]);
  const master = connect_(core, 'tok-master');
  const player = connect_(core, 'tok-player');
  core.tick();
  for (let i = 0; i < 9; i += 1) {
    clock += 15_000;
    core.socket.message(player, JSON.stringify({ t: 'ping', n: `p${i}` }));
    core.tick();
  }
  expect('молчащий мастер закрыт по таймауту', master.closed?.code === CLOSE_IDLE, JSON.stringify(master.closed));
  expect('пингующий игрок остаётся на связи', player.closed === null);
  const seen = jsonOf(player, 'lobby').at(-1);
  expect(
    'игрок видит, что мастер ушёл из сети',
    seen?.lobby?.members.some((m) => m.id === 'u_master' && m.online === false) === true,
  );
}

/* 1в. Запрос карты мастеру: несколько игроков, зашедших подряд, — один
   запрос. Через три секунды следующий игрок снова его вызывает. */
{
  const { core } = makeCore([
    { id: 'l_nm', code: 'NMNM-0001', masterId: 'u_master', seed: 'nm', width: 1280, height: 800, members: ['u_master', 'u_player'], createdAt: clock },
  ]);
  const master = connect_(core, 'tok-master');
  const player = connect_(core, 'tok-player');
  core.socket.message(player, JSON.stringify({ t: 'watch' }));
  core.socket.message(player, JSON.stringify({ t: 'watch' }));
  expect('два подряд запроса карты дают один need-map', jsonOf(master, 'need-map').length === 1, `${jsonOf(master, 'need-map').length}`);
  clock += 3_500;
  core.socket.message(player, JSON.stringify({ t: 'watch' }));
  expect('через три секунды запрос повторяется', jsonOf(master, 'need-map').length === 2);
}

/* 1г. Бюджет по байтам: пять кадров по 15 МБ — это 75 МБ, сверх 64 МБ за
   окно, хотя по числу сообщений всё в норме. Сокет закрывается кодом 4008. */
{
  const { core } = makeCore([
    { id: 'l_bd', code: 'BDBD-0001', masterId: 'u_master', seed: 'bd', width: 1280, height: 800, members: ['u_master', 'u_player'], createdAt: clock },
  ]);
  const flood = connect_(core, 'tok-player');
  const frame = new Uint8Array(15 * 1024 * 1024);
  for (let i = 0; i < 5 && !flood.closed; i += 1) core.socket.message(flood, frame);
  expect('сверх бюджета по байтам сокет закрыт кодом 4008', flood.closed?.code === CLOSE_POLICY, JSON.stringify(flood.closed));
}

/* ---------- 2. кадры WebSocket на TCP -------------------------------- */

console.log('\nКадры WebSocket (настоящий TCP):');

const received = [];
const server = createServer((req, res) => {
  res.statusCode = 404;
  res.end();
});
server.on('upgrade', (req, socket, head) => {
  acceptWebSocket(req, socket, head, {
    open() {},
    message(conn, data) {
      received.push(typeof data === 'string' ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    },
    close() {},
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

const socket = connect(port, '127.0.0.1');
socket.setNoDelay(true);
let handshake = '';
const upgraded = new Promise((resolve) => {
  socket.on('data', function onHandshake(chunk) {
    handshake += chunk.toString('latin1');
    if (handshake.includes('\r\n\r\n')) {
      socket.off('data', onHandshake);
      resolve(handshake.startsWith('HTTP/1.1 101'));
    }
  });
});
socket.write(
  [
    'GET /api/ws HTTP/1.1',
    `Host: 127.0.0.1:${port}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}`,
    'Sec-WebSocket-Version: 13',
    '',
    '',
  ].join('\r\n'),
);
expect('рукопожатие принято (101)', await upgraded);

/* Маскированный кадр: заголовок, ключ маски, данные, сдвинутые XOR-ом. */
const maskedFrame = (opcode, payload) => {
  const mask = randomBytes(4);
  const masked = Buffer.from(payload.map((b, i) => b ^ mask[i & 3]));
  let header;
  if (masked.length < 126) {
    header = Buffer.from([0x80 | opcode, 0x80 | masked.length]);
  } else if (masked.length < 0x10000) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(masked.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(masked.length), 2);
  }
  return Buffer.concat([header, mask, masked]);
};

/* Отдаём байты кусками случайного размера с паузами: сервер получает кадр
   по частям, как по медленной сети. */
const sendInPieces = async (wire) => {
  let at = 0;
  while (at < wire.length) {
    const size = 1 + Math.floor(Math.random() * 4000);
    socket.write(wire.subarray(at, at + size));
    at += size;
    await sleep(0);
  }
};

const bigPayload = randomData(1024 * 1024);
const bigWire = maskedFrame(0x2, Buffer.from(bigPayload));
const before = received.length;
await sendInPieces(bigWire);
for (let i = 0; i < 200 && received.length === before; i += 1) await sleep(10);
const got = received[before];
expect(
  'кадр 1 МБ, пришедший кусками, собран целиком',
  !!got && got.length === bigPayload.length && Buffer.compare(got, Buffer.from(bigPayload)) === 0,
  got ? `${got.length} байт` : 'кадр не пришёл',
);

const textPayload = JSON.stringify({ t: 'ping', n: 'разрезано-по-байту', at: 1 });
const textWire = maskedFrame(0x1, Buffer.from(textPayload));
const beforeText = received.length;
for (const byte of textWire) {
  socket.write(Buffer.from([byte]));
  await sleep(0);
}
for (let i = 0; i < 200 && received.length === beforeText; i += 1) await sleep(10);
expect('текст, разрезанный по байту, собран верно', received[beforeText] === textPayload, received[beforeText] ?? 'не пришёл');

socket.destroy();
server.close();

console.log(failures === 0 ? '\nВСЁ ХОРОШО' : `\nПЛОХО: провалов ${failures}`);
process.exit(failures === 0 ? 0 : 1);
