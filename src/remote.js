/* ===========================================================
   Клиент хаба: когда меню открыто по сети с serve.mjs,
   аккаунты общие для всех устройств в сети. Общение — HTTP
   на тот же источник, состояние зеркалится в cache.
   =========================================================== */

let base = ''; // для тестов: setBase('http://127.0.0.1:PORT')
let tokenGetter = () => null;
let cache = { users: [], requests: [] };

export const setBase = (url) => {
  base = url;
};
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

export const pingHub = async () => {
  const response = await fetch(`${base}/api/ping`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(1200),
  });
  if (!response.ok) throw new Error('Хаб недоступен.');
  return response.json();
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
