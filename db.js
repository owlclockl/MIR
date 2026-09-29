const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'mir.db');
const db = new Database(dbPath);

// Enable WAL mode for high performance concurrency
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    tag TEXT NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    avatar TEXT NOT NULL,
    avatar_frame TEXT DEFAULT 'standard',
    custom_status TEXT DEFAULT '',
    role_title TEXT DEFAULT 'Игрок',
    games_played INTEGER DEFAULT 0,
    games_mastered INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friends (
    user_id_1 TEXT NOT NULL,
    user_id_2 TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id_1, user_id_2),
    FOREIGN KEY (user_id_1) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id_2) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    host_user_id TEXT NOT NULL,
    setting TEXT DEFAULT 'fantasy',
    max_players INTEGER DEFAULT 5,
    privacy TEXT DEFAULT 'public',
    password TEXT DEFAULT '',
    status TEXT DEFAULT 'in_lobby',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS room_members (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    slot_index INTEGER NOT NULL,
    role TEXT DEFAULT 'player',
    is_ready INTEGER DEFAULT 0,
    joined_at INTEGER NOT NULL,
    UNIQUE(room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS room_invites (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_users_tag ON users(username, tag);
  CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
  CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_id);
  CREATE INDEX IF NOT EXISTS idx_room_invites_to ON room_invites(to_user_id, status);
  CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id, status);
`);

// Preset Avatar SVGs / Identifiers
const AVATAR_PRESETS = [
  'wizard', 'dragon', 'knight', 'rogue', 'elf', 'cyber_samurai',
  'necro', 'paladin', 'hunter', 'artificer', 'dwarf', 'sorceress'
];

// Seed initial users if table is empty
function seedDemoData() {
  const count = db.prepare('SELECT count(*) as count FROM users').get().count;
  if (count > 0) return;

  const defaultPassword = 'password123';
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(defaultPassword, salt);

  const demoUsers = [
    {
      id: 'usr_master_alex',
      username: 'AlexMaster',
      tag: '1337',
      display_name: 'Александр [Гранд-Мастер]',
      email: 'alex@mir.rpg',
      avatar: 'dragon',
      avatar_frame: 'mythic',
      custom_status: 'Мастерю кампанию "Врата Вечности"',
      role_title: 'Гранд-Мастер',
      games_played: 42,
      games_mastered: 35
    },
    {
      id: 'usr_elena_mage',
      username: 'ElenaArcana',
      tag: '2048',
      display_name: 'Елена (Верховный Маг)',
      email: 'elena@mir.rpg',
      avatar: 'sorceress',
      avatar_frame: 'neon',
      custom_status: 'Изучаю древние свитки огня',
      role_title: 'Архимаг',
      games_played: 28,
      games_mastered: 6
    },
    {
      id: 'usr_viktor_knight',
      username: 'ViktorPaladin',
      tag: '7777',
      display_name: 'Виктор [Танк]',
      email: 'viktor@mir.rpg',
      avatar: 'knight',
      avatar_frame: 'gold',
      custom_status: 'Щит наготове, зовите в пати!',
      role_title: 'Паладин Ордена',
      games_played: 19,
      games_mastered: 2
    },
    {
      id: 'usr_kate_rogue',
      username: 'ShadowKate',
      tag: '4040',
      display_name: 'Катя Тень',
      email: 'kate@mir.rpg',
      avatar: 'rogue',
      avatar_frame: 'crimson',
      custom_status: 'Криты по 20d6 из невидимости',
      role_title: 'Теневой Клинок',
      games_played: 31,
      games_mastered: 8
    },
    {
      id: 'usr_mikhail_bard',
      username: 'MikhailBard',
      tag: '9999',
      display_name: 'Миша Бард',
      email: 'misha@mir.rpg',
      avatar: 'elf',
      avatar_frame: 'cyber',
      custom_status: 'Бросаю харизму на всё, что движется',
      role_title: 'Маэстро Вдохновения',
      games_played: 24,
      games_mastered: 4
    }
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, tag, display_name, email, password_hash, avatar, avatar_frame, custom_status, role_title, games_played, games_mastered, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  for (const u of demoUsers) {
    insertUser.run(
      u.id, u.username, u.tag, u.display_name, u.email,
      passwordHash, u.avatar, u.avatar_frame, u.custom_status,
      u.role_title, u.games_played, u.games_mastered, now
    );
  }

  // Mutually friend all demo users
  const insertFriend = db.prepare(`INSERT OR IGNORE INTO friends (user_id_1, user_id_2, created_at) VALUES (?, ?, ?)`);
  for (let i = 0; i < demoUsers.length; i++) {
    for (let j = i + 1; j < demoUsers.length; j++) {
      const u1 = demoUsers[i].id < demoUsers[j].id ? demoUsers[i].id : demoUsers[j].id;
      const u2 = demoUsers[i].id < demoUsers[j].id ? demoUsers[j].id : demoUsers[i].id;
      insertFriend.run(u1, u2, now);
    }
  }

  // Create a demo public room
  const demoRoomId = 'room_demo_01';
  const demoRoomCode = 'MIR-7777';
  const insertRoom = db.prepare(`
    INSERT INTO rooms (id, code, title, description, host_user_id, setting, max_players, privacy, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  insertRoom.run(
    demoRoomId, demoRoomCode, 'Хроники Авалона: Тайна Каравана',
    'Классическое приключение для 4-5 героев. Нужен танк и хилер!',
    'usr_master_alex', 'fantasy', 5, 'public', 'in_lobby',
    now - 600000, now - 600000
  );

  // Add demo host to the room
  const insertMember = db.prepare(`
    INSERT INTO room_members (id, room_id, user_id, slot_index, role, is_ready, joined_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertMember.run(uuidv4(), demoRoomId, 'usr_master_alex', 0, 'master', 1, now - 600000);
  insertMember.run(uuidv4(), demoRoomId, 'usr_elena_mage', 1, 'player', 1, now - 500000);

  console.log('Seeded demo users and initial demo room successfully.');
}

seedDemoData();

module.exports = {
  db,
  AVATAR_PRESETS
};
