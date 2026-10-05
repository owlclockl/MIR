/* ===========================================================
   Проверка сети перед публичной ссылкой.

   Важная тонкость, из-за которой «туннель не работает, а интернет
   есть»: в Windows два независимых пути разрешения имён.

   1. getaddrinfo (dns.lookup) — им пользуются браузер, Node и npx.
      Его перехватывают VPN и прокси (Clash/Surge/StealthSurf и т.п.)
      и отвечают сами, часто поддельными адресами 198.18.x.x.
   2. Прямые запросы к DNS-серверу по UDP:53 (dns.resolve*) — так
      ходит cloudflared. Если трафик на 53-й порт уходит в тоннель
      прокси, который умеет только A-записи, запросы просто виснут.

   Cloudflare Tunnel при старте обязательно запрашивает SRV-запись
   _v2-origintunneld._tcp.argotunnel.com, чтобы узнать адреса своих
   пограничных серверов. Прокси с «фейковыми IP» на SRV не отвечают —
   отсюда «Could not lookup srv records» и мгновенный отказ cloudflared.

   Поэтому проверяем три вещи по отдельности и говорим человеку,
   что именно сломано и что с этим делать.
   =========================================================== */

import { Resolver, promises as dnsPromises, getServers } from 'node:dns';
import { networkInterfaces } from 'node:os';

export const CLOUDFLARE_SRV = '_v2-origintunneld._tcp.argotunnel.com';

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label}: нет ответа за ${ms} мс`)), ms);
      if (timer.unref) timer.unref();
    }),
  ]);

const attempt = async (fn, ms, label) => {
  try {
    return { ok: true, value: await withTimeout(fn(), ms, label) };
  } catch (error) {
    return { ok: false, error: error?.code ? `${error.code} (${error.message})` : String(error?.message || error) };
  }
};

/** Адаптеры, которые чаще всего и ломают DNS: VPN, прокси с TUN, игровые сети. */
export const suspiciousAdapters = () => {
  const found = [];
  const risky = /(tun|tap|wintun|vpn|proxy|stealth|clash|surge|radmin|hamachi|zerotier|tailscale|wireguard|outline|nekoray|v2ray|xray)/i;
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const net of list || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      const fakeIp = /^198\.1[89]\./.test(net.address); // 198.18.0.0/15 — «фейковые» адреса прокси
      const gameNet = /^(26|25)\./.test(net.address); // Radmin VPN / Hamachi
      if (fakeIp || gameNet || risky.test(name))
        found.push({
          name,
          address: net.address,
          reason: fakeIp ? 'подменные адреса прокси (198.18.0.0/15)' : gameNet ? 'виртуальная игровая сеть' : 'VPN или прокси',
        });
    }
  }
  return found;
};

/**
 * Полная проверка разрешения имён.
 * Возвращает отчёт и вердикт:
 *   ok              — всё работает;
 *   srv-blocked     — обычные имена резолвятся, SRV — нет (Cloudflare не поднимется);
 *   resolver-blocked— прямые DNS-запросы висят, но интернет через систему есть;
 *   offline         — сети нет вовсе.
 */
export const checkDns = async ({ timeoutMs = 4000 } = {}) => {
  const lookup = await attempt(() => dnsPromises.lookup('cloudflare.com'), timeoutMs, 'getaddrinfo');
  const resolve4 = await attempt(() => dnsPromises.resolve4('cloudflare.com'), timeoutMs, 'DNS A');
  const srv = await attempt(() => dnsPromises.resolveSrv(CLOUDFLARE_SRV), timeoutMs, 'DNS SRV');

  /* Тот же SRV, но через публичный резолвер: отделяем «сломан мой DNS-сервер»
     от «в сети закрыт 53-й порт целиком». */
  const publicResolver = new Resolver({ timeout: timeoutMs, tries: 1 });
  publicResolver.setServers(['1.1.1.1', '8.8.8.8']);
  const srvPublic = await attempt(
    () =>
      new Promise((res, rej) =>
        publicResolver.resolveSrv(CLOUDFLARE_SRV, (error, records) => (error ? rej(error) : res(records))),
      ),
    timeoutMs,
    'DNS SRV через 1.1.1.1',
  );

  let verdict = 'ok';
  if (!lookup.ok && !resolve4.ok) verdict = 'offline';
  else if (!resolve4.ok) verdict = 'resolver-blocked';
  else if (!srv.ok && !srvPublic.ok) verdict = 'srv-blocked';

  const adapters = suspiciousAdapters();

  return {
    verdict,
    servers: getServers(),
    lookup,
    resolve4,
    srv,
    srvPublic,
    adapters,
    cloudflareWillWork: srv.ok || srvPublic.ok,
  };
};

/** Человеческое объяснение вердикта: что произошло и что делать. */
export const explainDns = (report) => {
  const lines = [];

  if (report.verdict === 'ok') return lines;

  if (report.verdict === 'offline') {
    lines.push('Интернета нет: имена сайтов не разрешаются вообще.');
    lines.push('Публичная ссылка не поднимется, но игра по локальной сети работает.');
    return lines;
  }

  if (report.verdict === 'resolver-blocked') {
    lines.push('DNS-запросы уходят в пустоту: сайты открываются через систему,');
    lines.push('а прямые запросы к DNS-серверу (так ходит cloudflared) не доходят.');
  } else {
    lines.push('DNS не отдаёт SRV-записи. Cloudflare Tunnel без них не стартует:');
    lines.push('при запуске он спрашивает адреса своих серверов записью');
    lines.push(`${CLOUDFLARE_SRV} — и не получает ответа.`);
  }

  if (report.adapters.length) {
    lines.push('');
    lines.push('Похоже, виноват сетевой адаптер:');
    for (const adapter of report.adapters) lines.push(`  • ${adapter.name} (${adapter.address}) — ${adapter.reason}`);
  }

  lines.push('');
  lines.push('Что помогает (по убыванию простоты):');
  lines.push('  1. Выключить VPN или прокси с режимом TUN и запустить заново.');
  lines.push('  2. Прописать в свойствах сетевого адаптера DNS 1.1.1.1 и 8.8.8.8');
  lines.push('     (Параметры → Сеть и Интернет → Свойства адаптера → DNS).');
  lines.push('  3. Играть по локальной сети: пункт [1] в ИГРАТЬ-С-ДРУЗЬЯМИ.bat —');
  lines.push('     интернет для этого вообще не нужен.');
  return lines;
};
