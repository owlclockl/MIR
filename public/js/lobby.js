/**
 * Комнаты: создание (Мастер), список открытых комнат, вход по коду.
 * Само лобби отображается в правой панели (sidebar.js).
 */
class LobbyController {
  constructor() {
    this.bindEvents();
  }

  bindEvents() {
    // Кнопка «Мастер» в меню
    document.getElementById('masterRoleBtn')?.addEventListener('click', () => {
      if (!window.api.currentUser) {
        window.authController.openAuthModal();
        return;
      }
      this.openCreateModal();
    });

    // Кнопка «Игрок» в меню
    document.getElementById('playerRoleBtn')?.addEventListener('click', () => {
      this.openBrowseModal();
    });

    // Вход по коду комнаты (поле по центру меню)
    document.getElementById('menuJoinForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = document.getElementById('menuJoinInput').value.trim();
      if (code) this.joinByCode(code);
    });

    // Создание комнаты
    document.getElementById('createRoomForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        title: document.getElementById('crTitle').value,
        description: document.getElementById('crDesc').value,
        setting: document.getElementById('crSetting').value,
        max_players: document.getElementById('crMaxPlayers').value,
        privacy: document.getElementById('crPrivacy').value,
        password: document.getElementById('crPassword').value,
        role: 'master'
      };

      try {
        const room = await window.api.createRoom(payload);
        this.closeCreateModal();
        this.showLobbyPanel();
        window.app.showToast('Лобби создано', `Код комнаты: ${room.code}`, 'info');
      } catch (err) {
        alert(err.message);
      }
    });
  }

  showLobbyPanel() {
    window.sidebarController.toggleSidebar(true);
    window.sidebarController.switchTab('lobby');
    window.sidebarController.renderLobby();
  }

  openCreateModal() {
    document.getElementById('createRoomOverlay')?.classList.add('open');
  }

  closeCreateModal() {
    document.getElementById('createRoomOverlay')?.classList.remove('open');
  }

  async openBrowseModal() {
    document.getElementById('browseRoomsOverlay')?.classList.add('open');
    await this.refreshPublicRooms();
  }

  closeBrowseModal() {
    document.getElementById('browseRoomsOverlay')?.classList.remove('open');
  }

  async refreshPublicRooms() {
    const listEl = document.getElementById('publicRoomsList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="list-hint">Загрузка списка комнат...</div>';

    try {
      const rooms = await window.api.getRooms();
      if (rooms.length === 0) {
        listEl.innerHTML = '<div class="list-hint">Нет открытых комнат. Создайте первую.</div>';
        return;
      }

      listEl.innerHTML = rooms.map(r => `
        <div class="public-room-item">
          <div class="pr-left">
            ${window.renderAvatar(r.host_avatar, r.host_avatar_frame, 40)}
            <div>
              <div class="pr-title">${r.title}</div>
              <div class="pr-sub">Мастер: ${r.host_display_name} · ${r.setting} · код ${r.code}</div>
            </div>
          </div>
          <div class="pr-right">
            <span class="pr-count">${r.current_players}/${r.max_players}</span>
            <button class="btn-primary btn-sm join-room-btn" data-room-id="${r.id}">Войти</button>
          </div>
        </div>
      `).join('');

      listEl.querySelectorAll('.join-room-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!window.api.currentUser) {
            window.authController.openAuthModal();
            return;
          }
          try {
            await window.api.joinRoom(btn.getAttribute('data-room-id'));
            this.closeBrowseModal();
            this.showLobbyPanel();
          } catch (err) {
            alert(err.message);
          }
        });
      });
    } catch (e) {
      listEl.innerHTML = `<div class="list-hint error">Ошибка: ${e.message}</div>`;
    }
  }

  async joinByCode(code) {
    if (!window.api.currentUser) {
      window.authController.openAuthModal();
      return;
    }
    try {
      const room = await window.api.joinRoom(code);
      this.showLobbyPanel();
      window.app.showToast('Вход выполнен', `Вы в лобби «${room.title}»`, 'info');
    } catch (err) {
      alert(err.message);
    }
  }
}

window.lobbyController = new LobbyController();
