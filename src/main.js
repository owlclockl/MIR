import './style.css';
import * as store from './data/store.js';
import * as p2p from './data/p2p.js';
import {
  createAvatarPreview,
  pickAvatarFile,
  processAvatarFile,
  releaseAvatarPreview,
} from './ui/avatar.js';
import { icon } from './ui/icons.js';
import { copyText, escapeHtml, formatDate, nameHue, toast } from './ui/dom.js';
import { configureSounds, playSound } from './ui/sound.js';

/* Название игры. Разбито на две строки — так оно читается и в шапке, и в заголовке. */
const TITLE = { lead: 'The civilization', tail: 'of the sages' };
const TITLE_FULL = `${TITLE.lead} ${TITLE.tail}`;
const VERSION = '0.5.0';

/* Аватар: загруженная картинка или инициалы на цвете из имени. */
const avatarEl = (user, cls = '') => {
  const offline = store.presenceOf(user) === 'offline';
  const off = offline ? ' avatar--dim' : '';
  if (user.avatar)
    return `<span class="avatar avatar--img${cls ? ` ${cls}` : ''}${off}"><img src="${user.avatar}" alt="" /></span>`;
  const hue = nameHue(user.nameKey);
  return `<span class="avatar${cls ? ` ${cls}` : ''}${off}" style="background:hsl(${hue} 26% 30%);color:hsl(${hue} 45% 87%)" aria-hidden="true">${escapeHtml(user.name.slice(0, 2).toUpperCase())}</span>`;
};

const PRESENCE = {
  playing: { label: 'В игре', modifier: 'live' },
  idle: { label: 'В меню', modifier: 'live' },
  offline: { label: 'Не в сети', modifier: 'off' },
};

/* ---------- модальные окна ---------------------------------- */

