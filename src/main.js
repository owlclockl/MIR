import './style.css';
import * as store from './data/store.js';
import * as p2p from './data/p2p.js';
import * as update from './data/update.js';
import {
  createAvatarPreview,
  pickAvatarFile,
  processAvatarFile,
  releaseAvatarPreview,
} from './ui/avatar.js';
import { icon } from './ui/icons.js';
import { copyText, escapeHtml, formatDate, nameHue, toast } from './ui/dom.js';
import { configureSounds, playSound } from './ui/sound.js';
import {
  BIOME_NAMES,
  BLOCK_NAMES,
  CLIMATE_PRESETS,
  EARTH_SURFACE_KM2,
  LANDSCAPE_PRESETS,
  MAX_CONTINENTS,
  createWorld,
} from './game/world.js';
import { cameraPanDelta, drawVoxelView, drawWorldMap, worldMapPointAt } from './game/render.js';

/* Название игры. Разбито на две строки — так оно читается и в шапке, и в заголовке. */
const TITLE = { lead: 'The civilization', tail: 'of the sages' };
const TITLE_FULL = `${TITLE.lead} ${TITLE.tail}`;
/* Версию подставляет сборщик из package.json (define в vite.config.js) —
   один источник правды вместо четырёх файлов, которые надо не забыть
   обновить вместе. Запасное значение нужно лишь для чтения модуля без
   сборки (например, из тестов). */
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
/* Полный Azgaar доступен в веб/PWA-сборке, где рядом раздаётся его каталог
   public/fmg. Однофайловый mir.html остаётся самодостаточным и не обещает
   открыть отсутствующую папку. */
const HAS_AZGAAR_EDITOR =
  typeof __MIR_AZGAAR_AVAILABLE__ === 'boolean' && __MIR_AZGAAR_AVAILABLE__;

/* Аватар: загруженная картинка или инициалы на цвете из имени.

   Разметка аватарки кешируется. Причина простая: data URL аватарки —
   это десятки килобайт, и панель друзей, собранная заново, каждый раз
   вклеивала их в строку разметки. Теперь для неизменившейся картинки
   берётся готовая строка: сравнение `===` по одной и той же строке
   мгновенно, а копирования мегабайтов base64 не происходит вовсе. */
const avatarMarkupCache = new Map(); // ключ → { avatar, html }

const buildAvatarEl = (user, cls, offline) => {
  const off = offline ? ' avatar--dim' : '';
  if (user.avatar)
    return `<span class="avatar avatar--img${cls ? ` ${cls}` : ''}${off}"><img src="${user.avatar}" alt="" /></span>`;
  const hue = nameHue(user.nameKey);
  return `<span class="avatar${cls ? ` ${cls}` : ''}${off}" style="background:hsl(${hue} 26% 30%);color:hsl(${hue} 45% 87%)" aria-hidden="true">${escapeHtml(user.name.slice(0, 2).toUpperCase())}</span>`;
};

const avatarEl = (user, cls = '') => {
  const offline = store.presenceOf(user) === 'offline';
  const avatar = user.avatar ?? null;
  const key = `${user.id}|${cls}|${offline ? 'off' : 'on'}`;
  const cached = avatarMarkupCache.get(key);
  if (cached && cached.avatar === avatar) return cached.html;
  const html = buildAvatarEl(user, cls, offline);
  /* Кеш не должен расти бесконечно, если по поиску прошло много людей. */
  if (avatarMarkupCache.size > 400) avatarMarkupCache.clear();
  avatarMarkupCache.set(key, { avatar, html });
  return html;
};

const PRESENCE = {
  playing: { label: 'В игре', modifier: 'live' },
  idle: { label: 'В меню', modifier: 'live' },
  offline: { label: 'Не в сети', modifier: 'off' },
};

/* ---------- скрытая панель админа ----------------------------
   Служебный раздел: аккаунты, пароли, дружба, диагностика. В меню
   его не видно — вход через семь быстрых касаний знака, сочетание
   клавиш или адрес с `#admin`, а дальше спрашивается ключ. */

const ADMIN_TAPS = 7; // быстрых касаний по знаку — секретная комбинация
const ADMIN_TAP_WINDOW = 2800; // миллисекунд на комбинацию

const adminState = () => ({
  tab: 'overview', // overview | players | requests | events | system
  query: '',
  requestQuery: '',
  eventQuery: '',
  range: '14', // сколько дней показать в аналитике
  filter: 'all', // all | online | offline | banned | today | active
  sort: 'name', // name | seen | created
  limit: 60, // сколько строк списка показано
  eventFilter: 'all', // all | players | admin
  data: null, // снимок от store.adminSnapshot()
  openId: null, // открытая карточка игрока
  lastUpdatedAt: 0,
  banReason: '', // черновик формы блокировки
  banHours: '0',
  keyDraft: '',
  nameDraft: '',
  passDraft: '',
  newKeyDraft: '',
  repeatKeyDraft: '',
  error: '',
  busy: false,
});

/* ---------- модальные окна ---------------------------------- */

const ui = {
  modal: null, // { type, data }
  admin: adminState(),
  authTab: 'login',
  /* Черновики полей входа/регистрации: окно перерисовывается при обновлении
     данных хаба, и без черновиков введённый текст пропадал бы вместе со
     старой разметкой (окно «открывалось пустым»). */
  authDraft: { name: '', password: '', password2: '' },
  addQuery: '',
  codeValue: '',
  pendingAvatar: null,
  pendingAvatarFile: null,
  avatarCrop: { x: 50, y: 50, zoom: 1, rotation: 0 },
  avatarDrag: null,
  confirm: null,
  opener: null,
  chatDraft: '',
  hubDraft: '',
  /* Прямое подключение по коду: шаг мастера, выданные коды и черновики полей. */
  direct: { step: 'invite', offer: '', answer: '', offerDraft: '', answerDraft: '', busy: false },
  world: null, // настройки генерации или текущая сессия мира
};

let worldCameraDrag = null;
let worldMapDragSuppressed = false;
let worldPageHistoryEntry = false;
let renderedWorldPageHtml = '';
let backendReady = store.isBackendInitialized?.() ?? false;

/* Разметка, которая сейчас лежит в слое окон. Сравниваем строки между
   собой, а не с `innerHTML`: окно с аватаркой — это десятки килобайт
   base64, и сериализация DOM на каждое обновление данных была заметной
   работой впустую. */
let renderedModalHtml = '';

const overlayRoot = () => document.querySelector('#overlay-root');
const worldPageRoot = () => document.querySelector('#world-page-root');
const worldRoot = () => ui.world?.open ? worldPageRoot() : overlayRoot();

const openModal = (type, data = null) => {
  ui.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  ui.modal = { type, data };
  playSound('open');
  renderModal();
};

const closeModal = () => {
  if (!ui.modal) return;
  playSound('close');
  ui.modal = null;
  ui.confirm = null;
  releaseAvatarPreview(ui.pendingAvatar);
  ui.pendingAvatar = null;
  ui.pendingAvatarFile = null;
  ui.avatarCrop = { x: 50, y: 50, zoom: 1, rotation: 0 };
  ui.avatarDrag = null;
  worldCameraDrag = null;
  ui.codeValue = '';
  ui.chatDraft = '';
  ui.authDraft = { name: '', password: '', password2: '' };
  const root = overlayRoot();
  if (root) root.innerHTML = '';
  /* Слой окон пуст: помнить прежнюю разметку больше нельзя, иначе
     следующее такое же окно посчитает, что оно уже нарисовано. */
  renderedModalHtml = '';
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
  if (!backendReady)
    return `<p class="form-note">Подключаемся к общему хабу… Вход станет доступен после проверки.</p>`;
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
  const lock = backendReady ? '' : 'disabled';
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
                 autocomplete="username" spellcheck="false" required data-autofocus
                 data-role="auth-name" value="${escapeHtml(ui.authDraft.name)}" ${lock} />
        </label>
        <label class="field">
          <span class="field__label">Пароль</span>
          <input class="input" name="password" type="password" minlength="6" maxlength="72"
                 autocomplete="${isLogin ? 'current-password' : 'new-password'}" required
                 data-role="auth-password" value="${escapeHtml(ui.authDraft.password)}" ${lock} />
        </label>
        ${
          isLogin
            ? ''
            : `<label class="field">
          <span class="field__label">Пароль ещё раз</span>
          <input class="input" name="password2" type="password" minlength="6" maxlength="72"
                 autocomplete="new-password" required
                 data-role="auth-password2" value="${escapeHtml(ui.authDraft.password2)}" ${lock} />
        </label>`
        }
        <p class="form-error" data-role="form-error" hidden></p>
        <button class="solid-button" type="submit" data-role="submit" ${lock}>
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
  const ready = store.isBackendInitialized?.() ?? backendReady;
  const connected = ready && store.isHub();
  const host = store.hubHost();
  const stateClass = !ready ? 'warn' : connected ? 'live' : 'off';
  return dialogShell({
    label: 'Общий хаб',
    title: 'Общий хаб',
    size: 'wide',
    body: `
      <div class="dialog__body">
        <div class="link-box">
          <div class="link-box__text">
            <p class="eyebrow">Где сейчас аккаунты</p>
            <span class="link-state link-state--${stateClass}">
              <span class="dot dot--${stateClass}" aria-hidden="true"></span>${
                !ready ? 'Проверяем общий хаб…' : connected ? escapeHtml(host) : 'Только этот браузер'
              }
            </span>
            <p class="link-box__hint">${
              !ready
                ? 'При запуске сначала проверяется общий хаб. Если он не отвечает, игра откроется в локальном офлайн-режиме.'
                : connected
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
                   value="${escapeHtml(ui.hubDraft)}" data-role="hub-input" data-autofocus ${ready ? '' : 'disabled'} />
          </label>
          <p class="form-error" data-role="form-error" hidden></p>
          <button class="solid-button" type="submit" data-role="submit" ${ready ? '' : 'disabled'}>
            <span>${ready ? 'Подключиться' : 'Проверяем хаб…'}</span>
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
          <span><strong>Звуки игрового меню</strong><small>Кнопки, окна, переключатели и игровые события</small></span>
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
          <span><strong>Обновления</strong><small>${updateStatusText()}</small></span>
          <button class="mini-button${update.getUpdateInfo().available ? ' mini-button--accent' : ''}" type="button" data-action="${update.getUpdateInfo().available ? 'update-apply' : 'check-update'}">${update.getUpdateInfo().available ? 'Обновить' : 'Проверить'}</button>
        </div>
        <label class="setting-row">
          <span><strong>Уведомления на телефон</strong><small>${notifyHint()}</small></span>
          <input class="switch" type="checkbox" data-setting="notify" ${settings.notify ? 'checked' : ''} ${update.notificationState().supported ? '' : 'disabled'} />
        </label>
        <p class="form-note">Настройки сохраняются на этом устройстве. Обновление применяется один раз после загрузки и больше не создаёт цикл перезагрузок.</p>
      </div>`,
  });
};

/* --- Современный редактор аватарки: перетаскивание, зум и точная настройка --- */
const avatarPreviewHtml = () => dialogShell({
  label: 'Редактор аватарки',
  title: 'Настроить аватарку',
  size: 'avatar',
  body: `
    <div class="dialog__body avatar-editor">
      <div class="avatar-editor__workspace">
        <div class="avatar-editor__canvas-wrap">
          <div class="avatar-editor__frame" data-role="avatar-frame" role="group" tabindex="0"
               aria-label="Кадр аватарки. Перетаскивайте изображение, стрелки на клавиатуре двигают кадр."
               aria-describedby="avatar-editor-help">
            <img class="avatar-editor__img" data-role="avatar-editor-image" src="${ui.pendingAvatar}"
                 alt="Исходная фотография для кадрирования" draggable="false" />
            <span class="avatar-editor__grid" aria-hidden="true"></span>
            <span class="avatar-editor__center" aria-hidden="true"></span>
          </div>
          <p class="avatar-editor__tip" id="avatar-editor-help">Перетащите фото, чтобы выбрать кадр. Колёсико мыши меняет масштаб.</p>
        </div>

        <aside class="avatar-editor__panel" aria-label="Настройки кадрирования">
          <div class="avatar-editor__sample">
            <div class="avatar-editor__sample-frame" data-role="avatar-sample-frame">
              <img class="avatar-editor__sample-img" data-role="avatar-sample-image" src="${ui.pendingAvatar}"
                   alt="Так будет выглядеть аватарка в игре" draggable="false" />
            </div>
            <div class="avatar-editor__sample-meta">
              <p class="eyebrow">В игре</p>
              <p class="avatar-editor__sample-size">Квадрат · 192 × 192</p>
            </div>
          </div>

          <label class="field avatar-editor__zoom">
            <span class="avatar-editor__label-line">
              <span class="field__label">Масштаб</span>
              <output class="avatar-editor__zoom-value" data-role="avatar-zoom-value">${Math.round(ui.avatarCrop.zoom * 100)}%</output>
            </span>
            <input class="range" type="range" min="1" max="3" step="0.05" value="${ui.avatarCrop.zoom}"
                   data-role="avatar-zoom" aria-label="Масштаб изображения" />
          </label>
          <div class="avatar-editor__zoom-actions" aria-label="Управление масштабом">
            <button class="mini-button" type="button" data-action="avatar-zoom-out" aria-label="Уменьшить масштаб">−</button>
            <button class="mini-button" type="button" data-action="avatar-zoom-in" aria-label="Увеличить масштаб">+</button>
            <button class="mini-button" type="button" data-action="avatar-rotate-left" aria-label="Повернуть влево">↶ Поворот</button>
          </div>

          <details class="avatar-editor__details">
            <summary>Точная настройка положения</summary>
            <div class="avatar-editor__fine-controls">
              <label class="field">
                <span class="field__label">По горизонтали</span>
                <input class="range" type="range" min="0" max="100" step="1" value="${ui.avatarCrop.x}"
                       data-role="avatar-x" aria-label="Положение по горизонтали" />
              </label>
              <label class="field">
                <span class="field__label">По вертикали</span>
                <input class="range" type="range" min="0" max="100" step="1" value="${ui.avatarCrop.y}"
                       data-role="avatar-y" aria-label="Положение по вертикали" />
              </label>
            </div>
          </details>

          <button class="mini-button avatar-editor__reset" type="button" data-action="avatar-reset">Сбросить кадр</button>
        </aside>
      </div>

      <div class="avatar-editor__footer">
        <p class="hint">Исходник не меняется. Сохраняется оптимизированная WebP-копия; если браузер старый — PNG.</p>
        <div class="dialog__actions">
          <button class="mini-button" type="button" data-action="pick-avatar">Выбрать другое</button>
          <button class="solid-button" type="button" data-action="save-avatar" data-autofocus><span>Сохранить аватарку</span></button>
        </div>
      </div>
    </div>`,
});

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
  return `<span class="link-state link-state--${view.modifier}" data-role="peer-link-state" data-peer-id="${escapeHtml(peerId)}">
      <span class="dot dot--${view.modifier}" aria-hidden="true"></span>${view.label}${ms}
    </span>`;
};

/* Формат времени создаётся один раз: на длинной переписке сборка
   нового Intl.DateTimeFormat на каждое сообщение заметно тормозила
   открытие окна друга. */
const CLOCK = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

const chatRowHtml = (message) => `
  <div class="chat__row${message.mine ? ' chat__row--mine' : ''}">
    <p class="chat__bubble">${escapeHtml(message.text)}</p>
    <small class="chat__meta">${CLOCK.format(new Date(message.at))}${message.via === 'relay' ? ' · через хаб' : ''}</small>
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
            <p class="eyebrow">Основной канал</p>
            ${linkStateHtml(friendId)}
            <p class="link-box__hint">${escapeHtml(linkHint(friend, link))}</p>
          </div>
          <div class="link-box__actions">
            ${
              link === 'offline'
                ? `<button class="mini-button mini-button--accent" type="button" data-action="p2p-connect" data-id="${friend.id}">${icon('link', 'icon--xs')} Подключить P2P-резерв</button>`
                : `<button class="mini-button" type="button" data-action="p2p-connect" data-id="${friend.id}">${icon('refresh', 'icon--xs')} Перезапустить P2P</button>
                   <button class="mini-button mini-button--danger" type="button" data-action="p2p-disconnect" data-id="${friend.id}">${icon('linkOff', 'icon--xs')} Отключить P2P</button>`
            }
          </div>
        </div>

        ${chatHtml(friend.id, {
          placeholder:
            link === 'offline'
              ? 'Сообщения появятся, когда оба будете в приложении.'
              : 'Основной маршрут — через общий хаб. P2P подключается автоматически как резерв.',
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
  if (!p2p.supported())
    return store.isHub()
      ? 'Сообщения идут через хаб. Этот браузер не поддерживает WebRTC, поэтому P2P-резерв недоступен.'
      : 'Этот браузер не поддерживает WebRTC, а общий хаб не подключён.';
  if (link === 'direct') return 'Данные идут напрямую между устройствами, сервер не участвует.';
  if (link === 'relay') {
    const peer = p2p.status(friend.id);
    if (peer.secondaryDisabled) return 'Основной маршрут через общий хаб работает. Дополнительный P2P-канал отключён вручную.';
    const directReady = peer.directReady;
    return directReady
      ? 'Основной маршрут — общий хаб. Прямой P2P-канал уже готов и останется резервом на случай сбоя хаба.'
      : 'Основной маршрут — общий хаб. P2P подключается в фоне и станет резервом, если хаб временно недоступен.';
  }
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
          Резервный способ без хаба: один создаёт код приглашения, второй вставляет его у себя и отдаёт ответный код. Для обычной игры сначала подключается общий хаб; этот режим нужен, если хаб недоступен.
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

/* --- Служебная панель --- */
/* Аватарка в списках панели — только инициалы: держать в разметке
   сотни data URL незачем, а карточка игрока показывает картинку
   целиком. */
const adminAvatarEl = (user, cls = 'avatar--sm') => {
  const hue = nameHue(user.nameKey ?? user.name);
  return `<span class="avatar ${cls}" style="background:hsl(${hue} 26% 30%);color:hsl(${hue} 45% 87%)" aria-hidden="true">${escapeHtml(
    String(user.name).slice(0, 2).toUpperCase(),
  )}</span>`;
};

const seenText = (ts) => {
  if (!ts) return 'нет отметки';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'только что';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`;
  return formatDate(ts);
};

/* Точное время события: «14:32» для сегодняшних и «дата 14:32» для
   вчерашних — по одному взгляду видно, когда это было. Формат
   собирается один раз: журнал рисует сотню строк подряд. */
const TIME_FORMAT = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const stampText = (ts) => {
  if (!ts) return '';
  const date = new Date(ts);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay ? TIME_FORMAT.format(date) : `${formatDate(ts)} ${TIME_FORMAT.format(date)}`;
};

/* Виды блокировок: срок выбирается в карточке игрока, 0 — навсегда. */
const BAN_HOURS = [
  ['1', 'на час'],
  ['24', 'на сутки'],
  ['168', 'на неделю'],
  ['720', 'на 30 дней'],
  ['0', 'навсегда'],
];

/* Подписи журнала: событие хаба человеческим языком. */
const EVENT_LABELS = {
  register: 'Регистрация',
  login: 'Вход',
  name: 'Ник изменён',
  password: 'Пароль изменён',
  avatar: 'Аватарка обновлена',
  'avatar-clear': 'Аватарка убрана',
  request: 'Заявка в друзья',
  'request-decline': 'Заявка отклонена',
  friend: 'Стали друзьями',
  'friend-remove': 'Дружба разорвана',
  code: 'Новый код-приглашение',
  'admin:rename': 'Панель: переименование',
  'admin:password': 'Панель: сброс пароля',
  'admin:kick': 'Панель: отключение',
  'admin:ban': 'Панель: блокировка',
  'admin:unban': 'Панель: разблокировка',
  'admin:avatar': 'Панель: аватарка',
  'admin:avatar-clear': 'Панель: аватарка убрана',
  'admin:code': 'Панель: новый код',
  'admin:unlink': 'Панель: разрыв дружбы',
  'admin:unlink-all': 'Панель: все дружбы',
  'admin:delete': 'Панель: аккаунт удалён',
  'admin:request-drop': 'Панель: заявка удалена',
  'admin:key': 'Панель: ключ сменён',
  'admin:key-reset': 'Панель: заводской ключ',
  'admin:settings': 'Панель: настройки',
  'admin:events-clear': 'Панель: журнал очищен',
  'admin:wipe': 'Панель: локальные аккаунты очищены',
};

const eventLabel = (kind) => EVENT_LABELS[kind] ?? kind;
const eventIsAdmin = (kind) => String(kind).startsWith('admin:');
const untilText = (ts) => (ts ? `до ${formatDate(ts)} ${TIME_FORMAT.format(new Date(ts))}` : 'навсегда');

const adminTabHtml = (id, label, glyph, count = null) =>
  `<button class="admin-nav__item${ui.admin.tab === id ? ' admin-nav__item--active' : ''}" type="button" role="tab"
           id="admin-tab-${id}" aria-controls="admin-panel" aria-selected="${ui.admin.tab === id}"
           data-action="admin-tab" data-tab="${id}">
     ${icon(glyph, 'admin-nav__icon')}
     <span class="admin-nav__label">${escapeHtml(label)}</span>
     ${count === null ? '' : `<span class="admin-nav__count" translate="no">${escapeHtml(String(count))}</span>`}
   </button>`;

