/* ===========================================================
   Разметка лобби: экран «Лобби» и плашка статуса на экране карты.

   Модуль только рисует. Состояние приходит параметрами, действия — через
   data-action, которые обрабатывает main.js. Плашка статуса обновляется
   на месте (см. paintLobbyChip в main.js): перерисовка страницы пересоздаёт
   iframe с картой, поэтому её нельзя делать на каждое событие сети.
   =========================================================== */

import { escapeHtml } from './dom.js';
import { icon } from './icons.js';
import { seedArtSvg } from './seed-art.js';

const CODE_LENGTH = 9; // XXXX-XXXX

const ROLE_LABEL = { master: 'Мастер', player: 'Игрок' };

const STATUS_LABEL = {
  online: 'В сети',
  connecting: 'Подключение…',
  offline: 'Нет связи — переподключаюсь',
  idle: 'Не в сети',
};

const formatRtt = (rtt) => (Number.isFinite(rtt) ? ` · ${Math.round(rtt)} мс` : '');

/** Плашка статуса лобби для экрана карты. Пустая строка — лобби не открыто. */
export const lobbyChipHtml = (state, session) => {
  if (!session) return '';
  const online = state.status === 'online';
  const status = `${STATUS_LABEL[state.status] ?? STATUS_LABEL.idle}${online ? formatRtt(state.rtt) : ''}`;
  let line;
  if (session.role === 'master') {
    const count = (state.lobby?.members ?? []).filter((member) => member.online).length;
    line = state.live ? `Правки видны игрокам сразу · на связи ${count}` : `Вы ведёте карту · на связи ${count}`;
  } else if (state.live) {
    line = state.applying ? 'Мастер вносит правки · получаю полную карту…' : 'Мастер вносит правки · видно сразу';
  } else if (state.masterStage && Date.now() - state.masterStage.at < 6000) {
    const { name, index, total } = state.masterStage;
    line = `Мастер строит карту: ${escapeHtml(name || '')} ${index}/${total}`;
  } else {
    line = 'Карта мастера';
  }
  return `<span class="lobby-chip lobby-chip--${online ? 'online' : 'offline'}${state.live ? ' lobby-chip--live' : ''}" data-role="lobby-chip-text"><i aria-hidden="true"></i><span class="lobby-chip__line">${line}</span><span class="lobby-chip__status">${escapeHtml(status)}</span></span>`;
};

const sizeButtons = (draft) =>
  draft.sizes
    .map((size) => {
      const active = size.width === draft.width && size.height === draft.height;
      return `<button class="world-size${active ? ' is-active' : ''}" type="button" role="radio" aria-checked="${active}" data-action="world-lobby-size" data-size="${size.id}"><strong>${size.label}</strong><span>${size.width} × ${size.height}</span></button>`;
    })
    .join('');

const createCardHtml = (draft) => `
  <section class="world-card lobby-card" aria-labelledby="lobby-create-title">
    <header class="world-card__heading world-card__heading--compact">
      <div><p class="world-card__eyebrow">Новое лобби</p><h3 id="lobby-create-title">${icon('crown', 'icon--sm')}<span>Создать лобби</span></h3></div>
    </header>
    <p class="lobby-card__lead">Вы станете мастером. Ваша карта уходит всем, кто вошёл в лобби, и её правки видны каждому.</p>
    <label class="field world-field">
      <span class="field__label">Seed карты</span>
      <span class="world-seed-row">
        <input class="input input--code" type="text" maxlength="48" autocomplete="off" spellcheck="false" data-role="lobby-seed" value="${escapeHtml(draft.seed)}" />
        <button class="icon-button icon-button--sm world-seed-random" type="button" data-action="world-lobby-seed-random" aria-label="Случайный seed" title="Случайный seed">${icon('dices', 'icon--xs')}</button>
        <span class="world-seed-art" data-role="world-seed-art" title="Узор этого seed — настоящий мир построит Azgaar">${seedArtSvg(draft.seed, { id: 'lobby' })}</span>
      </span>
    </label>
    <div class="world-field">
      <span class="field__label" id="lobby-size-label">Размер карты</span>
      <div class="world-size-list" role="radiogroup" aria-labelledby="lobby-size-label">${sizeButtons(draft)}</div>
    </div>
    <button class="solid-button world-generate" type="button" data-action="world-lobby-create"><span>Создать лобби</span>${icon('plus', 'icon--xs')}</button>
  </section>`;

