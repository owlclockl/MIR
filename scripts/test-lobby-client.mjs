/* Клиентская часть лобби против настоящего хаба — без браузера.

   Поднимаем хаб (server/hub.mjs) в этом же процессе и подключаем настоящие
   модули клиента: store, remote, lobby.js (живой канал) и lobby-sync.js
   (синхронизация карты). Вместо редактора Azgaar — подставное окно, которое
   ведёт себя как Azgaar в важном для синхронизации: uploadMap зовёт колбэк
   сразу, разбор идёт позже, элемент #map заменяется, и DOM ещё немного
   меняется. Мастера изображаем сырым WebSocket.

   Что проверяем:
   • две карты подряд применяются по очереди, а не одновременно;
   • повтор уже применённой карты не загружается второй раз;
   • переподключение канала не ломает синхронизацию;
   • выход из аккаунта гасит живой канал.

   Запуск: npm run test:lobby-client   (нужен jsdom: npm i --no-save jsdom) */

import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { JSDOM } from 'jsdom';

import { createHub } from '../server/hub.mjs';

let failures = 0;
const ok = (what, detail = '') => console.log(`  ✓ ${what}${detail ? ` — ${detail}` : ''}`);
const bad = (what, detail = '') => {
  failures += 1;
  console.log(`  × ${what}${detail ? ` — ${detail}` : ''}`);
};
const expect = (what, condition, detail = '') => (condition ? ok(what, detail) : bad(what, detail));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitUntil = async (test, timeout = 8000) => {
  for (const started = Date.now(); Date.now() - started < timeout; ) {
    if (test()) return true;
    await sleep(20);
  }
  return test();
};

/* ---------- окружение браузера --------------------------------- */

/* Игра по адресу локальной сети открыта по http://: это не защищённый
   контекст, и crypto.subtle там не существует. Имитируем именно это. */
Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined, configurable: true });

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};
globalThis.document = new JSDOM('<!doctype html><body></body>').window.document;

/* ---------- хаб -------------------------------------------------- */

const dir = mkdtempSync(join(tmpdir(), 'mir-lobby-client-'));
const hub = createHub({ dbFile: join(dir, 'hub.json'), adminKey: 'проверка-ключа' });
const server = createServer(async (req, res) => {
  const handled = await hub.handle(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.end();
  }
});
server.on('upgrade', (req, socket, head) => hub.upgrade(req, socket, head));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const store = await import('../src/data/store.js');
const lobby = await import('../src/data/lobby.js');
const { startLobbySync } = await import('../src/game/lobby-sync.js');

const suffix = Math.floor(Math.random() * 9000) + 1000;
const json = async (method, path, { token, body } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
};

console.log(`\nХаб: ${base}`);
await store.connectHub(base);
await store.register(`игрок${suffix}`, 'secret123');
const playerToken = store.getSession()?.token;

/* Мастер заводит аккаунт напрямую по HTTP — как настоящий клиент, но без
   сессии в этом процессе: его роль — только слать кадры. */
const masterSalt = randomBytes(16).toString('hex');
const masterHash = createHash('sha256').update(`${masterSalt}:secret123`).digest('hex');
const masterReg = await json('POST', '/api/register', {
  body: { name: `мастер${suffix}`, salt: masterSalt, passHash: masterHash },
});
const masterToken = masterReg.data.token;
const created = await json('POST', '/api/lobby/create', {
  token: masterToken,
  body: { seed: `синхро-${suffix}`, width: 1280, height: 800 },
});
const LOBBY = created.data.lobby;
expect('мастер создал лобби', created.status === 200 && !!LOBBY?.id, LOBBY?.code);

/* ---------- окно Azgaar ---------------------------------------- */

const editorDom = new JSDOM('<!doctype html><body><svg id="map"></svg></body>');
const editorDoc = editorDom.window.document;
const applied = [];
let active = 0;
let maxActive = 0;

