const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { WebSocketServer, WebSocket } = require('ws');
const { db, AVATAR_PRESETS } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'mir_rpg_super_secret_jwt_key_2026';
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// ==========================================
// In-Memory Presence & WebSocket Registry
// ==========================================
// Map<userId, Set<WebSocket>>
const userSockets = new Map();
// Map<userId, { status: 'online'|'away'|'in_lobby'|'in_game', lastSeen: number, currentRoomId: string|null }>
const userPresence = new Map();

// Helper to get online status
function getUserOnlineStatus(userId) {
  const sockets = userSockets.get(userId);
  const isConnected = sockets && sockets.size > 0;
  if (!isConnected) {
    // For demo users, let's keep them online/in_lobby for dynamic feel
    if (userId.startsWith('usr_')) {
      return { status: 'online', isOnline: true, currentRoomId: userId === 'usr_master_alex' ? 'room_demo_01' : null };
    }
    return { status: 'offline', isOnline: false, currentRoomId: null };
  }
  const pres = userPresence.get(userId) || { status: 'online', currentRoomId: null };
  return { status: pres.status, isOnline: true, currentRoomId: pres.currentRoomId };
}

// Broadcast to a specific user across all their open tabs
function sendToUser(userId, message) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    const payload = JSON.stringify(message);
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}

// Broadcast to all members of a room
function broadcastToRoom(roomId, message) {
  const members = db.prepare('SELECT user_id FROM room_members WHERE room_id = ?').all(roomId);
  for (const m of members) {
    sendToUser(m.user_id, message);
  }
}

// Broadcast friend status update to all friends of user
function broadcastPresenceToFriends(userId) {
  const friends = getFriendsList(userId);
  const pres = getUserOnlineStatus(userId);
  const user = db.prepare('SELECT id, username, display_name, avatar, avatar_frame, custom_status, role_title FROM users WHERE id = ?').get(userId);
  if (!user) return;

  const msg = {
    type: 'friend_presence',
    user: {
      ...user,
      status: pres.status,
      isOnline: pres.isOnline,
      currentRoomId: pres.currentRoomId
    }
  };

  for (const f of friends) {
    sendToUser(f.id, msg);
  }
}

