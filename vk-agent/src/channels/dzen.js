// Адаптер Дзен. Заглушка.
//
// Отличие от Telegram: у Дзена пост — это карточка с заголовком, текстом и картинкой.
// Одного текста недостаточно, поэтому даже после написания адаптера понадобится
// генерация обложки (этап 4 в docs/ROADMAP.md).

export const id = 'dzen';
export const name = 'Дзен';
export const implemented = false;

export function readiness() {
  return {
    ready: false,
    problems: [
      'Адаптер Дзена не написан: включить площадку нельзя.',
      'Пост в Дзене — карточка: нужен заголовок, текст и обложка. Обложка не готовится (этап 4).',
    ],
  };
}

export async function check() {
  return { ready: false, error: 'Адаптер Дзена не написан' };
}

export async function publish() {
  throw new Error(
    'Публикация в Дзен недоступна: адаптер не написан. Кроме текста нужна обложка — это отдельный этап.',
  );
}
