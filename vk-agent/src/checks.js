// Механические проверки поста перед публикацией.
// Каждая проверка — правило с идентификатором, которое можно объяснить читателю поста.
// Никакой «оценки качества текста» здесь нет: только то, что проверяется однозначно.

import { nowISO, daysSince, isFresh } from './util.js';
import { loadSubjectsConfig } from './subject.js';
import { loadDisclaimers, loadRubrics, loadStopwords } from './config.js';
import { lastPublished } from './history.js';

const DATE_RE = /\d{2}\.\d{2}\.\d{4}/;
const NUMBER_RE = /(\d+(?:[.,]\d+)?\s*%|\d[\d\s]{2,}₽)/;

/**
 * @param {Object} post пост из generate.js
 * @param {Object} [options] { ttlDays, maxLength, profile }
 *   maxLength — самый строгий лимит среди включённых площадок; если текст длиннее,
 *   это не «свернётся», а площадка его не примет — поэтому ошибка, а не предупреждение.
 * @returns {{status: string, errors: Array, warnings: Array, notes: Array, checked_at: string}}
 */
export function runChecks(post, options = {}) {
  const ttlDays = options.ttlDays ?? 30;
  const maxLength = options.maxLength ?? null;
  const profile = options.profile ?? post.profile ?? null;
  const errors = [];
  const warnings = [];
  const notes = [];
  const text = String(post.text ?? '');
  const lines = text.split('\n');

  // 1. Обязательные факты для рубрики
  if (post.missing_required?.length) {
    errors.push({
      id: 'needs-data',
      message:
        `Нет обязательных фактов для рубрики «${post.rubric_name ?? post.rubric}»: ` +
        `${post.missing_required.join(', ')}. Сначала собери данные: npm run fetch -- --subject ${post.subject_id}`,
    });
  }

  // 2. Структура поста
  if (!/^#\s+\S+/m.test(text)) {
    errors.push({ id: 'no-title', message: 'В посте нет заголовка первой строкой («# ...»)' });
  }
  if (!(post.fact_lines ?? []).length) {
    errors.push({ id: 'no-facts', message: 'В посте нет ни одного факта с цифрой — публиковать нечего' });
  } else if (post.fact_lines.length < 2) {
    warnings.push({ id: 'few-facts', message: 'В посте только один факт — пост выглядит как реклама без объяснения' });
  }
  if (!(post.body ?? []).length) {
    warnings.push({ id: 'no-body', message: 'Нет поясняющих абзацев — текст короче, чем мог бы быть' });
  }

  // 2б. Незаполненные плейсхолдеры: значит факта не хватило, а текст уже собран
  const rawPlaceholders = [...new Set([...text.matchAll(/\{([\w.]+)\}/g)].map((match) => match[1]))];
  if (rawPlaceholders.length) {
    errors.push({
      id: 'unfilled-placeholder',
      message: `В тексте остались незаполненные вставки: ${rawPlaceholders.join(', ')} — не хватает фактов`,
    });
  }

  // 3. Хештеги
  const tags = post.hashtags ?? [];
  if (tags.some((tag) => !tag.startsWith('#'))) {
    errors.push({ id: 'bad-hashtag', message: 'Хештег должен начинаться с #: ' + tags.join(', ') });
  }
  if (new Set(tags).size !== tags.length) {
    warnings.push({ id: 'duplicate-hashtag', message: 'Есть повторяющиеся хештеги' });
  }
  if (tags.length < 2) {
    warnings.push({ id: 'few-hashtags', message: 'Меньше двух хештегов — пост хуже находят в поиске ВК' });
  }
  if (tags.length > 5) {
    warnings.push({ id: 'many-hashtags', message: 'Больше пяти хештегов — выглядит как спам' });
  }
  if (tags.length && !tags.every((tag) => text.includes(tag))) {
    warnings.push({ id: 'hashtags-not-in-text', message: 'Часть хештегов не попала в текст поста' });
  }

  // 3б. Задвоенные слова: «до до 15%», «ставка ставка» — следы склейки шаблона и факта
  const doubled = text.match(/(?:^|[^\S\n])([А-Яа-яЁёA-Za-z]{2,})\s+\1(?=[^\S\n]|$)/g);
  if (doubled) {
    warnings.push({
      id: 'double-word',
      message: `Похоже на задвоенное слово: ${[...new Set(doubled.map((item) => item.trim()))].join(', ')}`,
    });
  }

  // 3в. Задвоенные пары слов: «в месяц в месяц» — следы склейки шаблона и значения факта.
  // Работаем по словам, а не по регулярке: предлоги односложные, и регулярка на словах от 2 букв
  // такую пару не поймает.
  const words = text.toLowerCase().match(/[а-яёa-z0-9]+/gi) ?? [];
  const doubledPairs = [];
  for (let i = 0; i + 3 < words.length; i += 1) {
    const samePair = words[i] === words[i + 2] && words[i + 1] === words[i + 3];
    const longEnough = words[i].length + words[i + 1].length >= 4;
    if (samePair && longEnough) doubledPairs.push(`${words[i]} ${words[i + 1]}`);
  }
  if (doubledPairs.length) {
    warnings.push({
      id: 'double-phrase',
      message: `Повторяется фраза: ${[...new Set(doubledPairs)].join(', ')}`,
    });
  }

  // 4. Стоп-слова: обещания, которые нельзя давать
  const stopwords = loadStopwords(profile);
  const lower = text.toLowerCase();
  for (const phrase of stopwords.block ?? []) {
    if (lower.includes(phrase.toLowerCase())) {
      errors.push({ id: 'stopword-block', message: `Запрещённая формулировка: «${phrase}»` });
    }
  }
  for (const phrase of stopwords.warn ?? []) {
    if (lower.includes(phrase.toLowerCase())) {
      warnings.push({ id: 'stopword-warn', message: `Спорная формулировка: «${phrase}» — требует доказательства` });
    }
  }

  // 5. Цифры без даты проверки
  const factValues = (post.facts ?? []).filter((fact) => fact.value && fact.date);
  for (const line of lines) {
    if (!NUMBER_RE.test(line) || DATE_RE.test(line)) continue;
    const covered = factValues.some((fact) => line.includes(fact.value));
    if (!covered) {
      errors.push({
        id: 'number-without-date',
        message: `Цифра без даты проверки: «${line.trim().slice(0, 90)}»`,
      });
    }
  }

  // 6. Ссылки
  const urls = [...text.matchAll(/https?:\/\/[^\s)]+/g)].map((match) => match[0]);
  if (urls.length) {
    const allowedHosts = loadSubjectsConfig(profile)
      .subjects.flatMap((subject) => [subject.link, subject.help_link])
      .filter(Boolean)
      .map((url) => {
        try {
          return new URL(url).hostname.replace(/^www\./, '');
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const strange = urls.filter((url) => {
      try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        return !allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
      } catch {
        return true;
      }
    });
    if (strange.length) {
      warnings.push({
        id: 'unknown-link-domain',
        message: `Ссылка на сторонний домен: ${strange.join(', ')} — проверь, что это сайт из profiles/*/subjects.json`,
      });
    }
    warnings.push({
      id: 'external-links',
      message: 'В посте есть внешняя ссылка: ВК снижает охват таких записей, лучше первым комментарием',
    });
  }

  // 7. Крик: много заглавных и восклицательных знаков
  const letters = text.replace(/[^A-Za-zА-Яа-яЁё]/g, '');
  const upper = letters.replace(/[^A-ZА-ЯЁ]/g, '').length;
  if (letters.length > 200 && upper / letters.length > 0.35) {
    warnings.push({ id: 'too-many-caps', message: 'Больше трети текста заглавными — читается как крик' });
  }
  const exclamations = (text.match(/!/g) ?? []).length;
  if (exclamations > 3) {
    warnings.push({ id: 'too-many-exclamations', message: `Восклицательных знаков: ${exclamations} — многовато` });
  }

  // 8. Свежесть фактов
  for (const fact of post.facts ?? []) {
    if (!fact.date) {
      errors.push({ id: 'fact-without-date', message: `У факта «${fact.label}» нет даты проверки` });
      continue;
    }
    if (!isFresh(fact.date, ttlDays)) {
      const age = daysSince(fact.date);
      warnings.push({
        id: 'stale-fact',
        message: `Факт «${fact.label}» от ${fact.date} (${age} дн. назад) — данные могли устареть`,
      });
    }
  }

  // 9. Дисклеймер для типа продукта
  const disclaimers = loadDisclaimers(profile);
  const disclaimer = disclaimers[post.disclaimer_kind];
  if (disclaimer?.required && disclaimer.text && !text.includes(disclaimer.text)) {
    errors.push({
      id: 'missing-disclaimer',
      message: `Нет обязательной оговорки для типа «${post.disclaimer_kind}» — добавь её в конец поста`,
    });
  }

  // 10. Повтор: не публиковали ли такое недавно
  const last = lastPublished(post.subject_id, post.rubric, profile);
  if (last) {
    const days = daysSince(String(last.at).slice(0, 10));
    if (days !== null && days < 7) {
      warnings.push({
        id: 'recent-duplicate',
        message: `Пост про «${post.subject_name} / ${post.rubric_name}» выходил ${days} дн. назад — не части с читателя`,
      });
    }
  }

  // 11. Маркировка рекламы
  if (post.ads && !/реклама/i.test(text)) {
    errors.push({ id: 'ads-marking', message: 'Пост помечен как реклама, но маркировки «Реклама» в тексте нет' });
  }
  // Флаг ads_check ставится в рубрике профиля: платные рубрики у каждой тематики свои
  const rubricConfig = loadRubrics(profile).find((item) => item.id === post.rubric);
  if (!post.ads && rubricConfig?.ads_check) {
    warnings.push({
      id: 'ads-check',
      message: `Рубрика «${post.rubric_name ?? post.rubric}» обычно платная: нужна маркировка рекламы и ERID — проверь перед публикацией`,
    });
  }

  // 12. Длина: лимит площадки — ошибка, длинный пост в соцсети — предупреждение
  if (text.length < 200) {
    errors.push({ id: 'too-short', message: `Текст ${text.length} символов — для поста это слишком мало` });
  } else if (maxLength && text.length > maxLength) {
    errors.push({
      id: 'channel-too-long',
      message: `Текст ${text.length} символов длиннее лимита площадки (${maxLength}) — площадка его не примет`,
    });
  } else if (text.length > 2600) {
    warnings.push({ id: 'too-long', message: `Текст ${text.length} символов — площадка свернёт пост под «Показать полностью»` });
  }

  const status = errors.length ? 'blocked' : warnings.length ? 'warn' : 'ok';
  return {
    status,
    errors,
    warnings,
    notes,
    checked_at: nowISO(),
  };
}