const ui = {
  modal: null, // { type, data }
  authTab: 'login',
  addQuery: '',
  codeValue: '',
  pendingAvatar: null,
  pendingAvatarFile: null,
  avatarCrop: { x: 50, y: 50, zoom: 1 },
  confirm: null,
  opener: null,
  chatDraft: '',
  hubDraft: '',
  /* Прямое подключение по коду: шаг мастера, выданные коды и черновики полей. */
  direct: { step: 'invite', offer: '', answer: '', offerDraft: '', answerDraft: '', busy: false },
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
  releaseAvatarPreview(ui.pendingAvatar);
  ui.pendingAvatar = null;
  ui.pendingAvatarFile = null;
  ui.avatarCrop = { x: 50, y: 50, zoom: 1 };
  ui.codeValue = '';
  ui.chatDraft = '';
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
    store.isHub()
      ? `Аккаунт хранится на общем хабе ${escapeHtml(store.hubHost())}.`
      : 'Всё хранится локально, в этом браузере.'
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

        <form class="form" data-form="change-name" novalidate>
          <p class="eyebrow">Никнейм</p>
          <div class="code-form__row">
            <input class="input" name="name" type="text" minlength="3" maxlength="16"
                   value="${escapeHtml(me.name)}" autocomplete="username" spellcheck="false" required />
            <button class="mini-button mini-button--accent" type="submit">Сохранить</button>
          </div>
          <p class="form-error" data-role="form-error" hidden></p>
          <p class="form-note">3–16 символов: буквы, цифры, дефис и подчёркивание.</p>
        </form>

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

        <div class="dialog__actions dialog__actions--spread">
          <button class="mini-button" type="button" data-action="open-hub">
            ${icon('globe', 'icon--xs')} Общий хаб
          </button>
          <button class="mini-button" type="button" data-action="open-direct">
            ${icon('link', 'icon--xs')} Прямое подключение по коду
          </button>
          <button class="mini-button mini-button--danger" type="button" data-action="logout">
            ${icon('logOut', 'icon--xs')} Выйти из аккаунта
          </button>
        </div>
      </div>`,
  });
};

/* --- Окно «Общий хаб» --- */
/* Хаб — общий сервер аккаунтов. Раньше он подхватывался только по
   адресу страницы: открыл ссылку с ПК друга — попал на его хаб,
   открыл mir.html с флешки — сидишь один. Теперь адрес можно
   ввести руками: игра из APK, из exe и с флешки подключается к
   хабу в интернете так же, как вкладка браузера. */
const hubModalHtml = () => {
  const connected = store.isHub();
  const host = store.hubHost();
  return dialogShell({
    label: 'Общий хаб',
    title: 'Общий хаб',
    size: 'wide',
    body: `
      <div class="dialog__body">
        <div class="link-box">
          <div class="link-box__text">
            <p class="eyebrow">Где сейчас аккаунты</p>
            <span class="link-state link-state--${connected ? 'live' : 'off'}">
              <span class="dot dot--${connected ? 'live' : 'off'}" aria-hidden="true"></span>${
                connected ? escapeHtml(host) : 'Только этот браузер'
              }
            </span>
            <p class="link-box__hint">${
              connected
                ? 'Аккаунты, друзья и заявки общие для всех, кто играет по этому адресу. Друг с другого конца страны увидит вас в списке.'
                : 'Аккаунт живёт в этом браузере и никуда не уходит. Чтобы играть с друзьями, подключитесь к общему хабу.'
            }</p>
          </div>
          ${
            connected
              ? `<div class="link-box__actions">
                   <button class="mini-button mini-button--danger" type="button" data-action="hub-disconnect">${icon('linkOff', 'icon--xs')} Отключиться</button>
                 </div>`
              : ''
          }
        </div>

        <form class="form" data-form="connect-hub" novalidate>
          <label class="field">
            <span class="field__label">Адрес хаба</span>
            <input class="input" name="url" type="text" inputmode="url" spellcheck="false"
                   autocomplete="off" placeholder="https://mir.имя.workers.dev"
                   value="${escapeHtml(ui.hubDraft)}" data-role="hub-input" data-autofocus />
          </label>
          <p class="form-error" data-role="form-error" hidden></p>
          <button class="solid-button" type="submit" data-role="submit">
            <span>Подключиться</span>
          </button>
        </form>

        <div class="divider" role="separator"></div>

        <p class="hint">Свой хаб поднимается одной командой — <strong>npm run host</strong>. Она выкладывает игру и хаб на бесплатный хостинг Cloudflare и выдаёт постоянную ссылку: она работает, даже когда ваш компьютер выключен. Полная инструкция — в README, раздел «Игра в интернете».</p>
        <p class="hint">Ссылкой на хаб делятся как есть — друг вставит её здесь же. У каждого хаба свои аккаунты: при смене адреса нужно войти заново.</p>
      </div>`,
  });
};

/* --- Настройки интерфейса --- */
const settingsModalHtml = () => {
  const settings = store.getSettings();
  return dialogShell({
    label: 'Настройки',
    title: 'Настройки',
    size: 'wide',
    body: `
      <div class="dialog__body settings-list">
        <label class="setting-row">
          <span><strong>Звуки интерфейса</strong><small>Кнопки, успешные действия и ошибки</small></span>
          <input class="switch" type="checkbox" data-setting="sound" ${settings.sound ? 'checked' : ''} />
        </label>
        <label class="setting-row setting-row--column">
          <span><strong>Громкость</strong><small>${Math.round(settings.volume * 100)}%</small></span>
          <input class="range" type="range" min="0" max="1" step="0.05" value="${settings.volume}" data-setting="volume" ${settings.sound ? '' : 'disabled'} />
        </label>
        <label class="setting-row">
          <span><strong>Анимации</strong><small>Плавные переходы и движение фона</small></span>
          <input class="switch" type="checkbox" data-setting="motion" ${settings.motion ? 'checked' : ''} />
        </label>
        <div class="setting-row">
          <span><strong>Обновления</strong><small data-role="update-status">Версия ${VERSION}. Проверка выполняется автоматически.</small></span>
          <button class="mini-button" type="button" data-action="check-update">Проверить</button>
        </div>
        <p class="form-note">Настройки сохраняются на этом устройстве. Обновление применяется один раз после загрузки и больше не создаёт цикл перезагрузок.</p>
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
      <div class="dialog__body avatar-editor">
        <div class="avatar-editor__frame">
          <img class="avatar-editor__img" src="${ui.pendingAvatar}" alt="Предпросмотр аватарки"
               style="object-position:${ui.avatarCrop.x}% ${ui.avatarCrop.y}%;transform:scale(${ui.avatarCrop.zoom})" />
          <span class="avatar-editor__guide" aria-hidden="true"></span>
        </div>
        <div class="avatar-editor__controls">
          <label class="field">
            <span class="field__label">Масштаб</span>
            <input class="range" type="range" min="1" max="2.5" step="0.05" value="${ui.avatarCrop.zoom}" data-role="avatar-zoom" />
          </label>
          <div class="form__grid">
            <label class="field"><span class="field__label">По горизонтали</span><input class="range" type="range" min="0" max="100" value="${ui.avatarCrop.x}" data-role="avatar-x" /></label>
            <label class="field"><span class="field__label">По вертикали</span><input class="range" type="range" min="0" max="100" value="${ui.avatarCrop.y}" data-role="avatar-y" /></label>
          </div>
        </div>
        <p class="hint">Передвигайте кадр ползунками. Сохраняется чёткая версия 192×192.</p>
        <div class="dialog__actions">
          <button class="mini-button" type="button" data-action="pick-avatar">Выбрать другую</button>
          <button class="solid-button" type="button" data-action="save-avatar" data-autofocus><span>Сохранить</span></button>
        </div>
      </div>
    </section>
  </div>`;

/* --- Прямая связь: общие кусочки разметки --- */

/* Как называется состояние канала в интерфейсе. «Через хаб» — честное
   признание, что NAT не пробился и сообщения идут запасным путём. */
const LINK = {
  direct: { label: 'Напрямую', modifier: 'live' },
  relay: { label: 'Через хаб', modifier: 'warn' },
  connecting: { label: 'Соединяемся…', modifier: 'warn' },
  offline: { label: 'Нет связи', modifier: 'off' },
};

const linkStateHtml = (peerId) => {
  const { state, rtt } = p2p.status(peerId);
  const view = LINK[state] ?? LINK.offline;
  const ms = state === 'direct' && typeof rtt === 'number' ? ` · ${rtt} мс` : '';
  return `<span class="link-state link-state--${view.modifier}">
      <span class="dot dot--${view.modifier}" aria-hidden="true"></span>${view.label}${ms}
    </span>`;
};

const chatRowHtml = (message) => `
  <div class="chat__row${message.mine ? ' chat__row--mine' : ''}">
    <p class="chat__bubble">${escapeHtml(message.text)}</p>
    <small class="chat__meta">${new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.at))}${message.via === 'relay' ? ' · через хаб' : ''}</small>
  </div>`;

const chatHtml = (peerId, { placeholder }) => {
  const list = p2p.messages(peerId);
  const connected = p2p.status(peerId).state !== 'offline';
  return `
    <div class="chat">
      <div class="chat__list" data-role="chat-list" role="log" aria-label="Переписка">
        ${
          list.length
            ? list.map(chatRowHtml).join('')
            : `<p class="hint hint--center">${escapeHtml(placeholder)}</p>`
        }
      </div>
      <form class="chat__form" data-form="chat" data-id="${peerId}" novalidate>
        <input class="input" type="text" maxlength="2000" autocomplete="off"
               placeholder="${connected ? 'Сообщение…' : 'Связи нет — сообщение не уйдёт'}"
               data-role="chat-input" value="${escapeHtml(ui.chatDraft)}" ${connected ? '' : 'disabled'} />
        <button class="icon-button icon-button--sm" type="submit" aria-label="Отправить" ${connected ? '' : 'disabled'}>
          ${icon('send')}
        </button>
      </form>
    </div>`;
};

/* --- Окно друга --- */
const friendModalHtml = (friendId) => {
  const friend = store.getUser(friendId);
  if (!friend) return authModalHtml();
  const presence = PRESENCE[store.presenceOf(friend)];
  const link = p2p.status(friendId).state;
  return dialogShell({
    label: `Игрок ${friend.name}`,
    title: 'Игрок',
    size: 'wide',
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

        <div class="link-box">
          <div class="link-box__text">
            <p class="eyebrow">Прямая связь</p>
            ${linkStateHtml(friendId)}
            <p class="link-box__hint">${escapeHtml(linkHint(friend, link))}</p>
          </div>
          <div class="link-box__actions">
            ${
              link === 'offline'
                ? `<button class="mini-button mini-button--accent" type="button" data-action="p2p-connect" data-id="${friend.id}">${icon('link', 'icon--xs')} Подключиться</button>`
                : `<button class="mini-button" type="button" data-action="p2p-connect" data-id="${friend.id}">${icon('refresh', 'icon--xs')} Переподключить</button>
                   <button class="mini-button mini-button--danger" type="button" data-action="p2p-disconnect" data-id="${friend.id}">${icon('linkOff', 'icon--xs')} Отключить</button>`
            }
          </div>
        </div>

        ${chatHtml(friend.id, {
          placeholder:
            link === 'offline'
              ? 'Сообщения появятся, когда оба будете в приложении.'
              : 'Напишите первым — сообщения идут прямо на устройство друга.',
        })}

        <div class="divider" role="separator"></div>

        <button class="mini-button mini-button--danger" type="button" data-action="remove-friend" data-id="${friend.id}">
          Убрать из друзей
        </button>
      </div>`,
  });
};

