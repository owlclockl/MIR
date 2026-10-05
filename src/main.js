import './style.css';
import * as store from './store.js';
import { pickAvatarFile, processAvatarFile } from './avatar.js';

/* Название игры. Разбито на две строки — так оно читается и в шапке, и в заголовке. */
const TITLE = { lead: 'The civilization', tail: 'of the sages' };
const TITLE_FULL = `${TITLE.lead} ${TITLE.tail}`;
const VERSION = '0.3.0';

/* Иконки Lucide (ISC). Только контуры, 24×24, stroke = currentColor. */
const ICONS = {
  sigil:
    '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M12 1.6v2.6M12 19.8v2.6M1.6 12h2.6M19.8 12h2.6"/>',
  settings:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>',
  play: '<path d="M6 3 20 12 6 21Z"/>',
  userPlus:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="0"/><rect x="5" y="5" width="13" height="13" rx="0"/>',
  camera:
    '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.4"/>',
  logOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  refresh:
    '<path d="M3 12a9 9 0 0 1 15.36-6.36L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.36 6.36L3 16"/><path d="M3 21v-5h5"/>',
};

const icon = (name, className = '') =>
  `<svg class="icon${className ? ` ${className}` : ''}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

const PRESENCE = {
  playing: { label: 'В игре', modifier: 'live' },
  idle: { label: 'В меню', modifier: 'live' },
  offline: { label: 'Не в сети', modifier: 'off' },
};

/* ---------- утилиты ---------------------------------------- */

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const nameHue = (key) => {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
};

const formatDate = (ts) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(ts));

/* Аватар: загруженная картинка или инициалы на цвете из имени. */
const avatarEl = (user, cls = '') => {
  const offline = store.presenceOf(user) === 'offline';
  const off = offline ? ' avatar--dim' : '';
  if (user.avatar)
    return `<span class="avatar avatar--img${cls ? ` ${cls}` : ''}${off}"><img src="${user.avatar}" alt="" /></span>`;
  const hue = nameHue(user.nameKey);
  return `<span class="avatar${cls ? ` ${cls}` : ''}${off}" style="background:hsl(${hue} 26% 30%);color:hsl(${hue} 45% 87%)" aria-hidden="true">${escapeHtml(user.name.slice(0, 2).toUpperCase())}</span>`;
};

const copyText = async (text) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* Ниже — запасной путь для http по локальной сети. */
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
};

/* ---------- тосты ------------------------------------------- */

const toast = (message, tone = 'ok') => {
  const root = document.querySelector('#toast-root');
  if (!root) return;
  const node = document.createElement('p');
  node.className = `toast toast--${tone}`;
  node.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  node.textContent = message;
  root.append(node);
  requestAnimationFrame(() => node.classList.add('toast--shown'));
  setTimeout(() => {
    node.classList.remove('toast--shown');
    node.addEventListener('transitionend', () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 400);
  }, 3400);
};

/* ---------- модальные окна ---------------------------------- */

const ui = {
  modal: null, // { type, data }
  authTab: 'login',
  addQuery: '',
  codeValue: '',
  pendingAvatar: null,
  confirm: null,
  opener: null,
};

const overlayRoot = () => document.querySelector('#overlay-root');

const openModal = (type, data = null) => {
  ui.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  ui.modal = { type, data };
  renderModal();
};

const closeModal = () => {
  ui.modal = null;
  ui.confirm = null;
  ui.pendingAvatar = null;
  ui.codeValue = '';
  const root = overlayRoot();
  if (root) root.innerHTML = '';
  if (ui.opener && document.contains(ui.opener)) ui.opener.focus();
  ui.opener = null;
};

const dialogShell = ({ label, title, size = '', body }) => `
  <div class="overlay" data-action="overlay-down">
    <section class="dialog${size ? ` dialog--${size}` : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(label)}">
      <header class="dialog__head">
        <h2 class="dialog__title">${escapeHtml(title)}</h2>
        <button class="icon-button icon-button--sm" type="button" data-action="close-modal" aria-label="Закрыть">
          ${icon('x')}
        </button>
      </header>
      ${body}
    </section>
  </div>`;

/* --- Окно входа / регистрации --- */
/* Подпись под формой входа. Если браузер запретил хранилище (file:// в
   Firefox и Safari, запрет данных сайтов), честно говорим об этом: иначе
   человек создаст аккаунт и потеряет его при перезагрузке. */
const authNoteHtml = () => {
  if (!store.storagePersists())
    return `<p class="form-note form-note--warn">Браузер не разрешает сохранять данные на этой странице — аккаунт исчезнет после перезагрузки. Откройте игру через MIR-Setup.exe или по ссылке хаба.</p>`;
  return `<p class="form-note">${
    store.isHub() ? 'Аккаунт хранится на общем хабе сети.' : 'Всё хранится локально, в этом браузере.'
  }</p>`;
};

const authModalHtml = () => {
  const isLogin = ui.authTab === 'login';
  return dialogShell({
    label: isLogin ? 'Вход в аккаунт' : 'Создание аккаунта',
    title: isLogin ? 'С возвращением' : 'Новый аккаунт',
    body: `
      <div class="tabs" role="tablist" aria-label="Режим">
        <button class="tab${isLogin ? ' tab--active' : ''}" type="button" role="tab" aria-selected="${isLogin}" data-action="auth-tab" data-tab="login">Вход</button>
        <button class="tab${!isLogin ? ' tab--active' : ''}" type="button" role="tab" aria-selected="${!isLogin}" data-action="auth-tab" data-tab="register">Регистрация</button>
      </div>
      <form class="dialog__body form" data-form="${isLogin ? 'login' : 'register'}" novalidate>
        <label class="field">
          <span class="field__label">Имя игрока</span>
          <input class="input" name="name" type="text" minlength="3" maxlength="16"
                 autocomplete="username" spellcheck="false" required data-autofocus />
        </label>
        <label class="field">
          <span class="field__label">Пароль</span>
          <input class="input" name="password" type="password" minlength="6" maxlength="72"
                 autocomplete="${isLogin ? 'current-password' : 'new-password'}" required />
        </label>
        ${
          isLogin
            ? ''
            : `<label class="field">
          <span class="field__label">Пароль ещё раз</span>
          <input class="input" name="password2" type="password" minlength="6" maxlength="72"
                 autocomplete="new-password" required />
        </label>`
        }
        <p class="form-error" data-role="form-error" hidden></p>
        <button class="solid-button" type="submit" data-role="submit">
          <span>${isLogin ? 'Войти' : 'Создать аккаунт'}</span>
        </button>
        ${authNoteHtml()}
      </form>`,
  });
};

/* --- Окно «Добавить друга» --- */
const relationOf = (me, user) => {
  if (me.id === user.id) return 'self';
  if (me.friends.includes(user.id)) return 'friend';
  const incoming = store.incomingRequests(me.id).find((r) => r.from === user.id);
  if (incoming) return 'incoming';
  if (store.outgoingRequests(me.id).some((r) => r.to === user.id)) return 'outgoing';
  return 'none';
};

const relationControl = (me, user) => {
  switch (relationOf(me, user)) {
    case 'friend':
      return `<span class="relation-tag">${icon('check', 'icon--xs')} Уже в друзьях</span>`;
    case 'incoming': {
      const req = store.incomingRequests(me.id).find((r) => r.from === user.id);
      return `<button class="mini-button" type="button" data-action="accept-request" data-id="${req.id}">Принять заявку</button>`;
    }
    case 'outgoing':
      return `<span class="relation-tag relation-tag--muted">Заявка отправлена</span>`;
    default:
      return `<button class="mini-button mini-button--accent" type="button" data-action="send-request" data-id="${user.id}">Добавить</button>`;
  }
};

const searchResultsHtml = (me) => {
  const query = ui.addQuery.trim().toLowerCase();
  if (query.length === 0)
    return `<p class="hint">Введите имя игрока — поиск идёт по ${
      store.isHub() ? 'общему хабу этой сети' : 'аккаунтам, созданным на этом устройстве'
    }.</p>`;
  if (query.length < 2) return `<p class="hint">Наберите хотя бы 2 символа.</p>`;
  const found = store
    .listUsers()
    .filter((u) => u.id !== me.id && u.nameKey.includes(query))
    .sort((a, b) => {
      const sa = a.nameKey.startsWith(query) ? 0 : 1;
      const sb = b.nameKey.startsWith(query) ? 0 : 1;
      return sa - sb || a.name.localeCompare(b.name, 'ru');
    })
    .slice(0, 6);
  if (found.length === 0)
    return `<p class="hint">Никого не нашлось. Скиньте другу свой код-приглашение — он указан выше.</p>`;
  return found
    .map(
      (user) => `
      <div class="result">
        ${avatarEl(user, 'avatar--sm')}
        <span class="result__text">
          <strong class="friend__name" translate="no">${escapeHtml(user.name)}</strong>
          <small class="friend__state">${PRESENCE[store.presenceOf(user)].label}</small>
        </span>
        ${relationControl(me, user)}
      </div>`,
    )
    .join('');
};

const addFriendModalHtml = () => {
  const me = store.getCurrentUser();
  if (!me) return '';
  return dialogShell({
    label: 'Добавить друга',
    title: 'Добавить друга',
    size: 'wide',
    body: `
      <div class="dialog__body">
        <div class="invite-box">
          <div class="invite-box__text">
            <p class="eyebrow">Мой код-приглашение</p>
            <p class="invite-box__hint">Друг вводит его у себя — и вы сразу в друзьях друг у друга.</p>
          </div>
          <div class="code-box">
            <code class="code-box__value" translate="no">${me.inviteCode}</code>
            <button class="icon-button icon-button--sm" type="button" data-action="copy-code" data-code="${me.inviteCode}" aria-label="Скопировать код-приглашение">
              ${icon('copy')}
            </button>
          </div>
        </div>

        <div class="divider" role="separator"></div>

        <div class="field">
          <span class="field__label" id="by-name-label">По имени</span>
          <input class="input" id="friend-search" type="search" placeholder="Имя игрока…"
                 autocomplete="off" spellcheck="false" maxlength="16" aria-labelledby="by-name-label"
                 value="${escapeHtml(ui.addQuery)}" data-role="friend-search" />
        </div>
        <div class="results" data-role="friend-results">
          ${searchResultsHtml(me)}
        </div>

        <div class="divider" role="separator"></div>

        <form class="code-form" data-form="use-code" novalidate>
          <div class="field">
            <span class="field__label" id="by-code-label">По коду от друга</span>
            <div class="code-form__row">
              <input class="input input--code" type="text" placeholder="XXXX-XXXX" maxlength="9"
                     autocomplete="off" spellcheck="false" aria-labelledby="by-code-label"
                     value="${escapeHtml(ui.codeValue)}" data-role="code-input" />
              <button class="mini-button mini-button--accent" type="submit">Применить</button>
            </div>
          </div>
          <p class="form-error" data-role="form-error" hidden></p>
        </form>
      </div>`,
  });
};

/* --- Окно профиля --- */
const profileModalHtml = () => {
  const me = store.getCurrentUser();
  if (!me) return '';
  return dialogShell({
    label: 'Профиль игрока',
    title: 'Профиль',
    size: 'wide',
    body: `
      <div class="dialog__body">
        <div class="account">
          <div class="account__avatar">${avatarEl(me, 'avatar--lg')}</div>
          <div class="account__main">
            <p class="account__name" translate="no">${escapeHtml(me.name)}</p>
            <p class="account__meta">С нами с ${formatDate(me.createdAt)} · друзей: ${me.friends.length} · ${store.backendLabel()}</p>
            <div class="account__actions">
              <button class="mini-button" type="button" data-action="pick-avatar">
                ${icon('camera', 'icon--xs')} ${me.avatar ? 'Сменить аватарку' : 'Добавить аватарку'}
              </button>
              ${
                me.avatar
                  ? `<button class="mini-button mini-button--danger" type="button" data-action="remove-avatar">Убрать</button>`
                  : ''
              }
            </div>
          </div>
        </div>

        <div class="divider" role="separator"></div>

        <div class="invite-box">
          <div class="invite-box__text">
            <p class="eyebrow">Мой код-приглашение</p>
            <p class="invite-box__hint">Передайте другу — он введёт его у себя, и вы станете друзьями. Смена кода гасит старый.</p>
          </div>
          <div class="code-box">
            <code class="code-box__value" translate="no">${me.inviteCode}</code>
            <button class="icon-button icon-button--sm" type="button" data-action="copy-code" data-code="${me.inviteCode}" aria-label="Скопировать код-приглашение">
              ${icon('copy')}
            </button>
            <button class="icon-button icon-button--sm" type="button" data-action="regen-code" aria-label="Сменить код (старый перестанет работать)" title="Сменить код — старый перестанет работать">
              ${icon('refresh')}
            </button>
          </div>
        </div>

        <div class="divider" role="separator"></div>

        <form class="form" data-form="change-password" novalidate>
          <p class="eyebrow">Смена пароля</p>
          <div class="form__grid">
            <label class="field">
              <span class="field__label">Текущий пароль</span>
              <input class="input" name="old" type="password" autocomplete="current-password" required />
            </label>
            <label class="field">
              <span class="field__label">Новый пароль</span>
              <input class="input" name="next" type="password" minlength="6" maxlength="72" autocomplete="new-password" required />
            </label>
          </div>
          <p class="form-error" data-role="form-error" hidden></p>
          <button class="mini-button" type="submit">${icon('key', 'icon--xs')} Обновить пароль</button>
        </form>

        <div class="divider" role="separator"></div>

        <button class="mini-button mini-button--danger" type="button" data-action="logout">
          ${icon('logOut', 'icon--xs')} Выйти из аккаунта
        </button>
      </div>`,
  });
};

/* --- Окно превью аватарки --- */
const avatarPreviewHtml = () => `
  <div class="overlay" data-action="overlay-down">
    <section class="dialog" role="dialog" aria-modal="true" aria-label="Новая аватарка">
      <header class="dialog__head">
        <h2 class="dialog__title">Новая аватарка</h2>
        <button class="icon-button icon-button--sm" type="button" data-action="close-modal" aria-label="Закрыть">
          ${icon('x')}
        </button>
      </header>
      <div class="dialog__body avatar-preview">
        <img class="avatar-preview__img" src="${ui.pendingAvatar}" alt="Предпросмотр аватарки" />
        <p class="hint">Картинка обрезана по центру до квадрата 96×96.</p>
        <div class="dialog__actions">
          <button class="mini-button" type="button" data-action="pick-avatar">Выбрать другую</button>
          <button class="solid-button" type="button" data-action="save-avatar" data-autofocus><span>Сохранить</span></button>
        </div>
      </div>
    </section>
  </div>`;

/* --- Окно друга --- */
const friendModalHtml = (friendId) => {
  const friend = store.getUser(friendId);
  if (!friend) return authModalHtml();
  const presence = PRESENCE[store.presenceOf(friend)];
  return dialogShell({
    label: `Игрок ${friend.name}`,
    title: 'Игрок',
    body: `
      <div class="dialog__body">
        <div class="account">
          <div class="account__avatar">${avatarEl(friend, 'avatar--lg')}</div>
          <div class="account__main">
            <p class="account__name" translate="no">${escapeHtml(friend.name)}</p>
            <p class="account__meta">
              <span class="dot dot--${presence.modifier}" aria-hidden="true"></span>
              ${presence.label} · с нами с ${formatDate(friend.createdAt)}
            </p>
          </div>
        </div>
        <div class="divider" role="separator"></div>
        <button class="mini-button mini-button--danger" type="button" data-action="remove-friend" data-id="${friend.id}">
          Убрать из друзей
        </button>
      </div>`,
  });
};

/* --- Окно подтверждения --- */
const confirmModalHtml = () => dialogShell({
  label: ui.confirm.title,
  title: ui.confirm.title,
  body: `
    <div class="dialog__body">
      <p class="hint">${ui.confirm.text}</p>
      <div class="dialog__actions">
        <button class="mini-button" type="button" data-action="close-modal" data-autofocus>Отмена</button>
        <button class="mini-button mini-button--danger" type="button" data-action="${ui.confirm.action}" data-id="${ui.confirm.id || ''}">${ui.confirm.label}</button>
      </div>
    </div>`,
});

const renderModal = () => {
  const root = overlayRoot();
  if (!root) return;
  if (!ui.modal) {
    root.innerHTML = '';
    return;
  }
  let html = '';
  switch (ui.modal.type) {
    case 'auth':
      html = authModalHtml();
      break;
    case 'add-friend':
      html = addFriendModalHtml();
      break;
    case 'profile':
      html = profileModalHtml();
      break;
    case 'avatar-preview':
      html = avatarPreviewHtml();
      break;
    case 'friend':
      html = friendModalHtml(ui.modal.data);
      break;
    case 'confirm':
      html = confirmModalHtml();
      break;
  }
  root.innerHTML = html;
  const focusTarget = root.querySelector('[data-autofocus]') || root.querySelector('input, button');
  focusTarget?.focus();
  const aut = root.querySelector('[data-autofocus]');
  if (aut instanceof HTMLInputElement) aut.select();
};

/* ---------- верхняя панель: аккаунт -------------------------- */

const accountSlotHtml = () => {
  const me = store.getCurrentUser();
  if (!me) {
    return `
      <button class="ghost-button ghost-button--inline" type="button" data-action="open-auth">
        ${icon('user')}
        <span>Войти</span>
      </button>`;
  }
  return `
    <p class="status">
      <span class="dot dot--live" aria-hidden="true"></span>
      <span>В сети</span>
    </p>
    <span class="topbar__divider" aria-hidden="true"></span>
    <button class="profile" type="button" data-action="open-profile" aria-label="Профиль: ${escapeHtml(me.name)}">
      ${avatarEl(me)}
      <span class="profile__text">
        <strong class="profile__name" translate="no">${escapeHtml(me.name)}</strong>
        <small class="profile__meta">С нами с ${formatDate(me.createdAt)}</small>
      </span>
      ${icon('chevron', 'icon--chevron')}
    </button>`;
};

/* ---------- правая панель: друзья ---------------------------- */

const requestRowHtml = (request) => {
  const from = store.getUser(request.from);
  if (!from) return '';
  return `
    <div class="request">
      ${avatarEl(from, 'avatar--sm')}
      <span class="friend__text">
        <strong class="friend__name" translate="no">${escapeHtml(from.name)}</strong>
        <small class="friend__state">Хочет добавить вас</small>
      </span>
      <button class="icon-button icon-button--sm" type="button" data-action="accept-request" data-id="${request.id}" aria-label="Принять заявку от ${escapeHtml(from.name)}" title="Принять">
        ${icon('check')}
      </button>
      <button class="icon-button icon-button--sm icon-button--danger" type="button" data-action="decline-request" data-id="${request.id}" aria-label="Отклонить заявку от ${escapeHtml(from.name)}" title="Отклонить">
        ${icon('x')}
      </button>
    </div>`;
};

const friendRowHtml = (friend) => {
  const presence = PRESENCE[store.presenceOf(friend)];
  return `
    <button class="friend friend--${presence.modifier}" type="button" data-action="open-friend" data-id="${friend.id}">
      ${avatarEl(friend, 'avatar--sm')}
      <span class="friend__text">
        <strong class="friend__name" translate="no">${escapeHtml(friend.name)}</strong>
        <small class="friend__state">${presence.label}</small>
      </span>
      <span class="dot dot--${presence.modifier}" aria-hidden="true"></span>
    </button>`;
};

const railHtml = () => {
  const me = store.getCurrentUser();

  if (!me) {
    return `
      <div class="rail__head">
        <div class="rail__heading">
          <p class="eyebrow">Сообщество</p>
          <h2 class="rail__title">Друзья</h2>
        </div>
      </div>
      <div class="rail__list">
        <div class="empty">
          <p class="empty__title">Здесь появятся друзья</p>
          <p class="empty__text">Войдите или создайте аккаунт — заявки, коды-приглашения и список друзей живут внутри.</p>
          <button class="mini-button mini-button--accent" type="button" data-action="open-auth">
            ${icon('user', 'icon--xs')} Войти / создать аккаунт
          </button>
        </div>
      </div>`;
  }

  const friends = store.listFriends(me.id);
  const requests = store.incomingRequests(me.id);
  const online = friends.filter((f) => store.presenceOf(f) !== 'offline').length;

  return `
    <div class="rail__head">
      <div class="rail__heading">
        <p class="eyebrow">Сообщество</p>
        <h2 class="rail__title">
          Друзья <span class="rail__count">${online} / ${friends.length}</span>
        </h2>
      </div>
      <button class="icon-button icon-button--sm icon-button--badged" type="button" data-action="open-add-friend" aria-label="Добавить друга">
        ${icon('userPlus')}
        ${requests.length ? `<span class="badge" aria-label="Входящих заявок: ${requests.length}">${requests.length}</span>` : ''}
      </button>
    </div>

    <div class="rail__list">
      ${
        requests.length
          ? `<div class="requests" role="group" aria-label="Входящие заявки">
              <p class="requests__title">Заявки · ${requests.length}</p>
              ${requests.map(requestRowHtml).join('')}
            </div>`
          : ''
      }
      ${
        friends.length
          ? friends.map(friendRowHtml).join('')
          : `<div class="empty">
              <p class="empty__title">Пока пусто</p>
              <p class="empty__text">Найдите друзей по имени или поделитесь своим код-приглашением ниже.</p>
              <button class="mini-button mini-button--accent" type="button" data-action="open-add-friend">
                ${icon('userPlus', 'icon--xs')} Добавить друга
              </button>
            </div>`
      }
    </div>

    <div class="rail__foot">
      <p class="eyebrow">Мой код-приглашение</p>
      <button class="code-box code-box--button" type="button" data-action="copy-code" data-code="${me.inviteCode}" title="Нажмите, чтобы скопировать">
        <code class="code-box__value" translate="no">${me.inviteCode}</code>
        ${icon('copy')}
      </button>
    </div>`;
};

/* ---------- каркас ------------------------------------------- */

document.querySelector('#app').innerHTML = `
  <div class="shell">
    <header class="topbar">
      <div class="topbar__side topbar__side--start">
        <button class="icon-button" type="button" aria-label="Настройки">
          ${icon('settings')}
        </button>
        <p class="brand" translate="no">
          <span class="brand__mark" aria-hidden="true">${icon('sigil')}</span>
          <span class="brand__name" lang="en">
            <span class="brand__line">${TITLE.lead}</span>
            <span class="brand__line brand__line--muted">${TITLE.tail}</span>
          </span>
        </p>
      </div>

      <nav class="topbar__nav" aria-label="Основная навигация">
        <button class="play-button" type="button">
          ${icon('play', 'icon--play')}
          <span>Играть</span>
        </button>
      </nav>

      <div class="topbar__side topbar__side--end" data-region="account"></div>
    </header>

    <main id="main" class="stage">
      <div class="atmosphere" aria-hidden="true">
        <span class="atmosphere__ring atmosphere__ring--inner"></span>
        <span class="atmosphere__ring atmosphere__ring--outer"></span>
        <span class="atmosphere__beam atmosphere__beam--a"></span>
        <span class="atmosphere__beam atmosphere__beam--b"></span>
      </div>

      <section class="hero" aria-labelledby="hero-title">
        <p class="eyebrow">Тактический протокол</p>
        <h1 class="hero__title" id="hero-title" lang="en" translate="no">
          <span class="hero__line">${TITLE.lead}</span>
          <span class="hero__line hero__line--tail">${TITLE.tail}</span>
        </h1>
        <p class="hero__caption"><span>Тишина — тоже оружие.</span></p>
      </section>
    </main>

    <aside class="rail" data-region="rail" aria-label="Друзья"></aside>

    <footer class="footer">
      <span>Версия ${VERSION}</span>
      <span class="footer__name" lang="en" translate="no">© 2026 ${TITLE_FULL}</span>
    </footer>

    <div id="overlay-root"></div>
    <div id="toast-root" class="toast-stack" aria-live="polite"></div>
  </div>
