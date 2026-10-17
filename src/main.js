import './style.css';
import * as store from './data/store.js';
import * as p2p from './data/p2p.js';
import * as lobby from './data/lobby.js';
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
import { motionOff, motionQuery } from './ui/motion.js';
import { settingsModalHtml } from './ui/settings.js';

/* Название игры. Разбито на две строки — так оно читается и в шапке, и в заголовке. */
const TITLE = { lead: 'The civilization', tail: 'of the sages' };
const TITLE_FULL = `${TITLE.lead} ${TITLE.tail}`;
/* Версию подставляет сборщик из package.json (define в vite.config.js) —
   один источник правды вместо четырёх файлов, которые надо не забыть
   обновить вместе. Запасное значение нужно лишь для чтения модуля без
   сборки (например, из тестов). */
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
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
    return `<span class="avatar avatar--img${cls ? ` ${cls}` : ''}${off}"><img src="${escapeHtml(user.avatar)}" alt="" /></span>`;
  const hue = nameHue(user.nameKey);
  return `<span class="avatar${cls ? ` ${cls}` : ''}${off}" style="background:hsl(${hue} 26% 30%);color:hsl(${hue} 45% 87%)" aria-hidden="true">${escapeHtml(user.name.slice(0, 2).toUpperCase())}</span>`;
};

const avatarEl = (user, cls = '') => {
  const offline = store.presenceOf(user) === 'offline';
  const avatar = user.avatar ?? null;
  /* В ключе — и имя: без него переименование не меняло инициалы и цвет
     аватарки-заглушки, кеш продолжал отдавать старые буквы. */
  const key = `${user.id}|${cls}|${offline ? 'off' : 'on'}|${user.name ?? ''}|${user.nameKey ?? ''}`;
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
  tab: 'overview', // overview | players | requests | files | events | system
  query: '',
  requestQuery: '',
  eventQuery: '',
  fileQuery: '',
  fileFilter: 'all', // all | config | data | log | custom
  filePath: '',
  fileDraftPath: '',
  fileContent: '',
  fileLoadedPath: '',
  fileCreating: false,
  fileDirty: false,
  fileMeta: null,
  motdDraft: null,
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

/* Черновик окна «Партии». Поля хранятся здесь, а не в разметке: окно
   перерисовывается при каждом обновлении состава (живой канал), и
   введённое название партии без черновика пропадало бы на полуслове. */
const partyDraft = () => ({
  tab: 'create', // create | join — когда своей партии ещё нет
  title: '',
  seed: lobby.randomPartySeed(),
  size: `${lobby.PARTY_SIZES[0][0]}x${lobby.PARTY_SIZES[0][1]}`,
  code: '',
  busy: false,
});

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
  /* Партии (комнаты для игры): черновики полей создания и входа по коду. */
  party: partyDraft(),
};

let backendReady = store.isBackendInitialized?.() ?? false;

/* Разметка, которая сейчас лежит в слое окон. Сравниваем строки между
   собой, а не с `innerHTML`: окно с аватаркой — это десятки килобайт
   base64, и сериализация DOM на каждое обновление данных была заметной
   работой впустую. */
let renderedModalHtml = '';

const overlayRoot = () => document.querySelector('#overlay-root');

/* ---------- нижняя панель: уезжает при прокрутке ------------------
   Механика ленты Telegram: листаешь вниз — панель прячется и не закрывает
   содержимое, листаешь вверх или возвращаешься к началу — выезжает обратно.
   Движение здесь решает код, а не CSS, поэтому на каждом событии спрашиваем
   `motionOff()`: тумблер «Анимации» и системная настройка обязаны гасить и
   его (см. src/ui/motion.js). За открытым окном панель не прячем — она и так
   под затемнением, а после закрытия должна быть на месте. */
const MOTION_QUERY = motionQuery();
const TAB_HIDE_AFTER = 120; // у самого верха панель нужна: там друзья
const TAB_SCROLL_STEP = 8; // дрожание пальца за прокрутку не считаем
let tabbarHidden = false;
/* Последняя позиция — отдельно у каждого вертикального скроллера:
   страница и сцена листаются независимо, и общая «прошлая позиция»
   принимала переход между ними за резкий рывок. */
const tabbarScrollY = new Map();

const setTabbarHidden = (hidden) => {
  if (tabbarHidden === hidden) return;
  tabbarHidden = hidden;
  document.querySelector('.sidenav')?.classList.toggle('sidenav--hidden', hidden);
};

document.addEventListener(
  'scroll',
  (event) => {
    if (ui.modal || motionOff(MOTION_QUERY)) {
      setTabbarHidden(false);
      return;
    }
    /* Панель прячет только прокрутка основного содержимого: страницы
       или сцены. Горизонтальная лента друзей и внутренние списки сюда
       попадали со своим `scrollTop` (у ленты он всегда 0) и дёргали
       панель, хотя по вертикали игрок ничего не листал. */
    const target = event.target;
    const scroller =
      target === document
        ? 'document'
        : target instanceof Element && target.classList.contains('stage')
          ? 'stage'
          : null;
    if (!scroller) return;
    const y = scroller === 'document' ? window.scrollY : target.scrollTop;
    const step = y - (tabbarScrollY.get(scroller) ?? 0);
    tabbarScrollY.set(scroller, y);
    if (Math.abs(step) < TAB_SCROLL_STEP) return;
    setTabbarHidden(step > 0 && y > TAB_HIDE_AFTER);
  },
  /* Прокрутка не всплывает, поэтому слушаем в фазе перехвата: так видно и
     прокрутку страницы, и прокрутку сцены внутри неё. */
  { capture: true, passive: true },
);

