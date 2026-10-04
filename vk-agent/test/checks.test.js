// Проверки поста: каждая проверяется отдельным случаем — что блокирует, что предупреждает.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkspace, cleanup } from './helpers.js';

const root = await makeWorkspace();
const { fetchSubject } = await import('../src/fetch.js');
const { buildPost } = await import('../src/generate.js');
const { runChecks } = await import('../src/checks.js');
const { loadDisclaimers } = await import('../src/config.js');
const { appendHistory } = await import('../src/history.js');

test.after(() => cleanup(root));

await fetchSubject('tbank', { offline: true });
const base = buildPost({ subject: 'tbank', rubric: 'karta', dryRun: true });
const disclaimers = loadDisclaimers();

const ids = (list) => list.map((item) => item.id);

test('исходный пост проходит проверки чисто', () => {
  const result = runChecks(base);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.status, 'ok');
});

test('запрещённая формулировка блокирует публикацию', () => {
  const result = runChecks({ ...base, text: `${base.text}\n\nМы даём гарантированный доход.` });
  assert.ok(ids(result.errors).includes('stopword-block'));
  assert.equal(result.status, 'blocked');
});

test('спорная формулировка даёт предупреждение, но не блокирует', () => {
  const result = runChecks({ ...base, text: `${base.text}\n\nЭто самый выгодный тариф.` });
  assert.ok(ids(result.warnings).includes('stopword-warn'));
  assert.deepEqual(result.errors, []);
});

test('цифра без даты проверки блокирует', () => {
  const result = runChecks({ ...base, text: `${base.text}\n\nКэшбэк 99% на всё без лимита.` });
  assert.ok(ids(result.errors).includes('number-without-date'));
});

test('та же цифра с датой проверки проходит', () => {
  const result = runChecks({ ...base, text: `${base.text}\n\nКэшбэк 99% на всё (проверено 01.10.2026).` });
  assert.ok(!ids(result.errors).includes('number-without-date'));
});

test('без обязательной оговорки публиковать нельзя', () => {
  const withoutDisclaimer = base.text.replace(disclaimers.financial.text, '');
  const result = runChecks({ ...base, text: withoutDisclaimer });
  assert.ok(ids(result.errors).includes('missing-disclaimer'));
});

test('устаревший факт — предупреждение, а не блок', () => {
  const facts = base.facts.map((fact, index) =>
    index === 0 ? { ...fact, date: '2025-01-01', fresh: false } : fact,
  );
  const result = runChecks({ ...base, facts });
  assert.ok(ids(result.warnings).includes('stale-fact'));
  assert.deepEqual(result.errors, []);
});

test('незаполненная вставка в тексте блокирует', () => {
  const result = runChecks({ ...base, text: `${base.text}\n\nКэшбэк до {cashback_rate} в категориях.` });
  assert.ok(ids(result.errors).includes('unfilled-placeholder'));
});

test('без заголовка и фактов пост не собирается', () => {
  const result = runChecks({
    ...base,
    text: 'Совсем короткий текст без заголовка.',
    fact_lines: [],
  });
  assert.ok(ids(result.errors).includes('no-title'));
  assert.ok(ids(result.errors).includes('no-facts'));
  assert.ok(ids(result.errors).includes('too-short'));
});

test('реклама без маркировки блокируется', () => {
  const result = runChecks({ ...base, ads: true });
  assert.ok(ids(result.errors).includes('ads-marking'));
});

test('акция напоминает про маркировку рекламы', () => {
  const promoText = base.text.replace(disclaimers.financial.text, disclaimers.promo.text);
  const result = runChecks({ ...base, text: promoText, rubric: 'akciya', disclaimer_kind: 'promo' });
  assert.ok(ids(result.warnings).includes('ads-check'));
  assert.deepEqual(result.errors, []);
});

test('шесть хештегов — перебор', () => {
  const hashtags = ['#a', '#b', '#c', '#d', '#e', '#f'];
  const text = `${base.text}\n\n${hashtags.join(' ')}`;
  const result = runChecks({ ...base, text, hashtags });
  assert.ok(ids(result.warnings).includes('many-hashtags'));
});

test('повтор поста в течение недели — предупреждение', () => {
  appendHistory({
    kind: 'published',
    id: 'test-повтор',
    subject_id: 'tbank',
    rubric: 'karta',
    at: new Date(Date.now() - 2 * 86400000).toISOString(),
  });
  const result = runChecks(base);
  assert.ok(ids(result.warnings).includes('recent-duplicate'));
});

test('задвоенное слово ловится', () => {
  const result = runChecks({ ...base, text: `${base.text}\n\nСтавка до до 15% на всё.` });
  assert.ok(ids(result.warnings).includes('double-word'));
});

test('задвоенная фраза ловится («в месяц в месяц»)', () => {
  const result = runChecks({ ...base, text: `${base.text}\n\nЛимит — 5 000 ₽ в месяц в месяц.` });
  assert.ok(ids(result.warnings).includes('double-phrase'), JSON.stringify(result.warnings));
});

test('пустой объект не ломает проверки', () => {
  const result = runChecks({});
  assert.ok(result.errors.length >= 3);
  assert.equal(result.status, 'blocked');
});

test('внешняя ссылка снижает охват — предупреждаем', () => {
  const result = runChecks({ ...base, text: `${base.text}\n\nПодробности: https://www.tbank.ru/cards/` });
  assert.ok(ids(result.warnings).includes('external-links'));
});

test('ссылка на сторонний домен отдельно отмечается', () => {
  const result = runChecks({ ...base, text: `${base.text}\n\nСмотри на https://vk.com/tbank` });
  assert.ok(ids(result.warnings).includes('unknown-link-domain'));
});
