/**
 * API and WebSocket client (accounts, friends, invites, rooms)
 */
class ApiClient {
  constructor() {
    this.token = localStorage.getItem('mir.token') || null;
    this.currentUser = null;
    this.ws = null;
    this.listeners = new Map();
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.currentRoom = null;
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('mir.token', token);
    } else {
      localStorage.removeItem('mir.token');
    }
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
  }

  off(event, handler) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(handler);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const handler of this.listeners.get(event)) {
        try {
          handler(data);
        } catch (e) {
          console.error(`Error in event listener for ${event}:`, e);
        }
      }
    }
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config = {
      ...options,
      headers
    };

    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }

    const res = await fetch(endpoint, config);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Ошибка сервера (${res.status})`);
    }

    return data;
  }

  // ================= Auth =================
  async getDemoUsers() {
    return this.request('/api/auth/demo-users');
  }

  async demoLogin(userId) {
    const res = await this.request('/api/auth/demo-login', {
      method: 'POST',
      body: { userId }
    });
    this.setToken(res.token);
    this.currentUser = res.user;
    this.connectWs();
    this.emit('auth_changed', this.currentUser);
    return res;
  }

  async login(username, password) {
    const res = await this.request('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    });
    this.setToken(res.token);
    this.currentUser = res.user;
    this.connectWs();
    this.emit('auth_changed', this.currentUser);
    return res;
  }

  async register(payload) {
    const res = await this.request('/api/auth/register', {
      method: 'POST',
      body: payload
    });
    this.setToken(res.token);
    this.currentUser = res.user;
    this.connectWs();
    this.emit('auth_changed', this.currentUser);
    return res;
  }

  async fetchMe() {
    if (!this.token) return null;
    try {
      const res = await this.request('/api/auth/me');
      this.currentUser = res.user;
      this.connectWs();
      this.emit('auth_changed', this.currentUser);
      return res.user;
    } catch (e) {
      this.logout();
      return null;
    }
  }

  async updateProfile(payload) {
    const res = await this.request('/api/auth/profile', {
      method: 'PUT',
      body: payload
    });
    this.currentUser = res.user;
    this.emit('auth_changed', this.currentUser);
    return res.user;
  }

  logout() {
    this.setToken(null);
    this.currentUser = null;
    this.currentRoom = null;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.emit('auth_changed', null);
  }

  // ================= Friends =================
  async getFriends() {
    const res = await this.request('/api/friends');
    return res.friends;
  }

  async getFriendRequests() {
    return this.request('/api/friends/requests');
  }

  async sendFriendRequest(target) {
    return this.request('/api/friends/request', {
      method: 'POST',
      body: { target }
    });
  }

  async respondFriendRequest(requestId, action) {
    return this.request('/api/friends/respond', {
      method: 'POST',
      body: { requestId, action }
    });
  }

  async removeFriend(friendId) {
    return this.request(`/api/friends/${friendId}`, {
      method: 'DELETE'
    });
  }

  // ================= Rooms =================
  async getRooms() {
    const res = await this.request('/api/rooms');
    return res.rooms;
  }

  async createRoom(payload) {
    const res = await this.request('/api/rooms', {
      method: 'POST',
      body: payload
    });
    this.currentRoom = res.room;
    this.sendPresence('in_lobby', res.room.id);
    return res.room;
  }

  async getRoom(idOrCode) {
    const res = await this.request(`/api/rooms/${idOrCode}`);
    return res.room;
  }

  async joinRoom(id, payload = {}) {
    const res = await this.request(`/api/rooms/${id}/join`, {
      method: 'POST',
      body: payload
    });
    this.currentRoom = res.room;
    this.sendPresence('in_lobby', res.room.id);
    return res.room;
  }

  async leaveRoom(id) {
    const res = await this.request(`/api/rooms/${id}/leave`, {
      method: 'POST'
    });
    this.currentRoom = null;
    this.sendPresence('online', null);
    return res;
  }

  async setReady(id, ready) {
    const res = await this.request(`/api/rooms/${id}/ready`, {
      method: 'POST',
      body: { ready }
    });
    this.currentRoom = res.room;
    return res.room;
  }

  async kickPlayer(id, targetUserId) {
    const res = await this.request(`/api/rooms/${id}/kick`, {
      method: 'POST',
      body: { targetUserId }
    });
    this.currentRoom = res.room;
    return res.room;
  }



  async inviteFriend(id, friendId) {
    return this.request(`/api/rooms/${id}/invite`, {
      method: 'POST',
      body: { friendId }
    });
  }

  async getInvites() {
    const res = await this.request('/api/invites');
    return res.invites;
  }

  async respondInvite(inviteId, action) {
    const res = await this.request('/api/invites/respond', {
      method: 'POST',
      body: { inviteId, action }
    });
    if (action === 'accept' && res.room) {
      this.currentRoom = res.room;
      this.sendPresence('in_lobby', res.room.id);
    }
    return res;
  }

  // ================= WebSocket =================
  connectWs() {
    if (!this.token) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({
        type: 'auth',
        token: this.token,
        currentRoomId: this.currentRoom ? this.currentRoom.id : null
      }));

      // Heartbeat ping
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit(data.type, data);
        this.emit('*', data);
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    this.ws.onclose = () => {
      clearInterval(this.pingTimer);
      if (this.token) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connectWs(), 3000);
      }
    };

    this.ws.onerror = (err) => {
      console.warn('WS error', err);
    };
  }

  sendPresence(status, currentRoomId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'set_presence',
        status,
        currentRoomId
      }));
    }
  }
}

window.api = new ApiClient();
