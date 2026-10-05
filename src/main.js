import './style.css';

const icon = (name, className = '') => {
  const paths = {
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.57 15 1.7 1.7 0 0 0 3 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.57 1.7 1.7 0 0 0 10 3V3h4v.08a1.7 1.7 0 0 0 1.06 1.52 1.7 1.7 0 0 0 1.88-.34L17 4.2 19.83 7l-.06.06A1.7 1.7 0 0 0 19.43 9 1.7 1.7 0 0 0 21 10h.08v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    userPlus: '<path d="M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    close: '<path d="m18 6-12 12M6 6l12 12"/>'
  };
  return `<svg class="${className}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
};

const friends = [
  { initials: 'AK', name: 'AKIRA', status: 'В игре', online: true },
  { initials: 'NV', name: 'NOVA', status: 'В меню', online: true },
  { initials: 'GR', name: 'GREY', status: 'Не в сети', online: false },
];

document.querySelector('#app').innerHTML = `
  <div class="shell">
    <header class="topbar">
      <div class="topbar__left">
        <button class="icon-button" type="button" aria-label="Открыть настройки" data-action="settings">
          ${icon('settings')}
        </button>
        <a class="brand" href="/" aria-label="MIR — главное меню" translate="no">
          <span class="brand__mark">M</span><span>MIR</span>
        </a>
      </div>

      <nav class="primary-nav" aria-label="Основная навигация">
        <button class="play-button" type="button" data-action="play">
          ${icon('play', 'play-button__icon')}
          <span>Играть</span>
        </button>
      </nav>

      <div class="topbar__right">
        <span class="status-pill"><span class="status-dot"></span> В сети</span>
        <button class="profile" type="button" aria-label="Открыть профиль">
          <span class="profile__avatar">MI</span>
          <span class="profile__copy"><strong>Игрок</strong><small>Уровень 12</small></span>
          ${icon('chevron', 'profile__chevron')}
        </button>
      </div>
    </header>

    <main id="main" class="main-stage">
      <div class="atmosphere" aria-hidden="true">
        <span class="atmosphere__line atmosphere__line--one"></span>
        <span class="atmosphere__line atmosphere__line--two"></span>
        <span class="atmosphere__glow"></span>
      </div>
      <section class="hero" aria-labelledby="menu-title">
        <p class="eyebrow">Тактический протокол</p>
        <h1 id="menu-title">MIR</h1>
        <p class="hero__caption">Тишина — тоже оружие.</p>
      </section>
    </main>

    <aside class="friends" aria-labelledby="friends-title">
      <div class="friends__header">
        <div>
          <p class="friends__eyebrow">Сообщество</p>
          <h2 id="friends-title">Друзья <span>2 / 3</span></h2>
        </div>
        <button class="icon-button icon-button--small" type="button" aria-label="Добавить друга">
          ${icon('userPlus')}
        </button>
      </div>
      <div class="friends__list">
        ${friends.map(friend => `
          <button class="friend" type="button" aria-label="Открыть профиль ${friend.name}">
            <span class="friend__avatar">${friend.initials}</span>
            <span class="friend__info"><strong>${friend.name}</strong><small>${friend.status}</small></span>
            <span class="friend__status ${friend.online ? '' : 'friend__status--offline'}" aria-label="${friend.online ? 'В сети' : 'Не в сети'}"></span>
          </button>
        `).join('')}
      </div>
      <button class="friends__all" type="button">
        ${icon('users')}
        <span>Все друзья</span>
        ${icon('chevron')}
      </button>
    </aside>

    <div class="toast" role="status" aria-live="polite" aria-atomic="true"></div>
    <footer class="footer"><span>Версия 0.1.0</span><span>© 2026 MIR</span></footer>
  </div>
`;

const toast = document.querySelector('.toast');
let toastTimer;
function notify(message) {
  toast.textContent = message;
  toast.classList.add('toast--visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('toast--visible'), 2200);
}

document.querySelector('[data-action="play"]').addEventListener('click', () => notify('Поиск матча скоро будет доступен'));
document.querySelector('[data-action="settings"]').addEventListener('click', () => notify('Настройки скоро будут доступны'));