// Helper to get friends
function getFriendsList(userId) {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.tag, u.display_name, u.avatar, u.avatar_frame, u.custom_status, u.role_title, u.games_played, u.games_mastered
    FROM friends f
    JOIN users u ON (u.id = CASE WHEN f.user_id_1 = ? THEN f.user_id_2 ELSE f.user_id_1 END)
    WHERE f.user_id_1 = ? OR f.user_id_2 = ?
  `).all(userId, userId, userId);

  return rows.map(u => {
    const pres = getUserOnlineStatus(u.id);
    let roomInfo = null;
    if (pres.currentRoomId) {
      const room = db.prepare('SELECT id, code, title, setting, max_players FROM rooms WHERE id = ?').get(pres.currentRoomId);
      if (room) {
        const memberCount = db.prepare('SELECT count(*) as count FROM room_members WHERE room_id = ?').get(room.id).count;
        roomInfo = { ...room, memberCount };
      }
    }
    return {
      ...u,
      status: pres.status,
      isOnline: pres.isOnline,
      currentRoom: roomInfo
    };
  });
}

// Helper to get rich room state
function getRoomFullDetails(roomId) {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ? OR code = ?').get(roomId, roomId);
  if (!room) return null;

  const host = db.prepare('SELECT id, username, display_name, avatar, avatar_frame, role_title FROM users WHERE id = ?').get(room.host_user_id);
  const members = db.prepare(`
    SELECT rm.*, u.username, u.display_name, u.avatar, u.avatar_frame, u.role_title, u.tag
    FROM room_members rm
    JOIN users u ON u.id = rm.user_id
    WHERE rm.room_id = ?
    ORDER BY rm.slot_index ASC
  `).all(room.id);

  let parsedGameState = {};
  try {
    parsedGameState = JSON.parse(room.game_state || '{}');
  } catch (e) {
    parsedGameState = {};
  }

  return {
    ...room,
    host,
    members,
    gameState: parsedGameState
  };
}

// Auth Middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

// Optional Auth (for public listings)
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);
    } catch (e) {}
  }
  next();
}

// ==========================================
// REST API ROUTES
// ==========================================

// 1. Auth Endpoints
app.get('/api/auth/demo-users', (req, res) => {
  const users = db.prepare("SELECT id, username, tag, display_name, email, avatar, avatar_frame, custom_status, role_title, games_played, games_mastered FROM users WHERE id LIKE 'usr_%'").all();
  res.json({ users });
});

app.post('/api/auth/demo-login', (req, res) => {
  const { userId } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Демо-аккаунт не найден' });

  const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      tag: user.tag,
      display_name: user.display_name,
      email: user.email,
      avatar: user.avatar,
      avatar_frame: user.avatar_frame,
      custom_status: user.custom_status,
      role_title: user.role_title,
      games_played: user.games_played,
      games_mastered: user.games_mastered
    }
  });
});

app.post('/api/auth/register', (req, res) => {
  let { username, password, display_name, email, avatar, avatar_frame, custom_status, role_title } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Логин и пароль обязательны' });
  }
  username = username.trim();
  if (username.length < 3 || username.length > 24) {
    return res.status(400).json({ error: 'Логин должен быть от 3 до 24 символов' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Пароль должен содержать минимум 4 символа' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: 'Пользователь с таким никнеймом уже существует' });
  }

  const id = 'usr_' + uuidv4().replace(/-/g, '').slice(0, 12);
  const tag = Math.floor(1000 + Math.random() * 9000).toString();
  display_name = (display_name && display_name.trim()) || username;
  avatar = avatar || 'wizard';
  avatar_frame = avatar_frame || 'standard';
  custom_status = custom_status || 'Готов к новым приключениям! 🎲';
  role_title = role_title || 'Игрок';

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const now = Date.now();

  db.prepare(`
    INSERT INTO users (id, username, tag, display_name, email, password_hash, avatar, avatar_frame, custom_status, role_title, games_played, games_mastered, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
  `).run(id, username, tag, display_name, email || null, passwordHash, avatar, avatar_frame, custom_status, role_title, now);

  // Auto-friend with Alexander Master so new players have someone in friends list!
  const alexId = 'usr_master_alex';
  const u1 = id < alexId ? id : alexId;
  const u2 = id < alexId ? alexId : id;
  db.prepare('INSERT OR IGNORE INTO friends (user_id_1, user_id_2, created_at) VALUES (?, ?, ?)').run(u1, u2, now);

  const token = jwt.sign({ userId: id, username }, JWT_SECRET, { expiresIn: '30d' });

  res.json({
    token,
    user: {
      id, username, tag, display_name, email, avatar, avatar_frame,
      custom_status, role_title, games_played: 0, games_mastered: 0
    }
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Введите имя пользователя и пароль' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username.trim(), username.trim());
  if (!user) {
    return res.status(400).json({ error: 'Неверное имя пользователя или пароль' });
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(400).json({ error: 'Неверное имя пользователя или пароль' });
  }

  const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      tag: user.tag,
      display_name: user.display_name,
      email: user.email,
      avatar: user.avatar,
      avatar_frame: user.avatar_frame,
      custom_status: user.custom_status,
      role_title: user.role_title,
      games_played: user.games_played,
      games_mastered: user.games_mastered
    }
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const u = req.user;
  res.json({
    user: {
      id: u.id,
      username: u.username,
      tag: u.tag,
      display_name: u.display_name,
      email: u.email,
      avatar: u.avatar,
      avatar_frame: u.avatar_frame,
      custom_status: u.custom_status,
      role_title: u.role_title,
      games_played: u.games_played,
      games_mastered: u.games_mastered
    }
  });
});

app.put('/api/auth/profile', authMiddleware, (req, res) => {
  const { display_name, avatar, avatar_frame, custom_status, role_title } = req.body;
  const user = req.user;

  const nextDisplayName = (display_name && display_name.trim()) || user.display_name;
  const nextAvatar = avatar || user.avatar;
  const nextFrame = avatar_frame || user.avatar_frame;
  const nextStatus = custom_status !== undefined ? custom_status : user.custom_status;
  const nextTitle = role_title || user.role_title;

  db.prepare(`
    UPDATE users
    SET display_name = ?, avatar = ?, avatar_frame = ?, custom_status = ?, role_title = ?
    WHERE id = ?
  `).run(nextDisplayName, nextAvatar, nextFrame, nextStatus, nextTitle, user.id);

  const updated = db.prepare('SELECT id, username, tag, display_name, email, avatar, avatar_frame, custom_status, role_title, games_played, games_mastered FROM users WHERE id = ?').get(user.id);
  
  broadcastPresenceToFriends(user.id);

  res.json({ user: updated });
});

// 2. Friends & Social Endpoints
app.get('/api/friends', authMiddleware, (req, res) => {
  const friends = getFriendsList(req.user.id);
  res.json({ friends });
});

app.get('/api/friends/requests', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const incoming = db.prepare(`
    SELECT fr.id, fr.created_at, u.id as user_id, u.username, u.tag, u.display_name, u.avatar, u.avatar_frame, u.role_title
    FROM friend_requests fr
    JOIN users u ON u.id = fr.from_user_id
    WHERE fr.to_user_id = ? AND fr.status = 'pending'
    ORDER BY fr.created_at DESC
  `).all(userId);

  const outgoing = db.prepare(`
    SELECT fr.id, fr.created_at, u.id as user_id, u.username, u.tag, u.display_name, u.avatar, u.avatar_frame, u.role_title
    FROM friend_requests fr
    JOIN users u ON u.id = fr.to_user_id
    WHERE fr.from_user_id = ? AND fr.status = 'pending'
    ORDER BY fr.created_at DESC
  `).all(userId);

  res.json({ incoming, outgoing });
});

app.post('/api/friends/request', authMiddleware, (req, res) => {
  const { target } = req.body; // could be "Username#1337" or "Username" or ID
  if (!target) return res.status(400).json({ error: 'Укажите никнейм или тег друга' });

  const currentUserId = req.user.id;
  let targetUser = null;

  if (target.includes('#')) {
    const [name, tag] = target.split('#');
    targetUser = db.prepare('SELECT * FROM users WHERE username = ? AND tag = ?').get(name.trim(), tag.trim());
  } else {
    targetUser = db.prepare('SELECT * FROM users WHERE username = ? OR id = ?').get(target.trim(), target.trim());
  }

  if (!targetUser) {
    return res.status(404).json({ error: 'Игрок не найден. Проверьте правильность ника и #тега.' });
  }

  if (targetUser.id === currentUserId) {
    return res.status(400).json({ error: 'Вы не можете отправить запрос самому себе' });
  }

  // Check if already friends
  const u1 = currentUserId < targetUser.id ? currentUserId : targetUser.id;
  const u2 = currentUserId < targetUser.id ? targetUser.id : currentUserId;
  const isFriend = db.prepare('SELECT 1 FROM friends WHERE user_id_1 = ? AND user_id_2 = ?').get(u1, u2);
  if (isFriend) {
    return res.status(400).json({ error: 'Этот игрок уже в вашем списке друзей' });
  }

  // Check pending request
  const existingReq = db.prepare("SELECT * FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'").get(currentUserId, targetUser.id);
  if (existingReq) {
    return res.status(400).json({ error: 'Запрос в друзья уже отправлен' });
  }

  // Check reciprocal request -> Auto-accept!
  const reciprocal = db.prepare("SELECT * FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'").get(targetUser.id, currentUserId);
  if (reciprocal) {
    db.prepare("UPDATE friend_requests SET status = 'accepted' WHERE id = ?").run(reciprocal.id);
    db.prepare('INSERT OR IGNORE INTO friends (user_id_1, user_id_2, created_at) VALUES (?, ?, ?)').run(u1, u2, Date.now());
    broadcastPresenceToFriends(currentUserId);
    broadcastPresenceToFriends(targetUser.id);
    return res.json({ message: 'Запрос взаимно принят! Вы теперь друзья.', friend: targetUser });
  }

  const reqId = uuidv4();
  db.prepare(`
    INSERT INTO friend_requests (id, from_user_id, to_user_id, status, created_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(reqId, currentUserId, targetUser.id, Date.now());

  // Real-time notification to target user
  sendToUser(targetUser.id, {
    type: 'friend_request',
    request: {
      id: reqId,
      from_user: {
        id: req.user.id,
        username: req.user.username,
        display_name: req.user.display_name,
        avatar: req.user.avatar,
        avatar_frame: req.user.avatar_frame,
        role_title: req.user.role_title
      }
    }
  });

  res.json({ message: `Запрос в друзья отправлен игроку ${targetUser.display_name}` });
});

app.post('/api/friends/respond', authMiddleware, (req, res) => {
  const { requestId, action } = req.body;
  const currentUserId = req.user.id;

  const request = db.prepare('SELECT * FROM friend_requests WHERE id = ? AND to_user_id = ?').get(requestId, currentUserId);
  if (!request) {
    return res.status(404).json({ error: 'Запрос не найден' });
  }

  if (action === 'accept') {
    db.prepare("UPDATE friend_requests SET status = 'accepted' WHERE id = ?").run(requestId);
    const u1 = currentUserId < request.from_user_id ? currentUserId : request.from_user_id;
    const u2 = currentUserId < request.from_user_id ? request.from_user_id : currentUserId;
    db.prepare('INSERT OR IGNORE INTO friends (user_id_1, user_id_2, created_at) VALUES (?, ?, ?)').run(u1, u2, Date.now());

    broadcastPresenceToFriends(currentUserId);
    broadcastPresenceToFriends(request.from_user_id);

    sendToUser(request.from_user_id, {
      type: 'friend_request_accepted',
      user: {
        id: req.user.id,
        display_name: req.user.display_name,
        avatar: req.user.avatar
      }
    });

    return res.json({ message: 'Запрос принят!' });
  } else {
    db.prepare("UPDATE friend_requests SET status = 'declined' WHERE id = ?").run(requestId);
    return res.json({ message: 'Запрос отклонен' });
  }
});

app.delete('/api/friends/:friendId', authMiddleware, (req, res) => {
  const currentUserId = req.user.id;
  const friendId = req.params.friendId;
  const u1 = currentUserId < friendId ? currentUserId : friendId;
  const u2 = currentUserId < friendId ? friendId : currentUserId;

  db.prepare('DELETE FROM friends WHERE user_id_1 = ? AND user_id_2 = ?').run(u1, u2);
  broadcastPresenceToFriends(currentUserId);
  broadcastPresenceToFriends(friendId);

  res.json({ message: 'Друг удален' });
});

// 3. Rooms & Lobbies Endpoints
app.get('/api/rooms', optionalAuth, (req, res) => {
  const rooms = db.prepare(`
    SELECT r.*, u.username as host_username, u.display_name as host_display_name, u.avatar as host_avatar, u.avatar_frame as host_avatar_frame,
           (SELECT count(*) FROM room_members rm WHERE rm.room_id = r.id) as current_players
    FROM rooms r
    JOIN users u ON u.id = r.host_user_id
    WHERE r.privacy = 'public' OR r.privacy = 'friends_only'
    ORDER BY r.created_at DESC
  `).all();

  res.json({ rooms });
});

app.post('/api/rooms', authMiddleware, (req, res) => {
  const user = req.user;
  let { title, description, setting, max_players, privacy, password, role, character_name, character_class } = req.body;

  title = (title && title.trim()) || `Партия ${user.display_name}`;
  setting = setting || 'fantasy';
  max_players = Math.min(8, Math.max(2, parseInt(max_players) || 5));
  privacy = privacy || 'public';
  role = role || 'master';

  // Generate short 4-digit code e.g. MIR-4829
  const code = 'MIR-' + Math.floor(1000 + Math.random() * 9000);
  const roomId = 'room_' + uuidv4().replace(/-/g, '').slice(0, 12);
  const now = Date.now();

  const initialGameState = {
    scene: {
      title: title,
      description: description || 'Добро пожаловать в игру! Мастер готовит описание первой локации...',
      location: 'Стартовая локация',
      atmosphere: 'Напряженная тишина перед великим приключением',
      notes: 'Скрытые заметки Мастера доступны только ведущему.',
      combatActive: false
    },
    log: [
      { id: uuidv4(), type: 'system', text: `Комната создана Мастером ${user.display_name}`, time: now }
    ]
  };

  db.prepare(`
    INSERT INTO rooms (id, code, title, description, host_user_id, setting, max_players, privacy, password, status, game_state, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_lobby', ?, ?, ?)
  `).run(roomId, code, title, description || '', user.id, setting, max_players, privacy, password || '', JSON.stringify(initialGameState), now, now);

  // Add host as slot 0
  const charName = character_name || (role === 'master' ? `${user.display_name} (Мастер)` : user.display_name);
  const charClass = character_class || (role === 'master' ? 'Ведущий' : 'Авантюрист');

  db.prepare(`
    INSERT INTO room_members (id, room_id, user_id, slot_index, role, is_ready, character_name, character_class, hp, max_hp, joined_at)
    VALUES (?, ?, ?, 0, ?, 1, ?, ?, 20, 20, ?)
  `).run(uuidv4(), roomId, user.id, role, charName, charClass, now);

  // Update presence
  userPresence.set(user.id, { status: 'in_lobby', currentRoomId: roomId });
  broadcastPresenceToFriends(user.id);

  const roomDetails = getRoomFullDetails(roomId);
  res.json({ room: roomDetails });
});

app.get('/api/rooms/:idOrCode', optionalAuth, (req, res) => {
  const room = getRoomFullDetails(req.params.idOrCode);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });
  res.json({ room });
});

