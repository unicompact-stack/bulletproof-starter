// Реестр экстракторов тематик. Профиль сам указывает, какой файл его разбирает.
//
// Требование к экстрактору минимальное: экспортировать factsFromHtml(html, source) →
// { ключ: факт }. Всё остальное необязательно: newsFromHtml нужен только рубрике «новость».

import * as banks from './banks.js';
import * as vacancies from './vacancies.js';

const EXTRACTORS = { banks, vacancies };

export function extractorNames() {
  return Object.keys(EXTRACTORS);
}

export function getExtractor(name) {
  const extractor = EXTRACTORS[name];
  if (!extractor) {
    throw new Error(
      `Экстрактор «${name}» не найден. Есть: ${extractorNames().join(', ')}. Создай src/extractors/${name}.js и добавь его в src/extractors/index.js.`,
    );
  }
  return extractor;
}