const openModal = (type, data = null) => {
  ui.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  ui.modal = { type, data };
  setTabbarHidden(false);
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
  ui.codeValue = '';
  ui.chatDraft = '';
  ui.authDraft = { name: '', password: '', password2: '' };
  ui.party = partyDraft();
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
        <span class="dialog__mark" aria-hidden="true">${icon('sigil')}</span>
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
    return `<p class="form-note form-note--warn">Браузер не разрешает сохранять данные на этой странице — аккаунт исчезнет после перезагрузки. Откройте The civilization of the sages по ссылке или используйте Windows-файл MIR-Setup.exe.</p>`;
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

        <div class="dialog__actions">
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
            <img class="avatar-editor__img" data-role="avatar-editor-image" src="${escapeHtml(ui.pendingAvatar)}"
                 alt="Исходная фотография для кадрирования" draggable="false" />
            <span class="avatar-editor__grid" aria-hidden="true"></span>
            <span class="avatar-editor__center" aria-hidden="true"></span>
          </div>
          <p class="avatar-editor__tip" id="avatar-editor-help">Перетащите фото, чтобы выбрать кадр. Колёсико мыши меняет масштаб.</p>
        </div>

        <aside class="avatar-editor__panel" aria-label="Настройки кадрирования">
          <div class="avatar-editor__sample">
            <div class="avatar-editor__sample-frame" data-role="avatar-sample-frame">
              <img class="avatar-editor__sample-img" data-role="avatar-sample-image" src="${escapeHtml(ui.pendingAvatar)}"
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
    <small class="chat__meta">${CLOCK.format(new Date(message.at))}${message.via === 'relay' ? ' · через хаб' : message.via === 'failed' ? ' · не доставлено' : ''}</small>
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

/* --- Окно «Партии»: комнаты для игры ---------------------------
   Партия — это комната на общем хабе. Мастер создаёт её, получает код
   и зовёт друзей; друг принимает приглашение (оно приходит живым
   каналом сразу) или входит по коду сам. Состав, присутствие и
   приглашения присылает хаб (src/data/lobby.js), поэтому окно ничего
   не «догадывает» и не опрашивает сервер само: что пришло, то и рисуем.

   Без общего хаба партий не бывает — комната живёт на сервере, который
   видят все игроки, а не в одном браузере. Локальный режим говорит об
   этом прямо и предлагает подключить хаб: пустая комната с неработающей
   кнопкой была бы обманом. */

const PARTY_CHANNEL = {
  online: { label: 'Канал партий подключён', modifier: 'live' },
  connecting: { label: 'Подключаемся к каналу партий…', modifier: 'warn' },
  offline: { label: 'Канал партий не отвечает', modifier: 'off' },
  idle: { label: 'Канал партий закрыт', modifier: 'off' },
};

const partyChannelHtml = (state) => {
  const view = PARTY_CHANNEL[state.status] ?? PARTY_CHANNEL.idle;
  const ms = state.status === 'online' && Number.isFinite(state.rtt) ? ` · ${state.rtt} мс` : '';
  return `<span class="link-state link-state--${view.modifier}">
      <span class="dot dot--${view.modifier}" aria-hidden="true"></span>${view.label}${ms}
    </span>`;
};

const partySizeLabel = (width, height) =>
  lobby.PARTY_SIZES.find(([w, h]) => w === Number(width) && h === Number(height))?.[2]
  ?? `${Number(width)} × ${Number(height)}`;

const partySizeValue = (width, height) => `${Number(width)}x${Number(height)}`;

/* Имя комнаты важнее кода, но без имени показываем код: пустая строка в
   шапке читалась бы как ошибка, а код всё равно виден рядом. */
const partyName = (room) => String(room?.title ?? '').trim() || `Партия ${room?.code ?? ''}`;

/* Участник партии приходит из хаба коротким видом (id, имя, в сети,
   мастер). Аватарку берём из кеша аккаунтов, если человек есть в списке
   (друг или я), иначе рисуем инициалы: войти по коду может и чужой.
   Присутствие — из живого канала партии: хаб знает про сокет участника
   точнее, чем кеш друзей (друг мог открыть приложение на другом устройстве). */
const partyMemberUser = (member) => {
  const known = store.getUser(member.id);
  const base = known ?? {
    id: member.id,
    name: member.name,
    nameKey: String(member.name || '').toLowerCase(),
    avatar: null,
  };
  return { ...base, online: !!member.online, seenAt: member.online ? Date.now() : 0 };
};

const partyMemberHtml = (member, canKick) => `
  <div class="member${member.online ? ' member--live' : ' member--off'}">
    ${avatarEl(partyMemberUser(member), 'avatar--sm')}
    <span class="member__text">
      <strong class="member__name" translate="no">${escapeHtml(member.name)}</strong>
      <small class="member__state">${
        member.master ? 'Мастер партии' : member.online ? 'В комнате' : 'Не в сети'
      }</small>
    </span>
    ${
      member.master
        ? `<span class="member__mark" title="Мастер партии" aria-label="Мастер партии">${icon('crown', 'icon--xs')}</span>`
        : ''
    }
    ${
      canKick && !member.master
        ? `<button class="icon-button icon-button--sm icon-button--danger" type="button" data-action="party-kick" data-id="${member.id}" aria-label="Исключить ${escapeHtml(member.name)} из партии" title="Исключить">
             ${icon('x')}
           </button>`
        : ''
    }
    <span class="dot dot--${member.online ? 'live' : 'off'}" aria-hidden="true"></span>
  </div>`;

/* Кого можно позвать: друзья, которых в комнате ещё нет. Про уже
   приглашённых хаб отвечает списком `invited` — подпись честно говорит,
   что приглашение ушло, и предлагает позвать ещё раз (оно живёт 15 минут). */
const partyInviteRowHtml = (friend, pending) => `
  <div class="member">
    ${avatarEl(friend, 'avatar--sm')}
    <span class="member__text">
      <strong class="member__name" translate="no">${escapeHtml(friend.name)}</strong>
      <small class="member__state">${PRESENCE[store.presenceOf(friend)].label}</small>
    </span>
    ${
      pending
        ? `<button class="mini-button" type="button" data-action="party-invite" data-id="${friend.id}">${icon('refresh', 'icon--xs')} Позвать ещё раз</button>`
        : `<button class="mini-button mini-button--accent" type="button" data-action="party-invite" data-id="${friend.id}">${icon('send', 'icon--xs')} Пригласить</button>`
    }
  </div>`;

/* Входящее приглашение — та же плотная строка, что у заявок в друзья:
   человек видит, кто зовёт и в какую комнату, и отвечает в один клик. */
const partyRequestHtml = (invite) => {
  const from = store.getUser(invite.from);
  const who = from ?? {
    id: invite.from,
    name: invite.fromName || 'Мастер',
    nameKey: String(invite.fromName || '').toLowerCase(),
    avatar: null,
    online: true,
    seenAt: Date.now(),
  };
  const room = String(invite.title ?? '').trim() || `Партия ${invite.code}`;
  return `
    <div class="request">
      ${avatarEl(who, 'avatar--sm')}
      <span class="friend__text">
        <strong class="friend__name" translate="no">${escapeHtml(room)}</strong>
        <small class="friend__state">${escapeHtml(invite.fromName || 'Мастер')} зовёт вас · код ${escapeHtml(invite.code)}</small>
      </span>
      <button class="icon-button icon-button--sm" type="button" data-action="party-invite-accept" data-id="${escapeHtml(invite.lobbyId)}" aria-label="Войти в партию ${escapeHtml(room)}" title="Войти">
        ${icon('check')}
      </button>
      <button class="icon-button icon-button--sm icon-button--danger" type="button" data-action="party-invite-decline" data-id="${escapeHtml(invite.lobbyId)}" aria-label="Отклонить приглашение в партию ${escapeHtml(room)}" title="Отклонить">
        ${icon('x')}
      </button>
    </div>`;
};

const partyEmptyHtml = (title, text, action = null) => `
  <div class="empty">
    <p class="empty__title">${escapeHtml(title)}</p>
    <p class="empty__text">${escapeHtml(text)}</p>
    ${
      action
        ? `<button class="solid-button" type="button" data-action="${action.action}"><span>${escapeHtml(action.label)}</span></button>`
        : ''
    }
  </div>`;

/* Комната глазами участника: код, мир, люди, приглашения и выход.
   Всё, что может только мастер, хаб проверяет сам — интерфейс просто
   не показывает лишних кнопок, а защитой не является. */
const partyRoomHtml = (room) => {
  const isMaster = room.role === 'master';
  const members = room.members ?? [];
  const inside = new Set(members.map((member) => member.id));
  const pending = new Set((room.invited ?? []).map((item) => item.id));
  const me = store.getCurrentUser();
  const friends = me ? store.listFriends(me.id).filter((friend) => !inside.has(friend.id)) : [];
  const full = members.length >= lobby.PARTY_MAX_MEMBERS;
  const draft = ui.party;
  return `
    <div class="party">
      <div class="party__head">
        <div class="party__heading">
          <p class="eyebrow">${isMaster ? 'Ваша комната для игры' : 'Комната для игры'}</p>
          <h3 class="party__title" translate="no">${escapeHtml(partyName(room))}</h3>
          <p class="party__meta">
            Мастер: <span translate="no">${escapeHtml(room.masterName || '—')}</span>
            · создана ${formatDate(room.createdAt)}
          </p>
        </div>
        <button class="code-box code-box--button" type="button" data-action="party-copy-code" data-code="${escapeHtml(room.code)}" title="Скопировать код партии" aria-label="Код партии ${escapeHtml(room.code)} — скопировать">
          <code class="code-box__value" translate="no">${escapeHtml(room.code)}</code>
          ${icon('copy')}
        </button>
      </div>

      <p class="party__params">
        <span class="party__param"><small>Участников</small><strong>${members.length} / ${lobby.PARTY_MAX_MEMBERS}</strong></span>
        <span class="party__param"><small>Seed мира</small><strong translate="no">${escapeHtml(room.seed)}</strong></span>
        <span class="party__param"><small>Размер</small><strong>${escapeHtml(partySizeLabel(room.width, room.height))}</strong></span>
      </p>

      <div class="party__block">
        <p class="eyebrow">В комнате</p>
        <div class="party__members">
          ${members.map((member) => partyMemberHtml(member, isMaster)).join('')}
        </div>
      </div>

      ${
        isMaster
          ? `<div class="party__block">
               <p class="eyebrow">Пригласить в партию</p>
               ${
                 friends.length
                   ? `<div class="party__members">${friends
                       .map((friend) => partyInviteRowHtml(friend, pending.has(friend.id)))
                       .join('')}</div>
                      ${
                        full
                          ? `<p class="form-note form-note--warn">В партии уже ${lobby.PARTY_MAX_MEMBERS} участников — свободных мест нет. Исключите кого-нибудь, чтобы позвать нового.</p>`
                          : `<p class="form-note">Приглашение живёт 15 минут и приходит другу сразу, если он в приложении. Позвать можно только друга: сначала добавьте человека в друзья.</p>`
                      }`
                   : `<p class="form-note">Друзей, которых ещё нет в комнате, не осталось. Добавьте человека в друзья — и он появится здесь, а код партии ${escapeHtml(room.code)} можно передать и так.</p>`
               }
             </div>`
          : `<p class="form-note">Код партии ${escapeHtml(room.code)}: по нему сюда войдёт любой, кому вы его передадите. Зовёт в комнату мастер — ${escapeHtml(room.masterName || 'он')}.</p>`
      }

      ${
        isMaster
          ? `<form class="form party__block" data-form="party-params" novalidate>
               <p class="eyebrow">Мир партии</p>
               <label class="field">
                 <span class="field__label">Название</span>
                 <input class="input" name="title" type="text" maxlength="${lobby.PARTY_TITLE_MAX}" autocomplete="off"
                        placeholder="Например: Северный ветер" data-role="party-title"
                        value="${escapeHtml(draft.title)}" />
               </label>
               <label class="field">
                 <span class="field__label">Seed мира</span>
                 <span class="code-form__row">
                   <input class="input" name="seed" type="text" maxlength="${lobby.PARTY_SEED_MAX}" spellcheck="false"
                          autocomplete="off" placeholder="aurora-4210" data-role="party-seed"
                          value="${escapeHtml(draft.seed)}" />
                   <button class="mini-button" type="button" data-action="party-random-seed">${icon('dices', 'icon--xs')} Случайный</button>
                 </span>
               </label>
               <label class="field">
                 <span class="field__label">Размер карты</span>
                 <select class="input input--select" name="size" data-role="party-size">
                   ${lobby.PARTY_SIZES.map(([width, height, label]) => `
                     <option value="${width}x${height}" ${partySizeValue(room.width, room.height) === `${width}x${height}` ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
                 </select>
               </label>
               <p class="form-error" data-role="form-error" hidden></p>
               <button class="mini-button mini-button--accent" type="submit" data-role="submit">${icon('save', 'icon--xs')} Сохранить мир партии</button>
               <p class="form-note">Смена seed или размера означает новый мир: участникам придётся пересобрать карту. Название меняется без последствий.</p>
             </form>`
          : ''
      }

      <div class="dialog__actions dialog__actions--spread">
        <span class="party__hint">${
          isMaster
            ? 'Пока вы в комнате, партия жива: закрыв её, вы закроете её для всех.'
            : 'Вы можете выйти и вернуться по коду, если место ещё свободно.'
        }</span>
        <button class="mini-button ${isMaster ? 'mini-button--danger' : ''}" type="button" data-action="${isMaster ? 'party-close' : 'party-leave'}">
          ${icon('logOut', 'icon--xs')}${isMaster ? 'Закрыть партию' : 'Выйти из партии'}
        </button>
      </div>
    </div>`;
};

/* Новая партия: название, seed мира и размер. Seed обязателен для хаба —
   по нему строится мир комнаты, поэтому поле заполнено сразу случайным
   значением: создать партию можно одним нажатием. */
const partyCreateHtml = () => {
  const draft = ui.party;
  return `
    <form class="form" data-form="party-create" novalidate>
      <label class="field">
        <span class="field__label">Название партии</span>
        <input class="input" name="title" type="text" maxlength="${lobby.PARTY_TITLE_MAX}" autocomplete="off"
               placeholder="Например: Северный ветер" data-role="party-title" data-autofocus
               value="${escapeHtml(draft.title)}" />
      </label>
      <label class="field">
        <span class="field__label">Seed мира</span>
        <span class="code-form__row">
          <input class="input" name="seed" type="text" maxlength="${lobby.PARTY_SEED_MAX}" spellcheck="false"
                 autocomplete="off" placeholder="aurora-4210" data-role="party-seed"
                 value="${escapeHtml(draft.seed)}" />
          <button class="mini-button" type="button" data-action="party-random-seed">${icon('dices', 'icon--xs')} Случайный</button>
        </span>
      </label>
      <label class="field">
        <span class="field__label">Размер карты</span>
        <select class="input input--select" name="size" data-role="party-size">
          ${lobby.PARTY_SIZES.map(([width, height, label]) => `
            <option value="${width}x${height}" ${draft.size === `${width}x${height}` ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
        </select>
      </label>
      <p class="form-error" data-role="form-error" hidden></p>
      <button class="solid-button" type="submit" data-role="submit" ${draft.busy ? 'disabled' : ''}>
        <span>${draft.busy ? 'Создаём партию…' : 'Создать партию'}</span>
      </button>
      <p class="form-note">Вы станете мастером партии: сможете звать друзей, менять мир и закрыть комнату. Код партии виден только участникам. Пустая комната (никого в сети) закрывается сама через десять минут.</p>
    </form>`;
};

const partyJoinHtml = () => `
  <form class="form" data-form="party-join" novalidate>
    <label class="field">
      <span class="field__label">Код партии</span>
      <input class="input input--code" name="code" type="text" inputmode="latin" autocomplete="off" spellcheck="false"
             maxlength="9" placeholder="XXXX-XXXX" data-role="party-code" data-autofocus
             value="${escapeHtml(ui.party.code)}" />
    </label>
    <p class="form-error" data-role="form-error" hidden></p>
    <button class="solid-button" type="submit" data-role="submit"><span>Войти в партию</span></button>
    <p class="form-note">Код даёт мастер партии — он выглядит как XXXX-XXXX. Войти по коду может любой игрок с аккаунтом на этом хабе, пока в комнате есть свободное место (всего ${lobby.PARTY_MAX_MEMBERS}).</p>
  </form>`;

const partiesModalHtml = () => {
  const ready = store.isBackendInitialized?.() ?? backendReady;
  const me = store.getCurrentUser();
  const state = lobby.lobbyState();
  const room = state.lobby;
  const invites = state.invites ?? [];

  const gate = !ready
    ? partyEmptyHtml(
        'Проверяем подключение',
        'Приложение сначала ищет общий хаб: партии живут на нём, а не в этом браузере. Через пару секунд здесь появятся комнаты.',
      )
    : !me
      ? partyEmptyHtml(
          'Войдите, чтобы играть вместе',
          'Партии создают и принимают только игроки с аккаунтом: комната привязана к имени, а приглашения приходят по нему.',
          { action: 'open-auth', label: 'Войти в аккаунт' },
        )
      : !store.isHub()
        ? partyEmptyHtml(
            'Партиям нужен общий хаб',
            'Комната для игры живёт на сервере, который видят все участники. Подключите общий хаб — свой одной командой npm run host или адрес друга, — и партии откроются.',
            { action: 'open-hub', label: 'Подключить общий хаб' },
          )
        : '';

  const body = gate
    ? gate
    : `
        <div class="link-box">
          <div class="link-box__text">
            <p class="eyebrow">Комнаты для игры</p>
            ${partyChannelHtml(state)}
            <p class="link-box__hint">${
              room
                ? `Вы в партии «${partyName(room)}». Состав и присутствие обновляются сами: канал живой.`
                : 'Создайте партию и позовите друзей — или войдите в чужую по коду. Приглашения приходят сюда сразу, как только мастер нажал «Пригласить».'
            }</p>
          </div>
          ${
            state.notice
              ? `<div class="link-box__actions"><span class="party__notice">${escapeHtml(state.notice)}</span></div>`
              : ''
          }
        </div>

        ${
          invites.length
            ? `<div class="requests" role="group" aria-label="Приглашения в партии">
                 <p class="requests__title">Приглашения · ${invites.length}</p>
                 ${invites.map(partyRequestHtml).join('')}
               </div>`
            : ''
        }

        ${
          room
            ? partyRoomHtml(room)
            : `<div class="tabs" role="tablist" aria-label="Как попасть в партию">
                 <button class="tab${ui.party.tab === 'create' ? ' tab--active' : ''}" type="button" role="tab" aria-selected="${ui.party.tab === 'create'}" data-action="party-tab" data-tab="create">Создать партию</button>
                 <button class="tab${ui.party.tab === 'join' ? ' tab--active' : ''}" type="button" role="tab" aria-selected="${ui.party.tab === 'join'}" data-action="party-tab" data-tab="join">Войти по коду</button>
               </div>
               ${ui.party.tab === 'join' ? partyJoinHtml() : partyCreateHtml()}`
        }`;

  return dialogShell({
    label: 'Партии',
    title: 'Партии',
    size: 'wide',
    body: `<div class="dialog__body">${body}</div>`,
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
  'admin:file-write': 'Панель: файл сохранён',
  'admin:file-rename': 'Панель: файл переименован',
  'admin:file-delete': 'Панель: файл удалён',
  'admin:lobby-close': 'Панель: партия закрыта',
  'admin:lobby-close-all': 'Панель: все партии закрыты',
  'admin:kick-all': 'Панель: сброс всех сессий',
  'admin:backup-restore': 'Панель: импорт снимка',
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
        <span class="admin-gate__serial">SAGES · 07</span>
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
          ${icon('shield', 'icon--xs')}<span>Открыть панель</span><span class="admin-gate__arrow" aria-hidden="true">${icon('arrowUpRight')}</span>
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
          ? `<span class="avatar avatar--img avatar--lg"><img src="${escapeHtml(user.avatar)}" alt="" /></span>`
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
      <span class="admin-tile__arrow" aria-hidden="true">${icon('arrowUpRight', 'icon--sm')}</span>
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
          <button class="mini-button" type="button" data-action="admin-tab" data-tab="files">Файлы и сервер</button>
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

const ADMIN_FILE_FILTERS = [
  ['all', 'Все'],
  ['config', 'Конфиг'],
  ['data', 'Данные'],
  ['log', 'Логи'],
  ['custom', 'Свои'],
];

const ADMIN_FILE_TEMPLATES = [
  ['rules', 'config/rules.json', 'Правила JSON', '{\n  "title": "Правила сервера",\n  "fairPlay": true,\n  "maxPlayersPerLobby": 8\n}'],
  ['motd', 'notes/announcement.md', 'Объявление', '# Объявление сервера\n\nДобро пожаловать в The Civilization of the Sages!\n'],
  ['whitelist', 'config/whitelist.json', 'Белый список', '{\n  "enabled": false,\n  "players": []\n}'],
];

const formatFileSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} Б`;
  return `${(n / 1024).toFixed(1)} КБ`;
};

const fileCategoryIcon = (category) =>
  category === 'config' ? 'settings' : category === 'data' ? 'layers' : category === 'log' ? 'history' : 'folderOpen';

const fileCategoryLabel = (category, system) =>
  system
    ? category === 'config'
      ? 'Конфиг · системный'
      : category === 'log'
        ? 'Журнал · системный'
        : 'Данные · системный'
    : 'Пользовательский файл';

const adminFilesHtml = () => {
  const data = ui.admin.data;
  const allFiles = data?.files ?? [];
  const lobbies = data?.lobbies ?? [];
  const filter = ui.admin.fileFilter || 'all';
  const query = ui.admin.fileQuery.trim().toLocaleLowerCase('ru');
  const files = allFiles.filter((file) => {
    const matchFilter =
      filter === 'all' ||
      (filter === 'custom' ? !file.system : file.category === filter);
    const matchQuery =
      !query ||
      String(file.path || '').toLocaleLowerCase('ru').includes(query) ||
      String(file.name || '').toLocaleLowerCase('ru').includes(query);
    return matchFilter && matchQuery;
  });

  const isCreating = ui.admin.fileCreating;
  const activePath = isCreating ? '' : ui.admin.filePath;
  const activeMeta = isCreating
    ? { path: ui.admin.fileDraftPath, system: false, writable: true, deletable: false, category: 'custom' }
    : ui.admin.fileMeta ?? allFiles.find((item) => item.path === activePath) ?? null;
  const draftPath = isCreating ? ui.admin.fileDraftPath : (ui.admin.fileDraftPath || activeMeta?.path || '');
  const content = String(ui.admin.fileContent ?? '');
  const lineCount = content ? content.split('\n').length : 1;
  const isJson = /\.json$/i.test(draftPath);
  const motdValue = ui.admin.motdDraft !== null ? ui.admin.motdDraft : (data?.settings?.motd ?? '');
  const registrationOpen = data?.settings?.registrationOpen !== false;

  return `
    <div class="admin-page-intro">
      <p class="hint">Управление файлами сервера, живой конфигурацией, журналами, активными партиями и резервными копиями прямо из панели.</p>
      <div class="dialog__actions">
        <button class="mini-button mini-button--accent" type="button" data-action="admin-file-new">
          ${icon('plus', 'icon--xs')}<span>Новый файл</span>
        </button>
        <button class="mini-button" type="button" data-action="admin-file-upload">
          ${icon('fileDown', 'icon--xs')}<span>Загрузить файл</span>
        </button>
        <button class="mini-button" type="button" data-action="admin-import-backup">
          ${icon('folderOpen', 'icon--xs')}<span>Импорт снимка</span>
        </button>
      </div>
    </div>

    <div class="admin-chips" role="group" aria-label="Категория файлов">
      ${ADMIN_FILE_FILTERS.map(([value, label]) =>
        adminChipHtml('admin-file-filter', value, label, filter === value),
      ).join('')}
    </div>

    <label class="field admin-search-field">
      <span class="field__label">Поиск по пути или имени файла</span>
      <input class="input" type="search" placeholder="Например, config/settings.json или logs/…" autocomplete="off" spellcheck="false"
             value="${escapeHtml(ui.admin.fileQuery)}" data-role="admin-file-search" />
    </label>

    <div class="admin-files-grid">
      <section class="admin-card admin-files-sidebar" aria-label="Список файлов сервера">
        <div class="admin-card__heading">
          <div><p class="eyebrow">Хранилище</p><h4>Файлы (${files.length} из ${allFiles.length})</h4></div>
          <span class="admin-result-count">${formatFileSize(data?.stats?.fileBytes ?? 0)}</span>
        </div>
        <div class="admin-list admin-files__list">
          ${
            files.length
              ? files
                  .map((item) => {
                    const active = !isCreating && item.path === activePath;
                    return `
                      <button class="admin-row admin-file-row${active ? ' admin-file-row--active' : ''}" type="button"
                              data-action="admin-file-open" data-path="${escapeHtml(item.path)}">
                        ${icon(fileCategoryIcon(item.category), 'icon--sm')}
                        <span class="admin-row__text">
                          <strong class="admin-row__name" translate="no">${escapeHtml(item.path)}</strong>
                          <small class="admin-row__meta">${escapeHtml(fileCategoryLabel(item.category, item.system))} · ${escapeHtml(formatFileSize(item.size))} · ${escapeHtml(seenText(item.updatedAt))}</small>
                        </span>
                        <span class="admin-file-tag${item.system ? ' admin-file-tag--sys' : ''}">${item.system ? 'СИСТЕМНЫЙ' : 'СВОЙ'}</span>
                      </button>`;
                  })
                  .join('')
              : '<div class="admin-empty"><strong>Файлы не найдены</strong><span>Смените фильтр или создайте новый файл.</span></div>'
          }
        </div>
      </section>

      <section class="admin-card admin-file-editor" aria-label="Редактор файла">
        ${
          activeMeta || isCreating
            ? `
              <form class="form admin-file-form" data-form="admin-file-save" novalidate>
                <div class="admin-card__heading">
                  <div>
                    <p class="eyebrow">${isCreating ? 'Создание файла' : activeMeta?.system ? 'Системный файл сервера' : 'Пользовательский файл сервера'}</p>
                    <h4 translate="no">${escapeHtml(draftPath || 'Новый файл')}</h4>
                  </div>
                  <span class="admin-result-count" translate="no">${lineCount} стр. · ${formatFileSize(content.length)}${ui.admin.fileDirty ? ' · изменён' : ''}</span>
                </div>

                <div class="admin-chips" role="group" aria-label="Шаблоны файла">
                  <span class="admin-chips__label">Шаблон:</span>
                  ${ADMIN_FILE_TEMPLATES.map(
                    ([tplId, path, label]) =>
                      `<button class="chip${draftPath === path ? ' chip--active' : ''}" type="button" data-action="admin-file-template" data-template="${escapeHtml(tplId)}" data-path="${escapeHtml(path)}">${escapeHtml(label)}</button>`,
                  ).join('')}
                </div>

                <label class="field">
                  <span class="field__label">${activeMeta?.system && !isCreating ? 'Путь системного файла (фиксирован)' : 'Путь файла на сервере (можно переименовать)'}</span>
                  <input class="input input--code" name="path" type="text" maxlength="120" spellcheck="false"
                         placeholder="folder/filename.json" value="${escapeHtml(draftPath)}"
                         data-role="admin-file-path" ${activeMeta?.system && !isCreating ? 'readonly' : ''} required />
                </label>

                <label class="field">
                  <span class="field__label">Содержимое файла</span>
                  <textarea class="input admin-file-textarea" name="content" rows="12" spellcheck="false"
                            placeholder="Текст или JSON содержимое файла…"
                            data-role="admin-file-content">${escapeHtml(content)}</textarea>
                </label>

                <p class="form-error" data-role="form-error" hidden></p>

                <div class="dialog__actions dialog__actions--spread">
                  <button class="mini-button mini-button--accent" type="submit" data-role="submit">
                    ${icon('save', 'icon--xs')}<span>${isCreating ? 'Создать и сохранить' : 'Сохранить на сервере'}</span>
                  </button>
                  ${
                    isJson
                      ? `<button class="mini-button" type="button" data-action="admin-file-format">
                           ${icon('check', 'icon--xs')}<span>Форматировать JSON</span>
                         </button>`
                      : ''
                  }
                  <button class="mini-button" type="button" data-action="admin-file-copy">
                    ${icon('copy', 'icon--xs')}<span>Скопировать</span>
                  </button>
                  <button class="mini-button" type="button" data-action="admin-file-download">
                    ${icon('download', 'icon--xs')}<span>Скачать</span>
                  </button>
                  ${
                    !isCreating && (!activeMeta?.system || activeMeta?.deletable)
                      ? `<button class="mini-button mini-button--danger" type="button" data-action="admin-file-delete" data-path="${escapeHtml(activeMeta.path)}">
                           ${icon('trash', 'icon--xs')}<span>${activeMeta?.system ? 'Очистить' : 'Удалить'}</span>
                         </button>`
                      : ''
                  }
                </div>
              </form>`
            : '<div class="admin-empty"><strong>Файл не выбран</strong><span>Выберите файл слева или нажмите «Новый файл».</span></div>'
        }
      </section>
    </div>

    <div class="admin-overview-grid">
      <section class="admin-card">
        <div class="admin-card__heading"><div><p class="eyebrow">Сервер</p><h4>Объявление и доступ</h4></div>${icon('globe', 'admin-card__icon')}</div>
        <form class="form" data-form="admin-motd" novalidate>
          <label class="field">
            <span class="field__label">Объявление сервера (MOTD)</span>
            <input class="input" name="motd" type="text" maxlength="240" spellcheck="false"
                   placeholder="Статус сервера, расписание игр или техработы…"
                   value="${escapeHtml(motdValue)}" data-role="admin-motd-input" />
          </label>
          <p class="form-error" data-role="form-error" hidden></p>
          <div class="admin-card__actions">
            <button class="mini-button mini-button--accent" type="submit">Сохранить объявление</button>
            ${
              data?.settings?.motd
                ? `<button class="mini-button" type="button" data-action="admin-motd-clear">Убрать</button>`
                : ''
            }
          </div>
        </form>
      </section>

      <section class="admin-card">
        <div class="admin-card__heading">
          <div><p class="eyebrow">Комнаты</p><h4>Активные партии (${lobbies.length})</h4></div>
          ${icon('map', 'admin-card__icon')}
        </div>
        ${
          lobbies.length
            ? `<div class="admin-list admin-list--flat">${lobbies
                .map(
                  (item) => `
                    <div class="admin-row admin-row--static">
                      <span class="admin-row__text">
                        <strong class="admin-row__name" translate="no">${escapeHtml(item.title || item.code)} · ${escapeHtml(item.masterName || item.masterId)}</strong>
                        <small class="admin-row__meta">Код ${escapeHtml(item.code)} · участников: ${item.members?.length ?? 1} · seed ${escapeHtml(item.seed || '—')}</small>
                      </span>
                      <button class="mini-button mini-button--danger" type="button" data-action="admin-lobby-close" data-id="${escapeHtml(item.id)}">
                        Закрыть
                      </button>
                    </div>`,
                )
                .join('')}</div>
               <div class="admin-card__actions">
                 <button class="mini-button mini-button--danger" type="button" data-action="admin-lobby-close-all">
                   ${icon('trash', 'icon--xs')}<span>Закрыть все партии</span>
                 </button>
               </div>`
            : '<div class="admin-empty"><strong>Активных партий нет</strong><span>Открытые комнаты появятся здесь автоматически.</span></div>'
        }
      </section>

      <section class="admin-card">
        <div class="admin-card__heading"><div><p class="eyebrow">Обслуживание</p><h4>Сессии и доступ</h4></div>${icon('shield', 'admin-card__icon')}</div>
        <p class="hint">Быстрое управление сессиями игроков и регистрацией перед обновлением или обслуживанием сервера.</p>
        <div class="admin-card__actions">
          <button class="mini-button ${registrationOpen ? 'mini-button--danger' : 'mini-button--accent'}" type="button" data-action="admin-registration" data-open="${registrationOpen ? '0' : '1'}">
            ${registrationOpen ? 'Закрыть регистрацию' : 'Открыть регистрацию'}
          </button>
          <button class="mini-button mini-button--danger" type="button" data-action="admin-kick-all">
            ${icon('power', 'icon--xs')}<span>Сбросить все сессии</span>
          </button>
        </div>
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
      ${statRow('Объявление сервера', data?.settings?.motd || 'не задано')}
      ${statRow('Аккаунтов на хабе', String(data?.stats?.users ?? 0))}
      ${statRow('Из них в сети', String(data?.stats?.online ?? 0))}
      ${statRow('Новых за сутки', String(data?.stats?.today ?? 0))}
      ${statRow('Новых за неделю', String(data?.stats?.week ?? 0))}
      ${statRow('Заходили за сутки', String(data?.stats?.activeDay ?? 0))}
      ${statRow('Заблокировано', String(data?.stats?.banned ?? 0))}
      ${statRow('Заявок', String(data?.stats?.requests ?? 0))}
      ${statRow('Дружб', String(data?.stats?.links ?? 0))}
      ${statRow('Активных партий', String(data?.stats?.lobbies ?? data?.lobbies?.length ?? 0))}
      ${statRow('Файлов сервера', `${data?.stats?.files ?? data?.files?.length ?? 0} (${formatFileSize(data?.stats?.fileBytes ?? 0)})`)}
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
        : ui.admin.tab === 'files'
          ? adminFilesHtml()
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
    : ({
        overview: 'Обзор',
        players: 'Игроки',
        requests: 'Заявки',
        files: 'Файлы и сервер',
        events: 'Журнал событий',
        system: 'Система',
      }[ui.admin.tab] ?? 'Обзор');
  const sectionDescription = user
    ? 'Аккаунт игрока · действия администратора'
    : ui.admin.tab === 'overview'
      ? 'Общая картина, аналитика и быстрые действия'
      : ui.admin.tab === 'players'
        ? 'Поиск и управление аккаунтами'
        : ui.admin.tab === 'requests'
          ? 'Очередь заявок в друзья'
          : ui.admin.tab === 'files'
            ? 'Просмотр, редактирование и загрузка файлов сервера, управление партиями и сессиями'
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
            <span><strong>THE CIVILIZATION</strong><small>OF THE SAGES</small></span>
          </div>
          <div class="admin-rail__mode"><span class="dot" aria-hidden="true"></span><span>${modeLabel}</span></div>
          <p class="eyebrow">РАБОЧАЯ ОБЛАСТЬ</p>
          <nav class="admin-nav" role="tablist" aria-orientation="vertical" aria-label="Разделы панели">
            ${adminTabHtml('overview', 'Обзор', 'sigil')}
            ${adminTabHtml('players', 'Игроки', 'users', data.users.length)}
            ${adminTabHtml('requests', 'Заявки', 'userPlus', data.requests.length)}
            ${adminTabHtml('files', 'Файлы', 'folderOpen', (data.files ?? []).length)}
            ${adminTabHtml('events', 'Журнал', 'message', data.events?.length ?? 0)}
            ${adminTabHtml('system', 'Система', 'settings')}
          </nav>
          <div class="admin-rail__footer">
            <span class="admin-rail__version">SAGES · v${escapeHtml(VERSION)}</span>
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
      html = settingsModalHtml({
        dialogShell,
        settings: store.getSettings(),
        updateInfo: update.getUpdateInfo(),
        statusText: updateStatusText(),
        notifyText: notifyHint(),
        notificationsSupported: update.notificationState().supported,
      });
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
    case 'parties':
      html = partiesModalHtml();
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
  }

  /* Проверяем и себя, и слой окон: разметку мог стереть closeModal или
     другой код, а сверять `innerHTML` целиком (с аватарками) дорого. */
  const changed = renderedModalHtml !== html || !root.querySelector('.dialog');
  /* Разметка та же — окно уже на экране. Обновлять нечего, но если
     окно только что открыли, фокус всё равно надо поставить. */
  if (!changed) {
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

/* ---------- главное меню: картографический штаб ----------------
   Слева — навигация: первой и основной стоит «Партии» (комнаты для
   игры), за ней сообщество. В центре — заголовок и сводка, справа —
   друзья. Фирменные шалфей и золото работают как акценты, а не как
   декоративный шум. Навигация и сцена — отдельные
   области (`sidenav` и `stage-menu`): каждая пересобирается, только
   когда её строка изменилась (см. setMarkupIfChanged); друзья берутся
   из кеша store. Игровых экранов (карты, редактора, слотов) в
   приложении нет — «Партии» открывают комнату и людей в ней, а не
   экран мира. */
const menuCounts = () => {
  const me = store.getCurrentUser();
  const friends = me ? store.listFriends(me.id) : [];
  return {
    me,
    friends,
    online: friends.filter((friend) => store.presenceOf(friend) !== 'offline').length,
    hub: !backendReady ? 'Проверяем хаб…' : store.isHub() ? store.hubHost() : 'Локально, в этом браузере',
  };
};

/* Пункт «Партии» — основной: он стоит первым в навигации и выделен как
   главный. Подпись объясняет, что внутри, ещё до клика: своя комната
   с кодом, ждущие приглашения или то, что нужно для входа. Дубля этой
   кнопки в центре страницы нет — действие живёт только в навигации. */
const partyNavState = () => {
  const state = lobby.lobbyState();
  const invites = state.invites?.length ?? 0;
  const room = state.lobby;
  if (room)
    return {
      hint: `${partyName(room)} · ${room.members?.length ?? 1}/${lobby.PARTY_MAX_MEMBERS}`,
      badge: invites,
    };
  if (invites) return { hint: `Вас зовут в ${invites} комн. · войти`, badge: invites };
  if (!store.getCurrentUser()) return { hint: 'Комнаты для игры · войдите в аккаунт', badge: 0 };
  if (!backendReady) return { hint: 'Комнаты для игры · проверяем хаб', badge: 0 };
  if (!store.isHub()) return { hint: 'Комнаты для игры · нужен общий хаб', badge: 0 };
  return { hint: 'Создать комнату и позвать друзей', badge: 0 };
};

/* Сочетания клавиш разделов: на ПК меню открывается с клавиатуры, не уводя
   руку с верхнего ряда. Цифры проверяются по `code` (см. обработчик ниже),
   поэтому сочетание работает и на русской раскладке. Подпись пункта на
   планшете и в полосе телефона спрятана, поэтому имя кнопки дублируется в
   aria-label: без него с экрана читается пустая кнопка. */
const NAV_HOTKEYS = [
  { code: 'Digit1', label: 'Alt + 1', action: 'open-parties' },
  { code: 'Digit2', label: 'Alt + 2', action: 'open-hub' },
  { code: 'Digit3', label: 'Alt + 3', action: 'open-direct' },
  { code: 'Digit4', label: 'Alt + 4', action: 'open-settings' },
];

const navHotkey = (action) => NAV_HOTKEYS.find((item) => item.action === action)?.label ?? '';

/* Доступное имя пункта: название, состояние и счётчик приглашений —
   всё, что видно глазами на широком экране. */
const navAriaLabel = ({ title, hint, badge = 0, badgeLabel = 'Новых заявок' }) =>
  [`${title} — ${hint}`, badge ? `${badgeLabel}: ${badge}` : ''].filter(Boolean).join(' · ');

const sidenavHtml = () => {
  const { hub } = menuCounts();
  const party = partyNavState();
  /* `short` — подпись пункта для нижней панели телефона: полное название
     «Прямое подключение» в клетку 72px не влезает, а значок без слова не
     читается. Доступное имя кнопки от подписи не зависит — оно в aria-label. */
  const items = [
    {
      glyph: 'dices',
      title: 'Партии',
      short: 'Партии',
      hint: party.hint,
      action: 'open-parties',
      badge: party.badge,
      badgeLabel: 'Новых приглашений в партии',
      modifier: 'sidenav__item--main',
    },
    { glyph: 'globe', title: 'Общий хаб', short: 'Хаб', hint: hub, action: 'open-hub' },
    {
      glyph: 'link',
      title: 'Прямое подключение',
      short: 'Напрямую',
      hint: 'Без сервера · обмен кодами',
      action: 'open-direct',
    },
  ];
  return `
    <div class="sidenav__list" role="list">
      ${items.map((item) => {
        const { glyph, title, short, action, badge = 0, modifier = '' } = item;
        const hotkey = navHotkey(action);
        return `
        <button class="sidenav__item${modifier ? ` ${modifier}` : ''}" type="button" role="listitem" data-action="${action}"
                aria-label="${escapeHtml(navAriaLabel(item))}"${hotkey ? ` title="${escapeHtml(`${title} — ${hotkey}`)}"` : ''}>
          <span class="sidenav__icon">${icon(glyph)}</span>
          <span class="sidenav__text">
            <strong>${escapeHtml(title)}</strong>
            <span class="sidenav__short" aria-hidden="true">${escapeHtml(short)}</span>
            <small>${escapeHtml(item.hint)}</small>
          </span>
          ${badge ? `<span class="sidenav__badge" aria-hidden="true">${badge}</span>` : ''}
        </button>`;
      }).join('')}
    </div>
    <div class="sidenav__foot">
      <button class="sidenav__item" type="button" data-action="open-settings"
              aria-label="${escapeHtml(navAriaLabel({ title: 'Настройки', hint: 'Звук, анимации, обновления' }))}"
              title="${escapeHtml(`Настройки — ${navHotkey('open-settings')}`)}">
        <span class="sidenav__icon">${icon('settings')}</span>
        <span class="sidenav__text">
          <strong>Настройки</strong>
          <span class="sidenav__short" aria-hidden="true">Настройки</span>
          <small>Звук, анимации, обновления</small>
        </span>
      </button>
    </div>`;
};

const stageMenuHtml = () => {
  const { me, friends, online } = menuCounts();
  if (!me) return '';
  return `
    <div class="hero__stats hero__stats--friends-only" aria-label="Сводка">
      <span class="hero-stat hero-stat--friends"><strong>${online}<i>/${friends.length}</i></strong><small>друзей в сети</small></span>
    </div>`;
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
          <h2 class="rail__title">Друзья</h2>
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
          <p class="empty__text">Войдите в аккаунт в правом верхнем углу — откроются список друзей, заявки и личный код-приглашение.</p>
        </div>
      </div>`;
  }

  const friends = store.listFriends(me.id);
  const requests = store.incomingRequests(me.id);
  const online = friends.filter((f) => store.presenceOf(f) !== 'offline').length;
  /* Кто в сети — первые, дальше по имени. На телефоне лента друзей
     листается пальцем, и те, с кем можно говорить прямо сейчас, должны
     попадаться сразу, а не после прокрутки. */
  const presenceRank = (friend) => (store.presenceOf(friend) === 'offline' ? 1 : 0);
  const ordered = [...friends].sort(
    (a, b) => presenceRank(a) - presenceRank(b) || a.name.localeCompare(b.name, 'ru'),
  );

  return `
    <div class="rail__head">
      <div class="rail__heading">
        <p class="eyebrow">Сообщество</p>
        <h2 class="rail__title">
          Друзья <span class="rail__count">${online} / ${friends.length}</span>
        </h2>
      </div>
      <button class="icon-button icon-button--sm icon-button--badged" type="button" data-action="open-add-friend" aria-label="Добавить друга" title="Добавить друга">
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
        ordered.length
          ? ordered.map(friendRowHtml).join('')
          : `<div class="empty">
              <p class="empty__title">Пока пусто</p>
              <p class="empty__text">Нажмите на значок «+» в шапке панели или поделитесь своим код-приглашением ниже.</p>
            </div>`
      }
    </div>

    <div class="rail__foot">
      <p class="eyebrow">Мой код-приглашение</p>
      <button class="code-box code-box--button" type="button" data-action="copy-code" data-code="${me.inviteCode}" title="Нажмите, чтобы скопировать">
        <code class="code-box__value" translate="no">${me.inviteCode}</code>
        ${icon('copy')}
      </button>
      <p class="rail__foot-note">${store.isHub() ? `Хаб · ${escapeHtml(store.hubHost())}` : 'Локальный режим · хаб не подключён'}</p>
    </div>`;
};

/* ---------- каркас ------------------------------------------- */

document.querySelector('#app').innerHTML = `
  <div class="shell">
    <header class="topbar">
      <div class="topbar__side topbar__side--start">
        <p class="brand" translate="no">
          <button class="brand__mark" type="button" data-action="admin-tap" aria-label="Печать The civilization of the sages">${icon('sigil')}</button>
          <span class="brand__name" lang="en">
            <span class="brand__line">${TITLE.lead}</span>
            <span class="brand__line brand__line--muted">${TITLE.tail}</span>
          </span>
        </p>
      </div>

      <div class="topbar__side topbar__side--end" data-region="account"></div>

      <div class="update-bar" data-region="update" hidden></div>
    </header>

    <aside class="sidenav" data-region="sidenav" aria-label="Главное меню"></aside>

    <main id="main" class="stage">
      <div class="stage__inner">
        <section class="hero" aria-labelledby="hero-title">
          <span class="hero__seal" aria-hidden="true">${icon('sigil')}</span>
          <p class="eyebrow eyebrow--sage">Цивилизация мудрецов · картографический штаб</p>
          <h1 class="hero__title" id="hero-title" lang="en" translate="no">
            <span class="hero__line">${TITLE.lead}</span>
            <span class="hero__line hero__line--tail">${TITLE.tail}</span>
          </h1>
          <p class="hero__caption"><span>Мудрость создаёт миры.</span></p>
        </section>
        <div class="stage-menu" data-region="stage-menu"></div>
      </div>
    </main>

    <aside class="rail" data-region="rail" aria-label="Друзья"></aside>

    <footer class="footer">
      <span>Версия ${VERSION}</span>
      <span class="footer__hint">Партии · друзья · общий хаб · прямая связь</span>
      <span class="footer__keys"><kbd>Alt</kbd> + <kbd>1…4</kbd> — разделы · <kbd>Esc</kbd> — закрыть окно</span>
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
  const role = hadFocus ? active.dataset?.role : '';
  const index = hadFocus ? active.dataset?.index : '';
  node.innerHTML = html;
  if (!hadFocus || !action) return;
  const replacement = [...node.querySelectorAll('[data-action]')]
    .find((item) =>
      item.dataset.action === action && item.dataset.id === id &&
      (item.dataset.role ?? '') === (role ?? '') && (item.dataset.index ?? '') === (index ?? ''));
  replacement?.focus({ preventScroll: true });
};

const renderRegions = () => {
  setMarkupIfChanged(document.querySelector('[data-region="account"]'), accountSlotHtml(), 'account');
  setMarkupIfChanged(document.querySelector('[data-region="rail"]'), railHtml(), 'rail');
  setMarkupIfChanged(document.querySelector('[data-region="sidenav"]'), sidenavHtml(), 'sidenav');
  setMarkupIfChanged(document.querySelector('[data-region="stage-menu"]'), stageMenuHtml(), 'stage-menu');
};

const render = () => {
  renderRegions();
  if (ui.modal) renderModal({ focus: false });
};

const storeModalTypes = new Set(['profile', 'add-friend', 'friend', 'hub', 'admin', 'parties']);
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

/* ---------- партии: живой канал комнаты ------------------------ */

/* Канал партий (WebSocket хаба) живёт столько же, сколько сессия игрока
   на общем хабе: вошёл — подняли, вышел или отключил хаб — закрыли. Без
   канала приглашения приходили бы только по явному запросу, и человек не
   узнал бы, что его зовут, пока сам не откроет окно «Партии». */
let lobbyRunning = false;

const syncLobby = () => {
  const wanted = backendReady && store.isHub() && !!store.getCurrentUser();
  if (wanted && !lobbyRunning) {
    lobbyRunning = lobby.connectLobby();
    if (lobbyRunning) lobby.refreshLobby().catch(() => {});
    return;
  }
  if (!wanted && lobbyRunning) {
    lobbyRunning = false;
    lobby.disconnectLobby();
  }
};

store.subscribe(syncLobby);

/* Перерисовка по каналу партий. Замер задержки приходит каждые пятнадцать
   секунд и к составу комнаты отношения не имеет, поэтому сравниваем подпись
   данных: изменился только rtt — меню не трогаем (иначе навигация и панель
   друзей пересобирались бы впустую, см. renderAfterPeerChange). */
let partySignature = '';

const partySignatureOf = (state) =>
  [
    state.status,
    state.notice,
    state.lobby?.id ?? '',
    state.lobby?.code ?? '',
    state.lobby?.title ?? '',
    state.lobby?.seed ?? '',
    state.lobby?.width ?? '',
    state.lobby?.height ?? '',
    (state.lobby?.members ?? [])
      .map((member) => `${member.id}:${member.online ? 1 : 0}:${member.master ? 1 : 0}`)
      .join(','),
    (state.lobby?.invited ?? []).map((item) => item.id).join(','),
    (state.invites ?? []).map((item) => item.lobbyId).join(','),
  ].join('|');

const renderAfterLobbyChange = (state) => {
  const signature = partySignatureOf(state);
  if (signature === partySignature) return;
  partySignature = signature;
  /* Своя комната снова появилась (вошли заново) — флаг «вышел сам»
     больше не нужен: следующее закрытие уже не наше. */
  if (state.lobby) partyLeftByMe = false;
  renderRegions();
  if (ui.modal?.type === 'parties') renderModal({ focus: false });
};

lobby.subscribeLobby(renderAfterLobbyChange);

/* Зов в партию слышно и с закрытым окном: звук, значок в навигации
   (он перерисовывается вместе с областями) и короткое сообщение.
   Об одном и том же приглашении дважды не напоминаем. */
let knownPartyInvites = new Set();

const notifyPartyInvites = (state) => {
  const invites = state.invites ?? [];
  const fresh = invites.filter((item) => !knownPartyInvites.has(item.lobbyId));
  knownPartyInvites = new Set(invites.map((item) => item.lobbyId));
  if (fresh.length === 0) return;
  playSound('message');
  if (ui.modal?.type === 'parties') return; // в открытом окне приглашения и так видны
  const first = fresh[0];
  const room = String(first.title || '').trim() || `партию ${first.code}`;
  toast(
    fresh.length === 1
      ? `${first.fromName || 'Мастер'} зовёт вас в ${room}. Откройте «Партии».`
      : `Новых приглашений в партии: ${fresh.length}. Откройте «Партии».`,
  );
};

lobby.subscribeLobby(notifyPartyInvites);

/* Закрытие комнаты и ошибки канала доходят текстом. Свой собственный выход
   не озвучиваем: игрок и так знает, что нажал (иначе мастер получал бы
   «Мастер закрыл партию» в ответ на своё же действие). */
let partyLeftByMe = false;

lobby.onLobbyEvent((event) => {
  if (event.type === 'closed') {
    if (partyLeftByMe) return;
    playSound('back');
    toast(lobby.lobbyState().notice || 'Партия закрыта.');
    return;
  }
  if (event.type === 'error' && event.message) {
    playSound('error');
    toast(event.message, 'error');
  }
});

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
    const firstLoad = ui.admin.lastUpdatedAt === 0;
    ui.admin.data = await store.adminSnapshot();
    if (firstLoad && ui.admin.motdDraft === null) {
      ui.admin.motdDraft = ui.admin.data?.settings?.motd ?? '';
    }
    if (ui.admin.filePath && !ui.admin.fileDirty && !ui.admin.fileCreating && ui.admin.fileMeta?.system) {
      try {
        const refreshedFile = await store.adminReadFile(ui.admin.filePath);
        ui.admin.fileContent = refreshedFile.content ?? '';
        ui.admin.fileMeta = refreshedFile;
      } catch {
        /* ignore if file was removed */
      }
    }
    ui.admin.lastUpdatedAt = Date.now();
    ui.admin.error = '';
  } catch (error) {
    ui.admin.error = error instanceof Error ? error.message : 'Хаб не ответил.';
  } finally {
    ui.admin.busy = false;
    if (ui.modal?.type === 'admin') renderModal({ focus: false });
  }
};

const openAdminFile = async (path) => {
  const clean = String(path || '').trim();
  if (!clean) return;
  ui.admin.fileBusy = true;
  if (ui.modal?.type === 'admin') renderModal({ focus: false });
  try {
    const file = await store.adminReadFile(clean);
    ui.admin.fileCreating = false;
    ui.admin.filePath = file.path;
    ui.admin.fileDraftPath = file.path;
    ui.admin.fileContent = file.content ?? '';
    ui.admin.fileDirty = false;
    ui.admin.fileMeta = file;
  } catch (error) {
    playSound('error');
    toast(error instanceof Error ? error.message : 'Не удалось прочитать файл.', 'error');
  } finally {
    ui.admin.fileBusy = false;
    if (ui.modal?.type === 'admin') renderModal({ focus: false });
  }
};

const pickAdminTextFile = (accept = '.json,.txt,.md,.cfg,.ini,.log,.csv') =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    input.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none';
    let settled = false;
    const done = (file) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file ?? null);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => done(null), { once: true });
    document.body.append(input);
    input.click();
  });

