/**
 * Lobby & Room Management Controller
 */
class LobbyController {
  constructor() {
    this.init();
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    // Role Buttons on Main Menu
    document.getElementById('masterRoleBtn')?.addEventListener('click', () => {
      window.sounds.playClick();
      if (!window.api.currentUser) {
        window.authController.openAuthModal();
        return;
      }
      this.openCreateModal('master');
    });

    document.getElementById('playerRoleBtn')?.addEventListener('click', () => {
      window.sounds.playClick();
      this.openBrowseModal();
    });

    // Quick Join input in Top Header
    document.getElementById('quickJoinBtn')?.addEventListener('click', () => {
      window.sounds.playClick();
      const code = document.getElementById('quickJoinInput').value.trim();
      if (code) {
        this.joinByCode(code);
      }
    });

    // Create Room Form Submit
    document.getElementById('createRoomForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      window.sounds.playClick();
      const title = document.getElementById('crTitle').value;
      const description = document.getElementById('crDesc').value;
      const setting = document.getElementById('crSetting').value;
      const max_players = document.getElementById('crMaxPlayers').value;
      const privacy = document.getElementById('crPrivacy').value;
      const password = document.getElementById('crPassword').value;

      try {
        const room = await window.api.createRoom({
          title, description, setting, max_players, privacy, password, role: 'master'
        });
        window.sounds.playJoin();
        this.closeCreateModal();
        window.app.navigateTo('lobby');
        window.sidebarController.renderLobby();
        window.app.showToast('Лобби создано!', `Код комнаты: ${room.code}`, 'info');
      } catch (err) {
        alert(err.message);
      }
    });

