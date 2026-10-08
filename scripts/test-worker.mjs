/* Проверка хостингового адаптера хаба: Cloudflare Worker + Durable Object.

   Зачем: `test:hub` гоняет сценарий по живому адресу, но у адаптера для
   хостинга есть своя часть, которой у ПК-хаба нет, — хранение. Он держит
   игроков отдельными записями, а заявки, ключ панели, настройки и журнал —
   своими ключами, и записывает только изменившееся. Ошибку в этом слое
   живая проверка увидит лишь тогда, когда объект уснёт и проснётся заново,
   то есть, скорее всего, у игрока.

   Здесь вместо Durable Object — поддельное хранилище в Map, а вся логика
   адаптера настоящая (`hosting/cloudflare/worker.js`). Между двумя заходами
   объект создаётся заново поверх того же хранилища: это и есть «перезапуск».

   Запуск: npm run test:worker  (нужен только Node, сети не нужно) */

import worker, { MirHub } from '../hosting/cloudflare/worker.js';
import { MAX_REQUEST_BYTES } from '../server/hub-core.mjs';

/* ---------- поддельное хранилище Durable Object ---------- */

/* Копии, как у настоящего хранилища: адаптер не должен рассчитывать на
   то, что объект в памяти — тот же самый, что на диске. */
const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

const makeStorage = () => {
  const store = new Map();
  return {
    store,
    storage: {
      async list({ prefix } = {}) {
        return [...store.entries()]
          .filter(([key]) => !prefix || key.startsWith(prefix))
          .map(([key, value]) => [key, copy(value)]);
      },
      async get(key) {
        return copy(store.get(key));
      },
      async put(entries) {
        for (const [key, value] of Object.entries(entries)) store.set(key, copy(value));
      },
      async delete(keys) {
        for (const key of [].concat(keys)) store.delete(key);
      },
    },
  };
};

/* ---------- «воркер»: объект хаба и вызовы /api/* ---------- */

const boot = async (storage) => {
  const state = { ...storage, blockConcurrencyWhile: (fn) => fn() };
  const hub = new MirHub(state, { MIR_ADMIN_KEY: '' });
  /* В настоящем Durable Object первый запрос ждёт загрузки данных;
     здесь её никто не ждёт — даём загрузке завершиться. */
  await new Promise((resolve) => setTimeout(resolve, 20));
  const call = async (method, path, body, headers = {}) => {
    const request = new Request(`https://mir.example.workers.dev${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
    });
    const response = await hub.fetch(request);
    return { status: response.status, data: await response.json().catch(() => null) };
  };
  call.hub = hub;
  return call;
};

const hex = (bytes) =>
  [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

const sha256 = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

let failures = 0;
const ok = (what, condition, detail = '') => {
  console.log(`${condition ? '  ✓' : '  ×'} ${what}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
};

console.log('Хостинг: Cloudflare Worker + Durable Object (поддельное хранилище)\n');

const storage = makeStorage();
let call = await boot(storage);
const admin = { 'X-Mir-Admin': 'owlananaslwo' };

const preflight = await call.hub.fetch(
  new Request('https://mir.example.workers.dev/api/admin/state', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://mir-ui.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,x-mir-admin',
    },
  }),
);
const allowedHeaders = (preflight.headers.get('access-control-allow-headers') || '')
  .split(',')
  .map((header) => header.trim().toLowerCase());
ok(
  'CORS preflight разрешает заголовок ключа администратора',
  preflight.status === 204 && allowedHeaders.includes('x-mir-admin'),
  `${preflight.status}; ${allowedHeaders.join(', ')}`,
);

const oversizedBody = JSON.stringify({ value: 'x'.repeat(MAX_REQUEST_BYTES) });
const oversizedResponse = await call.hub.fetch(
  new Request('https://mir.example.workers.dev/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: oversizedBody,
  }),
);
ok(
  'запрос больше лимита 512 КиБ отклоняется до разбора JSON',
  oversizedResponse.status === 413,
  `${oversizedResponse.status}`,
);

