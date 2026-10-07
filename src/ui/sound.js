/* Короткие CC0-звуки интерфейса: восемь откликов из библиотеки UI SFX
   (npm-пакет `uisfx`, набор «Glass» — яркие, хрустальные, «как на топовых
   сайтах»).
   Происхождение, лицензия и способ заменить весь комплект другой командой —
   в src/assets/sounds/LICENSE.txt.

   Файлы лежат рядом с кодом и проходят через сборщик, а не через public/:
   так у веб-версии получается хешированное имя с вечным кешем, а в
   однофайловом mir.html звук становится data URL сам собой (сборщик
   встраивает ресурсы) — без ручной склейки строк.
   Audio создаётся лениво после первого действия пользователя: мобильные
   браузеры блокируют воспроизведение до касания. */
import click from '../assets/sounds/click.mp3';
import success from '../assets/sounds/success.mp3';
import message from '../assets/sounds/message.mp3';
import error from '../assets/sounds/error.mp3';
import open from '../assets/sounds/open.mp3';
import close from '../assets/sounds/close.mp3';
import toggleOn from '../assets/sounds/toggle-on.mp3';
import toggleOff from '../assets/sounds/toggle-off.mp3';

const FILES = {
  click,
  success,
  message,
  error,
  open,
  close,
  'toggle-on': toggleOn,
  'toggle-off': toggleOff,
};
const pool = new Map();
let settingsGetter = () => ({ sound: true, volume: 0.55 });

export const configureSounds = (getter) => { settingsGetter = getter; };

export const playSound = (name) => {
  const settings = settingsGetter();
  if (!settings.sound || !FILES[name] || typeof Audio === 'undefined') return;
  try {
    let audio = pool.get(name);
    if (!audio) {
      audio = new Audio(FILES[name]);
      audio.preload = 'auto';
      pool.set(name, audio);
    }
    audio.volume = Math.max(0, Math.min(1, Number(settings.volume) || 0));
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch { /* Звук — украшение, не причина ломать интерфейс. */ }
};