app.post('/api/rooms/:id/join', authMiddleware, (req, res) => {
  const user = req.user;
  const roomId = req.params.id;
  const { password, character_name, character_class, role } = req.body;

  const room = db.prepare('SELECT * FROM rooms WHERE id = ? OR code = ?').get(roomId, roomId);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });

  if (room.password && room.password.length > 0 && room.password !== password) {
    return res.status(403).json({ error: 'Неверный пароль комнаты' });
  }

  // Check current members count
  const currentMembers = db.prepare('SELECT * FROM room_members WHERE room_id = ? ORDER BY slot_index ASC').all(room.id);
  const alreadyMember = currentMembers.find(m => m.user_id === user.id);

  if (!alreadyMember) {
    if (currentMembers.length >= room.max_players) {
      return res.status(400).json({ error: 'Комната заполнена' });
    }

    // Find first available slot index
    const takenSlots = new Set(currentMembers.map(m => m.slot_index));
    let nextSlot = 0;
    while (takenSlots.has(nextSlot)) nextSlot++;

    const charName = character_name || user.display_name;
    const charClass = character_class || 'Искатель приключений';
    const memberRole = role || (room.host_user_id === user.id ? 'master' : 'player');

    db.prepare(`
      INSERT INTO room_members (id, room_id, user_id, slot_index, role, is_ready, character_name, character_class, hp, max_hp, joined_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, 20, 20, ?)
    `).run(uuidv4(), room.id, user.id, nextSlot, memberRole, charName, charClass, Date.now());
  }

  userPresence.set(user.id, { status: room.status === 'in_game' ? 'in_game' : 'in_lobby', currentRoomId: room.id });
  broadcastPresenceToFriends(user.id);

  const roomDetails = getRoomFullDetails(room.id);
  broadcastToRoom(room.id, {
    type: 'room_member_joined',
    user: { id: user.id, display_name: user.display_name, avatar: user.avatar },
    room: roomDetails
  });

  res.json({ room: roomDetails });
});

