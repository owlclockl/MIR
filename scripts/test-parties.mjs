/* Проверка партий — комнат для игры, которые открывает кнопка «Партии».

   Две части, обе без сети и браузера:

   1. Ядро хаба (server/hub-core.mjs вместе с server/hub-lobby.mjs) на
      памяти: два игрока становятся друзьями, мастер создаёт партию с
      названием, зовёт друга, друг видит приглашение и входит, мастер
      меняет мир партии, исключает игрока, игрок входит по коду, а выход
      мастера закрывает комнату для всех. Здесь же — отказы: чужого не
      зовут, вторая партия у одного игрока не заводится, длинное название
      и неизвестный размер отбиваются, комната не принимает лишнего
      человека сверх предела мест.
   2. Договор клиента с хабом: допустимые размеры, предел участников и длины
      полей в src/data/lobby.js обязаны совпадать с серверными, а внутренние
      параметры создания партии (случайный seed, имя по умолчанию, размер
      по умолчанию) хаб обязан принимать. Иначе клиент и хаб разъедутся.

   Запуск: npm run test:parties
   Ничего не сохраняет и не трогает данные хаба. */

import { createHubCore } from '../server/hub-core.mjs';
import {
  LOBBY_MAX_MEMBERS,
  LOBBY_SIZES,
  MAX_SEED,
  MAX_TITLE,
} from '../server/hub-lobby.mjs';
import {
  PARTY_MAX_MEMBERS,
  PARTY_SEED_MAX,
  PARTY_SIZES,
  PARTY_TITLE_MAX,
  defaultPartyTitle,
  randomPartySeed,
} from '../src/data/lobby.js';

let failures = 0;
const ok = (what, detail = '') => console.log(`  ✓ ${what}${detail ? ` — ${detail}` : ''}`);
const bad = (what, detail = '') => {
  failures += 1;
  console.log(`  × ${what}${detail ? ` — ${detail}` : ''}`);
};
const expect = (what, condition, detail = '') => (condition ? ok(what, detail) : bad(what, detail));

/* ---------- стенд: хаб в памяти ------------------------------- */

const db = { users: [], requests: [] };
const core = createHubCore({ db, persist: () => {}, adminKey: '' });

let ipSeq = 0;
const call = async (method, path, { token = '', body = null, ip = '203.0.113.7' } = {}) =>
  core.handle({
    method,
    path,
    body: body ?? {},
    query: new URLSearchParams(),
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ip,
  });

/* Регистрация с отдельным адресом на игрока: лимит «10 в минуту с одного
   IP» защищает хаб от чужих, а проверка создаёт дюжину аккаунтов. */
const register = async (name) => {
  const res = await call('POST', '/api/register', {
    ip: `203.0.113.${(ipSeq += 1) + 10}`,
    body: { name, salt: 'ab'.repeat(16), passHash: 'cd'.repeat(32) },
  });
  if (res.status !== 200) throw new Error(`${name}: ${res.json?.error ?? res.status}`);
  const user = res.json.state.users.find((item) => item.name === name);
  return { id: user.id, name, token: res.json.token };
};

const makeFriends = async (a, b) => {
  const sent = await call('POST', '/api/request', { token: a.token, body: { to: b.id } });
  if (sent.status !== 200) throw new Error(`заявка: ${sent.json?.error}`);
  const request = sent.json.state.requests.find((item) => item.from === a.id);
  const accepted = await call('POST', '/api/respond', {
    token: b.token,
    body: { requestId: request.id, accept: true },
  });
  if (accepted.status !== 200) throw new Error(`принять заявку: ${accepted.json?.error}`);
};

const CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

console.log('\nПартии на хабе (ядро в памяти):');

const master = await register('partymaster');
const friend = await register('partyfriend');
const stranger = await register('partystranger');
await makeFriends(master, friend);

const mine = async (who) => (await call('GET', '/api/lobby', { token: who.token })).json;

const empty = await mine(master);
expect('у игрока без партии комната пустая и приглашений нет', empty.lobby === null && empty.invites.length === 0);

const TITLE = 'Северный ветер';
const created = await call('POST', '/api/lobby/create', {
  token: master.token,
  body: { title: TITLE, seed: 'aurora-4210', width: 1280, height: 800 },
});
const room = created.json?.lobby;
expect(
  'мастер создаёт партию: название, код и роль',
  created.status === 200 && room?.title === TITLE && CODE_RE.test(room?.code ?? '') && room?.role === 'master',
  room ? `${room.title} · ${room.code}` : created.json?.error,
);
expect('в новой партии только мастер', room?.members?.length === 1 && room.members[0].master === true);
expect('список ждущих приглашений пуст', Array.isArray(room?.invited) && room.invited.length === 0);

