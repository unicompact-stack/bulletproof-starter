// История публикаций и сборок. Лежит в data/history.jsonl (в git не попадает).

import fs from 'node:fs';
import path from 'node:path';
import { resolvePath, readText, ensureDir } from './util.js';

const HISTORY_FILE = resolvePath('data', 'history.jsonl');

export function readHistory() {
  const text = readText(HISTORY_FILE, '');
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

export function appendHistory(record) {
  ensureDir(path.dirname(HISTORY_FILE));
  fs.appendFileSync(HISTORY_FILE, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

/** Когда последний раз выходил пост с таким банком и рубрикой */
export function lastPublished(bankId, rubricId) {
  const records = readHistory().filter(
    (record) => record.bank_id === bankId && record.rubric === rubricId && record.kind !== 'generated',
  );
  if (!records.length) return null;
  return records.reduce((latest, record) =>
    new Date(record.at) > new Date(latest.at) ? record : latest,
  );
}
