/**
 * image.ts — подготовка фото для отчёта.
 * Сжимает изображение через canvas (макс. сторона 1280px, JPEG 80%),
 * чтобы фото не раздували IndexedDB и отправлялись даже в слабой сети.
 */

export interface PreparedPhoto {
  dataUrl: string;
  sizeKb: number;
}

export function compressImage(file: File, maxDim = 1280, quality = 0.8): Promise<PreparedPhoto> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Файл не является изображением'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Не удалось открыть изображение'));
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            // Canvas недоступен — отдаём оригинал
            resolve({ dataUrl: ev.target?.result as string, sizeKb: Math.round(file.size / 1024) });
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          // Примерный размер base64-строки в КБ
          const sizeKb = Math.round((dataUrl.length * 3) / 4 / 1024);
          resolve({ dataUrl, sizeKb });
        } catch (e) {
          reject(e);
        }
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Открывает выбор файла: камера (capture=true) или галерея + камера (capture=false). */
export function pickPhoto(fromCamera: boolean): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // capture открывает камеру напрямую; без него Android/iOS показывают выбор «Камера или Галерея»
    if (fromCamera) input.capture = 'environment';
    input.onchange = () => resolve(input.files?.[0] || null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
