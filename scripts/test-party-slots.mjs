import assert from 'node:assert/strict';
import {
  PARTY_SLOT_COUNT,
  PARTY_SLOT_MAX_INVITEES,
  attachPartyRoom,
  clearPartyRoom,
  loadPartySlots,
  selectPartySlot,
  slotForPartyRoom,
  updatePartySlot,
} from '../src/data/party-slots.js';

const user = `party-slot-test-${Date.now()}-${Math.random()}`;
const initial = loadPartySlots(user);
assert.equal(PARTY_SLOT_COUNT, 4);
assert.equal(initial.slots.length, 4);
assert.equal(initial.selected, 0);

updatePartySlot(user, 0, { title: 'Первая группа', invitees: ['alice', 'bob', 'alice'] });
updatePartySlot(user, 1, { title: 'Вторая группа', invitees: ['carol'] });
selectPartySlot(user, 1);
let saved = loadPartySlots(user);
assert.equal(saved.selected, 1);
assert.deepEqual(saved.slots[0].invitees, ['alice', 'bob']);
assert.deepEqual(saved.slots[1].invitees, ['carol']);
assert.equal(saved.slots[2].title, '');

const tooMany = Array.from({ length: PARTY_SLOT_MAX_INVITEES + 2 }, (_, index) => `friend-${index}`);
updatePartySlot(user, 2, { title: '  Третья   группа ', invitees: tooMany });
saved = loadPartySlots(user);
assert.equal(saved.slots[2].title, 'Третья группа');
assert.equal(saved.slots[2].invitees.length, PARTY_SLOT_MAX_INVITEES);

attachPartyRoom(user, 1, 'lobby-2', 'Вторая группа');
assert.equal(slotForPartyRoom(user, 'lobby-2'), 1);
assert.equal(clearPartyRoom(user, 'lobby-2'), true);
assert.equal(slotForPartyRoom(user, 'lobby-2'), null);
saved = loadPartySlots(user);
assert.equal(saved.slots[1].title, 'Вторая группа');
assert.deepEqual(saved.slots[1].invitees, ['carol']);
assert.equal(saved.slots[1].roomId, '');

console.log('Слоты партий: все проверки пройдены (4 независимых профиля, выбор слота, приглашённые и привязка комнаты).');
