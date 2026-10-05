/* Мелкие помощники разметки: экранирование, цвет из имени, даты,
   копирование в буфер и всплывающие сообщения. */

export const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export const nameHue = (key) => {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
};

export const formatDate = (ts) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(ts));

export const copyText = async (text) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* Ниже — запасной путь для http по локальной сети. */
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
};

/* ---------- тосты ------------------------------------------- */

export const toast = (message, tone = 'ok') => {
  const root = document.querySelector('#toast-root');
  if (!root) return;
  const node = document.createElement('p');
  node.className = `toast toast--${tone}`;
  node.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  node.textContent = message;
  root.append(node);
  requestAnimationFrame(() => node.classList.add('toast--shown'));
  setTimeout(() => {
    node.classList.remove('toast--shown');
    node.addEventListener('transitionend', () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 400);
  }, 3400);
};