const adminChipHtml = (action, value, label, active) =>
  `<button class="chip${active ? ' chip--active' : ''}" type="button" data-action="${action}"
           data-value="${value}" aria-pressed="${active}">${label}</button>`;

const statRow = (key, value) => `
    <div class="admin-stat">
      <span class="admin-stat__key">${key}</span>
      <span class="admin-stat__value" translate="no">${escapeHtml(value)}</span>
    </div>`;

const adminLoginHtml = () => {
  const hub = store.isHub();
  const node = hub ? `Хаб · ${escapeHtml(store.hubHost())}` : 'Локальное хранилище · это устройство';
  return `
    <div class="dialog__body admin-gate">
      <div class="admin-gate__emblem" aria-hidden="true">
        <span class="admin-gate__ring admin-gate__ring--outer"></span>
        <span class="admin-gate__ring admin-gate__ring--inner"></span>
        <span class="admin-gate__seal">${icon('shield')}${icon('sigil', 'admin-gate__sigil')}</span>
        <span class="admin-gate__serial">MIR · 07</span>
      </div>

      <div class="admin-gate__intro">
        <div class="admin-gate__status">
          <span class="admin-gate__status-label"><i class="dot" aria-hidden="true"></i>ДОСТУП ЗАКРЫТ</span>
          <span class="admin-gate__status-code">OWNER / 07</span>
        </div>
        <p class="eyebrow">СЛУЖЕБНЫЙ УЗЕЛ</p>
        <h3>Панель владельца</h3>
        <p>Управление игроками, журналом событий и состоянием хаба.</p>
      </div>

      <form class="form admin-gate__form" data-form="admin-login" novalidate>
        <label class="field">
          <span class="field__label">Ключ администратора</span>
          <span class="admin-gate__keyline">
            ${icon('key', 'admin-gate__key-icon')}
            <input class="input" name="key" type="password" autocomplete="off" spellcheck="false"
                   placeholder="Введите ключ доступа" value="${escapeHtml(ui.admin.keyDraft)}"
                   data-role="admin-key" data-autofocus required />
          </span>
        </label>
        <p class="form-error" data-role="form-error" hidden></p>
        <button class="solid-button admin-gate__submit" type="submit" data-role="submit">
          ${icon('shield', 'icon--xs')}<span>Открыть панель</span><span class="admin-gate__arrow" aria-hidden="true">↗</span>
        </button>
      </form>

      ${ui.admin.error ? `<p class="form-note form-note--warn">${escapeHtml(ui.admin.error)}</p>` : ''}

      <footer class="admin-gate__footer">
        <div class="admin-gate__node">
          <span class="admin-gate__node-label">ТОЧКА ПОДКЛЮЧЕНИЯ</span>
          <span>${node}</span>
        </div>
        <p class="admin-gate__hint">${
          hub
            ? `Если ключ не меняли, действует заводской <code translate="no">${escapeHtml(store.DEFAULT_ADMIN_KEY)}</code>. Можно задать свой через <strong>MIR_ADMIN_KEY</strong> или сменить ключ после входа — во вкладке «Система».`
            : `Заводской ключ <code translate="no">${escapeHtml(store.DEFAULT_ADMIN_KEY)}</code> подходит только для аккаунтов этого браузера. Для безопасности смените его во вкладке «Система».`
        }</p>
      </footer>
    </div>`;
};

/* Предупреждение о заводском ключе — показывается на «Обзоре», чтобы
   оно попадалось на глаза сразу после входа. */
const adminKeyWarningHtml = () => {
  const isDefault = ui.admin.data?.keyDefault ?? store.adminKeyIsDefault();
  if (!isDefault) return '';
  return `<p class="form-note form-note--warn">Действует заводской ключ <code translate="no">${escapeHtml(
    store.DEFAULT_ADMIN_KEY,
  )}</code> — он в открытом исходнике, поэтому панель открыта каждому, кто читал инструкцию. Смените его во вкладке «Система».</p>`;
};

const adminRowHtml = (user, requestCount = 0) => {
  const me = store.getCurrentUser();
  const offline = user.presence === 'offline';
  const isMe = me?.id === user.id;
  const ban = user.ban;
  return `
    <button class="admin-row${offline ? ' admin-row--off' : ''}${ban ? ' admin-row--banned' : ''}" type="button" data-action="admin-open" data-id="${user.id}">
      ${adminAvatarEl(user)}
      <span class="admin-row__text">
        <strong class="admin-row__name" translate="no">${escapeHtml(user.name)}${isMe ? ' · вы' : ''}</strong>
        <small class="admin-row__meta">${PRESENCE[user.presence]?.label ?? 'Не в сети'} · друзей ${user.friends.length}${
          requestCount ? ` · заявок ${requestCount}` : ''
        } · ${escapeHtml(seenText(user.seenAt))}</small>
      </span>
      ${ban ? `<span class="admin-badge">заблокирован</span>` : ''}
      <code class="admin-id" translate="no">${escapeHtml(user.id)}</code>
      ${icon('chevron', 'icon--xs')}
    </button>`;
};

/* Копирование значения из панели: id, кода-приглашения, адреса. */
const adminCopyHtml = (value, label, title) => `
  <button class="mini-button" type="button" data-action="admin-copy" data-value="${escapeHtml(value)}"
          data-label="${escapeHtml(label)}" title="${escapeHtml(title)}">${icon('copy', 'icon--xs')} ${label}</button>`;

const adminCardHtml = (user) => {
  const data = ui.admin.data;
  const friends = user.friends
    .map((id) => data?.users.find((item) => item.id === id) ?? { id, name: id, nameKey: id })
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const requests = (data?.requests ?? []).filter((r) => r.from === user.id || r.to === user.id);
  const nameOf = (id) => data?.users.find((item) => item.id === id)?.name ?? id;
  const offline = user.presence === 'offline';
  const ban = user.ban;
  return `
    <button class="mini-button" type="button" data-action="admin-back">${icon('chevron', 'icon--xs')} К списку</button>

    <div class="account">
      <div class="account__avatar">${
        user.avatar
          ? `<span class="avatar avatar--img avatar--lg"><img src="${user.avatar}" alt="" /></span>`
          : adminAvatarEl(user, 'avatar--lg')
      }</div>
      <div class="account__main">
        <p class="account__name" translate="no">${escapeHtml(user.name)}</p>
        <p class="account__meta">
          <span class="dot dot--${offline ? 'off' : 'live'}" aria-hidden="true"></span>
          ${PRESENCE[user.presence]?.label ?? 'Не в сети'} · был: ${escapeHtml(seenText(user.seenAt))}
        </p>
        <p class="account__meta">Аккаунт создан ${formatDate(user.createdAt)} · устройств: ${user.devices}</p>
        ${
          ban
            ? `<p class="account__meta account__meta--danger">${icon('shield', 'icon--xs')} Заблокирован ${
                ban.reason ? `— ${escapeHtml(ban.reason)}` : '— без указания причины'
              }, ${escapeHtml(untilText(ban.until))}</p>`
            : ''
        }
        <code class="admin-id" translate="no">${escapeHtml(user.id)}</code>
      </div>
    </div>

    <div class="dialog__actions dialog__actions--spread">
      ${adminCopyHtml(user.id, 'Скопировать id', 'Пригодится, чтобы отличить двух игроков с похожими никами')}
      ${
        user.inviteCode
          ? adminCopyHtml(user.inviteCode, 'Скопировать код', `Код-приглашение: ${user.inviteCode}`)
          : ''
      }
    </div>

    <div class="divider" role="separator"></div>

    ${
      ban
        ? `<div class="admin-ban">
             <p class="eyebrow">Блокировка</p>
             <p class="form-note">Вход закрыт, устройства отключены. Снять блокировку можно в любой момент.</p>
             <button class="mini-button mini-button--accent" type="button" data-action="admin-unban" data-id="${user.id}">
               ${icon('check', 'icon--xs')} Снять блокировку
             </button>
           </div>`
        : `<form class="form" data-form="admin-ban" data-id="${user.id}" novalidate>
             <p class="eyebrow">Заблокировать</p>
             <p class="form-note">Блокировка закрывает вход и отключает устройства игрока. Она видна в списке и снимается одной кнопкой — удалять аккаунт для этого не нужно.</p>
             <div class="admin-ban__row">
               <input class="input" name="reason" type="text" maxlength="140" spellcheck="false"
                      placeholder="Причина (необязательно)" aria-label="Причина блокировки"
                      value="${escapeHtml(ui.admin.banReason)}" data-role="admin-ban-reason" />
               <select class="input input--select" name="hours" aria-label="Срок блокировки"
                       data-role="admin-ban-hours">
                 ${BAN_HOURS.map(
                   ([value, label]) =>
                     `<option value="${value}"${ui.admin.banHours === value ? ' selected' : ''}>${label}</option>`,
                 ).join('')}
               </select>
               <button class="mini-button mini-button--danger" type="submit">Заблокировать</button>
             </div>
             <p class="form-error" data-role="form-error" hidden></p>
           </form>`
    }

    <div class="divider" role="separator"></div>

    <form class="form" data-form="admin-rename" data-id="${user.id}" novalidate>
      <p class="eyebrow">Никнейм</p>
      <div class="code-form__row">
        <input class="input" name="name" type="text" minlength="3" maxlength="16" spellcheck="false"
               value="${escapeHtml(ui.admin.nameDraft || user.name)}" data-role="admin-name" />
        <button class="mini-button mini-button--accent" type="submit">Переименовать</button>
      </div>
      <p class="form-error" data-role="form-error" hidden></p>
    </form>

    <form class="form" data-form="admin-password" data-id="${user.id}" novalidate>
      <p class="eyebrow">Новый пароль</p>
      <div class="code-form__row">
        <input class="input" name="password" type="text" minlength="6" maxlength="72" autocomplete="off"
               spellcheck="false" placeholder="минимум 6 символов"
               value="${escapeHtml(ui.admin.passDraft)}" data-role="admin-pass" />
        <button class="mini-button mini-button--accent" type="submit">Сбросить пароль</button>
      </div>
      <p class="form-error" data-role="form-error" hidden></p>
      <p class="form-note">Отправляется только хеш — сам пароль никуда не уходит. Входы игрока отзываются.</p>
    </form>

    <div class="divider" role="separator"></div>

    <div class="dialog__actions dialog__actions--spread">
      <button class="mini-button" type="button" data-action="admin-regen-code" data-id="${user.id}">
        ${icon('refresh', 'icon--xs')} Новый код
      </button>
      <button class="mini-button" type="button" data-action="admin-avatar-clear" data-id="${user.id}" ${
        user.avatar ? '' : 'disabled'
      }>
        ${icon('camera', 'icon--xs')} Убрать аватарку
      </button>
      <button class="mini-button" type="button" data-action="admin-kick" data-id="${user.id}">
        ${icon('power', 'icon--xs')} Отключить
      </button>
      <button class="mini-button mini-button--danger" type="button" data-action="admin-delete" data-id="${user.id}">
        ${icon('trash', 'icon--xs')} Удалить аккаунт
      </button>
    </div>

    <div class="divider" role="separator"></div>

    <p class="eyebrow">Заявки в друзья · ${requests.length}</p>
    ${
      requests.length
        ? `<div class="admin-list">${requests
            .map(
              (request) => `
        <div class="admin-row admin-row--static">
          <span class="admin-row__text">
            <strong class="admin-row__name" translate="no">${escapeHtml(nameOf(request.from))} → ${escapeHtml(
              nameOf(request.to),
            )}</strong>
            <small class="admin-row__meta">${escapeHtml(seenText(request.at))}</small>
          </span>
          <button class="icon-button icon-button--sm icon-button--danger" type="button"
                  data-action="admin-drop-request" data-id="${request.id}"
                  aria-label="Удалить заявку" title="Удалить заявку">
            ${icon('trash')}
          </button>
        </div>`,
            )
            .join('')}</div>`
        : '<p class="hint">Заявок нет.</p>'
    }

    <div class="divider" role="separator"></div>

    <p class="eyebrow">Друзья · ${friends.length}</p>
    ${
      friends.length
        ? `<div class="admin-list">${friends
            .map(
              (friend) => `
        <div class="admin-row admin-row--static">
          ${adminAvatarEl(friend)}
          <span class="admin-row__text">
            <strong class="admin-row__name" translate="no">${escapeHtml(friend.name)}</strong>
            <small class="admin-row__meta">${
              PRESENCE[friend.presence]?.label ?? 'Не в сети'
            } · был: ${escapeHtml(seenText(friend.seenAt))}</small>
          </span>
          <button class="icon-button icon-button--sm icon-button--danger" type="button"
                  data-action="admin-unlink" data-id="${user.id}" data-friend="${friend.id}"
                  aria-label="Разорвать дружбу с ${escapeHtml(friend.name)}" title="Разорвать дружбу">
            ${icon('linkOff')}
          </button>
        </div>`,
            )
            .join('')}</div>`
        : '<p class="hint">Друзей нет.</p>'
    }
    ${
      friends.length
        ? `<button class="mini-button mini-button--danger" type="button" data-action="admin-unlink-all" data-id="${user.id}">
             Разорвать все дружбы
           </button>`
        : ''
    }`;
};

/* Сколько заявок у каждого игрока — считается один раз на список, а
   не в каждой строке: иначе список из сотни игроков перебирал бы
   заявки сотню раз. */
const requestCounts = (requests) => {
  const map = new Map();
  for (const request of requests) {
    map.set(request.from, (map.get(request.from) ?? 0) + 1);
    map.set(request.to, (map.get(request.to) ?? 0) + 1);
  }
  return map;
};

const ADMIN_FILTERS = [
  ['all', 'Все'],
  ['online', 'В сети'],
  ['active', 'Активны 24ч'],
  ['today', 'Новые 24ч'],
  ['offline', 'Офлайн'],
  ['banned', 'Заблокированы'],
];

const ADMIN_SORTS = [
  ['name', 'По имени'],
  ['seen', 'По визиту'],
  ['created', 'По дате'],
];

const adminMatchFilter = (user, filter) => {
  const day = 24 * 60 * 60 * 1000;
  if (filter === 'online') return user.presence !== 'offline';
  if (filter === 'active') return Date.now() - (user.seenAt ?? 0) < day;
  if (filter === 'today') return Date.now() - (user.createdAt ?? 0) < day;
  if (filter === 'offline') return user.presence === 'offline';
  if (filter === 'banned') return !!user.ban;
  return true;
};

const adminSortUsers = (users, sort) => {
  const list = [...users];
  if (sort === 'seen') return list.sort((a, b) => (b.seenAt ?? 0) - (a.seenAt ?? 0));
  if (sort === 'created') return list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  /* «В сети» — вперёд, дальше по имени: так список читается сверху вниз. */
  return list.sort(
    (a, b) =>
      (a.presence === 'offline' ? 1 : 0) - (b.presence === 'offline' ? 1 : 0) ||
      a.name.localeCompare(b.name, 'ru'),
  );
};

const adminPlayersHtml = () => {
  const data = ui.admin.data;
  const users = data?.users ?? [];
  const query = ui.admin.query.trim().toLowerCase();
  const counts = requestCounts(data?.requests ?? []);
  const found = adminSortUsers(
    users.filter(
      (user) =>
        (!query ||
          user.name.toLowerCase().includes(query) ||
          user.id.toLowerCase().includes(query) ||
          String(user.inviteCode || '').toLowerCase().includes(query)) &&
        adminMatchFilter(user, ui.admin.filter),
    ),
    ui.admin.sort,
  );
  const shown = found.slice(0, ui.admin.limit);
  const rest = found.length - shown.length;
  return `
    <div class="field">
      <span class="field__label">Поиск: имя, id или код-приглашение</span>
      <input class="input" type="search" placeholder="Имя игрока…" autocomplete="off" spellcheck="false"
             value="${escapeHtml(ui.admin.query)}" data-role="admin-search" />
    </div>
    <div class="admin-chips" role="group" aria-label="Фильтр игроков">
      ${ADMIN_FILTERS.map(([value, label]) =>
        adminChipHtml('admin-filter', value, label, ui.admin.filter === value),
      ).join('')}
    </div>
    <div class="admin-chips admin-chips--slim" role="group" aria-label="Порядок игроков">
      <span class="admin-chips__label">Порядок:</span>
      ${ADMIN_SORTS.map(([value, label]) =>
        adminChipHtml('admin-sort', value, label, ui.admin.sort === value),
      ).join('')}
    </div>
    <div class="admin-list">
      ${
        shown.length
          ? shown.map((user) => adminRowHtml(user, counts.get(user.id) ?? 0)).join('')
          : '<p class="hint">Никого не нашлось.</p>'
      }
    </div>
    <p class="hint">Показано ${shown.length} из ${found.length}${
      found.length !== users.length ? ` (всего аккаунтов ${users.length})` : ''
    }.</p>
    ${
      rest > 0
        ? `<button class="mini-button" type="button" data-action="admin-more">Показать ещё ${Math.min(rest, 60)}</button>`
        : ''
    }`;
};

const adminRequestsHtml = () => {
  const data = ui.admin.data;
  const requests = data?.requests ?? [];
  const users = data?.users ?? [];
  const nameOf = (id) => users.find((user) => user.id === id)?.name ?? id;
  const query = ui.admin.requestQuery.trim().toLocaleLowerCase('ru');
  const found = [...requests]
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .filter((request) => {
      if (!query) return true;
      return [nameOf(request.from), nameOf(request.to), request.from, request.to]
        .some((value) => String(value).toLocaleLowerCase('ru').includes(query));
    });
  return `
    <div class="admin-page-intro">
      <p class="hint">Заявки в друзья можно найти по имени или ID и удалить, если они зависли. Нажмите на имя, чтобы открыть аккаунт.</p>
      <span class="admin-result-count">${found.length} из ${requests.length}</span>
    </div>
    <label class="field admin-search-field">
      <span class="field__label">Поиск по участникам заявки</span>
      <input class="input" type="search" placeholder="Имя или ID игрока…" autocomplete="off" spellcheck="false"
             value="${escapeHtml(ui.admin.requestQuery)}" data-role="admin-request-search" />
    </label>
    <div class="admin-list">
      ${
        found.length
          ? found.map((request) => `
        <div class="admin-row admin-row--static">
          <span class="admin-row__text">
            <span class="admin-row__name">
              <button class="admin-link" type="button" data-action="admin-open" data-id="${escapeHtml(request.from)}"
                      translate="no">${escapeHtml(nameOf(request.from))}</button>
              <span class="admin-arrow" aria-hidden="true">→</span>
              <button class="admin-link" type="button" data-action="admin-open" data-id="${escapeHtml(request.to)}"
                      translate="no">${escapeHtml(nameOf(request.to))}</button>
            </span>
            <small class="admin-row__meta">${escapeHtml(seenText(request.at))}</small>
          </span>
          <button class="icon-button icon-button--sm icon-button--danger" type="button"
                  data-action="admin-drop-request" data-id="${escapeHtml(request.id)}"
                  aria-label="Удалить заявку" title="Удалить заявку">
            ${icon('trash')}
          </button>
        </div>`).join('')
          : `<div class="admin-empty"><strong>${requests.length ? 'Ничего не найдено' : 'Заявок пока нет'}</strong><span>${requests.length ? 'Измените поисковый запрос.' : 'Новые запросы появятся здесь автоматически.'}</span></div>`
      }
    </div>`;
};

const adminEventDetail = (event) => {
  const parts = [];
  if (event.name) parts.push(event.name);
  if (event.targetName || event.targetId) parts.push(`→ ${event.targetName || event.targetId}`);
  if (event.text) parts.push(`· ${event.text}`);
  if (event.count) parts.push(`· ${event.count} шт.`);
  if (event.until) parts.push(`· ${untilText(event.until)}`);
  return parts.join(' ') || '—';
};

const adminEventRowHtml = (event) => `
    <div class="admin-row admin-row--static admin-event">
      <span class="admin-event__dot${eventIsAdmin(event.kind) ? ' admin-event__dot--admin' : ''}" aria-hidden="true"></span>
      <span class="admin-row__text">
        <strong class="admin-row__name">${escapeHtml(eventLabel(event.kind))}</strong>
        <small class="admin-row__meta" translate="no">${escapeHtml(adminEventDetail(event))}</small>
      </span>
      <span class="admin-row__meta admin-event__time" translate="no">${escapeHtml(stampText(event.at))}</span>
    </div>`;

