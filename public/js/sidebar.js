/**
 * CS2-Style Right Sidebar & Social Presence Controller
 */
class SidebarController {
  constructor() {
    this.activeTab = 'lobby'; // 'lobby' | 'friends' | 'invites'
    this.isOpen = true;
    this.friends = [];
    this.invites = [];
    this.friendRequests = { incoming: [], outgoing: [] };
    this.friendFilter = 'all'; // 'all' | 'online' | 'inlobby'
    this.init();
  }

  async init() {
    this.bindEvents();
    this.listenWebSockets();
  }

  bindEvents() {
    // Dock Button Clicks
    document.querySelectorAll('.dock-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = btn.getAttribute('data-tab');
        if (this.isOpen && this.activeTab === tab) {
          this.toggleSidebar(false);
        } else {
          this.switchTab(tab);
          this.toggleSidebar(true);
        }
      });
    });

    // Drawer Close Button
    document.getElementById('sidebarCloseBtn')?.addEventListener('click', () => {
      this.toggleSidebar(false);
    });

    // Friend Filters
    document.querySelectorAll('.friend-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.friend-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.friendFilter = btn.getAttribute('data-filter');
        this.renderFriends();
      });
    });

    // Friend Search
    document.getElementById('friendSearchInput')?.addEventListener('input', (e) => {
      this.renderFriends(e.target.value);
    });

    // Add Friend Form
    document.getElementById('addFriendBtn')?.addEventListener('click', () => {
      this.promptAddFriend();
    });

    // Auth Change -> reload friends & invites
    window.api.on('auth_changed', (user) => {
      if (user) {
        this.refreshAll();
      } else {
        this.friends = [];
        this.invites = [];
        this.renderAll();
      }
    });
  }

  listenWebSockets() {
    // Real-time friend status update
    window.api.on('friend_presence', (data) => {
      if (!data || !data.user) return;
      const idx = this.friends.findIndex(f => f.id === data.user.id);
      if (idx !== -1) {
        this.friends[idx] = { ...this.friends[idx], ...data.user };
      } else {
        this.friends.push(data.user);
      }
      this.renderFriends();
      this.updateDockBadges();
    });

    // Incoming Room Invite
    window.api.on('room_invite', (data) => {
      if (!data || !data.invite) return;
      this.invites.unshift(data.invite);
      this.renderInvites();
      this.updateDockBadges();

      // Show CS2 Interactive Toast
      window.app.showInviteToast(data.invite);
    });

    // Incoming Friend Request
    window.api.on('friend_request', (data) => {
      if (!data || !data.request) return;
      this.friendRequests.incoming.unshift(data.request);
      this.renderInvites();
      this.updateDockBadges();

      window.app.showToast(
        'Запрос в друзья',
        `${data.request.from_user.display_name} хочет добавить вас в друзья!`,
        'friend'
      );
    });

    // Friend Request Accepted
    window.api.on('friend_request_accepted', (data) => {
      this.refreshFriends();
      window.app.showToast('Новый друг!', `${data.user.display_name} принял ваш запрос!`, 'info');
    });

    // Room update events
    window.api.on('room_member_joined', (data) => {
      if (window.api.currentRoom && data.room && window.api.currentRoom.id === data.room.id) {
        window.api.currentRoom = data.room;
        this.renderLobby();
      }
    });

    window.api.on('room_member_left', (data) => {
      if (window.api.currentRoom && data.room && window.api.currentRoom.id === data.room.id) {
        window.api.currentRoom = data.room;
        this.renderLobby();
      }
    });

    window.api.on('room_ready_changed', (data) => {
      if (window.api.currentRoom && data.room && window.api.currentRoom.id === data.room.id) {
        window.api.currentRoom = data.room;
        this.renderLobby();
      }
    });

    window.api.on('room_kicked', (data) => {
      window.api.currentRoom = null;
      window.app.showToast('Исключение', `Вы были исключены из комнаты ${data.room.title}`, 'info');
      this.renderLobby();
    });
  }

  async refreshAll() {
    await Promise.all([
      this.refreshFriends(),
      this.refreshInvites(),
      this.refreshFriendRequests()
    ]);
  }

  async refreshFriends() {
    try {
      this.friends = await window.api.getFriends();
      this.renderFriends();
      this.updateDockBadges();
    } catch (e) {}
  }

  async refreshInvites() {
    try {
      this.invites = await window.api.getInvites();
      this.renderInvites();
      this.updateDockBadges();
    } catch (e) {}
  }

  async refreshFriendRequests() {
    try {
      const res = await window.api.getFriendRequests();
      this.friendRequests = res;
      this.renderInvites();
      this.updateDockBadges();
    } catch (e) {}
  }

  toggleSidebar(open = null) {
    this.isOpen = open !== null ? open : !this.isOpen;
    const drawer = document.getElementById('cs2Drawer');
    if (drawer) {
      drawer.classList.toggle('collapsed', !this.isOpen);
    }
    document.querySelectorAll('.dock-btn').forEach(btn => {
      btn.classList.toggle('active', this.isOpen && btn.getAttribute('data-tab') === this.activeTab);
    });
  }

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.dock-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });

    document.querySelectorAll('.sidebar-view-pane').forEach(pane => {
      pane.style.display = pane.id === `sidePane-${tab}` ? 'flex' : 'none';
    });

    const titleEl = document.getElementById('drawerTitleText');
    const titles = {
      lobby: 'Лобби / Группа',
      friends: 'Друзья',
      invites: 'Приглашения'
    };
    if (titleEl) titleEl.textContent = titles[tab] || 'Панель';

    if (tab === 'lobby') this.renderLobby();
    if (tab === 'friends') this.renderFriends();
    if (tab === 'invites') this.renderInvites();
  }

  updateDockBadges() {
    // Lobby count
    const lobbyBtn = document.getElementById('dockLobbyBtn');
    const lobbyBadge = document.getElementById('dockLobbyBadge');
    const currentRoom = window.api.currentRoom;
    if (currentRoom && currentRoom.members) {
      lobbyBtn?.classList.add('has-lobby');
      if (lobbyBadge) {
        lobbyBadge.style.display = 'grid';
        lobbyBadge.textContent = `${currentRoom.members.length}/${currentRoom.max_players}`;
      }
    } else {
      lobbyBtn?.classList.remove('has-lobby');
      if (lobbyBadge) lobbyBadge.style.display = 'none';
    }

    // Friends online count
    const onlineCount = this.friends.filter(f => f.isOnline).length;
    const friendsBadge = document.getElementById('dockFriendsBadge');
    if (friendsBadge) {
      friendsBadge.style.display = onlineCount > 0 ? 'grid' : 'none';
      friendsBadge.textContent = onlineCount;
    }

    // Invites & notifications count
    const totalAlerts = (this.invites.length || 0) + ((this.friendRequests.incoming && this.friendRequests.incoming.length) || 0);
    const invitesBadge = document.getElementById('dockInvitesBadge');
    const headerNotifBadge = document.getElementById('headerNotifBadge');
    if (invitesBadge) {
      invitesBadge.style.display = totalAlerts > 0 ? 'grid' : 'none';
      invitesBadge.textContent = totalAlerts;
    }
    if (headerNotifBadge) {
      headerNotifBadge.style.display = totalAlerts > 0 ? 'grid' : 'none';
      headerNotifBadge.textContent = totalAlerts;
    }
  }

  // ================= Render Lobby in Sidebar =================
  renderLobby() {
    const container = document.getElementById('sideLobbyContainer');
    if (!container) return;

    const room = window.api.currentRoom;
    const user = window.api.currentUser;

    if (!room) {
      container.innerHTML = `
        <div class="empty-state-card" style="text-align: center; padding: 30px 10px; color: var(--text-dim);">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="margin: 0 auto 12px; color: var(--text-faint);">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <div style="font-size: 14px; font-weight: 600; color: var(--text-muted);">Вы не в лобби</div>
          <div style="font-size: 12px; margin-top: 6px; color: var(--text-dim);">Создайте комнату или присоединитесь к друзьям</div>
          <div style="display: flex; gap: 8px; justify-content: center; margin-top: 16px;">
            <button class="btn-primary btn-sm" id="sideCreateRoomBtn">Создать лобби</button>
            <button class="btn-secondary btn-sm" id="sideBrowseRoomsBtn">Список комнат</button>
          </div>
        </div>
      `;

      document.getElementById('sideCreateRoomBtn')?.addEventListener('click', () => {
        window.lobbyController.openCreateModal();
      });
      document.getElementById('sideBrowseRoomsBtn')?.addEventListener('click', () => {
        window.lobbyController.openBrowseModal();
      });
      return;
    }

    const isHost = user && room.host_user_id === user.id;
    const myMember = room.members?.find(m => m.user_id === user?.id);
    const isReady = myMember ? myMember.is_ready === 1 : false;
    const maxPlayers = room.max_players || 5;

    // Build slots HTML
    let slotsHtml = '';
    const membersBySlot = {};
    (room.members || []).forEach(m => {
      membersBySlot[m.slot_index] = m;
    });

    for (let i = 0; i < maxPlayers; i++) {
      const m = membersBySlot[i];
      if (m) {
        const isSelf = user && m.user_id === user.id;
        const isMaster = m.role === 'master' || m.user_id === room.host_user_id;
        slotsHtml += `
          <div class="lobby-slot-card ${isSelf ? 'is-self' : ''} ${m.is_ready ? 'is-ready' : ''}" data-user-id="${m.user_id}">
            <div class="slot-avatar-box">
              ${isMaster ? '<svg class="slot-crown-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>' : ''}
              ${window.renderAvatar(m.avatar, m.avatar_frame, 44)}
            </div>
            <div class="slot-details">
              <div class="slot-name-row">
                <span class="slot-user-name">${m.display_name}</span>
                <span class="slot-role-badge ${isMaster ? 'master' : 'player'}">${isMaster ? 'Мастер' : 'Игрок'}</span>
              </div>
            </div>
            <div class="slot-ready-indicator ${m.is_ready ? 'ready' : ''}">
              ${m.is_ready ? '<svg class="ic" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ><path d="M20 6L9 17l-5-5"></path></svg>' : '·'}
            </div>
          </div>
        `;
      } else {
        slotsHtml += `
          <div class="lobby-empty-slot" data-slot="${i}">
            <div class="empty-slot-plus">+</div>
            <span class="empty-slot-label">Свободный слот · Пригласить</span>
          </div>
        `;
      }
    }

    container.innerHTML = `
      <div class="sidebar-lobby-view">
        <div class="lobby-status-banner">
          <div class="ls-top">
            <span class="ls-room-name">${room.title}</span>
            <span class="ls-code-tag" id="sideCopyCodeBtn" title="Нажмите чтобы скопировать">${room.code} <svg class="ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></span>
          </div>
          <div class="ls-info-row">
            <span class="ls-pill"><svg class="ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ><rect x="3" y="3" width="18" height="18" rx="4"></rect><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"></circle><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"></circle><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"></circle></svg> Сеттинг: ${room.setting}</span>
            <span class="ls-pill"><svg class="ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path></svg> Игроки: ${room.members.length}/${room.max_players}</span>
          </div>
        </div>

        <div class="lobby-slots-list">
          ${slotsHtml}
        </div>

        <div class="lobby-actions-toolbar">
          <button class="btn-cs-ready ${isReady ? 'ready' : ''}" id="sideReadyBtn">
            ${isReady ? '<svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ><path d="M20 6L9 17l-5-5"></path></svg> ГОТОВ К ИГРЕ' : 'ГОТОВ'}
          </button>


          <div class="lobby-sub-actions">
            <button class="lobby-sub-btn" id="sideInviteFriendBtn">
              <svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ><path d="M12 5v14M5 12h14"></path></svg> Пригласить
            </button>
            <button class="lobby-sub-btn" id="sideLeaveRoomBtn" style="color: #e7b0b0;">
              <svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path></svg> Выйти
            </button>
          </div>
        </div>
      </div>
    `;

    // Event Bindings
    document.getElementById('sideCopyCodeBtn')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(room.code);
      window.app.showToast('Скопировано', `Код комнаты ${room.code} скопирован в буфер!`, 'info');
    });

    document.getElementById('sideReadyBtn')?.addEventListener('click', async () => {
      try {
        await window.api.setReady(room.id, !isReady);
      } catch (err) {
        alert(err.message);
      }
    });


    document.getElementById('sideInviteFriendBtn')?.addEventListener('click', () => {
      this.switchTab('friends');
    });


    document.getElementById('sideLeaveRoomBtn')?.addEventListener('click', async () => {
      try {
        await window.api.leaveRoom(room.id);
        this.renderLobby();
      } catch (err) {
        alert(err.message);
      }
    });

    container.querySelectorAll('.lobby-empty-slot').forEach(el => {
      el.addEventListener('click', () => {
        this.switchTab('friends');
      });
    });
  }

  // ================= Render Friends List =================
  renderFriends(searchQuery = '') {
    const container = document.getElementById('sideFriendsContainer');
    if (!container) return;

    if (!window.api.currentUser) {
      container.innerHTML = `
        <div style="text-align: center; padding: 30px 10px; color: var(--text-dim);">
          <div style="font-size: 14px; font-weight: 600; color: var(--text-muted);">Войдите в аккаунт</div>
          <div style="font-size: 12px; margin-top: 6px;">Чтобы видеть список друзей и отправлять приглашения</div>
          <button class="btn-primary btn-sm" style="margin-top: 14px;" id="sideLoginPromptBtn">Войти</button>
        </div>
      `;
      document.getElementById('sideLoginPromptBtn')?.addEventListener('click', () => {
        window.authController.openAuthModal();
      });
      return;
    }

    let filtered = [...this.friends];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(f => f.display_name.toLowerCase().includes(q) || f.username.toLowerCase().includes(q) || f.tag.includes(q));
    }

    if (this.friendFilter === 'online') {
      filtered = filtered.filter(f => f.isOnline);
    } else if (this.friendFilter === 'inlobby') {
      filtered = filtered.filter(f => f.status === 'in_lobby');
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--text-dim); font-size: 13px;">
          Друзья не найдены
        </div>
      `;
      return;
    }

    // Group by status
    const inLobby = filtered.filter(f => f.status === 'in_lobby');
    const online = filtered.filter(f => f.isOnline && f.status !== 'in_lobby');
    const offline = filtered.filter(f => !f.isOnline);

    const renderGroup = (title, list) => {
      if (list.length === 0) return '';
      const items = list.map(f => {
        const canInvite = window.api.currentRoom && f.isOnline;
        const canJoin = f.currentRoom && (!window.api.currentRoom || window.api.currentRoom.id !== f.currentRoom.id);
        
        let statusText = 'В сети';
        let statusClass = 'online';
        if (f.status === 'in_lobby') {
          statusText = f.currentRoom ? `В лобби: ${f.currentRoom.title}` : 'В лобби МИР';
          statusClass = 'in_lobby';
        } else if (!f.isOnline) {
          statusText = 'Не в сети';
          statusClass = 'offline';
        }

        return `
          <div class="friend-item-card" data-friend-id="${f.id}">
            <div class="friend-avatar-wrap">
              ${window.renderAvatar(f.avatar, f.avatar_frame, 40)}
              <div class="presence-dot ${statusClass}"></div>
            </div>
            <div class="friend-info">
              <div class="friend-name-line">
                <span class="friend-name">${f.display_name}</span>
              </div>
              <div class="friend-status-desc ${statusClass}">${f.custom_status || statusText}</div>
            </div>
            <div class="friend-actions">
              ${canInvite ? `
                <button class="friend-action-btn invite-btn friend-invite-btn" data-friend-id="${f.id}" title="Пригласить в лобби">
                  <svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ><path d="M12 5v14M5 12h14"></path></svg>
                </button>
              ` : ''}
              ${canJoin ? `
                <button class="friend-action-btn invite-btn friend-join-btn" data-room-id="${f.currentRoom.id}" title="Присоединиться к лобби">
                  <svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path></svg>
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="friends-group-title">${title} (${list.length})</div>
        <div class="friends-cards-stack">
          ${items}
        </div>
      `;
    };

    container.innerHTML = `
      ${renderGroup('В лобби', inLobby)}
      ${renderGroup('В сети', online)}
      ${renderGroup('Не в сети', offline)}
    `;

    // Event Bindings
    container.querySelectorAll('.friend-invite-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const friendId = btn.getAttribute('data-friend-id');
        if (window.api.currentRoom) {
          try {
            await window.api.inviteFriend(window.api.currentRoom.id, friendId);
            window.app.showToast('Приглашение отправлено', 'Игрок получил уведомление!', 'info');
          } catch (err) {
            alert(err.message);
          }
        }
      });
    });

    container.querySelectorAll('.friend-join-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const roomId = btn.getAttribute('data-room-id');
        try {
          await window.api.joinRoom(roomId);
          this.switchTab('lobby');
        } catch (err) {
          alert(err.message);
        }
      });
    });

  }

  // ================= Render Invites & Notifications =================
  renderInvites() {
    const container = document.getElementById('sideInvitesContainer');
    if (!container) return;

    const incomingReqs = this.friendRequests.incoming || [];
    const hasInvites = this.invites.length > 0;
    const hasReqs = incomingReqs.length > 0;

    if (!hasInvites && !hasReqs) {
      container.innerHTML = `
        <div style="text-align: center; padding: 30px 10px; color: var(--text-dim); font-size: 13px;">
          У вас нет новых приглашений и запросов
        </div>
      `;
      return;
    }

    let html = '';

    if (hasInvites) {
      html += `
        <div class="friends-group-title">Приглашения в лобби (${this.invites.length})</div>
        <div class="friends-cards-stack">
          ${this.invites.map(inv => `
            <div class="invite-item-box" data-invite-id="${inv.id}">
              <div class="ii-head">
                ${window.renderAvatar(inv.from_avatar || inv.from_user?.avatar, inv.from_avatar_frame, 38)}
                <div>
                  <div class="ii-text"><strong>${inv.from_display_name || inv.from_user?.display_name}</strong> приглашает вас в лобби</div>
                  <div class="ii-sub">«${inv.room_title || inv.room?.title}» · ${inv.setting || inv.room?.setting}</div>
                </div>
              </div>
              <div class="ii-btns">
                <button class="btn-primary btn-sm accept-invite-btn" data-invite-id="${inv.id}">Принять</button>
                <button class="btn-secondary btn-sm decline-invite-btn" data-invite-id="${inv.id}">Отклонить</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    if (hasReqs) {
      html += `
        <div class="friends-group-title" style="margin-top: 16px;">Запросы в друзья (${incomingReqs.length})</div>
        <div class="friends-cards-stack">
          ${incomingReqs.map(req => `
            <div class="invite-item-box" data-request-id="${req.id}">
              <div class="ii-head">
                ${window.renderAvatar(req.avatar, req.avatar_frame, 38)}
                <div>
                  <div class="ii-text"><strong>${req.display_name}</strong></div>
                  <div class="ii-sub">${req.role_title} · #${req.tag}</div>
                </div>
              </div>
              <div class="ii-btns">
                <button class="btn-primary btn-sm accept-req-btn" data-request-id="${req.id}">Принять</button>
                <button class="btn-secondary btn-sm decline-req-btn" data-request-id="${req.id}">Отклонить</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    container.innerHTML = html;

    // Bind invite buttons
    container.querySelectorAll('.accept-invite-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-invite-id');
        try {
          await window.api.respondInvite(id, 'accept');
          this.invites = this.invites.filter(i => i.id !== id);
          this.renderInvites();
          this.updateDockBadges();
          this.switchTab('lobby');
        } catch (err) {
          alert(err.message);
        }
      });
    });

    container.querySelectorAll('.decline-invite-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-invite-id');
        try {
          await window.api.respondInvite(id, 'decline');
          this.invites = this.invites.filter(i => i.id !== id);
          this.renderInvites();
          this.updateDockBadges();
        } catch (err) {}
      });
    });

    // Bind friend request buttons
    container.querySelectorAll('.accept-req-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-request-id');
        try {
          await window.api.respondFriendRequest(id, 'accept');
          this.friendRequests.incoming = this.friendRequests.incoming.filter(r => r.id !== id);
          this.refreshFriends();
          this.renderInvites();
        } catch (err) {
          alert(err.message);
        }
      });
    });

    container.querySelectorAll('.decline-req-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-request-id');
        try {
          await window.api.respondFriendRequest(id, 'decline');
          this.friendRequests.incoming = this.friendRequests.incoming.filter(r => r.id !== id);
          this.renderInvites();
        } catch (err) {}
      });
    });
  }

  promptAddFriend() {
    const target = prompt('Введите Никнейм#Тег друга (например ElenaArcana#2048):');
    if (target && target.trim()) {
      window.api.sendFriendRequest(target.trim()).then(res => {
        window.app.showToast('Запрос отправлен', res.message, 'info');
        this.refreshFriendRequests();
      }).catch(err => {
        alert(err.message);
      });
    }
  }

  renderAll() {
    this.renderLobby();
    this.renderFriends();
    this.renderInvites();
    this.updateDockBadges();
  }
}

window.sidebarController = new SidebarController();
