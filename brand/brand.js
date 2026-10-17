/* Бренд-страница: три небольших поведения, без фреймворка.
   1. Переключатель поверхности плашек — показывает нужную редакцию логотипа.
   2. Копирование hex по нажатию на значение палитры.
   3. Подсветка текущей главы в верхней навигации.

   Всё необязательное: без скрипта страница читается и печатается целиком,
   поэтому ошибка копирования или отсутствие IntersectionObserver ничего
   не ломают. */

const root = document.documentElement;
const toast = document.querySelector('#toast');

/* ---------- Логотипы при открытии с диска ------------------

   В разметке пути к логотипам абсолютные (/logo.svg): так их раздаёт
   dev-сервер и любой хостинг из папки public. Но книгу можно открыть и
   двойным кликом, по file://, где /logo.svg указывает в корень диска.
   Тогда каждая картинка, которая не загрузилась, переключается на
   соседний файл в public/. Разметка остаётся одной, режимы не расходятся. */

document.querySelectorAll('img[src^="/"]').forEach((image) => {
  image.addEventListener(
    'error',
    () => {
      if (image.dataset.localFallback) return;
      image.dataset.localFallback = '1';
      image.src = `../public${image.getAttribute('src')}`;
    },
    { once: true },
  );
});

if (location.protocol === 'file:') {
  document.querySelectorAll('a[download][href^="/"]').forEach((link) => {
    link.href = `../public${link.getAttribute('href')}`;
  });
}

let toastTimer = 0;
const say = (message) => {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
};

/* ---------- Поверхность плашек ---------------------------- */

const surfaceNames = {
  night: 'Лесная ночь',
  deep: 'Глубокий лес',
  raised: 'Приподнятая',
  paper: 'Бумага',
};

const surfaceButtons = [...document.querySelectorAll('[data-surface-set]')];

const setSurface = (surface, announce) => {
  if (!(surface in surfaceNames)) return;
  root.dataset.surface = surface;
  for (const button of surfaceButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.surfaceSet === surface));
  }
  if (announce) {
    say(
      surface === 'paper'
        ? 'Бумага: показаны ink-редакции логотипа'
        : `Поверхность: ${surfaceNames[surface].toLowerCase()} — тёмные редакции`,
    );
  }
};

for (const button of surfaceButtons) {
  button.addEventListener('click', () => setSurface(button.dataset.surfaceSet, true));
}

/* ---------- Копирование цвета ----------------------------- */

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* Старые браузеры и страницы без разрешения на clipboard:
       пробуем через выделение, это последний доступный путь. */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
};

for (const button of document.querySelectorAll('[data-hex]')) {
  button.addEventListener('click', async () => {
    const hex = button.dataset.hex;
    const ok = await copyText(hex);
    say(ok ? `Скопировано: ${hex}` : `Значение: ${hex}`);
  });
}

/* ---------- Текущая глава --------------------------------- */

const chapterLinks = [...document.querySelectorAll('.masthead__nav a[href^="#"]')];
const chapters = chapterLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

if (chapters.length && 'IntersectionObserver' in window) {
  const active = new Map();

  const update = () => {
    const visible = [...active.entries()]
      .filter(([, ratio]) => ratio > 0.15)
      .sort((a, b) => b[1] - a[1]);
    const current = visible[0]?.[0] || null;
    for (const link of chapterLinks) {
      const isCurrent = current && link.getAttribute('href') === `#${current.id}`;
      if (isCurrent) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) active.set(entry.target, entry.intersectionRatio);
      update();
    },
    { rootMargin: '-84px 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] },
  );

  for (const chapter of chapters) observer.observe(chapter);
}
