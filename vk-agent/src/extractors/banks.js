// Экстрактор тематики «банки»: страницы карт, вкладов, счетов и новостей.
//
// Здесь только банковская логика — какие слова означают кэшбэк, какие страницы
// про вклады, а какие про карты. Всё общее (проценты, суммы, даты) — в ../parse.js,
// поэтому второй тематике не нужно копировать эти функции, достаточно своего файла.

import { plainTextFromHtml } from '../util.js';
import {
  assertHtml,
  bestPercent,
  extractAfterKeyword,
  extractAfterKeywordDetailed,
  extractDeadline,
  extractMoney,
  extractNews,
  extractTableRows,
  extractTitle,
  extractTerm,
  extractUpdatedDate,
  findMoney,
  findPercents,
  firstPercent,
  makeFact,
  pickPreferred,
} from '../parse.js';

export const name = 'banks';

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

/** Таблицы со ставками: строка = срок, ставка, сумма */
export function extractRateRows(html) {
  return extractTableRows(html)
    .map((row) => {
      const rateCell = row.cells.find((cell) => /\d+(?:[.,]\d+)?\s*%/.test(cell));
      if (!rateCell) return null;
      const percent = findPercents(rateCell)[0];
      const term = row.cells.find((cell) => /(\d{1,2})\s*(месяц|год|лет)/i.test(cell)) ?? null;
      const amountCell = row.cells.find((cell) => /₽|руб/i.test(cell) && /\d/.test(cell)) ?? null;
      return {
        term,
        rate: rateCell,
        rate_number: percent ? percent.number : null,
        amount: amountCell ? extractMoney(amountCell)?.value ?? amountCell : null,
        cells: row.cells,
      };
    })
    .filter(Boolean);
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

/** Факты со страницы новостей */
export function factsFromNewsPage(html, source) {
  const news = extractNews(html);
  if (!news.length) return {};
  const [latest] = news.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return {
    news_headline: makeFact({ label: 'Новость', value: latest.headline, date: latest.date, source: source.url }),
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

/** Общая точка входа экстрактора: разобрать страницу по типу источника */
export function factsFromHtml(html, source) {
  assertHtml(html, source);
  if (source.extract === 'text' || source.extract === 'rss') {
    return factsFromNewsPage(html, source);
  }
  return factsFromProductPage(html, source);
}

/** Новости одним списком (для панели и рубрики «новость») */
export function newsFromHtml(html) {
  return extractNews(html);
}

export { findMoney };
