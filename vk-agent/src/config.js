// Загрузка конфигов проекта. Один модуль — чтобы не было циклических импортов.

import { resolvePath, readJson } from './util.js';

export function loadRubrics() {
  return readJson(resolvePath('config', 'rubrics.json'), { rubrics: [] }).rubrics ?? [];
}

export function loadHooks() {
  return readJson(resolvePath('config', 'hooks.json'), {});
}

export function loadBodies() {
  return readJson(resolvePath('config', 'bodies.json'), {});
}

export function loadDisclaimers() {
  return readJson(resolvePath('config', 'disclaimers.json'), {});
}

export function loadStopwords() {
  return readJson(resolvePath('config', 'stopwords.json'), { block: [], warn: [] });
}

export function loadChannels() {
  return readJson(resolvePath('config', 'channels.json'), { channels: {} });
}