app.post('/api/rooms/:id/leave', authMiddleware, (req, res) => {
  const user = req.user;
  const roomId = req.params.id;

  const room = db.prepare('SELECT * FROM rooms WHERE id = ? OR code = ?').get(roomId, roomId);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });

  db.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(room.id, user.id);

  // If host leaves and there are other members, make the next member the host
  const remainingMembers = db.prepare('SELECT * FROM room_members WHERE room_id = ? ORDER BY slot_index ASC').all(room.id);
  if (remainingMembers.length === 0) {
    db.prepare('DELETE FROM rooms WHERE id = ?').run(room.id);
  } else if (room.host_user_id === user.id) {
    const newHost = remainingMembers[0];
    db.prepare('UPDATE rooms SET host_user_id = ? WHERE id = ?').run(newHost.user_id, room.id);
    db.prepare("UPDATE room_members SET role = 'master' WHERE id = ?").run(newHost.id);
  }

  userPresence.set(user.id, { status: 'online', currentRoomId: null });
  broadcastPresenceToFriends(user.id);

  if (remainingMembers.length > 0) {
    const roomDetails = getRoomFullDetails(room.id);
    broadcastToRoom(room.id, {
      type: 'room_member_left',
      user: { id: user.id, display_name: user.display_name },
      room: roomDetails
    });
  }

  res.json({ message: 'Вы покинули комнату' });
});

app.post('/api/rooms/:id/ready', authMiddleware, (req, res) => {
  const user = req.user;
  const roomId = req.params.id;
  const { ready } = req.body;

  const room = db.prepare('SELECT id FROM rooms WHERE id = ? OR code = ?').get(roomId, roomId);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });

  db.prepare('UPDATE room_members SET is_ready = ? WHERE room_id = ? AND user_id = ?').run(ready ? 1 : 0, room.id, user.id);

  const roomDetails = getRoomFullDetails(room.id);
  broadcastToRoom(room.id, {
    type: 'room_ready_changed',
    userId: user.id,
    isReady: ready ? 1 : 0,
    room: roomDetails
  });

  res.json({ room: roomDetails });
});

