/* Скрытая панель админа: аккаунты, журнал, заявки, настройки хаба.

   Почему отдельным модулем. Панель — это отдельный экран на тысячу строк:
   двадцать с лишним сборщиков разметки, графики журнала, карточка игрока,
   список аккаунтов и служебные вкладки. Пока она лежала внутри `main.js`,
   меню и служебный раздел правились в одном файле на четыре с половиной
   тысячи строк: правка графика могла задеть обработчик кнопки «Играть», и
   это не видел ни один линтер. Теперь граница видна в дереве файлов.

   Что здесь есть и чего нет. Только показ: разметку панели собирают функции
   этого модуля, а действия (запросы к хабу, подтверждения, экспорт) остаются
   в меню — панель не ходит в сеть сама и не меняет состояние. Состояние
   панели — один объект с полями `tab`, `filter`, `query`, `busy`, `data`,
   `error` и черновиками полей: он создаётся в меню (`adminState()`), потому
   что меню решает, когда панель открыта и что показать в шапке. Модуль
   получает его ссылкой через `bindAdminState` — заменять её может только
   меню, и только тем же способом (см. `resetAdminState` в `main.js`). */

import * as store from '../data/store.js';
import * as p2p from '../data/p2p.js';
import * as update from '../data/update.js';
import { icon } from './icons.js';
import { PRESENCE, escapeHtml, formatDate, formatTime, nameHue } from './dom.js';
import { dialogShell } from './dialog.js';

const VERSION = __APP_VERSION__;

let admin = null;

/* Ссылка на состояние панели. Зовётся из меню: при старте и после сброса
   состояния (выход из панели, смена ключа). */
export const bindAdminState = (state) => {
  admin = state;
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
  if (state.lastCheck) parts.push(`проверено в ${formatTime(state.lastCheck)}`);
  return parts.join(' · ');
};

/* ---------- разметка ---------------------------------------------- */

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

