#!/usr/bin/env node
// Командная строка агента. Каждая команда — один шаг пайплайна:
// fetch -> generate -> checks -> preview (панель) -> publish

import { loadEnvFile, parseArgs, resolvePath, isFresh, daysSince } from './util.js';
import { listBanks, findBank, loadFacts } from './bank.js';
import { loadRubrics } from './config.js';
import {
  buildPost,
  listPosts,
  loadPost,
  pickTopic,
  recheckPost,
  checksSummary,
  savePost,
} from './generate.js';
import { fetchAll, fetchBank, formatFetchReport } from './fetch.js';
import { publishPost } from './publish.js';
import { vkCheck, vkReadiness } from './vk.js';
import { startServer } from './preview.js';

loadEnvFile();

const HELP = `VK Agent — агент ведения группы ВКонтакте

  npm run fetch -- --bank alfa [--offline] [--all]
      Собрать факты со страниц банка. --offline — разобрать тестовые фикстуры.

  npm run generate -- --bank alfa --rubric karta [--topic kak-vybrat-kartu] [--variant 1]
      Собрать пост: банк + рубрика + факты + тема журнала.

  npm run topic -- --bank alfa --rubric karta
      Показать, какая тема журнала будет взята и почему.

  npm run checks [--id 2026-10-04-alfa-karta]
      Состояние очереди постов и разбор проверок.

  npm run preview
      Панель превью в браузере (полуавтомат: собрать -> посмотреть -> опубликовать).

  npm run publish -- --id <id> [--live] [--schedule 2026-10-05T10:00]
      Публикация. Без --live это сухой прогон: в ВК ничего не уходит.

  npm run status
      Проверка ключа ВК, групп и базы фактов.

Рубрики: ${loadRubrics().map((rubric) => rubric.id).join(', ')}
Банки:   ${listBanks().map((bank) => bank.id).join(', ')}
`;

const STATUS_MARK = { ready: '✓ готов', warn: '! предупреждения', blocked: '✗ заблокирован', 'needs-data': '… нужны данные', published: '→ опубликован', draft: '· черновик' };

function printPost(post) {
  console.log('─'.repeat(70));
  console.log(`Пост ${post.id} · ${post.bank_name} · ${post.rubric_name} · вариант ${post.variant}`);
  console.log(`Тема журнала: ${post.topic_title ?? '—'}${post.topic_id ? ` (${post.topic_id})` : ''}`);
  console.log(`Статус: ${STATUS_MARK[post.status] ?? post.status}`);
  console.log('─'.repeat(70));
  console.log(post.text);
  console.log('─'.repeat(70));
  console.log(`Фактов в посте: ${post.facts.length} · символов: ${post.text.length}`);
  if (post.missing_required.length) {
    console.log(`Не хватает фактов: ${post.missing_required.join(', ')}`);
    console.log(`Собери данные: npm run fetch -- --bank ${post.bank_id}`);
  }
  for (const error of post.checks.errors) console.log(`  ОШИБКА: ${error.message}`);
  for (const warning of post.checks.warnings) console.log(`  предупреждение: ${warning.message}`);
  if (!post.checks.errors.length && !post.checks.warnings.length) console.log('  Проверки пройдены без замечаний.');
  console.log('─'.repeat(70));
}

function factsReport(bankQuery) {
  const banks = bankQuery ? [findBank(bankQuery)].filter(Boolean) : listBanks();
  for (const bank of banks) {
    const data = loadFacts(bank.id);
    const facts = Object.entries(data.facts ?? {});
    console.log(`${bank.name} (${bank.id}): фактов ${facts.length}, обновлено ${data.updated ?? 'никогда'}`);
    for (const [key, fact] of facts) {
      const fresh = isFresh(fact.date, 30);
      const age = daysSince(fact.date);
      console.log(`   ${key.padEnd(18)} ${String(fact.value).slice(0, 60).padEnd(62)} ${fact.date ?? '—'}${fresh ? '' : ` (${age} дн., устарел)`}`);
    }
  }
}