app.post('/api/rooms/:id/kick', authMiddleware, (req, res) => {
  const user = req.user;
  const roomId = req.params.id;
  const { targetUserId } = req.body;

  const room = db.prepare('SELECT * FROM rooms WHERE id = ? OR code = ?').get(roomId, roomId);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });

  if (room.host_user_id !== user.id) {
    return res.status(403).json({ error: 'Только Мастер/Хост может исключать игроков' });
  }

  db.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(room.id, targetUserId);

  userPresence.set(targetUserId, { status: 'online', currentRoomId: null });
  broadcastPresenceToFriends(targetUserId);

  sendToUser(targetUserId, {
    type: 'room_kicked',
    room: { id: room.id, title: room.title }
  });

  const roomDetails = getRoomFullDetails(room.id);
  broadcastToRoom(room.id, {
    type: 'room_member_kicked',
    targetUserId,
    room: roomDetails
  });

  res.json({ room: roomDetails });
});

app.post('/api/rooms/:id/start', authMiddleware, (req, res) => {
  const user = req.user;
  const roomId = req.params.id;

  const room = db.prepare('SELECT * FROM rooms WHERE id = ? OR code = ?').get(roomId, roomId);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });

  if (room.host_user_id !== user.id) {
    return res.status(403).json({ error: 'Только Мастер может запустить сессию' });
  }

  db.prepare("UPDATE rooms SET status = 'in_game', updated_at = ? WHERE id = ?").run(Date.now(), room.id);

  // Increment games_played / games_mastered
  db.prepare('UPDATE users SET games_mastered = games_mastered + 1, games_played = games_played + 1 WHERE id = ?').run(user.id);
  const otherMembers = db.prepare('SELECT user_id FROM room_members WHERE room_id = ? AND user_id != ?').all(room.id, user.id);
  for (const m of otherMembers) {
    db.prepare('UPDATE users SET games_played = games_played + 1 WHERE id = ?').run(m.user_id);
    userPresence.set(m.user_id, { status: 'in_game', currentRoomId: room.id });
    broadcastPresenceToFriends(m.user_id);
  }

  userPresence.set(user.id, { status: 'in_game', currentRoomId: room.id });
  broadcastPresenceToFriends(user.id);

  const roomDetails = getRoomFullDetails(room.id);
  broadcastToRoom(room.id, {
    type: 'game_started',
    room: roomDetails
  });

  res.json({ room: roomDetails });
});

app.post('/api/rooms/:id/update-char', authMiddleware, (req, res) => {
  const user = req.user;
  const roomId = req.params.id;
  const { character_name, character_class, hp, max_hp, role } = req.body;

  const room = db.prepare('SELECT id FROM rooms WHERE id = ? OR code = ?').get(roomId, roomId);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });

  const member = db.prepare('SELECT * FROM room_members WHERE room_id = ? AND user_id = ?').get(room.id, user.id);
  if (!member) return res.status(400).json({ error: 'Вы не состоите в этой комнате' });

  const nextName = character_name !== undefined ? character_name : member.character_name;
  const nextClass = character_class !== undefined ? character_class : member.character_class;
  const nextHp = hp !== undefined ? hp : member.hp;
  const nextMaxHp = max_hp !== undefined ? max_hp : member.max_hp;
  const nextRole = role !== undefined ? role : member.role;

  db.prepare(`
    UPDATE room_members
    SET character_name = ?, character_class = ?, hp = ?, max_hp = ?, role = ?
    WHERE id = ?
  `).run(nextName, nextClass, nextHp, nextMaxHp, nextRole, member.id);

  const roomDetails = getRoomFullDetails(room.id);
  broadcastToRoom(room.id, {
    type: 'room_char_updated',
    userId: user.id,
    room: roomDetails
  });

  res.json({ room: roomDetails });
});

// 4. Invites
app.get('/api/invites', authMiddleware, (req, res) => {
  const invites = db.prepare(`
    SELECT ri.id, ri.status, ri.created_at, r.id as room_id, r.code as room_code, r.title as room_title, r.setting, r.status as room_status,
           u.id as from_user_id, u.username as from_username, u.display_name as from_display_name, u.avatar as from_avatar, u.avatar_frame as from_avatar_frame
    FROM room_invites ri
    JOIN rooms r ON r.id = ri.room_id
    JOIN users u ON u.id = ri.from_user_id
    WHERE ri.to_user_id = ? AND ri.status = 'pending'
    ORDER BY ri.created_at DESC
  `).all(req.user.id);

  res.json({ invites });
});

