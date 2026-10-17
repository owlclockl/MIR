import assert from 'node:assert/strict';
import { isInviteCode } from '../src/data/invite-code.js';

for (const code of ['ABCD-2345', '0000-ZZZZ']) assert.equal(isInviteCode(code), true, `${code} should pass`);
for (const code of [
  '', 'abcd-2345', 'ABCDE-2345', 'ABCD-23456', 'ABCD2345', ' ABCD-2345', 'ABCD-2345 ',
  null, undefined, 1234, {},
]) assert.equal(isInviteCode(code), false, `${String(code)} should fail`);

console.log('Коды приглашений: все проверки пройдены');
