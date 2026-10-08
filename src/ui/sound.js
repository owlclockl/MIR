/* Короткие CC0-звуки игрового меню из UI SFX (набор «Arcade»).
   Состав: щелчки, успех/ошибка, уведомления, открытие/закрытие окон,
   выбор/назад, переключатели, подключение, регулировка громкости и
   отдельный сигнал для скрытого входа администратора.

   Происхождение, лицензия и команда смены набора — в
   src/assets/sounds/LICENSE.txt. Файлы проходят через Vite: веб-версия
   получает хешированные URL, а однофайловый mir.html встраивает звук как
   data URL. Audio создаётся лениво после первого действия пользователя:
   мобильные браузеры не разрешают воспроизведение до касания. */
import click from '../assets/sounds/click.mp3';
import success from '../assets/sounds/success.mp3';
import message from '../assets/sounds/message.mp3';
import error from '../assets/sounds/error.mp3';
import open from '../assets/sounds/open.mp3';
import close from '../assets/sounds/close.mp3';
import toggleOn from '../assets/sounds/toggle-on.mp3';
import toggleOff from '../assets/sounds/toggle-off.mp3';
import select from '../assets/sounds/select.mp3';
import back from '../assets/sounds/back.mp3';
import unlock from '../assets/sounds/unlock.mp3';
import connect from '../assets/sounds/connect.mp3';
import volumeChange from '../assets/sounds/volume-change.mp3';

const FILES = {
  click,
  success,
  message,
  error,
  open,
  close,
  'toggle-on': toggleOn,
  'toggle-off': toggleOff,
  select,
  back,
  unlock,
  connect,
  'volume-change': volumeChange,
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