const adminEventsHtml = () => {
  const all = ui.admin.data?.events ?? [];
  const filter = ui.admin.eventFilter;
  const query = ui.admin.eventQuery.trim().toLocaleLowerCase('ru');
  const events = all.filter((event) => {
    const kindMatches = filter === 'all' || (filter === 'admin' ? eventIsAdmin(event.kind) : !eventIsAdmin(event.kind));
    const text = `${eventLabel(event.kind)} ${event.kind} ${adminEventDetail(event)}`.toLocaleLowerCase('ru');
    return kindMatches && (!query || text.includes(query));
  });
  return `
    <div class="admin-page-intro">
      <p class="hint">Журнал хранит последние события хаба и панели. В снимке показаны свежие записи сверху.</p>
      <span class="admin-result-count">${events.length} из ${all.length}</span>
    </div>
    <div class="admin-chips" role="group" aria-label="Фильтр журнала">
      ${adminChipHtml('admin-event-filter', 'all', 'Всё', filter === 'all')}
      ${adminChipHtml('admin-event-filter', 'players', 'Игроки', filter === 'players')}
      ${adminChipHtml('admin-event-filter', 'admin', 'Панель', filter === 'admin')}
    </div>
    <label class="field admin-search-field">
      <span class="field__label">Поиск по событию, имени или тексту</span>
      <input class="input" type="search" placeholder="Например, регистрация или ник игрока…" autocomplete="off" spellcheck="false"
             value="${escapeHtml(ui.admin.eventQuery)}" data-role="admin-event-search" />
    </label>
    <div class="admin-list">
      ${events.length ? events.map(adminEventRowHtml).join('') : `<div class="admin-empty"><strong>${all.length ? 'События не найдены' : 'Журнал пуст'}</strong><span>${all.length ? 'Измените фильтр или поисковый запрос.' : 'События появятся здесь после первых действий.'}</span></div>`}
    </div>
    ${
      all.length
        ? `<button class="mini-button mini-button--danger" type="button" data-action="admin-events-clear">
             ${icon('trash', 'icon--xs')} Очистить журнал
           </button>`
        : ''
    }`;
};

const ADMIN_RANGES = [
  ['7', '7 дней'],
  ['14', '14 дней'],
  ['30', '30 дней'],
];

const adminDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const adminTimeline = (records, range, mode = 'users') => {
  const count = Number(range) || 14;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
  const fullLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
  const days = Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (count - index - 1));
    return {
      date,
      key: adminDateKey(date),
      label: dayLabel.format(date),
      fullLabel: fullLabel.format(date),
      registrations: 0,
      logins: 0,
      other: 0,
      total: 0,
    };
  });
  const byDate = new Map(days.map((day) => [day.key, day]));
  for (const record of records ?? []) {
    const timestamp = Number(mode === 'users' ? record.createdAt : record.at);
    if (!Number.isFinite(timestamp) || timestamp <= 0) continue;
    const date = new Date(timestamp);
    const bucket = byDate.get(adminDateKey(date));
    if (!bucket) continue;
    if (mode === 'users') {
      bucket.total += 1;
      continue;
    }
    if (record.kind === 'register') bucket.registrations += 1;
    else if (record.kind === 'login') bucket.logins += 1;
    else bucket.other += 1;
    bucket.total += 1;
  }
  return days;
};

const adminLineChartHtml = (series) => {
  const width = 720;
  const height = 232;
  const left = 42;
  const right = 12;
  const top = 16;
  const bottom = 36;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(0, ...series.map((point) => point.total));
  const scaleMax = Math.max(1, maxValue);
  const x = (index) => left + (series.length <= 1 ? plotWidth / 2 : (index / (series.length - 1)) * plotWidth);
  const y = (value) => top + plotHeight - (value / scaleMax) * plotHeight;
  const points = series.map((point, index) => ({ ...point, x: x(index), y: y(point.total) }));
  const linePath = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const areaPath = points.length
    ? `${linePath} L ${points.at(-1).x.toFixed(1)} ${(top + plotHeight).toFixed(1)} L ${points[0].x.toFixed(1)} ${(top + plotHeight).toFixed(1)} Z`
    : '';
  const ticks = [...new Set([scaleMax, Math.ceil(scaleMax / 2), 0])];
  const guides = ticks.map((tick) => `
    <g class="admin-chart__axis">
      <line x1="${left}" x2="${width - right}" y1="${y(tick).toFixed(1)}" y2="${y(tick).toFixed(1)}" />
      <text x="${left - 10}" y="${(y(tick) + 3).toFixed(1)}" text-anchor="end">${tick}</text>
    </g>`).join('');
  const labelIndices = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];
  const dateLabels = labelIndices.map((index) => {
    const point = points[index];
    return `<text class="admin-chart__date" x="${point.x.toFixed(1)}" y="${height - 8}" text-anchor="${index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle'}">${escapeHtml(point.label)}</text>`;
  }).join('');
  const markers = points.map((point) => `
    <circle class="admin-chart__marker" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.5">
      <title>${escapeHtml(point.fullLabel)}: ${point.total} новых аккаунтов</title>
    </circle>`).join('');
  const total = series.reduce((sum, point) => sum + point.total, 0);
  return `
    <svg class="admin-chart__svg" viewBox="0 0 ${width} ${height}" role="img"
         aria-labelledby="admin-growth-title admin-growth-desc" focusable="false">
      <title id="admin-growth-title">Новые аккаунты по дням — ${total} за выбранный период</title>
      <desc id="admin-growth-desc">Линейный график ежедневных регистраций за последние ${series.length} календарных дней.</desc>
      <defs>
        <linearGradient id="admin-growth-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity=".25" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${guides}
      <path class="admin-chart__area" d="${areaPath}" fill="url(#admin-growth-fill)" />
      <path class="admin-chart__line" d="${linePath}" />
      ${markers}
      ${dateLabels}
    </svg>`;
};

const adminEventsChartHtml = (series) => {
  const width = 720;
  const height = 232;
  const left = 42;
  const right = 12;
  const top = 16;
  const bottom = 36;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(0, ...series.map((point) => point.total));
  const scaleMax = Math.max(1, maxValue);
  const y = (value) => top + plotHeight - (value / scaleMax) * plotHeight;
  const step = plotWidth / Math.max(series.length, 1);
  const barWidth = Math.max(4, Math.min(15, step * 0.54));
  const ticks = [...new Set([scaleMax, Math.ceil(scaleMax / 2), 0])];
  const guides = ticks.map((tick) => `
    <g class="admin-chart__axis">
      <line x1="${left}" x2="${width - right}" y1="${y(tick).toFixed(1)}" y2="${y(tick).toFixed(1)}" />
      <text x="${left - 10}" y="${(y(tick) + 3).toFixed(1)}" text-anchor="end">${tick}</text>
    </g>`).join('');
  const bars = series.map((point, index) => {
    const barX = left + step * index + (step - barWidth) / 2;
    let cursor = top + plotHeight;
    const segments = [
      { value: point.other, className: 'admin-chart__bar--other' },
      { value: point.logins, className: 'admin-chart__bar--login' },
      { value: point.registrations, className: 'admin-chart__bar--register' },
    ].map((segment) => {
      if (!segment.value) return '';
      const barHeight = Math.max(1, (segment.value / scaleMax) * plotHeight);
      cursor -= barHeight;
      return `<rect class="admin-chart__bar ${segment.className}" x="${barX.toFixed(1)}" y="${cursor.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" />`;
    }).join('');
    return `<g><title>${escapeHtml(point.fullLabel)}: ${point.registrations} регистраций, ${point.logins} входов, ${point.other} прочих событий</title>${segments}</g>`;
  }).join('');
  const labelIndices = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];
  const dateLabels = labelIndices.map((index) => {
    const point = series[index];
    const labelX = left + step * index + step / 2;
    return `<text class="admin-chart__date" x="${labelX.toFixed(1)}" y="${height - 8}" text-anchor="${index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle'}">${escapeHtml(point.label)}</text>`;
  }).join('');
  const total = series.reduce((sum, point) => sum + point.total, 0);
  return `
    <svg class="admin-chart__svg" viewBox="0 0 ${width} ${height}" role="img"
         aria-labelledby="admin-events-title admin-events-desc" focusable="false">
      <title id="admin-events-title">События журнала — ${total} за выбранный период</title>
      <desc id="admin-events-desc">Столбцы разделены на регистрации, входы и прочие события за последние ${series.length} календарных дней.</desc>
      ${guides}
      ${bars}
      ${dateLabels}
    </svg>`;
};

const adminStatusMixHtml = (users) => {
  const banned = users.filter((user) => !!user.ban).length;
  const online = users.filter((user) => !user.ban && user.presence !== 'offline').length;
  const offline = Math.max(0, users.length - banned - online);
  const total = users.length;
  const percent = (value) => total ? (value / total) * 100 : 0;
  return `
    <div class="admin-mixbar" role="img" aria-label="Состояние аккаунтов: ${online} в сети, ${offline} офлайн, ${banned} заблокировано">
      <span class="admin-mixbar__online" style="width:${percent(online).toFixed(2)}%"></span>
      <span class="admin-mixbar__offline" style="width:${percent(offline).toFixed(2)}%"></span>
      <span class="admin-mixbar__banned" style="width:${percent(banned).toFixed(2)}%"></span>
    </div>
    <div class="admin-mixlegend">
      <span><i class="admin-mixlegend__dot admin-mixlegend__dot--online"></i>В сети <strong>${online}</strong></span>
      <span><i class="admin-mixlegend__dot admin-mixlegend__dot--offline"></i>Офлайн <strong>${offline}</strong></span>
      <span><i class="admin-mixlegend__dot admin-mixlegend__dot--banned"></i>Блокировки <strong>${banned}</strong></span>
    </div>`;
};

const adminOverviewHtml = () => {
  const data = ui.admin.data;
  const stats = data?.stats ?? {};
  const users = data?.users ?? [];
  const events = data?.events ?? [];
  const range = ADMIN_RANGES.some(([value]) => value === ui.admin.range) ? ui.admin.range : '14';
  const registrations = adminTimeline(users, range, 'users');
  const eventTimeline = adminTimeline(events, range, 'events');
  const registrationTotal = registrations.reduce((sum, day) => sum + day.total, 0);
  const loggedEvents = eventTimeline.reduce((sum, day) => sum + day.total, 0);
  const banned = stats.banned ?? 0;
  const registrationOpen = data?.settings?.registrationOpen !== false;
  const tile = (key, value, note, tab, filter = 'all', sort = 'name', tone = '') => `
    <button class="admin-tile${tone ? ` admin-tile--${tone}` : ''}" type="button"
            data-action="admin-go" data-tab="${tab}" data-filter="${filter}" data-sort="${sort}"
            aria-label="${escapeHtml(`${key}: ${value}. Перейти в раздел ${tab === 'requests' ? 'заявок' : 'игроков'}`)}">
      <span class="admin-tile__value" translate="no">${escapeHtml(String(value))}</span>
      <span class="admin-tile__key">${escapeHtml(key)}</span>
      <span class="admin-tile__note">${escapeHtml(note)}</span>
      <span class="admin-tile__arrow" aria-hidden="true">↗</span>
    </button>`;
  const recent = events.slice(0, 5);
  return `
    ${adminKeyWarningHtml()}
    <section class="admin-metrics" aria-label="Ключевые показатели">
      <div class="admin-section-heading">
        <div><p class="eyebrow">Сводка</p><h4>Состояние сообщества</h4></div>
        <span class="admin-section-heading__caption">Нажмите на карточку, чтобы открыть список</span>
      </div>
      <div class="admin-tiles">
        ${tile('Аккаунты', stats.users ?? 0, 'всего в базе', 'players')}
        ${tile('В сети', stats.online ?? 0, 'активны прямо сейчас', 'players', 'online', 'seen')}
        ${tile('Новые за 24 часа', stats.today ?? 0, 'регистрации', 'players', 'today', 'created')}
        ${tile('Активны за 24 часа', stats.activeDay ?? 0, 'заходили на платформу', 'players', 'active', 'seen')}
        ${tile('Заявки', stats.requests ?? 0, 'ожидают внимания', 'requests')}
        ${tile('Заблокировано', banned, 'аккаунтов', 'players', 'banned', 'name', banned ? 'danger' : '')}
      </div>
    </section>

    <section class="admin-analytics" aria-label="Аналитика">
      <div class="admin-section-heading admin-section-heading--wrap">
        <div><p class="eyebrow">Аналитика</p><h4>Динамика и активность</h4></div>
        <div class="admin-chips admin-range" role="group" aria-label="Период графиков">
          ${ADMIN_RANGES.map(([value, label]) => adminChipHtml('admin-range', value, label, range === value)).join('')}
        </div>
      </div>
      <div class="admin-chart-grid">
        <article class="admin-card admin-chart">
          <div class="admin-chart__heading">
            <div><h5>Регистрации</h5><p>Новые аккаунты по дням</p></div>
            <strong class="admin-chart__total" translate="no">${registrationTotal}</strong>
          </div>
          ${adminLineChartHtml(registrations)}
          <p class="admin-chart__foot">За ${range} календарных дней · данные рассчитаны по времени создания аккаунтов</p>
        </article>
        <article class="admin-card admin-chart">
          <div class="admin-chart__heading">
            <div><h5>Активность</h5><p>События из сохранённого журнала</p></div>
            <strong class="admin-chart__total" translate="no">${loggedEvents}</strong>
          </div>
          ${adminEventsChartHtml(eventTimeline)}
          <div class="admin-chart__legend" role="group" aria-label="Обозначения графика">
            <span><i class="admin-chart__legend-dot admin-chart__legend-dot--register"></i>Регистрации</span>
            <span><i class="admin-chart__legend-dot admin-chart__legend-dot--login"></i>Входы</span>
            <span><i class="admin-chart__legend-dot admin-chart__legend-dot--other"></i>Другие</span>
          </div>
          <p class="admin-chart__foot">Журнал хранит до 300 событий; на графике — доступные записи снимка.</p>
        </article>
      </div>
    </section>

    <div class="admin-overview-grid">
      <section class="admin-card admin-operations">
        <div class="admin-card__heading"><div><p class="eyebrow">Управление</p><h4>Регистрация</h4></div>${icon('settings', 'admin-card__icon')}</div>
        <div class="admin-status-line">
          <span class="dot ${registrationOpen ? '' : 'dot--warn'}" aria-hidden="true"></span>
          <span>Новые аккаунты</span>
          <strong class="${registrationOpen ? 'admin-status-open' : 'admin-status-closed'}">${registrationOpen ? 'Открыты' : 'Закрыты'}</strong>
        </div>
        <p class="hint">${registrationOpen ? 'Игроки могут создавать аккаунты.' : 'Новые игроки не смогут зарегистрироваться, пока доступ закрыт.'}</p>
        <div class="admin-card__actions">
          <button class="mini-button ${registrationOpen ? 'mini-button--danger' : 'mini-button--accent'}" type="button" data-action="admin-registration" data-open="${registrationOpen ? '0' : '1'}">
            ${registrationOpen ? 'Закрыть регистрацию' : 'Открыть регистрацию'}
          </button>
          <button class="mini-button" type="button" data-action="admin-tab" data-tab="system">Ключ и диагностика</button>
        </div>
      </section>

      <section class="admin-card admin-account-mix">
        <div class="admin-card__heading"><div><p class="eyebrow">Присутствие</p><h4>Статус аккаунтов</h4></div>${icon('users', 'admin-card__icon')}</div>
        ${adminStatusMixHtml(users)}
        <button class="admin-link admin-card__link" type="button" data-action="admin-tab" data-tab="players">Открыть список игроков ${icon('chevron', 'icon--xs')}</button>
      </section>

      <section class="admin-card admin-recent">
        <div class="admin-card__heading"><div><p class="eyebrow">Лента событий</p><h4>Последние действия</h4></div><span class="admin-result-count">${events.length}</span></div>
        ${recent.length
          ? `<div class="admin-list admin-list--flat">${recent.map(adminEventRowHtml).join('')}</div>`
          : '<div class="admin-empty"><strong>Пока тихо</strong><span>Новые регистрации и действия появятся здесь.</span></div>'}
        <button class="admin-link admin-card__link" type="button" data-action="admin-tab" data-tab="events">Открыть журнал ${icon('chevron', 'icon--xs')}</button>
      </section>
    </div>`;
};

const adminSystemHtml = () => {
  const data = ui.admin.data;
  const local = store.localDataInfo();
  const address = typeof location !== 'undefined' ? location.origin : '';
  return `
    <div class="admin-stats">
      ${statRow('Режим данных', data?.mode === 'hub' ? 'общий хаб' : 'только этот браузер')}
      ${statRow('Адрес хаба', data?.mode === 'hub' ? data.host || address : 'не подключён')}
      ${statRow('Аккаунтов на хабе', String(data?.stats?.users ?? 0))}
      ${statRow('Из них в сети', String(data?.stats?.online ?? 0))}
      ${statRow('Новых за сутки', String(data?.stats?.today ?? 0))}
      ${statRow('Новых за неделю', String(data?.stats?.week ?? 0))}
      ${statRow('Заходили за сутки', String(data?.stats?.activeDay ?? 0))}
      ${statRow('Заблокировано', String(data?.stats?.banned ?? 0))}
      ${statRow('Заявок', String(data?.stats?.requests ?? 0))}
      ${statRow('Дружб', String(data?.stats?.links ?? 0))}
      ${statRow('Аватарок', String(data?.stats?.avatars ?? 0))}
      ${statRow('Записей в журнале', String(data?.stats?.events ?? data?.events?.length ?? 0))}
      ${statRow('Объём данных', `${Math.round((data?.stats?.bytes ?? 0) / 1024)} КБ`)}
      ${statRow('Аккаунтов в браузере', String(local.accounts))}
      ${statRow(
        'Данные браузера',
        `${Math.round(local.bytes / 1024)} КБ · ${local.persists ? 'сохраняются' : 'только до перезагрузки'}`,
      )}
      ${statRow('Обновление', updateDiagnostics())}
      ${statRow('Прямая связь', p2p.supported() ? 'WebRTC доступен' : 'WebRTC недоступен')}
      ${statRow('Версия', VERSION)}
    </div>

    <div class="divider" role="separator"></div>

    ${
      data?.keyDefault
        ? `<p class="form-note form-note--warn">Сейчас действует заводской ключ <code translate="no">${escapeHtml(store.DEFAULT_ADMIN_KEY)}</code> — он в открытом исходнике. Смените его ниже: новый ключ запишется в данные хаба и переживёт перезапуск.</p>`
        : ''
    }
    <form class="form" data-form="admin-new-key" novalidate>
      <p class="eyebrow">Ключ администратора</p>
      <p class="form-note">${
        (data?.keyDefault ?? store.adminKeyIsDefault())
          ? 'Сейчас действует заводской ключ. Придумайте свой — иначе панель открыта каждому, кто читал инструкцию.'
          : 'Свой ключ установлен. Забыли его — кнопка ниже вернёт заводской.'
      }</p>
      <div class="form__grid">
        <label class="field">
          <span class="field__label">Новый ключ</span>
          <input class="input" name="next" type="password" autocomplete="new-password" spellcheck="false"
                 minlength="6" value="${escapeHtml(ui.admin.newKeyDraft)}" data-role="admin-new-key" />
        </label>
        <label class="field">
          <span class="field__label">Повторите</span>
          <input class="input" name="repeat" type="password" autocomplete="new-password" spellcheck="false"
                 minlength="6" value="${escapeHtml(ui.admin.repeatKeyDraft)}" data-role="admin-repeat-key" />
        </label>
      </div>
      <p class="form-error" data-role="form-error" hidden></p>
      <div class="dialog__actions">
        <button class="mini-button mini-button--accent" type="submit">Сменить ключ</button>
        <button class="mini-button" type="button" data-action="admin-forget-key">Вернуть заводской</button>
      </div>
    </form>

    <div class="divider" role="separator"></div>

    <div class="danger-zone">
      <p class="eyebrow">Аккаунты этого браузера</p>
      <p class="form-note">Локальные аккаунты (${local.accounts}) не связаны с хабом. Очистка убирает их со всеми заявками и дружбой — на хабе ничего не меняется.</p>
      <button class="mini-button mini-button--danger" type="button" data-action="admin-wipe">
        ${icon('trash', 'icon--xs')} Очистить локальные аккаунты
      </button>
    </div>`;
};

const adminUpdatedText = () => {
  if (!ui.admin.lastUpdatedAt) return 'Данные ещё не обновлялись';
  const date = new Date(ui.admin.lastUpdatedAt);
  const time = TIME_FORMAT.format(date);
  return date.toDateString() === new Date().toDateString()
    ? `Обновлено в ${time}`
    : `Обновлено ${formatDate(ui.admin.lastUpdatedAt)} · ${time}`;
};

