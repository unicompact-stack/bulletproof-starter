// Сбор фактов со страниц объектов тематики.
// Онлайн: настоящие запросы. Офлайн (--offline): разбор фикстур из test/fixtures —
// так парсер проверяется без интернета.
//
// Как разбирать страницу, решает экстрактор профиля (src/extractors/), а не этот модуль.

import { readText, writeText, envInt } from './util.js';
import { listSubjects, findSubject, mergeFacts, loadSubjectsConfig } from './subject.js';
import { getExtractor } from './extractors/index.js';
import { loadProfile, profilePaths } from './profile.js';

/** Скачать страницу текстом */
export async function fetchHtml(url, { timeoutMs = 15000, userAgent = 'Mozilla/5.0' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'ru-RU,ru;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} на ${url}`);
    return await response.text();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Таймаут ${timeoutMs} мс на ${url}`);
    throw new Error(`${error.message} (${url})`);
  } finally {
    clearTimeout(timer);
  }
}

/** Разобрать одну страницу-источник: онлайн или из фикстуры */
async function collectSource(subject, source, { offline, timeoutMs, userAgent, extractor, profile }) {
  const paths = profilePaths(profile);
  let html = null;
  let from = 'live';

  if (offline) {
    const fixture = paths.fixtures ?? `${paths.dir}/../../test/fixtures/${profile?.id ?? 'banks'}`;
    html = readText(`${fixture}/${source.fixture ?? ''}`);
    from = 'fixture';
    if (!html) {
      return { source_id: source.id, url: source.url, status: 'skipped', reason: 'нет фикстуры для офлайн-режима' };
    }
  } else {
    html = await fetchHtml(source.url, { timeoutMs, userAgent });
  }

  // кэш последней загрузки — пригодится при разборе ошибок парсера
  writeText(`${paths.cache}/${subject.id}-${source.id}.html`, html);

  let facts = {};
  let parseError = null;
  try {
    facts = extractor.factsFromHtml(html, source);
  } catch (error) {
    parseError = error.message;
  }

  return {
    source_id: source.id,
    title: source.title ?? source.id,
    url: source.url,
    status: parseError ? 'error' : 'ok',
    from,
    reason: parseError,
    facts_count: Object.keys(facts).length,
    facts,
  };
}

/**
 * Собрать факты по одному объекту и сохранить их в data/<профиль>/facts/<объект>.json
 */
export async function fetchSubject(subjectQuery, { offline = false, timeoutMs, userAgent, profile = null } = {}) {
  const active = loadProfile(profile);
  const config = loadSubjectsConfig(profile);
  const subject = subjectQuery ? findSubject(subjectQuery, profile) : null;
  if (!subject) {
    throw new Error(
      `${active.subject_label} не найден: «${subjectQuery}». Список — profiles/${active.id}/subjects.json`,
    );
  }
  const extractor = getExtractor(active.extractor);

  const options = {
    offline,
    profile,
    timeoutMs: timeoutMs ?? config.default_timeout_ms ?? envInt('FETCH_TIMEOUT_MS', 15000),
    userAgent: userAgent ?? config.user_agent ?? 'Mozilla/5.0',
    extractor,
  };

  const results = [];
  for (const source of subject.sources ?? []) {
    try {
      results.push(await collectSource(subject, source, options));
    } catch (error) {
      results.push({ source_id: source.id, url: source.url, status: 'error', reason: error.message });
    }
  }

  const combined = {};
  for (const result of results) {
    if (!result.facts) continue;
    for (const [key, value] of Object.entries(result.facts)) {
      const previous = combined[key];
      // при конфликте оставляем факт с более свежей датой
      if (!previous || String(value.date ?? '') > String(previous.date ?? '')) combined[key] = value;
    }
  }

  const saved = mergeFacts(subject.id, combined, profile);
  return {
    profile: active.id,
    subject: subject.id,
    subject_name: subject.name,
    offline,
    results,
    saved,
  };
}

/** Все объекты профиля */
export async function fetchAll({ offline = false, timeoutMs, userAgent, profile = null } = {}) {
  const subjects = listSubjects(profile);
  const out = [];
  for (const subject of subjects) {
    out.push(await fetchSubject(subject.id, { offline, timeoutMs, userAgent, profile }));
  }
  return out;
}

/** Человекочитаемая сводка по прогону сбора */
export function formatFetchReport(report) {
  const lines = [];
  lines.push(
    `# Сбор фактов: ${report.subject_name ?? report.subject}${report.offline ? ' (офлайн, фикстуры)' : ''}`,
  );
  for (const result of report.results ?? []) {
    const mark = result.status === 'ok' ? '✓' : result.status === 'skipped' ? '–' : '✗';
    lines.push(`${mark} ${result.title ?? result.source_id}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
    if (result.facts) {
      for (const [key, fact] of Object.entries(result.facts)) {
        lines.push(`    ${key} = ${fact.value}  [${fact.date ?? 'дата не найдена'}]`);
      }
    }
  }
  if (report.saved) {
    lines.push(
      `Итого в базе: ${report.saved.total} фактов (добавлено ${report.saved.added}, обновлено ${report.saved.updated})`,
    );
  }
  return lines.join('\n');
}