    // Customize Character Form Submit
    document.getElementById('charCustomizeForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      window.sounds.playClick();
      const charName = document.getElementById('charCustName').value;
      const charClass = document.getElementById('charCustClass').value;
      const charHp = parseInt(document.getElementById('charCustHp').value) || 20;

      if (window.api.currentRoom) {
        try {
          await window.api.updateCharacter(window.api.currentRoom.id, {
            character_name: charName,
            character_class: charClass,
            hp: charHp,
            max_hp: charHp
          });
          this.closeCharCustomizeModal();
          window.app.showToast('Персонаж сохранен', 'Характеристики обновлены', 'info');
        } catch (err) {
          alert(err.message);
        }
      }
    });

    // Lobby Chat Submit
    document.getElementById('lobbyChatForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('lobbyChatInput');
      const text = input.value.trim();
      if (!text || !window.api.currentRoom) return;
      window.sounds.playClick();
      input.value = '';

      try {
        await window.api.sendRoomMessage(window.api.currentRoom.id, text, 'room_lobby');
      } catch (err) {
        alert(err.message);
      }
    });

    // Full Stage Ready Button
    document.getElementById('stageReadyBtn')?.addEventListener('click', async () => {
      window.sounds.playClick();
      const room = window.api.currentRoom;
      const user = window.api.currentUser;
      if (!room || !user) return;
      const myMember = room.members?.find(m => m.user_id === user.id);
      const isReady = myMember ? myMember.is_ready === 1 : false;

      try {
        await window.api.setReady(room.id, !isReady);
      } catch (err) {
        alert(err.message);
      }
    });

    // Full Stage Start Game Button (Master only)
    document.getElementById('stageStartBtn')?.addEventListener('click', async () => {
      window.sounds.playClick();
      const room = window.api.currentRoom;
      if (!room) return;
      try {
        await window.api.startGame(room.id);
      } catch (err) {
        alert(err.message);
      }
    });

    // Full Stage Leave Button
    document.getElementById('stageLeaveBtn')?.addEventListener('click', async () => {
      window.sounds.playClick();
      const room = window.api.currentRoom;
      if (!room) return;
      try {
        await window.api.leaveRoom(room.id);
        window.app.navigateTo('menu');
        window.sidebarController.renderLobby();
      } catch (err) {
        alert(err.message);
      }
    });

    // Copy Code Button on Stage
    document.getElementById('stageCopyCodeBtn')?.addEventListener('click', () => {
      window.sounds.playClick();
      const room = window.api.currentRoom;
      if (room && room.code) {
        navigator.clipboard?.writeText(room.code);
        window.app.showToast('Скопировано', `Код комнаты ${room.code} скопирован в буфер!`, 'info');
      }
    });

    // Listen to Room Messages in Lobby
    window.api.on('room_message', (data) => {
      if (!data || !data.message) return;
      if (data.message.type === 'room_lobby') {
        this.appendLobbyMessage(data.message);
      }
    });
  }

  openCreateModal(defaultRole = 'master') {
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
    listEl.innerHTML = '<div style="text-align: center; color: var(--text-dim); padding: 20px;">Загрузка списка открытых комнат...</div>';

    try {
      const rooms = await window.api.getRooms();
      if (rooms.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; color: var(--text-dim); padding: 30px;">
            Нет активных открытых комнат. Создайте первую!
          </div>
        `;
        return;
      }

      listEl.innerHTML = rooms.map(r => `
        <div class="public-room-item" style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 14px;">
            ${window.renderAvatar(r.host_avatar, r.host_avatar_frame, 44)}
            <div>
              <div style="font-size: 15px; font-weight: 700; color: #fff;">${r.title}</div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 3px;">
                Мастер: <strong>${r.host_display_name}</strong> · Сеттинг: ${r.setting} · Код: <strong>${r.code}</strong>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 14px;">
            <span style="font-size: 13px; font-weight: 600; color: var(--cs-cyan);">${r.current_players}/${r.max_players} игроков</span>
            <button class="btn-primary btn-sm join-room-btn" data-room-id="${r.id}">Войти</button>
          </div>
        </div>
      `).join('');

      listEl.querySelectorAll('.join-room-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          window.sounds.playClick();
          if (!window.api.currentUser) {
            window.authController.openAuthModal();
            return;
          }
          const roomId = btn.getAttribute('data-room-id');
          try {
            await window.api.joinRoom(roomId);
            this.closeBrowseModal();
            window.app.navigateTo('lobby');
            window.sidebarController.renderLobby();
          } catch (err) {
            alert(err.message);
          }
        });
      });
    } catch (e) {
      listEl.innerHTML = `<div style="color: var(--cs-red); padding: 20px;">Ошибка: ${e.message}</div>`;
    }
  }

  async joinByCode(code) {
    if (!window.api.currentUser) {
      window.authController.openAuthModal();
      return;
    }
    try {
      const room = await window.api.joinRoom(code);
      window.sounds.playJoin();
      window.app.navigateTo('lobby');
      window.sidebarController.renderLobby();
      window.app.showToast('Успешный вход', `Вы присоединились к лобби ${room.title}`, 'info');
    } catch (err) {
      alert(err.message);
    }
  }

  openCharCustomizeModal() {
    const room = window.api.currentRoom;
    const user = window.api.currentUser;
    if (!room || !user) return;
    const member = room.members?.find(m => m.user_id === user.id);

    document.getElementById('charCustName').value = (member && member.character_name) || user.display_name;
    document.getElementById('charCustClass').value = (member && member.character_class) || 'Боевой Маг';
    document.getElementById('charCustHp').value = (member && member.hp) || 20;

    document.getElementById('charCustomizeOverlay')?.classList.add('open');
  }

  closeCharCustomizeModal() {
    document.getElementById('charCustomizeOverlay')?.classList.remove('open');
  }

  // Render Full Screen Lobby Stage
  renderFullLobbyStage() {
    const room = window.api.currentRoom;
    const user = window.api.currentUser;
    if (!room) return;

    document.getElementById('stageRoomTitle').textContent = room.title;
    document.getElementById('stageRoomDesc').textContent = room.description || `Сеттинг: ${room.setting} · Макс. игроков: ${room.max_players}`;
    document.getElementById('stageRoomCode').textContent = room.code;

    const isHost = user && room.host_user_id === user.id;
    const myMember = room.members?.find(m => m.user_id === user?.id);
    const isReady = myMember ? myMember.is_ready === 1 : false;

    // Stage Ready & Start buttons
    const readyBtn = document.getElementById('stageReadyBtn');
    if (readyBtn) {
      readyBtn.classList.toggle('ready', isReady);
      readyBtn.textContent = isReady ? '✓ ГОТОВ К ИГРЕ' : 'ГОТОВИТЬСЯ (ГОТОВ)';
    }

    const startBtn = document.getElementById('stageStartBtn');
    if (startBtn) {
      startBtn.style.display = isHost ? 'inline-flex' : 'none';
    }

    // Render Podiums Grid
    const grid = document.getElementById('stagePodiumsGrid');
    if (!grid) return;

    const maxPlayers = room.max_players || 5;
    const membersBySlot = {};
    (room.members || []).forEach(m => {
      membersBySlot[m.slot_index] = m;
    });

    let html = '';
    for (let i = 0; i < maxPlayers; i++) {
      const m = membersBySlot[i];
      if (m) {
        const isMaster = m.role === 'master' || m.user_id === room.host_user_id;
        html += `
          <div class="podium-card ${m.is_ready ? 'ready-state' : ''}" data-user-id="${m.user_id}">
            ${isMaster ? '<div class="podium-crown" title="Мастер/Хост">👑</div>' : ''}
            <div class="podium-avatar-wrap">
              ${window.renderAvatar(m.avatar, m.avatar_frame, 80)}
            </div>
            <div>
              <div class="podium-player-name">${m.display_name}</div>
              <div class="podium-char-class">${m.character_class || 'Авантюрист'} (HP: ${m.hp})</div>
            </div>
            <div class="podium-status-pill ${m.is_ready ? 'ready' : ''}">
              ${m.is_ready ? '✓ ГОТОВ' : 'НЕ ГОТОВ'}
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="podium-empty-card" data-slot="${i}">
            <div class="empty-card-plus">+</div>
            <div class="empty-card-text">Свободный слот</div>
          </div>
        `;
      }
    }

    grid.innerHTML = html;

    grid.querySelectorAll('.podium-empty-card').forEach(el => {
      el.addEventListener('click', () => {
        window.sounds.playClick();
        window.sidebarController.toggleSidebar(true);
        window.sidebarController.switchTab('friends');
      });
    });

    // Fetch and render initial lobby chat
    this.loadLobbyChat(room.id);
  }

  async loadLobbyChat(roomId) {
    const feed = document.getElementById('lobbyChatFeed');
    if (!feed) return;
    try {
      const messages = await window.api.getRoomMessages(roomId);
      feed.innerHTML = '';
      messages.filter(m => m.type === 'room_lobby').forEach(m => this.appendLobbyMessage(m));
    } catch (e) {}
  }

  appendLobbyMessage(msg) {
    const feed = document.getElementById('lobbyChatFeed');
    if (!feed) return;
    const timeStr = new Date(msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const el = document.createElement('div');
    el.className = 'lobby-chat-item';
    el.style.cssText = 'display: flex; gap: 8px; font-size: 13px; line-height: 1.4; margin-bottom: 6px;';
    el.innerHTML = `
      <span style="font-weight: 700; color: var(--cs-cyan);">${msg.from_user.display_name}:</span>
      <span style="color: #e2e8f0; flex: 1;">${msg.content}</span>
      <span style="font-size: 10px; color: var(--text-dim);">${timeStr}</span>
    `;
    feed.appendChild(el);
    feed.scrollTop = feed.scrollHeight;
  }
}

window.lobbyController = new LobbyController();
