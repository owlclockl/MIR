/* Без настоящих ключей: проверяем, что диагностика не раскрывает значения,
   замечает клиентский префикс и что локальные файлы с ключами игнорируются. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fromRoot } from './lib/root.mjs';

const run = (env) => spawnSync(process.execPath, [fromRoot('scripts/keys-status.mjs')], {
  env: { ...process.env, ...env },
  encoding: 'utf8',
});

const safe = run({ GH_TOKEN: 'fake-github-key-never-print', SAGES_ADMIN_KEY: 'fake-admin-key-never-print' });
assert.equal(safe.status, 0, safe.stderr);
assert.match(safe.stdout, /GH_TOKEN: задана/);
assert.match(safe.stdout, /SAGES_ADMIN_KEY: задана/);
assert.doesNotMatch(safe.stdout + safe.stderr, /fake-github-key-never-print|fake-admin-key-never-print/);

const unsafe = run({ VITE_OPENAI_API_KEY: 'fake-public-key-never-print' });
assert.equal(unsafe.status, 1);
assert.match(unsafe.stderr, /VITE_OPENAI_API_KEY/);
assert.doesNotMatch(unsafe.stdout + unsafe.stderr, /fake-public-key-never-print/);

for (const name of ['.env', '.env.local', '.env.production', '.dev.vars', '.dev.vars.staging', 'server/data/new-hub.json']) {
  const check = spawnSync('git', ['check-ignore', '--no-index', '--quiet', name], { cwd: fromRoot(), encoding: 'utf8' });
  assert.equal(check.status, 0, `${name} должен игнорироваться Git`);
}
const example = spawnSync('git', ['check-ignore', '--no-index', '--quiet', '.env.example'], { cwd: fromRoot() });
assert.equal(example.status, 1, '.env.example должен допускать документацию без значений');
console.log('Диагностика ключей: значения не печатаются, публичные префиксы запрещены, файлы секретов игнорируются.');
