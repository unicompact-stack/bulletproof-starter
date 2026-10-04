// Сборка поста: банк + рубрика + тема журнала + факты -> готовый текст.
// Пока без ИИ: текст собирается по шаблонам (templates/) и каркасу (config/bodies.json).
// ИИ подключается позже и заменяет только «формулировки», факты остаются те же.

import fs from 'node:fs';
import path from 'node:path';
import {
  resolvePath,
  readJson,
  readText,
  writeText,
  parseArgs,
  todayISO,
  nowISO,
  slugify,
} from './util.js';
import { findBank, loadFacts, factsForRubric } from './bank.js';
import { loadBodies, loadDisclaimers, loadHooks, loadRubrics } from './config.js';
import { readHistory, appendHistory } from './history.js';
import { render } from './render.js';
import { runChecks } from './checks.js';

export const QUEUE_DIR = resolvePath('queue');
export const JOURNAL_DIR = resolvePath('knowledge', 'journal');
export const TEMPLATES_DIR = resolvePath('templates');

// Загрузчики конфигов живут в config.js, здесь только переэкспорт для удобства.
export { loadBodies, loadDisclaimers, loadHooks, loadRubrics, loadStopwords } from './config.js';

/** Определить рубрику по тексту команды («пост про карты») или по банку */
export function detectRubric(text, banks = []) {
  const rubrics = loadRubrics();
  const haystack = String(text ?? '').toLowerCase();
  if (haystack) {
    const scored = rubrics
      .map((rubric) => ({
        rubric,
        score: (rubric.keywords ?? []).reduce(
          (sum, keyword) => sum + (haystack.includes(keyword.toLowerCase()) ? keyword.length : 0),
          0,
        ),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored.length) return scored[0].rubric;
  }
  return null;
}

/** Темы журнала: читаем markdown-файлы с front-matter */
export function loadTopics() {
  if (!fs.existsSync(JOURNAL_DIR)) return [];
  return fs
    .readdirSync(JOURNAL_DIR)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const raw = readText(path.join(JOURNAL_DIR, file), '');
      const front = /^---\n([\s\S]*?)\n---/.exec(raw);
      const meta = {};
      if (front) {
        for (const line of front[1].split('\n')) {
          const eq = line.indexOf(':');
          if (eq === -1) continue;
          const key = line.slice(0, eq).trim();
          let value = line.slice(eq + 1).trim();
          if (value.startsWith('[') && value.endsWith(']')) {
            value = value
              .slice(1, -1)
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean);
          }
          meta[key] = value;
        }
      }
      return {
        file,
        file_path: path.join(JOURNAL_DIR, file),
        topic_id: meta.topic_id ?? slugify(file.replace(/\.md$/, '')),
        title: meta.title ?? file,
        rubrics: Array.isArray(meta.rubrics) ? meta.rubrics : [],
        frequency: meta.frequency ?? null,
        body: raw,
      };
    });
}

export { readHistory, appendHistory } from './history.js';

/** Тема журнала для рубрики: та, что дольше всех не использовалась */
export function pickTopic(rubricId, requestedTopicId = null) {
  const topics = loadTopics();
  if (requestedTopicId) {
    const exact = topics.find((topic) => topic.topic_id === requestedTopicId);
    if (exact) return exact;
  }
  const matching = topics.filter((topic) => (topic.rubrics ?? []).includes(rubricId));
  const pool = matching.length ? matching : topics;
  if (!pool.length) return null;
  const history = readHistory();
  const lastUsed = (topic) => {
    const records = history.filter((record) => record.topic_id === topic.topic_id);
    if (!records.length) return -1;
    return Math.max(...records.map((record) => new Date(record.at).getTime()));
  };
  // Точность важнее очерёдности: тема, где рубрика главная и узкая, подходит лучше общей.
  const specificity = (topic) => {
    const rubrics = topic.rubrics ?? [];
    const primary = rubrics[0] === rubricId ? 0 : 10;
    return primary + rubrics.length;
  };
  return [...pool].sort(
    (a, b) => specificity(a) - specificity(b) || lastUsed(a) - lastUsed(b) || a.file.localeCompare(b.file),
  )[0];
}

/**
 * Подставить значения фактов в формулировки вида «Кэшбэк до {cashback_rate}».
 * Синтаксис с одним слэшем — для строк из config/, с двумя ({{...}}) — для файлов templates/.
 * Если факта нет, плейсхолдер остаётся в тексте: проверка это заметит и заблокирует пост.
 */
