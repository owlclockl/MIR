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
   • живой снимок предпросмотра доходит до игрока и показывается поверх
     карты без загрузки карты, а после тишины плавно гаснет;
   • кадр предпросмотра чистится: скрипты и обработчики из него выпадают;
   • снимок от игрока хаб отвергает;
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
const pageWindow = new JSDOM('<!doctype html><body></body>').window;
globalThis.document = pageWindow.document;
globalThis.DOMParser = pageWindow.DOMParser;

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
  XMLSerializer: editorDom.window.XMLSerializer,
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

/* Хост кадра: накладка живого предпросмотра должна сюда вставиться. Держим
   ссылку на вставленный элемент, чтобы проверять её состояние. Хост помнит
   только .world-live: обложку генерации (generation-stage.js) он тоже
   получает, но это другой элемент. */
let liveView = null;
frame.parentElement = {
  querySelector: (selector) => (selector === ':scope > .world-live' ? liveView : null),
  append: (element) => {
    if (element?.classList?.contains('world-live')) liveView = element;
  },
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

/* ---------- живой предпросмотр ------------------------------------ */

const buildLiveFrame = async (text, { vw = 1280, vh = 800 } = {}) => {
  const header = new TextEncoder().encode(JSON.stringify({ t: 'live', v: 1, lobbyId: LOBBY.id, vw, vh, enc: 'gzip' }));
  const payload = await gzip(text);
  const out = new Uint8Array(4 + header.length + payload.length);
  new DataView(out.buffer).setUint32(0, header.length);
  out.set(header, 4);
  out.set(payload, 4 + header.length);
  return out;
};

const liveEvents = [];
const ackEvents = [];
const stopEvents = lobby.onLobbyEvent((event) => {
  if (event.type === 'live') liveEvents.push(event);
  if (event.type === 'ack') ackEvents.push(event);
});

/* Снимок в том виде, в каком его собирает мастер: идентификаторы уже
   с префиксом (см. prefixSnapshotIds), внутри — скрипт и обработчик,
   которые приёмник обязан выбросить. */
const SNAPSHOT =
  '<svg xmlns="http://www.w3.org/2000/svg" id="mrl-map" width="100%" height="100%">' +
  '<defs><linearGradient id="mrl-sea-1"><stop offset="0" stop-color="#123"/></linearGradient></defs>' +
  '<g id="mrl-viewbox" transform="translate(10 20) scale(2)"><script>window.evil = 1</script>' +
  '<circle cx="40" cy="40" r="30" fill="url(#mrl-sea-1)" onclick="steal()"></circle></g></svg>';
master.send(await buildLiveFrame(SNAPSHOT));

expect('снимок дошёл по каналу как «live»', await waitUntil(() => liveEvents.length >= 1));
expect('карта из-за снимка не перезагружалась', applied.length === 2, `загрузок: ${applied.length}`);
expect(
  'накладка предпросмотра показана',
  await waitUntil(() => liveView?.classList.contains('is-on')),
);
const liveSvg = liveView?.querySelector('[data-role="live-over"] svg, [data-role="live-under"] svg');
expect('снимок — SVG с видом мастера', !!liveSvg && liveSvg.getAttribute('viewBox') === '0 0 1280 800', liveSvg?.getAttribute('viewBox') ?? 'нет');
expect('идентификаторы снимка переименованы', !!liveSvg?.querySelector('[id^="mrl-"]'));
expect('скрипт из снимка выброшен', !liveView.querySelector('script') && typeof globalThis.evil === 'undefined');
expect('обработчик из снимка выброшен', !liveSvg?.querySelector('[onclick]'));

/* Снимок от игрока хаб отвергает: карта — только от мастера. */
const playerError = new Promise((resolve) => {
  const stop = lobby.onLobbyEvent((event) => {
    if (event.type === 'error' && String(event.message).includes('только мастер')) {
      stop();
      resolve(true);
    }
  });
});
const playerSocket = new WebSocket(`${base.replace(/^http/, 'ws')}/api/ws`);
playerSocket.binaryType = 'arraybuffer';
await new Promise((resolve, reject) => {
  playerSocket.onopen = resolve;
  playerSocket.onerror = () => reject(new Error('сокет игрока не открылся'));
});
playerSocket.send(JSON.stringify({ t: 'auth', token: playerToken }));
await sleep(150);
playerSocket.send(await buildLiveFrame(SNAPSHOT));
expect('снимок от игрока отвергнут', await waitUntil(async () => await playerError, 3000));
playerSocket.close();

/* Частота снимков ограничена окном: лишние молча пропадают. */
await sleep(2100); // окно частоты от предыдущих снимков должно закрыться
liveEvents.length = 0;
for (let i = 0; i < 14; i += 1) master.send(await buildLiveFrame(`${SNAPSHOT}<!--${i}-->`));
await sleep(400);
expect('лишние снимки за окно отброшены', liveEvents.length <= 9, `прошло: ${liveEvents.length} из 14`);
expect('последний снимок показан', liveView?.classList.contains('is-on') === true);

/* Правки стихли — предпросмотр плавно гаснет, карта остаётся на месте. */
await sleep(4300);
expect('предпросмотр погас после тишины', liveView?.classList.contains('is-on') === false);
expect('после затухания карта не перезагружалась', applied.length === 2, `загрузок: ${applied.length}`);

/* ---------- переподключение и выход ----------------------------- */

lobby.disconnectLobby();
lobby.connectLobby();
expect('после быстрого переподключения канал снова в сети', await waitUntil(() => lobby.lobbyState().status === 'online'));
await sleep(800);
expect('переподключение не загрузило карту второй раз', applied.length === 2, `загрузок: ${applied.length}`);

/* ---------- мастер через настоящую синхронизацию ------------------ */

/* Приёмник — сырой сокет игрока, открытый до выхода из аккаунта: он покажет,
   что реально уходит из мастера (снимки и полные карты различаем по заголовку). */
const receiver = new WebSocket(`${base.replace(/^http/, 'ws')}/api/ws`);
receiver.binaryType = 'arraybuffer';
await new Promise((resolve, reject) => {
  receiver.onopen = resolve;
  receiver.onerror = () => reject(new Error('сокет приёмника не открылся'));
});
receiver.send(JSON.stringify({ t: 'auth', token: playerToken }));
await sleep(200);
const received = [];
receiver.onmessage = (event) => {
  if (typeof event.data !== 'string') received.push(new Uint8Array(event.data));
};
const countKind = (bytesList, kind) =>
  bytesList.filter((bytes) => {
    try {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + view.getUint32(0))));
      return header.t === kind;
    } catch {
      return false;
    }
  }).length;