app.post('/api/rooms/:id/invite', authMiddleware, (req, res) => {
  const user = req.user;
  const roomId = req.params.id;
  const { friendId } = req.body;

  const room = db.prepare('SELECT * FROM rooms WHERE id = ? OR code = ?').get(roomId, roomId);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });

  const friend = db.prepare('SELECT id, display_name, username FROM users WHERE id = ?').get(friendId);
  if (!friend) return res.status(404).json({ error: 'Пользователь не найден' });

  const inviteId = uuidv4();
  const now = Date.now();

  db.prepare(`
    INSERT INTO room_invites (id, room_id, from_user_id, to_user_id, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(inviteId, room.id, user.id, friend.id, now);

  const invitePayload = {
    id: inviteId,
    room: {
      id: room.id,
      code: room.code,
      title: room.title,
      setting: room.setting
    },
    from_user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar: user.avatar,
      avatar_frame: user.avatar_frame
    },
    created_at: now
  };

  sendToUser(friend.id, {
    type: 'room_invite',
    invite: invitePayload
  });

  // If friend is a demo bot/character, simulate them joining after 2.5 seconds!
  if (friendId.startsWith('usr_') && friendId !== user.id) {
    setTimeout(() => {
      // Check if slot available
      const currentMembers = db.prepare('SELECT * FROM room_members WHERE room_id = ?').all(room.id);
      if (currentMembers.length < room.max_players && !currentMembers.some(m => m.user_id === friendId)) {
        const takenSlots = new Set(currentMembers.map(m => m.slot_index));
        let nextSlot = 0;
        while (takenSlots.has(nextSlot)) nextSlot++;

        const botUser = db.prepare('SELECT * FROM users WHERE id = ?').get(friendId);
        if (botUser) {
          db.prepare(`
            INSERT INTO room_members (id, room_id, user_id, slot_index, role, is_ready, character_name, character_class, hp, max_hp, joined_at)
            VALUES (?, ?, ?, ?, 'player', 1, ?, ?, 20, 20, ?)
          `).run(uuidv4(), room.id, botUser.id, nextSlot, botUser.display_name, 'Искатель приключений', Date.now());

          db.prepare("UPDATE room_invites SET status = 'accepted' WHERE id = ?").run(inviteId);

          const updatedRoom = getRoomFullDetails(room.id);
          broadcastToRoom(room.id, {
            type: 'room_member_joined',
            user: { id: botUser.id, display_name: botUser.display_name, avatar: botUser.avatar },
            room: updatedRoom
          });

          // Send greeting message in room chat
          const msgId = uuidv4();
          const greetings = [
            'Салют! Готов к приключениям, что замышляем? ⚔️',
            'Привет всем! Я в деле, меч уже наточен!',
            'Приветствую! Магия готова к бою 🔮',
            'Йоу! Наконец-то собрались, начинаем? 🎲'
          ];
          const greetText = greetings[Math.floor(Math.random() * greetings.length)];

          db.prepare(`
            INSERT INTO messages (id, type, room_id, from_user_id, to_user_id, content, extra_data, created_at)
            VALUES (?, 'room_lobby', ?, ?, NULL, ?, '{}', ?)
          `).run(msgId, room.id, botUser.id, greetText, Date.now());

          broadcastToRoom(room.id, {
            type: 'room_message',
            message: {
              id: msgId,
              type: 'room_lobby',
              room_id: room.id,
              from_user: {
                id: botUser.id,
                username: botUser.username,
                display_name: botUser.display_name,
                avatar: botUser.avatar,
                avatar_frame: botUser.avatar_frame,
                role_title: botUser.role_title
              },
              content: greetText,
              extra_data: {},
              created_at: Date.now()
            }
          });
        }
      }
    }, 2200);
  }

  res.json({ message: `Приглашение отправлено игроку ${friend.display_name}` });
});

app.post('/api/invites/respond', authMiddleware, (req, res) => {
  const user = req.user;
  const { inviteId, action } = req.body;

  const invite = db.prepare('SELECT * FROM room_invites WHERE id = ? AND to_user_id = ?').get(inviteId, user.id);
  if (!invite) return res.status(404).json({ error: 'Приглашение не найдено' });

  if (action === 'accept') {
    db.prepare("UPDATE room_invites SET status = 'accepted' WHERE id = ?").run(inviteId);
    
    // Add to room
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(invite.room_id);
    if (!room) return res.status(404).json({ error: 'Комната больше не существует' });

    const currentMembers = db.prepare('SELECT * FROM room_members WHERE room_id = ?').all(room.id);
    if (!currentMembers.some(m => m.user_id === user.id)) {
      if (currentMembers.length >= room.max_players) {
        return res.status(400).json({ error: 'Комната уже заполнена' });
      }
      const takenSlots = new Set(currentMembers.map(m => m.slot_index));
      let nextSlot = 0;
      while (takenSlots.has(nextSlot)) nextSlot++;

      db.prepare(`
        INSERT INTO room_members (id, room_id, user_id, slot_index, role, is_ready, character_name, character_class, hp, max_hp, joined_at)
        VALUES (?, ?, ?, ?, 'player', 0, ?, 'Искатель приключений', 20, 20, ?)
      `).run(uuidv4(), room.id, user.id, nextSlot, user.display_name, Date.now());
    }

    userPresence.set(user.id, { status: room.status === 'in_game' ? 'in_game' : 'in_lobby', currentRoomId: room.id });
    broadcastPresenceToFriends(user.id);

    const roomDetails = getRoomFullDetails(room.id);
    broadcastToRoom(room.id, {
      type: 'room_member_joined',
      user: { id: user.id, display_name: user.display_name, avatar: user.avatar },
      room: roomDetails
    });

    return res.json({ message: 'Приглашение принято', room: roomDetails });
  } else {
    db.prepare("UPDATE room_invites SET status = 'declined' WHERE id = ?").run(inviteId);
    return res.json({ message: 'Приглашение отклонено' });
  }
});

// 5. In-Game Session, Chat & Dice
app.get('/api/rooms/:id/messages', authMiddleware, (req, res) => {
  const roomId = req.params.id;
  const room = db.prepare('SELECT id FROM rooms WHERE id = ? OR code = ?').get(roomId, roomId);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });

  const messages = db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar, u.avatar_frame, u.role_title
    FROM messages m
    JOIN users u ON u.id = m.from_user_id
    WHERE m.room_id = ?
    ORDER BY m.created_at ASC
    LIMIT 100
  `).all(room.id);

  const formatted = messages.map(m => {
    let extra = {};
    try { extra = JSON.parse(m.extra_data || '{}'); } catch(e){}
    return {
      id: m.id,
      type: m.type,
      room_id: m.room_id,
      from_user: {
        id: m.from_user_id,
        username: m.username,
        display_name: m.display_name,
        avatar: m.avatar,
        avatar_frame: m.avatar_frame,
        role_title: m.role_title
      },
      content: m.content,
      extra_data: extra,
      created_at: m.created_at
    };
  });

  res.json({ messages: formatted });
});

