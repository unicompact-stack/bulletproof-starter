// История сборок и публикаций. Лежит в data/<профиль>/history.jsonl (в git не попадает).
//
// Это не просто лог для человека: это будущая основа для агента уровнем выше.
// Поэтому в каждой записи есть площадка и тема — по ним потом можно будет считать
// «сколько постов ушло, куда и по какой теме», не переделывая историю задним числом.

import fs from 'node:fs';
import path from 'node:path';
import { readText, ensureDir } from './util.js';
import { profilePaths } from './profile.js';

export function historyFile(profile = null) {
  return profilePaths(profile).history;
}

export function readHistory(profile = null) {
  const text = readText(historyFile(profile), '');
  if (!text) return [];
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function appendHistory(record, profile = null) {
  const file = historyFile(profile);
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

/** Когда последний раз выходил пост с таким объектом и рубрикой */
export function lastPublished(subjectId, rubricId, profile = null) {
  const records = readHistory(profile).filter(
    (record) =>
      record.subject_id === subjectId && record.rubric === rubricId && record.kind !== 'generated',
  );
  if (!records.length) return null;
  return records.reduce((latest, record) => (new Date(record.at) > new Date(latest.at) ? record : latest));
}

/** Сводка по площадкам: сколько постов ушло куда (нужно верхнему агенту) */
export function publishedByChannel(profile = null) {
  const summary = {};
  for (const record of readHistory(profile)) {
    if (record.kind === 'generated') continue;
    for (const channel of record.channels ?? []) {
      const key = channel.channel ?? 'неизвестно';
      if (!summary[key]) summary[key] = { published: 0, scheduled: 0, errors: 0 };
      if (channel.status === 'error') summary[key].errors += 1;
      else if (channel.status === 'scheduled') summary[key].scheduled += 1;
      else summary[key].published += 1;
    }
  }
  return summary;
}
