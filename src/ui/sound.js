/* Короткие CC0-звуки интерфейса. Audio создаётся лениво после первого
   действия пользователя — так мобильные браузеры не блокируют воспроизведение. */
const FILES = {
  click: '/sounds/click.wav',
  success: '/sounds/success.wav',
  message: '/sounds/message.wav',
  error: '/sounds/error.wav',
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
