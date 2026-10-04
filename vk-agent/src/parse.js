// Общие примитивы разбора страниц. Тематики здесь нет: только инструменты,
// которыми пользуются экстракторы (src/extractors/*.js).
//
// Функции чистые — на входе текст или html, на выходе данные. Благодаря этому
// каждый экстрактор проверяется на фикстурах без интернета: npm test

import { plainTextFromHtml, toISODate, todayISO } from './util.js';

/** Заголовок страницы */
export function extractTitle(html) {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1) return plainTextFromHtml(h1[1]).replace(/\n+/g, ' ').trim();
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return title ? plainTextFromHtml(title[1]).trim() : '';
}

/** Описание из meta — иногда там лежит самая свежая цифра */
export function extractMetaDescription(html) {
  const meta = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html);
  return meta ? meta[1].trim() : '';
}

/** Дата «Обновлено: 15.09.2026» или дата из <time> */
export function extractUpdatedDate(html, text = plainTextFromHtml(html)) {
  const updated = /(?:обновлено|актуально на|опубликовано|от)\s*[:\s]?\s*(\d{2}\.\d{2}\.\d{4})/i.exec(text);
  if (updated) return toISODate(updated[1]);
  const time = /<time[^>]+datetime=["'](\d{4}-\d{2}-\d{2})/i.exec(html);
  if (time) return time[1];
  return null;
}

/**
 * Все проценты в тексте: 10%, 16,5%, «до 15 %».
 * Контекст ограничен строкой: иначе «16% годовых» цепляется к слову «кэшбэк»
 * из соседней строки и парсер путает ставку с кэшбэком.
 */
export function findPercents(text) {
  const result = [];
  const re = /(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g;
  let match = re.exec(text);
  while (match) {
    const raw = match[0];
    const number = Number.parseFloat(match[1].replace(',', '.'));
    const before = text.slice(Math.max(0, match.index - 8), match.index);
    const lineStart = text.lastIndexOf('\n', match.index) + 1;
    const lineEndRaw = text.indexOf('\n', match.index);
    const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
    const line = text.slice(lineStart, lineEnd);
    result.push({
      raw: raw.trim(),
      number,
      display: /до\s*$/i.test(before) ? `до ${raw.trim()}` : raw.trim(),
      index: match.index,
      line,
      context: line,
    });
    match = re.exec(text);
  }
  return result;
}

/** Все числа с единицами измерения: 50 000 ₽, от 10 000, 80 000 руб. */
export function findMoney(text) {
  const result = [];
  // «рублей», «рубля», «руб.» — всё это рубли. Без (?:л[а-я]{0,3})? регулярка
  // обрезала «рублей» до «руб» и в пост уходило «5 000 руб».
  const re = /(?:от\s*)?(\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d+)?)\s*(₽|руб(?:\.|л[а-я]{0,3})?|бонусов|баллов|р\.)/gi;
  let match = re.exec(text);
  while (match) {
    const start = lineStartOf(text, match.index);
    const end = lineEndOf(text, match.index);
    const rest = text.slice(match.index + match[0].length, end);
    const period = /^\s*(в\s+месяц|в\s+месяцa|ежемесячно|в\s+год)/i.exec(rest);
    const pieces = [match[1], match[2].replace(/\.$/, ''), period ? period[1].trim() : null].filter(Boolean);
    result.push({
      amount: match[1],
      currency: match[2].replace(/\.$/, ''),
      period: period ? period[1].trim() : null,
      value: pieces.join(' ').trim(),
      index: match.index,
      context: text.slice(start, end),
      // «до 80 000 ₽» — верхняя граница, её надо так и показывать
      qualifier: /до\s*$/i.test(text.slice(Math.max(0, match.index - 4), match.index)) ? 'до' : null,
    });
    match = re.exec(text);
  }
  return result;
}

/** Границы строки, в которой нашли совпадение */
export function lineStartOf(text, index) {
  return text.lastIndexOf('\n', index) + 1;
}

export function lineEndOf(text, index) {
  const end = text.indexOf('\n', index);
  return end === -1 ? text.length : end;
}

/** Самый большой процент, рядом с которым есть ключевое слово */
export function bestPercent(percents, keywordRe) {
  const candidates = percents.filter((percent) => keywordRe.test(percent.context));
  if (!candidates.length) return null;
  return candidates.reduce((best, item) => (item.number > best.number ? item : best));
}

/** Первый процент рядом с ключевым словом */
export function firstPercent(percents, keywordRe) {
  return percents.find((percent) => keywordRe.test(percent.context)) ?? null;
}

/** Куски текста сразу после ключевого слова — до конца строки/пункта списка */
export function extractAfterKeyword(text, keywordRe, { maxLen = 90 } = {}) {
  return extractAfterKeywordDetailed(text, keywordRe, { maxLen }).map((item) => item.value);
}

/**
 * Как extractAfterKeyword, но с позицией находки: нужно, чтобы брать значение
 * из строки ниже ставки, а не из первой попавшейся.
 */
export function extractAfterKeywordDetailed(text, keywordRe, { maxLen = 90 } = {}) {
  const out = [];
  const re = new RegExp(keywordRe.source, `${keywordRe.flags.replace(/g/g, '')}g`);
  let match = re.exec(text);
  while (match) {
    const rest = text.slice(match.index + match[0].length);
    const chunk = rest.split(/\n|•|;\s/)[0].replace(/^[\s:—–-]+/, '').replace(/\.$/, '').trim();
    if (chunk) out.push({ value: chunk.slice(0, maxLen), index: match.index });
    match = re.exec(text);
  }
  return out;
}

/**
 * Выбрать из вариантов самый подходящий.
 * preferRe — регулярка или список регулярок по приоритету: первая подошедшая побеждает.
 */
export function pickPreferred(values, preferRe, fallbackIndex = 0) {
  if (!values.length) return null;
  const list = Array.isArray(preferRe) ? preferRe : preferRe ? [preferRe] : [];
  for (const re of list) {
    const preferred = values.find((value) => re.test(value));
    if (preferred) return preferred;
  }
  return values[fallbackIndex] ?? null;
}

/** Первое число в куске текста: «50 000 ₽», «от 10 000», «5 000 бонусов» */
export function extractMoney(text) {
  const found = findMoney(text)[0];
  if (!found) return null;
  const bare = /(\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d+)?)/.exec(text);
  const amount = bare ? bare[1] : found.amount;
  const parts = [amount];
  if (found.currency) parts.push(found.currency);
  if (found.period) parts.push(found.period);
  return { amount, currency: found.currency, period: found.period, value: parts.join(' ').trim() };
}

