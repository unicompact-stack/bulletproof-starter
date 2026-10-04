// Профиль тематики. Отвечает на вопрос «о чём вообще этот агент сейчас пишет».
//
// Всё, что зависит от тематики, лежит в profiles/<id>/: объекты (банки, работодатели,
// товары), рубрики, формулировки, оговорки, стоп-слова, шаблоны, темы журнала.
// Переключение тематики = смена одной переменной PROFILE, а не правка кода.
//
// Данные, которые меняются во время работы, намеренно лежат отдельно от профиля:
//   data/<id>/facts/    — база фактов
//   data/<id>/history.jsonl — журнал сборок и публикаций
//   data/<id>/cache/    — последние загруженные страницы
//   queue/<id>/         — черновики постов
// Так в git попадает только настройка тематики, а не её наполнение.

import fs from 'node:fs';
import path from 'node:path';
import { resolvePath, readJson, readText, env, slugify } from './util.js';

export const PROFILES_DIR = resolvePath('profiles');
export const DEFAULT_PROFILE = 'banks';

/** Обязательные файлы профиля: без них тематика не запустится */
const REQUIRED_FILES = ['subjects.json', 'rubrics.json', 'hooks.json', 'bodies.json'];

export function profilesRoot() {
  return PROFILES_DIR;
}

export function listProfiles() {
  if (!fs.existsSync(PROFILES_DIR)) return [];
  return fs
    .readdirSync(PROFILES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const manifest = readJson(path.join(PROFILES_DIR, entry.name, 'profile.json'), {});
      return {
        id: entry.name,
        name: manifest.name ?? entry.name,
        subject_label: manifest.subject_label ?? 'Объект',
        extractor: manifest.extractor ?? null,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function profileDir(profileId) {
  return path.join(PROFILES_DIR, profileId);
}

/** Какой профиль активен: --profile в команде, иначе PROFILE в .env, иначе профиль по умолчанию */
export function resolveProfileId(explicit = null) {
  const id = explicit ?? env('PROFILE', '') ?? '';
  const value = id || DEFAULT_PROFILE;
  if (!fs.existsSync(profileDir(value))) {
    const available = listProfiles().map((item) => item.id).join(', ') || 'нет ни одной';
    throw new Error(
      `Профиль «${value}» не найден в profiles/. Доступные: ${available}. Создай папку profiles/${value}/ с profile.json и настройками.`,
    );
  }
  return value;
}

/**
 * Манифест профиля с проверкой комплектности.
 * Ошибка здесь понятная и перечисляет, чего не хватает, — иначе ошибка всплыла бы
 * через три модуля и через минуту, когда пост уже собран.
 */
export function loadProfile(explicit = null) {
  const id = resolveProfileId(explicit);
  const dir = profileDir(id);
  const manifest = readJson(path.join(dir, 'profile.json'), null);
  if (!manifest) {
    throw new Error(`В profiles/${id}/ нет файла profile.json — профиль не описан`);
  }
  const missing = REQUIRED_FILES.filter((file) => !fs.existsSync(path.join(dir, file)));
  if (missing.length) {
    throw new Error(`Профиль «${id}» не дополнен: нет файлов ${missing.join(', ')} в profiles/${id}/`);
  }
  return {
    id,
    name: manifest.name ?? id,
    subject_label: manifest.subject_label ?? 'Объект',
    subject_label_plural: manifest.subject_label_plural ?? `${manifest.subject_label ?? 'Объект'}ы`,
    description: manifest.description ?? '',
    extractor: manifest.extractor ?? null,
    dir,
    ...manifest,
  };
}

/** Все пути, зависящие от профиля. Один источник правды — чтобы не разъехалось. */
export function profilePaths(explicit = null) {
  const id = resolveProfileId(explicit);
  const dir = profileDir(id);
  return {
    id,
    dir,
    file: (name) => path.join(dir, name),
    templates: path.join(dir, 'templates'),
    journal: path.join(dir, 'journal'),
    knowledge: path.join(dir, 'knowledge'),
    data: resolvePath('data', id),
    facts: resolvePath('data', id, 'facts'),
    cache: resolvePath('data', id, 'cache'),
    history: resolvePath('data', id, 'history.jsonl'),
    queue: resolvePath('queue', id),
    // Фикстуры лежат рядом с тестированием, но по тематикам: у вакансий свои страницы
    fixtures: resolvePath('test', 'fixtures', id),
  };
}

/** Прочитать JSON из профиля. Один аргумент — имя файла, без пути. */
export function profileJson(explicit, name, fallback) {
  const paths = profilePaths(explicit);
  return readJson(paths.file(name), fallback);
}

/** Заметки по объектам тематики: knowledge/<объект>.md (тон, запреты) */
export function loadSubjectNotes(subjectId, explicit = null) {
  const paths = profilePaths(explicit);
  if (!subjectId) return null;
  const file = path.join(paths.knowledge, `${slugify(subjectId)}.md`);
  const text = readText(file, '');
  if (!text) return null;
  const front = /^---\n([\s\S]*?)\n---/.exec(text);
  const meta = {};
  if (front) {
    for (const line of front[1].split('\n')) {
      const eq = line.indexOf(':');
      if (eq === -1) continue;
      meta[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  }
  return { file, meta, body: text };
}
