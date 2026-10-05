/* ===========================================================
   Загрузка аватарки: выбор файла, центр-кадрирование в квадрат,
   уменьшение до 96×96 и упаковка в data URL (PNG).
   Результат хранится в localStorage, поэтому размер ограничен.
   =========================================================== */

export const AVATAR_SIZE = 96;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/* Открывает системный выбор файла. Резолвит File или null (отмена). */
export const pickAvatarFile = () =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png, image/jpeg, image/webp, image/gif';
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    input.addEventListener('change', () => done(input.files?.[0] || null));
    /* Фокус вернулся в окно, а файла нет — пользователь передумал. */
    window.addEventListener(
      'focus',
      () => setTimeout(() => done(input.files?.[0] || null), 350),
      { once: true },
    );
    input.click();
  });

const loadBitmap = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* Ниже — запасной путь через <img>. */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    /* Отзываем после загрузки: decode() уже зафиксировал пиксели. */
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
};

const sourceSize = (bitmap) => ({
  width: bitmap.width,
  height: bitmap.height,
});

/* Валидирует файл, кадрирует по центру и возвращает data URL. */
export const processAvatarFile = async (file) => {
  if (!file) return null;
  if (!file.type.startsWith('image/'))
    throw new Error('Это не картинка. Подойдут PNG, JPEG, WebP или GIF.');
  if (file.size > MAX_SOURCE_BYTES)
    throw new Error('Файл тяжелее 8 МБ. Выберите картинку поменьше.');

  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    throw new Error('Не удалось прочитать картинку.');
  }

  const { width, height } = sourceSize(bitmap);
  const side = Math.min(width, height);
  const sx = Math.floor((width - side) / 2);
  const sy = Math.floor((height - side) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  if (typeof bitmap.close === 'function') bitmap.close();

  return canvas.toDataURL('image/png');
};
