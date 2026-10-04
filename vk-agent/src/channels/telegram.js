// Адаптер Telegram. Заглушка.
//
// Правило: площадка, чей адаптер не написан, не притворяется рабочей.
// В сухом прогоне она показывает, что ушла бы публикация; в боевом режиме —
// понятная ошибка вместо тихого пропуска. Иначе пост «опубликован», а его никто не видел.

export const id = 'telegram';
export const name = 'Telegram';
export const implemented = false;

export function readiness() {
  return {
    ready: false,
    problems: [
      'Адаптер Telegram не написан: включить площадку нельзя.',
      'Что нужно: TELEGRAM_BOT_TOKEN и TELEGRAM_CHANNEL_ID в .env, затем sendMessage в Bot API.',
    ],
  };
}

export async function check() {
  return { ready: false, error: 'Адаптер Telegram не написан' };
}

export async function publish() {
  throw new Error(
    'Публикация в Telegram недоступна: адаптер не написан. В сухом прогоне эта площадка показывается как «ушло бы», в боевом — падает с ошибкой.',
  );
}
