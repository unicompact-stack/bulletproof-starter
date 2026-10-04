// Проверка парсера на фикстурах: цифры, сроки, суммы, даты, новости.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkspace, fixture, cleanup } from './helpers.js';

const root = await makeWorkspace();
const {
  factsFromHtml,
  findPercents,
  extractRateRows,
  extractNews,
  extractUpdatedDate,
} = await import('../src/parse.js');

test.after(() => cleanup(root));

const source = (extract = 'percents') => ({ id: 'test', url: 'https://example.ru/test', extract });

test('контекст процента не переходит на соседнюю строку', () => {
  const text = 'Кэшбэк до 10% в категориях\nМаксимальная ставка — 16% годовых';
  const percents = findPercents(text);
  assert.equal(percents.length, 2);
  assert.equal(percents[0].display, 'до 10%');
  assert.match(percents[0].context, /Кэшбэк/);
  assert.doesNotMatch(percents[1].context, /Кэшбэк/);
});

test('карты Альфы: кэшбэк, обслуживание, лимит и дата', () => {
  const facts = factsFromHtml(fixture('alfa-debit-cards.html'), source());
  assert.equal(facts.cashback_rate.value, 'до 10%');
  assert.match(facts.service_cost.value, /при покупках от 10 000/);
  assert.equal(facts.cashback_limit.value, '5 000 ₽ в месяц');
  assert.equal(facts.cashback_rate.date, '2026-09-15');
});

test('вклады Альфы: лучшая ставка из таблицы, срок и минимальная сумма вклада', () => {
  const facts = factsFromHtml(fixture('alfa-save.html'), source());
  assert.equal(facts.rate.value, '15,8%');
  assert.equal(facts.term.value, '12 месяцев');
  assert.equal(facts.min_amount.value, '10 000 ₽');
});

test('карты Т-Банка: кэшбэк 15%, лимит 8 000 ₽', () => {
  const facts = factsFromHtml(fixture('tbank-cards.html'), source());
  assert.equal(facts.cashback_rate.value, 'до 15%');
  assert.equal(facts.cashback_limit.value, '8 000 ₽');
});

test('вклады Т-Банка: ставка, срок и минимальная сумма', () => {
  const facts = factsFromHtml(fixture('tbank-savings.html'), source());
  assert.equal(facts.rate.value, 'до 16,5%');
  assert.equal(facts.term.value, '6 месяцев');
  assert.equal(facts.min_amount.value, '50 000 ₽');
});

test('вклады Сбера: строка таблицы с суммой', () => {
  const facts = factsFromHtml(fixture('sber-deposits.html'), source());
  assert.equal(facts.rate.value, '14,9%');
  assert.equal(facts.term.value, '1 год');
  assert.equal(facts.min_amount.value, '50 000 ₽');
});

test('карты ВТБ: кэшбэк и обслуживание, лимита на странице нет', () => {
  const facts = factsFromHtml(fixture('vtb-cards.html'), source());
  assert.equal(facts.cashback_rate.value, 'до 4%');
  assert.match(facts.service_cost.value, /при покупках/);
  assert.equal(facts.cashback_limit, undefined);
});

test('новости Альфы: свежий заголовок и дата', () => {
  const facts = factsFromHtml(fixture('alfa-news.html'), source('text'));
  assert.match(facts.news_headline.value, /накопительным счетам|кэшбэк/i);
  assert.equal(facts.news_date.value, '14.09.2026');
  assert.equal(facts.news_date.date, '2026-09-14');
});

test('таблица ставок разбирается построчно', () => {
  const rows = extractRateRows(fixture('sber-deposits.html'));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.term), ['3 месяца', '6 месяцев', '1 год']);
});

test('новости разбираются в список с датами', () => {
  const news = extractNews(fixture('alfa-news.html'));
  assert.equal(news.length, 2);
  assert.equal(news[0].date, '2026-09-14');
  assert.ok(news[0].summary.length > 10);
});

test('дата обновления страницы вытаскивается', () => {
  assert.equal(extractUpdatedDate(fixture('alfa-save.html')), '2026-09-15');
});
