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
   его не видно — вход через знак игры, сочетание клавиш или адрес
   с `#admin`, а дальше спрашивается ключ администратора. */

const ADMIN_TAPS = 5; // щелчков по знаку
const ADMIN_TAP_WINDOW = 3000; // за это время

const adminState = () => ({
  tab: 'players', // players | requests | system
  query: '',
  data: null, // снимок от store.adminSnapshot()
  openId: null, // открытая карточка игрока
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
};

let backendReady = store.isBackendInitialized?.() ?? false;

/* Разметка, которая сейчас лежит в слое окон. Сравниваем строки между
   собой, а не с `innerHTML`: окно с аватаркой — это десятки килобайт
   base64, и сериализация DOM на каждое обновление данных была заметной
   работой впустую. */
let renderedModalHtml = '';

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
  ui.avatarCrop = { x: 50, y: 50, zoom: 1, rotation: 0 };
  ui.avatarDrag = null;
  ui.codeValue = '';
  ui.chatDraft = '';
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
                 autocomplete="username" spellcheck="false" required data-autofocus ${lock} />
        </label>
        <label class="field">
          <span class="field__label">Пароль</span>
          <input class="input" name="password" type="password" minlength="6" maxlength="72"
                 autocomplete="${isLogin ? 'current-password' : 'new-password'}" required ${lock} />
        </label>
        ${
          isLogin
            ? ''
            : `<label class="field">
          <span class="field__label">Пароль ещё раз</span>
          <input class="input" name="password2" type="password" minlength="6" maxlength="72"
                 autocomplete="new-password" required ${lock} />
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

const adminLoginHtml = () => {
  const hub = store.isHub();
  return `
    <p class="hint">Служебный раздел: аккаунты, пароли, дружба, состояние хаба. Вход — по ключу администратора.</p>
    <form class="form" data-form="admin-login" novalidate>
      <label class="field">
        <span class="field__label">Ключ администратора</span>
        <input class="input" name="key" type="password" autocomplete="off" spellcheck="false"
               value="${escapeHtml(ui.admin.keyDraft)}" data-role="admin-key" data-autofocus required />
      </label>
      <p class="form-error" data-role="form-error" hidden></p>
      <button class="solid-button" type="submit" data-role="submit">${icon('shield', 'icon--xs')}<span>Войти в панель</span></button>
    </form>
    ${ui.admin.error ? `<p class="form-note form-note--warn">${escapeHtml(ui.admin.error)}</p>` : ''}
    <div class="divider" role="separator"></div>
    <p class="hint">${
      hub
        ? 'На хабе ключ задаёт его владелец: переменная <strong>MIR_ADMIN_KEY</strong> при запуске или секрет воркера на хостинге. Если ключ не задан, хаб панель не открывает.'
        : `Ключ по умолчанию — <code translate="no">${escapeHtml(
            store.DEFAULT_ADMIN_KEY,
          )}</code>. Он подходит только для аккаунтов этого браузера; смените его во вкладке «Система».`
    }</p>`;
};

const adminTabHtml = (id, label) =>
  `<button class="tab${ui.admin.tab === id ? ' tab--active' : ''}" type="button" role="tab"
           aria-selected="${ui.admin.tab === id}" data-action="admin-tab" data-tab="${id}">${label}</button>`;

const adminRowHtml = (user) => {
  const me = store.getCurrentUser();
  const offline = user.presence === 'offline';
  const isMe = me?.id === user.id;
  return `
    <button class="admin-row${offline ? ' admin-row--off' : ''}" type="button" data-action="admin-open" data-id="${user.id}">
      ${adminAvatarEl(user)}
      <span class="admin-row__text">
        <strong class="admin-row__name" translate="no">${escapeHtml(user.name)}${isMe ? ' · вы' : ''}</strong>
        <small class="admin-row__meta">${PRESENCE[user.presence]?.label ?? 'Не в сети'} · друзей ${user.friends.length}</small>
      </span>
      <code class="admin-id" translate="no">${escapeHtml(user.id)}</code>
      ${icon('chevron', 'icon--xs')}
    </button>`;
};

const adminCardHtml = (user) => {
  const friends = user.friends
    .map((id) => ui.admin.data?.users.find((item) => item.id === id) ?? { id, name: id, nameKey: id })
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const offline = user.presence === 'offline';
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
        <code class="admin-id" translate="no">${escapeHtml(user.id)}</code>
        ${
          user.inviteCode
            ? `<p class="account__meta">Код-приглашение: <code class="admin-id" translate="no">${escapeHtml(
                user.inviteCode,
              )}</code></p>`
            : ''
        }
      </div>
    </div>

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

const adminPlayersHtml = () => {
  const users = ui.admin.data?.users ?? [];
  const query = ui.admin.query.trim().toLowerCase();
  const found = users
    .filter(
      (user) =>
        !query ||
        user.name.toLowerCase().includes(query) ||
        user.id.toLowerCase().includes(query),
    )
    .sort((a, b) => {
      const pa = a.presence === 'offline' ? 1 : 0;
      const pb = b.presence === 'offline' ? 1 : 0;
      return pa - pb || a.name.localeCompare(b.name, 'ru');
    });
  const shown = found.slice(0, 60);
  return `
    <div class="field">
      <span class="field__label">Поиск по имени или id</span>
      <input class="input" type="search" placeholder="Имя игрока…" autocomplete="off" spellcheck="false"
             value="${escapeHtml(ui.admin.query)}" data-role="admin-search" />
    </div>
    <div class="admin-list">
      ${
        shown.length
          ? shown.map(adminRowHtml).join('')
          : '<p class="hint">Никого не нашлось.</p>'
      }
    </div>
    ${
      found.length > shown.length
        ? `<p class="hint">Показаны первые ${shown.length} из ${found.length}. Уточните поиск.</p>`
        : ''
    }`;
};

const adminRequestsHtml = () => {
  const requests = ui.admin.data?.requests ?? [];
  const users = ui.admin.data?.users ?? [];
  const nameOf = (id) => users.find((user) => user.id === id)?.name ?? id;
  if (!requests.length) return '<p class="hint">Заявок нет.</p>';
  return `
    <div class="admin-list">
      ${requests
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
                  data-action="admin-drop-request" data-id="${request.id}" aria-label="Удалить заявку" title="Удалить заявку">
            ${icon('trash')}
          </button>
        </div>`,
        )
        .join('')}
    </div>`;
};

const adminSystemHtml = () => {
  const data = ui.admin.data;
  const local = store.localDataInfo();
  const address = typeof location !== 'undefined' ? location.origin : '';
  const row = (key, value) => `
    <div class="admin-stat">
      <span class="admin-stat__key">${key}</span>
      <span class="admin-stat__value" translate="no">${escapeHtml(value)}</span>
    </div>`;
  return `
    <div class="admin-stats">
      ${row('Режим данных', data?.mode === 'hub' ? 'общий хаб' : 'только этот браузер')}
      ${row('Адрес хаба', data?.mode === 'hub' ? data.host || address : 'не подключён')}
      ${row('Аккаунтов на хабе', String(data?.stats?.users ?? 0))}
      ${row('Из них в сети', String(data?.stats?.online ?? 0))}
      ${row('Заявок', String(data?.stats?.requests ?? 0))}
      ${row('Дружб', String(data?.stats?.links ?? 0))}
      ${row('Аватарок', String(data?.stats?.avatars ?? 0))}
      ${row('Объём данных', `${Math.round((data?.stats?.bytes ?? 0) / 1024)} КБ`)}
      ${row('Аккаунтов в браузере', String(local.accounts))}
      ${row('Данные браузера', `${Math.round(local.bytes / 1024)} КБ · ${local.persists ? 'сохраняются' : 'только до перезагрузки'}`)}
      ${row('Обновление', navigator.serviceWorker?.controller ? 'service worker активен' : 'не активно')}
      ${row('Прямая связь', p2p.supported() ? 'WebRTC доступен' : 'WebRTC недоступен')}
      ${row('Версия', VERSION)}
    </div>

    <div class="dialog__actions dialog__actions--spread">
      <button class="mini-button" type="button" data-action="admin-refresh">
        ${icon('refresh', 'icon--xs')} Обновить
      </button>
      <button class="mini-button" type="button" data-action="admin-export">
        ${icon('download', 'icon--xs')} Скачать данные
      </button>
      <button class="mini-button" type="button" data-action="admin-lock">
        ${icon('logOut', 'icon--xs')} Заблокировать панель
      </button>
    </div>

    <div class="divider" role="separator"></div>

    ${
      data?.mode === 'hub'
        ? `<p class="hint">Ключ этого хаба задаёт его владелец: переменная <strong>MIR_ADMIN_KEY</strong> при запуске на ПК или секрет воркера на хостинге. Смена ключа из панели на хабе выключена — иначе чужой человек с одним входом получил бы все.</p>`
        : `
    <form class="form" data-form="admin-new-key" novalidate>
      <p class="eyebrow">Ключ администратора</p>
      <p class="form-note">${
        store.adminKeyIsDefault()
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
    </div>`
    }`;
};

const adminModalHtml = () => {
  const data = ui.admin.data;
  if (!data) return dialogShell({ label: 'Панель админа', title: 'Панель админа', size: 'wide', body: adminLoginHtml() });
  const user = ui.admin.openId ? data.users.find((item) => item.id === ui.admin.openId) : null;
  const body = user
    ? adminCardHtml(user)
    : `
      <div class="tabs" role="tablist" aria-label="Разделы панели">
        ${adminTabHtml('players', `Игроки · ${data.users.length}`)}
        ${adminTabHtml('requests', `Заявки · ${data.requests.length}`)}
        ${adminTabHtml('system', 'Система')}
      </div>
      ${ui.admin.tab === 'players' ? adminPlayersHtml() : ui.admin.tab === 'requests' ? adminRequestsHtml() : adminSystemHtml()}`;
  return dialogShell({
    label: 'Панель админа',
    title: user ? 'Карточка игрока' : 'Панель админа',
    size: 'wide',
    body: `<div class="dialog__body">${
      ui.admin.busy ? '<p class="hint">Обновляем данные…</p>' : ''
    }${body}</div>`,
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
  const activeId = activeIsInside ? active.dataset?.id : '';
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
              (item) => item.dataset.action === activeAction && item.dataset.id === activeId,
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
          <span class="brand__mark" data-action="admin-tap" aria-hidden="true">${icon('sigil')}</span>
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
    setFormError(form, error instanceof Error ? error.message : 'Что-то пошло не так.');
  } finally {
    submit?.removeAttribute('disabled');
  }
};

/* ---------- панель админа: загрузка и действия --------------- */

const refreshAdmin = async () => {
  ui.admin.busy = true;
  renderModal({ focus: false });
  try {
    ui.admin.data = await store.adminSnapshot();
    ui.admin.error = '';
  } catch (error) {
    ui.admin.error = error instanceof Error ? error.message : 'Хаб не ответил.';
  } finally {
    ui.admin.busy = false;
    renderModal({ focus: false });
  }
};

/** Открыть служебный раздел (знак игры, Ctrl+Shift+Alt+A или #admin). */
const openAdminGate = () => {
  ui.admin = adminState();
  ui.modal = { type: 'admin' };
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
      users: data.users,
      requests: data.requests,
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

/** Считаем быстрые щелчки по знаку игры: пять подряд открывают панель. */
const registerAdminTap = () => {
  const now = Date.now();
  adminTaps = [...adminTaps.filter((at) => now - at < ADMIN_TAP_WINDOW), now];
  if (adminTaps.length < ADMIN_TAPS) return false;
  adminTaps = [];
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
  if (role === 'admin-name') ui.admin.nameDraft = event.target.value;
  if (role === 'admin-pass') ui.admin.passDraft = event.target.value;
  if (role === 'admin-new-key') ui.admin.newKeyDraft = event.target.value;
  if (role === 'admin-repeat-key') ui.admin.repeatKeyDraft = event.target.value;
  if (role === 'admin-key') ui.admin.keyDraft = event.target.value;
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
  if (ui.modal?.type !== 'avatar-preview' || !event.target.closest('[data-role="avatar-frame"]')) return;
  event.preventDefault();
  ui.avatarCrop.zoom = clamp(ui.avatarCrop.zoom + (event.deltaY < 0 ? 0.1 : -0.1), 1, 3);
  updateAvatarEditor();
}, { passive: false });

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
    ui.avatarCrop = { x: 50, y: 50, zoom: 1, rotation: 0 };
    ui.avatarDrag = null;
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
      if (!registration) {
        if (status) status.textContent = 'Автообновление доступно только по HTTPS или localhost.';
        return;
      }
      await registration.update();
      if (status)
        status.textContent = registration.waiting
          ? 'Обновление скачано. Оно применится при следующем открытии — без перезагрузки страницы.'
          : `Проверка завершена (${VERSION}). Обновления применяются при следующем запуске.`;
      playSound('success');
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

  'admin-tap': () => {
    if (registerAdminTap()) openAdminGate();
  },

  'admin-tab': (el) => {
    ui.admin.tab = el.dataset.tab;
    ui.admin.openId = null;
    renderModal();
  },

  'admin-open': (el) => {
    ui.admin.openId = el.dataset.id;
    ui.admin.nameDraft = '';
    ui.admin.passDraft = '';
    renderModal();
  },

  'admin-back': () => {
    ui.admin.openId = null;
    renderModal();
  },

  'admin-refresh': () => refreshAdmin(),
  'admin-export': () => adminExport(),

  'admin-lock': () => {
    store.adminLogout();
    ui.admin = adminState();
    renderModal({ focus: false });
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
    store.adminResetKey();
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

/* Служебный вход с клавиатуры: Ctrl+Shift+Alt+A. Проверяем по `code`,
   чтобы сочетание работало и на русской раскладке. */
document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey && event.shiftKey && event.altKey && event.code === 'KeyA')) return;
  event.preventDefault();
  openAdminGate();
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

/* PWA: по https/localhost регистрируем service worker — меню становится
   устанавливаемым приложением и работает офлайн. С file:// (mir.html)
   и на голом http по локальной сети браузеры SW не разрешают. */
if (
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
) {
  /* Обновлённый service worker ждёт закрытия текущих вкладок. Никакой
     controllerchange не вызывает reload: открытая игра не прерывается. */
  navigator.serviceWorker.register('/sw.js').then((registration) => {
    registration.update().catch(() => {});
    setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => {});
}

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
  /* Ссылка с `#admin` (или `?admin=1`) открывает панель сразу: так в неё
     удобно заходить на телефоне, где нет ни клавиатуры, ни пяти щелчков
     по знаку. Ключ всё равно спросят. */
  if (adminFromUrl()) openAdminGate();
};
initializeConnection();