/** Сумма рядом с ключевым словом («Минимальная сумма — 10 000 ₽») */
export function extractMoneyAfterKeyword(text, keywordRe, options = {}) {
  for (const chunk of extractAfterKeyword(text, keywordRe, options)) {
    const money = extractMoney(chunk);
    if (money) return money.value;
  }
  return null;
}

/** Срок: «6 месяцев», «1 год», «12 месяцев» */
export function extractTerm(text) {
  const match = /(\d{1,2})\s*(месяц(?:ев|а)?|год(?:а)?|лет)/i.exec(text);
  if (!match) return null;
  return `${match[1]} ${match[2].toLowerCase()}`;
}

/** Дедлайн: «до 31.10.2026» или «до 31 октября 2026» */
export function extractDeadline(text) {
  const dotted = /до\s+(\d{2}\.\d{2}\.\d{4})/i.exec(text);
  if (dotted) return toISODate(dotted[1]);
  const words = /до\s+(\d{1,2})\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*\s+(\d{4})/i.exec(text);
  if (words) return `${words[1]} ${words[2].toLowerCase()}...${words[3]}`;
  return null;
}

/** Таблицы со строками «срок / ставка / сумма» — используется разными тематиками */
export function extractTableRows(html, { rateRe = /\d+(?:[.,]\d+)?\s*%/ } = {}) {
  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row = rowRe.exec(html);
  while (row) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
      plainTextFromHtml(cell[1]).replace(/\n+/g, ' ').trim(),
    );
    if (cells.length >= 2 && rateRe.test(cells.join(' '))) rows.push({ cells });
    row = rowRe.exec(html);
  }
  return rows;
}

/** Новости: <article> с датой и заголовком */
export function extractNews(html) {
  const items = [];
  const articleRe = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let article = articleRe.exec(html);
  while (article) {
    const body = article[1];
    const datetime = /<time[^>]*datetime=["'](\d{4}-\d{2}-\d{2})["']/i.exec(body);
    const timeText = /<time[^>]*>([\s\S]*?)<\/time>/i.exec(body);
    const date = datetime ? datetime[1] : toISODate(timeText ? plainTextFromHtml(timeText[1]).trim() : null);
    const headline = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(body);
    const paragraph = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(body);
    if (headline) {
      items.push({
        date,
        headline: plainTextFromHtml(headline[1]).replace(/\n+/g, ' ').trim(),
        summary: paragraph ? plainTextFromHtml(paragraph[1]).replace(/\n+/g, ' ').trim() : null,
      });
    }
    article = articleRe.exec(html);
  }
  return items;
}

/**
 * Собрать факт. Единая точка, где появляются обязательные поля.
 * Пустое значение не превращается в факт: «нет данных» и «ноль» — разные вещи.
 */
export function makeFact({ label, value, date, source, product, extra = {} }) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return {
    label,
    value: String(value).replace(/\s+/g, ' ').trim(),
    date: date ?? todayISO(),
    source: source ?? null,
    ...(product ? { product } : {}),
    ...extra,
  };
}

/** Общая страховка: пустая страница — это ошибка, а не «фактов ноль» */
export function assertHtml(html, source) {
  if (typeof html !== 'string' || html.length < 20) {
    throw new Error(`Пустая или слишком короткая страница: ${source?.url ?? 'без источника'}`);
  }
}
