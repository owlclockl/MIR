/* Короткие CC0-звуки интерфейса. Файлы лежат рядом с кодом и проходят через
   сборщик, а не через public/: так у веб-версии получается хешированное имя
   с вечным кешем, а в однофайловом mir.html звук становится data URL сам
   собой (сборщик встраивает мелкие ресурсы) — без ручной склейки строк.
   Audio создаётся лениво после первого действия пользователя: мобильные
   браузеры блокируют воспроизведение до касания. */
import click from '../assets/sounds/click.wav';
import success from '../assets/sounds/success.wav';
import message from '../assets/sounds/message.wav';
import error from '../assets/sounds/error.wav';

const FILES = { click, success, message, error };
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