const adminModalHtml = () => {
  const data = ui.admin.data;
  if (!data) return dialogShell({ label: 'Служебный доступ к панели администратора', title: 'Доступ ограничен', size: 'admin-gate', body: adminLoginHtml() });
  const user = ui.admin.openId ? data.users.find((item) => item.id === ui.admin.openId) : null;
  const section = user
    ? adminCardHtml(user)
    : ui.admin.tab === 'players'
      ? adminPlayersHtml()
      : ui.admin.tab === 'requests'
        ? adminRequestsHtml()
        : ui.admin.tab === 'events'
          ? adminEventsHtml()
          : ui.admin.tab === 'system'
            ? adminSystemHtml()
            : adminOverviewHtml();
  const host = data.mode === 'hub'
    ? data.host || (typeof location !== 'undefined' ? location.origin : 'Общий хаб')
    : 'Данные только этого браузера';
  const sectionTitle = user
    ? user.name
    : ({ overview: 'Обзор', players: 'Игроки', requests: 'Заявки', events: 'Журнал событий', system: 'Система' }[ui.admin.tab] ?? 'Обзор');
  const sectionDescription = user
    ? 'Аккаунт игрока · действия администратора'
    : ui.admin.tab === 'overview'
      ? 'Общая картина, аналитика и быстрые действия'
      : ui.admin.tab === 'players'
        ? 'Поиск и управление аккаунтами'
        : ui.admin.tab === 'requests'
          ? 'Очередь заявок в друзья'
          : ui.admin.tab === 'events'
            ? 'История активности и действий панели'
            : 'Безопасность, настройки и диагностика';
  const modeLabel = data.mode === 'hub' ? 'ОБЩИЙ ХАБ' : 'ЛОКАЛЬНЫЙ РЕЖИМ';
  return dialogShell({
    label: 'Панель админа',
    title: user ? 'Карточка игрока' : 'Панель админа',
    size: 'admin',
    body: `
      <div class="dialog__body admin-layout">
        <aside class="admin-rail" aria-label="Навигация администратора">
          <div class="admin-rail__brand">
            <span class="admin-rail__symbol">${icon('shield')}</span>
            <span><strong>MIR CONTROL</strong><small>ПАНЕЛЬ УПРАВЛЕНИЯ</small></span>
          </div>
          <div class="admin-rail__mode"><span class="dot" aria-hidden="true"></span><span>${modeLabel}</span></div>
          <p class="eyebrow">РАБОЧАЯ ОБЛАСТЬ</p>
          <nav class="admin-nav" role="tablist" aria-orientation="vertical" aria-label="Разделы панели">
            ${adminTabHtml('overview', 'Обзор', 'sigil')}
            ${adminTabHtml('players', 'Игроки', 'users', data.users.length)}
            ${adminTabHtml('requests', 'Заявки', 'userPlus', data.requests.length)}
            ${adminTabHtml('events', 'Журнал', 'message', data.events?.length ?? 0)}
            ${adminTabHtml('system', 'Система', 'settings')}
          </nav>
          <div class="admin-rail__footer">
            <span class="admin-rail__version">MIR · v${escapeHtml(VERSION)}</span>
            <span class="admin-rail__host" title="${escapeHtml(host)}">${escapeHtml(host)}</span>
          </div>
        </aside>

        <main class="admin-content" id="admin-panel" role="tabpanel" aria-labelledby="admin-tab-${ui.admin.tab}" tabindex="0">
          <header class="admin-toolbar">
            <div class="admin-toolbar__heading">
              <div class="admin-toolbar__context">
                <span class="admin-mode"><i class="dot" aria-hidden="true"></i>${modeLabel}</span>
                <span class="admin-refresh-state" aria-live="polite" aria-atomic="true">${ui.admin.busy ? 'Синхронизация…' : escapeHtml(adminUpdatedText())}</span>
              </div>
              <h3>${escapeHtml(sectionTitle)}</h3>
              <p>${escapeHtml(sectionDescription)}</p>
            </div>
            <div class="admin-toolbar__actions" role="group" aria-label="Действия панели">
              <button class="mini-button" type="button" data-action="admin-refresh" ${ui.admin.busy ? 'disabled' : ''}>
                ${icon('refresh', 'icon--xs')}<span>Обновить</span>
              </button>
              <button class="mini-button" type="button" data-action="admin-export">
                ${icon('download', 'icon--xs')}<span>Экспорт JSON</span>
              </button>
              <button class="mini-button mini-button--danger" type="button" data-action="admin-lock">
                ${icon('logOut', 'icon--xs')}<span>Заблокировать</span>
              </button>
            </div>
          </header>
          ${ui.admin.error ? `<p class="admin-alert" role="alert">${icon('shield', 'icon--xs')}${escapeHtml(ui.admin.error)}${data ? ' · показан последний успешный снимок.' : ''}</p>` : ''}
          ${ui.admin.busy && data ? '<p class="admin-progress" role="status">Получаем актуальный снимок данных…</p>' : ''}
          <div class="admin-content__body">${section}</div>
        </main>
      </div>`,
  });
};

const worldInteger = (value) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
const worldSuperscript = (value) => String(value).replace(/[0-9-]/g, (digit) => ({
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
}[digit]));
const worldScientific = (value) => {
  const [mantissa, exponent] = Number(value).toExponential(1).split('e');
  return `${mantissa.replace('.', ',')} × 10${worldSuperscript(Number(exponent))}`;
};
const russianCountWord = (count, one, few, many) => {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = count % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};
const worldContinentWord = (count) => russianCountWord(count, 'континент', 'континента', 'континентов');
const worldContinentLabel = (count) => `${count} ${worldContinentWord(count)}`;
const worldRiverWord = (count) => {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'рек';
  const mod10 = count % 10;
  if (mod10 === 1) return 'река';
  if (mod10 >= 2 && mod10 <= 4) return 'реки';
  return 'рек';
};
const WORLD_MAP_LAYERS = [
  ['biomes', 'Биомы', 'leaf'],
  ['relief', 'Рельеф', 'mountain'],
  ['height', 'Высоты', 'mountainSnow'],
  ['politics', 'Государства', 'flag'],
  ['cultures', 'Культуры', 'users'],
  ['tectonics', 'Тектоника', 'layers'],
];
const WORLD_MAP_LEGENDS = {
  biomes: [['ocean', 'океан'], ['forest', 'леса'], ['land', 'равнины'], ['sand', 'сухие земли'], ['snow', 'горы'], ['river', 'реки']],
  relief: [['ocean', 'океан'], ['land', 'суша'], ['sand', 'низины'], ['snow', 'высоты'], ['river', 'реки']],
  height: [['ocean', 'низины'], ['land', 'равнины'], ['sand', 'возвышенности'], ['snow', 'вершины'], ['river', 'реки']],
  politics: [['land', 'государства'], ['snow', 'столицы'], ['river', 'границы и реки']],
  cultures: [['forest', 'культурные ареалы'], ['river', 'границы культур']],
  tectonics: [['ocean', 'океаническая кора'], ['land', 'устойчивые плиты'], ['sand', 'активные границы']],
};
const worldLayerControlsHtml = (active) => `
  <div class="world-layer-switch" role="group" aria-label="Слой карты">
    ${WORLD_MAP_LAYERS.map(([value, label, glyph]) => `<button class="world-layer-button${value === active ? ' is-active' : ''}" type="button" data-action="world-layer" data-layer="${value}" aria-pressed="${value === active}">${icon(glyph, 'icon--xs')}<span>${label}</span></button>`).join('')}
  </div>`;
const worldMapLegendHtml = (layer) => `
  <div class="world-legend" data-role="world-legend" aria-hidden="true">
    ${(WORLD_MAP_LEGENDS[layer] ?? WORLD_MAP_LEGENDS.biomes).map(([color, label]) => `<span><i class="world-legend__swatch world-legend__swatch--${color}"></i>${label}</span>`).join('')}
  </div>`;
const worldMapFactsHtml = (world) => `
  <span class="world-map-fact">${world.continentCenters.length} ${worldContinentWord(world.continentCenters.length)}</span>
  <span class="world-map-fact">${world.states.length} ${russianCountWord(world.states.length, 'государство', 'государства', 'государств')}</span>
  <span class="world-map-fact">${world.rivers.length} ${worldRiverWord(world.rivers.length)}</span>
  <span class="world-map-fact">${world.settlements.length} ${russianCountWord(world.settlements.length, 'поселение', 'поселения', 'поселений')}</span>`;
const worldSeed = () => {
  const value = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(value);
  else value[0] = (Date.now() ^ Math.floor(Math.random() * 0xffff_ffff)) >>> 0;
  return `MIR-${value[0].toString(16).toUpperCase().padStart(8, '0')}`;
};

const worldStateDetailsHtml = (world, selectedStateId) => {
  const state = world?.states?.find((item) => item.id === selectedStateId) ?? null;
  if (!state) {
    return `
      <div class="world-state-empty">
        <span class="world-state-empty__mark" aria-hidden="true">${icon('crosshair', 'icon--lg')}</span>
        <strong>Территория не выбрана</strong>
        <span>Щёлкните по карте, чтобы получить разведданные по государству.</span>
      </div>`;
  }
  const settlements = (world.settlements ?? []).filter((item) => item.stateId === state.id);
  return `
    <div class="world-state-head">
      <i class="world-state-color" style="--state-color:${escapeHtml(state.color)}" aria-hidden="true"></i>
      <div><h4 translate="no">${escapeHtml(state.name)}</h4></div>
      <span class="world-state-order">№ ${state.id}</span>
    </div>
    <div class="world-state-metrics">
      <div><span>Население</span><strong>${worldInteger(state.population)}</strong></div>
      <div><span>Культура</span><strong>${escapeHtml(state.culture)}</strong></div>
      <div><span>Континент</span><strong>№ ${state.continentId}</strong></div>
    </div>
    <div class="world-state-resource-block">
      <p class="world-card__eyebrow">Ресурсы</p>
      <div class="world-resource-list">${state.resources.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>
    </div>
    <div class="world-state-settlements">
      <p class="world-card__eyebrow">Поселения</p>
      ${
        settlements.length
          ? settlements
              .map(
                (item) =>
                  `<div class="world-settlement-row"><i class="${item.kind === 'столица' ? 'is-capital' : ''}" aria-hidden="true"></i><span translate="no">${escapeHtml(item.name)}</span><small>${escapeHtml(item.kind)} · ${worldInteger(item.population)}</small></div>`,
              )
              .join('')
          : '<div class="world-settlement-row"><i aria-hidden="true"></i><span>Поселений не обнаружено</span><small>—</small></div>'
      }
    </div>`;
};

/* ---------- слоты карт ---------------------------------------
   Кнопка «Играть» открывает экран из шести слотов и двух вкладок:
   «Мастер» и «Игрок». Каждая вкладка хранит свои шесть карт —
   так в одной коллекции живут миры, которые ведут, и миры, в
   которые играют. Слоты лежат в localStorage: они локальные,
   как и прежнее «сохранение мира на этом устройстве». */

const WORLD_SLOTS_KEY = 'mir-world-slots';
const WORLD_SLOT_COUNT = 6;
const WORLD_SLOT_ROLES = ['master', 'player'];
const WORLD_ROLE_LABELS = { master: 'Мастер', player: 'Игрок' };

const emptyWorldSlotList = () => Array.from({ length: WORLD_SLOT_COUNT }, () => null);

const normalizeWorldSlotEntry = (entry) => {
  if (!entry || typeof entry !== 'object' || !entry.config || typeof entry.config !== 'object') return null;
  const seed = String(entry.config.seed ?? '').trim();
  if (!seed) return null;
  return {
    title: String(entry.title ?? '').slice(0, 64),
    config: { ...entry.config, seed },
    savedAt: Number(entry.savedAt) || 0,
  };
};

const loadWorldSlots = () => {
  const slots = { master: emptyWorldSlotList(), player: emptyWorldSlotList() };
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(WORLD_SLOTS_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return slots;
    for (const role of WORLD_SLOT_ROLES) {
      const list = Array.isArray(raw[role]) ? raw[role] : [];
      slots[role] = emptyWorldSlotList().map((_, index) => normalizeWorldSlotEntry(list[index]));
    }
  } catch { /* повреждённое хранилище слотов не должно ломать вход в игру */ }
  return slots;
};

const saveWorldSlots = (slots) => {
  try {
    globalThis.localStorage?.setItem(WORLD_SLOTS_KEY, JSON.stringify({ version: 1, ...slots }));
    return true;
  } catch {
    return false;
  }
};

const worldSlotEntryTitle = (config) => `Мир ${config.seed}`;

const writeWorldSlot = (role, index, config) => {
  if (!WORLD_SLOT_ROLES.includes(role) || !Number.isInteger(index) || index < 0 || index >= WORLD_SLOT_COUNT) return false;
  const slots = loadWorldSlots();
  slots[role][index] = {
    title: worldSlotEntryTitle(config),
    config: { ...config },
    savedAt: Date.now(),
  };
  return saveWorldSlots(slots);
};

const removeWorldSlot = (role, index) => {
  if (!WORLD_SLOT_ROLES.includes(role) || !Number.isInteger(index) || index < 0 || index >= WORLD_SLOT_COUNT) return false;
  const slots = loadWorldSlots();
  slots[role][index] = null;
  return saveWorldSlots(slots);
};

const normalizeWorldConfig = (settings = {}) => ({
  seed: String(settings.seed ?? '').trim() || worldSeed(),
  continents: settings.continents ?? 4,
  landscape: settings.landscape ?? 'mainland',
  climate: settings.climate ?? 'temperate',
  voxelSize: settings.voxelSize ?? 1.25,
  earthMultiples: settings.earthMultiples ?? 2,
});

const createWorldSession = (config = null) => {
  const settings = config ?? {
    seed: worldSeed(),
    continents: 4,
    landscape: 'mainland',
    climate: 'temperate',
    voxelSize: 1.25,
    earthMultiples: 2,
  };
  return {
    open: false,
    screen: 'slots', // slots — выбор слота, setup — создание/вход, explore — карта
    tab: 'master', // активная вкладка экрана слотов: master | player
    slot: null, // { role, index } — слот, который заполняем или уже открыли
    mode: 'master', // роль открытой карты: master (полные функции) | player (урезанные)
    importToSlot: null, // { role, index } — слот под импорт файла карты
    config: normalizeWorldConfig(settings),
    preview: null,
    model: null,
    spawn: null,
    camera: null,
    layer: 'biomes',
    selectedStateId: null,
  };
};

/* Мир строится из конфига слота: та же карта открывается и у мастера,
   и у игрока — различаются только доступные инструменты. */
const buildWorldModel = () => {
  const session = ui.world;
  if (!session) return;
  session.model = createWorld({ ...session.config });
  session.spawn = session.model.findSpawn();
  session.camera = { x: session.spawn.x, z: session.spawn.z, zoom: 1, mapZoom: 2.1 };
  session.selectedStateId = null;
  session.screen = 'explore';
};

const worldSlotDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const worldSlotDateHtml = (savedAt) => {
  if (!savedAt) return '';
  try {
    return worldSlotDateFormatter.format(new Date(savedAt));
  } catch {
    return formatDate(savedAt);
  }
};

const worldSlotCardHtml = (role, index, entry) => {
  const player = role === 'player';
  const number = String(index + 1).padStart(2, '0');
  if (!entry) {
    return `
      <article class="world-slot-card world-slot-card--empty" data-slot-role="${role}" data-slot-index="${index}" role="listitem">
        <header class="world-slot-card__head">
          <span class="world-slot-card__index">МИР · ${number}</span>
          <span class="world-slot-card__state"><i aria-hidden="true"></i>Свободен</span>
        </header>
        <div class="world-slot-card__ghost" aria-hidden="true">
          ${icon('map', 'icon--lg')}
          <span>Пустой слот</span>
        </div>
        <div class="world-slot-body">
          <p class="world-slot-body__title">Слот ${index + 1}</p>
          <p class="world-slot-body__hint">${player ? 'Войдите в карту мастера по seed или файлу.' : 'Создайте карту — она займёт этот слот.'}</p>
        </div>
        <div class="world-slot-actions">
          <button class="mini-button mini-button--accent" type="button" data-action="world-slot-create" data-slot-index="${index}">
            ${icon(player ? 'eye' : 'plus', 'icon--xs')}<span>${player ? 'Войти в карту' : 'Создать карту'}</span>
          </button>
          ${player ? `<button class="mini-button world-slot-import" type="button" data-action="world-slot-import" data-slot-index="${index}" aria-label="Загрузить файл в слот ${index + 1}" title="Загрузить из файла">${icon('fileDown', 'icon--xs')}<span>Из файла</span></button>` : ''}
        </div>
      </article>`;
  }
  return `
    <article class="world-slot-card world-slot-card--filled" data-slot-role="${role}" data-slot-index="${index}" role="listitem">
      <header class="world-slot-card__head">
        <span class="world-slot-card__index">МИР · ${number}</span>
        <span class="world-slot-card__state world-slot-card__state--filled"><i aria-hidden="true"></i>Сохранён</span>
      </header>
      <div class="world-slot-card__media">
        <canvas class="world-slot-thumb" data-role="world-slot-thumb" data-slot-role="${role}" data-slot-index="${index}" width="360" height="180" aria-label="Превью карты слота ${index + 1}"></canvas>
        <span class="world-slot-card__media-mark" aria-hidden="true">${icon('map', 'icon--xs')}</span>
      </div>
      <div class="world-slot-body">
        <p class="world-slot-body__title" translate="no">${escapeHtml(entry.title || worldSlotEntryTitle(entry.config))}</p>
        <p class="world-slot-body__meta"><code translate="no">${escapeHtml(entry.config.seed)}</code><span>${worldSlotDateHtml(entry.savedAt)}</span></p>
      </div>
      <div class="world-slot-actions">
        <button class="mini-button mini-button--accent" type="button" data-action="world-slot-open" data-slot-index="${index}">
          ${icon(player ? 'eye' : 'play', 'icon--xs')}<span>${player ? 'Играть' : 'Вести карту'}</span>
        </button>
        <button class="mini-button mini-button--danger world-slot-clear" type="button" data-action="world-slot-clear" data-slot-index="${index}" aria-label="Очистить слот ${index + 1}" title="Очистить слот">${icon('trash', 'icon--xs')}</button>
      </div>
    </article>`;
};

const worldSlotsHtml = (session) => {
  const slots = loadWorldSlots();
  const role = WORLD_SLOT_ROLES.includes(session.tab) ? session.tab : 'master';
  const player = role === 'player';
  return `
    <div class="world-shell world-shell--slots">
      <section class="world-card world-slots">
        <header class="world-slots__head">
          <div class="world-slots__intro">
            <p class="world-card__eyebrow"><span>Картотека</span><span class="world-slots__total">6 ячеек</span></p>
            <h2>${player ? 'Выберите карту для входа' : 'Выберите мир для управления'}</h2>
            <p class="world-slots__lead">${player
              ? 'Войдите по seed мастера или загрузите карту из файла. В режиме игрока доступны просмотр и навигация.'
              : 'Создайте карту в свободном слоте или продолжите работу с сохранённым миром.'}</p>
          </div>
          <div class="world-slot-tabs" role="tablist" aria-label="Роль в игре">
            ${WORLD_SLOT_ROLES.map((value) => {
              const selected = value === role;
              const count = slots[value].filter(Boolean).length;
              const label = WORLD_ROLE_LABELS[value];
              return `<button class="world-slot-tab${selected ? ' is-active' : ''}" type="button" role="tab" data-action="world-slot-tab" data-tab="${value}" aria-selected="${selected}" aria-label="${label}, занято ${count} из ${WORLD_SLOT_COUNT} слотов">
                ${icon(value === 'master' ? 'crown' : 'eye', 'icon--xs')}<span>${label}</span><span class="world-slot-tab__count" aria-hidden="true">${count}<i>/ ${WORLD_SLOT_COUNT}</i></span>
              </button>`;
            }).join('')}
          </div>
        </header>
        <div class="world-slot-grid" role="list" aria-label="Слоты: ${WORLD_ROLE_LABELS[role]}">
          ${slots[role].map((entry, index) => worldSlotCardHtml(role, index, entry)).join('')}
        </div>
      </section>
    </div>`;
};

const worldModeToolsHtml = (player) => `
  <section class="world-card world-mode-panel">
    <header class="world-card__heading world-card__heading--compact">
      <div><p class="world-card__eyebrow">Роль доступа</p><h3>${icon(player ? 'eye' : 'crown', 'icon--sm')}<span>${player ? 'Игрок' : 'Мастер'}</span></h3></div>
      <span class="world-tag world-tag--mode">${icon(player ? 'eye' : 'crown', 'icon--xs')}<span>${player ? 'УРЕЗАННЫЕ ФУНКЦИИ' : 'ПОЛНЫЕ ФУНКЦИИ'}</span></span>
    </header>
    <ul class="world-mode-list">
      ${(player
        ? [
            ['check', 'Просмотр атласа, слои карты и легенда'],
            ['check', 'Камера RTS: панорама, зум, мини-карта'],
            ['check', 'Сведения о выбранной территории'],
            ['x', 'Создание и настройка карты'],
            ['x', 'Редактор Azgaar, сохранение и экспорт'],
          ]
        : [
            ['check', 'Создание карты и заполнение слота'],
            ['check', 'Полный редактор Azgaar FMG'],
            ['check', 'Сохранение, экспорт и снимок карты'],
            ['check', 'Смена seed и настройки мира'],
            ['check', 'Все слои атласа и разведданные'],
          ]
      )
        .map(([mark, text]) => `<li class="world-mode-list__item world-mode-list__item--${mark}">${icon(mark === 'check' ? 'check' : 'x', 'icon--xs')}<span>${text}</span></li>`)
        .join('')}
    </ul>
  </section>`;