`;

/* ---------- перерисовка динамических областей ---------------- */

const renderRegions = () => {
  document.querySelector('[data-region="account"]').innerHTML = accountSlotHtml();
  document.querySelector('[data-region="rail"]').innerHTML = railHtml();
};

const render = () => {
  renderRegions();
  /* Открытое окно пересобираем — данные в нём могли устареть. */
  if (ui.modal && ui.modal.type !== 'auth' && ui.modal.type !== 'avatar-preview') {
    const active = document.activeElement;
    const keepFocus =
      active instanceof HTMLInputElement && active.dataset.role
        ? { role: active.dataset.role, pos: active.selectionStart }
        : null;
    renderModal();
    if (keepFocus) {
      const input = overlayRoot()?.querySelector(`[data-role="${keepFocus.role}"]`);
      if (input) {
        input.focus();
        input.setSelectionRange?.(keepFocus.pos, keepFocus.pos);
      }
    }
  }
};

store.subscribe(render);

/* ---------- формы -------------------------------------------- */

const setFormError = (form, message) => {
  const slot = form.querySelector('[data-role="form-error"]');
  if (!slot) {
    if (message) toast(message, 'error');
    return;
  }
  slot.hidden = !message;
  slot.textContent = message || '';
};

const withBusy = async (form, fn) => {
  const submit = form.querySelector('[data-role="submit"], button[type="submit"]');
  submit?.setAttribute('disabled', '');
  try {
    await fn();
  } catch (error) {
    setFormError(form, error instanceof Error ? error.message : 'Что-то пошло не так.');
  } finally {
    submit?.removeAttribute('disabled');
  }
};

const formHandlers = {
  login: (form, fields) =>
    withBusy(form, async () => {
      const user = await store.login(fields.name.value, fields.password.value);
      closeModal();
      toast(`С возвращением, ${user.name}.`);
    }),

  register: (form, fields) =>
    withBusy(form, async () => {
      if (fields.password.value !== fields.password2.value)
        throw new Error('Пароли не совпадают.');
      const user = await store.register(fields.name.value, fields.password.value);
      closeModal();
      toast(`Аккаунт ${user.name} создан. Добро пожаловать.`);
    }),

  'use-code': (form, fields) =>
    withBusy(form, async () => {
      const input = form.querySelector('[data-role="code-input"]');
      const owner = await store.useInviteCode(input.value);
      ui.codeValue = '';
      toast(`Вы теперь друзья с ${owner.name}.`);
      closeModal();
    }),

  'change-password': (form, fields) =>
    withBusy(form, async () => {
      await store.changePassword(fields.old.value, fields.next.value);
      form.reset();
      setFormError(form, '');
      toast('Пароль обновлён.');
    }),

  noop: () => {},
};

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const handler = formHandlers[form.dataset.form] || formHandlers.noop;
  handler(form, form.elements);
});

/* Мгновенный поиск и ввод кода. */
document.addEventListener('input', (event) => {
  const role = event.target.dataset?.role;
  if (role === 'friend-search') {
    ui.addQuery = event.target.value;
    const me = store.getCurrentUser();
    const box = document.querySelector('[data-role="friend-results"]');
    if (me && box) box.innerHTML = searchResultsHtml(me);
  }
  if (role === 'code-input') {
    const raw = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const formatted = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4, 8)}` : raw;
    event.target.value = formatted;
    ui.codeValue = formatted;
  }
});

