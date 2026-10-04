// Панель превью: маленький HTTP-сервер на стандартной библиотеке, без зависимостей.
// Отдаёт страницу panel/page.html и JSON-API к ней.
// Полуавтомат: пост собирается здесь, наружу уходит только по кнопке «Опубликовать».
//
// Панель работает с активной тематикой (--profile / PROFILE) и всеми включёнными площадками.

import http from 'node:http';
import { env, envInt, readText, resolvePath, isFresh, daysSince, todayISO } from './util.js';
import { listSubjects, findSubject, loadFacts } from './subject.js';
import { loadRubrics, loadProfile } from './config.js';
import { listProfiles } from './profile.js';
import {
  buildPost,
  listPosts,
  loadPost,
  loadTopics,
  recheckPost,
  savePost,
  checksSummary,
} from './generate.js';
import { fetchSubject } from './fetch.js';
import { publishPost } from './publish.js';
import { allChannelsReadiness, enabledChannelIds, listChannels, strictestMaxLength } from './channels/index.js';

function json(response, status, data) {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function html(response, body) {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    // страница должна открываться и внутри превью-фрейма песочницы
    'X-Frame-Options': 'ALLOWALL',
  });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('Слишком большой запрос');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Тело запроса не JSON');
  }
}

function factsForPanel(subjectId, ttlDays = 30, profile = null) {
  const subject = findSubject(subjectId, profile);
  const data = loadFacts(subjectId, profile);
  const facts = {};
  for (const [key, fact] of Object.entries(data.facts ?? {})) {
    facts[key] = { ...fact, fresh: isFresh(fact.date, ttlDays), age_days: daysSince(fact.date) };
  }
  return {
    subject_id: subjectId,
    subject_name: subject?.name ?? subjectId,
    updated: data.updated,
    facts,
  };
}

export function createServer({ profile = null } = {}) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    const path = url.pathname;

    try {
      // --- страница ---
      if (request.method === 'GET' && (path === '/' || path === '/index.html')) {
        return html(response, readText(resolvePath('panel', 'page.html'), 'Панель не найдена'));
      }

      // --- состояние ---
      if (request.method === 'GET' && path === '/api/state') {
        const active = loadProfile(profile);
        return json(response, 200, {
          profile: { id: active.id, name: active.name, subject_label: active.subject_label },
          profiles: listProfiles(),
          subjects: listSubjects(profile).map((subject) => ({ id: subject.id, name: subject.name, link: subject.link })),
          rubrics: loadRubrics(profile).map((rubric) => ({ id: rubric.id, name: rubric.name })),
          topics: loadTopics(profile).map((topic) => ({
            topic_id: topic.topic_id,
            title: topic.title,
            rubrics: topic.rubrics,
          })),
          posts: checksSummary({ profile }).posts,
          channels: listChannels().map((channel) => ({
            id: channel.id,
            name: channel.name,
            enabled: Boolean(channel.enabled),
            implemented: channel.implemented !== false,
            max_length: channel.max_length ?? null,
          })),
          channels_state: allChannelsReadiness(),
          active_channels: enabledChannelIds(),
          max_length: strictestMaxLength(),
        });
      }

      if (request.method === 'GET' && path === '/api/facts') {
        return json(
          response,
          200,
          factsForPanel(url.searchParams.get('subject') ?? url.searchParams.get('bank'), 30, profile),
        );
      }

      if (request.method === 'GET' && path === '/api/post') {
        const post = loadPost(url.searchParams.get('id'), profile);
        if (!post) return json(response, 404, { error: 'Пост не найден' });
        return json(response, 200, post);
      }

      if (request.method === 'GET' && path === '/api/posts') {
        return json(response, 200, {
          posts: listPosts({ limit: Number(url.searchParams.get('limit') ?? 20), profile }),
        });
      }

      // --- сборка ---
      if (request.method === 'POST' && path === '/api/generate') {
        const body = await readBody(request);
        const post = buildPost({
          subject: body.subject ?? body.bank,
          rubric: body.rubric,
          topic: body.topic,
          variant: Number(body.variant ?? 0),
          note: body.note ?? null,
          profile,
        });
        return json(response, 200, post);
      }

      // --- правка текста руками ---
      if (request.method === 'POST' && path === '/api/update') {
        const body = await readBody(request);
        const post = loadPost(body.id, profile);
        if (!post) return json(response, 404, { error: 'Пост не найден' });
        const edited = recheckPost(
          { ...post, text: String(body.text ?? post.text), edited_at: new Date().toISOString() },
          { profile },
        );
        return json(response, 200, savePost(edited, { profile }));
      }

      // --- сбор фактов ---
      if (request.method === 'POST' && path === '/api/fetch') {
        const body = await readBody(request);
        const report = await fetchSubject(body.subject ?? body.bank, {
          offline: Boolean(body.offline),
          profile,
        });
        return json(response, 200, report);
      }

      // --- публикация ---
      if (request.method === 'POST' && path === '/api/publish') {
        const body = await readBody(request);
        const post = loadPost(body.id, profile);
        if (!post) return json(response, 404, { error: 'Пост не найден' });
        const fresh = recheckPost(post, { profile });
        const result = await publishPost(fresh, {
          dryRun: !body.live,
          schedule: body.schedule ?? null,
          channels: Array.isArray(body.channels) && body.channels.length ? body.channels : null,
          profile,
        });
        return json(response, 200, { ...result, id: post.id });
      }

      return json(response, 404, { error: `Неизвестный маршрут: ${request.method} ${path}` });
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
  });
}

export function startServer({ port, host, profile = null } = {}) {
  const listenPort = port ?? envInt('PORT', 4321);
  const listenHost = host ?? env('HOST', '0.0.0.0');
  const active = loadProfile(profile);
  const server = createServer({ profile });
  server.listen(listenPort, listenHost, () => {
    console.log(`Панель превью: http://localhost:${listenPort}`);
    console.log('В песочнице открой превью-вкладку — порт тот же.');
    console.log(`Тематика: ${active.name} (${active.id}) · площадки: ${enabledChannelIds().join(', ') || 'нет'}`);
    console.log(`Факты на ${todayISO()}`);
  });
  return server;
}