async function main() {
  const args = parseArgs();
  const command = args._[0] ?? 'help';

  switch (command) {
    case 'fetch': {
      if (args.all) {
        const reports = await fetchAll({ offline: Boolean(args.offline) });
        for (const report of reports) console.log(formatFetchReport(report), '\n');
        break;
      }
      const bankQuery = args.bank ?? args._[1];
      if (!bankQuery) throw new Error('Укажи банк: npm run fetch -- --bank alfa');
      const report = await fetchBank(bankQuery, { offline: Boolean(args.offline) });
      console.log(formatFetchReport(report));
      break;
    }

    case 'topic': {
      const rubric = args.rubric ?? 'karta';
      const topic = pickTopic(rubric, args.topic ?? null);
      if (!topic) {
        console.log('Тем журнала нет — добавь файл в knowledge/journal/');
        break;
      }
      console.log(`Для рубрики «${rubric}» выбрана тема: ${topic.title}`);
      console.log(`Файл: ${topic.file}`);
      console.log(`В тему попадают рубрики: ${topic.rubrics.join(', ') || '—'}`);
      break;
    }

    case 'generate': {
      const post = buildPost({
        bank: args.bank ?? args._[1],
        rubric: args.rubric ?? null,
        text: args._.slice(1).join(' '),
        topic: args.topic ?? null,
        variant: Number.parseInt(args.variant ?? '0', 10) || 0,
        ttlDays: Number.parseInt(args.ttl ?? '30', 10) || 30,
        note: args.note ?? null,
      });
      if (args.json) {
        console.log(JSON.stringify(post, null, 2));
        break;
      }
      printPost(post);
      console.log(`Файл: queue/${post.id}.json`);
      break;
    }

    case 'checks': {
      if (args.id) {
        const post = loadPost(args.id);
        if (!post) throw new Error(`Пост ${args.id} не найден`);
        printPost(recheckPost(post));
        break;
      }
      const summary = checksSummary();
      console.log(`Постов в очереди: ${summary.total}`);
      for (const [status, count] of Object.entries(summary.by_status)) {
        console.log(`   ${STATUS_MARK[status] ?? status}: ${count}`);
      }
      for (const post of summary.posts) {
        console.log(`   ${post.id.padEnd(34)} ${String(post.bank_name).padEnd(14)} ${String(post.rubric_name).padEnd(28)} ошибок ${post.errors}, предупреждений ${post.warnings}`);
      }
      break;
    }

    case 'preview': {
      startServer({
        port: Number.parseInt(args.port ?? '0', 10) || undefined,
        host: args.host ?? undefined,
      });
      break;
    }

    case 'publish': {
      if (!args.id && args._.length > 1) args.id = args._[1];
      if (!args.id) {
        const ready = listPosts({ limit: 50 }).filter((post) => post.status === 'ready');
        if (!ready.length) throw new Error('Готовых постов нет. Собери: npm run generate -- --bank alfa --rubric karta');
        args.id = ready[0].id;
        console.log(`Публикую самый свежий готовый пост: ${args.id}`);
      }
      const post = recheckPost(loadPost(args.id));
      if (!post) throw new Error(`Пост ${args.id} не найден`);
      const result = await publishPost(post, {
        dryRun: !args.live,
        schedule: args.schedule ?? null,
      });
      if (result.dry_run) {
        console.log('Сухой прогон: пост готов, в ВК ничего не ушло. Добавь --live для публикации.');
        console.log(`   длина текста: ${result.would_publish.message_length} символов`);
        if (result.would_publish.scheduled) console.log(`   отложено до: ${result.would_publish.scheduled}`);
      } else if (result.skipped) {
        console.log(result.reason);
      } else {
        console.log(`Опубликовано: ${result.url}`);
      }
      break;
    }

    case 'status': {
      const vk = await vkCheck();
      console.log('ВКонтакте:');
      if (!vk.ready) {
        for (const problem of vk.problems) console.log(`   ✗ ${problem}`);
        console.log('   Подсказка: скопируй .env.example в .env и заполни два поля.');
      } else if (vk.ok) {
        console.log(`   ✓ ключ рабочий, группа «${vk.group_name}», подписчиков ${vk.members_count ?? '—'}`);
      } else {
        console.log(`   ✗ ${vk.error}`);
      }
      console.log('\nФакты:');
      factsReport(args.bank ?? null);
      const summary = checksSummary();
      console.log(`\nОчередь: постов ${summary.total}`);
      break;
    }

    case 'env': {
      const readiness = vkReadiness();
      console.log(JSON.stringify(readiness, null, 2));
      console.log(`.env найден: ${resolvePath('.env')}`);
      break;
    }

    default:
      console.log(HELP);
  }
}

main().catch((error) => {
  console.error(`Ошибка: ${error.message}`);
  process.exitCode = 1;
});
