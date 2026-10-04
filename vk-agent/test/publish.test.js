// Публикация: до сети дело доходит только с --live. Здесь проверяем защиту и сухой прогон.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkspace, cleanup } from './helpers.js';

const root = await makeWorkspace();
const { fetchSubject } = await import('../src/fetch.js');
const { buildPost } = await import('../src/generate.js');
const { publishPost, publishBatch } = await import('../src/publish.js');
const { readHistory } = await import('../src/history.js');

test.after(() => cleanup(root));

await fetchSubject('tbank', { offline: true });

test('заблокированный пост не уходит в публикацию', async () => {
  const post = buildPost({ subject: 'tbank', rubric: 'karta', dryRun: true });
  const blocked = { ...post, text: `${post.text}\n\nГарантированный доход.` };
  await assert.rejects(() => publishPost(blocked, { dryRun: false }), /Публикация заблокирована/);
});

test('сухой прогон ничего не пишет в историю', async () => {
  const post = buildPost({ subject: 'tbank', rubric: 'karta', dryRun: true });
  const result = await publishPost(post, { dryRun: true });
  assert.equal(result.dry_run, true);
  assert.equal(result.would_publish.message_length, post.text.length);
  assert.equal(readHistory().filter((record) => record.kind === 'published').length, 0);
});

test('отложенная публикация принимает дату', async () => {
  const post = buildPost({ subject: 'tbank', rubric: 'karta', dryRun: true });
  const result = await publishPost(post, { dryRun: true, schedule: '2026-10-05T10:00' });
  assert.match(result.would_publish.scheduled, /^2026-10-05T/);
});

test('батч останавливается на ошибке и не заливает остальное', async () => {
  const good = buildPost({ subject: 'tbank', rubric: 'karta', dryRun: true });
  // «плохой» пост ломается по-настоящему: запрещённая формулировка в тексте
  const bad = { ...good, text: `${good.text}\n\nГарантированный доход без риска.` };
  const results = await publishBatch([good, bad], { dryRun: true });
  assert.equal(results.length, 2);
  assert.equal(results[0].dry_run, true);
  assert.match(results[1].error, /заблокирована/);
});

test('повторная публикация того же поста пропускается', async () => {
  const post = { ...buildPost({ subject: 'tbank', rubric: 'karta', dryRun: true }), status: 'published' };
  const result = await publishPost(post, { dryRun: false });
  assert.equal(result.skipped, true);
});
