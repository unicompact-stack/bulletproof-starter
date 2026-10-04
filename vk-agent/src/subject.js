// Объекты тематики и база фактов.
// В профиле «banks» объект — это банк, в профиле «vacancies» — работодатель.
// Код не знает, что именно: он работает со списком объектов и их фактами.
// Факты — единственный источник цифр для постов. Агент не придумывает числа.

import path from 'node:path';
import {
  readJson,
  writeJson,
  isFresh,
  daysSince,
  todayISO,
} from './util.js';
import { loadSubjectNotes, profilePaths } from './profile.js';

/** Настройки объектов текущего профиля */
export function loadSubjectsConfig(profile = null) {
  const paths = profilePaths(profile);
  return readJson(paths.file('subjects.json'), { subjects: [] });
}

/** Все объекты тематики */
export function listSubjects(profile = null) {
  return loadSubjectsConfig(profile).subjects ?? [];
}

/**
 * Найти объект по названию, id или псевдониму.
 * «альфа», «Альфа-Банк», «alfa» — всё ведёт к одной записи.
 */
export function findSubject(query, profile = null) {
  if (!query) return null;
  const needle = String(query).trim().toLowerCase();
  const subjects = listSubjects(profile);
  const exact = subjects.find(
    (subject) =>
      subject.id.toLowerCase() === needle ||
      subject.name.toLowerCase() === needle ||
      (subject.aliases ?? []).some((alias) => alias.toLowerCase() === needle),
  );
  if (exact) return exact;
  return (
    subjects.find(
      (subject) =>
        subject.name.toLowerCase().includes(needle) ||
        (subject.aliases ?? []).some((alias) => alias.toLowerCase().includes(needle)),
    ) ?? null
  );
}

/**
 * Имя объекта, о котором говорит пользователь.
 * «пост про карты» без указания банка — берём единственный объект, иначе первый.
 */
export function resolveSubjectQuery(query, profile = null) {
  const found = findSubject(query, profile);
  if (found) return found.id;
  const subjects = listSubjects(profile);
  if (!subjects.length) return null;
  return subjects.length === 1 ? subjects[0].id : subjects[0].id;
}

/** Файл фактов объекта: data/<профиль>/facts/<объект>.json */
export function factsFile(subjectId, profile = null) {
  return path.join(profilePaths(profile).facts, `${subjectId}.json`);
}

/** Загрузить факты объекта */
export function loadFacts(subjectId, profile = null) {
  return readJson(factsFile(subjectId, profile), {
    subject_id: subjectId,
    updated: null,
    facts: {},
  });
}

export function saveFacts(subjectId, data, profile = null) {
  const payload = {
    subject_id: subjectId,
    updated: data.updated ?? todayISO(),
    notes: data.notes,
    facts: data.facts ?? {},
  };
  writeJson(factsFile(subjectId, profile), payload);
  return payload;
}

/**
 * Слить новые факты с уже сохранёнными.
 * Существующие факты не перетираются пустыми значениями.
 */
export function mergeFacts(subjectId, fresh, profile = null) {
  const current = loadFacts(subjectId, profile);
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
  const saved = saveFacts(subjectId, { ...current, facts, updated: todayISO() }, profile);
  return { saved, added, updated: updatedCount, total: Object.keys(facts).length };
}

/**
 * Факты для рубрики: список записей с метками, датами и признаком свежести.
 * Именно этот список подставляется в шаблон поста.
 */
export function factsForRubric(subjectId, rubric, options = {}) {
  const { required = [], extra = [], ttlDays = 30, profile = null } = options;
  const data = loadFacts(subjectId, profile);
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
export function missingFacts(subjectId, requiredKeys, profile = null) {
  const data = loadFacts(subjectId, profile);
  return requiredKeys.filter((key) => {
    const fact = data.facts?.[key];
    return !fact || !fact.value;
  });
}

export function factsSnapshot(subjectId, profile = null) {
  const data = loadFacts(subjectId, profile);
  return {
    subject_id: subjectId,
    updated: data.updated,
    keys: Object.keys(data.facts ?? {}),
    facts: data.facts ?? {},
  };
}

/**
 * Заметки по объекту из profiles/<id>/knowledge/<объект>.md — тон, запреты, особенности.
 * Читает человек при работе над текстом, поэтому возвращается сырым текстом с front-matter.
 */
export function subjectNotes(subjectId, profile = null) {
  return loadSubjectNotes(subjectId, profile);
}
