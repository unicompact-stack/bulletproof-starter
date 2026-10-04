// Сбор фактов со страниц банков.
// Онлайн: настоящие запросы. Офлайн (--offline): разбор фикстур из test/fixtures —
// так парсер проверяется без интернета.

import { resolvePath, readText, writeText } from './util.js';
import { listBanks, findBank, mergeFacts, loadBanksConfig } from './bank.js';
import { factsFromHtml } from './parse.js';

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
async function collectSource(bank, source, { offline, timeoutMs, userAgent }) {
  let html = null;
  let from = 'live';

  if (offline) {
    const fixture = resolvePath('test', 'fixtures', 'banks', source.fixture ?? '');
    html = readText(fixture);
    from = 'fixture';
    if (!html) {
      return { source_id: source.id, url: source.url, status: 'skipped', reason: 'нет фикстуры для офлайн-режима' };
    }
  } else {
    html = await fetchHtml(source.url, { timeoutMs, userAgent });
  }

  // кэш последней загрузки — пригодится при разборе ошибок парсера
  writeText(resolvePath('data', 'cache', `${bank.id}-${source.id}.html`), html);

  let facts = {};
  let parseError = null;
  try {
    facts = factsFromHtml(html, source);
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
 * Собрать факты по одному банку и сохранить их в knowledge/facts/<bank>.json
 */
export async function fetchBank(bankQuery, { offline = false, timeoutMs, userAgent } = {}) {
  const config = loadBanksConfig();
  const bank = bankQuery ? findBank(bankQuery) : null;
  if (!bank) throw new Error(`Банк не найден: «${bankQuery}»`);

  const options = {
    offline,
    timeoutMs: timeoutMs ?? config.default_timeout_ms ?? 15000,
    userAgent: userAgent ?? config.user_agent ?? 'Mozilla/5.0',
  };

  const results = [];
  for (const source of bank.sources ?? []) {
    try {
      results.push(await collectSource(bank, source, options));
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

  const saved = mergeFacts(bank.id, combined);
  return { bank: bank.id, bank_name: bank.name, offline, results, saved };
}

/** Все банки из конфига */
export async function fetchAll({ offline = false, timeoutMs, userAgent } = {}) {
  const banks = listBanks();
  const out = [];
  for (const bank of banks) {
    out.push(await fetchBank(bank.id, { offline, timeoutMs, userAgent }));
  }
  return out;
}

/** Человекочитаемая сводка по прогону сбора */
export function formatFetchReport(report) {
  const lines = [];
  lines.push(`# Сбор фактов: ${report.bank_name ?? report.bank}${report.offline ? ' (офлайн, фикстуры)' : ''}`);
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