const worldSetupHtml = (session) => {
  const config = session.config;
  const player = session.mode === 'player';
  const slot = session.slot;
  const slotLabel = slot ? `Слот ${slot.index + 1}` : 'Новая карта';
  return `
    <div class="world-shell world-shell--setup world-shell--azgaar">
      <section class="world-card world-config">
        <div class="world-config__kicker"><span class="world-config__step">${slot ? String(slot.index + 1).padStart(2, '0') : icon('plus', 'icon--xs')}</span><span>${slotLabel} · ${WORLD_ROLE_LABELS[session.mode]}</span></div>
        <h2>${player ? 'Войдите в карту' : 'Создайте свой мир'}</h2>
        <p class="world-fmg-description">${player
          ? 'Введите seed от мастера или загрузите файл карты. Доступ игрока ограничен просмотром и навигацией.'
          : 'Карта займёт этот слот и откроется в режиме мастера. Один seed воспроизводит один и тот же мир.'}</p>
        <label class="field world-field">
          <span class="field__label">Seed карты</span>
          <span class="world-seed-row">
            <input class="input input--code" type="text" maxlength="48" autocomplete="off" spellcheck="false"
                   data-role="world-seed" data-world-setting="seed" value="${escapeHtml(config.seed)}" />
            ${player ? '' : `<button class="icon-button icon-button--sm world-seed-random" type="button" data-action="world-random-seed" aria-label="Случайный seed" title="Случайный seed">${icon('dices', 'icon--xs')}</button>`}
          </span>
          <span class="world-field__hint">${player
            ? 'Seed выдаёт мастер. Введите его без изменений — мир будет тем же.'
            : 'Seed определяет рельеф, биомы, материки и чанки карты.'}</span>
        </label>
        <button class="solid-button world-generate" type="button" data-action="world-generate">
          <span>${player ? 'Войти в карту' : 'Создать карту'}</span>${icon(player ? 'eye' : 'plus', 'icon--xs')}
        </button>
        ${player
          ? `<button class="ghost-button ghost-button--inline world-slot-import-button" type="button" data-action="world-slot-import" data-slot-index="${slot?.index ?? 0}">${icon('fileDown', 'icon--xs')}<span>Загрузить файл карты</span></button>`
          : HAS_AZGAAR_EDITOR
            ? `<button class="ghost-button ghost-button--inline world-slot-import-button" type="button" data-action="world-fmg-open">${icon('map', 'icon--xs')}<span>Открыть редактор карт</span></button>`
            : ''}
      </section>
      ${worldModeToolsHtml(player)}
    </div>`;
};

const worldExploreHtml = (session) => {
  const world = session.model;
  const player = session.mode === 'player';
  return `
    <div class="world-shell world-shell--explore">
      <section class="world-card world-map-panel world-map-panel--focus">
        <header class="world-map-toolbar">
          <div class="world-map-toolbar__title"><p class="world-card__eyebrow">Оперативный атлас</p><h3>Поверхность мира</h3></div>
          <div class="world-camera-tools world-camera-tools--map" role="group" aria-label="Масштаб стратегической карты">
            <button class="world-camera-button" type="button" data-action="world-map-zoom" data-step="-1" aria-label="Отдалить стратегическую карту" title="Отдалить">${icon('minus', 'icon--xs')}</button>
            <span data-role="world-map-zoom">${Math.round((session.camera?.mapZoom ?? 2) * 100)}%</span>
            <button class="world-camera-button" type="button" data-action="world-map-zoom" data-step="1" aria-label="Приблизить стратегическую карту" title="Приблизить">${icon('plus', 'icon--xs')}</button>
            <button class="mini-button world-camera-home" type="button" data-action="world-camera-home">${icon('crosshair', 'icon--xs')}<span>К центру</span></button>
          </div>
        </header>
        ${worldLayerControlsHtml(session.layer)}
        <div class="world-map-viewport" data-role="world-map-frame">
          <canvas class="world-map-canvas world-map-canvas--focus" data-role="world-focus-map" width="1440" height="900" tabindex="0" aria-label="Стратегическая карта. Перетаскивайте мышью, колесо меняет масштаб, WASD двигает камеру."></canvas>
          <div class="world-map-hud world-map-hud--top" aria-hidden="true"><span class="world-map-hud__live"><i></i>СИСТЕМА КАРТЫ · АКТИВНА</span><span>${escapeHtml(world.seed)}</span></div>
          <div class="world-map-hud world-map-hud--bottom" aria-hidden="true"><span class="world-map-north">${icon('arrowUp', 'icon--xs')}<span>СЕВЕР</span></span><span>ПЕРЕТАСКИВАНИЕ · КОЛЕСО — МАСШТАБ</span></div>
          <span class="world-map-crosshair" aria-hidden="true">${icon('crosshair', 'icon--lg')}</span>
        </div>
        <div class="world-map-legendline">
          ${worldMapLegendHtml(session.layer)}
          <div class="world-map-facts" data-role="world-map-facts">${worldMapFactsHtml(world)}</div>
        </div>
        <div class="world-map-actions">
          ${player
            ? `<span class="world-status"><i class="world-status__dot world-status__dot--player"></i>${icon('eye', 'icon--xs')}<span>Режим игрока · только просмотр</span></span>`
            : `<span class="world-status"><i class="world-status__dot"></i>${icon('check', 'icon--xs')}<span>Карта активна · чанки загружаются по запросу</span></span>
          <button class="mini-button" type="button" data-action="world-edit-config">${icon('settings', 'icon--xs')}<span>Настроить</span></button>`}
        </div>
      </section>

      <aside class="world-side-column world-side-column--studio">
        <section class="world-card world-minimap-panel">
          <header class="world-card__heading world-card__heading--compact">
            <div><p class="world-card__eyebrow">Полная проекция</p><h3>${icon('map', 'icon--sm')}<span>Навигация</span></h3></div>
            <span class="world-tag">${world.continentCenters.length} МАТЕРИКА</span>
          </header>
          <canvas class="world-map-canvas world-map-canvas--overview" data-role="world-map" width="720" height="360" tabindex="0" aria-label="Мини-карта всего мира. Щелкните, чтобы переместить камеру."></canvas>
          <p class="world-map-hint">Щёлкните по мини-карте, чтобы перейти в выбранный сектор.</p>
        </section>

        <section class="world-card world-terrain-panel">
          <header class="world-card__heading world-card__heading--compact">
            <div><p class="world-card__eyebrow">Обзор местности</p><h3>${icon('mountain', 'icon--sm')}<span>Воксельная сцена</span></h3></div>
            <div class="world-camera-tools" role="group" aria-label="Масштаб воксельной камеры">
              <button class="world-camera-button" type="button" data-action="world-zoom" data-step="-1" aria-label="Отдалить вид местности" title="Отдалить">${icon('minus', 'icon--xs')}</button>
              <span data-role="world-zoom">100%</span>
              <button class="world-camera-button" type="button" data-action="world-zoom" data-step="1" aria-label="Приблизить вид местности" title="Приблизить">${icon('plus', 'icon--xs')}</button>
              <button class="world-camera-button" type="button" data-action="world-camera-home" aria-label="К точке старта" title="К точке старта">${icon('crosshair', 'icon--xs')}</button>
            </div>
          </header>
          <canvas class="world-voxel-canvas" data-role="world-viewport" width="900" height="560" aria-label="Изометрическая воксельная сцена. Перетаскивайте мышью для панорамирования камеры."></canvas>
          <div class="world-readouts">
            <div><span>Координаты</span><strong data-role="world-position">—</strong></div>
            <div><span>Биом</span><strong data-role="world-biome">—</strong></div>
            <div><span>Чанки</span><strong data-role="world-loaded">—</strong></div>
          </div>
        </section>

        <section class="world-card world-state-panel">
          <header class="world-card__heading world-card__heading--compact">
            <div><p class="world-card__eyebrow">Разведданные</p><h3>${icon('landmark', 'icon--sm')}<span>Выбранная территория</span></h3></div>
            <button class="mini-button" type="button" data-action="world-clear-selection">${icon('x', 'icon--xs')}<span>Сбросить</span></button>
          </header>
          <div class="world-state-details" data-role="world-state-details">${worldStateDetailsHtml(world, session.selectedStateId)}</div>
        </section>

        <section class="world-card world-controls-panel">
          <div class="world-control-copy"><p class="world-card__eyebrow">${icon('crosshair', 'icon--xs')}<span>Камера RTS</span></p><span>WASD / стрелки · Shift — быстрее</span></div>
          <div class="world-controls" role="group" aria-label="Быстрое перемещение камеры">
            <span aria-hidden="true"></span>
            <button class="world-control" type="button" data-action="world-move" data-dx="0" data-dz="-1" aria-label="Переместить камеру на север" title="На север">${icon('arrowUp', 'icon--sm')}</button>
            <span aria-hidden="true"></span>
            <button class="world-control" type="button" data-action="world-move" data-dx="-1" data-dz="0" aria-label="Переместить камеру на запад" title="На запад">${icon('arrowLeft', 'icon--sm')}</button>
            <button class="world-control world-control--center" type="button" data-action="world-camera-home" aria-label="Вернуть камеру к точке старта" title="К точке старта">${icon('crosshair', 'icon--sm')}</button>
            <button class="world-control" type="button" data-action="world-move" data-dx="1" data-dz="0" aria-label="Переместить камеру на восток" title="На восток">${icon('arrowRight', 'icon--sm')}</button>
            <span aria-hidden="true"></span>
            <button class="world-control" type="button" data-action="world-move" data-dx="0" data-dz="1" aria-label="Переместить камеру на юг" title="На юг">${icon('arrowDown', 'icon--sm')}</button>
            <span aria-hidden="true"></span>
          </div>
        </section>
      </aside>
    </div>`;
};

const worldFmgOverlayHtml = (session, seed) => {
  const frameUrl = `/fmg/index.html?seed=${encodeURIComponent(seed)}`;
  return `
    <section class="world-fmg-overlay" data-role="world-fmg-overlay" role="dialog" aria-modal="true" aria-label="Редактор карт" hidden>
      <div class="world-fmg-shell">
        <header class="world-fmg-heading">
          <div class="world-fmg-seed"><span>SEED</span><code data-role="world-fmg-seed">${escapeHtml(seed)}</code></div>
          <button class="world-topbar-button world-fmg-back-button" type="button" data-action="world-fmg-back" aria-label="Вернуться в атлас MIR">${icon('chevronLeft', 'icon--xs')}<span>Атлас MIR</span></button>
        </header>
        <iframe class="world-fmg-frame" data-role="world-fmg-frame"
          src="${escapeHtml(frameUrl)}" title="Редактор карт"
          referrerpolicy="no-referrer" allow="clipboard-read; clipboard-write; fullscreen"></iframe>
        <p class="world-fmg-attribution">Основано на Azgaar’s Fantasy Map Generator · MIT License · Max Haniyeu и contributors</p>
      </div>
    </section>`;
};

const worldPageHtml = () => {
  if (!ui.world) return '';
  const session = ui.world;
  const exploring = session.screen === 'explore' && session.model;
  const slotsScreen = session.screen === 'slots';
  const player = session.mode === 'player';
  const master = !player;
  const title = slotsScreen ? 'Слоты карт' : exploring ? 'Стратегический атлас' : player ? 'Вход в карту' : 'Создание карты';
  const sessionTitle = slotsScreen
    ? 'ВЫБОР СЛОТА'
    : exploring
      ? player ? 'РЕЖИМ ИГРОКА' : 'РЕЖИМ МАСТЕРА'
      : player ? 'ВХОД В КАРТУ' : 'МАСТЕР ГЕНЕРАЦИИ';
  const sessionInfo = slotsScreen
    ? 'ШЕСТЬ СЛОТОВ · ДВЕ РОЛИ'
    : exploring
      ? `SEED · ${escapeHtml(session.model.seed)}`
      : `${session.slot ? `СЛОТ ${session.slot.index + 1}` : 'НОВАЯ КАРТА'} · ${WORLD_ROLE_LABELS[session.mode].toUpperCase()}`;
  const modeChip = slotsScreen
    ? ''
    : `<span class="world-mode-chip${player ? ' world-mode-chip--player' : ''}">${icon(player ? 'eye' : 'crown', 'icon--xs')}<span>${player ? 'ИГРОК' : 'МАСТЕР'}</span></span>`;
  const toSlotsButton = slotsScreen
    ? ''
    : `<button class="world-topbar-button" type="button" data-action="world-slots">${icon('chevronLeft', 'icon--xs')}<span>К слотам</span></button>`;
  const roleActions = player
    ? ''
    : exploring
      ? `
            <button class="world-topbar-button" type="button" data-action="world-new">${icon('dices', 'icon--xs')}<span>Новый мир</span></button>
            <button class="world-topbar-button" type="button" data-action="world-save">${icon('save', 'icon--xs')}<span>Сохранить</span></button>
            <button class="world-topbar-button" type="button" data-action="world-export">${icon('fileDown', 'icon--xs')}<span>Экспорт</span></button>
            <button class="world-topbar-button" type="button" data-action="world-export-image">${icon('camera', 'icon--xs')}<span>Снимок</span></button>`
      : `
            <button class="world-topbar-button" type="button" data-action="world-load">${icon('folderOpen', 'icon--xs')}<span>Загрузить seed</span></button>
            <button class="world-topbar-button" type="button" data-action="world-random-seed">${icon('dices', 'icon--xs')}<span>Новый seed</span></button>`;
  const fmgButton = master && !slotsScreen && HAS_AZGAAR_EDITOR
    ? `\n          <button class="world-topbar-button world-fmg-open" type="button" data-action="world-fmg-open" aria-label="Открыть полный редактор карт Azgaar" title="Открыть полный редактор карт Azgaar">${icon('map', 'icon--xs')}<span>Редактор карт</span></button>`
    : '';
  return `
    <div class="world-app" role="application" aria-label="Редактор мира MIR">
      <header class="world-topbar">
        <div class="world-topbar__identity">
          <button class="world-back-button" type="button" data-action="world-exit" aria-label="Вернуться в главное меню" title="В меню">${icon('chevronLeft', 'icon--sm')}</button>
          <span class="world-brand-mark">${icon('sigil')}</span>
          <div class="world-brand-copy"><span>THE CIVILIZATION OF THE SAGES</span><strong>${title}</strong></div>
          ${modeChip}
        </div>
        <div class="world-topbar__session">
          <span class="world-topbar__live"><i></i>${sessionTitle}</span>
          <span class="world-topbar__seed">${sessionInfo}</span>
        </div>
        <div class="world-topbar__actions">
          ${toSlotsButton}${roleActions}${fmgButton}
          <button class="world-exit-button" type="button" data-action="world-exit">${icon('logOut', 'icon--xs')}<span>В меню</span></button>
        </div>
      </header>
      <main class="world-page-body world-page-body--${slotsScreen ? 'slots' : exploring ? 'explore' : 'setup'}" data-role="world-page-body">
        ${slotsScreen ? worldSlotsHtml(session) : exploring ? worldExploreHtml(session) : worldSetupHtml(session)}
      </main>
      <input class="world-file-input" type="file" accept="application/json,.json" data-role="world-file" tabindex="-1" aria-hidden="true" />
    </div>`;
};

const renderWorldPage = ({ focus = false } = {}) => {
  const root = worldPageRoot();
  if (!root || !ui.world?.open) return;
  const html = worldPageHtml();
  const currentApp = root.querySelector('.world-app');
  const overlay = root.querySelector('[data-role="world-fmg-overlay"]');
  const overlayVisible = Boolean(overlay && !overlay.hidden);
  if (renderedWorldPageHtml !== html || !currentApp) {
    if (currentApp) currentApp.outerHTML = html;
    else root.innerHTML = html;
    renderedWorldPageHtml = html;
    if (focus) root.querySelector('[data-role="world-seed"]')?.focus();
  }
  const worldApp = root.querySelector('.world-app');
  if (overlay && worldApp) {
    worldApp.after(overlay);
    worldApp.toggleAttribute('inert', overlayVisible);
  }
  drawWorldSession();
};

const openWorldPage = ({ history = true, slots = false } = {}) => {
  if (!ui.world) ui.world = createWorldSession();
  /* Кнопка «Играть» всегда открывает экран слотов: игрок выбирает роль
     и карту, а не попадает в середину прошлой сессии. Возврат по истории
     браузера (popstate) сохраняет текущий экран. */
  if (slots) {
    ui.world.screen = 'slots';
    ui.world.slot = null;
  }
  if (ui.modal) closeModal();
  ui.world.open = true;
  if (history && window.location.hash !== '#play') {
    window.history.pushState({ mirWorldPage: true }, '', `${window.location.pathname}${window.location.search}#play`);
    worldPageHistoryEntry = true;
  } else {
    worldPageHistoryEntry = false;
  }
  document.body.classList.add('world-page-open');
  const root = worldPageRoot();
  if (root) root.hidden = false;
  renderWorldPage({ focus: true });
  playSound('open');
};

const closeWorldPage = ({ history = true } = {}) => {
  if (!ui.world?.open) return;
  ui.world.open = false;
  document.body.classList.remove('world-page-open');
  worldCameraDrag = null;
  worldMapDragSuppressed = false;
  const root = worldPageRoot();
  if (root) {
    root.hidden = true;
    root.innerHTML = '';
  }
  renderedWorldPageHtml = '';
  if (history && window.location.hash === '#play') {
    if (worldPageHistoryEntry) window.history.back();
    else window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
  }
  worldPageHistoryEntry = false;
  playSound('close');
};

window.addEventListener('popstate', () => {
  const isWorldRoute = window.location.hash.toLowerCase() === '#play';
  if (isWorldRoute && !ui.world?.open) openWorldPage({ history: false });
  else if (!isWorldRoute && ui.world?.open) closeWorldPage({ history: false });
});

const worldModalHtml = () => {
  if (!ui.world) return '';
  const exploring = ui.world.screen === 'explore' && ui.world.model;
  return dialogShell({
    label: exploring ? 'Процедурный voxel-мир' : 'Создание процедурного мира',
    title: exploring ? 'Исследование мира' : 'Создание мира',
    size: 'world',
    body: exploring ? worldExploreHtml(ui.world) : worldSetupHtml(ui.world),
  });
};

const refreshWorldPreview = () => {
  if ((ui.modal?.type !== 'world' && !ui.world?.open) || ui.world?.screen !== 'setup') return;
  const field = worldRoot()?.querySelector('[data-world-setting="seed"]');
  const typed = field?.value.trim() || '';
  if (!typed) {
    /* Пустое поле мастера превращается в новый случайный seed; пустое поле
       игрока остаётся пустым — он должен ввести seed мастера, а не случайный. */
    if (ui.world.mode === 'player') {
      ui.world.config.seed = '';
      return;
    }
    if (field) field.value = worldSeed();
  }
  ui.world.config.seed = field?.value.trim() || worldSeed();
};

const updateWorldReadouts = () => {
  if ((ui.modal?.type !== 'world' && !ui.world?.open) || ui.world?.screen !== 'explore' || !ui.world.model) return;
  const root = worldRoot();
  const { model, camera } = ui.world;
  const column = model.getColumn(camera.x, camera.z);
  const chunkX = Math.floor(camera.x / model.chunkSize);
  const chunkZ = Math.floor(camera.z / model.chunkSize);
  const positionNode = root?.querySelector('[data-role="world-position"]');
  const biomeNode = root?.querySelector('[data-role="world-biome"]');
  const loadedNode = root?.querySelector('[data-role="world-loaded"]');
  const zoomNode = root?.querySelector('[data-role="world-zoom"]');
  const mapZoomNode = root?.querySelector('[data-role="world-map-zoom"]');
  if (positionNode) positionNode.textContent = `X ${worldInteger(Math.floor(camera.x))} · Z ${worldInteger(Math.floor(camera.z))}`;
  if (mapZoomNode) mapZoomNode.textContent = `${Math.round((camera.mapZoom ?? 1) * 100)}%`;
  if (biomeNode && column) {
    const biome = BIOME_NAMES[column.biome] ?? BLOCK_NAMES[column.topMaterial] ?? 'воксель';
    biomeNode.textContent = column.water ? `${biome} · дно: ${BLOCK_NAMES[column.surfaceMaterial]}` : `${biome} · чанк ${chunkX}, ${chunkZ}`;
  }
  if (loadedNode) loadedNode.textContent = `${model.loadedChunkCount()} / ${worldScientific(model.chunkCount)}`;
  if (zoomNode) zoomNode.textContent = `${Math.round(camera.zoom * 100)}%`;
};

/* Превью слотов: растровая мини-карта кешируется отдельно от DOM-canvas.
   Переключение ролей повторно использует готовые пиксели, а первая отрисовка
   идёт по одному слоту за кадр/idle-задачу, чтобы не блокировать ввод. */
const worldSlotThumbCache = new Map();
const worldSlotThumbQueue = [];
let worldSlotThumbScheduled = false;
let worldDrawFrame = 0;

const worldSlotThumbKey = (role, index, config) =>
  `${role}:${index}:${JSON.stringify(normalizeWorldConfig(config))}`;

