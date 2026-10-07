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

   Проверка ничего не ломает: создаются два временных аккаунта с
   случайными именами, в конце они разлогиниваются. Аккаунты на
   хабе остаются (удаления аккаунтов в игре нет) — имена вида
   `probeNNNN` ни с кем не пересекаются. */

const args = process.argv.slice(2).filter((a) => a !== '--keep');
const BASE = (args[0] || process.env.MIR_HUB || 'http://127.0.0.1:4173').replace(/\/+$/, '');

let failures = 0;
const ok = (what, detail = '') => console.log(`  ✓ ${what}${detail ? ` — ${detail}` : ''}`);
const bad = (what, detail = '') => {
  failures += 1;
  console.log(`  × ${what}${detail ? ` — ${detail}` : ''}`);
};

const call = async (method, path, { body, token, timeout = 30_000 } = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

/* ---------- 6. мелочи ---------- */

const unknown = await call('GET', '/api/нет-такого');
expect('неизвестный маршрут → 404', unknown.status === 404, unknown.data.error);

const offA = await call('POST', '/api/offline', { token: A.token, body: { token: A.token } });
const offB = await call('POST', '/api/offline', { token: B.token, body: { token: B.token } });
const offC = await call('POST', '/api/offline', { token: stranger.token, body: { token: stranger.token } });
expect('выход из сети', offA.status === 200 && offB.status === 200 && offC.status === 200);

console.log(failures === 0 ? '\nВСЁ ХОРОШО' : `\nПЛОХО: провалов ${failures}`);
process.exit(failures === 0 ? 0 : 1);
