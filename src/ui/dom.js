/* Мелкие помощники разметки: экранирование, цвет из имени, даты,
   копирование в буфер и всплывающие сообщения. */

export const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export const nameHue = (key) => {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
};

/* Формат даты собирается один раз: списки показывают десятки дат
   подряд, а создание Intl.DateTimeFormat само по себе небыстрое. */
const DATE_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export const formatDate = (ts) => DATE_FORMAT.format(new Date(ts));

/* Время суток без даты: «14:32». Тот же смысл, что у DATE_FORMAT:
   формат собирается один раз, потому что журнал и списки рисуют сотни
   отметок подряд. */
const TIME_FORMAT = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

export const formatTime = (ts) => TIME_FORMAT.format(new Date(ts));

/* Словарь присутствия: как состояние игрока называется в интерфейсе и
   каким классом красится точка. Живёт здесь, а не в меню: панель админа
   показывает те же состояния, что и панель друзей, и слова должны
   совпадать. */
export const PRESENCE = {
  playing: { label: 'В игре', modifier: 'live' },
  idle: { label: 'В меню', modifier: 'live' },
  offline: { label: 'Не в сети', modifier: 'off' },
};

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

