/* ===========================================================
   Клиент хаба. Хаб — это общий сервер аккаунтов: он может быть
   тем же адресом, откуда открыта игра (ПК в локальной сети или
   бесплатный хостинг), а может быть чужим адресом, который игрок
   ввёл руками — тогда даже mir.html с флешки и APK на телефоне
   играют вместе с остальными.

   Общение — HTTP на `base`, состояние зеркалится в cache.
   =========================================================== */

let base = ''; // '' — тот же адрес, что и страница; иначе полный https://…
let tokenGetter = () => null;
let cache = { users: [], requests: [] };

export const setBase = (url) => {
  base = url || '';
};
export const getBase = () => base;
export const setTokenGetter = (fn) => {
  tokenGetter = fn;
};
export const applyState = (state) => {
  cache = { users: state.users ?? [], requests: state.requests ?? [] };
};
export const getUsers = () => cache.users;
export const getRequests = () => cache.requests;

const call = async (method, path, body, { timeout = 8000 } = {}) => {
  const token = tokenGetter();
  const response = await fetch(`${base}${path}`, {
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
  if (!response.ok) {
    const error = new Error(data.error || 'Хаб недоступен.');
    error.status = response.status;
    throw error;
  }
  return data;
};

/* Проверка «а хаб ли там». Свой адрес отвечает мгновенно, чужой —
   через полмира, поэтому запас времени разный. */
export const pingHub = async (url = base, { timeout = url ? 6000 : 1500 } = {}) => {
  const response = await fetch(`${url}/api/ping`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error('Хаб недоступен.');
  const data = await response.json();
  if (data?.hub !== 'mir') throw new Error('По этому адресу отвечает не хаб игры.');
  return data;
};

export const getSalt = (name) => call('GET', `/api/salt?name=${encodeURIComponent(name)}`);
export const fetchState = async () => applyState(await call('GET', '/api/state'));

export const apiRegister = (payload) => call('POST', '/api/register', payload);
export const apiLogin = (payload) => call('POST', '/api/login', payload);
export const apiHeartbeat = () => call('POST', '/api/heartbeat', {});
export const apiOffline = () => call('POST', '/api/offline', { token: tokenGetter() });
export const apiPassword = (payload) => call('POST', '/api/password', payload);
export const apiAvatar = (avatar) => call('POST', '/api/avatar', { avatar });
export const apiRequest = (to) => call('POST', '/api/request', { to });
export const apiRespond = (requestId, accept) => call('POST', '/api/respond', { requestId, accept });
export const apiRemoveFriend = (friendId) => call('POST', '/api/friend/remove', { friendId });
export const apiUseCode = (code) => call('POST', '/api/invite/use', { code });
export const apiRegen = () => call('POST', '/api/invite/regen', {});

/* ---------- сигналинг P2P -----------------------------------
   Через хаб ходят только offer/answer/ICE и запасной relay-канал.
   Входящие берём длинным опросом: запрос висит до первого сигнала,
   поэтому соединение поднимается почти мгновенно, а нагрузки нет. */

export const apiSignal = (batch) => call('POST', '/api/p2p/signal', { batch }, { timeout: 10_000 });

export const apiInbox = ({ wait = true } = {}) =>
  call('GET', `/api/p2p/inbox${wait ? '?wait=1' : ''}`, null, { timeout: wait ? 30_000 : 8000 });
