import assert from 'node:assert/strict';
import { settingsModalHtml } from '../src/ui/settings.js';

const render = (overrides = {}) => settingsModalHtml({
  dialogShell: ({ label, title, body }) => `<section aria-label="${label}"><h2>${title}</h2>${body}</section>`,
  settings: { sound: true, volume: 0.65, motion: true, notify: false },
  updateInfo: { available: false },
  statusText: 'Обновлений нет',
  notifyText: 'Включить уведомления',
  notificationsSupported: true,
  ...overrides,
});

const html = render();
assert.match(html, /Настройки/);
assert.match(html, /value="0\.65"/);
assert.match(html, /data-setting="motion" checked/);
assert.match(html, /data-action="check-update"/);
assert.match(html, /data-setting="notify"/);
const updateHtml = render({ updateInfo: { available: true }, notificationsSupported: false });
assert.match(updateHtml, /data-action="update-apply"/);
assert.match(updateHtml, /data-setting="notify"[^>]*disabled/);
console.log('Разметка настроек: все проверки пройдены');
