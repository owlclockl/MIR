#!/usr/bin/env node
/* Только наличие переменных, никогда значения. Важно: этот скрипт не
   проверяет работоспособность провайдера и не включает ИИ в игре. */
const groups = [
  ['Разработка (GitHub CLI; публичный GitHub API работает и без ключа)', ['GH_TOKEN', 'GITHUB_TOKEN']],
  ['Хаб и развёртывание', ['SAGES_ADMIN_KEY', 'CLOUDFLARE_TUNNEL_TOKEN', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']],
];

console.log('Статус переменных окружения (без раскрытия значений)');
for (const [title, names] of groups) {
  console.log(`\n${title}:`);
  for (const name of names) {
    console.log(`  ${name}: ${String(process.env[name] ?? '').trim() ? 'задана' : 'не задана'}`);
  }
}

// Всё с VITE_ попадает в клиентский бандл Vite; PUBLIC_ тоже нельзя
// считать защищённым пространством для ключей на других платформах.
const exposed = Object.keys(process.env).filter((name) =>
  /^(VITE_|PUBLIC_)/.test(name) && /(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(name) && String(process.env[name]).trim(),
);
if (exposed.length) {
  console.error(`\nОПАСНО: переменные ${exposed.join(', ')} имеют публичный префикс. Уберите префикс и перевыпустите ключи, если сборка уже публиковалась.`);
  process.exitCode = 1;
}
console.log('\nЭто проверка наличия переменных только в текущем процессе, не их валидности. Публичный GitHub API доступен без ключа. Секреты Cloudflare Worker и GitHub Actions проверяйте в их панелях отдельно. ИИ в игру не добавляется.');