const stampText = (ts) => {
  if (!ts) return '';
  const date = new Date(ts);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay ? formatTime(date) : `${formatDate(ts)} ${formatTime(date)}`;
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
const untilText = (ts) => (ts ? `до ${formatDate(ts)} ${formatTime(new Date(ts))}` : 'навсегда');

const adminTabHtml = (id, label, glyph, count = null) =>
  `<button class="admin-nav__item${admin.tab === id ? ' admin-nav__item--active' : ''}" type="button" role="tab"
           id="admin-tab-${id}" aria-controls="admin-panel" aria-selected="${admin.tab === id}"
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
                   placeholder="Введите ключ доступа" value="${escapeHtml(admin.keyDraft)}"
                   data-role="admin-key" data-autofocus required />
          </span>
        </label>
        <p class="form-error" role="alert" data-role="form-error" hidden></p>
        <button class="solid-button admin-gate__submit" type="submit" data-role="submit">
          ${icon('shield', 'icon--xs')}<span>Открыть панель</span><span class="admin-gate__arrow" aria-hidden="true">↗</span>
        </button>
      </form>

      ${admin.error ? `<p class="form-note form-note--warn">${escapeHtml(admin.error)}</p>` : ''}

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
  const isDefault = admin.data?.keyDefault ?? store.adminKeyIsDefault();
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
  const data = admin.data;
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
                      value="${escapeHtml(admin.banReason)}" data-role="admin-ban-reason" />
               <select class="input input--select" name="hours" aria-label="Срок блокировки"
                       data-role="admin-ban-hours">
                 ${BAN_HOURS.map(
                   ([value, label]) =>
                     `<option value="${value}"${admin.banHours === value ? ' selected' : ''}>${label}</option>`,
                 ).join('')}
               </select>
               <button class="mini-button mini-button--danger" type="submit">Заблокировать</button>
             </div>
             <p class="form-error" role="alert" data-role="form-error" hidden></p>
           </form>`
    }

    <div class="divider" role="separator"></div>

    <form class="form" data-form="admin-rename" data-id="${user.id}" novalidate>
      <p class="eyebrow">Никнейм</p>
      <div class="code-form__row">
        <input class="input" name="name" type="text" minlength="3" maxlength="16" spellcheck="false"
               value="${escapeHtml(admin.nameDraft || user.name)}" data-role="admin-name" />
        <button class="mini-button mini-button--accent" type="submit">Переименовать</button>
      </div>
      <p class="form-error" role="alert" data-role="form-error" hidden></p>
    </form>

    <form class="form" data-form="admin-password" data-id="${user.id}" novalidate>
      <p class="eyebrow">Новый пароль</p>
      <div class="code-form__row">
        <input class="input" name="password" type="text" minlength="6" maxlength="72" autocomplete="off"
               spellcheck="false" placeholder="минимум 6 символов"
               value="${escapeHtml(admin.passDraft)}" data-role="admin-pass" />
        <button class="mini-button mini-button--accent" type="submit">Сбросить пароль</button>
      </div>
      <p class="form-error" role="alert" data-role="form-error" hidden></p>
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
  const data = admin.data;
  const users = data?.users ?? [];
  const query = admin.query.trim().toLowerCase();
  const counts = requestCounts(data?.requests ?? []);
  const found = adminSortUsers(
    users.filter(
      (user) =>
        (!query ||
          user.name.toLowerCase().includes(query) ||
          user.id.toLowerCase().includes(query) ||
          String(user.inviteCode || '').toLowerCase().includes(query)) &&
        adminMatchFilter(user, admin.filter),
    ),
    admin.sort,
  );
  const shown = found.slice(0, admin.limit);
  const rest = found.length - shown.length;
  return `
    <div class="field">
      <span class="field__label">Поиск: имя, id или код-приглашение</span>
      <input class="input" type="search" placeholder="Имя игрока…" autocomplete="off" spellcheck="false"
             value="${escapeHtml(admin.query)}" data-role="admin-search" />
    </div>
    <div class="admin-chips" role="group" aria-label="Фильтр игроков">
      ${ADMIN_FILTERS.map(([value, label]) =>
        adminChipHtml('admin-filter', value, label, admin.filter === value),
      ).join('')}
    </div>
    <div class="admin-chips admin-chips--slim" role="group" aria-label="Порядок игроков">
      <span class="admin-chips__label">Порядок:</span>
      ${ADMIN_SORTS.map(([value, label]) =>
        adminChipHtml('admin-sort', value, label, admin.sort === value),
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
  const data = admin.data;
  const requests = data?.requests ?? [];
  const users = data?.users ?? [];
  const nameOf = (id) => users.find((user) => user.id === id)?.name ?? id;
  const query = admin.requestQuery.trim().toLocaleLowerCase('ru');
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
             value="${escapeHtml(admin.requestQuery)}" data-role="admin-request-search" />
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
  const all = admin.data?.events ?? [];
  const filter = admin.eventFilter;
  const query = admin.eventQuery.trim().toLocaleLowerCase('ru');
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
             value="${escapeHtml(admin.eventQuery)}" data-role="admin-event-search" />
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
  const data = admin.data;
  const stats = data?.stats ?? {};
  const users = data?.users ?? [];
  const events = data?.events ?? [];
  const range = ADMIN_RANGES.some(([value]) => value === admin.range) ? admin.range : '14';
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
  const data = admin.data;
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
                 minlength="6" value="${escapeHtml(admin.newKeyDraft)}" data-role="admin-new-key" />
        </label>
        <label class="field">
          <span class="field__label">Повторите</span>
          <input class="input" name="repeat" type="password" autocomplete="new-password" spellcheck="false"
                 minlength="6" value="${escapeHtml(admin.repeatKeyDraft)}" data-role="admin-repeat-key" />
        </label>
      </div>
      <p class="form-error" role="alert" data-role="form-error" hidden></p>
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
  if (!admin.lastUpdatedAt) return 'Данные ещё не обновлялись';
  const date = new Date(admin.lastUpdatedAt);
  const time = formatTime(date);
  return date.toDateString() === new Date().toDateString()
    ? `Обновлено в ${time}`
    : `Обновлено ${formatDate(admin.lastUpdatedAt)} · ${time}`;
};

export const adminModalHtml = () => {
  const data = admin.data;
  if (!data) return dialogShell({ label: 'Служебный доступ к панели администратора', title: 'Доступ ограничен', size: 'admin-gate', body: adminLoginHtml() });
  const user = admin.openId ? data.users.find((item) => item.id === admin.openId) : null;
  const section = user
    ? adminCardHtml(user)
    : admin.tab === 'players'
      ? adminPlayersHtml()
      : admin.tab === 'requests'
        ? adminRequestsHtml()
        : admin.tab === 'events'
          ? adminEventsHtml()
          : admin.tab === 'system'
            ? adminSystemHtml()
            : adminOverviewHtml();
  const host = data.mode === 'hub'
    ? data.host || (typeof location !== 'undefined' ? location.origin : 'Общий хаб')
    : 'Данные только этого браузера';
  const sectionTitle = user
    ? user.name
    : ({ overview: 'Обзор', players: 'Игроки', requests: 'Заявки', events: 'Журнал событий', system: 'Система' }[admin.tab] ?? 'Обзор');
  const sectionDescription = user
    ? 'Аккаунт игрока · действия администратора'
    : admin.tab === 'overview'
      ? 'Общая картина, аналитика и быстрые действия'
      : admin.tab === 'players'
        ? 'Поиск и управление аккаунтами'
        : admin.tab === 'requests'
          ? 'Очередь заявок в друзья'
          : admin.tab === 'events'
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
            ${adminTabHtml('events', 'Журнал', 'message', data.events?.length ?? 0)}
            ${adminTabHtml('system', 'Система', 'settings')}
          </nav>
          <div class="admin-rail__footer">
            <span class="admin-rail__version">SAGES · v${escapeHtml(VERSION)}</span>
            <span class="admin-rail__host" title="${escapeHtml(host)}">${escapeHtml(host)}</span>
          </div>
        </aside>

        <main class="admin-content" id="admin-panel" role="tabpanel" aria-labelledby="admin-tab-${admin.tab}" tabindex="0">
          <header class="admin-toolbar">
            <div class="admin-toolbar__heading">
              <div class="admin-toolbar__context">
                <span class="admin-mode"><i class="dot" aria-hidden="true"></i>${modeLabel}</span>
                <span class="admin-refresh-state" aria-live="polite" aria-atomic="true">${admin.busy ? 'Синхронизация…' : escapeHtml(adminUpdatedText())}</span>
              </div>
              <h3>${escapeHtml(sectionTitle)}</h3>
              <p>${escapeHtml(sectionDescription)}</p>
            </div>
            <div class="admin-toolbar__actions" role="group" aria-label="Действия панели">
              <button class="mini-button" type="button" data-action="admin-refresh" ${admin.busy ? 'disabled' : ''}>
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
          ${admin.error ? `<p class="admin-alert" role="alert">${icon('shield', 'icon--xs')}${escapeHtml(admin.error)}${data ? ' · показан последний успешный снимок.' : ''}</p>` : ''}
          ${admin.busy && data ? '<p class="admin-progress" role="status">Получаем актуальный снимок данных…</p>' : ''}
          <div class="admin-content__body">${section}</div>
        </main>
      </div>`,
  });
};