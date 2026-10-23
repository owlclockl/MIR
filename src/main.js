import './styles/canvas.css';

/**
 * Пустой холст: одна сцена на весь экран, ни одного элемента.
 * Сюда будут добавляться блоки меню — по одному, по мере готовности.
 *
 * G — включить/выключить сетку для выравнивания.
 */
const canvas = document.createElement('div');
canvas.className = 'canvas';
canvas.id = 'canvas';
document.querySelector('#app').append(canvas);

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'g' || event.key === 'п') canvas.classList.toggle('is-grid');
});
