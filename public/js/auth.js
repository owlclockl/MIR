/**
 * Authentication and Profile Management Controller
 */
class AuthController {
  constructor() {
    this.selectedAvatar = 'wizard';
    this.selectedFrame = 'standard';
    this.demoUsers = [];
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.loadDemoUsers();
    await window.api.fetchMe();
  }

  async loadDemoUsers() {
    try {
      const res = await window.api.getDemoUsers();
      this.demoUsers = res.users || [];
      this.renderDemoUsersList();
    } catch (e) {
      console.warn('Could not load demo users:', e);
    }
  }

  bindEvents() {
    // Top Bar Profile Click -> Open Profile Modal
    document.getElementById('userProfileBadge')?.addEventListener('click', () => {
      window.sounds.playClick();
      this.openProfileModal();
    });

    // Login/Register Button (when logged out)
    document.getElementById('headerLoginBtn')?.addEventListener('click', () => {
      window.sounds.playClick();
      this.openAuthModal();
    });

    // Auth Modal Tabs
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        window.sounds.playClick();
        const tab = e.target.getAttribute('data-tab');
        this.switchAuthTab(tab);
      });
    });

    // Login Form Submit
    document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      window.sounds.playClick();
      const userField = document.getElementById('loginUsername').value;
      const passField = document.getElementById('loginPassword').value;
      const errEl = document.getElementById('loginError');
      errEl.textContent = '';

      try {
        await window.api.login(userField, passField);
        window.sounds.playReady();
        this.closeAuthModal();
        window.app.showToast('Успешный вход', `С возвращением, ${window.api.currentUser.display_name}!`, 'info');
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    // Register Form Submit
    document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      window.sounds.playClick();
      const username = document.getElementById('regUsername').value;
      const displayName = document.getElementById('regDisplayName').value;
      const password = document.getElementById('regPassword').value;
      const roleTitle = document.getElementById('regRoleTitle').value;
      const customStatus = document.getElementById('regCustomStatus').value;
      const errEl = document.getElementById('registerError');
      errEl.textContent = '';

      try {
        await window.api.register({
          username,
          display_name: displayName,
          password,
          role_title: roleTitle,
          custom_status: customStatus,
          avatar: this.selectedAvatar,
          avatar_frame: this.selectedFrame
        });
        window.sounds.playReady();
        this.closeAuthModal();
        window.app.showToast('Аккаунт создан', `Добро пожаловать в МИР, ${window.api.currentUser.display_name}!`, 'info');
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    // Profile Save Form Submit
    document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      window.sounds.playClick();
      const displayName = document.getElementById('profDisplayName').value;
      const customStatus = document.getElementById('profCustomStatus').value;
      const roleTitle = document.getElementById('profRoleTitle').value;

      try {
        await window.api.updateProfile({
          display_name: displayName,
          custom_status: customStatus,
          role_title: roleTitle,
          avatar: this.selectedAvatar,
          avatar_frame: this.selectedFrame
        });
        window.sounds.playReady();
        this.closeProfileModal();
        window.app.showToast('Профиль обновлен', 'Изменения сохранены', 'info');
      } catch (err) {
        alert(err.message);
      }
    });

    // Logout Button
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      window.sounds.playClick();
      window.api.logout();
      this.closeProfileModal();
      window.app.showToast('Вы вышли из системы', 'Авторизуйтесь для игры', 'info');
    });

    // Copy Tag Button
    document.getElementById('copyTagBtn')?.addEventListener('click', () => {
      window.sounds.playClick();
      if (window.api.currentUser) {
        const fullTag = `${window.api.currentUser.username}#${window.api.currentUser.tag}`;
        navigator.clipboard?.writeText(fullTag);
        window.app.showToast('Скопировано', `Тег ${fullTag} скопирован в буфер!`, 'info');
      }
    });

    // Listen for auth state change
    window.api.on('auth_changed', (user) => {
      this.updateHeaderProfile(user);
    });
  }

  updateHeaderProfile(user) {
    const badge = document.getElementById('userProfileBadge');
    const loginBtn = document.getElementById('headerLoginBtn');

    if (user) {
      if (badge) badge.style.display = 'flex';
      if (loginBtn) loginBtn.style.display = 'none';

      document.getElementById('headerUserName').textContent = user.display_name || user.username;
      document.getElementById('headerUserTag').textContent = `#${user.tag}`;
      const avatarWrap = document.getElementById('headerUserAvatar');
      if (avatarWrap) {
        avatarWrap.innerHTML = window.renderAvatar(user.avatar, user.avatar_frame, 34);
      }
    } else {
      if (badge) badge.style.display = 'none';
      if (loginBtn) loginBtn.style.display = 'inline-flex';
    }
  }

  renderDemoUsersList() {
    const container = document.getElementById('demoUsersList');
    if (!container) return;

    container.innerHTML = this.demoUsers.map(u => `
      <div class="demo-user-card" data-user-id="${u.id}">
        <div class="demo-user-av">
          ${window.renderAvatar(u.avatar, u.avatar_frame, 40)}
        </div>
        <div class="demo-user-info">
          <div class="demo-user-name">${u.display_name}</div>
          <div class="demo-user-tag">${u.role_title} · #${u.tag}</div>
        </div>
        <button class="btn-primary btn-sm demo-login-btn" data-user-id="${u.id}">Войти</button>
      </div>
    `).join('');

    container.querySelectorAll('.demo-login-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        window.sounds.playClick();
        const userId = e.currentTarget.getAttribute('data-user-id');
        try {
          await window.api.demoLogin(userId);
          window.sounds.playReady();
          this.closeAuthModal();
          window.app.showToast('Вход выполнен', `Вы вошли как ${window.api.currentUser.display_name}`, 'info');
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  renderAvatarSelector(containerId, activeAvatar) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const presets = Object.keys(window.AvatarIcons || {});
    container.innerHTML = presets.map(id => `
      <div class="avatar-pick-option ${id === activeAvatar ? 'selected' : ''}" data-avatar="${id}">
        ${window.renderAvatar(id, 'standard', 44)}
      </div>
    `).join('');

    container.querySelectorAll('.avatar-pick-option').forEach(item => {
      item.addEventListener('click', (e) => {
        window.sounds.playClick();
        container.querySelectorAll('.avatar-pick-option').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        this.selectedAvatar = item.getAttribute('data-avatar');
        const preview = document.getElementById('profAvatarPreview');
        if (preview && containerId === 'profAvatarGrid') {
          preview.innerHTML = window.renderAvatar(this.selectedAvatar, this.selectedFrame, 70);
        }
      });
    });
  }

  renderFrameSelector(containerId, activeFrame) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const frames = [
      { id: 'standard', name: 'Обычная' },
      { id: 'gold', name: 'Золотая' },
      { id: 'neon', name: 'Неон (Cyan)' },
      { id: 'crimson', name: 'Кровавая' },
      { id: 'mythic', name: 'Мифическая' },
      { id: 'cyber', name: 'Кибер' }
    ];

    container.innerHTML = frames.map(f => `
      <button type="button" class="frame-badge-option ${f.id === activeFrame ? 'selected' : ''}" data-frame="${f.id}">
        ${f.name}
      </button>
    `).join('');

    container.querySelectorAll('.frame-badge-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        window.sounds.playClick();
        container.querySelectorAll('.frame-badge-option').forEach(i => i.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedFrame = btn.getAttribute('data-frame');
        const preview = document.getElementById('profAvatarPreview');
        if (preview && containerId === 'profFrameSelector') {
          preview.innerHTML = window.renderAvatar(this.selectedAvatar, this.selectedFrame, 70);
        }
      });
    });
  }

  openAuthModal(defaultTab = 'login') {
    this.switchAuthTab(defaultTab);
    this.selectedAvatar = 'wizard';
    this.selectedFrame = 'standard';
    this.renderAvatarSelector('regAvatarGrid', 'wizard');
    this.renderFrameSelector('regFrameSelector', 'standard');
    document.getElementById('authOverlay')?.classList.add('open');
  }

  closeAuthModal() {
    document.getElementById('authOverlay')?.classList.remove('open');
  }

  switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });
    document.querySelectorAll('.auth-tab-pane').forEach(pane => {
      pane.style.display = pane.id === `tabPane-${tab}` ? 'flex' : 'none';
    });
  }

  openProfileModal() {
    const user = window.api.currentUser;
    if (!user) {
      this.openAuthModal();
      return;
    }

    this.selectedAvatar = user.avatar || 'wizard';
    this.selectedFrame = user.avatar_frame || 'standard';

    document.getElementById('profDisplayName').value = user.display_name || '';
    document.getElementById('profCustomStatus').value = user.custom_status || '';
    document.getElementById('profRoleTitle').value = user.role_title || '';
    document.getElementById('profTagDisplay').textContent = `${user.username}#${user.tag}`;
    document.getElementById('profGamesPlayed').textContent = user.games_played || 0;
    document.getElementById('profGamesMastered').textContent = user.games_mastered || 0;

    const preview = document.getElementById('profAvatarPreview');
    if (preview) {
      preview.innerHTML = window.renderAvatar(this.selectedAvatar, this.selectedFrame, 70);
    }

    this.renderAvatarSelector('profAvatarGrid', this.selectedAvatar);
    this.renderFrameSelector('profFrameSelector', this.selectedFrame);

    document.getElementById('profileOverlay')?.classList.add('open');
  }

  closeProfileModal() {
    document.getElementById('profileOverlay')?.classList.remove('open');
  }
}

window.authController = new AuthController();