const scheduleWorldSlotThumb = () => {
  if (worldSlotThumbScheduled || !worldSlotThumbQueue.length) return;
  worldSlotThumbScheduled = true;
  const drawNext = () => {
    worldSlotThumbScheduled = false;
    const job = worldSlotThumbQueue.shift();
    if (job && job.root.contains(job.canvas)) {
      const { canvas, role, index, entry } = job;
      const key = worldSlotThumbKey(role, index, entry.config);
      let preview = worldSlotThumbCache.get(key);
      if (preview) {
        worldSlotThumbCache.delete(key);
        worldSlotThumbCache.set(key, preview);
      } else {
        preview = document.createElement('canvas');
        preview.width = canvas.width;
        preview.height = canvas.height;
        const model = createWorld({ ...entry.config });
        drawWorldMap(preview, model, null, 'biomes', true);
        worldSlotThumbCache.set(key, preview);
        if (worldSlotThumbCache.size > WORLD_SLOT_COUNT * WORLD_SLOT_ROLES.length) {
          worldSlotThumbCache.delete(worldSlotThumbCache.keys().next().value);
        }
      }
      try {
        const context = canvas.getContext('2d');
        context?.clearRect(0, 0, canvas.width, canvas.height);
        context?.drawImage(preview, 0, 0, canvas.width, canvas.height);
        canvas.dataset.drawn = '1';
      } catch { /* превью необязательно для входа в сохранённую карту */ }
      delete canvas.dataset.drawQueued;
    }
    if (worldSlotThumbQueue.length) scheduleWorldSlotThumb();
  };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(drawNext, { timeout: 500 });
  else if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(drawNext);
  else window.setTimeout(drawNext, 0);
};

const drawWorldSlotThumbs = (root) => {
  if (!root) return;
  const slots = loadWorldSlots();
  for (const canvas of root.querySelectorAll('canvas[data-role="world-slot-thumb"]')) {
    if (canvas.dataset.drawn === '1' || canvas.dataset.drawQueued === '1') continue;
    const role = canvas.dataset.slotRole;
    const index = Number(canvas.dataset.slotIndex);
    const entry = slots[role]?.[index];
    if (!entry) continue;
    canvas.dataset.drawQueued = '1';
    worldSlotThumbQueue.push({ root, canvas, role, index, entry });
  }
  scheduleWorldSlotThumb();
};

const drawWorldSession = () => {
  if ((ui.modal?.type !== 'world' && !ui.world?.open) || !ui.world) return;
  const root = worldRoot();
  if (ui.world.screen === 'slots') {
    drawWorldSlotThumbs(root);
    return;
  }
  if (ui.world.screen === 'setup') return;
  drawWorldMap(root?.querySelector('[data-role="world-focus-map"]'), ui.world.model, ui.world.camera, ui.world.layer);
  drawWorldMap(root?.querySelector('[data-role="world-map"]'), ui.world.model, ui.world.camera, ui.world.layer, true);
  drawVoxelView(root?.querySelector('[data-role="world-viewport"]'), ui.world.model, ui.world.camera);
  updateWorldReadouts();
};

const scheduleWorldSessionDraw = () => {
  if (worldDrawFrame) return;
  const draw = () => {
    worldDrawFrame = 0;
    drawWorldSession();
  };
  worldDrawFrame = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame(draw)
    : window.setTimeout(draw, 16);
};

const moveWorldCamera = (dx, dz) => {
  if ((ui.modal?.type !== 'world' && !ui.world?.open) || ui.world?.screen !== 'explore' || !ui.world.model) return;
  const { model, camera } = ui.world;
  camera.x = Math.max(0, Math.min(model.widthCells - 1, camera.x + dx));
  camera.z = Math.max(0, Math.min(model.depthCells - 1, camera.z + dz));
  scheduleWorldSessionDraw();
};

const changeWorldZoom = (direction) => {
  if ((ui.modal?.type !== 'world' && !ui.world?.open) || ui.world?.screen !== 'explore') return;
  ui.world.camera.zoom = clamp(ui.world.camera.zoom * (direction > 0 ? 1.2 : 1 / 1.2), 0.6, 2.5);
  ui.world.camera.zoom = Math.round(ui.world.camera.zoom * 100) / 100;
  scheduleWorldSessionDraw();
};

const changeWorldMapZoom = (direction, canvas = null, clientX = null, clientY = null) => {
  if ((ui.modal?.type !== 'world' && !ui.world?.open) || ui.world?.screen !== 'explore') return;
  const camera = ui.world.camera;
  const world = ui.world.model;
  const before = worldMapPointAt(canvas, world, camera, clientX, clientY);
  const bounds = canvas?.getBoundingClientRect?.();
  const screenU = bounds?.width ? (clientX - bounds.left) / bounds.width : 0.5;
  const screenV = bounds?.height ? (clientY - bounds.top) / bounds.height : 0.5;
  const nextZoom = clamp((camera.mapZoom ?? 2) * (direction > 0 ? 1.22 : 1 / 1.22), 1, 5);
  if (before) {
    camera.x = before.x - (screenU - 0.5) * world.widthCells / nextZoom;
    camera.z = before.z - (screenV - 0.5) * world.depthCells / nextZoom;
  }
  camera.mapZoom = Math.round(nextZoom * 100) / 100;
  moveWorldCamera(0, 0);
};

const resetWorldCamera = () => {
  if ((ui.modal?.type !== 'world' && !ui.world?.open) || ui.world?.screen !== 'explore' || !ui.world.spawn) return;
  ui.world.camera.x = ui.world.spawn.x;
  ui.world.camera.z = ui.world.spawn.z;
  ui.world.camera.zoom = 1;
  ui.world.camera.mapZoom = 2.1;
  scheduleWorldSessionDraw();
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

/* Раскладывает превью точно по тому же квадратному окну, которое сохранит canvas. */
const updateAvatarEditor = () => {
  const root = overlayRoot();
  const image = root?.querySelector('[data-role="avatar-editor-image"]');
  if (!image?.naturalWidth || !image?.naturalHeight) return;
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const rotation = ((Math.round(ui.avatarCrop.rotation / 90) % 4) + 4) % 4 * 90;
  const rotated = rotation % 180 !== 0;
  const sourceWidth = rotated ? height : width;
  const sourceHeight = rotated ? width : height;
  const zoom = clamp(ui.avatarCrop.zoom, 1, 3);
  const sourceSide = Math.min(sourceWidth, sourceHeight) / zoom;
  const sx = (sourceWidth - sourceSide) * clamp(ui.avatarCrop.x, 0, 100) / 100;
  const sy = (sourceHeight - sourceSide) * clamp(ui.avatarCrop.y, 0, 100) / 100;

  for (const [frameRole, imageRole] of [
    ['avatar-frame', 'avatar-editor-image'],
    ['avatar-sample-frame', 'avatar-sample-image'],
  ]) {
    const frame = root.querySelector(`[data-role="${frameRole}"]`);
    const target = root.querySelector(`[data-role="${imageRole}"]`);
    const frameSize = frame?.clientWidth;
    if (!frameSize || !target) continue;
    const scale = frameSize / sourceSide;
    target.style.width = `${width * scale}px`;
    target.style.height = `${height * scale}px`;
    target.style.left = `${(sourceWidth / 2 - sx) * scale}px`;
    target.style.top = `${(sourceHeight / 2 - sy) * scale}px`;
    target.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
  }

  const zoomInput = root.querySelector('[data-role="avatar-zoom"]');
  const xInput = root.querySelector('[data-role="avatar-x"]');
  const yInput = root.querySelector('[data-role="avatar-y"]');
  const zoomValue = root.querySelector('[data-role="avatar-zoom-value"]');
  if (zoomInput) zoomInput.value = String(zoom);
  if (xInput) xInput.value = String(Math.round(ui.avatarCrop.x));
  if (yInput) yInput.value = String(Math.round(ui.avatarCrop.y));
  if (zoomValue) zoomValue.textContent = `${Math.round(zoom * 100)}%`;
};

/* Окно обновляется только когда его разметка действительно изменилась.
   Периодические пульсы и ответы хаба не должны заменять живой DOM под руками. */
const renderModal = ({ focus = true } = {}) => {
  const root = overlayRoot();
  if (!root) return;
  if (!ui.modal) {
    if (root.innerHTML) root.innerHTML = '';
    renderedModalHtml = '';
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
    case 'admin':
      html = adminModalHtml();
      break;
    case 'world':
      html = worldModalHtml();
      break;
  }

  /* Проверяем и себя, и слой окон: разметку мог стереть closeModal или
     другой код, а сверять `innerHTML` целиком (с аватарками) дорого. */
  const changed = renderedModalHtml !== html || !root.querySelector('.dialog');
  /* Разметка та же — окно уже на экране. Обновлять нечего, но если
     окно только что открыли, фокус всё равно надо поставить. */
  if (!changed) {
    if (ui.modal.type === 'world') drawWorldSession();
    if (!focus) return;
    const keep = root.querySelector('[data-autofocus]') || root.querySelector('input, button');
    keep?.focus();
    return;
  }

  const previous = root.querySelector('.dialog');
  const active = document.activeElement;
  const activeIsInside = !!active && root.contains(active);
  const activeRole = activeIsInside ? active.dataset?.role : '';
  const activeSetting = activeIsInside ? active.dataset?.setting : '';
  const activeAction = activeIsInside ? active.dataset?.action : '';
  const activeId = activeIsInside ? active.dataset?.id : undefined;
  const activeTab = activeIsInside ? active.dataset?.tab : undefined;
  const activeValue = activeIsInside ? active.dataset?.value : undefined;
  const selection = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
    ? { start: active.selectionStart, end: active.selectionEnd }
    : null;
  const dialogScroll = focus ? 0 : previous?.scrollTop ?? 0;
  const oldLog = root.querySelector('[data-role="chat-list"]');
  const wasAtLogBottom = !focus && oldLog
    ? oldLog.scrollTop + oldLog.clientHeight >= oldLog.scrollHeight - 16
    : true;
  const logScroll = focus ? 0 : oldLog?.scrollTop ?? 0;

  root.innerHTML = html;
  renderedModalHtml = html;

  /* Окно перерисовали из-за новых данных (пришло сообщение, сменился
     статус друга) — это не «открытие», и въезжать заново ему не надо:
     повторная анимация читалась как подтормаживание интерфейса. */
  if (!focus) {
    root.querySelector('.overlay')?.setAttribute('data-static', '');
    root.querySelector('.dialog')?.setAttribute('data-static', '');
  }

  const dialog = root.querySelector('.dialog');
  if (dialog) dialog.scrollTop = dialogScroll;
  const log = root.querySelector('[data-role="chat-list"]');
  if (log) log.scrollTop = wasAtLogBottom ? log.scrollHeight : logScroll;

  if (ui.modal.type === 'avatar-preview') {
    const image = root.querySelector('[data-role="avatar-editor-image"]');
    if (image?.complete && image.naturalWidth) updateAvatarEditor();
    else image?.addEventListener('load', updateAvatarEditor, { once: true });
  }
  if (ui.modal.type === 'world') drawWorldSession();

  if (!focus && activeIsInside) {
    let target = activeRole
      ? root.querySelector(`[data-role="${activeRole}"]`)
      : activeSetting
        ? root.querySelector(`[data-setting="${activeSetting}"]`)
        : activeAction
          ? [...root.querySelectorAll('[data-action]')].find(
              (item) =>
                item.dataset.action === activeAction &&
                item.dataset.id === activeId &&
                item.dataset.tab === activeTab &&
                item.dataset.value === activeValue,
            )
          : null;
    if (target && !target.disabled) {
      target.focus({ preventScroll: true });
      if (selection && target.setSelectionRange) {
        try {
          target.setSelectionRange(selection.start, selection.end);
        } catch { /* range inputs and some mobile keyboards do not expose a selection */ }
      }
    }
  }

  if (!focus) return;
  const focusTarget = root.querySelector('[data-autofocus]') || root.querySelector('input, button');
  focusTarget?.focus();
  const aut = root.querySelector('[data-autofocus]');
  if (aut instanceof HTMLInputElement) aut.select();
};

/* ---------- верхняя панель: аккаунт -------------------------- */

const accountSlotHtml = () => {
  if (!backendReady) {
    return `<p class="status"><span class="dot dot--warn" aria-hidden="true"></span><span>Подключаемся к хабу…</span></p>`;
  }
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
  if (!backendReady) {
    return `
      <div class="rail__head">
        <div class="rail__heading">
          <p class="eyebrow">Сообщество</p>
          <h2 class="rail__title">Общий хаб</h2>
        </div>
      </div>
      <div class="rail__list">
        <div class="empty">
          <p class="empty__title">Проверяем подключение</p>
          <p class="empty__text">Сначала приложение ищет общий хаб. Вход и регистрация откроются после проверки, чтобы аккаунт сразу попал в правильный мир.</p>
        </div>
      </div>`;
  }
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
          <button class="brand__mark" type="button" data-action="admin-tap" aria-label="Знак игры">${icon('sigil')}</button>
          <span class="brand__name" lang="en">
            <span class="brand__line">${TITLE.lead}</span>
            <span class="brand__line brand__line--muted">${TITLE.tail}</span>
          </span>
        </p>
      </div>

      <nav class="topbar__nav" aria-label="Основная навигация">
        <button class="play-button" type="button" data-action="open-world" aria-label="Играть — создать или открыть мир">
          ${icon('play', 'icon--play')}
          <span>Играть</span>
        </button>
      </nav>

      <div class="topbar__side topbar__side--end" data-region="account"></div>

      <div class="update-bar" data-region="update" hidden></div>
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

/* Что уже нарисовано в области. Раньше «изменилось ли» выяснялось
   чтением `node.innerHTML`: браузер заново собирал строку всей панели —
   вместе с аватарками это сотни килобайт на каждую проверку (а проверок
   за одно действие бывает несколько). Теперь мы помним, какую разметку
   сами и положили, и сравниваем строку со строкой. */
const renderedRegions = new Map(); // область → последняя разметка

const setMarkupIfChanged = (node, html, region) => {
  if (!node) return;
  if (renderedRegions.get(region) === html) return;
  renderedRegions.set(region, html);
  const active = document.activeElement;
  const hadFocus = node.contains(active);
  const action = hadFocus ? active.dataset?.action : '';
  const id = hadFocus ? active.dataset?.id : '';
  node.innerHTML = html;
  if (!hadFocus || !action) return;
  const replacement = [...node.querySelectorAll('[data-action]')]
    .find((item) => item.dataset.action === action && item.dataset.id === id);
  replacement?.focus({ preventScroll: true });
};

const renderRegions = () => {
  setMarkupIfChanged(document.querySelector('[data-region="account"]'), accountSlotHtml(), 'account');
  setMarkupIfChanged(document.querySelector('[data-region="rail"]'), railHtml(), 'rail');
};

const render = () => {
  renderRegions();
  if (ui.modal) renderModal({ focus: false });
};

const storeModalTypes = new Set(['profile', 'add-friend', 'friend', 'hub', 'admin']);
const renderAfterStoreChange = () => {
  renderRegions();
  if (ui.modal && (storeModalTypes.has(ui.modal.type) || (ui.modal.type === 'auth' && backendReady)))
    renderModal({ focus: false });
};

/* ---------- обновления --------------------------------------- */

/* Состояние обновления словами. Тексты живут здесь, а не в src/data/update.js:
   модуль знает про сеть и service worker, а формулировки — дело интерфейса. */
const updateStatusText = () => {
  const state = update.getUpdateInfo();
  const version = state.latest?.version;
  switch (state.phase) {
    case 'checking':
      return 'Проверяем…';
    case 'downloading':
      return 'Новая версия скачивается в фоне.';
    case 'ready':
      return version ? `Версия ${version} скачана и готова к запуску.` : 'Обновление скачано и готово к запуску.';
    case 'stale':
      return version ? `На сервере уже версия ${version}.` : 'На сервере новая версия.';
    case 'error':
      return 'Не удалось проверить — проверьте связь с интернетом.';
    case 'unavailable':
      return `Версия ${VERSION}. Эта копия обновляется целиком — новой сборкой приложения.`;
    default:
      return state.lastCheck
        ? `Версия ${VERSION}. Проверено в ${TIME_FORMAT.format(state.lastCheck)}.`
        : `Версия ${VERSION}. Проверка выполняется автоматически.`;
  }
};

/* Уведомления телефона: их мало выключить — у них бывает три разных
   состояния, и игроку важно понимать, какое именно. */
const notifyHint = () => {
  const state = update.notificationState();
  if (!state.supported) return 'Уведомления работают в установленном приложении по https.';
  if (state.permission === 'denied')
    return 'Браузер запретил уведомления — разрешите их в настройках.';
  return state.enabled
    ? 'Сообщение в шторке телефона, когда выйдет новая версия.'
    : 'Сказать о новой версии уведомлением телефона, а не только строкой в меню.';
};

/* Диагностика в панели админа: что с обновлениями прямо сейчас. */
const updateDiagnostics = () => {
  const state = update.getUpdateInfo();
  if (!state.checkable) return 'проверка недоступна: копия открыта с диска';
  const parts = [
    state.supported
      ? navigator.serviceWorker?.controller
        ? 'service worker активен'
        : 'service worker зарегистрирован'
      : 'service worker не активен',
  ];
  parts.push(
    state.available
      ? state.latest?.version
        ? `доступна версия ${state.latest.version}`
        : 'доступна новая версия'
      : 'обновлений нет',
  );
  if (state.lastCheck) parts.push(`проверено в ${TIME_FORMAT.format(state.lastCheck)}`);
  return parts.join(' · ');
};

/* Строка обновления висит под шапкой, когда на сервере появилась новая
   сборка. Сама она ничего не перезагружает: игрок либо жмёт «Обновить
   сейчас», либо откладывает — и тогда новая версия включится при следующем
   запуске, как и раньше. */
const updateBarHtml = (state) => {
  const version = state.latest?.version ? ` ${state.latest.version}` : '';
  const text = state.waiting
    ? version
      ? `Версия${version} скачана и готова к запуску.`
      : 'Обновление скачано и готово к запуску.'
    : `На сервере вышла новая версия${version}.`;
  return `
    <p class="update-bar__text">
      <span class="update-bar__eyebrow">Обновление</span>
      <span>${escapeHtml(text)}</span>
    </p>
    <div class="update-bar__actions">
      <button class="mini-button mini-button--accent" type="button" data-action="update-apply">Обновить сейчас</button>
      <button class="mini-button" type="button" data-action="update-dismiss">Позже</button>
    </div>`;
};

const renderUpdateBar = () => {
  const node = document.querySelector('[data-region="update"]');
  if (!node) return;
  const state = update.getUpdateInfo();
  const visible = state.available && !state.dismissed;
  node.hidden = !visible;
  setMarkupIfChanged(node, visible ? updateBarHtml(state) : '', 'update');
};

/* Про новую сборку говорим один раз: тост видно внизу экрана, а на телефоне
   (если игрок разрешил уведомления) новость приходит в шторку — строка под
   шапкой сама по себе не бросается в глаза. */
let announcedBuild = '';
const announceUpdate = (state) => {
  if (!state.available || !state.announceKey || state.announceKey === announcedBuild) return;
  announcedBuild = state.announceKey;
  const version = state.latest?.version ? ` ${state.latest.version}` : '';
  if (state.phase === 'ready') toast(`Обновление${version} готово — можно обновить сейчас.`);
  else toast(`Вышло обновление${version} — обновите страницу.`);
  update.notifyDevice({
    title: `Вышло обновление${version}`,
    body: 'Нажмите, чтобы открыть игру и обновиться.',
  });
};

const onUpdateChange = (state) => {
  renderUpdateBar();
  announceUpdate(state);
  if (ui.modal?.type === 'settings') renderModal({ focus: false });
};

/* Настройка «уведомления на телефон» хранится на устройстве, а разрешение —
   в браузере: если игрок его отозвал, честнее показать выключенный
   переключатель, чем обещать уведомления, которых не будет. */
const restoreNotifications = async () => {
  if (!store.getSettings().notify) return;
  const result = await update.setNotify(true);
  if (result !== 'granted') store.updateSettings({ notify: false });
};

const refreshLiveLink = (peerId) => {
  const node = [...(overlayRoot()?.querySelectorAll('[data-role="peer-link-state"]') ?? [])]
    .find((item) => item.dataset.peerId === peerId);
  const html = linkStateHtml(peerId);
  if (node && node.outerHTML !== html) node.outerHTML = html;
};

const renderAfterPeerChange = (change = {}) => {
  /* Замер задержки приходит от каждого открытого канала раз в пять
     секунд. К списку друзей он отношения не имеет — трогаем только
     подпись связи: иначе панель пересобиралась по несколько раз в
     секунду, и меню подтормаживало на ровном месте. */
  if (change.type === 'rtt') {
    refreshLiveLink(change.peerId);
    return;
  }
  renderRegions();
  if (!ui.modal) return;
  const affectsFriend = ui.modal.type === 'friend' &&
    (!change.peerId || change.peerId === ui.modal.data);
  const affectsManual = ui.modal.type === 'direct' &&
    (!change.peerId || change.peerId === p2p.MANUAL_ID);
  if (affectsFriend || affectsManual) renderModal({ focus: false });
};

store.subscribe(renderAfterStoreChange);
update.subscribe(onUpdateChange);
p2p.subscribe(renderAfterPeerChange);
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
    /* За время запроса окно могло перерисоваться (обновление данных хаба):
       старый узел формы тогда висит вне документа, и ошибка в нём не видна.
       Ищем живую форму с тем же data-form. */
    const live = document.querySelector(`form[data-form="${form.dataset.form}"]`) ?? form;
    setFormError(live, error instanceof Error ? error.message : 'Что-то пошло не так.');
  } finally {
    submit?.removeAttribute('disabled');
  }
};