const twice = await call('POST', '/api/lobby/create', {
  token: master.token,
  body: { title: 'Вторая', seed: 'x', width: 1280, height: 800 },
});
expect('вторая партия у того же игрока не заводится', twice.status === 409, twice.json?.error);

const noSeed = await call('POST', '/api/lobby/create', {
  token: stranger.token,
  body: { title: 'Без seed', seed: '  ', width: 1280, height: 800 },
});
expect('партия без seed не создаётся', noSeed.status === 400, noSeed.json?.error);

const badSize = await call('POST', '/api/lobby/create', {
  token: stranger.token,
  body: { title: 'Чужой размер', seed: 'aurora', width: 999, height: 999 },
});
expect('неизвестный размер карты отбивается', badSize.status === 400, badSize.json?.error);

const longTitle = await call('POST', '/api/lobby/create', {
  token: stranger.token,
  body: { title: 'о'.repeat(MAX_TITLE + 1), seed: 'aurora', width: 1280, height: 800 },
});
expect(`название длиннее ${MAX_TITLE} символов отбивается`, longTitle.status === 400, longTitle.json?.error);

/* --- приглашения --- */

const strangerInvite = await call('POST', '/api/lobby/invite', {
  token: master.token,
  body: { friendId: stranger.id },
});
expect('не друга в партию не зовут', strangerInvite.status === 403, strangerInvite.json?.error);

const invited = await call('POST', '/api/lobby/invite', {
  token: master.token,
  body: { friendId: friend.id },
});
expect('мастер зовёт друга', invited.status === 200 && invited.json?.invited?.id === friend.id);

const friendState = await mine(friend);
const invite = friendState.invites?.[0];
expect(
  'друг видит приглашение: кто зовёт, название партии и код',
  friendState.invites?.length === 1 && invite?.fromName === master.name && invite?.title === TITLE && CODE_RE.test(invite?.code ?? ''),
  invite ? `${invite.fromName} → «${invite.title}» (${invite.code})` : 'приглашения нет',
);

const masterView = (await mine(master)).lobby;
expect(
  'мастер видит, кого уже позвал',
  masterView?.invited?.some((item) => item.id === friend.id) === true,
  masterView?.invited?.map((item) => item.name).join(', ') || 'пусто',
);

const accepted = await call('POST', '/api/lobby/invite/accept', {
  token: friend.token,
  body: { lobbyId: invite.lobbyId },
});
expect(
  'друг принимает приглашение и входит в комнату',
  accepted.status === 200 && accepted.json?.lobby?.members?.length === 2 && accepted.json?.invites?.length === 0,
  accepted.json?.error ?? `${accepted.json?.lobby?.members?.length} участника`,
);
expect(
  'вошедший видит партию игроком, а чужие приглашения — нет',
  accepted.json?.lobby?.role === 'player' && accepted.json?.lobby?.invited?.length === 0,
);

/* Права в комнате: мир партии меняет только мастер, даже когда игрок
   уже вошёл и видит те же данные. */
const playerParams = await call('POST', '/api/lobby/params', {
  token: friend.token,
  body: { title: 'Чужая правка', seed: 'aurora', width: 1280, height: 800 },
});
expect('игрок не меняет мир партии', playerParams.status === 403, playerParams.json?.error);

/* --- мир партии --- */

const params = await call('POST', '/api/lobby/params', {
  token: master.token,
  body: { title: 'Южный ветер', seed: 'basalt-77', width: 1920, height: 1080 },
});
expect(
  'мастер меняет название, seed и размер партии',
  params.status === 200
    && params.json?.lobby?.title === 'Южный ветер'
    && params.json?.lobby?.seed === 'basalt-77'
    && params.json?.lobby?.width === 1920,
  params.json?.error ?? `${params.json?.lobby?.title} · ${params.json?.lobby?.seed}`,
);
expect(
  'игрок видит новый мир партии тем же каналом',
  (await mine(friend)).lobby?.title === 'Южный ветер',
);

/* Отвергнутый запрос не должен успеть что-то поменять: хаб проверяет весь
   запрос до записи, иначе название сменилось бы вместе с ошибкой 400. */
const badParams = await call('POST', '/api/lobby/params', {
  token: master.token,
  body: { title: 'Испорченный запрос', seed: 'basalt-77', width: 4000, height: 1080 },
});
expect(
  'неверный размер отбивается и название партии не меняет',
  badParams.status === 400 && (await mine(master)).lobby?.title === 'Южный ветер',
  `${badParams.status} ${badParams.json?.error}`,
);

/* --- состав --- */

const kicked = await call('POST', '/api/lobby/kick', {
  token: master.token,
  body: { userId: friend.id },
});
expect(
  'мастер исключает игрока',
  kicked.status === 200 && kicked.json?.lobby?.members?.length === 1 && (await mine(friend)).lobby === null,
  kicked.json?.error,
);

