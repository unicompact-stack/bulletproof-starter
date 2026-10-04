// Площадки публикации. Один пост может уйти на несколько площадок одной командой.
//
// Реестр лежит в channels/channels.json: включена площадка или нет, какой у неё лимит
// длины и какой адаптер её обслуживает. Добавление новой площадки = запись в реестре
// + файл адаптера; код конвейера не меняется.

import { readJson, resolvePath } from '../util.js';
import * as vk from './vk.js';
import * as telegram from './telegram.js';
import * as dzen from './dzen.js';

const ADAPTERS = { vk, telegram, dzen };

function registry() {
  return readJson(resolvePath('channels', 'channels.json'), { channels: {}, default_enabled: [] });
}

export function listChannels() {
  const config = registry();
  return Object.entries(config.channels ?? {}).map(([id, channel]) => ({
    id,
    ...channel,
    implemented: channel.implemented !== false && Boolean(ADAPTERS[channel.adapter ?? id]),
  }));
}

export function enabledChannelIds() {
  const config = registry();
  const enabled = listChannels().filter((channel) => channel.enabled);
  return (enabled.length ? enabled.map((channel) => channel.id) : config.default_enabled ?? []).filter(Boolean);
}

export function getChannel(id) {
  const config = registry();
  const channel = config.channels?.[id] ?? null;
  if (!channel) {
    throw new Error(
      `Площадка «${id}» не описана в channels/channels.json. Доступные: ${listChannels()
        .map((item) => item.id)
        .join(', ')}`,
    );
  }
  return { id, ...channel };
}

function adapterOf(id) {
  const channel = getChannel(id);
  const adapter = ADAPTERS[channel.adapter ?? id];
  if (!adapter) throw new Error(`Для площадки «${id}» нет адаптера: ${channel.adapter}`);
  return adapter;
}

/** Готовность площадки: хватает ли ключей и написан ли адаптер */
export function channelReadiness(id) {
  const channel = getChannel(id);
  const adapter = adapterOf(id);
  const base = adapter.readiness?.() ?? { ready: false, problems: ['Адаптер не отвечает'] };
  return {
    id,
    name: channel.name,
    enabled: Boolean(channel.enabled),
    implemented: channel.implemented !== false,
    max_length: channel.max_length ?? null,
    ...base,
  };
}

/** Готовность всех площадок разом — для панели и команды status */
export function allChannelsReadiness() {
  return listChannels().map((channel) => channelReadiness(channel.id));
}

/** Живая проверка ключа: делает ли площадка реальный запрос (кvkCheck) */
export async function channelCheck(id) {
  const channel = getChannel(id);
  const adapter = adapterOf(id);
  if (!adapter.check) return { ready: false, error: 'Адаптер не умеет проверять ключ' };
  try {
    return await adapter.check();
  } catch (error) {
    return { ready: false, error: error.message, channel: channel.name };
  }
}

/**
 * Публикация поста на набор площадок.
 * Одна площадка с ошибкой не отменяет остальные: результат собирается по каждой,
 * решение о выходе из строя остаётся за владельцем. Но «успех» показывается
 * только там, где он настоящий.
 */
export async function publishToChannels(post, options = {}) {
  const { dryRun = true, channels = null, schedule = null, comment = null, attachments = null } = options;
  const targetIds = channels && channels.length ? channels : enabledChannelIds();
  if (!targetIds.length) throw new Error('Ни одна площадка не включена: проверь enabled в channels/channels.json');

  const results = [];
  for (const id of targetIds) {
    const channel = getChannel(id);
    const length = post.text.length;
    const limit = channel.max_length ?? null;

    if (limit && length > limit) {
      results.push({
        channel: id,
        channel_name: channel.name,
        status: 'error',
        error: `Текст ${length} символов длиннее лимита площадки (${limit})`,
      });
      continue;
    }

    if (dryRun) {
      results.push({
        channel: id,
        channel_name: channel.name,
        status: channel.implemented === false ? 'would_publish (адаптер не написан)' : 'would_publish',
        message_length: length,
        max_length: limit,
        scheduled: schedule ?? null,
        target: adapterOf(id).describe?.() ?? null,
      });
      continue;
    }

    if (channel.implemented === false) {
      results.push({
        channel: id,
        channel_name: channel.name,
        status: 'error',
        error: `Площадка «${channel.name}» включена, но адаптер не написан — публикация не выполнена`,
      });
      continue;
    }

    try {
      const published = await adapterOf(id).publish({
        text: post.text,
        schedule,
        attachments,
        comment,
        post,
      });
      results.push({
        channel: id,
        channel_name: channel.name,
        status: schedule ? 'scheduled' : 'published',
        ...published,
      });
    } catch (error) {
      results.push({ channel: id, channel_name: channel.name, status: 'error', error: error.message });
    }
  }
  return results;
}

/** Самый строгий лимит среди включённых площадок — для проверки текста до публикации */
export function strictestMaxLength(channels = null) {
  const ids = channels && channels.length ? channels : enabledChannelIds();
  const limits = ids
    .map((id) => getChannel(id).max_length)
    .filter((value) => Number.isFinite(value));
  return limits.length ? Math.min(...limits) : null;
}
