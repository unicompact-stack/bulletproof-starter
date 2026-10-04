// Разбор страниц банков: вытаскиваем проценты, суммы, сроки, даты и новости.
// Функции чистые (на входе html и текст, на выходе данные) — это позволяет
// проверять парсер на фикстурах без интернета: npm test

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
  const values = [];
  const re = new RegExp(keywordRe.source, keywordRe.flags.includes('g') ? keywordRe.flags : `${keywordRe.flags}g`);
  let match = re.exec(text);
  while (match) {
    const rest = text.slice(match.index + match[0].length);
    const chunk = rest.split(/\n|•|;\s/)[0].replace(/^[\s:—–-]+/, '').replace(/\.$/, '').trim();
    if (chunk) values.push(chunk.slice(0, maxLen));
    match = re.exec(text);
  }
  return values;
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

/** Как extractAfterKeyword, но с позицией находки в тексте */
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

/** Первое число в куске текста: «50 000 ₽», «от 10 000», «5 000 бонусов» */
export function extractMoney(text) {
  const match = /(?:от\s*)?(\d{1,3}(?: \d{3})*(?:[.,]\d+)?|\d+)\s*(₽|руб\.?|бонусов|баллов)?(\s*в\s+месяц)?/i.exec(text);
  if (!match) return null;
  const [, amount, currency, period] = match;
  const parts = [amount];
  if (currency) parts.push(currency.replace(/\.$/, ''));
  if (period) parts.push('в месяц');
  return { amount, currency: currency ?? null, period: period?.trim() ?? null, value: parts.join(' ').trim() };
}

/** Сумма рядом с ключевым словом («Минимальная сумма — 10 000 ₽») */
export function extractMoneyAfterKeyword(text, keywordRe, options = {}) {
  const chunks = extractAfterKeyword(text, keywordRe, options);
  for (const chunk of chunks) {
    const money = extractMoney(chunk);
    if (money) return money.value;
  }
  return null;
}

/** Срок вклада: «6 месяцев», «1 год», «12 месяцев» */
export function extractTerm(text) {
  const match = /(\d{1,2})\s*(месяц(?:ев|а)?|год(?:а)?|лет)/i.exec(text);
  if (!match) return null;
  return `${match[1]} ${match[2].toLowerCase()}`;
}

/** Дедлайн акции: «до 31.10.2026» или «до 31 октября 2026» */
export function extractDeadline(text) {
  const dotted = /до\s+(\d{2}\.\d{2}\.\d{4})/i.exec(text);
  if (dotted) return toISODate(dotted[1]);
  const words = /до\s+(\d{1,2})\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*\s+(\d{4})/i.exec(text);
  if (words) return `${words[1]} ${words[2].toLowerCase()}...${words[3]}`;
  return null;
}

/** Таблицы со ставками: строка = срок, ставка, сумма */
export function extractRateRows(html) {
  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row = rowRe.exec(html);
  while (row) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => plainTextFromHtml(cell[1]).replace(/\n+/g, ' ').trim());
    const rateCell = cells.find((cell) => /\d+(?:[.,]\d+)?\s*%/.test(cell));
    if (rateCell) {
      const percent = findPercents(rateCell)[0];
      const term = cells.find((cell) => /(\d{1,2})\s*(месяц|год|лет)/i.test(cell)) ?? null;
      const amountCell = cells.find((cell) => /₽|руб/i.test(cell) && /\d/.test(cell)) ?? null;
      rows.push({
        term,
        rate: rateCell,
        rate_number: percent ? percent.number : null,
        amount: amountCell ? extractMoney(amountCell)?.value ?? amountCell : null,
        cells,
      });
    }
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

function makeFact({ label, value, date, source, product }) {
  if (!value) return null;
  return {
    label,
    value: String(value).replace(/\s+/g, ' ').trim(),
    date: date ?? todayISO(),
    source: source ?? null,
    ...(product ? { product } : {}),
  };
}

/**
 * Факты со страницы продуктов (карты, вклады, счета).
 * Возвращает объект вида { cashback_rate: {...}, rate: {...} }.
 */
