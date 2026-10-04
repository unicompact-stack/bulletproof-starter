// Экстрактор тематики «вакансии»: страницы работодателей с вакансиями.
//
// Тематика появилась второй, чтобы проверить главное предположение каркаса:
// агент не привязан к банкам. Смысловые единицы здесь другие — зарплата, график,
// оформление, опыт, — но механизм тот же: страница → факты с датой и источником.

import { plainTextFromHtml } from '../util.js';
import { assertHtml, extractNews, extractUpdatedDate, findMoney, makeFact } from '../parse.js';

export const name = 'vacancies';

/** Зарплатная вилка: «от 80 000 ₽ до 120 000 ₽», «80 000–120 000 ₽», «от 50 000 ₽/мес» */
export function extractSalary(text) {
  const compact = text.replace(/[\u00A0\u2009\u202F]/g, ' ');
  // Сначала вилка целиком: она и есть то, что показываем читателю
  const range = compact.match(
    /(?:от\s*)?(\d[\d ]{2,12})\s*(?:₽|руб\.?)\s*(?:-|–|—|до)\s*(\d[\d ]{2,12})\s*(?:₽|руб\.?)([^ \n]{0,18})/i,
  );
  if (range) {
    const tail = range[3]?.trim();
    return {
      from: range[1].trim(),
      to: range[2].trim(),
      period: /мес|месяц/i.test(tail ?? '') ? 'в месяц' : null,
      value: `от ${range[1].trim()} до ${range[2].trim()} ₽${/мес|месяц/i.test(tail ?? '') ? ' в месяц' : ''}`,
    };
  }
  const single = findMoney(compact).find((money) => /зарплат|доход|оклад|₽/i.test(money.context)) ?? findMoney(compact)[0];
  if (!single) return null;
  const qualifier = single.qualifier ? `${single.qualifier} ` : '';
  const period = single.period ? ` ${single.period}` : '';
  return {
    from: single.amount,
    to: null,
    period: single.period,
    value: `${qualifier}${single.amount} ${single.currency}${period}`.trim(),
  };
}

/**
 * Значение поля по заголовку.
 *
 * На странице вакансий заголовок и значение стоят в разных блоках: «График работы» —
 * это заголовок, «5/2, с 8:00» — следующая строка. Поэтому берём значение так:
 * сначала остаток той же строки после ключевого слова, а если там пусто — следующую
 * непустую строку. Раньше здесь молча терялись график и оформление.
 */
export function extractField(text, keywordRe, { maxLen = 80 } = {}) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const match = keywordRe.exec(lines[i]);
    if (!match) continue;
    keywordRe.lastIndex = 0;
    const rest = lines[i].slice(match.index + match[0].length).replace(/^\s*[:—–-]\s*/, '').trim();
    if (rest) return { value: rest.slice(0, maxLen), line: i };
    // ключевое слово оказалось в конце строки — берём следующую непустую
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j += 1) {
      if (lines[j].length <= maxLen) return { value: lines[j], line: j };
    }
  }
  keywordRe.lastIndex = 0;
  return null;
}

/** Факты со страницы вакансии */
export function factsFromVacancyPage(html, source) {
  const text = plainTextFromHtml(html);
  const date = extractUpdatedDate(html, text) ?? source.date ?? null;
  const facts = {};

  const salary = extractSalary(text);
  if (salary) {
    facts.salary = makeFact({ label: 'Зарплата', value: salary.value, date, source: source.url });
  }

  const schedule = extractField(text, /график[а-я]*\s*работы|график|сменность/i, { maxLen: 60 });
  if (schedule) facts.schedule = makeFact({ label: 'График', value: schedule.value, date, source: source.url });

  const employment = extractField(text, /(?:оформление|формат работы|занятость|тип занятости)/i, { maxLen: 60 });
  if (employment) {
    facts.employment = makeFact({ label: 'Оформление', value: employment.value, date, source: source.url });
  }

  // «Опыт работы от 1 года» — «от» здесь часть условия, без него выходит «1 года»
  const experience = extractField(text, /опыт[а-я]*\s*работы/i, { maxLen: 40 });
  if (experience) {
    const withPreposition = /от\s*\d+\s*(?:месяц(?:ев|а)?|год(?:а)?|лет)/i.exec(experience.value);
    facts.experience = makeFact({
      label: 'Опыт',
      value: withPreposition ? withPreposition[0].toLowerCase() : experience.value,
      date,
      source: source.url,
    });
  }

  const location = extractField(text, /(?:адрес|локация|местоположение)/i, { maxLen: 60 });
  if (location) facts.location = makeFact({ label: 'Локация', value: location.value, date, source: source.url });

  // Условия могут идти одной строкой («Питание за счёт компании, спецодежда выдаётся») —
  // тогда нужна вся строка, а не хвост после слова «питание»
  const benefit = extractField(text, /питани[а-я]*|спецодежд[а-я]*|проживани[а-я]*|транспорт/i, { maxLen: 70 });
  if (benefit) facts.benefits = makeFact({ label: 'Условия', value: benefit.value, date, source: source.url });

  return facts;
}

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
  };
}

export function factsFromHtml(html, source) {
  assertHtml(html, source);
  if (source.extract === 'text' || source.extract === 'rss') {
    return factsFromNewsPage(html, source);
  }
  return factsFromVacancyPage(html, source);
}

export function newsFromHtml(html) {
  return extractNews(html);
}