/* ---------- клики -------------------------------------------- */

const pickAndPreviewAvatar = async () => {
  let file;
  try {
    file = await pickAvatarFile();
  } catch {
    return;
  }
  if (!file) return;
  try {
    const dataUrl = await processAvatarFile(file);
    if (!dataUrl) return;
    ui.pendingAvatar = dataUrl;
    ui.modal = { type: 'avatar-preview' };
    renderModal();
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Не удалось обработать картинку.', 'error');
  }
};

const actions = {
  'open-auth': () => {
    ui.authTab = 'login';
    openModal('auth');
  },

  'auth-tab': (el) => {
    ui.authTab = el.dataset.tab;
    renderModal();
  },

  'open-profile': () => openModal('profile'),
  'open-add-friend': () => {
    ui.addQuery = '';
    ui.codeValue = '';
    openModal('add-friend');
  },
  'open-friend': (el) => openModal('friend', el.dataset.id),

  'close-modal': () => closeModal(),

  'overlay-down': (el, event) => {
    if (event.target === el) closeModal();
  },

  'send-request': async (el) => {
    try {
      const { accepted, target } = await store.sendRequest(el.dataset.id);
      toast(accepted ? `Вы теперь друзья с ${target.name}.` : `Заявка игроку ${target.name} отправлена.`);
    } catch (error) {
      toast(error.message, 'error');
    }
  },

  'accept-request': async (el) => {
    try {
      const from = await store.acceptRequest(el.dataset.id);
      if (from) toast(`Вы теперь друзья с ${from.name}.`);
    } catch (error) {
      toast(error.message, 'error');
    }
  },

  'decline-request': async (el) => {
    try {
      const from = await store.declineRequest(el.dataset.id);
      if (from) toast(`Заявка от ${from.name} отклонена.`);
    } catch (error) {
      toast(error.message, 'error');
    }
  },

  'remove-friend': (el) => {
    const friend = store.getUser(el.dataset.id);
    if (!friend) return;
    ui.confirm = {
      title: 'Убрать из друзей?',
      text: `${friend.name} пропадёт из вашего списка, а вы — из его. Вернуть всё можно новой заявкой или код-приглашением.`,
      label: 'Убрать',
      action: 'confirm-remove-friend',
      id: friend.id,
    };
    ui.modal = { type: 'confirm' };
    renderModal();
  },

  'confirm-remove-friend': async (el) => {
    try {
      const friend = await store.removeFriend(el.dataset.id);
      closeModal();
      if (friend) toast(`${friend.name} убран из друзей.`);
    } catch (error) {
      toast(error.message, 'error');
    }
  },

  'pick-avatar': () => pickAndPreviewAvatar(),

  'save-avatar': async () => {
    try {
      await store.setAvatar(ui.pendingAvatar);
      toast('Аватарка обновлена.');
      openModal('profile');
    } catch (error) {
      toast(error.message, 'error');
    }
  },

  'remove-avatar': async () => {
    try {
      await store.setAvatar(null);
      toast('Аватарка убрана — вместо неё инициалы.');
    } catch (error) {
      toast(error.message, 'error');
    }
  },

  'copy-code': async (el) => {
    const ok = await copyText(el.dataset.code);
    toast(ok ? `Код ${el.dataset.code} скопирован. Отправьте его другу.` : 'Не получилось скопировать — выделите код вручную.', ok ? 'ok' : 'error');
  },

  'regen-code': async () => {
    try {
      const code = await store.regenerateInviteCode();
      toast(`Новый код-приглашение: ${code}. Старый больше не работает.`);
    } catch (error) {
      toast(error.message, 'error');
    }
  },

  logout: () => {
    const me = store.getCurrentUser();
    store.logout();
    closeModal();
    toast(me ? `${me.name}, до встречи.` : 'Вы вышли.');
  },
};

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="overlay-down"]')) {
    const overlay = event.target.closest('[data-action="overlay-down"]');
    if (event.target === overlay) actions['overlay-down'](overlay, event);
  }
  const el = event.target.closest('[data-action]');
  if (!el || el.dataset.action === 'overlay-down') return;
  const action = actions[el.dataset.action];
  if (action) action(el, event);
});