app.post('/api/rooms/:id/messages', authMiddleware, (req, res) => {
  const user = req.user;
  const roomId = req.params.id;
  const { content, type, extra_data } = req.body;

  if (!content || !content.trim()) return res.status(400).json({ error: 'Сообщение не может быть пустым' });

  const room = db.prepare('SELECT id FROM rooms WHERE id = ? OR code = ?').get(roomId, roomId);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });

  const msgId = uuidv4();
  const now = Date.now();
  const msgType = type || (room.status === 'in_game' ? 'room_game' : 'room_lobby');
  const extraStr = JSON.stringify(extra_data || {});

  db.prepare(`
    INSERT INTO messages (id, type, room_id, from_user_id, to_user_id, content, extra_data, created_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
  `).run(msgId, msgType, room.id, user.id, content.trim(), extraStr, now);

  const msgPayload = {
    id: msgId,
    type: msgType,
    room_id: room.id,
    from_user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar: user.avatar,
      avatar_frame: user.avatar_frame,
      role_title: user.role_title
    },
    content: content.trim(),
    extra_data: extra_data || {},
    created_at: now
  };

  broadcastToRoom(room.id, {
    type: 'room_message',
    message: msgPayload
  });

  res.json({ message: msgPayload });
});

app.post('/api/rooms/:id/roll', authMiddleware, (req, res) => {
  const user = req.user;
  const roomId = req.params.id;
  let { diceType, count, modifier, reason } = req.body;

  diceType = diceType || 'd20';
  count = Math.min(10, Math.max(1, parseInt(count) || 1));
  modifier = parseInt(modifier) || 0;
  reason = reason ? reason.trim() : 'Бросок кубика';

  const sidesMap = { 'd4': 4, 'd6': 6, 'd8': 8, 'd10': 10, 'd12': 12, 'd20': 20, 'd100': 100 };
  const sides = sidesMap[diceType] || 20;

  const rolls = [];
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const val = Math.floor(Math.random() * sides) + 1;
    rolls.push(val);
    sum += val;
  }
  const total = sum + modifier;

  const isCriticalSuccess = diceType === 'd20' && count === 1 && rolls[0] === 20;
  const isCriticalFail = diceType === 'd20' && count === 1 && rolls[0] === 1;

  let textResult = `${user.display_name} бросает ${count}${diceType}${modifier !== 0 ? (modifier > 0 ? `+${modifier}` : modifier) : ''} [${reason}]: `;
  textResult += `( ${rolls.join(' + ')} )`;
  if (modifier !== 0) textResult += ` ${modifier > 0 ? '+' : ''}${modifier}`;
  textResult += ` = **${total}**`;
  if (isCriticalSuccess) textResult += ' 🎉 КРИТИЧЕСКИЙ УСПЕХ (НАТ 20)!';
  if (isCriticalFail) textResult += ' 💀 КРИТИЧЕСКИЙ ПРОВАЛ (1)!';

  const room = db.prepare('SELECT id, status FROM rooms WHERE id = ? OR code = ?').get(roomId, roomId);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });

  const msgId = uuidv4();
  const now = Date.now();
  const extra_data = {
    diceType, count, modifier, reason, rolls, total,
    isCriticalSuccess, isCriticalFail
  };

  db.prepare(`
    INSERT INTO messages (id, type, room_id, from_user_id, to_user_id, content, extra_data, created_at)
    VALUES (?, 'dice', ?, ?, NULL, ?, ?, ?)
  `).run(msgId, room.id, user.id, textResult, JSON.stringify(extra_data), now);

  const msgPayload = {
    id: msgId,
    type: 'dice',
    room_id: room.id,
    from_user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar: user.avatar,
      avatar_frame: user.avatar_frame,
      role_title: user.role_title
    },
    content: textResult,
    extra_data,
    created_at: now
  };

  broadcastToRoom(room.id, {
    type: 'room_message',
    message: msgPayload
  });

  res.json({ roll: extra_data, message: msgPayload });
});

app.post('/api/rooms/:id/game-state', authMiddleware, (req, res) => {
  const user = req.user;
  const roomId = req.params.id;
  const { scene, combatActive, broadcastStoryText } = req.body;

  const room = db.prepare('SELECT * FROM rooms WHERE id = ? OR code = ?').get(roomId, roomId);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });

  if (room.host_user_id !== user.id) {
    return res.status(403).json({ error: 'Только Мастер может обновлять состояние сцены' });
  }

  let currentState = {};
  try { currentState = JSON.parse(room.game_state || '{}'); } catch(e){}

  if (scene) {
    currentState.scene = {
      ...(currentState.scene || {}),
      ...scene
    };
  }

  if (combatActive !== undefined) {
    currentState.combatActive = combatActive;
  }

  const now = Date.now();
  if (broadcastStoryText && broadcastStoryText.trim()) {
    currentState.log = currentState.log || [];
    currentState.log.push({
      id: uuidv4(),
      type: 'story',
      text: broadcastStoryText.trim(),
      time: now
    });

    // Also add to messages
    const msgId = uuidv4();
    db.prepare(`
      INSERT INTO messages (id, type, room_id, from_user_id, to_user_id, content, extra_data, created_at)
      VALUES (?, 'story', ?, ?, NULL, ?, '{}', ?)
    `).run(msgId, room.id, user.id, broadcastStoryText.trim(), now);
  }

  db.prepare('UPDATE rooms SET game_state = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(currentState), now, room.id);

  const roomDetails = getRoomFullDetails(room.id);
  broadcastToRoom(room.id, {
    type: 'game_state_updated',
    room: roomDetails,
    storyText: broadcastStoryText || null
  });

  res.json({ room: roomDetails });
});