/* ---------- панель админа: загрузка и действия --------------- */

const refreshAdmin = async () => {
  if (ui.admin.busy) return;
  ui.admin.busy = true;
  if (ui.modal?.type === 'admin') renderModal({ focus: false });
  try {
    ui.admin.data = await store.adminSnapshot();
    ui.admin.lastUpdatedAt = Date.now();
    ui.admin.error = '';
  } catch (error) {
    ui.admin.error = error instanceof Error ? error.message : 'Хаб не ответил.';
  } finally {
    ui.admin.busy = false;
    if (ui.modal?.type === 'admin') renderModal({ focus: false });
  }
};

/** Открыть служебный раздел (знак игры, Ctrl+Shift+Alt+A или #admin). */
const openAdminGate = () => {
  ui.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  ui.admin = adminState();
  ui.modal = { type: 'admin' };
  playSound('unlock');
  renderModal();
  /* Ключ этой вкладки уже вводили — данные можно подтянуть сразу. */
  if (store.adminKey()) refreshAdmin();
};

/* Разметка панели меняется от собственных щелчков — перерисовываем её
   сразу, не дожидаясь следующего события данных. */
const runAdminAction = async (fn, message) => {
  try {
    await fn();
    if (message) toast(message);
  } catch (error) {
    playSound('error');
    toast(error instanceof Error ? error.message : 'Не получилось.', 'error');
    return;
  }
  await refreshAdmin();
};

const adminExport = () => {
  const data = ui.admin.data;
  if (!data) return;
  const payload = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      mode: data.mode,
      host: data.host || '',
      stats: data.stats,
      settings: data.settings ?? null,
      users: data.users,
      requests: data.requests,
      events: data.events ?? [],
    },
    null,
    1,
  );
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `mir-admin-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  toast('Копия данных скачана.');
};

let adminTaps = [];
let adminTapTimer = 0;

const clearAdminTapCharge = (mark) => {
  mark?.classList.remove('brand__mark--charging');
  mark?.style.removeProperty('--sigil-progress');
  mark?.style.removeProperty('--sigil-glow');
};

/** Семь быстрых касаний открывают скрытый вход; незавершённая серия тихо гаснет. */
const registerAdminTap = (mark) => {
  const now = Date.now();
  adminTaps = [...adminTaps.filter((at) => now - at < ADMIN_TAP_WINDOW), now];
  const progress = Math.min(1, adminTaps.length / ADMIN_TAPS);
  mark?.style.setProperty('--sigil-progress', String(progress));
  mark?.style.setProperty('--sigil-glow', `${Math.round(progress * 14)}px`);
  mark?.classList.toggle('brand__mark--charging', adminTaps.length > 0);
  window.clearTimeout(adminTapTimer);

  if (adminTaps.length < ADMIN_TAPS) {
    adminTapTimer = window.setTimeout(() => {
      adminTaps = [];
      clearAdminTapCharge(mark);
    }, ADMIN_TAP_WINDOW);
    return false;
  }

  adminTaps = [];
  clearAdminTapCharge(mark);
  mark?.classList.add('brand__mark--unlocked');
  window.setTimeout(() => mark?.classList.remove('brand__mark--unlocked'), 760);
  return true;
};

const adminFromUrl = () => {
  try {
    const hash = String(location.hash || '').replace(/^#/, '').toLowerCase();
    const query = new URLSearchParams(location.search);
    const flag = (query.get('admin') || '').toLowerCase();
    return hash === 'admin' || flag === '1' || flag === 'true';
  } catch {
    return false;
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
      playSound('connect');
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

  'admin-login': (form, fields) =>
    withBusy(form, async () => {
      ui.admin.keyDraft = fields.key.value;
      await store.adminLogin(fields.key.value);
      ui.admin.error = '';
      setFormError(form, '');
      playSound('success');
      await refreshAdmin();
      renderModal();
    }),

  'admin-rename': (form, fields) =>
    withBusy(form, async () => {
      const name = fields.name.value.trim();
      await store.adminUserAction(form.dataset.id, 'rename', { name });
      ui.admin.nameDraft = '';
      setFormError(form, '');
      toast(`Никнейм изменён на ${name}.`);
      await refreshAdmin();
    }),

  'admin-ban': (form, fields) =>
    withBusy(form, async () => {
      const hours = Number(fields.hours.value) || 0;
      await store.adminBan(form.dataset.id, { reason: fields.reason.value.trim(), hours });
      ui.admin.banReason = '';
      setFormError(form, '');
      playSound('success');
      toast(hours ? 'Аккаунт заблокирован — устройства отключены.' : 'Аккаунт заблокирован навсегда.');
      await refreshAdmin();
    }),

  'admin-password': (form, fields) =>
    withBusy(form, async () => {
      await store.adminSetPassword(form.dataset.id, fields.password.value);
      ui.admin.passDraft = '';
      setFormError(form, '');
      playSound('success');
      toast('Пароль обновлён — старые входы этого игрока отозваны.');
      await refreshAdmin();
    }),

  'admin-new-key': (form, fields) =>
    withBusy(form, async () => {
      if (fields.next.value !== fields.repeat.value) throw new Error('Ключи не совпадают.');
      await store.adminSetKey(fields.next.value);
      ui.admin.newKeyDraft = '';
      ui.admin.repeatKeyDraft = '';
      setFormError(form, '');
      playSound('success');
      toast('Ключ администратора сменён. Запомните его — восстановления нет.');
      renderModal({ focus: false });
    }),

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
    if (role === 'avatar-zoom') ui.avatarCrop.zoom = clamp(event.target.value, 1, 3);
    if (role === 'avatar-x') ui.avatarCrop.x = clamp(event.target.value, 0, 100);
    if (role === 'avatar-y') ui.avatarCrop.y = clamp(event.target.value, 0, 100);
    updateAvatarEditor();
  }
  if (role === 'friend-search') {
    ui.addQuery = event.target.value;
    const me = store.getCurrentUser();
    const box = document.querySelector('[data-role="friend-results"]');
    if (me && box) box.innerHTML = searchResultsHtml(me);
  }
  if (role === 'admin-search') {
    ui.admin.query = event.target.value;
    renderModal({ focus: false });
  }
  if (role === 'admin-request-search') {
    ui.admin.requestQuery = event.target.value;
    renderModal({ focus: false });
  }
  if (role === 'admin-event-search') {
    ui.admin.eventQuery = event.target.value;
    renderModal({ focus: false });
  }
  if (role === 'admin-name') ui.admin.nameDraft = event.target.value;
  if (role === 'admin-ban-reason') ui.admin.banReason = event.target.value;
  if (role === 'admin-ban-hours') ui.admin.banHours = event.target.value;
  if (role === 'admin-pass') ui.admin.passDraft = event.target.value;
  if (role === 'admin-new-key') ui.admin.newKeyDraft = event.target.value;
  if (role === 'admin-repeat-key') ui.admin.repeatKeyDraft = event.target.value;
  if (role === 'admin-key') ui.admin.keyDraft = event.target.value;
  if (role === 'chat-input') ui.chatDraft = event.target.value;
  if (role === 'hub-input') ui.hubDraft = event.target.value;
  if (role === 'auth-name') ui.authDraft.name = event.target.value;
  if (role === 'auth-password') ui.authDraft.password = event.target.value;
  if (role === 'auth-password2') ui.authDraft.password2 = event.target.value;
  if (role === 'direct-offer') ui.direct.offerDraft = event.target.value;
  if (role === 'direct-answer') ui.direct.answerDraft = event.target.value;
  if (role === 'code-input') {
    const raw = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const formatted = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4, 8)}` : raw;
    event.target.value = formatted;
    ui.codeValue = formatted;
  }
});

document.addEventListener('pointerdown', (event) => {
  if (ui.modal?.type !== 'avatar-preview' || event.button > 0) return;
  const frame = event.target.closest('[data-role="avatar-frame"]');
  const image = frame?.querySelector('[data-role="avatar-editor-image"]');
  if (!frame || !image?.naturalWidth || !image.naturalHeight) return;
  const rotation = ((Math.round(ui.avatarCrop.rotation / 90) % 4) + 4) % 4 * 90;
  const sourceWidth = rotation % 180 ? image.naturalHeight : image.naturalWidth;
  const sourceHeight = rotation % 180 ? image.naturalWidth : image.naturalHeight;
  const sourceSide = Math.min(sourceWidth, sourceHeight) / clamp(ui.avatarCrop.zoom, 1, 3);
  ui.avatarDrag = {
    pointerId: event.pointerId,
    frame,
    startX: event.clientX,
    startY: event.clientY,
    cropX: ui.avatarCrop.x,
    cropY: ui.avatarCrop.y,
    sourceWidth,
    sourceHeight,
    sourceSide,
  };
  frame.classList.add('is-dragging');
  frame.focus({ preventScroll: true });
  try {
    frame.setPointerCapture?.(event.pointerId);
  } catch { /* pointer capture недоступен в некоторых WebView */ }
  event.preventDefault();
});

document.addEventListener('pointermove', (event) => {
  const drag = ui.avatarDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const frameSize = drag.frame.clientWidth;
  const scale = frameSize / drag.sourceSide;
  const rangeX = drag.sourceWidth - drag.sourceSide;
  const rangeY = drag.sourceHeight - drag.sourceSide;
  if (rangeX > 0) ui.avatarCrop.x = clamp(drag.cropX - (event.clientX - drag.startX) / scale / rangeX * 100, 0, 100);
  if (rangeY > 0) ui.avatarCrop.y = clamp(drag.cropY - (event.clientY - drag.startY) / scale / rangeY * 100, 0, 100);
  updateAvatarEditor();
  event.preventDefault();
});

const endAvatarDrag = (event) => {
  if (!ui.avatarDrag || ui.avatarDrag.pointerId !== event.pointerId) return;
  ui.avatarDrag.frame.classList.remove('is-dragging');
  ui.avatarDrag = null;
};
document.addEventListener('pointerup', endAvatarDrag);
document.addEventListener('pointercancel', endAvatarDrag);

document.addEventListener('pointerdown', (event) => {
  const pageOpen = ui.world?.open || ui.modal?.type === 'world';
  if (!pageOpen || ui.world?.screen !== 'explore') return;
  const canvas = event.target.closest?.('[data-role="world-viewport"], [data-role="world-focus-map"]');
  if (!canvas || ![0, 1, 2].includes(event.button)) return;
  worldCameraDrag = {
    pointerId: event.pointerId ?? 0,
    canvas,
    kind: canvas.dataset.role === 'world-focus-map' ? 'map' : 'terrain',
    lastX: event.clientX,
    lastY: event.clientY,
    moved: false,
  };
  canvas.classList.add('is-dragging');
  try {
    canvas.setPointerCapture?.(worldCameraDrag.pointerId);
  } catch { /* pointer capture недоступен в некоторых WebView */ }
  event.preventDefault();
});

document.addEventListener('pointermove', (event) => {
  const drag = worldCameraDrag;
  if (!drag || (event.pointerId ?? 0) !== drag.pointerId) return;
  const pageOpen = ui.world?.open || ui.modal?.type === 'world';
  if (!pageOpen || ui.world?.screen !== 'explore') {
    worldCameraDrag = null;
    drag.canvas.classList.remove('is-dragging');
    return;
  }
  const bounds = drag.canvas.getBoundingClientRect();
  if (!(bounds.width > 0 && bounds.height > 0)) return;
  const deltaX = (event.clientX - drag.lastX) * drag.canvas.width / bounds.width;
  const deltaY = (event.clientY - drag.lastY) * drag.canvas.height / bounds.height;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  if (Math.abs(deltaX) + Math.abs(deltaY) > 2) drag.moved = true;
  if (deltaX || deltaY) {
    if (drag.kind === 'map') {
      const zoom = ui.world.camera.mapZoom ?? 1;
      moveWorldCamera(
        -deltaX * ui.world.model.widthCells / (drag.canvas.width * zoom),
        -deltaY * ui.world.model.depthCells / (drag.canvas.height * zoom),
      );
    } else {
      const pan = cameraPanDelta(drag.canvas.width, drag.canvas.height, deltaX, deltaY, ui.world.camera.zoom);
      moveWorldCamera(pan.x, pan.z);
    }
  }
  event.preventDefault();
});

const endWorldCameraDrag = (event) => {
  if (!worldCameraDrag || (event.pointerId ?? 0) !== worldCameraDrag.pointerId) return;
  const drag = worldCameraDrag;
  drag.canvas.classList.remove('is-dragging');
  worldCameraDrag = null;
  if (drag.moved && drag.kind === 'map') {
    worldMapDragSuppressed = true;
    window.setTimeout(() => { worldMapDragSuppressed = false; }, 280);
  }
};
document.addEventListener('pointerup', endWorldCameraDrag);
document.addEventListener('pointercancel', endWorldCameraDrag);
document.addEventListener('contextmenu', (event) => {
  if (event.target.closest?.('[data-role="world-viewport"], [data-role="world-focus-map"]')) event.preventDefault();
});

document.addEventListener('wheel', (event) => {
  const worldCanvas = event.target.closest?.('[data-role="world-viewport"]');
  const focusMap = event.target.closest?.('[data-role="world-focus-map"]');
  const worldActive = ui.world?.open || ui.modal?.type === 'world';
  if (focusMap && worldActive && ui.world?.screen === 'explore') {
    event.preventDefault();
    changeWorldMapZoom(event.deltaY < 0 ? 1 : -1, focusMap, event.clientX, event.clientY);
    return;
  }
  if (worldCanvas && worldActive && ui.world?.screen === 'explore') {
    event.preventDefault();
    ui.world.camera.zoom = clamp(ui.world.camera.zoom * Math.exp(-event.deltaY * 0.0015), 0.6, 2.5);
    ui.world.camera.zoom = Math.round(ui.world.camera.zoom * 100) / 100;
    scheduleWorldSessionDraw();
    return;
  }
  if (ui.modal?.type !== 'avatar-preview' || !event.target.closest?.('[data-role="avatar-frame"]')) return;
  event.preventDefault();
  ui.avatarCrop.zoom = clamp(ui.avatarCrop.zoom + (event.deltaY < 0 ? 0.1 : -0.1), 1, 3);
  updateAvatarEditor();
}, { passive: false });

document.addEventListener('change', (event) => {
  if (event.target.dataset?.role === 'world-file') {
    const file = event.target.files?.[0];
    if (!file) return;
    /* Импорт бывает двух видов: в слот (с экрана слотов или входа игрока)
       — карта заполняет слот и открывается сразу; в форму («Загрузить seed»
       мастера) — конфиг подставляется в настройки без входа на карту. */
    const targetSlot = ui.world?.importToSlot ? { ...ui.world.importToSlot } : null;
    file.text().then((text) => {
      const imported = JSON.parse(text);
      const config = normalizeWorldConfig(imported?.config ?? imported);
      const layer = ui.world?.layer ?? 'biomes';
      if (targetSlot) {
        writeWorldSlot(targetSlot.role, targetSlot.index, config);
        const session = createWorldSession(config);
        session.open = true;
        session.slot = targetSlot;
        session.mode = targetSlot.role;
        session.tab = targetSlot.role;
        session.layer = layer;
        session.importToSlot = null;
        ui.world = session;
        buildWorldModel();
        renderWorldPage({ focus: false });
        playSound('success');
        toast(`Карта ${config.seed} заняла слот ${targetSlot.index + 1}.`);
        return;
      }
      const session = createWorldSession(config);
      session.open = true;
      session.screen = 'setup';
      session.slot = ui.world?.slot ?? null;
      session.mode = ui.world?.mode ?? 'master';
      session.tab = ui.world?.tab ?? 'master';
      session.layer = layer;
      ui.world = session;
      renderWorldPage({ focus: false });
      toast(`Параметры мира загружены: ${config.seed}.`);
    }).catch(() => toast('Файл мира повреждён или имеет неверный формат.', 'error'));
    event.target.value = '';
    return;
  }
  if (event.target.dataset?.worldSetting) {
    refreshWorldPreview();
    return;
  }

  const key = event.target.dataset?.setting;
  if (!key) return;

  /* Уведомления телефона — единственная настройка, у которой есть разрешение
     браузера: его спрашивают только по действию игрока, прямо здесь, и только
     при включении. Не разрешили — переключатель возвращается на место. */
  if (key === 'notify') {
    const wanted = event.target.checked;
    (async () => {
      const result = wanted ? await update.setNotify(true, { ask: true }) : await update.setNotify(false);
      const enabled = result === 'granted';
      store.updateSettings({ notify: enabled });
      if (wanted && !enabled) {
        toast(
          result === 'unsupported'
            ? 'Уведомления телефона работают в установленном приложении по https.'
            : 'Браузер не разрешил уведомления — новость покажет строка под шапкой.',
          'error',
        );
      }
      renderModal({ focus: false });
    })();
    return;
  }

  const value = event.target.type === 'checkbox' ? event.target.checked : Number(event.target.value);
  /* Перед выключением даём последний короткий отклик, пока звук ещё включён. */
  if (key === 'sound' && !value) playSound('toggle-off');
  store.updateSettings({ [key]: value });
  applySettings();
  if (key === 'sound' && value) playSound('toggle-on');
  else if (key === 'volume') playSound('volume-change');
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
    ui.avatarCrop = { x: 50, y: 50, zoom: 1, rotation: 0 };
    ui.avatarDrag = null;
    ui.modal = { type: 'avatar-preview' };
    playSound('open');
    renderModal();
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Не удалось обработать картинку.', 'error');
  }
};

