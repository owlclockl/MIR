/* Каркас окна: затемнение, шапка с заголовком и кнопкой закрытия.

   Отдельным файлом, а не в `main.js`, потому что каркас нужен сразу двум
   модулям интерфейса: меню (`src/main.js`) и скрытой панели админа
   (`src/ui/admin-panel.js`). Держать его в `main.js` значило бы либо
   дублировать разметку, либо тянуть панель обратно в меню — а панель
   оттуда как раз уехала. */

import { escapeHtml } from './dom.js';
import { icon } from './icons.js';

export const dialogShell = ({ label, title, size = '', body }) => `
  <div class="overlay" data-action="overlay-down">
    <section class="dialog${size ? ` dialog--${size}` : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(label)}">
      <header class="dialog__head">
        <h2 class="dialog__title">${escapeHtml(title)}</h2>
        <button class="icon-button icon-button--sm" type="button" data-action="close-modal" aria-label="Закрыть">
          ${icon('x')}
        </button>
      </header>
      ${body}
    </section>
  </div>`;