/* Второе окно редактора: мастер ведёт сеанс правок через startLobbySync.
   Проверяем новый порядок: во время правок идут только снимки, полная
   карта уходит один раз — в конце сеанса. */
const masterEd = new JSDOM('<!doctype html><body><svg id="map"><g id="viewbox"></g></svg></body>');
const masterDoc = masterEd.window.document;
const masterApplied = [];
const masterUpload = (file, callback) => {
  callback?.();
  (async () => {
    masterApplied.push((await file.text()).slice(0, 6));
    const old = masterDoc.getElementById('map');
    const fresh = masterDoc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    fresh.id = 'map';
    old?.replaceWith(fresh);
    await sleep(30);
  })();
};
const masterEditor = {
  document: masterDoc,
  MutationObserver: masterEd.window.MutationObserver,
  XMLSerializer: masterEd.window.XMLSerializer,
  Blob,
  innerWidth: 1280,
  innerHeight: 800,
  setTimeout: globalThis.setTimeout.bind(globalThis),
  options: { map: { seed: `синхро-${suffix}`, graph: { width: 1280, height: 800 } } },
  Services: {
    Save: { prepareMapData: async () => `МАСТЕР|${'m'.repeat(120_000)}` },
    Load: { uploadMap: masterUpload },
  },
  GenerationPipeline: { steps: [], run: async () => {} },
  customization: 0,
};
const masterFrame = {
  isConnected: true,
  contentWindow: masterEditor,
  contentDocument: masterDoc,
  parentElement: null,
  addEventListener() {},
  removeEventListener() {},
};
masterFrame.parentElement = {
  querySelector: (selector) => (selector === ':scope > .world-live' ? null : null),
  append() {},
};

/* Мастер должен идти от имени настоящего мастера: выходим из игрока и входим
   в аккаунт мастера через хранилище — живой канал переподключится им. */
stopSync();
store.logout();
await store.login(`мастер${suffix}`, 'secret123');
lobby.connectLobby();
expect('канал переподключился от имени мастера', await waitUntil(() => lobby.lobbyState().status === 'online'));

const stopMasterSync = startLobbySync(masterFrame, { lobbyId: LOBBY.id, role: 'master', fresh: false });
await masterEditor.GenerationPipeline.run();
await sleep(300);
/* Мастер забрал карту хаба: она пришла ему как игроку лобби. */
expect('мастер получил карту лобби при входе', masterApplied.length === 1, `загрузок: ${masterApplied.length}`);

