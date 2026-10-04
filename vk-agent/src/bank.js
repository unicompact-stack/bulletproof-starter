// Работа с банками и базой фактов.
// Факты — это единственный источник цифр для постов. Агент не придумывает числа.

import path from 'node:path';
import {
  resolvePath,
  readJson,
  writeJson,
  isFresh,
  daysSince,
  todayISO,
} from './util.js';

export const BANKS_FILE = resolvePath('config', 'banks.json');
export const FACTS_DIR = resolvePath('knowledge', 'facts');

/** Все банки из конфига */
export function loadBanksConfig() {
  return readJson(BANKS_FILE, { banks: [] });
}

export function listBanks() {
  return loadBanksConfig().banks ?? [];
}

/**
 * Найти банк по названию, id или псевдониму.
 * «альфа», «Альфа-Банк», «alfa» — всё ведёт к одной записи.
 */
export function findBank(query) {
  if (!query) return null;
  const needle = String(query).trim().toLowerCase();
  const banks = listBanks();
  const exact = banks.find(
    (bank) =>
      bank.id.toLowerCase() === needle ||
      bank.name.toLowerCase() === needle ||
      (bank.aliases ?? []).some((alias) => alias.toLowerCase() === needle),
  );
  if (exact) return exact;
  return (
    banks.find(
      (bank) =>
        bank.name.toLowerCase().includes(needle) ||
        (bank.aliases ?? []).some((alias) => alias.toLowerCase().includes(needle)),
    ) ?? null
  );
}

/** Файл фактов банка */
export function factsFile(bankId) {
  return path.join(FACTS_DIR, `${bankId}.json`);
}

/** Загрузить факты банка */
export function loadFacts(bankId) {
  return readJson(factsFile(bankId), {
    bank_id: bankId,
    updated: null,
    facts: {},
  });
}

export function saveFacts(bankId, data) {
  const payload = {
    bank_id: bankId,
    updated: data.updated ?? todayISO(),
    notes: data.notes,
    facts: data.facts ?? {},
  };
  writeJson(factsFile(bankId), payload);
  return payload;
}

/**
 * Слить новые факты с уже сохранёнными.
 * Существующие факты не перетираются пустыми значениями.
 */
export function mergeFacts(bankId, fresh) {
  const current = loadFacts(bankId);
  const facts = { ...current.facts };
  let added = 0;
  let updatedCount = 0;
  for (const [key, value] of Object.entries(fresh ?? {})) {
    if (!value || value.value === undefined || value.value === null || value.value === '') continue;
    const previous = facts[key];
    if (!previous) {
      facts[key] = value;
      added += 1;
    } else if (previous.value !== value.value) {
      facts[key] = { ...previous, ...value };
      updatedCount += 1;
    } else {
      // значение то же — обновляем только дату проверки
      facts[key] = { ...previous, ...value, value: previous.value };
    }
  }
  const saved = saveFacts(bankId, { ...current, facts, updated: todayISO() });
  return { saved, added, updated: updatedCount, total: Object.keys(facts).length };
}

/**
 * Факты для рубрики: список записей с метками, датами и признаком свежести.
 * Именно этот список подставляется в шаблон поста.
 */
export function factsForRubric(bankId, rubric, options = {}) {
  const { required = [], extra = [], ttlDays = 30 } = options;
  const data = loadFacts(bankId);
  const keys = [...new Set([...required, ...extra])];
  return keys
    .filter((key) => data.facts?.[key])
    .map((key) => {
      const fact = data.facts[key];
      return {
        key,
        label: fact.label ?? key,
        value: fact.value,
        date: fact.date ?? null,
        source: fact.source ?? null,
        product: fact.product ?? null,
        fresh: isFresh(fact.date, ttlDays),
        age_days: daysSince(fact.date),
        required: required.includes(key),
      };
    });
}

/** Какие обязательные факты не заполнены */
export function missingFacts(bankId, requiredKeys) {
  const data = loadFacts(bankId);
  return requiredKeys.filter((key) => {
    const fact = data.facts?.[key];
    return !fact || !fact.value;
  });
}

export function factsSnapshot(bankId) {
  const data = loadFacts(bankId);
  return {
    bank_id: bankId,
    updated: data.updated,
    keys: Object.keys(data.facts ?? {}),
    facts: data.facts ?? {},
  };
}
