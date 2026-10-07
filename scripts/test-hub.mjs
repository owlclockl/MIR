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
   они разлогиниваются. Если владелец задал ключ MIR_ADMIN_KEY, здесь
   же проверяется панель админа: чужой ключ, переименование, сброс
   пароля, отключение, разрыв дружбы и удаление — на своих же
   временных аккаунтах, которые проверка за собой убирает. */

const args = process.argv.slice(2).filter((a) => a !== '--keep');
const BASE = (args[0] || process.env.MIR_HUB || 'http://127.0.0.1:4173').replace(/\/+$/, '');

/* Ключ панели админа. На ПК-хабе по умолчанию заводской; если владелец
   задал свой (MIR_ADMIN_KEY) — проверяем его. Хабы без ключа (хостинг
   без секрета) честно отвечают, что панель выключена, — это тоже
   проверяется. */
const ADMIN_KEY = process.env.MIR_ADMIN_KEY || 'mir-admin';

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

const makeAccount = async (name, password) => {
  const salt = hex(16);
  const passHash = await sha256(`${salt}:${password}`);
  const { status, data } = await call('POST', '/api/register', { body: { name, salt, passHash } });
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

const preflight = await call('OPTIONS', '/api/register');
expect('префлайт OPTIONS', preflight.status === 204 || preflight.status === 200, `${preflight.status}`);

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
if (adminPing.status === 503)
  ok('панель на этом хабе выключена владельцем', adminPing.data.error);
else {
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
}

/* ---------- 7. мелочи ---------- */

const unknown = await call('GET', '/api/нет-такого');
expect('неизвестный маршрут → 404', unknown.status === 404, unknown.data.error);

const offA = await call('POST', '/api/offline', { token: A.token, body: { token: A.token } });
const offB = await call('POST', '/api/offline', { token: B.token, body: { token: B.token } });
const offC = await call('POST', '/api/offline', { token: stranger.token, body: { token: stranger.token } });
expect('выход из сети', offA.status === 200 && offB.status === 200 && offC.status === 200);

console.log(failures === 0 ? '\nВСЁ ХОРОШО' : `\nПЛОХО: провалов ${failures}`);
process.exit(failures === 0 ? 0 : 1);
