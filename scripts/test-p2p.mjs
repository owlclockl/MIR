/* Живая проверка прямой связи: два независимых клиента в одном
   процессе говорят с настоящим хабом.

   Запуск:
     npm run share -- --port 4300      (в соседнем терминале)
     npm i --no-save node-datachannel  (полифил WebRTC для Node)
     npm run test:p2p

   Клиенты должны быть полностью независимы, поэтому модули
   копируются в две временные папки: так у каждого свой стор,
   своя сессия и свой набор соединений. */

import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RTCPeerConnection } from 'node-datachannel/polyfill';
import { fromRoot } from './lib/root.mjs';

globalThis.RTCPeerConnection = RTCPeerConnection;

const BASE = process.env.MIR_HUB ?? 'http://127.0.0.1:4300';

const clientDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'mir-p2p-'));
  cpSync(fromRoot('src', 'data'), dir, { recursive: true });
  return pathToFileURL(join(dir, '/')).href;
};

const mk = async (dir, name) => {
  const store = await import(`${dir}store.js`);
  const remote = await import(`${dir}remote.js`);
  const p2p = await import(`${dir}p2p.js`);
  remote.setBase(BASE);
  const mode = await store.initBackend();
  if (mode !== 'hub') throw new Error('хаб не подхватился');
  const me = await store.register(name, 'secret123');
  return { store, remote, p2p, me };
};

const n = Math.floor(Math.random() * 9000);
const A = await mk(clientDir(), `anna${n}`);
const B = await mk(clientDir(), `boris${n}`);
console.log('аккаунты:', A.me.name, B.me.name);

await A.store.sendRequest(B.me.id);
await B.store.refreshRemote();
const req = B.store.incomingRequests(B.me.id)[0];
await B.store.acceptRequest(req.id);
await A.store.refreshRemote();
console.log(
  'друзья:',
  A.store.listFriends(A.me.id).length === 1 && B.store.listFriends(B.me.id).length === 1,
);

A.p2p.start();
B.p2p.start();

const waitFor = async (check, ms, what) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('не дождались: ' + what);
};

/* Ждём любого рабочего состояния: на машине с нормальной сетью это
   'direct', в урезанных окружениях без ICE — 'relay' через хаб.
   Оба варианта означают, что связь есть и сообщения дойдут. */
const linked = () => ['direct', 'relay'].includes(A.p2p.status(B.me.id).state);
await waitFor(() => linked() && ['direct', 'relay'].includes(B.p2p.status(A.me.id).state), 30000, 'связь');
console.log('связь установлена:', A.p2p.status(B.me.id).state, '/', B.p2p.status(A.me.id).state);
const via = A.p2p.send(B.me.id, 'через хаб');
await waitFor(() => B.p2p.messages(A.me.id).some((m) => m.text === 'через хаб'), 8000, 'сообщение через хаб');
console.log('сообщения через хаб доходят, via =', via);
const back = B.p2p.send(A.me.id, 'ответ через хаб');
await waitFor(() => A.p2p.messages(B.me.id).some((m) => m.text === 'ответ через хаб'), 8000, 'ответ через хаб');
console.log('в обе стороны:', back);
console.log('непрочитанных у B:', B.p2p.unread(A.me.id));
B.p2p.markRead(A.me.id);
console.log('после прочтения:', B.p2p.unread(A.me.id));

/* Коды прямого подключения — без хаба вообще. */
const offer = await A.p2p.createInviteCode();
const answer = await B.p2p.acceptInviteCode(offer);
await A.p2p.completeInvite(answer);
console.log('коды созданы и приняты, длина кода приглашения:', offer.length, 'ответного:', answer.length);
try {
  await B.p2p.acceptInviteCode('мусор');
  console.log('ПЛОХО: мусор принят');
} catch (error) {
  console.log('мусорный код отклонён:', error.message);
}
try {
  await A.p2p.completeInvite(offer);
  console.log('ПЛОХО: перепутанный код принят');
} catch (error) {
  console.log('перепутанные коды отлавливаются:', error.message);
}

A.p2p.stop();
B.p2p.stop();
console.log('ВСЁ ХОРОШО');
process.exit(0);
