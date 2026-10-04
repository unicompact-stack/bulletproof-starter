// Простой шаблонизатор без зависимостей.
// Поддерживает: {{переменная}}, {{#блок}}...{{/блок}} и {{.}} внутри блока.

/**
 * @param {string} template текст шаблона
 * @param {Object} context переменные: строки или массивы
 * @returns {{text: string, missing: string[]}}
 */
export function render(template, context) {
  const missing = [];
  let text = expandBlocks(String(template), context, missing);

  text = text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, key) => {
    const value = readPath(context, key);
    if (value === undefined || value === null || value === '') {
      missing.push(key);
      return '';
    }
    return String(value);
  });

  // подчистить пустые строки, оставшиеся от незаполненных плейсхолдеров
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    // список фактов идёт подряд, без пустых строк между пунктами
    .replace(/\n\n(?=\s*•)/g, '\n')
    .trim();

  return { text, missing };
}

function expandBlocks(template, context, missing) {
  const blockRe = /\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  let previous = null;
  let current = template;
  // блоки могут быть вложенными — повторяем, пока есть что раскрывать
  while (previous !== current) {
    previous = current;
    current = current.replace(blockRe, (whole, key, body) => {
      const value = readPath(context, key);
      if (value === undefined || value === null) {
        missing.push(key);
        return '';
      }
      if (Array.isArray(value)) {
        if (!value.length) return '';
        return value
          .map((item) =>
            typeof item === 'object' && item !== null
              ? body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, path) => {
                  const inner = readPath(item, path);
                  return inner === undefined || inner === null ? '' : String(inner);
                })
              : body.replace(/\{\{\s*\.\s*\}\}/g, String(item)),
          )
          .join('');
      }
      if (typeof value === 'object') {
        return value.text ?? '';
      }
      return value ? body : '';
    });
  }
  return current;
}

export function readPath(object, path) {
  return String(path)
    .split('.')
    .reduce((acc, part) => (acc === undefined || acc === null ? undefined : acc[part]), object);
}
