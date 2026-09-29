/**
 * Оркестратор приложения: единственный экран — главное меню.
 * Лобби, друзья и приглашения живут в правой панели (sidebar.js).
 */
class App {
  constructor() {
    this.bindGlobalEvents();
    this.bindSettingsModal();
    document.body.classList.add('screen-menu');
  }

  bindGlobalEvents() {
    // Логотип — возврат к меню (меню и так единственный экран, просто закрываем модалки)
    document.getElementById('logoBrand')?.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    });

    // Колокольчик уведомлений в шапке
    document.getElementById('headerNotifBtn')?.addEventListener('click', () => {
      window.sidebarController.toggleSidebar(true);
      window.sidebarController.switchTab('invites');
    });

    // Закрытие модальных окон
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });

    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.modal-overlay')?.classList.remove('open');
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
      }
    });
  }

  bindSettingsModal() {
    const overlay = document.getElementById('settingsOverlay');
    document.getElementById('settingsBtn')?.addEventListener('click', () => overlay?.classList.add('open'));
    document.getElementById('closeSettings')?.addEventListener('click', () => overlay?.classList.remove('open'));
  }

  // ================= Уведомления =================
  showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `cs-toast ${type}-toast`;
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-msg">${message}</div>
      </div>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  }

  showInviteToast(invite) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'cs-toast invite-toast';
    toast.innerHTML = `
      <div>${window.renderAvatar(invite.from_user?.avatar, invite.from_user?.avatar_frame, 38)}</div>
      <div class="toast-content">
        <div class="toast-title">Приглашение в лобби</div>
        <div class="toast-msg"><strong>${invite.from_user?.display_name}</strong> приглашает вас в «${invite.room?.title}»</div>
        <div class="toast-actions">
          <button class="toast-btn accept toast-accept-btn">Принять</button>
          <button class="toast-btn decline toast-decline-btn">Отклонить</button>
        </div>
      </div>
    `;
    container.appendChild(toast);

    toast.querySelector('.toast-accept-btn')?.addEventListener('click', async () => {
      try {
        await window.api.respondInvite(invite.id, 'accept');
        toast.remove();
        window.sidebarController.toggleSidebar(true);
        window.sidebarController.switchTab('lobby');
      } catch (err) {
        alert(err.message);
      }
    });

    toast.querySelector('.toast-decline-btn')?.addEventListener('click', async () => {
      try {
        await window.api.respondInvite(invite.id, 'decline');
        toast.remove();
      } catch (err) {}
    });

    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 12000);
  }
}

window.app = new App();
