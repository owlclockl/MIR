/* Редактор карт Azgaar внутри игры.

   Рабочая карта после удаления собственного основного генератора.
   Здесь описаны URL и ограничения Azgaar:

   • в sages.html редактор вшит шаблоном — JSON-блок #sages-fmg-template
     (сборка: scripts/lib/fmg-offline.mjs). Документ открывается через
     iframe srcdoc: отдельных файлов не нужно, работает и по file://;
   • в веб- и PWA-версии редактор раздаётся сервером из /fmg/.

   Seed и размер уходят в строку запроса. Azgaar читает их и строит карту
   заново, поэтому одинаковые параметры дают одинаковый мир.

   Ограничение игрока — интерфейсное: панели правки скрываются стилями,
   а не запрещаются. Тот, кто откроет инструменты разработчика, их увидит. */

import { WORLD_MAP_POINTS } from '../data/store.js';
import { attachGenerationStage, injectGenerationHook } from './generation-stage.js';

const TEMPLATE_ID = 'sages-fmg-template';
/* В шаблоне стоит JSON-строка с этим плейсхолдером — сюда подставляется запрос. */
const QUERY_PLACEHOLDER = '"__FMG_QUERY__"';

/* Панели правки Azgaar. В #optionsContainer лежат слои, стили, генерация,
   новая карта, сохранение, загрузка и поиск — всё, что меняет карту.
   #mapOverlay не трогаем: он показывает индикатор при загрузке файла. */
const PLAYER_CSS = `
  #optionsContainer, #customizationMenu, #exitCustomization, #assistantBubble,
  #tourPromptButton, #notes, #dialogs, .ui-dialog { display: none !important; }
`;

/* undefined — шаблон ещё не читали; null — шаблона нет (веб-версия). */
let embeddedTemplate;

const readEmbeddedTemplate = () => {
  if (embeddedTemplate !== undefined) return embeddedTemplate;
  const element = document.getElementById(TEMPLATE_ID);
  embeddedTemplate = element ? JSON.parse(element.textContent) : null;
  return embeddedTemplate;
};

/** Параметры слота — физические метры; world=earth включает в Azgaar
 * материковый профиль, нормализованный граф и километровую шкалу.
 * Малые обзорные слоты сохраняют прежнюю семантику координат. */
export const editorQuery = ({ seed, width, height }) =>
  `?${new URLSearchParams({
    seed,
    width: String(width),
    height: String(height),
    points: String(WORLD_MAP_POINTS),
    options: 'default',
    ...(width >= 1_000_000 && height >= 1_000_000 ? { world: 'earth' } : {}),
  })}`;

const restrictEditor = (frame) => {
  const doc = frame.contentDocument;
  if (!doc?.head || doc.getElementById('sages-player-restriction')) return;
  const style = doc.createElement('style');
  style.id = 'sages-player-restriction';
  style.textContent = PLAYER_CSS;
  doc.head.append(style);
};

/**
 * iframe с картой. Каждый вызов создаёт новый документ: Azgaar строит карту
 * при загрузке, поэтому смена seed или размера — это новый документ.
 * @param {{ seed: string, width: number, height: number }} config
 * @param {{ restricted?: boolean }} [options]
 *   restricted — панели правки скрыты (игрок). События хода генерации —
 *   через attachGenerationStage (generation-stage.js), см. синхронизацию лобби.
 * Анимация создания карты подключается всегда — и в одиночной игре, и в лобби.
 */
export const createEditorFrame = ({ seed, width, height }, { restricted = false } = {}) => {
  const query = editorQuery({ seed, width, height });
  const template = readEmbeddedTemplate();
  const frame = document.createElement('iframe');
  frame.className = 'world-editor-frame';
  frame.dataset.role = 'world-editor';
  frame.title = 'Карта мира — Azgaar’s Fantasy Map Generator';
  frame.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen');
  if (template) {
    /* Функция в replace: `$` внутри seed не должна стать спецсимволом подстановки. */
    frame.srcdoc = injectGenerationHook(template.replace(QUERY_PLACEHOLDER, () => JSON.stringify(query).replace(/</g, '\\u003c')));
  } else {
    frame.src = new URL(`fmg/index.html${query}`, document.baseURI).href;
  }
  /* Документ srcdoc и /fmg/ на том же источнике, что и игра, — поэтому
     стили игрока можно вставить в него напрямую. */
  frame.addEventListener('load', () => {
    if (restricted) restrictEditor(frame);
  });
  attachGenerationStage(frame);
  return frame;
};