/* ---------- клавиатура: Esc и ловушка фокуса ------------------ */

document.addEventListener('keydown', (event) => {
  if (!ui.modal) return;
  if (event.key === 'Escape') {
    closeModal();
    return;
  }
  if (event.key !== 'Tab') return;
  const dialog = document.querySelector('.dialog');
  if (!dialog) return;
  const list = [
    ...dialog.querySelectorAll('button:not([disabled]), input:not([disabled])'),
  ].filter((el) => el.offsetParent !== null);
  if (list.length === 0) return;
  const first = list[0];
  const last = list[list.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

/* ---------- присутствие и запуск ------------------------------ */

store.heartbeat();
setInterval(() => store.heartbeat(), 30_000);
/* Раз в полминуты перерисовываем панели: статусы друзей стареют сами.
   Открытые окна не трогаем — там могут быть поля ввода. */
setInterval(() => {
  if (!ui.modal) render();
  else renderRegions();
}, 30_000);
/* В hub-режиме опрашиваем общий сервер: друзья и заявки с других
   устройств появляются сами. Чаще, когда вкладка видима. */
setInterval(() => {
  if (document.visibilityState === 'visible') store.refreshRemote();
}, 5000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    store.heartbeat();
    store.refreshRemote();
  }
});
window.addEventListener('focus', () => store.heartbeat());
window.addEventListener('beforeunload', () => store.markOffline());

/* PWA: по https/localhost регистрируем service worker — меню становится
   устанавливаемым приложением и работает офлайн. С file:// (mir.html)
   и на голом http по локальной сети браузеры SW не разрешают. */
if (
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

render();
/* Если меню открыто по сети с serve.mjs — подключаемся к общему хабу. */
if (typeof store.initBackend === 'function') {
  store.initBackend().then((mode) => {
    if (mode === 'hub') toast('Подключено к общему хабу этой сети.');
  });
}
