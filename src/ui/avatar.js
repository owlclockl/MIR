/* ===========================================================
   Загрузка аватарки: проверка файла, настраиваемое кадрирование,
   уменьшение до 192×192 и упаковка в WebP/PNG. Превью в интерфейсе
   использует исходный файл, поэтому масштаб и позицию можно менять
   без потери качества до окончательного сохранения.
   =========================================================== */

export const AVATAR_SIZE = 192;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export const pickAvatarFile = () =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png, image/jpeg, image/webp, image/gif';
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    input.addEventListener('change', () => done(input.files?.[0] || null));
    window.addEventListener('focus', () => setTimeout(() => done(input.files?.[0] || null), 350), {
      once: true,
    });
    input.click();
  });

const validateFile = (file) => {
  if (!file) return;
  if (!file.type.startsWith('image/'))
    throw new Error('Это не картинка. Подойдут PNG, JPEG, WebP или GIF.');
  if (file.size > MAX_SOURCE_BYTES)
    throw new Error('Файл тяжелее 8 МБ. Выберите картинку поменьше.');
};

const loadBitmap = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* Старые WebView не понимают опции — идём через img. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** URL исходника для живого превью. Освободить через releaseAvatarPreview(). */
export const createAvatarPreview = (file) => {
  validateFile(file);
  return URL.createObjectURL(file);
};
export const releaseAvatarPreview = (url) => {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
};

/** Кадрирует картинку. x/y — положение 0…100, zoom — 1…3, rotation — шаги по 90°. */
export const processAvatarFile = async (
  file,
  { x = 50, y = 50, zoom = 1, rotation = 0 } = {},
) => {
  if (!file) return null;
  validateFile(file);
  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    throw new Error('Не удалось прочитать картинку.');
  }

  try {
    const width = bitmap.width;
    const height = bitmap.height;
    const turns = Math.round((Number(rotation) || 0) / 90);
    const safeRotation = (((turns % 4) + 4) % 4) * 90;
    const orientedWidth = safeRotation % 180 ? height : width;
    const orientedHeight = safeRotation % 180 ? width : height;
    const safeZoom = Math.max(1, Math.min(3, Number(zoom) || 1));
    const baseSide = Math.min(orientedWidth, orientedHeight);
    const sourceSide = baseSide / safeZoom;
    const px = Math.max(0, Math.min(100, Number(x) || 0)) / 100;
    const py = Math.max(0, Math.min(100, Number(y) || 0)) / 100;
    const sx = (orientedWidth - sourceSide) * px;
    const sy = (orientedHeight - sourceSide) * py;

    let source = bitmap;
    if (safeRotation !== 0) {
      const rotated = document.createElement('canvas');
      rotated.width = orientedWidth;
      rotated.height = orientedHeight;
      const rotateCtx = rotated.getContext('2d');
      if (!rotateCtx) throw new Error('Браузер не умеет поворачивать картинки.');
      rotateCtx.translate(orientedWidth / 2, orientedHeight / 2);
      rotateCtx.rotate((safeRotation * Math.PI) / 180);
      rotateCtx.drawImage(bitmap, -width / 2, -height / 2);
      source = rotated;
    }

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Браузер не умеет обрабатывать картинки.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, sx, sy, sourceSide, sourceSide, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    /* WebP заметно легче PNG; старые браузеры вернут PNG автоматически. */
    const webp = canvas.toDataURL('image/webp', 0.88);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
  } finally {
    bitmap.close?.();
  }
};
