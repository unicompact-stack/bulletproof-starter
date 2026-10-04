// Площадки: реестр, лимиты, заглушки и публикация одного поста на несколько площадок.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkspace, cleanup } from './helpers.js';

const root = await makeWorkspace();
const { fetchSubject } = await import('../src/fetch.js');
const { buildPost } = await import('../src/generate.js');
const { publishPost } = await import('../src/publish.js');
const { runChecks } = await import('../src/checks.js');
const {
  listChannels,
  getChannel,
  enabledChannelIds,
  channelReadiness,
  allChannelsReadiness,
  strictestMaxLength,
} = await import('../src/channels/index.js');
const { publishedByChannel } = await import('../src/history.js');

test.after(() => cleanup(root));

await fetchSubject('tbank', { offline: true });

test('в реестре три площадки, включена одна', () => {
  const channels = listChannels().map((channel) => channel.id);
  assert.deepEqual(channels.sort(), ['dzen', 'telegram', 'vk']);
  assert.deepEqual(enabledChannelIds(), ['vk']);
});

test('у каждой площадки свой лимит длины', () => {
  assert.equal(getChannel('vk').max_length, 2600);
  assert.equal(getChannel('telegram').max_length, 4096);
  assert.equal(getChannel('dzen').max_length, 10000);
  // самый строгий из включённых — по нему и проверяем текст
  assert.equal(strictestMaxLength(), 2600);
  assert.equal(strictestMaxLength(['telegram', 'dzen']), 4096);
});

test('несуществующая площадка — понятная ошибка со списком', () => {
  assert.throws(() => getChannel('tikTok'), /не описана в channels\/channels.json/);
  assert.throws(() => getChannel('tikTok'), /vk, telegram, dzen/);
});

test('заглушка честно говорит, что не готова, и не притворяется рабочей', () => {
  const telegram = channelReadiness('telegram');
  assert.equal(telegram.ready, false);
  assert.equal(telegram.enabled, false);
  assert.equal(telegram.implemented, false);
  assert.match(telegram.problems.join(' '), /Telegram не написан/i);
  assert.match(telegram.problems.join(' '), /TELEGRAM_BOT_TOKEN/);
});

test('ВКонтакте — единственная рабочая площадка, ключ не задан', () => {
  const vk = channelReadiness('vk');
  assert.equal(vk.implemented, true);
  assert.equal(vk.ready, false);
  assert.match(vk.problems.join(' '), /VK_TOKEN/);
  assert.equal(allChannelsReadiness().length, 3);
});

test('сухой прогон показывает все запрошенные площадки, наружу не уходит ничего', async () => {
  const post = buildPost({ subject: 'tbank', rubric: 'karta', dryRun: true });
  const result = await publishPost(post, { dryRun: true, channels: ['vk', 'telegram'] });
  assert.equal(result.dry_run, true);
  assert.equal(result.channels.length, 2);
  assert.equal(result.channels[0].channel, 'vk');
  assert.equal(result.channels[0].status, 'would_publish');
  assert.equal(result.channels[1].status, 'would_publish (адаптер не написан)');
  assert.equal(result.channels[0].message_length, post.text.length);
  assert.equal(publishedByChannel('banks').vk, undefined);
});

test('текст длиннее лимита площадки блокируется до публикации', async () => {
  const post = buildPost({ subject: 'tbank', rubric: 'karta', dryRun: true });
  const long = { ...post, text: `${post.text}\n${'а'.repeat(2800)}` };
  // проверка самого поста: лимит берётся у включённых площадок
  const result = runChecks(long, { maxLength: strictestMaxLength() });
  assert.ok(result.errors.some((error) => error.id === 'channel-too-long'));
  await assert.rejects(() => publishPost(long, { dryRun: false }), /Публикация заблокирована/);
});

test('слишком длинный текст не уходит и на площадку, где лимит больше', async () => {
  const post = buildPost({ subject: 'tbank', rubric: 'karta', dryRun: true });
  const long = { ...post, text: `${post.text}\n${'а'.repeat(5000)}` };
  await assert.rejects(
    () => publishPost(long, { dryRun: false, channels: ['telegram'] }),
    /Публикация заблокирована/,
  );
});

test('боевой режим на неготовой площадке падает с ошибкой, а не делает вид, что опубликовал', async () => {
  const post = buildPost({ subject: 'tbank', rubric: 'karta', dryRun: true });
  await assert.rejects(
    () => publishPost(post, { dryRun: false, channels: ['telegram'] }),
    /Ни одна площадка не приняла публикацию/,
  );
  // и ничего не записано в историю как «опубликовано»
  assert.equal(publishedByChannel('banks').telegram, undefined);
});

test('без ключа ВК живая публикация честно падает с понятной ошибкой', async () => {
  const post = buildPost({ subject: 'tbank', rubric: 'karta', dryRun: true });
  await assert.rejects(() => publishPost(post, { dryRun: false, channels: ['vk'] }), /VK_GROUP_ID/);
});

test('история помечает площадку — это будущая основа для агента уровнем выше', async () => {
  const { appendHistory, readHistory } = await import('../src/history.js');
  appendHistory(
    {
      kind: 'published',
      id: '2026-10-04-tbank-karta',
      profile: 'banks',
      subject_id: 'tbank',
      rubric: 'karta',
      at: '2026-10-04T12:00:00.000Z',
      channels: [
        { channel: 'vk', status: 'published', url: 'https://vk.com/wall-1_2' },
        { channel: 'telegram', status: 'error', error: 'адаптер не написан' },
        { channel: 'dzen', status: 'scheduled' },
      ],
    },
    'banks',
  );
  const summary = publishedByChannel('banks');
  assert.deepEqual(summary.vk, { published: 1, scheduled: 0, errors: 0 });
  assert.deepEqual(summary.telegram, { published: 0, scheduled: 0, errors: 1 });
  assert.deepEqual(summary.dzen, { published: 0, scheduled: 1, errors: 0 });

  // сгенерированные посты в счёт публикаций не идут: верхний агент считает реальные выходы
  const post = buildPost({ subject: 'tbank', rubric: 'karta' });
  const before = publishedByChannel('banks').vk.published;
  appendHistory({ kind: 'generated', id: post.id, subject_id: 'tbank', at: post.created }, 'banks');
  assert.equal(publishedByChannel('banks').vk.published, before);
});