function fillFacts(text, available) {
  return String(text ?? '').replace(/\{([\w.]+)\}/g, (whole, key) =>
    available[key] !== undefined ? String(available[key]) : whole,
  );
}

function placeholdersIn(text) {
  return [...String(text ?? '').matchAll(/\{([\w.]+)\}/g)].map((m) => m[1]);
}

function rotate(list, variant) {
  if (!list.length) return list;
  const shift = ((variant % list.length) + list.length) % list.length;
  return [...list.slice(shift), ...list.slice(0, shift)];
}

function pickFromPatterns(patterns, available, variant) {
  const usable = (patterns ?? []).filter((pattern) => (pattern.needs ?? []).every((key) => available[key]));
  const pool = usable.length ? usable : (patterns ?? []).filter((pattern) => (pattern.needs ?? []).length === 0);
  if (!pool.length) return null;
  return rotate(pool, variant)[0];
}

function displayDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

/**
 * Собрать пост.
 * @param {Object} options
 * @param {string} options.bank название, id или псевдоним банка
 * @param {string} [options.rubric] id рубрики, если не указана — определяется по тексту
 * @param {string} [options.text] текст команды («размести пост про карты»)
 * @param {string} [options.topic] id темы журнала
 * @param {number} [options.variant] номер варианта: сдвигает хук, призыв и абзацы
 * @param {number} [options.ttlDays] срок свежести факта
 * @param {boolean} [options.dryRun] не сохранять в очередь
 */
export function buildPost(options = {}) {
  const {
    bank: bankQuery,
    rubric: rubricId = null,
    text = '',
    topic: topicId = null,
    variant = 0,
    ttlDays = 30,
    note = null,
    dryRun = false,
  } = options;

  const bank = findBank(bankQuery);
  if (!bank) throw new Error(`Банк не найден: «${bankQuery}». Список — config/banks.json`);

  const rubrics = loadRubrics();
  const rubric = (rubricId ? rubrics.find((item) => item.id === rubricId) : null) ?? detectRubric(text);
  if (!rubric) throw new Error('Не понял рубрику. Укажи: --rubric karta|kreditka|vklad|akciya|novost');

  const topic = pickTopic(rubric.id, topicId);
  const hooksConfig = loadHooks()[rubric.id] ?? {};
  const bodies = loadBodies()[rubric.id] ?? {};
  const disclaimers = loadDisclaimers();
  const factsData = loadFacts(bank.id);

  const available = {};
  for (const key of Object.keys(factsData.facts ?? {})) {
    const fact = factsData.facts[key];
    if (fact?.value) available[key] = fact.value;
  }

  const hookPattern = pickFromPatterns(hooksConfig.hooks, available, variant);
  const ctaPattern = pickFromPatterns(
    (hooksConfig.cta ?? []).map((item) => (typeof item === 'string' ? { needs: [], text: item } : item)),
    available,
    variant,
  );
  if (!hookPattern) throw new Error(`Нет ни одного шаблона хука для рубрики «${rubric.id}» (config/hooks.json)`);

  const hookText = fillFacts(hookPattern.text, available);
  const ctaText = ctaPattern ? fillFacts(ctaPattern.text, available) : '';
  const leadText = fillFacts(bodies.lead ?? '', available);

  const allParagraphs = bodies.paragraphs ?? [];
  const usableParagraphs = allParagraphs.filter((paragraph) =>
    placeholdersIn(paragraph).every((key) => available[key] !== undefined || key === 'bank_name'),
  );
  const bodyParagraphs = rotate(usableParagraphs, variant)
    .slice(0, 3)
    .map((paragraph) => fillFacts(paragraph, available));

  // какие факты показываем: обязательные для рубрики + те, что попали в выбранные формулировки
  const usedKeys = new Set([
    ...(rubric.required_facts ?? []),
    ...placeholdersIn([hookPattern.text, ctaPattern?.text, bodies.lead, ...bodyParagraphs].join(' ')),
  ]);

  const factEntries = factsForRubric(bank.id, rubric.id, {
    required: rubric.required_facts ?? [],
    extra: [...usedKeys],
    ttlDays,
  });

  const facts = factEntries.map((fact) => {
    const date_display = displayDate(fact.date);
    return {
      ...fact,
      date_display,
      // дата проверки стоит рядом с цифрой: без неё проверка заблокирует пост
      line: `• ${fact.label} — ${fact.value}${date_display ? ` (проверено ${date_display})` : ''}`,
    };
  });

  const missingRequired = (rubric.required_facts ?? []).filter(
    (key) => !facts.some((fact) => fact.key === key),
  );

  const disclaimerConfig = disclaimers[rubric.disclaimer] ?? null;
  const disclaimer = disclaimerConfig?.text ?? '';
  const hashtags = (bank.hashtags ?? []).join(' ');

  const templatePath = path.join(TEMPLATES_DIR, rubric.template ?? 'karta.md');
  const template = readText(templatePath, '# {{bank_name}}\n\n{{hook}}\n\n{{#facts}}\n{{line}}\n{{/facts}}\n');
  const rendered = render(template, {
    bank_name: bank.name,
    hook: hookText,
    lead: leadText,
    cta: ctaText,
    disclaimer,
    hashtags,
    facts,
    body: bodyParagraphs,
  });

  const id = `${todayISO()}-${bank.id}-${rubric.id}`;
  const post = {
    id,
    created: nowISO(),
    variant,
    note: note ?? null,
    status: 'draft',
    bank_id: bank.id,
    bank_name: bank.name,
    bank_link: bank.link,
    rubric: rubric.id,
    rubric_name: rubric.name,
    topic_id: topic?.topic_id ?? null,
    topic_title: topic?.title ?? null,
    hook_source: hookPattern.text,
    cta_source: ctaPattern?.text ?? null,
    facts: facts.map(({ line, date_display, ...rest }) => ({ ...rest, line, date_display })),
    fact_lines: facts.map((fact) => fact.line),
    body: bodyParagraphs,
    text: rendered.text,
    missing_required: missingRequired,
    missing_placeholders: rendered.missing,
    disclaimer_kind: rubric.disclaimer,
    hashtags: bank.hashtags ?? [],
    ads: false,
  };

  post.checks = runChecks(post);

  if (post.missing_required.length) post.status = 'needs-data';
  else if (post.checks.errors.length) post.status = 'blocked';
  else post.status = 'ready';

  if (!dryRun) {
    savePost(post);
    appendHistory({
      kind: 'generated',
      id: post.id,
      bank_id: post.bank_id,
      rubric: post.rubric,
      topic_id: post.topic_id,
      variant,
      at: post.created,
    });
  }
  return post;
}

