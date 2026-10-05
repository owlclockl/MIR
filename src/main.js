import './style.css';

/* Название игры. Разбито на две строки — так оно читается и в шапке, и в заголовке. */
const TITLE = { lead: 'The civilization', tail: 'of the sages' };
const TITLE_FULL = `${TITLE.lead} ${TITLE.tail}`;

/* Иконки Lucide (ISC). Только контуры, 24×24, stroke = currentColor. */
const ICONS = {
  sigil:
    '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M12 1.6v2.6M12 19.8v2.6M1.6 12h2.6M19.8 12h2.6"/>',
  settings:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>',
  play: '<path d="M6 3 20 12 6 21Z"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  userPlus:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
};

const icon = (name, className = '') =>
  `<svg class="icon${className ? ` ${className}` : ''}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

const PRESENCE = {
  playing: { label: 'В игре', modifier: 'live' },
  idle: { label: 'В меню', modifier: 'idle' },
  offline: { label: 'Не в сети', modifier: 'off' },
};

const friends = [
  { initials: 'AK', name: 'AKIRA', presence: 'playing' },
  { initials: 'NV', name: 'NOVA', presence: 'idle' },
  { initials: 'GR', name: 'GREY', presence: 'offline' },
];

const online = friends.filter((friend) => friend.presence !== 'offline').length;

const friendRow = ({ initials, name, presence }) => {
  const { label, modifier } = PRESENCE[presence];
  return `
    <button class="friend friend--${modifier}" type="button">
      <span class="avatar avatar--sm" aria-hidden="true">${initials}</span>
      <span class="friend__text">
        <strong class="friend__name" translate="no">${name}</strong>
        <small class="friend__state">${label}</small>
      </span>
      <span class="dot dot--${modifier}" aria-hidden="true"></span>
    </button>`;
};

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

      <div class="topbar__side topbar__side--end">
        <p class="status">
          <span class="dot dot--live" aria-hidden="true"></span>
          <span>В сети</span>
        </p>
        <span class="topbar__divider" aria-hidden="true"></span>
        <button class="profile" type="button">
          <span class="avatar" aria-hidden="true">ИГ</span>
          <span class="profile__text">
            <strong class="profile__name">Игрок</strong>
            <small class="profile__meta">Уровень 12</small>
          </span>
          ${icon('chevron', 'icon--chevron')}
        </button>
      </div>
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

    <aside class="rail" aria-labelledby="rail-title">
      <div class="rail__head">
        <div class="rail__heading">
          <p class="eyebrow">Сообщество</p>
          <h2 class="rail__title" id="rail-title">
            Друзья <span class="rail__count">${online} / ${friends.length}</span>
          </h2>
        </div>
        <button class="icon-button icon-button--sm" type="button" aria-label="Добавить друга">
          ${icon('userPlus')}
        </button>
      </div>

      <div class="rail__list">
        ${friends.map(friendRow).join('')}
      </div>

      <div class="rail__foot">
        <button class="ghost-button" type="button">
          ${icon('users')}
          <span>Все друзья</span>
          ${icon('chevron', 'icon--chevron')}
        </button>
      </div>
    </aside>

    <footer class="footer">
      <span>Версия 0.1.0</span>
      <span class="footer__name" lang="en" translate="no">© 2026 ${TITLE_FULL}</span>
    </footer>
  </div>
`;
