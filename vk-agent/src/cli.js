#!/usr/bin/env node
// Командная строка агента. Каждая команда — один шаг пайплайна:
// fetch -> generate -> checks -> preview (панель) -> publish
//
// Тематика выбирается флагом --profile или переменной PROFILE в .env,
// площадки — в channels/channels.json.

import { loadEnvFile, parseArgs, resolvePath, isFresh, daysSince, env } from './util.js';
import { listSubjects, findSubject, loadFacts } from './subject.js';
import { loadRubrics, loadProfile, resolveProfileId } from './config.js';
import { listProfiles } from './profile.js';
import {
  buildPost,
  listPosts,
  loadPost,
  pickTopic,
  recheckPost,
  checksSummary,
} from './generate.js';
import { fetchAll, fetchSubject, formatFetchReport } from './fetch.js';
import { publishPost } from './publish.js';
import { channelCheck, channelReadiness, listChannels, enabledChannelIds } from './channels/index.js';
import { startServer } from './preview.js';

loadEnvFile();

const STATUS_MARK = {
  ready: '✓ готов',
  warn: '! предупреждения',
  blocked: '✗ заблокирован',
  'needs-data': '… нужны данные',
  published: '→ опубликован',
  draft: '· черновик',
};

function help() {
  const active = resolveProfileId();
  const profile = loadProfile(active);
  return `Content Agent — агент контента для соцсетей

Тематика сейчас: ${profile.name} (${active}).
Сменить: --profile <id> или PROFILE=<id> в .env. Доступные: ${listProfiles()
    .map((item) => item.id)
    .join(', ')}
Объекты: «${profile.subject_label}». Рубрики: ${loadRubrics()
    .map((rubric) => rubric.id)
    .join(', ')}

  npm run fetch -- --subject <${profile.subject_label.toLowerCase()}> [--offline] [--all]
      Собрать факты со страниц. --offline — разобрать тестовые фикстуры.

  npm run generate -- --subject <x> --rubric <rubric> [--topic <id>] [--variant 1]
      Собрать пост: объект + рубрика + факты + тема журнала.
      «--subject» можно опустить, если в тематике один объект.

  npm run topic -- --rubric <rubric>
      Показать, какая тема журнала будет взята и почему.

  npm run checks [--id <id>]
      Состояние очереди постов и разбор проверок.

  npm run preview
      Панель превью в браузере (полуавтомат: собрать -> посмотреть -> опубликовать).

  npm run publish -- --id <id> [--live] [--channels vk,telegram] [--schedule 2026-10-05T10:00]
      Публикация на площадки. Без --live это сухой прогон: ничего никуда не уходит.

  npm run status
      Готовность площадок, ключи и база фактов.

  npm run profiles
      Список тематик и площадок.
`;
}

function printPost(post) {
  console.log('─'.repeat(70));
  console.log(`Пост ${post.id} · ${post.subject_name} · ${post.rubric_name} · вариант ${post.variant}`);
  console.log(`Тема журнала: ${post.topic_title ?? '—'}${post.topic_id ? ` (${post.topic_id})` : ''}`);
  console.log(`Статус: ${STATUS_MARK[post.status] ?? post.status}`);
  console.log('─'.repeat(70));
  console.log(post.text);
  console.log('─'.repeat(70));
  console.log(`Фактов в посте: ${post.facts.length} · символов: ${post.text.length}`);
  if (post.missing_required.length) {
    console.log(`Не хватает фактов: ${post.missing_required.join(', ')}`);
    console.log(`Собери данные: npm run fetch -- --subject ${post.subject_id}`);
  }
  for (const error of post.checks.errors) console.log(`  ОШИБКА: ${error.message}`);
  for (const warning of post.checks.warnings) console.log(`  предупреждение: ${warning.message}`);
  if (!post.checks.errors.length && !post.checks.warnings.length) console.log('  Проверки пройдены без замечаний.');
  console.log('─'.repeat(70));
}