export function factsFromProductPage(html, source) {
  const text = plainTextFromHtml(html);
  const percents = findPercents(text);
  const date = extractUpdatedDate(html, text);
  const facts = {};

  const pageKind = detectPageKind(source, html);

  const cashback = bestPercent(percents, /кэшбэк|кешбэк|cashback|бонус/i) ?? firstPercent(percents, /кэшбэк|кешбэк|cashback/i);
  if (cashback) {
    const product = findProductName(text, cashback.index);
    facts.cashback_rate = makeFact({
      label: 'Кэшбэк',
      value: cashback.display,
      date,
      source: source.url,
      product,
    });
  }

  const serviceValues = extractAfterKeyword(text, /обслуживание/i, { maxLen: 70 });
  const service = pickPreferred(serviceValues, [/при покупках|от покупок/i, /бесплатно|0\s*₽/i]);
  if (service) {
    facts.service_cost = makeFact({ label: 'Обслуживание', value: service, date, source: source.url });
  }

  const limitChunk =
    extractAfterKeyword(text, /лимит[а-я]*\s*(?:кэшбэка|бонусов|баллов)?/i, { maxLen: 60 })[0] ??
    extractAfterKeyword(text, /максимум[а-я]*\s*(?:кэшбэка|бонусов|баллов)?/i, { maxLen: 60 })[0];
  const limit = limitChunk ? extractMoney(limitChunk) : null;
  if (limit) {
    facts.cashback_limit = makeFact({ label: 'Лимит кэшбэка', value: limit.value, date, source: source.url });
  }

  const rateRows = extractRateRows(html);
  if (rateRows.length) {
    const best = rateRows.reduce((top, row) => (row.rate_number > top.rate_number ? row : top));
    facts.rate = makeFact({ label: 'Ставка', value: best.rate, date, source: source.url, product: best.term ?? undefined });
    if (best.term) {
      facts.term = makeFact({ label: 'Срок', value: best.term, date, source: source.url });
    }
    if (best.amount) {
      facts.min_amount = makeFact({ label: 'Минимальная сумма', value: best.amount, date, source: source.url });
    }
  } else {
    const rate = bestPercent(percents, /ставк|годов|на остаток|на сч[её]т|процент/i);
    if (rate) {
      if (pageKind === 'cards') {
        facts.rate_on_balance = makeFact({
          label: 'Процент на остаток',
          value: rate.display,
          date,
          source: source.url,
        });
      } else {
        facts.rate = makeFact({ label: 'Ставка', value: rate.display, date, source: source.url });
      }
    }
  }

  if (!facts.min_amount) {
    const chunks = extractAfterKeywordDetailed(text, /минимальная сумма|минимальный взнос|минимальная сумма вклада/i);
    const bestRateIndex = rateRows.length && facts.rate ? text.indexOf(String(facts.rate.value)) : -1;
    const pick =
      chunks.find((chunk) => bestRateIndex !== -1 && chunk.index > bestRateIndex) ?? chunks[0] ?? null;
    const minAmount = pick ? extractMoney(pick.value) : null;
    if (minAmount) {
      facts.min_amount = makeFact({ label: 'Минимальная сумма', value: minAmount.value, date, source: source.url });
    }
  }

  if (!facts.term) {
    const termChunk = extractAfterKeyword(text, /на срок|срок (?:вклада|размещения)/i, { maxLen: 40 })[0];
    const term = termChunk ? extractTerm(termChunk) : null;
    if (term) facts.term = makeFact({ label: 'Срок', value: term, date, source: source.url });
  }

  const deadline = extractDeadline(text);
  if (deadline && /акци|промо|бонус|кэшбэк/i.test(text)) {
    facts.deadline = makeFact({ label: 'Срок акции', value: deadline, date, source: source.url });
  }

  // «Предложение» — только со страниц про акции: иначе любая строка про кэшбэк
  // попадала бы в факты как промо и путала рубрику «акция».
  const offer = text
    .split('\n')
    .find((line) => /акци|промо|подарок|бонус за/i.test(line) && /%|₽/.test(line));
  if (offer && !facts.deadline) {
    facts.offer = makeFact({ label: 'Предложение', value: offer.slice(0, 160), date, source: source.url });
  }

  return facts;
}

/**
 * Тип страницы: cards | savings | unknown.
 * Нужен, чтобы ставку «на остаток» по карте не путать со ставкой по вкладу:
 * у них разные ключи фактов (rate_on_balance против rate).
 */
export function detectPageKind(source, html) {
  const haystack = `${source?.id ?? ''} ${source?.url ?? ''} ${source?.title ?? ''} ${extractTitle(html)}`.toLowerCase();
  if (/vklad|вклад|savings|накопит|save|deposit/.test(haystack)) return 'savings';
  if (/card|карт|debit|kredit/.test(haystack)) return 'cards';
  return 'unknown';
}

/** Имя продукта рядом с находкой: ближайший заголовок выше по тексту */
export function findProductName(text, index) {
  const before = text.slice(0, index).split('\n').filter(Boolean);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const line = before[i];
    if (line.length <= 60 && /[А-ЯA-Z]/.test(line) && !/\d+(?:[.,]\d+)?\s*%/.test(line)) {
      if (/карта|счёт|счет|вклад|тариф|подписка/i.test(line)) return line.replace(/[«»"]/g, '').trim();
    }
  }
  return null;
}

/** Факты со страницы новостей */
export function factsFromNewsPage(html, source) {
  const news = extractNews(html);
  if (!news.length) return {};
  const [latest] = news.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return {
    news_headline: makeFact({
      label: 'Новость',
      value: latest.headline,
      date: latest.date,
      source: source.url,
    }),
    news_date: makeFact({
      label: 'Дата новости',
      value: latest.date ? latest.date.split('-').reverse().join('.') : '',
      date: latest.date,
      source: source.url,
    }),
    ...(latest.summary
      ? {
          news_summary: makeFact({
            label: 'Что изменилось',
            value: latest.summary,
            date: latest.date,
            source: source.url,
          }),
        }
      : {}),
  };
}

/** Общая точка входа: разобрать страницу по типу источника */
export function factsFromHtml(html, source) {
  stringGuard(html, source);
  if (source.extract === 'text' || source.extract === 'rss') {
    return factsFromNewsPage(html, source);
  }
  return factsFromProductPage(html, source);
}

/** Новости одним списком (для панели и рубрики «новость») */
export function newsFromHtml(html) {
  return extractNews(html);
}

function stringGuard(html, source) {
  if (typeof html !== 'string' || html.length < 20) {
    throw new Error(`Пустая или слишком короткая страница: ${source?.url ?? 'без источника'}`);
  }
}