const selfKick = await call('POST', '/api/lobby/kick', { token: master.token, body: { userId: master.id } });
expect('мастер не может исключить сам себя', selfKick.status === 404, selfKick.json?.error);

const byCode = await call('POST', '/api/lobby/join', {
  token: friend.token,
  body: { code: room.code.toLowerCase() },
});
expect(
  'вход по коду в любом регистре',
  byCode.status === 200 && byCode.json?.lobby?.members?.length === 2,
  byCode.json?.error,
);

const badCode = await call('POST', '/api/lobby/join', { token: stranger.token, body: { code: 'ZZZZ-ZZZZ' } });
expect('несуществующий код отбивается', badCode.status === 404, badCode.json?.error);

/* Предел мест: комната на LOBBY_MAX_MEMBERS человек, лишний не входит. */
const seats = [];
for (let index = 0; index < LOBBY_MAX_MEMBERS; index += 1) {
  const guest = await register(`guest${index}x`);
  const joined = await call('POST', '/api/lobby/join', { token: guest.token, body: { code: room.code } });
  seats.push({ guest, status: joined.status, error: joined.json?.error });
}
const inside = seats.filter((seat) => seat.status === 200).length;
const refused = seats.find((seat) => seat.status !== 200);
expect(
  `партия вмещает ${LOBBY_MAX_MEMBERS} участников и отказывает лишнему`,
  inside + 2 === LOBBY_MAX_MEMBERS && refused?.status === 409,
  `вошли ещё ${inside}, отказ: ${refused?.error ?? 'нет'}`,
);

const inviteWhenFull = await call('POST', '/api/lobby/invite', {
  token: master.token,
  body: { friendId: stranger.id },
});
expect('в полную партию не зовут даже друга', inviteWhenFull.status === 403 || inviteWhenFull.status === 409, inviteWhenFull.json?.error);

/* --- закрытие --- */

const closed = await call('POST', '/api/lobby/leave', { token: master.token, body: {} });
expect('выход мастера закрывает партию', closed.status === 200 && closed.json?.lobby === null);
expect('игрок тоже остался без комнаты', (await mine(friend)).lobby === null);

const afterClose = await call('POST', '/api/lobby/join', { token: friend.token, body: { code: room.code } });
expect('по коду закрытой партии не войти', afterClose.status === 404, afterClose.json?.error);

/* ---------- договор клиента с хабом --------------------------- */

console.log('\nДоговор клиента с хабом:');

const clientSizes = PARTY_SIZES.map(([width, height]) => [width, height]);
expect(
  'разрешённые размеры карты клиента совпадают со списком хаба',
  JSON.stringify(clientSizes) === JSON.stringify(LOBBY_SIZES),
  `${clientSizes.length} пресета`,
);
expect('предел участников у клиента тот же, что на хабе', PARTY_MAX_MEMBERS === LOBBY_MAX_MEMBERS, `${PARTY_MAX_MEMBERS}`);
expect('предел seed у клиента тот же, что на хабе', PARTY_SEED_MAX === MAX_SEED, `${PARTY_SEED_MAX}`);
expect('предел названия у клиента тот же, что на хабе', PARTY_TITLE_MAX === MAX_TITLE, `${PARTY_TITLE_MAX}`);

const seed = randomPartySeed();
expect(
  'автоматический seed клиента хаб принимает',
  seed.length > 0 && seed.length <= PARTY_SEED_MAX && /^[\w-]+$/.test(seed),
  seed,
);
const longName = defaultPartyTitle('ОченьДлинноеИмяМастера'.repeat(6));
expect(
  'имя партии по умолчанию укладывается в предел',
  longName.length > 0 && longName.length <= PARTY_TITLE_MAX,
  `${longName.length} символов`,
);

/* Эти внутренние значения отправляет клиент при создании партии:
   seed генерируется автоматически, размер пока берётся по умолчанию. */
const solo = await register('partysolo');
const clientRoom = await call('POST', '/api/lobby/create', {
  token: solo.token,
  body: {
    title: defaultPartyTitle(solo.name),
    seed: randomPartySeed(),
    width: PARTY_SIZES[0][0],
    height: PARTY_SIZES[0][1],
  },
});
expect(
  'партия с параметрами по умолчанию создаётся без правок',
  clientRoom.status === 200 && CODE_RE.test(clientRoom.json?.lobby?.code ?? ''),
  clientRoom.json?.error ?? `${clientRoom.json?.lobby?.title} · ${clientRoom.json?.lobby?.code}`,
);

console.log(failures === 0 ? '\nВСЁ ХОРОШО' : `\nПЛОХО: провалов ${failures}`);
process.exit(failures === 0 ? 0 : 1);
