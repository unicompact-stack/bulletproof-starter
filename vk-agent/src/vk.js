// Тонкая обёртка над API ВКонтакте. Никаких зависимостей — fetch из Node 20+.

import { env, envInt } from './util.js';

const API_BASE = 'https://api.vk.com/method';

export class VkError extends Error {
  constructor(method, error) {
    const text = error?.error_msg ?? JSON.stringify(error);
    super(`ВК API ${method}: ${text}`);
    this.name = 'VkError';
    this.code = error?.error_code ?? null;
    this.method = method;
  }
}

export function vkConfig() {
  const token = env('VK_TOKEN');
  const groupId = env('VK_GROUP_ID').replace(/^-/, '');
  const version = env('VK_API_VERSION', '5.199');
  return { token, groupId, version, ready: Boolean(token && groupId) };
}

/** Что мешает публиковать: понятный список причин без токена и id группы */
export function vkReadiness() {
  const { token, groupId, version, ready } = vkConfig();
  const problems = [];
  if (!token) problems.push('В .env не заполнен VK_TOKEN');
  if (!groupId) problems.push('В .env не заполнен VK_GROUP_ID');
  return { ready, version, has_token: Boolean(token), group_id: groupId || null, problems };
}

export async function vkCall(method, params = {}) {
  const { token, version } = vkConfig();
  if (!token) throw new Error('Нет VK_TOKEN в .env — публикация невозможна');

  const body = new URLSearchParams({ ...params, access_token: token, v: version });
  let response;
  try {
    response = await fetch(`${API_BASE}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (error) {
    throw new Error(`Не достучаться до api.vk.com: ${error.message}`);
  }

  const payload = await response.json().catch(() => null);
  if (!payload) throw new VkError(method, { error_msg: `пустой ответ, HTTP ${response.status}` });
  if (payload.error) throw new VkError(method, payload.error);
  return payload.response;
}

/** Проверка ключа и прав: вызывается командой npm run status */
export async function vkCheck() {
  const readiness = vkReadiness();
  if (!readiness.ready) return { ...readiness, checked: false };
  try {
    const groups = await vkCall('groups.getById', { group_ids: readiness.group_id, fields: 'can_post,members_count' });
    const group = Array.isArray(groups) ? groups[0] : groups?.groups?.[0];
    return {
      ...readiness,
      checked: true,
      ok: true,
      group_name: group?.name ?? null,
      can_post: group?.can_post ?? null,
      members_count: group?.members_count ?? null,
    };
  } catch (error) {
    return { ...readiness, checked: true, ok: false, error: error.message };
  }
}

/**
 * Опубликовать запись на стене сообщества.
 * @param {Object} options { message, publishDate, attachments }
 */
export async function publishToWall({ message, publishDate = null, attachments = null }) {
  const { groupId } = vkConfig();
  if (!groupId) throw new Error('Нет VK_GROUP_ID в .env — публикация невозможна');

  const params = {
    owner_id: `-${groupId}`,
    from_group: '1',
    message,
  };
  if (publishDate) params.publish_date = String(publishDate);
  if (attachments) params.attachments = attachments;

  const postId = await vkCall('wall.post', params);
  return {
    post_id: postId,
    url: `https://vk.com/wall-${groupId}_${postId}`,
    scheduled: Boolean(publishDate),
  };
}

/** Первый комментарий со ссылкой — чтобы не терять охват из-за ссылки в тексте */
export async function addFirstComment(postId, text) {
  const { groupId } = vkConfig();
  return vkCall('wall.createComment', {
    owner_id: `-${groupId}`,
    post_id: String(postId),
    message: text,
    from_group: '1',
  });
}