function factsReport(subjectQuery, profile) {
  const active = loadProfile(profile);
  const subjects = subjectQuery ? [findSubject(subjectQuery, profile)].filter(Boolean) : listSubjects(profile);
  for (const subject of subjects) {
    const data = loadFacts(subject.id, profile);
    const facts = Object.entries(data.facts ?? {});
    console.log(`${subject.name} (${subject.id}): фактов ${facts.length}, обновлено ${data.updated ?? 'никогда'}`);
    for (const [key, fact] of facts) {
      const fresh = isFresh(fact.date, 30);
      const age = daysSince(fact.date);
      console.log(
        `   ${key.padEnd(18)} ${String(fact.value).slice(0, 60).padEnd(62)} ${fact.date ?? '—'}${fresh ? '' : ` (${age} дн., устарел)`}`,
      );
    }
  }
  if (!subjects.length) console.log(`Объектов в профиле «${active.id}» нет.`);
}

async function main() {
  const args = parseArgs();
  const command = args._[0] ?? 'help';
  const profile = args.profile ?? null;

  switch (command) {
    case 'fetch': {
      if (args.all) {
        const reports = await fetchAll({ offline: Boolean(args.offline), profile });
        for (const report of reports) console.log(formatFetchReport(report), '\n');
        break;
      }
      const subjectQuery = args.subject ?? args.bank ?? args._[1];
      if (!subjectQuery) {
        throw new Error(`Укажи объект: npm run fetch -- --subject <id>. Список — profiles/${resolveProfileId(profile)}/subjects.json`);
      }
      const report = await fetchSubject(subjectQuery, { offline: Boolean(args.offline), profile });
      console.log(formatFetchReport(report));
      break;
    }

    case 'topic': {
      const rubric = args.rubric ?? 'karta';
      const topic = pickTopic(rubric, args.topic ?? null, { profile });
      if (!topic) {
        console.log('Тем журнала нет — добавь файл в profiles/<профиль>/journal/');
        break;
      }
      console.log(`Для рубрики «${rubric}» выбрана тема: ${topic.title}`);
      console.log(`Файл: ${topic.file}`);
      console.log(`В тему попадают рубрики: ${topic.rubrics.join(', ') || '—'}`);
      break;
    }

    case 'generate': {
      const post = buildPost({
        subject: args.subject ?? args.bank ?? args._[1],
        rubric: args.rubric ?? null,
        text: args._.slice(1).join(' '),
        topic: args.topic ?? null,
        variant: Number.parseInt(args.variant ?? '0', 10) || 0,
        ttlDays: Number.parseInt(args.ttl ?? env('FACT_TTL_DAYS', '30'), 10) || 30,
        note: args.note ?? null,
        profile,
      });
      if (args.json) {
        console.log(JSON.stringify(post, null, 2));
        break;
      }
      printPost(post);
      console.log(`Файл: queue/${post.profile}/${post.id}.json`);
      break;
    }

    case 'checks': {
      if (args.id) {
        const post = loadPost(args.id, profile);
        if (!post) throw new Error(`Пост ${args.id} не найден`);
        printPost(recheckPost(post, { profile }));
        break;
      }
      const summary = checksSummary({ profile });
      console.log(`Постов в очереди: ${summary.total}`);
      for (const [status, count] of Object.entries(summary.by_status)) {
        console.log(`   ${STATUS_MARK[status] ?? status}: ${count}`);
      }
      for (const post of summary.posts) {
        console.log(
          `   ${post.id.padEnd(34)} ${String(post.subject_name).padEnd(14)} ${String(post.rubric_name).padEnd(28)} ошибок ${post.errors}, предупреждений ${post.warnings}`,
        );
      }
      break;
    }

    case 'preview': {
      startServer({
        port: Number.parseInt(args.port ?? '0', 10) || undefined,
        host: args.host ?? undefined,
        profile,
      });
      break;
    }

    case 'publish': {
      if (!args.id && args._.length > 1) args.id = args._[1];
      if (!args.id) {
        const ready = listPosts({ limit: 50, profile }).filter((post) => post.status === 'ready');
        if (!ready.length) {
          throw new Error(
            'Готовых постов нет. Собери: npm run generate -- --subject <id> --rubric <rubric>',
          );
        }
        args.id = ready[0].id;
        console.log(`Публикую самый свежий готовый пост: ${args.id}`);
      }
      const post = loadPost(args.id, profile);
      if (!post) throw new Error(`Пост ${args.id} не найден`);
      const channels = typeof args.channels === 'string' ? args.channels.split(',').map((item) => item.trim()) : null;
      const result = await publishPost(recheckPost(post, { profile }), {
        dryRun: !args.live,
        schedule: args.schedule ?? null,
        channels,
        profile,
      });
      if (result.dry_run) {
        console.log('Сухой прогон: пост готов, наружу ничего не ушло. Добавь --live для публикации.');
        for (const item of result.channels) {
          console.log(
            `   ${item.channel_name.padEnd(14)} ${item.status.padEnd(34)} ${item.message_length ?? '—'} симв.${item.max_length ? ` / лимит ${item.max_length}` : ''}`,
          );
        }
        if (result.would_publish.scheduled) console.log(`   отложено до: ${result.would_publish.scheduled}`);
      } else if (result.skipped) {
        console.log(result.reason);
      } else {
        for (const item of result.channels) {
          const mark = item.status === 'error' ? '✗' : '✓';
          console.log(`   ${mark} ${item.channel_name}: ${item.status}${item.error ? ` — ${item.error}` : ''}${item.url ? ` — ${item.url}` : ''}`);
        }
        if (result.partial) console.log('Часть площадок не приняла публикацию — разберись до следующего поста.');
      }
      break;
    }

    case 'status': {
      const active = loadProfile(profile);
      console.log(`Тематика: ${active.name} (${active.id})\n`);
      console.log('Площадки:');
      for (const channel of listChannels()) {
        const readiness = channelReadiness(channel.id);
        const mark = readiness.ready ? '✓' : channel.enabled ? '✗' : '–';
        console.log(`   ${mark} ${channel.name} (${channel.id}): ${readiness.problems?.[0] ?? 'готова'}`);
      }

      const vk = await channelCheck('vk');
      if (vk.ok) {
        console.log(`\nВКонтакте: ключ рабочий, группа «${vk.group_name}», подписчиков ${vk.members_count ?? '—'}`);
      } else if (vk.error) {
        console.log(`\nВКонтакте: ✗ ${vk.error}`);
      } else {
        console.log('\nВКонтакте: ключ не настроен — скопируй .env.example в .env и заполни два поля.');
      }

      console.log('\nФакты:');
      factsReport(args.subject ?? args.bank ?? null, profile);
      const summary = checksSummary({ profile });
      console.log(`\nОчередь: постов ${summary.total}`);
      break;
    }

    case 'profiles': {
      console.log('Тематики:');
      const activeId = resolveProfileId(profile);
      for (const item of listProfiles()) {
        const mark = item.id === activeId ? '→' : ' ';
        console.log(`  ${mark} ${item.id.padEnd(14)} ${item.name} (объект: ${item.subject_label})`);
      }
      console.log('\nПлощадки:');
      for (const channel of listChannels()) {
        const mark = channel.enabled ? '✓' : '–';
        const state = channel.implemented ? 'работает' : 'заглушка (адаптера нет)';
        console.log(`  ${mark} ${channel.id.padEnd(10)} ${channel.name.padEnd(12)} ${state}, лимит ${channel.max_length}`);
      }
      console.log(`\nАктивные площадки: ${enabledChannelIds().join(', ') || 'нет'}`);
      break;
    }

    case 'env': {
      console.log(JSON.stringify(Object.fromEntries(channelReadiness('vk') ? [['vk', channelReadiness('vk')]] : []), null, 2));
      console.log(`.env найден: ${resolvePath('.env')}`);
      break;
    }

    default:
      console.log(help());
  }
}

main().catch((error) => {
  console.error(`Ошибка: ${error.message}`);
  process.exitCode = 1;
});
