/* Разметка настроек меню. Зависимости передаются явно: модуль не управляет
   состоянием приложения и может проверяться независимо от main.js. */
export const settingsModalHtml = ({ dialogShell, settings, updateInfo, statusText, notifyText, notificationsSupported }) =>
  dialogShell({
    label: 'Настройки',
    title: 'Настройки',
    size: 'wide',
    body: `
      <div class="dialog__body settings-list">
        <label class="setting-row">
          <span><strong>Звуки игрового меню</strong><small>Кнопки, окна, переключатели и игровые события</small></span>
          <input class="switch" type="checkbox" data-setting="sound" ${settings.sound ? 'checked' : ''} />
        </label>
        <label class="setting-row setting-row--column">
          <span><strong>Громкость</strong><small>${Math.round(settings.volume * 100)}%</small></span>
          <input class="range" type="range" min="0" max="1" step="0.05" value="${settings.volume}" data-setting="volume" ${settings.sound ? '' : 'disabled'} />
        </label>
        <label class="setting-row">
          <span><strong>Анимации</strong><small>Плавные переходы и движение фона</small></span>
          <input class="switch" type="checkbox" data-setting="motion" ${settings.motion ? 'checked' : ''} />
        </label>
        <div class="setting-row">
          <span><strong>Обновления</strong><small>${statusText}</small></span>
          <button class="mini-button${updateInfo.available ? ' mini-button--accent' : ''}" type="button" data-action="${updateInfo.available ? 'update-apply' : 'check-update'}">${updateInfo.available ? 'Обновить' : 'Проверить'}</button>
        </div>
        <label class="setting-row">
          <span><strong>Уведомления на телефон</strong><small>${notifyText}</small></span>
          <input class="switch" type="checkbox" data-setting="notify" ${settings.notify ? 'checked' : ''} ${notificationsSupported ? '' : 'disabled'} />
        </label>
        <p class="form-note">Настройки сохраняются на этом устройстве. Обновление применяется один раз после загрузки и больше не создаёт цикл перезагрузок.</p>
      </div>`,
  });
