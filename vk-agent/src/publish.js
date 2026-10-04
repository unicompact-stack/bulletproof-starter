// Публикация поста в сообщество. По умолчанию — «сухой прогон»:
// ничего не уходит в ВК, пока не передан флаг --live.

import { publishToWall, vkReadiness } from './vk.js';
import { savePost } from './generate.js';
import { appendHistory } from './history.js';
import { runChecks } from './checks.js';

/**
 * @param {Object} post пост из очереди
 * @param {Object} [options] { dryRun = true, schedule }
 */
export async function publishPost(post, options = {}) {
  const { dryRun = true, schedule = null, comment = null } = options;

  if (!post) throw new Error('Пост не найден');
  if (post.status === 'published') return { skipped: true, reason: 'Уже опубликован', post };

  // Проверки перезапускаются прямо перед публикацией: пост мог быть отредактирован руками,
  // а решение о публикации должно опираться на текущий текст, а не на старый флаг.
  const checks = runChecks(post);
  post = { ...post, checks };
  if (checks.errors.length) {
    throw new Error(
      'Публикация заблокирована проверками:\n- ' + checks.errors.map((error) => error.message).join('\n- '),
    );
  }

  const publishDate = schedule ? Math.floor(new Date(schedule).getTime() / 1000) : null;
  if (schedule && Number.isNaN(publishDate)) {
    throw new Error(`Не понял дату отложенной публикации: «${schedule}». Формат: 2026-10-05T10:00`);
  }

  if (dryRun) {
    const readiness = vkReadiness();
    return {
      dry_run: true,
      would_publish: {
        owner_id: readiness.group_id ? `-${readiness.group_id}` : null,
        message_length: post.text.length,
        scheduled: publishDate ? new Date(publishDate * 1000).toISOString() : null,
      },
      post,
    };
  }

  const result = await publishToWall({
    message: post.text,
    publishDate,
    attachments: post.attachments ?? null,
  });

  const updated = savePost({
    ...post,
    status: 'published',
    published: { ...result, at: new Date().toISOString(), scheduled: Boolean(publishDate) },
  });

  appendHistory({
    kind: publishDate ? 'scheduled' : 'published',
    id: post.id,
    bank_id: post.bank_id,
    rubric: post.rubric,
    topic_id: post.topic_id,
    at: new Date().toISOString(),
    vk_post_id: result.post_id,
    url: result.url,
  });

  return { published: true, ...result, post: updated };
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
