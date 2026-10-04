// Сбор фактов в офлайн-режиме: фикстуры -> knowledge/facts/<bank>.json

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkspace, cleanup } from './helpers.js';

const root = await makeWorkspace();
const { fetchBank, formatFetchReport } = await import('../src/fetch.js');
const { loadFacts } = await import('../src/bank.js');

test.after(() => cleanup(root));

test('Т-Банк: оба источника разбираются, факты попадают в базу', async () => {
  const report = await fetchBank('tbank', { offline: true });
  assert.equal(report.results.length, 2);
  assert.ok(report.results.every((result) => result.status === 'ok'));
  assert.ok(report.saved.added > 0);

  const facts = loadFacts('tbank');
  assert.equal(facts.facts.cashback_rate.value, 'до 15%');
  assert.equal(facts.facts.service_cost.value, 'бесплатно, если покупки от 5 000 ₽ в месяц');
  assert.equal(facts.facts.rate.value, 'до 16,5%');
  assert.equal(facts.updated, new Date().toISOString().slice(0, 10));
});

test('повторный сбор не плодит дубликаты', async () => {
  const first = await fetchBank('tbank', { offline: true });
  const second = await fetchBank('tbank', { offline: true });
  assert.equal(second.saved.added, 0);
  assert.equal(second.saved.total, first.saved.total);
});

test('Альфа: факты карт и новость в одной базе', async () => {
  await fetchBank('alfa', { offline: true });
  const facts = loadFacts('alfa');
  assert.equal(facts.facts.cashback_rate.value, 'до 10%');
  assert.match(facts.facts.news_headline.value, /ставки по накопительным счетам/);
});

test('Банк без источников в конфиге даёт понятную ошибку', async () => {
  await assert.rejects(() => fetchBank('нет-такого-банка', { offline: true }), /Банк не найден/);
});

test('Отчёт читается человеком: видны источники и факты', async () => {
  const report = await fetchBank('sberbank', { offline: true });
  const text = formatFetchReport(report);
  assert.match(text, /Сбор фактов: Сбербанк \(офлайн, фикстуры\)/);
  assert.match(text, /✓ Дебетовые карты: ok/);
  assert.match(text, /rate = 14,9%/);
});