/* Короткое объяснение под статусом: человеку важно понимать, почему
   связи нет и что с этим делать. */
const linkHint = (friend, link) => {
  if (!p2p.supported()) return 'Этот браузер не умеет прямые соединения — обновите его.';
  if (link === 'direct') return 'Данные идут напрямую между устройствами, сервер не участвует.';
  if (link === 'relay')
    return 'Прямой путь закрыт домашним роутером — сообщения идут через хаб, попытки пробиться продолжаются.';
  if (link === 'connecting') return 'Договариваемся о прямом канале — обычно пара секунд.';
  if (store.presenceOf(friend) === 'offline') return 'Игрок не в сети. Связь поднимется сама, как только он откроет приложение.';
  if (!store.isHub())
    return 'Общий хаб не подключён: соединитесь по коду прямого подключения или подключите хаб — обе кнопки внизу панели друзей.';
  return 'Связи нет. Нажмите «Подключиться» — попытка начнётся заново.';
};

/* --- Окно прямого подключения по коду --- */
/* Сценарий без всякого сервера: один создаёт код, второй отвечает
   своим. Нужен, когда хаба нет вовсе — например, у обоих mir.html. */

/* После падения соединения интерфейс обязан сказать, что произошло:
   молчаливое «нет связи» выглядит как зависание. */