const acksBefore = ackEvents.length;
const mapsBefore = countKind(received, 'map');
const livesBefore = countKind(received, 'live');
masterEditor.customization = 1; // мастер включил режим правок
await sleep(1600);
const liveDuring = countKind(received, 'live') - livesBefore;
expect('во время правок идут снимки', liveDuring >= 1, `снимков: ${liveDuring}`);
expect('во время правок полная карта не уходит', countKind(received, 'map') === mapsBefore && ackEvents.length === acksBefore, `карт: ${countKind(received, 'map') - mapsBefore}`);

masterEditor.customization = 0; // сеанс правок закончен
expect('в конце сеанса уходит одна полная карта', await waitUntil(() => countKind(received, 'map') === mapsBefore + 1 && ackEvents.length === acksBefore + 1, 4000), `карт: ${countKind(received, 'map') - mapsBefore}`);
await sleep(700);
expect('и она одна — повторы подавлены', countKind(received, 'map') === mapsBefore + 1, `карт: ${countKind(received, 'map') - mapsBefore}`);
const lastMap = countKind(received, 'map') > 0;
expect('полная карта дошла до игрока', lastMap);

/* Сеанс без правок: снимков нет (карта не менялась), полной карты нет. */
const mapsMid = countKind(received, 'map');
const livesMid = countKind(received, 'live');
masterEditor.customization = 1;
await sleep(700);
masterEditor.customization = 0;
await sleep(1600);
expect('сеанс без правок не шлёт ни карту, ни снимки', countKind(received, 'map') === mapsMid && countKind(received, 'live') === livesMid, `карт: ${countKind(received, 'map') - mapsMid}, снимков: ${countKind(received, 'live') - livesMid}`);

stopMasterSync();
receiver.close();
stopEvents();

store.logout();
expect('выход из аккаунта гасит живой канал', await waitUntil(() => lobby.lobbyState().status === 'idle'));

stopSync();

/* ---------- мастер: сборка снимка -------------------------------- */

const { captureSnapshot, prefixSnapshotIds, sanitizeSnapshot, LIVE_ID_PREFIX } = await import('../src/game/map-frame.js').then(() => import('../src/game/lobby-sync.js'));
const { peekFrameType } = await import('../src/game/map-frame.js');

const artWindow = new JSDOM('<!doctype html><body><svg id="map" width="100%" height="100%"><defs><linearGradient id="sea"><stop offset="0" stop-color="#123"/></linearGradient></defs><g id="viewbox" transform="translate(3 4) scale(1)"><circle cx="10" cy="10" r="5" fill="url(#sea)" onclick="pwn()"/><use href="#viewbox"/><script>1</script></g></svg></body>');
const artWin = artWindow.window;
Object.defineProperty(artWin, 'innerWidth', { value: 1600, configurable: true });
Object.defineProperty(artWin, 'innerHeight', { value: 1000, configurable: true });
const shot = captureSnapshot(artWin);
expect('мастер снимает карту и размер своего окна', !!shot && shot.vw === 1600 && shot.vh === 1000, `${shot?.vw}×${shot?.vh}`);
expect('идентификаторы в снимке переименованы', shot?.text.includes(`id="${LIVE_ID_PREFIX}viewbox"`) === true && shot?.text.includes(`url(#${LIVE_ID_PREFIX}sea)`) === true);
const useEl = shot?.text.includes(`href="#${LIVE_ID_PREFIX}viewbox"`);
expect('ссылки use тоже переименованы', useEl === true);

const roundTrip = new pageWindow.DOMParser().parseFromString(shot.text, 'image/svg+xml');
const cleaned = sanitizeSnapshot(roundTrip.documentElement, { XMLSerializer: artWin.XMLSerializer, document: artWin.document });
expect('приёмник выбрасывает скрипт и обработчик из снимка', !cleaned.includes('<script') && !cleaned.includes('onclick'), `${cleaned.length} байт`);
expect('снимок остаётся корректным SVG', cleaned.startsWith('<svg'));

const mapHeader = new TextEncoder().encode(JSON.stringify({ t: 'map', v: 1 }));
const liveHeader = new TextEncoder().encode(JSON.stringify({ t: 'live', v: 1 }));
const wrap = (header) => {
  const out = new Uint8Array(4 + header.length + 2);
  new DataView(out.buffer).setUint32(0, header.length);
  out.set(header, 4);
  return out;
};
expect('peekFrameType видит карту', peekFrameType(wrap(mapHeader)) === 'map');
expect('peekFrameType видит снимок', peekFrameType(wrap(liveHeader)) === 'live');
expect('peekFrameType не верит обрезку', peekFrameType(new Uint8Array([0, 0, 0, 40, 1, 2])) === null);

master.close();
server.close();
rmSync(dir, { recursive: true, force: true });

console.log(failures === 0 ? '\nВСЁ ХОРОШО' : `\nПЛОХО: провалов ${failures}`);
process.exit(failures === 0 ? 0 : 1);