const joinCardHtml = () => `
  <section class="world-card lobby-card" aria-labelledby="lobby-join-title">
    <header class="world-card__heading world-card__heading--compact">
      <div><p class="world-card__eyebrow">Код мастера</p><h3 id="lobby-join-title">${icon('key', 'icon--sm')}<span>Войти по коду</span></h3></div>
    </header>
    <label class="field world-field">
      <span class="field__label">Код лобби</span>
      <input class="input input--code" type="text" maxlength="${CODE_LENGTH}" autocomplete="off" spellcheck="false" data-role="lobby-code" placeholder="XXXX-XXXX" />
      <span class="world-field__hint">Код выдаёт мастер. Его можно скопировать в лобби мастера.</span>
    </label>
    <button class="solid-button world-generate" type="button" data-action="world-lobby-join"><span>Войти в лобби</span>${icon('userPlus', 'icon--xs')}</button>
  </section>`;

const invitesHtml = (invites) => {
  if (!invites.length) return '';
  return `
  <section class="world-card lobby-card" aria-labelledby="lobby-invites-title">
    <header class="world-card__heading world-card__heading--compact">
      <div><p class="world-card__eyebrow">Приглашения</p><h3 id="lobby-invites-title">${icon('users', 'icon--sm')}<span>Вас позвали</span></h3></div>
    </header>
    <ul class="lobby-list">
      ${invites
        .map(
          (invite) => `
        <li class="lobby-list__item">
          <span class="lobby-list__text"><strong translate="no">${escapeHtml(invite.fromName || 'Друг')}</strong><small>Код <code translate="no">${escapeHtml(invite.code)}</code></small></span>
          <span class="lobby-list__actions">
            <button class="mini-button mini-button--accent" type="button" data-action="world-lobby-accept" data-lobby-id="${escapeHtml(invite.lobbyId)}">${icon('check', 'icon--xs')}<span>Принять</span></button>
            <button class="mini-button" type="button" data-action="world-lobby-decline" data-lobby-id="${escapeHtml(invite.lobbyId)}">${icon('x', 'icon--xs')}<span>Отклонить</span></button>
          </span>
        </li>`,
        )
        .join('')}
    </ul>
  </section>`;
};

const memberHtml = (member, { avatar, isMasterView, selfId }) => {
  const user = avatar(member);
  const kick =
    isMasterView && member.id !== selfId
      ? `<button class="mini-button mini-button--danger" type="button" data-action="world-lobby-kick" data-id="${escapeHtml(member.id)}" aria-label="Исключить ${escapeHtml(member.name)}" title="Исключить из лобби">${icon('x', 'icon--xs')}</button>`
      : '';
  return `
    <li class="lobby-list__item lobby-member${member.online ? '' : ' is-offline'}">
      ${user}
      <span class="lobby-list__text"><strong translate="no">${escapeHtml(member.name)}</strong><small>${member.master ? 'Мастер' : 'Игрок'} · ${member.online ? 'в сети' : 'не в сети'}</small></span>
      ${kick}
    </li>`;
};

const friendsHtml = (friends, members, avatar) => {
  if (!friends.length) return '<p class="lobby-card__lead">Друзей пока нет. Добавьте друзей в меню, и они появятся здесь.</p>';
  const inLobby = new Set(members.map((member) => member.id));
  return `<ul class="lobby-list">${friends
    .map((friend) => {
      const already = inLobby.has(friend.id);
      return `
        <li class="lobby-list__item">
          ${avatar(friend)}
          <span class="lobby-list__text"><strong translate="no">${escapeHtml(friend.name)}</strong><small>${already ? 'уже в лобби' : 'не в лобби'}</small></span>
          ${already ? '' : `<button class="mini-button mini-button--accent" type="button" data-action="world-lobby-invite" data-id="${escapeHtml(friend.id)}">${icon('userPlus', 'icon--xs')}<span>Пригласить</span></button>`}
        </li>`;
    })
    .join('')}</ul>`;
};