export function postFile(id) {
  return path.join(QUEUE_DIR, `${id}.json`);
}

export function savePost(post, { replace = true } = {}) {
  const file = postFile(post.id);
  const draft = { ...post, saved_at: nowISO() };
  if (!replace && fs.existsSync(file)) {
    const suffix = Date.now().toString(36).slice(-4);
    draft.id = `${post.id}-${suffix}`;
  }
  writeText(file, `${JSON.stringify(draft, null, 2)}\n`);
  return draft;
}

export function loadPost(id) {
  return readJson(postFile(id), null);
}

export function listPosts({ limit = 20 } = {}) {
  if (!fs.existsSync(QUEUE_DIR)) return [];
  const files = fs
    .readdirSync(QUEUE_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .reverse();
  const posts = [];
  for (const file of files.slice(0, limit)) {
    const post = readJson(path.join(QUEUE_DIR, file), null);
    if (post) posts.push(post);
  }
  return posts;
}

/** Повторная проверка готового поста (после ручной правки текста) */
export function recheckPost(post) {
  const checked = { ...post, checks: runChecks(post) };
  if (post.missing_required?.length) checked.status = 'needs-data';
  else if (checked.checks.errors.length) checked.status = 'blocked';
  else checked.status = 'ready';
  return checked;
}

export function checksSummary() {
  const posts = listPosts({ limit: 50 });
  const byStatus = posts.reduce((acc, post) => {
    acc[post.status] = (acc[post.status] ?? 0) + 1;
    return acc;
  }, {});
  return {
    total: posts.length,
    by_status: byStatus,
    posts: posts.slice(0, 10).map((post) => ({
      id: post.id,
      bank_name: post.bank_name,
      rubric_name: post.rubric_name,
      status: post.status,
      created: post.created,
      errors: post.checks?.errors?.length ?? 0,
      warnings: post.checks?.warnings?.length ?? 0,
    })),
  };
}

export function parseGenerateArgs(argv) {
  const args = parseArgs(argv);
  return {
    bankQuery: args.bank ?? args._[0],
    rubricId: args.rubric ?? null,
    text: args._.slice(1).join(' ') || args.text || '',
    topicId: args.topic ?? null,
    variant: Number.parseInt(args.variant ?? '0', 10) || 0,
    ttlDays: Number.parseInt(args.ttl ?? '30', 10) || 30,
    note: args.note ?? null,
  };
}