const adminUploadFile = async () => {
  const file = await pickAdminTextFile();
  if (!file) return;
  try {
    const text = await file.text();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'uploaded.txt';
    const folder = safeName.endsWith('.json') ? 'config' : 'uploads';
    const targetPath = `${folder}/${safeName}`;
    const saved = await store.adminWriteFile(targetPath, text);
    ui.admin.fileCreating = false;
    ui.admin.filePath = saved.path;
    ui.admin.fileDraftPath = saved.path;
    ui.admin.fileContent = saved.content ?? text;
    ui.admin.fileDirty = false;
    ui.admin.fileMeta = saved;
    await refreshAdmin();
    toast(`Файл ${saved.path} загружен на сервер.`);
  } catch (error) {
    playSound('error');
    toast(error instanceof Error ? error.message : 'Не удалось загрузить файл.', 'error');
  }
};

const adminImportBackup = async () => {
  const file = await pickAdminTextFile('.json,application/json');
  if (!file) return;
  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('Некорректный JSON-файл.');
    await store.adminServerAction('import-snapshot', { snapshot: parsed });
    if (parsed.settings && typeof parsed.settings === 'object' && 'motd' in parsed.settings) {
      ui.admin.motdDraft = parsed.settings.motd ?? '';
    }
    const stamp = new Date().toISOString().slice(0, 10);
    await store.adminWriteFile(`backups/import-${stamp}.json`, JSON.stringify(parsed, null, 2));
    await refreshAdmin();
    toast('Резервная копия импортирована в файлы сервера.');
  } catch (error) {
    playSound('error');
    toast(error instanceof Error ? error.message : 'Не удалось импортировать JSON.', 'error');
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
      lobbies: data.lobbies ?? [],
      files: data.files ?? [],
      events: data.events ?? [],
    },
    null,
    1,
  );
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `sages-admin-${new Date().toISOString().slice(0, 10)}.json`;
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

  /* Партии: создание комнаты, вход по коду и правка мира мастером.
     Размер приходит строкой «1600x1000» — хаб принимает только размеры
     из своего списка (LOBBY_SIZES), поэтому чужое число здесь не
     выдумываем: что выбрано в списке, то и отправляем. */
  'party-create': (form, fields) =>
    withBusy(form, async () => {
      const [width, height] = String(fields.size.value).split('x').map(Number);
      ui.party.busy = true;
      renderModal({ focus: false });
      try {
        const data = await lobby.createLobby({
          title: fields.title.value.trim(),
          seed: fields.seed.value.trim(),
          width,
          height,
        });
        ui.party.busy = false;
        setFormError(form, '');
        playSound('success');
        toast(
          `Партия «${partyName(data.lobby)}» создана. Код ${data.lobby.code} — позовите друзей.`,
        );
      } catch (error) {
        ui.party.busy = false;
        throw error;
      }
      renderModal({ focus: false });
    }),

  'party-join': (form, fields) =>
    withBusy(form, async () => {
      const data = await lobby.joinLobby(fields.code.value);
      setFormError(form, '');
      playSound('connect');
      toast(`Вы вошли в партию «${partyName(data.lobby)}».`);
      renderModal({ focus: false });
    }),

  'party-params': (form, fields) =>
    withBusy(form, async () => {
      const [width, height] = String(fields.size.value).split('x').map(Number);
      const data = await lobby.setLobbyParams({
        title: fields.title.value.trim(),
        seed: fields.seed.value.trim(),
        width,
        height,
      });
      setFormError(form, '');
      playSound('success');
      toast(`Мир партии «${partyName(data.lobby)}» обновлён.`);
      renderModal({ focus: false });
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

  'admin-motd': (form, fields) =>
    withBusy(form, async () => {
      const text = (fields.motd?.value ?? ui.admin.motdDraft ?? '').trim();
      await store.adminSetMotd(text);
      ui.admin.motdDraft = text;
      setFormError(form, '');
      playSound('success');
      toast(text ? 'Объявление сервера сохранено.' : 'Объявление сервера очищено.');
      await refreshAdmin();
    }),

  'admin-file-save': (form, fields) =>
    withBusy(form, async () => {
      const targetPath = (fields.path?.value ?? ui.admin.fileDraftPath ?? ui.admin.filePath ?? '').trim();
      const content = fields.content ? fields.content.value : ui.admin.fileContent;
      if (!targetPath) throw new Error('Укажите путь файла.');
      if (ui.admin.filePath && !ui.admin.fileCreating && !ui.admin.fileMeta?.system && ui.admin.filePath !== targetPath) {
        await store.adminRenameFile(ui.admin.filePath, targetPath);
      }
      const saved = await store.adminWriteFile(targetPath, content);
      ui.admin.fileCreating = false;
      ui.admin.filePath = saved.path;
      ui.admin.fileDraftPath = saved.path;
      ui.admin.fileContent = saved.content ?? content;
      ui.admin.fileDirty = false;
      ui.admin.fileMeta = saved;
      if (saved.path === 'config/settings.json') {
        try {
          const parsed = JSON.parse(saved.content || '{}');
          if (typeof parsed.motd === 'string') ui.admin.motdDraft = parsed.motd;
        } catch {
          /* ignore */
        }
      }
      setFormError(form, '');
      playSound('success');
      toast(`Файл ${saved.path} сохранён на сервере.`);
      await refreshAdmin();
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
  if (role === 'admin-file-search') {
    ui.admin.fileQuery = event.target.value;
    renderModal({ focus: false });
  }
  if (role === 'admin-file-path') {
    ui.admin.fileDraftPath = event.target.value;
    ui.admin.fileDirty = true;
  }
  if (role === 'admin-file-content') {
    ui.admin.fileContent = event.target.value;
    ui.admin.fileDirty = true;
  }
  if (role === 'admin-motd-input') ui.admin.motdDraft = event.target.value;
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
  if (role === 'party-title') ui.party.title = event.target.value;
  if (role === 'party-seed') ui.party.seed = event.target.value;
  /* Код партии приводим к виду хаба (XXXX-XXXX; в алфавите кода нет знаков,
     которые путают при диктовке): человек вставляет его из мессенджера
     в любом регистре и с пробелами. */
  if (role === 'party-code') {
    const raw = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const formatted = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4, 8)}` : raw;
    event.target.value = formatted;
    ui.party.code = formatted;
  }
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

document.addEventListener('wheel', (event) => {
  if (ui.modal?.type !== 'avatar-preview' || !event.target.closest?.('[data-role="avatar-frame"]')) return;
  event.preventDefault();
  ui.avatarCrop.zoom = clamp(ui.avatarCrop.zoom + (event.deltaY < 0 ? 0.1 : -0.1), 1, 3);
  updateAvatarEditor();
}, { passive: false });

document.addEventListener('change', (event) => {
  /* Размер карты партии: черновик обязан его запомнить, иначе живое
     обновление состава перерисует окно и вернёт прежнее значение. */
  if (event.target.dataset?.role === 'party-size') {
    ui.party.size = event.target.value;
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

  /* --- партии: комнаты для игры -------------------------------
     Комнату ведёт хаб (server/hub-lobby.mjs), состояние приносит живой
     канал (src/data/lobby.js). Поэтому действия здесь короткие: сказать
     хабу, что человек сделал, и показать его ответ. Ошибки хаба
     («уже в другом лобби», «нет свободных мест») доходят до игрока
     текстом — молча проглатывать их нельзя. */

  'open-parties': () => {
    const me = store.getCurrentUser();
    const room = lobby.lobbyState().lobby;
    /* Черновик мира мастера берём из его же комнаты: открыв форму,
       человек видит текущие значения, а не пустые поля. */
    ui.party =
      room && room.role === 'master'
        ? {
            ...partyDraft(),
            title: room.title ?? '',
            seed: room.seed ?? '',
            size: partySizeValue(room.width, room.height),
          }
        : { ...partyDraft(), title: me ? lobby.defaultPartyTitle(me.name) : '' };
    openModal('parties');
    /* Состав мог измениться, пока окно было закрыто (другое устройство,
       переподключение): перечитываем у хаба, не дожидаясь кадра канала. */
    if (backendReady && store.isHub() && me) {
      lobby.connectLobby();
      lobby.refreshLobby().catch(() => {});
    }
  },

  'party-tab': (el) => {
    playSound('select');
    ui.party.tab = el.dataset.tab === 'join' ? 'join' : 'create';
    renderModal();
  },

  'party-random-seed': () => {
    playSound('select');
    ui.party.seed = lobby.randomPartySeed();
    renderModal({ focus: false });
  },

  'party-copy-code': async (el) => {
    const ok = await copyText(el.dataset.code);
    toast(
      ok
        ? `Код партии ${el.dataset.code} скопирован. Передайте его друзьям.`
        : 'Не получилось скопировать — выделите код вручную.',
      ok ? 'ok' : 'error',
    );
  },

  'party-invite': async (el) => {
    try {
      const data = await lobby.inviteFriend(el.dataset.id);
      playSound('success');
      toast(`${data.invited?.name ?? 'Игрок'} приглашён в партию.`);
    } catch (error) {
      playSound('error');
      toast(
        error instanceof Error ? error.message : 'Не удалось отправить приглашение.',
        'error',
      );
    }
  },

  'party-invite-accept': async (el) => {
    try {
      const data = await lobby.acceptInvite(el.dataset.id);
      playSound('connect');
      toast(`Вы вошли в партию «${partyName(data.lobby)}».`);
    } catch (error) {
      playSound('error');
      toast(
        error instanceof Error ? error.message : 'Не удалось войти в партию.',
        'error',
      );
      /* Приглашение могло истечь или комната — закрыться: перечитаем,
         чтобы не показывать строку, которой на хабе уже нет. */
      lobby.refreshLobby().catch(() => {});
    }
  },

  'party-invite-decline': async (el) => {
    try {
      await lobby.declineInvite(el.dataset.id);
      toast('Приглашение отклонено.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось отклонить приглашение.', 'error');
    }
  },

  'party-leave': async () => {
    try {
      partyLeftByMe = true;
      await lobby.leaveLobby();
      playSound('back');
      toast('Вы вышли из партии.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось выйти из партии.', 'error');
    }
  },

  /* Мастер выходит последним: его выход закрывает комнату для всех,
     поэтому спрашиваем подтверждение. */
  'party-close': () => {
    const room = lobby.lobbyState().lobby;
    ui.confirm = {
      title: 'Закрыть партию?',
      text: `Комната «${partyName(room)}» закроется для всех участников: ${
        room?.members?.length ?? 1
      } человек(а) получат сообщение о закрытии. Вернуться в неё можно только новой партией.`,
      label: 'Закрыть партию',
      action: 'confirm-party-close',
    };
    ui.modal = { type: 'confirm' };
    renderModal();
  },

  'confirm-party-close': async () => {
    try {
      partyLeftByMe = true;
      await lobby.leaveLobby();
      playSound('back');
      closeModal();
      toast('Партия закрыта.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось закрыть партию.', 'error');
    }
  },

  'party-kick': (el) => {
    const member = lobby.lobbyState().lobby?.members?.find((item) => item.id === el.dataset.id);
    if (!member) return;
    ui.confirm = {
      title: 'Исключить из партии?',
      text: `${member.name} потеряет место в комнате и сможет вернуться только по коду, если место освободится.`,
      label: 'Исключить',
      action: 'confirm-party-kick',
      id: member.id,
    };
    ui.modal = { type: 'confirm' };
    renderModal();
  },

  'confirm-party-kick': async (el) => {
    try {
      await lobby.kickMember(el.dataset.id);
      playSound('success');
      toast('Игрок исключён из партии.');
      ui.confirm = null;
      ui.modal = { type: 'parties' };
      renderModal({ focus: false });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось исключить игрока.', 'error');
    }
  },

  /* --- панель админа --- */

  'admin-tap': (el) => {
    if (registerAdminTap(el)) openAdminGate();
  },

  'admin-tab': (el) => {
    playSound('select');
    ui.admin.tab = el.dataset.tab;
    ui.admin.openId = null;
    if (ui.admin.tab === 'files' && !ui.admin.filePath && !ui.admin.fileDraftPath && ui.admin.data?.files?.length) {
      openAdminFile(ui.admin.data.files[0].path);
      return;
    }
    renderModal({ focus: false });
  },

  'admin-go': (el) => {
    playSound('select');
    const tab = el.dataset.tab;
    if (!['overview', 'players', 'requests', 'files', 'events', 'system'].includes(tab)) return;
    ui.admin.tab = tab;
    ui.admin.openId = null;
    if (tab === 'players') {
      ui.admin.filter = ['online', 'active', 'today', 'offline', 'banned'].includes(el.dataset.filter) ? el.dataset.filter : 'all';
      ui.admin.sort = ['name', 'seen', 'created'].includes(el.dataset.sort) ? el.dataset.sort : 'name';
      ui.admin.query = '';
      ui.admin.limit = 60;
    }
    if (tab === 'files' && !ui.admin.filePath && !ui.admin.fileDraftPath && ui.admin.data?.files?.length) {
      openAdminFile(ui.admin.data.files[0].path);
      return;
    }
    renderModal();
  },

  'admin-file-open': (el) => {
    playSound('select');
    openAdminFile(el.dataset.path);
  },

  'admin-file-new': () => {
    playSound('select');
    const defaultPath = 'notes/server-note.md';
    const defaultContent = '# Заметка сервера\n\n';
    ui.admin.fileCreating = true;
    ui.admin.filePath = '';
    ui.admin.fileDraftPath = defaultPath;
    ui.admin.fileContent = defaultContent;
    ui.admin.fileDirty = true;
    ui.admin.fileMeta = {
      path: defaultPath,
      name: 'server-note.md',
      category: 'custom',
      system: false,
      writable: true,
      deletable: false,
      updatedAt: Date.now(),
      size: defaultContent.length,
    };
    renderModal({ focus: false });
  },

  'admin-file-template': (el) => {
    playSound('select');
    const tplId = el.dataset.template;
    const tplPath = el.dataset.path;
    const found = ADMIN_FILE_TEMPLATES.find(([id, path]) => id === tplId || path === tplPath) || ADMIN_FILE_TEMPLATES[0];
    const [, path, , content] = found;
    ui.admin.fileCreating = true;
    ui.admin.filePath = '';
    ui.admin.fileDraftPath = path;
    ui.admin.fileContent = content;
    ui.admin.fileDirty = true;
    ui.admin.fileMeta = {
      path,
      name: path.split('/').pop(),
      category: 'custom',
      system: false,
      writable: true,
      deletable: false,
      updatedAt: Date.now(),
      size: content.length,
    };
    renderModal({ focus: false });
    toast('Шаблон подставлен — нажмите «Сохранить на сервере», чтобы записать файл.');
  },

  'admin-file-filter': (el) => {
    ui.admin.fileFilter = el.dataset.value || 'all';
    renderModal({ focus: false });
  },

  'admin-file-format': () => {
    try {
      const parsed = JSON.parse(ui.admin.fileContent || '{}');
      ui.admin.fileContent = JSON.stringify(parsed, null, 2);
      ui.admin.fileDirty = true;
      renderModal({ focus: false });
      toast('JSON отформатирован.');
    } catch {
      playSound('error');
      toast('Ошибка синтаксиса JSON — проверьте скобки и запятые.', 'error');
    }
  },

  'admin-file-copy': async () => {
    const ok = await copyText(ui.admin.fileContent || '');
    toast(
      ok ? 'Содержимое файла скопировано.' : 'Не получилось скопировать — выделите вручную.',
      ok ? 'ok' : 'error',
    );
  },

  'admin-file-download': () => {
    const path = ui.admin.fileDraftPath || ui.admin.filePath || 'server-file.txt';
    const fileName = path.split('/').pop() || 'server-file.txt';
    const mime = fileName.endsWith('.json') ? 'application/json' : 'text/plain;charset=utf-8';
    const url = URL.createObjectURL(new Blob([ui.admin.fileContent || ''], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast(`Файл ${fileName} скачан.`);
  },

  'admin-file-upload': () => adminUploadFile(),

  'admin-import-backup': () => adminImportBackup(),

  'admin-file-delete': (el) => {
    const path = el.dataset.path || ui.admin.filePath;
    if (!path) return;
    ui.confirm = {
      title: 'Удалить файл сервера?',
      text: `Файл «${path}» будет удалён с сервера без возможности восстановления.`,
      label: 'Удалить',
      action: 'admin-file-delete-run',
      id: path,
    };
    ui.modal = { type: 'confirm' };
    renderModal();
  },

  'admin-file-delete-run': async (el) => {
    const path = el.dataset.id;
    try {
      await store.adminDeleteFile(path);
      if (ui.admin.filePath === path || ui.admin.fileDraftPath === path) {
        ui.admin.fileCreating = false;
        ui.admin.filePath = '';
        ui.admin.fileDraftPath = '';
        ui.admin.fileContent = '';
        ui.admin.fileDirty = false;
        ui.admin.fileMeta = null;
      }
      ui.modal = { type: 'admin' };
      renderModal();
      await refreshAdmin();
      toast(`Файл ${path} удалён.`);
    } catch (error) {
      playSound('error');
      toast(error instanceof Error ? error.message : 'Не получилось удалить файл.', 'error');
    }
  },

  'admin-motd-clear': () =>
    runAdminAction(async () => {
      await store.adminSetMotd('');
      ui.admin.motdDraft = '';
    }, 'Объявление сервера очищено.'),

  'admin-lobby-close': (el) =>
    runAdminAction(
      () => store.adminServerAction('close-lobby', { id: el.dataset.id }),
      'Партия принудительно закрыта.',
    ),

  'admin-lobby-close-all': () =>
    runAdminAction(
      () => store.adminServerAction('close-all-lobbies'),
      'Все активные партии закрыты.',
    ),

  'admin-kick-all': () => {
    ui.confirm = {
      title: 'Отключить все сессии?',
      text: 'Все авторизованные устройства на хабе будут разлогинены и отключены от живого соединения. Игрокам потребуется войти заново.',
      label: 'Сбросить сессии',
      action: 'admin-kick-all-run',
      id: '',
    };
    ui.modal = { type: 'confirm' };
    renderModal();
  },

  'admin-kick-all-run': async () => {
    try {
      await store.adminServerAction('kick-all');
      ui.modal = { type: 'admin' };
      renderModal();
      await refreshAdmin();
      toast('Все активные сессии сброшены.');
    } catch (error) {
      playSound('error');
      toast(error instanceof Error ? error.message : 'Не получилось сбросить сессии.', 'error');
    }
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
  'open-direct', 'open-hub', 'open-parties', 'party-tab',
  'close-modal', 'admin-tap', 'admin-tab', 'admin-go',
  'admin-back', 'admin-lock', 'auth-tab',
]);


document.addEventListener('click', (event) => {
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

/* Alt + 1…4 — разделы навигации: на ПК до пунктов меню можно не тянуться
   мышью. Сочетание не работает, пока открыто окно: переключать раздел за
   диалогом — значит потерять несохранённое, сначала Esc. */
document.addEventListener('keydown', (event) => {
  if (ui.modal || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const hit = NAV_HOTKEYS.find((item) => item.code === event.code);
  if (!hit) return;
  event.preventDefault();
  actions[hit.action]?.();
});

document.addEventListener('keydown', (event) => {
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
  /* Партии живут на хабе: канал комнаты поднимаем сразу после проверки,
     чтобы приглашение дошло, даже если окно «Партии» ни разу не открывали. */
  syncLobby();
  /* Ссылка с `#admin` (или `?admin=1`) открывает панель сразу: так в неё
     удобно заходить на телефоне, где нет клавиатуры для сочетания клавиш.
     Ключ всё равно спросят. */
  if (adminFromUrl()) openAdminGate();
};
initializeConnection();