const directFailHtml = (link) => {
  if (link.state !== 'offline' || link.failReason !== 'nat') return '';
  return `<p class="form-note form-note--warn">Попытка не соединилась: прямой канал не пробился между устройствами. Чаще всего мешают включённый VPN или прокси (StealthSurf, Radmin, режим TUN) либо строгий роутер/файрвол. Отключите VPN и создайте коды заново — а если друг далеко, надёжнее общая ссылка: по ней сообщения дойдут даже запасным путём через хаб.</p>`;
};

/* Что вошло в код после сбора ICE: без внешнего адреса от STUN через
   интернет не соединиться — предупреждаем до того, как код уйдёт другу. */
const gatherNoteHtml = (code) => {
  if (!code) return '';
  const { gather } = p2p.status(p2p.MANUAL_ID);
  if (!gather) return '';
  if (gather.total === 0)
    return `<p class="form-note form-note--warn">В код не вошёл ни один сетевой адрес: устройство не видит сеть — обычно это VPN/файрвол. Проверьте подключение и создайте код заново.</p>`;
  if (gather.srflx === 0)
    return `<p class="form-note form-note--warn">В код вошли только локальные адреса (STUN не ответил — чаще всего из-за VPN/прокси). В одной сети Wi-Fi такой код сработает, а для друга из интернета отключите VPN и создайте код заново.</p>`;
  return '';
};

