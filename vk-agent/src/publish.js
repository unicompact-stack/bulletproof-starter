// Публикация поста. По умолчанию — «сухой прогон»: ничего никуда не уходит,
// пока не передан флаг --live.
//
// Один пост может уйти на несколько площадок. Решение принимается один раз,
// результат собирается по каждой площадке отдельно: одна ошибка не отменяет
// остальные, но и «успех» не показывается там, где его не было.

import { savePost, recheckPost } from './generate.js';
import { appendHistory } from './history.js';
import { runChecks } from './checks.js';
import { publishToChannels, enabledChannelIds, strictestMaxLength } from './channels/index.js';

/**
 * @param {Object} post пост из очереди
 * @param {Object} [options] { dryRun = true, schedule, channels, comment }
 */
export async function publishPost(post, options = {}) {
  const { dryRun = true, schedule = null, comment = null, channels = null, profile = null } = options;

  if (!post) throw new Error('Пост не найден');
  if (post.status === 'published') return { skipped: true, reason: 'Уже опубликован', post };

  // Проверки перезапускаются прямо перед публикацией: пост мог быть отредактирован руками,
  // а решение о публикации должно опираться на текущий текст, а не на старый флаг.
  const targetChannels = channels && channels.length ? channels : enabledChannelIds();
  const maxLength = strictestMaxLength(targetChannels);
  const checks = runChecks(post, { maxLength, profile: profile ?? post.profile ?? null });
  post = { ...post, checks };
  if (checks.errors.length) {
    throw new Error(
      'Публикация заблокирована проверками:\n- ' + checks.errors.map((error) => error.message).join('\n- '),
    );
  }

  if (schedule && Number.isNaN(new Date(schedule).getTime())) {
    throw new Error(`Не понял дату отложенной публикации: «${schedule}». Формат: 2026-10-05T10:00`);
  }

  const results = await publishToChannels(post, {
    dryRun,
    channels: targetChannels,
    schedule,
    comment,
    attachments: post.attachments ?? null,
  });

  const errors = results.filter((item) => item.status === 'error');
  const succeeded = results.filter((item) => !item.status.startsWith('would') && item.status !== 'error');

  if (dryRun) {
    return { dry_run: true, channels: results, post, would_publish: summarize(results) };
  }

  if (errors.length && !succeeded.length) {
    throw new Error(
      'Ни одна площадка не приняла публикацию:\n- ' +
        errors.map((item) => `${item.channel_name}: ${item.error}`).join('\n- '),
    );
  }

  const updated = savePost(
    {
      ...post,
      status: succeeded.length ? 'published' : 'blocked',
      published: {
        at: new Date().toISOString(),
        scheduled: Boolean(schedule),
        channels: results,
      },
    },
    { profile },
  );

  appendHistory(
    {
      kind: schedule ? 'scheduled' : 'published',
      id: post.id,
      profile: post.profile ?? null,
      subject_id: post.subject_id,
      rubric: post.rubric,
      topic_id: post.topic_id,
      at: new Date().toISOString(),
      channels: results,
      url: succeeded.find((item) => item.url)?.url ?? null,
    },
    profile,
  );

  return {
    published: succeeded.length > 0,
    partial: errors.length > 0,
    channels: results,
    url: succeeded.find((item) => item.url)?.url ?? null,
    post: updated,
  };
}

/** Короткая сводка сухого прогона: что и куда ушло бы */
function summarize(results) {
  return {
    message_length: results[0]?.message_length ?? null,
    channels: results.map((item) => ({
      channel: item.channel,
      name: item.channel_name,
      status: item.status,
      max_length: item.max_length ?? null,
    })),
    scheduled: results.find((item) => item.scheduled)?.scheduled ?? null,
  };
}

/** Пакетная публикация: останавливается на первой ошибке, чтобы не залить мусор */
export async function publishBatch(posts, options = {}) {
  const results = [];
  for (const post of posts) {
    try {
      results.push({ id: post.id, ...(await publishPost(post, options)) });
    } catch (error) {
      results.push({ id: post.id, error: error.message });
      break;
    }
  }
  return results;
}

export { recheckPost };
