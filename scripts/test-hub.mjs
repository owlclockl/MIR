/* Живая проверка хаба по его адресу: регистрация, вход, друзья,
   коды-приглашения, аватарка, смена пароля и сигналинг P2P.

   Один и тот же сценарий гоняется и по хабу на ПК, и по хабу,
   выложенному на бесплатный хостинг: ядро у них общее
   (`server/hub-core.mjs`), значит и вести себя они обязаны
   одинаково. Если хостинг что-то урезал — это видно здесь, а не
   в бою посреди игры с друзьями.

   Запуск:
     npm run test:hub                       # хаб на 127.0.0.1:4173
     npm run test:hub -- https://адрес      # хаб на хостинге
     npm run test:hub -- --keep             # не убирать за собой

   Проверка ничего не ломает: создаются временные аккаунты с
   случайными именами (probeNNNN — ни с кем не пересекаются), в конце
   они разлогиниваются. Панель админа тоже проверяется: чужой ключ,
   переименование, сброс пароля, отключение, разрыв дружбы, удаление
   и смена ключа администратора — на своих же временных аккаунтах,
   которые проверка за собой убирает, а ключ в конце возвращается
   к исходному. */

const args = process.argv.slice(2).filter((a) => a !== '--keep');
const BASE = (args[0] || process.env.MIR_HUB || 'http://127.0.0.1:4173').replace(/\/+$/, '');

/* Ключ панели админа. По умолчанию заводской (в открытом исходнике);
   если владелец задал свой (MIR_ADMIN_KEY или сменил в панели) —
   проверяем его. Панель на хабе включена всегда. */
const ADMIN_KEY = process.env.MIR_ADMIN_KEY || 'owlananaslwo';

let failures = 0;
const ok = (what, detail = '') => console.log(`  ✓ ${what}${detail ? ` — ${detail}` : ''}`);
const bad = (what, detail = '') => {
  failures += 1;
  console.log(`  × ${what}${detail ? ` — ${detail}` : ''}`);
};

const call = async (method, path, { body, token, admin, timeout = 30_000 } = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(admin ? { 'X-Mir-Admin': admin } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, headers: response.headers };
};

const expect = (what, condition, detail = '') => (condition ? ok(what, detail) : bad(what, detail));

/* Пароли по сети не ходят: хеш считается на устройстве. Хаб видит
   только salt и SHA-256 — повторяем это и в проверке. */