const directModalHtml = () => {
  const link = p2p.status(p2p.MANUAL_ID);
  const connected = link.state !== 'offline';
  const step = ui.direct.step;
  return dialogShell({
    label: 'Прямое подключение по коду',
    title: 'Прямое подключение',
    size: 'wide',
    body: `
      <div class="dialog__body">
        <p class="hint">
          Связь между двумя устройствами без сервера: один создаёт код приглашения,
          второй вставляет его у себя и отдаёт ответный код. Коды длинные — копируйте кнопкой.
        </p>

        <div class="link-box">
          <div class="link-box__text">
            <p class="eyebrow">Состояние</p>
            ${linkStateHtml(p2p.MANUAL_ID)}
            <p class="link-box__hint">${
              connected
                ? `Собеседник: ${escapeHtml(link.name || 'без имени')}.`
                : 'Пока никого. Выберите, кто создаёт приглашение.'
            }</p>
          </div>
          ${
            connected
              ? `<div class="link-box__actions">
                   <button class="mini-button mini-button--danger" type="button" data-action="direct-drop">${icon('linkOff', 'icon--xs')} Разорвать</button>
                 </div>`
              : ''
          }
        </div>

        ${directFailHtml(link)}

        ${
          connected
            ? chatHtml(p2p.MANUAL_ID, { placeholder: 'Связь есть — пишите.' })
            : `
        <div class="tabs" role="tablist" aria-label="Роль">
          <button class="tab${step === 'invite' ? ' tab--active' : ''}" type="button" role="tab" aria-selected="${step === 'invite'}" data-action="direct-step" data-step="invite">Я приглашаю</button>
          <button class="tab${step === 'join' ? ' tab--active' : ''}" type="button" role="tab" aria-selected="${step === 'join'}" data-action="direct-step" data-step="join">Мне прислали код</button>
        </div>

        ${step === 'invite' ? directInviteHtml() : directJoinHtml()}`
        }
      </div>`,
  });
};

const codeAreaHtml = (label, value, { action = '' } = {}) => `
  <div class="field">
    <span class="field__label">${escapeHtml(label)}</span>
    <textarea class="input input--code-area" rows="3" readonly spellcheck="false">${escapeHtml(value)}</textarea>
    ${
      action
        ? `<button class="mini-button" type="button" data-action="${action}">${icon('copy', 'icon--xs')} Скопировать код</button>`
        : ''
    }
  </div>`;

const directInviteHtml = () => `
  <div class="steps">
    ${
      ui.direct.offer
        ? codeAreaHtml('1. Отправьте другу этот код', ui.direct.offer, { action: 'direct-copy-offer' })
        : `<button class="solid-button" type="button" data-action="direct-create" ${ui.direct.busy ? 'disabled' : ''}>
             <span>${ui.direct.busy ? 'Готовим код…' : 'Создать код приглашения'}</span>
           </button>`
    }
    ${gatherNoteHtml(ui.direct.offer)}
    ${
      ui.direct.offer
        ? `<form class="form" data-form="direct-complete" novalidate>
             <label class="field">
               <span class="field__label">2. Вставьте ответный код друга</span>
               <textarea class="input input--code-area" rows="3" spellcheck="false" data-role="direct-answer" placeholder="MIR1.…">${escapeHtml(ui.direct.answerDraft)}</textarea>
             </label>
             <p class="form-error" data-role="form-error" hidden></p>
             <button class="mini-button mini-button--accent" type="submit">Соединиться</button>
           </form>`
        : ''
    }
  </div>`;

const directJoinHtml = () => `
  <div class="steps">
    <form class="form" data-form="direct-accept" novalidate>
      <label class="field">
        <span class="field__label">1. Вставьте код приглашения</span>
        <textarea class="input input--code-area" rows="3" spellcheck="false" data-role="direct-offer" placeholder="MIR1.…">${escapeHtml(ui.direct.offerDraft)}</textarea>
      </label>
      <p class="form-error" data-role="form-error" hidden></p>
      <button class="mini-button mini-button--accent" type="submit">Получить ответный код</button>
    </form>
    ${
      ui.direct.answer
        ? codeAreaHtml('2. Отправьте этот ответный код обратно', ui.direct.answer, {
            action: 'direct-copy-answer',
          })
        : ''
    }
    ${gatherNoteHtml(ui.direct.answer)}
  </div>`;

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

/* focus: ставить ли фокус внутрь окна. При открытии — да; при
   фоновой перерисовке (пришло сообщение, сменился статус) — нет,
   иначе фокус прыгал бы с кнопки на кнопку каждые несколько секунд. */