const actions = {
  'open-world': () => openWorldPage({ slots: true }),

  'world-exit': () => closeWorldPage(),

  'world-slots': () => {
    if (!ui.world?.open) return;
    ui.world.screen = 'slots';
    ui.world.slot = null;
    ui.world.importToSlot = null;
    renderWorldPage({ focus: false });
  },

  'world-slot-tab': (el) => {
    const tab = el.dataset.tab;
    if (!ui.world || !WORLD_SLOT_ROLES.includes(tab)) return;
    ui.world.tab = tab;
    playSound('select');
    renderWorldPage({ focus: false });
  },

  'world-slot-create': (el) => {
    if (!ui.world?.open) return;
    const index = Number(el.dataset.slotIndex);
    if (!Number.isInteger(index) || index < 0 || index >= WORLD_SLOT_COUNT) return;
    const role = ui.world.tab;
    const session = createWorldSession(null);
    /* Игрок не генерирует карту — он входит в чужую: поле seed пустое,
       пока мастер не назвал свой. Мастер начинает со случайного seed. */
    if (role === 'player') session.config.seed = '';
    session.open = true;
    session.screen = 'setup';
    session.tab = role;
    session.mode = role;
    session.slot = { role, index };
    session.layer = ui.world.layer ?? 'biomes';
    ui.world = session;
    playSound('open');
    renderWorldPage({ focus: true });
  },

  'world-slot-open': (el) => {
    if (!ui.world?.open) return;
    const index = Number(el.dataset.slotIndex);
    const role = ui.world.tab;
    const entry = loadWorldSlots()[role]?.[index];
    if (!entry || !Number.isInteger(index)) return;
    const session = createWorldSession(entry.config);
    session.open = true;
    session.tab = role;
    session.mode = role;
    session.slot = { role, index };
    session.layer = ui.world.layer ?? 'biomes';
    ui.world = session;
    buildWorldModel();
    playSound('open');
    renderWorldPage({ focus: false });
  },

  'world-slot-clear': (el) => {
    if (!ui.world?.open) return;
    const index = Number(el.dataset.slotIndex);
    const role = ui.world.tab;
    if (!Number.isInteger(index)) return;
    removeWorldSlot(role, index);
    renderWorldPage({ focus: false });
    toast(`Слот ${index + 1} очищен.`);
  },

  'world-slot-import': (el) => {
    if (!ui.world?.open) return;
    const index = Number(el.dataset.slotIndex);
    const role = ui.world.slot?.role ?? ui.world.tab;
    if (!Number.isInteger(index) || index < 0 || index >= WORLD_SLOT_COUNT) return;
    ui.world.importToSlot = { role, index };
    worldRoot()?.querySelector('[data-role="world-file"]')?.click();
  },

  'world-fmg-open': () => {
    if (!HAS_AZGAAR_EDITOR || !ui.world?.open || ui.world.mode === 'player') return;
    const root = worldPageRoot();
    const worldApp = root?.querySelector('.world-app');
    let overlay = root?.querySelector('[data-role="world-fmg-overlay"]');
    if (!root || !worldApp) return;
    /* Seed из поля формы — источник правды на экране создания: редактор
       обязан получить ровно ту строку, которую видит игрок. */
    const typed = root.querySelector('[data-world-setting="seed"]')?.value.trim();
    if (typed) ui.world.config.seed = typed;
    if (!overlay) {
      ui.world.fmgSeed = ui.world.model?.seed ?? ui.world.config.seed;
      const holder = document.createElement('div');
      holder.innerHTML = worldFmgOverlayHtml(ui.world, ui.world.fmgSeed);
      overlay = holder.firstElementChild;
      if (!overlay) return;
      root.append(overlay);
    }
    overlay.hidden = false;
    worldApp.setAttribute('inert', '');
    overlay.querySelector('[data-action="world-fmg-back"]')?.focus({ preventScroll: true });
  },

  'world-fmg-back': () => {
    const root = worldPageRoot();
    const overlay = root?.querySelector('[data-role="world-fmg-overlay"]');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    root.querySelector('.world-app')?.removeAttribute('inert');
    root.querySelector('[data-action="world-fmg-open"]')?.focus({ preventScroll: true });
  },

  'world-random-seed': () => {
    const field = worldRoot()?.querySelector('[data-world-setting="seed"]');
    if (!field || ui.world?.screen !== 'setup') return;
    field.value = worldSeed();
    refreshWorldPreview();
  },

  'world-layer': (el) => {
    const layer = el.dataset.layer;
    if (!WORLD_MAP_LAYERS.some(([value]) => value === layer) || !ui.world) return;
    ui.world.layer = layer;
    for (const button of worldRoot()?.querySelectorAll('[data-action="world-layer"]') ?? []) {
      const active = button.dataset.layer === layer;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    const legend = worldRoot()?.querySelector('[data-role="world-legend"]');
    if (legend) legend.outerHTML = worldMapLegendHtml(layer);
    scheduleWorldSessionDraw();
  },

  'world-generate': () => {
    const session = ui.world;
    if (!session?.open) return;
    const typed = worldRoot()?.querySelector('[data-world-setting="seed"]')?.value.trim() || '';
    const player = session.mode === 'player';
    /* Игрок входит по названному мастером seed — пустое поле не обманываем
       случайным миром. Мастер со случайным seed наоборот: пусто → новый. */
    if (player && !typed) {
      playSound('error');
      toast('Укажите seed карты, которую ведёт мастер.', 'error');
      return;
    }
    const config = normalizeWorldConfig({ ...session.config, seed: typed });
    session.config = config;
    if (!session.slot) session.slot = { role: session.mode, index: 0 };
    writeWorldSlot(session.slot.role, session.slot.index, config);
    buildWorldModel();
    playSound('success');
    renderWorldPage({ focus: false });
    toast(
      player
        ? `Вы вошли в карту ${config.seed}. Функции игрока на карте урезаны.`
        : `Карта ${config.seed} заняла слот ${session.slot.index + 1}.`,
    );
  },

  'world-new': () => {
    const session = ui.world;
    if (!session?.open || session.mode !== 'master') return;
    const next = createWorldSession({ ...session.config, seed: worldSeed() });
    next.open = true;
    next.tab = session.tab;
    next.mode = 'master';
    next.slot = session.slot ?? null;
    next.layer = session.layer ?? 'biomes';
    if (next.slot) writeWorldSlot(next.slot.role, next.slot.index, next.config);
    ui.world = next;
    buildWorldModel();
    renderWorldPage({ focus: false });
    toast(`Новый мир: ${next.config.seed}.`);
  },

  'world-edit-config': () => {
    const session = ui.world;
    if (!session?.open || session.mode !== 'master') return;
    session.screen = 'setup';
    renderWorldPage({ focus: true });
  },

  'world-map-zoom': (el, event) => {
    const canvas = worldRoot()?.querySelector('[data-role="world-focus-map"]');
    const onMap = event.target.closest?.('[data-role="world-focus-map"]');
    changeWorldMapZoom(Number(el.dataset.step) || 0, onMap ? canvas : null, onMap ? event.clientX : null, onMap ? event.clientY : null);
  },

  'world-clear-selection': () => {
    if (!ui.world) return;
    ui.world.selectedStateId = null;
    const node = worldRoot()?.querySelector('[data-role="world-state-details"]');
    if (node) node.innerHTML = worldStateDetailsHtml(ui.world.model, null);
  },

  'world-save': () => {
    const session = ui.world;
    if (!session?.open || session.mode !== 'master') return;
    let ok = false;
    try {
      const payload = { version: 1, savedAt: Date.now(), config: session.config };
      localStorage.setItem('mir-world-last-save', JSON.stringify(payload));
      ok = true;
    } catch { /* запасной ключ может быть недоступен — пробуем слот */ }
    if (session.slot && writeWorldSlot(session.slot.role, session.slot.index, session.config)) ok = true;
    if (ok) toast('Мир сохранён на этом устройстве.');
    else toast('Не удалось сохранить мир в браузере. Используйте «Экспорт».', 'error');
  },

  'world-load': () => {
    const session = ui.world;
    if (!session?.open || session.mode !== 'master') return;
    /* «Загрузить seed» мастера подставляет конфиг в форму создания,
       а не открывает карту: сначала проверяем seed, потом создаём. */
    session.importToSlot = null;
    try {
      const saved = JSON.parse(localStorage.getItem('mir-world-last-save') || 'null');
      if (saved?.config) {
        session.config = normalizeWorldConfig(saved.config);
        session.screen = 'setup';
        renderWorldPage({ focus: false });
        toast(`Сохранённый seed загружен: ${session.config.seed}.`);
        return;
      }
    } catch { /* повреждённый локальный слот не блокирует импорт файла */ }
    worldRoot()?.querySelector('[data-role="world-file"]')?.click();
  },

  'world-export': () => {
    const session = ui.world;
    if (!session?.open || session.mode !== 'master') return;
    try {
      const payload = JSON.stringify({
        format: 'MIR world seed',
        version: 1,
        exportedAt: new Date().toISOString(),
        config: session.config,
      }, null, 2);
      const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${session.config.seed.replace(/[^a-z0-9-]/gi, '_')}.mir-world.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast('Seed и параметры мира экспортированы.');
    } catch {
      toast('Экспорт недоступен в этом браузере.', 'error');
    }
  },

  'world-export-image': () => {
    if (!ui.world?.open || ui.world.mode !== 'master') return;
    const canvas = worldRoot()?.querySelector('[data-role="world-focus-map"]');
    try {
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${ui.world.config.seed.replace(/[^a-z0-9-]/gi, '_')}-atlas.png`;
      link.click();
      toast('Снимок атласа сохранён.');
    } catch {
      toast('Не удалось сделать снимок карты.', 'error');
    }
  },

  'world-move': (el) => {
    const worldWidth = ui.world?.model?.widthCells ?? 24;
    const step = Math.max(3, Math.round(worldWidth / (38 * (ui.world?.camera?.mapZoom ?? 1))));
    moveWorldCamera((Number(el.dataset.dx) || 0) * step, (Number(el.dataset.dz) || 0) * step);
  },

  'world-zoom': (el) => changeWorldZoom(Number(el.dataset.step) || 0),
  'world-camera-home': resetWorldCamera,

  'open-auth': () => {
    ui.authTab = 'login';
    openModal('auth');
  },

  'auth-tab': (el) => {
    playSound('select');
    ui.authTab = el.dataset.tab;
    renderModal();
  },

  'open-profile': () => openModal('profile'),
  'open-settings': () => openModal('settings'),
  /* Проверку делает модуль обновлений (src/data/update.js), а текст состояния
     рисуют настройки из его ответа: так на телефоне, где приложение не
     закрывают, проверка не заканчивается ничем видимым. */
  'check-update': async () => {
    const state = await update.check({ manual: true });
    if (state.phase === 'error') playSound('error');
    else if (state.available) playSound('success');
  },

  'update-apply': () => {
    playSound('success');
    update.apply();
  },

  'update-dismiss': () => update.dismiss(),
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
    p2p.stop();
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

  /* --- панель админа --- */

  'admin-tap': (el) => {
    if (registerAdminTap(el)) openAdminGate();
  },

  'admin-tab': (el) => {
    playSound('select');
    ui.admin.tab = el.dataset.tab;
    ui.admin.openId = null;
    renderModal({ focus: false });
  },

  'admin-go': (el) => {
    playSound('select');
    const tab = el.dataset.tab;
    if (!['overview', 'players', 'requests', 'events', 'system'].includes(tab)) return;
    ui.admin.tab = tab;
    ui.admin.openId = null;
    if (tab === 'players') {
      ui.admin.filter = ['online', 'active', 'today', 'offline', 'banned'].includes(el.dataset.filter) ? el.dataset.filter : 'all';
      ui.admin.sort = ['name', 'seen', 'created'].includes(el.dataset.sort) ? el.dataset.sort : 'name';
      ui.admin.query = '';
      ui.admin.limit = 60;
    }
    renderModal();
  },

  'admin-open': (el) => {
    ui.admin.openId = el.dataset.id;
    ui.admin.nameDraft = '';
    ui.admin.passDraft = '';
    ui.admin.banReason = '';
    renderModal();
  },

  'admin-back': () => {
    playSound('back');
    ui.admin.openId = null;
    ui.admin.banReason = '';
    renderModal();
  },

  'admin-filter': (el) => {
    ui.admin.filter = el.dataset.value;
    ui.admin.limit = 60;
    renderModal({ focus: false });
  },

  'admin-sort': (el) => {
    ui.admin.sort = el.dataset.value;
    ui.admin.limit = 60;
    renderModal({ focus: false });
  },

  'admin-event-filter': (el) => {
    ui.admin.eventFilter = el.dataset.value;
    renderModal({ focus: false });
  },

  'admin-range': (el) => {
    if (!['7', '14', '30'].includes(el.dataset.value)) return;
    ui.admin.range = el.dataset.value;
    renderModal({ focus: false });
  },

  'admin-more': () => {
    ui.admin.limit += 60;
    renderModal({ focus: false });
  },

  'admin-copy': async (el) => {
    const ok = await copyText(el.dataset.value);
    toast(ok ? `${el.dataset.label}: ${el.dataset.value}` : 'Не получилось скопировать — выделите вручную.', ok ? 'ok' : 'error');
  },

  'admin-refresh': () => refreshAdmin(),
  'admin-export': () => adminExport(),

  'admin-lock': () => {
    playSound('back');
    store.adminLogout();
    ui.admin = adminState();
    renderModal();
    toast('Панель заблокирована — ключ спросят заново.');
  },

  'admin-kick': (el) =>
    runAdminAction(() => store.adminUserAction(el.dataset.id, 'kick'), 'Игрок отключён от хаба.'),

  'admin-regen-code': (el) =>
    runAdminAction(
      () => store.adminUserAction(el.dataset.id, 'regen-code'),
      'Выдан новый код-приглашение — старый больше не действует.',
    ),

  'admin-avatar-clear': (el) =>
    runAdminAction(() => store.adminUserAction(el.dataset.id, 'avatar', { avatar: null }), 'Аватарка убрана.'),

  'admin-unlink': (el) =>
    runAdminAction(
      () => store.adminUserAction(el.dataset.id, 'unlink', { friendId: el.dataset.friend }),
      'Дружба разорвана.',
    ),

  'admin-unlink-all': (el) =>
    runAdminAction(() => store.adminUserAction(el.dataset.id, 'unlink-all'), 'Все дружбы разорваны.'),

  'admin-unban': (el) =>
    runAdminAction(() => store.adminUnban(el.dataset.id), 'Блокировка снята — игрок может войти.'),

  'admin-registration': (el) =>
    runAdminAction(
      () => store.adminSetRegistration(el.dataset.open === '1'),
      el.dataset.open === '1' ? 'Регистрация открыта.' : 'Регистрация закрыта — новые аккаунты не создаются.',
    ),

  'admin-events-clear': () => {
    ui.confirm = {
      title: 'Очистить журнал?',
      text: 'Записи о регистрациях, входах и действиях панели исчезнут. На аккаунты, дружбу и заявки это не влияет.',
      label: 'Очистить',
      action: 'admin-events-clear-run',
      id: '',
    };
    ui.modal = { type: 'confirm' };
    renderModal();
  },

  'admin-events-clear-run': async () => {
    try {
      await store.adminClearEvents();
      ui.modal = { type: 'admin' };
      renderModal();
      await refreshAdmin();
      toast('Журнал очищен.');
    } catch (error) {
      playSound('error');
      toast(error instanceof Error ? error.message : 'Не получилось очистить журнал.', 'error');
    }
  },

  'admin-drop-request': (el) =>
    runAdminAction(() => store.adminRemoveRequest(el.dataset.id), 'Заявка удалена.'),

  'admin-delete': (el) => {
    const user = ui.admin.data?.users.find((item) => item.id === el.dataset.id);
    if (!user) return;
    ui.confirm = {
      title: 'Удалить аккаунт?',
      text: `${user.name} пропадёт совсем: вход перестанет работать, друзья и заявки исчезнут. Вернуть аккаунт не получится.`,
      label: 'Удалить',
      action: 'admin-delete-run',
      id: user.id,
    };
    ui.modal = { type: 'confirm' };
    renderModal();
  },

  'admin-delete-run': async (el) => {
    try {
      const name = ui.admin.data?.users.find((item) => item.id === el.dataset.id)?.name ?? 'Аккаунт';
      await store.adminUserAction(el.dataset.id, 'delete');
      ui.admin.openId = null;
      ui.modal = { type: 'admin' };
      renderModal();
      await refreshAdmin();
      toast(`${name} удалён.`);
    } catch (error) {
      playSound('error');
      toast(error instanceof Error ? error.message : 'Не получилось удалить.', 'error');
    }
  },

  'admin-forget-key': () => {
    ui.confirm = {
      title: 'Вернуть заводской ключ?',
      text: `Панель снова будет открываться ключом ${store.DEFAULT_ADMIN_KEY} — то есть каждым, кто читал инструкцию. Меняйте ключ, если игра не в одиночку.`,
      label: 'Вернуть',
      action: 'admin-forget-key-run',
      id: '',
    };
    ui.modal = { type: 'confirm' };
    renderModal();
  },

  'admin-forget-key-run': async () => {
    await store.adminResetKey();
    ui.modal = { type: 'admin' };
    renderModal({ focus: false });
    toast('Заводской ключ возвращён.');
  },

  'admin-wipe': () => {
    ui.confirm = {
      title: 'Очистить локальные аккаунты?',
      text: `Все аккаунты этого браузера (${store.localDataInfo().accounts}) исчезнут вместе с заявками и дружбой. На хабе ничего не изменится.`,
      label: 'Очистить',
      action: 'admin-wipe-run',
      id: '',
    };
    ui.modal = { type: 'confirm' };
    renderModal();
  },

  'admin-wipe-run': async () => {
    await store.adminWipeLocal();
    ui.modal = { type: 'admin' };
    renderModal();
    await refreshAdmin();
    toast('Локальные аккаунты очищены.');
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
  'avatar-zoom-out': () => {
    ui.avatarCrop.zoom = clamp(Math.round((ui.avatarCrop.zoom - 0.1) * 20) / 20, 1, 3);
    updateAvatarEditor();
  },
  'avatar-zoom-in': () => {
    ui.avatarCrop.zoom = clamp(Math.round((ui.avatarCrop.zoom + 0.1) * 20) / 20, 1, 3);
    updateAvatarEditor();
  },
  'avatar-rotate-left': () => {
    ui.avatarCrop.rotation = (ui.avatarCrop.rotation + 270) % 360;
    updateAvatarEditor();
  },
  'avatar-reset': () => {
    ui.avatarCrop = { x: 50, y: 50, zoom: 1, rotation: 0 };
    updateAvatarEditor();
  },

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

const ACTIONS_WITH_OWN_SOUND = new Set([
  'open-auth', 'open-profile', 'open-settings', 'open-add-friend', 'open-friend',
  'open-direct', 'open-hub', 'open-world', 'world-generate', 'world-slot-tab', 'world-slot-open',
  'close-modal', 'admin-tap', 'admin-tab', 'admin-go',
  'admin-back', 'admin-lock', 'auth-tab',
]);

document.addEventListener('click', (event) => {
  const mapCanvas = event.target.closest?.('canvas[data-role="world-map"], canvas[data-role="world-focus-map"]');
  const worldActive = ui.world?.open || ui.modal?.type === 'world';
  if (mapCanvas && worldActive && ui.world?.model) {
    if (worldMapDragSuppressed) return;
    const overview = mapCanvas.dataset.role === 'world-map';
    const point = worldMapPointAt(mapCanvas, ui.world.model, ui.world.camera, event.clientX, event.clientY, overview);
    if (point) {
      ui.world.camera.x = point.x;
      ui.world.camera.z = point.z;
      const state = ui.world.model.stateAtNormalized(point.u, point.v);
      ui.world.selectedStateId = state?.id ?? null;
      const details = worldRoot()?.querySelector('[data-role="world-state-details"]');
      if (details) details.innerHTML = worldStateDetailsHtml(ui.world.model, ui.world.selectedStateId);
      mapCanvas.focus({ preventScroll: true });
      scheduleWorldSessionDraw();
    }
    return;
  }

  const button = event.target.closest('button:not([disabled])');
  const actionElement = event.target.closest('[data-action]');
  const actionName = actionElement?.dataset.action;
  if (button && !ACTIONS_WITH_OWN_SOUND.has(actionName)) playSound('click');
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

/* Служебный вход с клавиатуры: Ctrl+Shift+Alt+A. Проверяем по `code`,
   чтобы сочетание работало и на русской раскладке. */
document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey && event.shiftKey && event.altKey && event.code === 'KeyA')) return;
  event.preventDefault();
  openAdminGate();
});

document.addEventListener('keydown', (event) => {
  if (ui.world?.open) {
    const fmgOverlay = worldPageRoot()?.querySelector('[data-role="world-fmg-overlay"]');
    if (fmgOverlay && !fmgOverlay.hidden) {
      if (event.key === 'Escape') {
        event.preventDefault();
        actions['world-fmg-back']();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeWorldPage();
      return;
    }
  }
  const worldActive = ui.world?.open || ui.modal?.type === 'world';
  if (worldActive && ui.world?.screen === 'explore') {
    const typing = event.target.matches?.('input, textarea, select, [contenteditable="true"]');
    if (!typing) {
      const moves = {
        ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
        KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
      };
      const movement = moves[event.key] ?? moves[event.code];
      if (movement) {
        event.preventDefault();
        const step = Math.max(3, Math.round(ui.world.model.widthCells / (120 * (ui.world.camera.mapZoom ?? 1)))) * (event.shiftKey ? 4 : 1);
        moveWorldCamera(movement[0] * step, movement[1] * step);
        return;
      }
    }
  }
  if (!ui.modal) return;
  if (ui.modal.type === 'avatar-preview' && event.target.matches?.('[data-role="avatar-frame"]')) {
    const step = event.shiftKey ? 5 : 1;
    if (event.key === 'ArrowLeft') ui.avatarCrop.x = clamp(ui.avatarCrop.x - step, 0, 100);
    else if (event.key === 'ArrowRight') ui.avatarCrop.x = clamp(ui.avatarCrop.x + step, 0, 100);
    else if (event.key === 'ArrowUp') ui.avatarCrop.y = clamp(ui.avatarCrop.y - step, 0, 100);
    else if (event.key === 'ArrowDown') ui.avatarCrop.y = clamp(ui.avatarCrop.y + step, 0, 100);
    else if (event.key === 'r' || event.key === 'R') ui.avatarCrop.rotation = (ui.avatarCrop.rotation + 270) % 360;
    else return;
    event.preventDefault();
    updateAvatarEditor();
    return;
  }
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

setInterval(() => store.heartbeat(), 30_000);
/* Раз в полминуты обновляем присутствие, но сравниваем разметку: если данные
   не изменились, ни панели, ни открытые формы не пересоздаются. */
setInterval(renderAfterStoreChange, 30_000);
/* Открытая админ-панель сама обновляет серверный снимок, но только пока
   вкладка видима и ключ ещё активен: мониторинг не расходует запросы в фоне. */
setInterval(() => {
  if (
    document.visibilityState === 'visible' &&
    ui.modal?.type === 'admin' &&
    store.adminKey() &&
    !ui.admin.busy
  ) refreshAdmin();
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
  p2p.stop();
  p2pRunning = false;
});

/* PWA и обновления: по https/localhost регистрируем service worker — меню
   становится устанавливаемым приложением и работает офлайн. С file://
   (mir.html) и на голом http по локальной сети браузеры SW не разрешают, но
   проверка новой сборки по серверу работает и там. Модуль обновлений сам
   решает, что доступно на странице, и сам никогда не перезагружает игру:
   обновление применяет игрок (кнопка «Обновить») либо следующий запуск. */
update.start();
restoreNotifications();

render();
if (window.location.hash.toLowerCase() === '#play') openWorldPage({ history: false });
/* На старте сперва проверяем хаб; только после этого открываем аккаунты.
   Если сеть недоступна, store включает локальный офлайн-резерв. */
const initializeConnection = async () => {
  let mode = 'local';
  try {
    mode = await store.initBackend();
  } catch {
    /* Проверка не должна оставлять страницу заблокированной. */
    mode = store.backendMode?.() ?? 'local';
  }
  backendReady = store.isBackendInitialized?.() ?? true;
  renderRegions();
  if (ui.modal) renderModal({ focus: false });
  store.heartbeat();
  if (mode === 'hub') toast(`Подключено к общему хабу: ${store.hubHost()}.`);
  syncP2P();
  /* Ссылка с `#admin` (или `?admin=1`) открывает панель сразу: так в неё
     удобно заходить на телефоне, где нет клавиатуры для сочетания клавиш.
     Ключ всё равно спросят. */
  if (adminFromUrl()) openAdminGate();
};
initializeConnection();
