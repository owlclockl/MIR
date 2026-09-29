/**
 * In-Game Session Controller (Master & Player RPG Experience)
 */
class GameController {
  constructor() {
    this.init();
  }

  init() {
    this.bindEvents();
    this.listenWebSockets();
  }

  bindEvents() {
    // Dice Quick Roll Buttons (d4, d6, d8, d10, d12, d20, d100)
    document.querySelectorAll('.dice-quick-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        window.sounds.playClick();
        const diceType = btn.getAttribute('data-dice') || 'd20';
        const modInput = document.getElementById('diceModifier');
        const reasonInput = document.getElementById('diceReason');
        const modifier = parseInt(modInput?.value) || 0;
        const reason = reasonInput?.value || (diceType === 'd20' ? 'Проверка навыка / Атака' : 'Бросок урона');

        if (window.api.currentRoom) {
          window.sounds.playDiceRoll();
          try {
            await window.api.rollDice(window.api.currentRoom.id, diceType, 1, modifier, reason);
          } catch (err) {
            alert(err.message);
          }
        }
      });
    });

    // In-game Feed Send Form
    document.getElementById('gameFeedForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('gameFeedInput');
      const text = input.value.trim();
      if (!text || !window.api.currentRoom) return;
      window.sounds.playClick();
      input.value = '';

      // Check if command like /roll
      if (text.startsWith('/roll') || text.startsWith('/r ')) {
        const parts = text.split(' ');
        const diceStr = parts[1] || 'd20';
        window.sounds.playDiceRoll();
        try {
          await window.api.rollDice(window.api.currentRoom.id, diceStr.startsWith('d') ? diceStr : 'd20', 1, 0, 'Бросок чата');
        } catch (err) {
          alert(err.message);
        }
        return;
      }

      try {
        await window.api.sendRoomMessage(window.api.currentRoom.id, text, 'room_game');
      } catch (err) {
        alert(err.message);
      }
    });

    // Master Story Broadcast Form
    document.getElementById('dmBroadcastForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('dmStoryText');
      const text = input.value.trim();
      if (!text || !window.api.currentRoom) return;
      window.sounds.playClick();
      input.value = '';

      try {
        await window.api.updateGameState(window.api.currentRoom.id, {
          broadcastStoryText: text
        });
        window.app.showToast('Мастер', 'Событие отправлено всем игрокам', 'info');
      } catch (err) {
        alert(err.message);
      }
    });

    // Master Edit Scene Modal
    document.getElementById('dmEditSceneBtn')?.addEventListener('click', () => {
      window.sounds.playClick();
      this.openEditSceneModal();
    });

    document.getElementById('editSceneForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      window.sounds.playClick();
      const title = document.getElementById('esSceneTitle').value;
      const desc = document.getElementById('esSceneDesc').value;
      const loc = document.getElementById('esSceneLoc').value;
      const atm = document.getElementById('esSceneAtm').value;

      if (window.api.currentRoom) {
        try {
          await window.api.updateGameState(window.api.currentRoom.id, {
            scene: {
              title,
              description: desc,
              location: loc,
              atmosphere: atm
            }
          });
          this.closeEditSceneModal();
          this.renderGameBoard();
          window.app.showToast('Сцена обновлена', 'Новое описание видно всем игрокам', 'info');
        } catch (err) {
          alert(err.message);
        }
      }
    });
  }

  listenWebSockets() {
    window.api.on('game_state_updated', (data) => {
      if (window.api.currentRoom && data.room && window.api.currentRoom.id === data.room.id) {
        window.api.currentRoom = data.room;
        this.renderGameBoard();
      }
    });

    window.api.on('room_message', (data) => {
      if (!data || !data.message) return;
      if (data.message.type === 'room_game' || data.message.type === 'dice' || data.message.type === 'story') {
        this.appendGameFeedItem(data.message);
      }
    });
  }

  renderGameBoard() {
    const room = window.api.currentRoom;
    const user = window.api.currentUser;
    if (!room) return;

    const state = room.gameState || {};
    const scene = state.scene || {
      title: room.title,
      description: 'Мастер начинает партию...',
      location: 'Неизведанные земли',
      atmosphere: 'Таинственная тишина'
    };

    // Render Scene Banner
    document.getElementById('gameSceneTitle').textContent = scene.title || room.title;
    document.getElementById('gameSceneDesc').textContent = scene.description;
    document.getElementById('gameSceneLoc').innerHTML = `<svg class="ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"></path><circle cx="12" cy="10" r="3"></circle></svg><span></span>`;
    document.getElementById('gameSceneLoc').querySelector('span').textContent = scene.location || 'Локация';
    document.getElementById('gameSceneAtm').innerHTML = `<svg class="ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"></path></svg><span></span>`;
    document.getElementById('gameSceneAtm').querySelector('span').textContent = scene.atmosphere || 'Спокойная обстановка';

    // Master narration box visibility
    const isMaster = user && room.host_user_id === user.id;
    const masterPanel = document.getElementById('dmMasterPanel');
    if (masterPanel) {
      masterPanel.style.display = isMaster ? 'flex' : 'none';
    }

    // Render Side Roster & HP
    this.renderRoster(room);

    // Load Game Feed
    this.loadGameFeed(room.id);
  }

  renderRoster(room) {
    const container = document.getElementById('gameRosterList');
    if (!container) return;

    const user = window.api.currentUser;
    const isMaster = user && room.host_user_id === user.id;

    container.innerHTML = (room.members || []).map(m => {
      const isSelf = user && m.user_id === user.id;
      const hpPct = Math.max(0, Math.min(100, Math.round((m.hp / m.max_hp) * 100)));
      const fillClass = hpPct < 30 ? 'low' : (hpPct < 65 ? 'mid' : '');

      return `
        <div class="roster-card" data-user-id="${m.user_id}">
          <div class="rc-top">
            ${window.renderAvatar(m.avatar, m.avatar_frame, 40)}
            <div class="rc-names">
              <div class="rc-player">${m.display_name}</div>
              <div class="rc-class">${m.character_class || 'Игрок'} (${m.character_name || m.display_name})</div>
            </div>
          </div>

          <div class="hp-bar-track">
            <div class="hp-bar-fill ${fillClass}" style="width: ${hpPct}%;"></div>
          </div>

          <div class="hp-controls-row">
            <span>Здоровье: <strong>${m.hp} / ${m.max_hp} HP</strong></span>
            ${(isSelf || isMaster) ? `
              <div style="display: flex; gap: 4px;">
                <button class="hp-btn-sm hp-minus-btn" data-user-id="${m.user_id}" data-hp="${m.hp}">-</button>
                <button class="hp-btn-sm hp-plus-btn" data-user-id="${m.user_id}" data-hp="${m.hp}">+</button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // HP Controls Click
    container.querySelectorAll('.hp-minus-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        window.sounds.playClick();
        const targetId = btn.getAttribute('data-user-id');
        const curHp = parseInt(btn.getAttribute('data-hp')) || 20;
        const newHp = Math.max(0, curHp - 1);
        try {
          await window.api.updateCharacter(room.id, { hp: newHp });
        } catch (e) {}
      });
    });

    container.querySelectorAll('.hp-plus-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        window.sounds.playClick();
        const targetId = btn.getAttribute('data-user-id');
        const curHp = parseInt(btn.getAttribute('data-hp')) || 20;
        const newHp = curHp + 1;
        try {
          await window.api.updateCharacter(room.id, { hp: newHp });
        } catch (e) {}
      });
    });
  }

  async loadGameFeed(roomId) {
    const feed = document.getElementById('gameFeedList');
    if (!feed) return;
    try {
      const messages = await window.api.getRoomMessages(roomId);
      feed.innerHTML = '';
      messages.filter(m => m.type !== 'room_lobby').forEach(m => this.appendGameFeedItem(m));
    } catch (e) {}
  }

  appendGameFeedItem(msg) {
    const feed = document.getElementById('gameFeedList');
    if (!feed) return;
    const timeStr = new Date(msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const item = document.createElement('div');

    if (msg.type === 'dice') {
      const extra = msg.extra_data || {};
      const isCrit20 = extra.isCriticalSuccess;
      const isCrit1 = extra.isCriticalFail;

      if (isCrit20) window.sounds.playCritSuccess();
      if (isCrit1) window.sounds.playCritFail();

      item.className = `feed-msg-item dice-item ${isCrit20 ? 'crit-20' : (isCrit1 ? 'crit-1' : '')}`;
      item.innerHTML = `
        ${window.renderAvatar(msg.from_user.avatar, msg.from_user.avatar_frame, 36)}
        <div class="feed-msg-content">
          <div class="feed-msg-head">
            <span class="feed-sender-name">${msg.from_user.display_name}</span>
            <span class="feed-time">${timeStr}</span>
          </div>
          <div class="feed-text">${msg.content}</div>
        </div>
      `;
    } else if (msg.type === 'story') {
      item.className = 'feed-msg-item story-item';
      item.style.cssText = 'background: rgba(255, 255, 255, 0.08); border-left: 3px solid var(--cs-amber); padding: 12px 16px; border-radius: var(--radius-md);';
      item.innerHTML = `
        <div class="feed-msg-content">
          <div class="feed-msg-head">
            <span style="font-weight: 800; color: var(--cs-amber);"><svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ><path d="M4 18h16"></path><path d="M4 15l-1.2-8L8 11l4-6 4 6 5.2-4-1.2 8z"></path></svg> ПОВЕСТВОВАНИЕ МАСТЕРА:</span>
            <span class="feed-time">${timeStr}</span>
          </div>
          <div class="feed-text" style="font-style: italic; color: #fde68a;">${msg.content}</div>
        </div>
      `;
    } else {
      item.className = 'feed-msg-item';
      item.innerHTML = `
        ${window.renderAvatar(msg.from_user.avatar, msg.from_user.avatar_frame, 36)}
        <div class="feed-msg-content">
          <div class="feed-msg-head">
            <span class="feed-sender-name">${msg.from_user.display_name}</span>
            <span class="feed-time">${timeStr}</span>
          </div>
          <div class="feed-text">${msg.content}</div>
        </div>
      `;
    }

    feed.appendChild(item);
    feed.scrollTop = feed.scrollHeight;
  }

  openEditSceneModal() {
    const room = window.api.currentRoom;
    if (!room) return;
    const scene = room.gameState?.scene || {};

    document.getElementById('esSceneTitle').value = scene.title || room.title;
    document.getElementById('esSceneDesc').value = scene.description || '';
    document.getElementById('esSceneLoc').value = scene.location || 'Таверна';
    document.getElementById('esSceneAtm').value = scene.atmosphere || 'Уютно и таинственно';

    document.getElementById('editSceneOverlay')?.classList.add('open');
  }

  closeEditSceneModal() {
    document.getElementById('editSceneOverlay')?.classList.remove('open');
  }
}

window.gameController = new GameController();