const renderModal = ({ focus = true } = {}) => {
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
    case 'settings':
      html = settingsModalHtml();
      break;
    case 'avatar-preview':
      html = avatarPreviewHtml();
      break;
    case 'friend':
      html = friendModalHtml(ui.modal.data);
      break;
    case 'direct':
      html = directModalHtml();
      break;
    case 'hub':
      html = hubModalHtml();
      break;
    case 'confirm':
      html = confirmModalHtml();
      break;
  }
  root.innerHTML = html;
  /* Переписка всегда показывает последнее сообщение. */
  const log = root.querySelector('[data-role="chat-list"]');
  if (log) log.scrollTop = log.scrollHeight;
  if (!focus) return;
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
  const link = p2p.status(friend.id).state;
  const unread = p2p.unread(friend.id);
  /* Подпись показывает самое важное: есть ли прямой канал. */
  const state =
    link === 'direct' || link === 'relay' ? LINK[link].label : presence.label;
  return `
    <button class="friend friend--${presence.modifier}" type="button" data-action="open-friend" data-id="${friend.id}">
      ${avatarEl(friend, 'avatar--sm')}
      <span class="friend__text">
        <strong class="friend__name" translate="no">${escapeHtml(friend.name)}</strong>
        <small class="friend__state">${state}</small>
      </span>
      ${
        unread
          ? `<span class="badge badge--inline" aria-label="Непрочитанных сообщений: ${unread}">${unread}</span>`
          : ''
      }
      ${
        link === 'direct'
          ? `<span class="friend__link" title="Прямое соединение" aria-label="Прямое соединение">${icon('link', 'icon--xs')}</span>`
          : ''
      }
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
          <button class="mini-button" type="button" data-action="open-hub">
            ${icon('globe', 'icon--xs')} ${store.isHub() ? 'Общий хаб подключён' : 'Подключиться к общему хабу'}
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
      <button class="mini-button mini-button--wide" type="button" data-action="open-hub">
        ${icon('globe', 'icon--xs')} Общий хаб
      </button>
      <button class="mini-button mini-button--wide" type="button" data-action="open-direct">
        ${icon('link', 'icon--xs')} Прямое подключение по коду
      </button>
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
        <button class="icon-button" type="button" data-action="open-settings" aria-label="Настройки">
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

/* ---------- настройки и динамические области ----------------- */

configureSounds(store.getSettings);
const applySettings = () => {
  const settings = store.getSettings();
  document.documentElement.classList.toggle('reduce-motion', !settings.motion);
};
applySettings();
store.subscribe(applySettings);

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
      (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
      active.dataset.role
        ? { role: active.dataset.role, pos: active.selectionStart }
        : null;
    renderModal({ focus: false });
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
p2p.subscribe(render);
let knownUnread = 0;
const notifyIncomingMessage = () => {
  const me = store.getCurrentUser();
  const total = (me ? store.listFriends(me.id).reduce((sum, friend) => sum + p2p.unread(friend.id), 0) : 0)
    + p2p.unread(p2p.MANUAL_ID);
  if (total > knownUnread) playSound('message');
  knownUnread = total;
};
p2p.subscribe(notifyIncomingMessage);

/* ---------- прямая связь: включение и выключение -------------- */

/* P2P живёт ровно столько, сколько длится сессия игрока: вошёл —
   поднимаем соединения с друзьями, вышел — закрываем все каналы,
   чтобы ничего не висело в фоне и не держало чужую переписку. */
let p2pRunning = false;

const syncP2P = () => {
  const me = store.getCurrentUser();
  if (me && !p2pRunning) {
    p2p.start();
    p2pRunning = true;
  } else if (!me && p2pRunning) {
    p2p.stop();
    p2pRunning = false;
  }
};

store.subscribe(syncP2P);

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
    playSound('error');
    setFormError(form, error instanceof Error ? error.message : 'Что-то пошло не так.');
  } finally {
    submit?.removeAttribute('disabled');
  }
};

const formHandlers = {
  'change-name': (form, fields) =>
    withBusy(form, async () => {
      const user = await store.changeName(fields.name.value);
      setFormError(form, '');
      playSound('success');
      toast(`Никнейм изменён на ${user.name}.`);
      renderModal({ focus: false });
    }),

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

  'connect-hub': (form, fields) =>
    withBusy(form, async () => {
      const { url, users } = await store.connectHub(fields.url.value);
      ui.hubDraft = url;
      setFormError(form, '');
      renderModal({ focus: false });
      syncP2P();
      toast(
        users > 0
          ? `Хаб подключён: ${store.hubHost()}. Игроков на нём: ${users}. Войдите или создайте аккаунт.`
          : `Хаб подключён: ${store.hubHost()}. Вы первый — создайте аккаунт.`,
      );
    }),

  'change-password': (form, fields) =>
    withBusy(form, async () => {
      await store.changePassword(fields.old.value, fields.next.value);
      form.reset();
      setFormError(form, '');
      toast('Пароль обновлён.');
    }),

  chat: (form) => {
    const input = form.querySelector('[data-role="chat-input"]');
    const text = input.value.trim();
    if (!text) return;
    const via = p2p.send(form.dataset.id, text);
    if (!via) {
      toast('Связи нет — сообщение не отправлено.', 'error');
      return;
    }
    ui.chatDraft = '';
    input.value = '';
    render();
    document.querySelector('[data-role="chat-input"]')?.focus();
  },

  'direct-accept': (form) =>
    withBusy(form, async () => {
      const area = form.querySelector('[data-role="direct-offer"]');
      const answer = await p2p.acceptInviteCode(area.value);
      ui.direct.answer = answer;
      ui.direct.offerDraft = area.value.trim();
      setFormError(form, '');
      renderModal({ focus: false });
      toast('Ответный код готов — отправьте его другу.');
    }),

  'direct-complete': (form) =>
    withBusy(form, async () => {
      const area = form.querySelector('[data-role="direct-answer"]');
      await p2p.completeInvite(area.value);
      ui.direct.answerDraft = '';
      setFormError(form, '');
      renderModal({ focus: false });
      toast('Коды приняты — устанавливаем прямую связь.');
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
  if (role === 'avatar-zoom' || role === 'avatar-x' || role === 'avatar-y') {
    if (role === 'avatar-zoom') ui.avatarCrop.zoom = Number(event.target.value);
    if (role === 'avatar-x') ui.avatarCrop.x = Number(event.target.value);
    if (role === 'avatar-y') ui.avatarCrop.y = Number(event.target.value);
    const image = document.querySelector('.avatar-editor__img');
    if (image) {
      image.style.objectPosition = `${ui.avatarCrop.x}% ${ui.avatarCrop.y}%`;
      image.style.transform = `scale(${ui.avatarCrop.zoom})`;
    }
  }
  if (role === 'friend-search') {
    ui.addQuery = event.target.value;
    const me = store.getCurrentUser();
    const box = document.querySelector('[data-role="friend-results"]');
    if (me && box) box.innerHTML = searchResultsHtml(me);
  }
  if (role === 'chat-input') ui.chatDraft = event.target.value;
  if (role === 'hub-input') ui.hubDraft = event.target.value;
  if (role === 'direct-offer') ui.direct.offerDraft = event.target.value;
  if (role === 'direct-answer') ui.direct.answerDraft = event.target.value;
  if (role === 'code-input') {
    const raw = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const formatted = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4, 8)}` : raw;
    event.target.value = formatted;
    ui.codeValue = formatted;
  }
});

