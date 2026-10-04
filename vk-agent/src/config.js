// Загрузка настроек текущего профиля. Один модуль — чтобы не было циклических импортов.
// Каждая функция читает файл из profiles/<активный>/ и возвращает данные,
// уже приведённые к безопасному виду (пустой массив вместо undefined).

import { loadProfile, profileJson, profilePaths, resolveProfileId } from './profile.js';

export { loadProfile, profilePaths, resolveProfileId };

export function activeProfileId() {
  return resolveProfileId();
}

export function loadRubrics(profile = null) {
  return profileJson(profile, 'rubrics.json', { rubrics: [] }).rubrics ?? [];
}

export function loadHooks(profile = null) {
  return profileJson(profile, 'hooks.json', {});
}

export function loadBodies(profile = null) {
  return profileJson(profile, 'bodies.json', {});
}

export function loadDisclaimers(profile = null) {
  return profileJson(profile, 'disclaimers.json', {});
}

export function loadStopwords(profile = null) {
  return profileJson(profile, 'stopwords.json', { block: [], warn: [] });
}

export function findRubric(id, profile = null) {
  return loadRubrics(profile).find((rubric) => rubric.id === id) ?? null;
}
