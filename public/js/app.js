/**
 * Main Application Orchestrator for MIR RPG
 */
class App {
  constructor() {
    this.currentScreen = 'menu'; // 'menu' | 'lobby' | 'game'
    this.settings = { sound: true, music: true };
    this.init();
  }

  init() {
    this.loadSettings();
    this.bindGlobalEvents();
    this.bindSettingsModal();
    this.navigateTo('menu');
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem('mir.settings');
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
    } catch (e) {}

    window.sounds.enabled = this.settings.sound;
    window.sounds.musicEnabled = this.settings.music;
  }

  saveSettings() {
    try {
      localStorage.setItem('mir.settings', JSON.stringify(this.settings));
    } catch (e) {}
  }

  bindGlobalEvents() {
    // Logo Click -> Go to Main Menu
    document.getElementById('logoBrand')?.addEventListener('click', () => {
      window.sounds.playClick();
      this.navigateTo('menu');
    });

    // Nav Links
    document.getElementById('navMenuBtn')?.addEventListener('click', () => {
      window.sounds.playClick();
      this.navigateTo('menu');
    });

    document.getElementById('navLobbyBtn')?.addEventListener('click', () => {
      window.sounds.playClick();
      if (window.api.currentRoom) {
        this.navigateTo('lobby');
      } else {
        window.lobbyController.openBrowseModal();
      }
    });

    document.getElementById('navGameBtn')?.addEventListener('click', () => {
      window.sounds.playClick();
      if (window.api.currentRoom) {
        this.navigateTo('game');
      } else {
        this.showToast('Нет активной игры', 'Войдите в лобби и запустите партию', 'info');
      }
    });

    // Header Invites / Notifications Bell
    document.getElementById('headerNotifBtn')?.addEventListener('click', () => {
      window.sounds.playClick();
      window.sidebarController.toggleSidebar(true);
      window.sidebarController.switchTab('invites');
    });

    // Close Modals on Overlay Click / Close Buttons
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('open');
        }
      });
    });

    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        window.sounds.playClick();
        const modal = btn.closest('.modal-overlay');
        if (modal) modal.classList.remove('open');
      });
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
      }
    });
  }

  bindSettingsModal() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsOverlay = document.getElementById('settingsOverlay');
    const closeBtn = document.getElementById('closeSettings');

    settingsBtn?.addEventListener('click', () => {
      window.sounds.playClick();
      settingsOverlay?.classList.add('open');
    });

    closeBtn?.addEventListener('click', () => {
      window.sounds.playClick();
      settingsOverlay?.classList.remove('open');
    });

    // Sound Toggle
    const soundToggle = document.getElementById('soundToggle');
    if (soundToggle) {
      soundToggle.setAttribute('aria-checked', String(this.settings.sound));
      soundToggle.addEventListener('click', () => {
        this.settings.sound = !this.settings.sound;
        soundToggle.setAttribute('aria-checked', String(this.settings.sound));
        window.sounds.enabled = this.settings.sound;
        this.saveSettings();
        if (this.settings.sound) window.sounds.playClick();
      });
    }

    // Music Toggle
    const musicToggle = document.getElementById('musicToggle');
    if (musicToggle) {
      musicToggle.setAttribute('aria-checked', String(this.settings.music));
      musicToggle.addEventListener('click', () => {
        this.settings.music = !this.settings.music;
        musicToggle.setAttribute('aria-checked', String(this.settings.music));
        window.sounds.musicEnabled = this.settings.music;
        this.saveSettings();
        window.sounds.playClick();
      });
    }

    // Fullscreen Toggle
    const fsToggle = document.getElementById('fullscreenToggle');
    if (fsToggle) {
      fsToggle.addEventListener('click', () => {
        window.sounds.playClick();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
          fsToggle.setAttribute('aria-checked', 'true');
        } else {
          document.exitFullscreen?.();
          fsToggle.setAttribute('aria-checked', 'false');
        }
      });
    }

    document.addEventListener('fullscreenchange', () => {
      fsToggle?.setAttribute('aria-checked', String(!!document.fullscreenElement));
    });
  }

  navigateTo(screen) {
    this.currentScreen = screen;

    // Body state class (used by CSS to keep the menu chrome minimal)
    document.body.classList.remove('screen-menu', 'screen-lobby', 'screen-game');
    document.body.classList.add(`screen-${screen}`);

    // Toggle Nav Buttons Active
    document.querySelectorAll('.nav-btn').forEach(btn => {
      const s = btn.getAttribute('data-screen');
      btn.classList.toggle('active', s === screen);
    });

    // Toggle Screen Elements
    const menuEl = document.getElementById('screenMenu');
    const lobbyEl = document.getElementById('screenLobby');
    const gameEl = document.getElementById('screenGame');

    if (menuEl) menuEl.style.display = screen === 'menu' ? 'flex' : 'none';
    if (lobbyEl) lobbyEl.style.display = screen === 'lobby' ? 'flex' : 'none';
    if (gameEl) gameEl.style.display = screen === 'game' ? 'flex' : 'none';

    if (screen === 'lobby') {
      window.lobbyController.renderFullLobbyStage();
    } else if (screen === 'game') {
      window.gameController.renderGameBoard();
    }
  }

  // ================= Notification Toasts =================
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
      toast.style.transform = 'translateX(40px)';
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  }

  showInviteToast(invite) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'cs-toast invite-toast';
    toast.innerHTML = `
      <div style="flex-shrink: 0;">
        ${window.renderAvatar(invite.from_user?.avatar, invite.from_user?.avatar_frame, 40)}
      </div>
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
      window.sounds.playClick();
      try {
        await window.api.respondInvite(invite.id, 'accept');
        toast.remove();
        this.navigateTo('lobby');
        window.sidebarController.renderLobby();
      } catch (err) {
        alert(err.message);
      }
    });

    toast.querySelector('.toast-decline-btn')?.addEventListener('click', async () => {
      window.sounds.playClick();
      try {
        await window.api.respondInvite(invite.id, 'decline');
        toast.remove();
      } catch (err) {}
    });

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        setTimeout(() => toast.remove(), 250);
      }
    }, 12000);
  }
}

window.app = new App();