const hex = (bytes) =>
  [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const sha256 = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/* Хаб пускает 10 регистраций в минуту с одного адреса — это защита от
   чужих, а не от проверки. Если проверку запустили сразу после такой же
   (в том числе этого же файла), подождём окно и продолжим: падать на
   собственном лимите проверка не должна. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const makeAccount = async (name, password) => {
  const salt = hex(16);
  const passHash = await sha256(`${salt}:${password}`);
  let { status, data } = await call('POST', '/api/register', { body: { name, salt, passHash } });
  for (let attempt = 0; status === 429 && attempt < 4; attempt += 1) {
    console.log('  · лимит запросов: ждём 20 секунд и пробуем снова');
    await sleep(20_000);
    ({ status, data } = await call('POST', '/api/register', { body: { name, salt, passHash } }));
  }
  if (status !== 200) throw new Error(`регистрация ${name}: ${status} ${data.error || ''}`);
  const me = data.state.users.find((u) => u.nameKey === name.toLowerCase());
  return { name, password, salt, passHash, token: data.token, id: me.id, invite: me.inviteCode };
};

console.log(`Хаб: ${BASE}`);

/* ---------- 1. живой ли он вообще ---------- */

const ping = await call('GET', '/api/ping', { timeout: 15_000 }).catch((error) => {
  console.log(`  × хаб не отвечает — ${error.message}`);
  console.log('\nПЛОХО: адрес недоступен. Проверьте, что сервер запущен и ссылка верна.');
  process.exit(1);
});
expect('ping', ping.status === 200 && ping.data.hub === 'mir', `игроков на хабе: ${ping.data.users}`);
expect(
  'CORS разрешён (игру можно открыть с другого адреса)',
  ping.headers.get('access-control-allow-origin') === '*',
  ping.headers.get('access-control-allow-origin') || 'заголовка нет',
);

const preflight = await fetch(`${BASE}/api/admin/state`, {
  method: 'OPTIONS',
  headers: {
    Origin: 'https://mir-ui.example',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type,x-mir-admin',
  },
});
const allowedHeaders = (preflight.headers.get('access-control-allow-headers') || '')
  .split(',')
  .map((header) => header.trim().toLowerCase());
expect(
  'префлайт разрешает JSON и заголовок ключа админа',
  preflight.status === 204 && allowedHeaders.includes('content-type') && allowedHeaders.includes('x-mir-admin'),
  `${preflight.status}; разрешено: ${allowedHeaders.join(', ') || 'ничего'}`,
);

/* ---------- 2. аккаунты ---------- */

const n = Math.floor(Math.random() * 9000) + 1000;
const A = await makeAccount(`probeA${n}`, 'secret123');
const B = await makeAccount(`probeB${n}`, 'secret456');
ok('регистрация двух игроков', `${A.name} и ${B.name}`);

const dup = await call('POST', '/api/register', {
  body: { name: A.name, salt: hex(16), passHash: await sha256('x') },
});
expect('занятое имя отклонено', dup.status === 409, dup.data.error);

const badName = await call('POST', '/api/register', {
  body: { name: 'ab', salt: hex(16), passHash: await sha256('x') },
});
expect('короткое имя отклонено', badName.status === 400, badName.data.error);

const salt = await call('GET', `/api/salt?name=${encodeURIComponent(A.name)}`);
expect('соль выдаётся по имени', salt.status === 200 && salt.data.salt === A.salt);

const login = await call('POST', '/api/login', { body: { name: A.name, passHash: A.passHash } });
expect('вход по хешу пароля', login.status === 200 && !!login.data.token);
A.token = login.data.token;

const wrong = await call('POST', '/api/login', { body: { name: A.name, passHash: await sha256('нет') } });
expect('неверный пароль отклонён', wrong.status === 401, wrong.data.error);

const noToken = await call('GET', '/api/state');
expect('без токена состояние не отдаётся', noToken.status === 401, noToken.data.error);

/* ---------- 3. друзья ---------- */

const selfCode = await call('POST', '/api/invite/use', { token: A.token, body: { code: A.invite } });
expect('свой код не принимается', selfCode.status === 400, selfCode.data.error);

const noCode = await call('POST', '/api/invite/use', { token: A.token, body: { code: 'ZZZZ-ZZZZ' } });
expect('чужой несуществующий код → 404', noCode.status === 404, noCode.data.error);

const used = await call('POST', '/api/invite/use', { token: B.token, body: { code: A.invite } });
expect('код-приглашение подружил', used.status === 200 && used.data.result.ownerId === A.id);

const stateA = await call('GET', '/api/state', { token: A.token });
const meA = stateA.data.users.find((u) => u.id === A.id);
expect('дружба видна с обеих сторон', meA.friends.includes(B.id), `друзей у ${A.name}: ${meA.friends.length}`);
expect('чужой код-приглашение скрыт', !stateA.data.users.find((u) => u.id === B.id).inviteCode);

/* ---------- 4. профиль ---------- */

const avatar = `data:image/png;base64,${'A'.repeat(512)}`;
const setAvatar = await call('POST', '/api/avatar', { token: A.token, body: { avatar } });
expect('аватарка сохраняется', setAvatar.status === 200);
const heavy = await call('POST', '/api/avatar', {
  token: A.token,
  body: { avatar: `data:image/png;base64,${'A'.repeat(400 * 1024)}` },
});
expect('слишком тяжёлая аватарка отклонена', heavy.status === 400 || heavy.status === 413, heavy.data.error);

const renamed = `${A.name}x`;
const rename = await call('POST', '/api/name', { token: A.token, body: { name: renamed } });
expect('смена никнейма', rename.status === 200 && rename.data.state.users.find((u) => u.id === A.id)?.name === renamed);
const occupiedRename = await call('POST', '/api/name', { token: A.token, body: { name: B.name } });
expect('занятый никнейм отклонён', occupiedRename.status === 409, occupiedRename.data.error);
const renameBack = await call('POST', '/api/name', { token: A.token, body: { name: A.name } });
expect('никнейм возвращён обратно', renameBack.status === 200);

const newSalt = hex(16);
const newHash = await sha256(`${newSalt}:другойпароль`);
const pass = await call('POST', '/api/password', {
  token: A.token,
  body: { oldHash: A.passHash, newSalt, newHash },
});
expect('смена пароля', pass.status === 200);
const back = await call('POST', '/api/password', {
  token: A.token,
  body: { oldHash: newHash, newSalt: A.salt, newHash: A.passHash },
});
expect('пароль возвращён обратно', back.status === 200);

/* ---------- 5. сигналинг P2P ---------- */

/* Длинный опрос: B висит на входящих, A шлёт сигнал — ответ обязан
   прийти сразу, а не через двадцать секунд. Так поднимается прямая
   связь между игроками. */
const started = Date.now();
const waiting = call('GET', '/api/p2p/inbox?wait=1', { token: B.token, timeout: 40_000 });
await new Promise((r) => setTimeout(r, 400));
const signal = await call('POST', '/api/p2p/signal', {
  token: A.token,
  body: { batch: [{ to: B.id, kind: 'relay', data: { hello: 'проверка' } }] },
});
expect('сигнал отправлен другу', signal.status === 200 && signal.data.sent === 1);

const inbox = await waiting;
const got = inbox.data.messages?.[0];
expect(
  'длинный опрос доставил сигнал',
  inbox.status === 200 && got?.from === A.id && got?.data?.hello === 'проверка',
  `${Date.now() - started} мс`,
);

const stranger = await makeAccount(`probeC${n}`, 'secret789');
const notFriend = await call('POST', '/api/p2p/signal', {
  token: stranger.token,
  body: { batch: [{ to: A.id, kind: 'relay', data: { x: 1 } }] },
});
expect('чужому сигналить нельзя', notFriend.status === 403, notFriend.data.error);

const empty = await call('GET', '/api/p2p/inbox', { token: A.token });
expect('пустой ящик отвечает сразу', empty.status === 200 && Array.isArray(empty.data.messages));

/* ---------- 6. панель админа ---------- */

const adminBadKey = await call('POST', '/api/admin/ping', { admin: 'wrong-key-000', body: {} });
expect(
  'чужой ключ в панель не пускает',
  adminBadKey.status === 403 || adminBadKey.status === 429,
  `${adminBadKey.status} ${adminBadKey.data.error || ''}`,
);

const adminPing = await call('POST', '/api/admin/ping', { admin: ADMIN_KEY, body: {} });
{
  expect(
    'ключ админа принят',
    adminPing.status === 200 && adminPing.data.ok === true,
    `игроков: ${adminPing.data.stats?.users}`,
  );

  const adminState = await call('POST', '/api/admin/state', { admin: ADMIN_KEY, body: {} });
  expect(
    'панель видит игроков и заявки',
    adminState.status === 200 && Array.isArray(adminState.data.users) && Array.isArray(adminState.data.requests),
    `игроков: ${adminState.data.users?.length}, заявок: ${adminState.data.requests?.length}`,
  );
  expect(
    'в снимке панели нет хешей паролей',
    !JSON.stringify(adminState.data).includes('passHash'),
  );
  expect(
    'панель сообщает, заводской ли ключ',
    adminState.data.key?.isDefault === (ADMIN_KEY === 'owlananaslwo'),
    `key.isDefault: ${adminState.data.key?.isDefault}`,
  );

  const target = await makeAccount(`probeA${n}x`, 'secret321');
  const renamed = (target.name + 'r').slice(0, 16);
  const rename = await call('POST', '/api/admin/user', {
    admin: ADMIN_KEY,
    body: { userId: target.id, action: 'rename', name: renamed },
  });
  expect(
    'панель переименовывает игрока',
    rename.status === 200 && rename.data.users.some((u) => u.id === target.id && u.name === renamed),
    rename.data.error,
  );

  const nextSalt = hex(16);
  const nextHash = await sha256(`${nextSalt}:adminpass1`);
  const reset = await call('POST', '/api/admin/user', {
    admin: ADMIN_KEY,
    body: { userId: target.id, action: 'password', salt: nextSalt, hash: nextHash },
  });
  expect('панель сбрасывает пароль без открытого текста', reset.status === 200, reset.data.error);
  const relogin = await call('POST', '/api/login', { body: { name: renamed, passHash: nextHash } });
  expect(
    'после сброса вход идёт с новым паролем',
    relogin.status === 200 && relogin.data.token,
    `старым: ${(await call('POST', '/api/login', { body: { name: renamed, passHash: target.passHash } })).status}`,
  );

  const kick = await call('POST', '/api/admin/user', {
    admin: ADMIN_KEY,
    body: { userId: target.id, action: 'kick' },
  });
  const kicked = kick.data.users?.find((u) => u.id === target.id);
  expect('панель отключает игрока от хаба', kick.status === 200 && kicked && !kicked.online && kicked.tokens === 0);

  /* Дружба и её разрыв: сводим два временных аккаунта и разводим панелью. */
  const pair = await makeAccount(`probeF${n}x`, 'secret321');
  const friend = await makeAccount(`probeG${n}x`, 'secret321');
  await call('POST', '/api/invite/use', { token: friend.token, body: { code: pair.invite } });
  const linked = await call('GET', '/api/state', { token: pair.token });
  expect(
    'перед разрывом они друзья',
    linked.data.users?.find((u) => u.id === pair.id)?.friends.includes(friend.id) === true,
    linked.data.error,
  );
  const unlink = await call('POST', '/api/admin/user', {
    admin: ADMIN_KEY,
    body: { userId: pair.id, action: 'unlink', friendId: friend.id },
  });
  expect(
    'панель разрывает дружбу с обеих сторон',
    unlink.status === 200 &&
      !unlink.data.users.find((u) => u.id === pair.id).friends.includes(friend.id) &&
      !unlink.data.users.find((u) => u.id === friend.id).friends.includes(pair.id),
  );

  const drop = await call('POST', '/api/admin/user', {
    admin: ADMIN_KEY,
    body: { userId: friend.id, action: 'delete' },
  });
  expect(
    'панель удаляет аккаунт',
    drop.status === 200 && !drop.data.users.some((u) => u.id === friend.id),
  );
  const gone = await call('POST', '/api/admin/user', {
    admin: ADMIN_KEY,
    body: { userId: friend.id, action: 'delete' },
  });
  expect('повторное удаление → 404', gone.status === 404, gone.data.error);

  await call('POST', '/api/admin/user', {
    admin: ADMIN_KEY,
    body: { userId: target.id, action: 'delete' },
  });
  await call('POST', '/api/admin/user', {
    admin: ADMIN_KEY,
    body: { userId: pair.id, action: 'delete' },
  });

  /* Блокировка: вход закрыт, живая сессия не работает, снятие возвращает
     доступ. Заблокированный игрок должен видеть причину, а не «неверный
     пароль», — иначе он будет сбрасывать пароль вместо обращения к админу. */
  const blockedUser = await makeAccount(`probeB${n}x`, 'secret654');
  const ban = await call('POST', '/api/admin/user', {
    admin: ADMIN_KEY,
    body: { userId: blockedUser.id, action: 'ban', reason: 'проверка', hours: 1 },
  });
  const bannedShape = ban.data.users?.find((u) => u.id === blockedUser.id);
  expect('панель блокирует аккаунт', ban.status === 200 && !!bannedShape?.ban, ban.data.error);
  expect(
    'блокировка помнит причину и срок',
    bannedShape?.ban?.reason === 'проверка' && bannedShape?.ban?.until > Date.now(),
    JSON.stringify(bannedShape?.ban),
  );
  const bannedLogin = await call('POST', '/api/login', {
    body: { name: blockedUser.name, passHash: blockedUser.passHash },
  });
  expect(
    'заблокированному вход закрыт (и это видно по причине)',
    bannedLogin.status === 403 && /заблокирован/i.test(bannedLogin.data.error || ''),
    `${bannedLogin.status} ${bannedLogin.data.error || ''}`,
  );
  const bannedState = await call('GET', '/api/state', { token: blockedUser.token });
  expect(
    'сессию заблокированного хаб отзывает сразу (401 или 403)',
    bannedState.status === 401 || bannedState.status === 403,
    `${bannedState.status} ${bannedState.data.error || ''}`,
  );

  const forever = await call('POST', '/api/admin/user', {
    admin: ADMIN_KEY,
    body: { userId: blockedUser.id, action: 'ban', hours: 0 },
  });
  expect(
    'блокировка без срока — навсегда',
    forever.data.users?.find((u) => u.id === blockedUser.id)?.ban?.until === 0,
  );

  const unban = await call('POST', '/api/admin/user', {
    admin: ADMIN_KEY,
    body: { userId: blockedUser.id, action: 'unban' },
  });
  expect(
    'панель снимает блокировку',
    unban.status === 200 && !unban.data.users.find((u) => u.id === blockedUser.id)?.ban,
  );
  const afterUnban = await call('POST', '/api/login', {
    body: { name: blockedUser.name, passHash: blockedUser.passHash },
  });
  expect('после разблокировки вход снова открыт', afterUnban.status === 200 && !!afterUnban.data.token);
  const staleToken = await call('GET', '/api/state', { token: blockedUser.token });
  expect(
    'снятие блокировки не возвращает старую сессию',
    staleToken.status === 401,
    `${staleToken.status}`,
  );
  await call('POST', '/api/offline', { token: afterUnban.data.token, body: { token: afterUnban.data.token } });
  await call('POST', '/api/admin/user', {
    admin: ADMIN_KEY,
    body: { userId: blockedUser.id, action: 'delete' },
  });

  /* Регистрация закрывается и открывается из панели: так владелец
     перекрывает хабу доступ, когда играет своим кругом. */
  const closed = await call('POST', '/api/admin/settings', {
    admin: ADMIN_KEY,
    body: { registrationOpen: false },
  });
  expect(
    'панель закрывает регистрацию',
    closed.status === 200 && closed.data.settings?.registrationOpen === false,
    closed.data.error,
  );
  const refused = await call('POST', '/api/register', {
    body: { name: `probeQ${n}x`, salt: hex(16), passHash: await sha256('secret654') },
  });
  expect(
    'при закрытой регистрации новый аккаунт не создаётся',
    refused.status === 403,
    `${refused.status} ${refused.data.error || ''}`,
  );
  const reopened = await call('POST', '/api/admin/settings', {
    admin: ADMIN_KEY,
    body: { registrationOpen: true },
  });
  expect(
    'панель открывает регистрацию обратно',
    reopened.status === 200 && reopened.data.settings?.registrationOpen === true,
  );

  /* Журнал панели: события копятся, свежие впереди, очистка работает. */
  const journal = await call('POST', '/api/admin/state', { admin: ADMIN_KEY, body: {} });
  const events = journal.data.events ?? [];
  const kinds = new Set(events.map((e) => e.kind));
  expect('журнал панели ведёт записи', Array.isArray(events) && events.length > 0, `записей: ${events.length}`);
  expect(
    'в журнале есть регистрация, вход и действия панели',
    kinds.has('register') && kinds.has('login') && kinds.has('admin:ban') && kinds.has('admin:settings'),
    [...kinds].slice(0, 10).join(', '),
  );
  expect('журнал не выдаёт хеши паролей', !JSON.stringify(events).includes('passHash'));
  expect(
    'журнал идёт свежими записями вперёд',
    events.length < 2 || (events[0].at ?? 0) >= (events[events.length - 1].at ?? 0),
  );

  const cleared = await call('POST', '/api/admin/events', { admin: ADMIN_KEY, body: { clear: true } });
  expect(
    'журнал очищается из панели (и это видно одной записью)',
    cleared.status === 200 &&
      cleared.data.events?.length === 1 &&
      cleared.data.events[0].kind === 'admin:events-clear',
    `записей: ${cleared.data.events?.length}`,
  );

  /* Смена ключа панели: новый принимается, старый отзывается, короткий
     и заводской отклоняются, сброс возвращает исходный ключ. Ключ хаба
     трогаем только на время проверки и возвращаем обратно. */
  const probeKey = `probe-key-${n}`;
  const changed = await call('POST', '/api/admin/key', { admin: ADMIN_KEY, body: { key: probeKey } });
  expect('панель меняет ключ администратора', changed.status === 200 && changed.data.ok === true, changed.data.error);
  const oldKey = await call('POST', '/api/admin/ping', { admin: ADMIN_KEY, body: {} });
  expect('старый ключ после смены не пускает', oldKey.status === 403, `${oldKey.status}`);
  const newKey = await call('POST', '/api/admin/ping', { admin: probeKey, body: {} });
  expect('новый ключ пускает в панель', newKey.status === 200, `${newKey.status}`);
  const shortKey = await call('POST', '/api/admin/key', { admin: probeKey, body: { key: 'abc' } });
  expect('слишком короткий ключ отклонён', shortKey.status === 400, shortKey.data.error);
  const defaultKey = await call('POST', '/api/admin/key', { admin: probeKey, body: { key: 'owlananaslwo' } });
  expect('заводской ключ отклонён как новый', defaultKey.status === 400, defaultKey.data.error);
  const keyReset = await call('POST', '/api/admin/key', { admin: probeKey, body: { reset: true } });
  expect('сброс возвращает прежний ключ', keyReset.status === 200 && keyReset.data.ok === true, keyReset.data.error);
  const afterReset = await call('POST', '/api/admin/ping', { admin: ADMIN_KEY, body: {} });
  expect('после сброса снова исходный ключ', afterReset.status === 200, `${afterReset.status}`);
}

/* ---------- 5б. лобби и живая карта ----------
   Лобби живёт в хабе: состав и параметры — по HTTP, карта и ход лобби —
   по WebSocket (/api/ws). Проверяем оба канала и правило «карту шлёт
   только мастер», которое держит сервер, а не интерфейс. */

const wsBase = BASE.replace(/^http/, 'ws');
const lobbyCode = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

const waitInbox = async (inbox, match, timeout = 8000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const index = inbox.findIndex(match);
    if (index >= 0) return inbox.splice(index, 1)[0];
    if (Date.now() > until) return null;
    await sleep(20);
  }
};

