/* Saved party presets. Slots are local to the signed-in account and device;
   the hub still hosts only one active room per player. */
import { PARTY_MAX_MEMBERS, PARTY_TITLE_MAX } from './lobby.js';

export const PARTY_SLOT_COUNT = 4;
export const PARTY_SLOT_MAX_INVITEES = Math.max(0, PARTY_MAX_MEMBERS - 1);

const memory = new Map();
const storageKey = (userId) => `sages:party-slots:${String(userId ?? '').trim().slice(0, 160)}`;
const validUser = (userId) => String(userId ?? '').trim().length > 0;
const slotIndex = (value) => Math.max(0, Math.min(PARTY_SLOT_COUNT - 1, Math.trunc(Number(value) || 0)));

const emptyState = () => ({
  selected: 0,
  slots: Array.from({ length: PARTY_SLOT_COUNT }, () => ({ title: '', invitees: [], roomId: '' })),
});

const cleanInvitees = (value) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((id) => String(id ?? '').trim().slice(0, 160))
    .filter(Boolean))].slice(0, PARTY_SLOT_MAX_INVITEES);
};

const cleanTitle = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, PARTY_TITLE_MAX);

const cleanState = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const rows = Array.isArray(source.slots) ? source.slots : [];
  return {
    selected: slotIndex(source.selected),
    slots: Array.from({ length: PARTY_SLOT_COUNT }, (_, index) => {
      const row = rows[index] && typeof rows[index] === 'object' ? rows[index] : {};
      return {
        title: cleanTitle(row.title),
        invitees: cleanInvitees(row.invitees),
        roomId: String(row.roomId ?? '').trim().slice(0, 160),
      };
    }),
  };
};

const readRaw = (key) => {
  try {
    const value = globalThis.localStorage?.getItem(key);
    if (value !== null && value !== undefined) return value;
  } catch {
    // Private browsing / storage restrictions: continue with this-tab memory.
  }
  return memory.get(key) ?? null;
};

const persist = (userId, data) => {
  if (!validUser(userId)) return emptyState();
  const key = storageKey(userId);
  const clean = cleanState(data);
  const serialized = JSON.stringify(clean);
  memory.set(key, serialized);
  try {
    globalThis.localStorage?.setItem(key, serialized);
  } catch {
    // The in-memory copy keeps slots available until this tab closes.
  }
  return clean;
};

/** Read the four saved slots for one account. */
export const loadPartySlots = (userId) => {
  if (!validUser(userId)) return emptyState();
  const raw = readRaw(storageKey(userId));
  if (!raw) return emptyState();
  try {
    return cleanState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
};

/** Switch the selected preset and persist the choice. */
export const selectPartySlot = (userId, index) => {
  const data = loadPartySlots(userId);
  data.selected = slotIndex(index);
  return persist(userId, data);
};

/** Update one profile without changing the other three. */
export const updatePartySlot = (userId, index, patch = {}) => {
  const data = loadPartySlots(userId);
  const selected = slotIndex(index);
  const current = data.slots[selected];
  const next = { ...current };
  if (Object.hasOwn(patch, 'title')) next.title = cleanTitle(patch.title);
  if (Object.hasOwn(patch, 'invitees')) next.invitees = cleanInvitees(patch.invitees);
  if (Object.hasOwn(patch, 'roomId')) next.roomId = String(patch.roomId ?? '').trim().slice(0, 160);
  data.slots[selected] = next;
  return persist(userId, data);
};

/** Link the active room to its preset on this device. */
export const attachPartyRoom = (userId, index, roomId, title) => {
  const data = loadPartySlots(userId);
  const selected = slotIndex(index);
  data.selected = selected;
  data.slots[selected] = {
    ...data.slots[selected],
    ...(title === undefined ? {} : { title: cleanTitle(title) }),
    roomId: String(roomId ?? '').trim().slice(0, 160),
  };
  return persist(userId, data);
};

/** Return the slot currently associated with a room, or null. */
export const slotForPartyRoom = (userId, roomId) => {
  if (!validUser(userId) || !String(roomId ?? '').trim()) return null;
  const wanted = String(roomId).trim();
  const data = loadPartySlots(userId);
  const index = data.slots.findIndex((slot) => slot.roomId === wanted);
  return index < 0 ? null : index;
};

/** Forget a closed room while keeping its title and invite list. */
export const clearPartyRoom = (userId, roomId) => {
  if (!validUser(userId) || !String(roomId ?? '').trim()) return false;
  const wanted = String(roomId).trim();
  const data = loadPartySlots(userId);
  let changed = false;
  for (const slot of data.slots) {
    if (slot.roomId !== wanted) continue;
    slot.roomId = '';
    changed = true;
  }
  if (changed) persist(userId, data);
  return changed;
};
