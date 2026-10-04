// Сборка поста: шаблон + факты + тема журнала. Проверяем и текст, и проверки.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkspace, cleanup } from './helpers.js';

const root = await makeWorkspace();
const { fetchBank } = await import('../src/fetch.js');
const { buildPost, savePost } = await import('../src/generate.js');
const { loadDisclaimers } = await import('../src/config.js');

test.after(() => cleanup(root));

const disclaimers = loadDisclaimers();

test('пост про карту Т-Банка собирается и проходит проверки', async () => {
  await fetchBank('tbank', { offline: true });
  const post = buildPost({ bank: 'tbank', rubric: 'karta', dryRun: true });

  assert.equal(post.status, 'ready');
  assert.equal(post.checks.errors.length, 0);
  assert.match(post.text, /^# Т-Банк — дебетовая карта/m);
  assert.match(post.text, /до 15%/);
  assert.match(post.text, /\(проверено 16\.09\.2026\)/);
  assert.match(post.text, /#ТБанк/);
  assert.ok(post.text.includes(disclaimers.financial.text));
  assert.equal(post.facts.length >= 3, true);
  assert.equal(post.disclaimer_kind, 'financial');
});

test('сборка детерминированная: те же входные — тот же текст', async () => {
  const first = buildPost({ bank: 'tbank', rubric: 'karta', variant: 0, dryRun: true });
  const second = buildPost({ bank: 'tbank', rubric: 'karta', variant: 0, dryRun: true });
  assert.equal(first.text, second.text);
});

test('вариант меняет хук, но не факты', async () => {
  const first = buildPost({ bank: 'tbank', rubric: 'karta', variant: 0, dryRun: true });
  const second = buildPost({ bank: 'tbank', rubric: 'karta', variant: 1, dryRun: true });
  assert.notEqual(first.text, second.text);
  assert.deepEqual(
    first.facts.map((fact) => fact.value).sort(),
    second.facts.map((fact) => fact.value).sort(),
  );
});

test('без обязательных фактов пост помечается needs-data и не публикуется', () => {
  const post = buildPost({ bank: 'vtb', rubric: 'karta', dryRun: true });
  assert.equal(post.status, 'needs-data');
  assert.ok(post.missing_required.includes('cashback_limit'));
  assert.match(post.checks.errors[0].message, /Нет обязательных фактов/);
});

test('кредитка без данных о льготном периоде не проходит', async () => {
  const post = buildPost({ bank: 'tbank', rubric: 'kreditka', dryRun: true });
  assert.equal(post.status, 'needs-data');
  assert.deepEqual(post.missing_required.sort(), ['grace_period', 'limit_max']);
});

test('новость собирается из свежего заголовка', async () => {
  await fetchBank('alfa', { offline: true });
  const post = buildPost({ bank: 'alfa', rubric: 'novost', dryRun: true });
  assert.equal(post.status, 'ready');
  assert.match(post.text, /накопительным счетам/i);
  assert.match(post.text, /14\.09\.2026/);
});

test('рубрика определяется по тексту команды', () => {
  const post = buildPost({ bank: 'tbank', text: 'размести пост про вклад и накопительный счёт', dryRun: true });
  assert.equal(post.rubric, 'vklad');
});

test('тема журнала подбирается под рубрику', () => {
  const vklad = buildPost({ bank: 'tbank', rubric: 'vklad', dryRun: true });
  assert.equal(vklad.topic_id, 'vklad-ili-schet');
  const karta = buildPost({ bank: 'tbank', rubric: 'karta', dryRun: true });
  assert.equal(karta.topic_id, 'kak-vybrat-kartu');
});

test('сохранённый пост лежит в очереди и читается обратно', async () => {
  const post = buildPost({ bank: 'tbank', rubric: 'karta', dryRun: true });
  const saved = savePost(post);
  const { loadPost, listPosts } = await import('../src/generate.js');
  const back = loadPost(saved.id);
  assert.equal(back.text, saved.text);
  assert.ok(listPosts({ limit: 5 }).some((item) => item.id === saved.id));
});

test('непонятный банк — внятная ошибка', () => {
  assert.throws(() => buildPost({ bank: 'рога-и-копыта', rubric: 'karta', dryRun: true }), /Банк не найден/);
});