/* Открываем сокет и складываем входящие (JSON и бинарь) в очередь. */
const openSocket = (timeout = 8000) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}/api/ws`);
    ws.binaryType = 'arraybuffer';
    const inbox = [];
    const client = {
      ws,
      inbox,
      closed: null,
      send: (value) => ws.send(value),
      take: (match, ms) => waitInbox(inbox, match, ms),
      /* Удобно ждать конкретный тип: take(t('lobby')). */
      kind: (type) => (msg) => msg.t === type,
    };
    ws.onmessage = (event) => {
      inbox.push(
        typeof event.data === 'string'
          ? JSON.parse(event.data)
          : { t: 'bin', bytes: new Uint8Array(event.data) },
      );
    };
    ws.onclose = (event) => {
      client.closed = { code: event.code, reason: event.reason };
    };
    ws.onopen = () => resolve(client);
    ws.onerror = () => reject(new Error('сокет не открылся'));
    setTimeout(() => reject(new Error('сокет не открылся вовремя')), timeout);
  });

/* Кадр карты: [u32 длина заголовка][JSON][полезная нагрузка]. Сервер не
   распаковывает gzip, поэтому здесь достаточно случайных байтов. */
const mapFrame = (header, payloadBytes = 4000) => {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const payload = crypto.getRandomValues(new Uint8Array(payloadBytes));
  const out = new Uint8Array(4 + json.length + payload.length);
  new DataView(out.buffer).setUint32(0, json.length);
  out.set(json, 4);
  out.set(payload, 4 + json.length);
  return out;
};

const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const noLobbyToken = await call('GET', '/api/lobby');
expect('лобби без входа закрыто', noLobbyToken.status === 401, `${noLobbyToken.status}`);

const badSize = await call('POST', '/api/lobby/create', {
  token: A.token,
  body: { seed: 'lobby-test', width: 999, height: 999 },
});
expect('лобби с чужим размером карты → 400', badSize.status === 400, badSize.data.error);

const emptySeed = await call('POST', '/api/lobby/create', {
  token: A.token,
  body: { seed: '   ', width: 1280, height: 800 },
});
expect('лобби без seed → 400', emptySeed.status === 400, emptySeed.data.error);

const created = await call('POST', '/api/lobby/create', {
  token: A.token,
  body: { seed: `lobby-${n}`, width: 1280, height: 800 },
});
expect('мастер создаёт лобби', created.status === 200 && lobbyCode.test(created.data.lobby?.code), created.data.lobby?.code);
expect('создатель — мастер', created.data.lobby?.role === 'master');
const LOBBY = created.data.lobby;

const twice = await call('POST', '/api/lobby/create', {
  token: A.token,
  body: { seed: 'again', width: 1280, height: 800 },
});
expect('второе лобби того же мастера → 409', twice.status === 409, twice.data.error);

const strangerInvite = await call('POST', '/api/lobby/invite', {
  token: A.token,
  body: { friendId: stranger.id },
});
expect('приглашать можно только друзей → 403', strangerInvite.status === 403, strangerInvite.data.error);

const invited = await call('POST', '/api/lobby/invite', { token: A.token, body: { friendId: B.id } });
expect('друг получает приглашение', invited.status === 200 && invited.data.ok === true, invited.data.error);

const bState = await call('GET', '/api/lobby', { token: B.token });
const invite = bState.data.invites?.find((item) => item.lobbyId === LOBBY.id);
expect('приглашение видно в списке друга', !!invite && invite.code === LOBBY.code, invite?.fromName);

const declinedTry = await call('POST', '/api/lobby/invite/decline', {
  token: stranger.token,
  body: { lobbyId: LOBBY.id },
});
expect('чужое отклонение не трогает приглашение друга', declinedTry.status === 200 && (await call('GET', '/api/lobby', { token: B.token })).data.invites.length === 1);

const accepted = await call('POST', '/api/lobby/invite/accept', { token: B.token, body: { lobbyId: LOBBY.id } });
expect('друг принимает приглашение', accepted.status === 200 && accepted.data.lobby?.members.length === 2, accepted.data.error);
expect('принятое приглашение пропадает', !accepted.data.invites?.some((item) => item.lobbyId === LOBBY.id));

const playerParams = await call('POST', '/api/lobby/params', {
  token: B.token,
  body: { seed: 'hijack', width: 1280, height: 800 },
});
expect('игрок не меняет параметры карты → 403', playerParams.status === 403, playerParams.data.error);

const playerKick = await call('POST', '/api/lobby/kick', { token: B.token, body: { userId: A.id } });
expect('игрок не исключает мастера → 403', playerKick.status === 403, playerKick.data.error);

const byCode = await call('POST', '/api/lobby/join', { token: stranger.token, body: { code: LOBBY.code.toLowerCase() } });
expect('вход по коду (в любом регистре) → 200', byCode.status === 200 && byCode.data.lobby?.members.length === 3, byCode.data.error);
const leftByCode = await call('POST', '/api/lobby/leave', { token: stranger.token, body: {} });
expect('игрок выходит из лобби', leftByCode.status === 200 && leftByCode.data.lobby === null);

const badCode = await call('POST', '/api/lobby/join', { token: stranger.token, body: { code: 'ZZ' } });
expect('кривой код → 400', badCode.status === 400, badCode.data.error);
const noLobbyCode = await call('POST', '/api/lobby/join', { token: stranger.token, body: { code: 'ZZZZ-ZZZZ' } });
expect('несуществующий код → 404', noLobbyCode.status === 404, noLobbyCode.data.error);

const paramsOk = await call('POST', '/api/lobby/params', {
  token: A.token,
  body: { seed: `lobby-${n}-v2`, width: 1600, height: 1000 },
});
expect('мастер меняет карту лобби', paramsOk.status === 200 && paramsOk.data.lobby?.seed === `lobby-${n}-v2`, paramsOk.data.error);

/* --- живой канал --- */

const sMaster = await openSocket();
const sPlayer = await openSocket();
const sNoAuth = await openSocket();

sNoAuth.send(JSON.stringify({ t: 'watch' }));
const needAuth = await sNoAuth.take(sNoAuth.kind('error'));
expect('без входа в сессию сокет получает отказ', needAuth?.message?.includes('войдите'), needAuth?.message);
await sleep(100);
expect('и закрывается с кодом 4001', sNoAuth.closed?.code === 4001, JSON.stringify(sNoAuth.closed));

const sBadToken = await openSocket();
sBadToken.send(JSON.stringify({ t: 'auth', token: 'ненастоящий' }));
await sleep(150);
expect('чужой токен на сокете → закрытие 4001', sBadToken.closed?.code === 4001, JSON.stringify(sBadToken.closed));

sMaster.send(JSON.stringify({ t: 'auth', token: A.token }));
const readyMaster = await sMaster.take(sMaster.kind('ready'));
expect('мастер входит по сокету и видит своё лобби', readyMaster?.lobby?.id === LOBBY.id && readyMaster.lobby.role === 'master', readyMaster?.lobby?.role);

sPlayer.send(JSON.stringify({ t: 'auth', token: B.token }));
const readyPlayer = await sPlayer.take(sPlayer.kind('ready'));
expect('игрок входит по сокету в то же лобби', readyPlayer?.lobby?.id === LOBBY.id && readyPlayer.lobby.role === 'player');

const presenceOn = await sMaster.take((msg) => msg.t === 'lobby' && msg.lobby?.members.some((m) => m.id === B.id && m.online));
expect('мастер видит игрока в сети', !!presenceOn);

sPlayer.send(JSON.stringify({ t: 'watch' }));
const watchEmpty = await sPlayer.take(sPlayer.kind('watched'));
expect('карты ещё нет: watched hasMap=false', watchEmpty?.hasMap === false && watchEmpty.role === 'player', JSON.stringify(watchEmpty));
const needMap = await sMaster.take(sMaster.kind('need-map'));
expect('мастер получает need-map и публикует карту', needMap?.lobbyId === LOBBY.id);

const frame1 = mapFrame({ t: 'map', lobbyId: LOBBY.id, seed: `lobby-${n}-v2`, width: 1600, height: 1000, enc: 'gzip' });
sMaster.send(frame1);
const got1 = await sPlayer.take((msg) => msg.t === 'bin');
expect('кадр мастера доходит игроку без изменений', !!got1 && sameBytes(got1.bytes, frame1), `${got1?.bytes.length} байт`);
const ack1 = await sMaster.take(sMaster.kind('ack'));
expect('мастер получает подтверждение доставки', ack1?.seq === 1 && ack1.delivered === 1, JSON.stringify(ack1));

sPlayer.send(mapFrame({ t: 'map', lobbyId: LOBBY.id, seed: 'подмена', width: 1280, height: 800, enc: 'gzip' }));
const playerFrame = await sPlayer.take(sPlayer.kind('error'));
expect('кадр от игрока отброшен сервером', playerFrame?.message?.includes('только мастер'), playerFrame?.message);

sMaster.send(new Uint8Array([0, 0, 0, 9, 1, 2, 3]));
const broken = await sMaster.take(sMaster.kind('error'));
expect('испорченный кадр отвергнут', broken?.message === 'Кадр карты повреждён.', broken?.message);

sMaster.send(mapFrame({ t: 'map', lobbyId: 'l_чужое', seed: 'x', width: 1280, height: 800, enc: 'gzip' }));
const foreign = await sMaster.take(sMaster.kind('error'));
expect('кадр чужого лобби отвергнут', foreign?.message === 'Кадр карты повреждён.', foreign?.message);

sMaster.send(mapFrame({ t: 'map', lobbyId: LOBBY.id, seed: 'x', width: 777, height: 1, enc: 'gzip' }));
const badSizeFrame = await sMaster.take(sMaster.kind('error'));
expect('кадр с чужим размером отвергнут', badSizeFrame?.message === 'Кадр карты повреждён.', badSizeFrame?.message);

sPlayer.send(JSON.stringify({ t: 'watch' }));
const watchHas = await sPlayer.take(sPlayer.kind('watched'));
expect('поздний вход получает кадр из памяти', watchHas?.hasMap === true && watchHas.seq === 1, JSON.stringify(watchHas));
const late = await sPlayer.take((msg) => msg.t === 'bin');
expect('и сам кадр вслед за ответом', !!late && sameBytes(late.bytes, frame1));

sMaster.send(JSON.stringify({ t: 'progress', step: 'heights', name: 'Высоты рельефа', index: 3, total: 40 }));
const progress = await sPlayer.take(sPlayer.kind('progress'));
expect('ход генерации мастера виден игроку', progress?.index === 3 && progress.total === 40 && progress.name === 'Высоты рельефа', JSON.stringify(progress));

const kicked = await call('POST', '/api/lobby/kick', { token: A.token, body: { userId: B.id } });
expect('мастер исключает игрока', kicked.status === 200 && kicked.data.lobby?.members.length === 1, kicked.data.error);
const kickMsg = await sPlayer.take(sPlayer.kind('closed'));
expect('исключённый получает причину kicked', kickMsg?.reason === 'kicked', JSON.stringify(kickMsg));
const bAfterKick = await call('GET', '/api/lobby', { token: B.token });
expect('после исключения лобби у игрока пустое', bAfterKick.data.lobby === null);

const reinvite = await call('POST', '/api/lobby/invite', { token: A.token, body: { friendId: B.id } });
const liveInvite = await sPlayer.take((msg) => msg.t === 'invites' && msg.invites.some((item) => item.lobbyId === LOBBY.id));
expect('приглашение приходит по открытому сокету сразу', reinvite.status === 200 && !!liveInvite, liveInvite?.invites.length);
const reaccept = await call('POST', '/api/lobby/invite/accept', { token: B.token, body: { lobbyId: LOBBY.id } });
expect('исключённого можно пригласить снова и он вернулся', reaccept.status === 200 && reaccept.data.lobby?.members.length === 2);

/* Игрок падает с сокета — мастер видит, что он вышел из сети. */
sPlayer.ws.close();
const offlineSeen = await sMaster.take((msg) => msg.t === 'lobby' && msg.lobby?.members.some((m) => m.id === B.id && !m.online));
expect('обрыв сокета виден мастеру как «не в сети»', !!offlineSeen);

const masterLeaves = await call('POST', '/api/lobby/leave', { token: A.token, body: {} });
expect('мастер закрывает лобби', masterLeaves.status === 200 && masterLeaves.data.lobby === null);
const closedMsg = await sMaster.take(sMaster.kind('closed'));
expect('мастер тоже получает closed (master-left)', closedMsg?.reason === 'master-left', JSON.stringify(closedMsg));
const bAfterClose = await call('GET', '/api/lobby', { token: B.token });
expect('лобби пропало и у игрока', bAfterClose.data.lobby === null && bAfterClose.data.invites.length === 0);

sMaster.ws.close();
sBadToken.ws.close();
sNoAuth.ws.close();

/* ---------- 7. уход из меню и явный выход ----------

   Разница принципиальная: закрытие вкладки и обновление страницы (F5)
   отмечают «не в меню», но токен устройства цел — иначе после каждого
   обновления игрока выбрасывало бы из аккаунта. Отзывает токен только
   явный выход из аккаунта. */

const offA = await call('POST', '/api/offline', { token: A.token, body: { token: A.token } });
const offB = await call('POST', '/api/offline', { token: B.token, body: { token: B.token } });
const offC = await call('POST', '/api/offline', { token: stranger.token, body: { token: stranger.token } });
expect('выход из сети', offA.status === 200 && offB.status === 200 && offC.status === 200);

const afterOffline = await call('GET', '/api/state', { token: A.token });
expect(
  'уход из меню не отзывает сессию: вход переживает обновление страницы',
  afterOffline.status === 200,
  `${afterOffline.status} ${afterOffline.data.error || ''}`,
);

const signedOut = await call('POST', '/api/logout', { token: A.token, body: { token: A.token } });
expect('явный выход принят', signedOut.status === 200, signedOut.data.error);
const afterLogout = await call('GET', '/api/state', { token: A.token });
expect('после явного выхода токен не работает', afterLogout.status === 401, `${afterLogout.status}`);

/* Выход одного устройства не должен трогать другие: у каждого свой токен. */
const relogin = await call('POST', '/api/login', { body: { name: A.name, passHash: A.passHash } });
const secondDevice = relogin.data.token;
const firstAgain = await call('POST', '/api/login', { body: { name: A.name, passHash: A.passHash } });
await call('POST', '/api/logout', { token: firstAgain.data.token, body: { token: firstAgain.data.token } });
const otherDevice = await call('GET', '/api/state', { token: secondDevice });
expect('выход на одном устройстве не выкидывает другие', otherDevice.status === 200, `${otherDevice.status}`);
await call('POST', '/api/offline', { token: secondDevice, body: { token: secondDevice } });

/* ---------- 8. мелочи ---------- */

const unknown = await call('GET', '/api/нет-такого');
expect('неизвестный маршрут → 404', unknown.status === 404, unknown.data.error);

console.log(failures === 0 ? '\nВСЁ ХОРОШО' : `\nПЛОХО: провалов ${failures}`);
process.exit(failures === 0 ? 0 : 1);