// 6. Direct Messages with Friends
app.get('/api/messages/direct/:friendId', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const friendId = req.params.friendId;

  const messages = db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar, u.avatar_frame
    FROM messages m
    JOIN users u ON u.id = m.from_user_id
    WHERE m.type = 'direct' AND (
      (m.from_user_id = ? AND m.to_user_id = ?) OR
      (m.from_user_id = ? AND m.to_user_id = ?)
    )
    ORDER BY m.created_at ASC
    LIMIT 60
  `).all(userId, friendId, friendId, userId);

  res.json({ messages });
});

app.post('/api/messages/direct/:friendId', authMiddleware, (req, res) => {
  const user = req.user;
  const friendId = req.params.friendId;
  const { content } = req.body;

  if (!content || !content.trim()) return res.status(400).json({ error: 'Текст сообщения не может быть пустым' });

  const friend = db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(friendId);
  if (!friend) return res.status(404).json({ error: 'Пользователь не найден' });

  const msgId = uuidv4();
  const now = Date.now();

  db.prepare(`
    INSERT INTO messages (id, type, room_id, from_user_id, to_user_id, content, extra_data, created_at)
    VALUES (?, 'direct', NULL, ?, ?, ?, '{}', ?)
  `).run(msgId, user.id, friend.id, content.trim(), now);

  const msgPayload = {
    id: msgId,
    type: 'direct',
    from_user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar: user.avatar,
      avatar_frame: user.avatar_frame
    },
    to_user_id: friend.id,
    content: content.trim(),
    created_at: now
  };

  sendToUser(friend.id, {
    type: 'direct_message',
    message: msgPayload
  });

  // If friend is a demo bot/character, reply automatically after 1.5 seconds!
  if (friendId.startsWith('usr_')) {
    setTimeout(() => {
      const botReplies = [
        'Да, я на связи! Зови в лобби, как будешь собирать пати.',
        'Отлично, я как раз готов сыграть!',
        'Понял тебя. Кидай инвайт в комнату!',
        'Ха-ха, договорились! Беру своего любимого мага.'
      ];
      const botText = botReplies[Math.floor(Math.random() * botReplies.length)];
      const botMsgId = uuidv4();
      const botNow = Date.now();

      db.prepare(`
        INSERT INTO messages (id, type, room_id, from_user_id, to_user_id, content, extra_data, created_at)
        VALUES (?, 'direct', NULL, ?, ?, ?, '{}', ?)
      `).run(botMsgId, friend.id, user.id, botText, botNow);

      sendToUser(user.id, {
        type: 'direct_message',
        message: {
          id: botMsgId,
          type: 'direct',
          from_user: {
            id: friend.id,
            display_name: friend.display_name,
            avatar: friend.avatar || 'sorceress'
          },
          to_user_id: user.id,
          content: botText,
          created_at: botNow
        }
      });
    }, 1500);
  }

  res.json({ message: msgPayload });
});

// ==========================================
// WEBSOCKET HANDLERS
// ==========================================
wss.on('connection', (ws, req) => {
  let authenticatedUserId = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'auth') {
        const token = msg.token;
        if (!token) return;
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          authenticatedUserId = decoded.userId;

          if (!userSockets.has(authenticatedUserId)) {
            userSockets.set(authenticatedUserId, new Set());
          }
          userSockets.get(authenticatedUserId).add(ws);

          userPresence.set(authenticatedUserId, {
            status: 'online',
            lastSeen: Date.now(),
            currentRoomId: msg.currentRoomId || null
          });

          broadcastPresenceToFriends(authenticatedUserId);

          ws.send(JSON.stringify({
            type: 'auth_success',
            userId: authenticatedUserId
          }));
        } catch (e) {
          ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid token' }));
        }
      }

      if (msg.type === 'set_presence' && authenticatedUserId) {
        const status = msg.status || 'online';
        const currentRoomId = msg.currentRoomId !== undefined ? msg.currentRoomId : (userPresence.get(authenticatedUserId)?.currentRoomId || null);
        userPresence.set(authenticatedUserId, {
          status,
          lastSeen: Date.now(),
          currentRoomId
        });
        broadcastPresenceToFriends(authenticatedUserId);
      }

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (e) {
      console.error('WS message error:', e);
    }
  });

  ws.on('close', () => {
    if (authenticatedUserId) {
      const sockets = userSockets.get(authenticatedUserId);
      if (sockets) {
        sockets.delete(ws);
        if (sockets.size === 0) {
          userSockets.delete(authenticatedUserId);
          userPresence.set(authenticatedUserId, {
            status: 'offline',
            lastSeen: Date.now(),
            currentRoomId: null
          });
          broadcastPresenceToFriends(authenticatedUserId);
        }
      }
    }
  });
});

// Single Page App fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`МИР RPG Server running at http://0.0.0.0:${PORT}`);
});