const lobbyHeadHtml = (lobby, session, state) => {
  const isMaster = lobby.role === 'master';
  return `
  <section class="world-card lobby-card lobby-card--head" aria-labelledby="lobby-title">
    <header class="world-card__heading">
      <div>
        <p class="world-card__eyebrow">Лобби · ${isMaster ? 'вы мастер' : 'вы игрок'}</p>
        <h2 id="lobby-title">${icon(isMaster ? 'crown' : 'eye', 'icon--sm')}<span>Код <code class="lobby-code" translate="no">${escapeHtml(lobby.code)}</code></span></h2>
      </div>
      <span class="world-tag world-tag--mode">${icon(isMaster ? 'crown' : 'eye', 'icon--xs')}<span>${ROLE_LABEL[lobby.role]}</span></span>
    </header>
    <p class="lobby-card__lead">${isMaster
      ? 'Карту видят все участники лобби. Правки, которые вы сделаете в редакторе, уходят им сами.'
      : `Мастер — ${escapeHtml(lobby.masterName || '—')}. Карта приходит от него, менять её здесь нельзя.`}</p>
    <div class="lobby-head__row">
      <span class="lobby-head__meta">${escapeHtml(lobby.seed)} · ${lobby.width} × ${lobby.height}</span>
      <span class="lobby-head__status">${escapeHtml(STATUS_LABEL[state.status] ?? '')}${state.status === 'online' ? formatRtt(state.rtt) : ''}</span>
    </div>
    <div class="lobby-head__actions">
      <button class="solid-button" type="button" data-action="world-lobby-enter-map"><span>${isMaster ? 'Открыть карту мастера' : 'Открыть карту'}</span>${icon('play', 'icon--xs')}</button>
      <button class="ghost-button" type="button" data-action="copy-code" data-code="${escapeHtml(lobby.code)}">${icon('copy', 'icon--xs')}<span>Скопировать код</span></button>
      ${isMaster ? `<button class="ghost-button" type="button" data-action="world-lobby-new-map">${icon('dices', 'icon--xs')}<span>Новая карта</span></button>` : ''}
      <button class="ghost-button${session.leaveArmed ? ' lobby-danger' : ''}" type="button" data-action="world-lobby-leave">${icon('logOut', 'icon--xs')}<span>${session.leaveArmed ? 'Точно?' : isMaster ? 'Закрыть лобби' : 'Выйти из лобби'}</span></button>
    </div>
    ${state.notice ? `<p class="lobby-notice" role="status">${escapeHtml(state.notice)}</p>` : ''}
  </section>`;
};

const membersCardHtml = (lobby, { avatar, selfId }) => {
  const isMaster = lobby.role === 'master';
  return `
  <section class="world-card lobby-card" aria-labelledby="lobby-members-title">
    <header class="world-card__heading world-card__heading--compact">
      <div><p class="world-card__eyebrow">Участники · ${lobby.members.length} из 8</p><h3 id="lobby-members-title">${icon('users', 'icon--sm')}<span>В лобби</span></h3></div>
    </header>
    <ul class="lobby-list">${lobby.members.map((member) => memberHtml(member, { avatar, isMasterView: isMaster, selfId })).join('')}</ul>
    ${isMaster ? `<h4 class="lobby-subhead">Пригласить друзей</h4>${friendsHtml(lobby.friends ?? [], lobby.members, avatar)}` : ''}
  </section>`;
};

/**
 * Экран «Лобби». ctx: { available, me, state, session, draft, friends, avatar }.
 */
export const lobbyScreenHtml = (ctx) => {
  const { available, me, state, session, draft, friends, avatar } = ctx;
  if (!me) {
    return `
      <div class="world-shell world-shell--slots">
        <section class="world-card lobby-card lobby-card--wide">
          <h2>Лобби с друзьями</h2>
          <p class="lobby-card__lead">Войдите в аккаунт: лобби привязано к нему, и друзья увидят вас в нём.</p>
          <button class="solid-button" type="button" data-action="open-auth"><span>Войти в аккаунт</span></button>
        </section>
      </div>`;
  }
  if (!available) {
    return `
      <div class="world-shell world-shell--slots">
        <section class="world-card lobby-card lobby-card--wide">
          <h2>Лобби работает через общий хаб</h2>
          <p class="lobby-card__lead">Сейчас игра не подключена к общему хабу, поэтому лобби недоступно. Откройте игру по адресу хаба или запустите её через общий сервер.</p>
        </section>
      </div>`;
  }
  const lobby = state.lobby ? { ...state.lobby, friends } : null;
  const invites = state.invites ?? [];
  if (!lobby) {
    return `
      <div class="world-shell world-shell--lobby">
        <div class="lobby-grid">
          ${createCardHtml(draft)}
          ${joinCardHtml()}
          ${invitesHtml(invites)}
        </div>
        ${state.notice ? `<p class="lobby-notice lobby-notice--page" role="status">${escapeHtml(state.notice)}</p>` : ''}
      </div>`;
  }
  return `
    <div class="world-shell world-shell--lobby">
      <div class="lobby-grid lobby-grid--room">
        ${lobbyHeadHtml(lobby, session, state)}
        ${membersCardHtml(lobby, { avatar, selfId: me.id })}
      </div>
    </div>`;
};