let durableLookups = 0;
const boundedEnv = {
  HUB: {
    idFromName: () => { durableLookups += 1; return 'mir'; },
    get: () => ({ fetch: async () => new Response('Durable Object should not be reached') }),
  },
  ASSETS: { fetch: async () => new Response('unused') },
};
const declaredOversizedResponse = await worker.fetch(
  new Request('https://mir.example.workers.dev/api/register', {
    method: 'POST',
    headers: { 'Content-Length': String(MAX_REQUEST_BYTES + 1) },
    body: '{}',
  }),
  boundedEnv,
);
ok(
  'входной Worker отклоняет заведомо большое тело до Durable Object',
  declaredOversizedResponse.status === 413 && durableLookups === 0,
  `${declaredOversizedResponse.status}; вызовов объекта: ${durableLookups}`,
);
const streamedBody = new ReadableStream({
  start(controller) {
    controller.enqueue(new Uint8Array(MAX_REQUEST_BYTES));
    controller.enqueue(new Uint8Array(1));
    controller.close();
  },
});
const streamedOversizedResponse = await worker.fetch(
  new Request('https://mir.example.workers.dev/api/register', {
    method: 'POST',
    body: streamedBody,
    duplex: 'half',
  }),
  boundedEnv,
);
ok(
  'входной Worker ограничивает chunked-тело без Content-Length',
  streamedOversizedResponse.status === 413 && durableLookups === 0,
  `${streamedOversizedResponse.status}; вызовов объекта: ${durableLookups}`,
);
const malformedResponse = await call.hub.fetch(
  new Request('https://mir.example.workers.dev/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  }),
);
ok('некорректный JSON получает 400', malformedResponse.status === 400, `${malformedResponse.status}`);

const salt = hex(16);
const passHash = await sha256(`${salt}:secret123`);
const registered = await call('POST', '/api/register', { name: 'cloudprobe', salt, passHash });
ok(
  'аккаунт регистрируется через воркер',
  registered.status === 200 && !!registered.data.token,
  `${registered.status} ${registered.data.error || ''}`,
);
const userId = registered.data.state?.users?.[0]?.id;

const state = await call('POST', '/api/admin/state', {}, admin);
ok('панель видит журнал и настройки', Array.isArray(state.data.events) && !!state.data.settings, `записей: ${state.data.events?.length}`);

const ban = await call('POST', '/api/admin/user', { userId, action: 'ban', reason: 'проверка', hours: 24 }, admin);
ok('аккаунт блокируется', ban.status === 200 && !!ban.data.users.find((u) => u.id === userId)?.ban, ban.data.error);

const blockedLogin = await call('POST', '/api/login', { name: 'cloudprobe', passHash });
ok(
  'заблокированному вход закрыт, и видно причину',
  blockedLogin.status === 403 && /заблокирован/i.test(blockedLogin.data.error || ''),
  `${blockedLogin.status} ${blockedLogin.data.error || ''}`,
);

const closed = await call('POST', '/api/admin/settings', { registrationOpen: false }, admin);
ok('регистрация закрывается из панели', closed.status === 200 && closed.data.settings?.registrationOpen === false);
const refused = await call('POST', '/api/register', { name: 'cloudrefused', salt, passHash });
ok('при закрытой регистрации аккаунт не создаётся', refused.status === 403, `${refused.status}`);
const journal = await call('POST', '/api/admin/state', {}, admin);
ok(
  'журнал записывает действия панели',
  (journal.data.events ?? []).some((event) => event.kind === 'admin:ban'),
  `записей: ${journal.data.events?.length}`,
);

/* Перезапуск: объект создаётся заново поверх того же хранилища. Ровно это
   происходит, когда Durable Object выгружается из памяти на Cloudflare. */
call = await boot(storage);
const after = await call('POST', '/api/admin/state', {}, admin);
const survived = after.data.users?.find((u) => u.id === userId);
ok('ключ панели действует после перезапуска', after.status === 200, `${after.status}`);
ok('блокировка переживает перезапуск', !!survived?.ban, JSON.stringify(survived?.ban ?? null));
ok('настройки переживают перезапуск', after.data.settings?.registrationOpen === false);
ok('журнал переживает перезапуск', (after.data.events ?? []).length > 0, `записей: ${after.data.events?.length}`);

const stillBlocked = await call('POST', '/api/login', { name: 'cloudprobe', passHash });
ok('после перезапуска блокировка всё ещё держит вход', stillBlocked.status === 403, `${stillBlocked.status}`);

const unban = await call('POST', '/api/admin/user', { userId, action: 'unban' }, admin);
ok('блокировка снимается', unban.status === 200 && !unban.data.users.find((u) => u.id === userId)?.ban);
const reopened = await call('POST', '/api/admin/settings', { registrationOpen: true }, admin);
ok('регистрация открывается обратно', reopened.data.settings?.registrationOpen === true);

/* Сбой записи не должен пометить кеш свежим: после восстановления
   следующая мутация повторит сохранение, и перезапуск не потеряет игрока. */
const retryStorage = makeStorage();
const workingPut = retryStorage.storage.put;
let putAttempts = 0;
retryStorage.storage.put = async (entries) => {
  putAttempts += 1;
  if (putAttempts <= 2) throw new Error('simulated storage outage');
  return workingPut(entries);
};
let retryCall = await boot(retryStorage);
const retrySalt = hex(16);
const retryPassHash = await sha256(`${retrySalt}:secret789`);
const failedWrite = await retryCall('POST', '/api/register', {
  name: 'persistprobe',
  salt: retrySalt,
  passHash: retryPassHash,
});
ok('ошибка записи не маскируется успешной регистрацией', failedWrite.status === 500, `${failedWrite.status}`);
const restoredWrite = await retryCall('POST', '/api/admin/settings', { registrationOpen: true }, admin);
ok('после сбоя хранилища повторная запись проходит', restoredWrite.status === 200 && putAttempts === 3, `попыток: ${putAttempts}`);
retryCall = await boot(retryStorage);
const restoredUser = await retryCall('POST', '/api/admin/state', {}, admin);
ok(
  'повторно сохранённый аккаунт переживает перезапуск объекта',
  restoredUser.status === 200 && restoredUser.data.users?.some((user) => user.name === 'persistprobe'),
);

const originalConsoleError = console.error;
const errorLogs = [];
console.error = (...values) => errorLogs.push(...values.map(String));
let failedWorkerResponse;
try {
  failedWorkerResponse = await worker.fetch(
    new Request('https://mir.example.workers.dev/api/failure?token=do-not-log'),
    {
      HUB: {
        idFromName: () => 'mir',
        get: () => ({ fetch: async () => { throw new Error('token=do-not-log'); } }),
      },
      ASSETS: { fetch: async () => new Response('unused') },
    },
  );
} finally {
  console.error = originalConsoleError;
}
const errorEvent = JSON.parse(errorLogs[0] || '{}');
const failureBody = await failedWorkerResponse.json();
ok(
  'ошибка Durable Object даёт 503 и структурный лог без query/секрета',
  failedWorkerResponse.status === 503 &&
    failureBody.error === 'Хаб временно недоступен.' &&
    errorEvent.event === 'mir_hub_request_failed' &&
    errorEvent.path === '/api/failure' &&
    !JSON.stringify(errorEvent).includes('do-not-log'),
  `${failedWorkerResponse.status} ${errorEvent.event || 'лога нет'}`,
);

console.log(failures === 0 ? '\nВСЁ ХОРОШО' : `\nПЛОХО: провалов ${failures}`);
process.exit(failures === 0 ? 0 : 1);