document.addEventListener('change', (event) => {
  const key = event.target.dataset?.setting;
  if (!key) return;
  const value = event.target.type === 'checkbox' ? event.target.checked : Number(event.target.value);
  store.updateSettings({ [key]: value });
  applySettings();
  if (key === 'sound' && value) playSound('success');
  renderModal({ focus: false });
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
    releaseAvatarPreview(ui.pendingAvatar);
    ui.pendingAvatar = createAvatarPreview(file);
    ui.pendingAvatarFile = file;
    ui.avatarCrop = { x: 50, y: 50, zoom: 1 };
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
  'open-settings': () => openModal('settings'),
  'check-update': async () => {
    const status = document.querySelector('[data-role="update-status"]');
    if (status) status.textContent = 'Проверяем…';
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update();
      if (status) status.textContent = registration?.waiting ? 'Обновление готово — применяем…' : `Установлена свежая версия ${VERSION}.`;
      if (registration?.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      else playSound('success');
    } catch {
      if (status) status.textContent = 'Не удалось проверить. Проверьте интернет.';
      playSound('error');
    }
  },
  'open-add-friend': () => {
    ui.addQuery = '';
    ui.codeValue = '';
    openModal('add-friend');
  },
  'open-friend': (el) => {
    ui.chatDraft = '';
    openModal('friend', el.dataset.id);
    p2p.markRead(el.dataset.id);
  },

  'open-direct': () => {
    ui.direct = { step: 'invite', offer: '', answer: '', offerDraft: '', answerDraft: '', busy: false };
    ui.chatDraft = '';
    openModal('direct');
    p2p.markRead(p2p.MANUAL_ID);
  },

  'open-hub': () => {
    ui.hubDraft = store.suggestedHubUrl();
    openModal('hub');
  },

  'hub-disconnect': () => {
    store.disconnectHub();
    p2p.stop({ quiet: true });
    p2pRunning = false;
    ui.hubDraft = store.suggestedHubUrl();
    renderModal({ focus: false });
    toast('Хаб отключён — аккаунты снова только в этом браузере.');
  },

  'direct-step': (el) => {
    ui.direct.step = el.dataset.step;
    renderModal();
  },

  'direct-create': async () => {
    ui.direct.busy = true;
    renderModal({ focus: false });
    try {
      ui.direct.offer = await p2p.createInviteCode();
      toast('Код готов. Передайте его другу любым способом.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось создать код.', 'error');
    } finally {
      ui.direct.busy = false;
      renderModal({ focus: false });
    }
  },

  'direct-copy-offer': async () => {
    const ok = await copyText(ui.direct.offer);
    toast(ok ? 'Код приглашения скопирован.' : 'Не получилось скопировать — выделите текст вручную.', ok ? 'ok' : 'error');
  },

  'direct-copy-answer': async () => {
    const ok = await copyText(ui.direct.answer);
    toast(ok ? 'Ответный код скопирован.' : 'Не получилось скопировать — выделите текст вручную.', ok ? 'ok' : 'error');
  },

  'direct-drop': () => {
    p2p.dropManual();
    ui.direct = { step: 'invite', offer: '', answer: '', offerDraft: '', answerDraft: '', busy: false };
    renderModal();
    toast('Прямое подключение закрыто.');
  },

  'p2p-connect': (el) => {
    p2p.reconnect(el.dataset.id);
    toast('Пробуем соединиться напрямую…');
  },

  'p2p-disconnect': (el) => {
    p2p.disconnect(el.dataset.id);
    toast('Прямая связь разорвана.');
  },

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
      const avatar = await processAvatarFile(ui.pendingAvatarFile, ui.avatarCrop);
      await store.setAvatar(avatar);
      releaseAvatarPreview(ui.pendingAvatar);
      ui.pendingAvatar = null;
      ui.pendingAvatarFile = null;
      playSound('success');
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
  if (event.target.closest('button:not([disabled])')) playSound('click');
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
window.addEventListener('beforeunload', () => {
  store.markOffline();
  p2p.stop({ quiet: true });
  p2pRunning = false;
});

/* PWA: по https/localhost регистрируем service worker — меню становится
   устанавливаемым приложением и работает офлайн. С file:// (mir.html)
   и на голом http по локальной сети браузеры SW не разрешают. */
if (
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
) {
  /* Обновляемся без вечного reload-цикла: перезагрузка разрешена ровно
     один раз для конкретной версии и только если страницу уже контролировал SW. */
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const key = `mir:updated:${VERSION}`;
    if (!hadController || reloading || sessionStorage.getItem(key)) return;
    reloading = true;
    sessionStorage.setItem(key, '1');
    location.reload();
  });
  navigator.serviceWorker.register('/sw.js').then((registration) => {
    registration.update().catch(() => {});
    setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }).catch(() => {});
}

render();
/* Если меню открыто по сети с serve.mjs — подключаемся к общему хабу. */
if (typeof store.initBackend === 'function') {
  store.initBackend().then((mode) => {
    if (mode === 'hub') toast(`Подключено к общему хабу: ${store.hubHost()}.`);
    syncP2P();
  });
} else {
  syncP2P();
}