const uploadMap = (file, callback) => {
  active += 1;
  maxActive = Math.max(maxActive, active);
  /* Как в Azgaar: колбэк сразу, разбор — позже. */
  callback?.();
  (async () => {
    const text = await file.text();
    applied.push(text.slice(0, 8));
    await sleep(40);
    const old = editorDoc.getElementById('map');
    const fresh = editorDoc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    fresh.id = 'map';
    old?.replaceWith(fresh);
    await sleep(60);
    editorDoc.body.setAttribute('data-parsed', String(applied.length));
    active -= 1;
  })();
};

const editor = {
  document: editorDoc,
  MutationObserver: editorDom.window.MutationObserver,
  Blob,
  setTimeout: globalThis.setTimeout.bind(globalThis),
  options: { map: { seed: `синхро-${suffix}`, graph: { width: 1280, height: 800 } } },
  Services: { Save: { prepareMapData: async () => '' }, Load: { uploadMap } },
  GenerationPipeline: { steps: [], run: async () => {} },
};
const frame = {
  isConnected: true,
  contentWindow: editor,
  contentDocument: editorDoc,
  parentElement: null,
  addEventListener() {},
  removeEventListener() {},
};

/* ---------- игрок входит в лобби --------------------------------- */

await lobby.joinLobby(LOBBY.code);
lobby.connectLobby();
expect('игрок в сети через живой канал', await waitUntil(() => lobby.lobbyState().status === 'online'));

const stopSync = startLobbySync(frame, { lobbyId: LOBBY.id, role: 'player', fresh: false });
await editor.GenerationPipeline.run();
await sleep(100);

/* ---------- мастер шлёт карты ------------------------------------ */

const gzip = async (text) =>
  new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());

const buildFrame = async (text) => {
  const header = new TextEncoder().encode(
    JSON.stringify({ t: 'map', v: 1, lobbyId: LOBBY.id, seed: `синхро-${suffix}`, width: 1280, height: 800, enc: 'gzip' }),
  );
  const payload = await gzip(text);
  const out = new Uint8Array(4 + header.length + payload.length);
  new DataView(out.buffer).setUint32(0, header.length);
  out.set(header, 4);
  out.set(payload, 4 + header.length);
  return out;
};

const master = new WebSocket(`${base.replace(/^http/, 'ws')}/api/ws`);
master.binaryType = 'arraybuffer';
await new Promise((resolve, reject) => {
  master.onopen = resolve;
  master.onerror = () => reject(new Error('сокет мастера не открылся'));
});
master.send(JSON.stringify({ t: 'auth', token: masterToken }));
await sleep(200);

const FIRST = `ПЕРВАЯ|${'a'.repeat(120_000)}`;
const SECOND = `ВТОРАЯ|${'b'.repeat(120_000)}`;
master.send(await buildFrame(FIRST));
/* Второй кадр приходит, пока первый ещё разбирается: должен ждать очереди. */
await sleep(15);
master.send(await buildFrame(SECOND));

expect('первая карта применена', await waitUntil(() => applied.length >= 1), applied[0] ?? '');
expect('вторая карта применена после первой', await waitUntil(() => applied.length >= 2), applied[1] ?? '');
expect('карты не загружаются одновременно', maxActive === 1, `одновременно: ${maxActive}`);
expect('порядок: сначала первая, потом вторая', applied[0]?.startsWith('ПЕРВАЯ|') && applied[1]?.startsWith('ВТОРАЯ|'));

master.send(await buildFrame(SECOND));
await sleep(1500);
expect('повтор уже применённой карты не грузится снова', applied.length === 2, `загрузок: ${applied.length}`);

/* ---------- переподключение и выход ----------------------------- */

lobby.disconnectLobby();
lobby.connectLobby();
expect('после быстрого переподключения канал снова в сети', await waitUntil(() => lobby.lobbyState().status === 'online'));
await sleep(800);
expect('переподключение не загрузило карту второй раз', applied.length === 2, `загрузок: ${applied.length}`);

store.logout();
expect('выход из аккаунта гасит живой канал', await waitUntil(() => lobby.lobbyState().status === 'idle'));

stopSync();
master.close();
server.close();
rmSync(dir, { recursive: true, force: true });

console.log(failures === 0 ? '\nВСЁ ХОРОШО' : `\nПЛОХО: провалов ${failures}`);
process.exit(failures === 0 ? 0 : 1);
