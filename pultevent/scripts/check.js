const base = process.env.BASE || 'http://127.0.0.1:8080';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function req(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

function cookieOf(res) {
  const raw = res.headers.get('set-cookie') || '';
  const match = raw.match(/sid=[^;]+/);
  return match ? match[0] : '';
}

(async () => {
  const health = await req('/api/health');
  assert(health.data.ok, 'health');
  assert(health.data.enabled.includes('wheel') && health.data.enabled.includes('quiz'), 'enabled tools');
  assert(health.data.catalog > 40, 'catalog size');

  const demo = await req('/api/auth/demo', { method: 'POST' });
  assert(demo.status === 200, 'demo login');
  const cookie = cookieOf(demo);
  assert(cookie.startsWith('sid='), 'session cookie');

  const me = await req('/api/auth/me', { cookie });
  assert(me.data.user.email === 'demo@pultevent.local', 'demo user');

  const events = await req('/api/events', { cookie });
  const wedding = events.data.events.find((event) => event.code === 'DEMO24');
  assert(wedding, 'seed wedding');
  assert(!JSON.stringify(wedding).includes('passwordHash'), 'no password leak');

  const crm = await req('/api/crm', { cookie });
  assert(crm.data.clients.length >= 2, 'clients');
  assert(crm.data.funnel.find((s) => s.status === 'advance').count >= 1, 'funnel');

  const clash = await req('/api/events', {
    method: 'POST',
    cookie,
    body: { title: 'Проверка конфликта', date: wedding.date, type: 'birthday', status: 'lead' }
  });
  assert(clash.status === 200 && clash.data.warning, 'date conflict warning');

  const locked = await req(`/api/events/${wedding.id}/action`, { method: 'POST', cookie, body: { action: 'setTool', tool: 'dj' } });
  assert(locked.status === 403, 'locked tool');

  const spin = await req(`/api/events/${wedding.id}/action`, { method: 'POST', cookie, body: { action: 'wheelSpin' } });
  assert(spin.status === 200 && spin.data.live.wheel.winner, 'wheel spin');
  assert(spin.data.live.tool === 'wheel', 'wheel on screen');

  const timer = await req(`/api/events/${wedding.id}/action`, { method: 'POST', cookie, body: { action: 'timerStart', seconds: 30, label: 'Проверка' } });
  assert(timer.data.live.timer.running && timer.data.live.tool === 'timer', 'timer');

  const opened = await req(`/api/events/${wedding.id}/action`, { method: 'POST', cookie, body: { action: 'quizOpen' } });
  assert(opened.data.live.quiz.phase === 'open', 'quiz open');
  const question = opened.data.live.quiz.questions[opened.data.live.quiz.index];
  assert(Number.isInteger(question.correct), 'host sees answer');

  const pubBefore = await req('/api/public/DEMO24');
  assert(pubBefore.data.live.quiz.questions[0].correct == null, 'screen hides answer');
  assert(!JSON.stringify(pubBefore.data.event).includes('555-10-20'), 'public hides phone');

  const join = await req('/api/join/DEMO24', { method: 'POST', body: { name: 'Тест Гость', teamId: wedding.teams[0].id } });
  assert(join.status === 200 && join.data.token, 'guest join');
  const answer = await req('/api/join/DEMO24/answer', { method: 'POST', body: { token: join.data.token, choice: question.correct } });
  assert(answer.status === 200, 'guest answer');

  const closed = await req(`/api/events/${wedding.id}/action`, { method: 'POST', cookie, body: { action: 'quizClose' } });
  assert(closed.data.live.quiz.phase === 'closed', 'quiz close');
  const late = await req('/api/join/DEMO24/answer', { method: 'POST', body: { token: join.data.token, choice: 1 } });
  assert(late.status === 409, 'late answer rejected');

  const reveal = await req(`/api/events/${wedding.id}/action`, { method: 'POST', cookie, body: { action: 'quizReveal' } });
  const team = reveal.data.live.board.teams.find((t) => t.id === wedding.teams[0].id);
  assert(team.score >= 1, 'score added');
  const pubAfter = await req('/api/public/DEMO24');
  assert(pubAfter.data.live.quiz.questions[pubAfter.data.live.quiz.index].correct === question.correct, 'answer revealed');

  const board = await req(`/api/events/${wedding.id}/action`, { method: 'POST', cookie, body: { action: 'boardAnnounce' } });
  assert(board.data.live.board.announced && board.data.live.tool === 'board', 'announce');
  const timing = await req(`/api/events/${wedding.id}/action`, { method: 'POST', cookie, body: { action: 'timingSet', index: 2 } });
  assert(timing.data.live.timing.current === 2 && timing.data.live.tool === 'timing', 'timing');

  const parsed = await req('/api/parse-contract', {
    method: 'POST',
    cookie,
    body: { text: 'Заказчик: Анна Соколова\nТелефон: +7 (921) 555-10-20\nПлощадка: Ресторан Берёзка\nДата мероприятия: 25.11.2026\nГонорар: 90 000 руб.\nАванс: 30 000 руб.\nНачало: 16:30' }
  });
  assert(parsed.data.fields.date === '2026-11-25', 'contract date');
  assert(parsed.data.fields.fee === 90000 && parsed.data.fields.advance === 30000, 'contract money');
  assert(parsed.data.fields.clientName.includes('Анна'), 'contract name');

  const email = `check${Date.now()}@example.com`;
  const reg = await req('/api/auth/register', {
    method: 'POST',
    body: { name: 'Проверка', email, password: 'secret1', consent: true }
  });
  assert(reg.status === 200, 'register');
  const bad = await req('/api/auth/login', { method: 'POST', body: { email, password: 'wrong' } });
  assert(bad.status === 401, 'bad password');

  await req(`/api/events/${clash.data.event.id}`, { method: 'DELETE', cookie });
  await req(`/api/events/${wedding.id}/action`, { method: 'POST', cookie, body: { action: 'resetShow' } });
  const out = await req('/api/auth/logout', { method: 'POST', cookie });
  assert(out.status === 200, 'logout');
  const gone = await req('/api/events', { cookie });
  assert(gone.status === 401, 'session cleared');

  const home = await req('/');
  assert(home.status === 200 && String(home.data).includes('PULTEVENT'), 'landing');
  const app = await req('/app');
  assert(app.status === 200 && String(app.data).includes('Кабинет'), 'cabinet page');
  const screen = await req('/s/DEMO24');
  assert(screen.status === 200 && String(screen.data).includes('stage'), 'screen page');
  const joinPage = await req('/j/DEMO24');
  assert(joinPage.status === 200, 'join page');
  console.log('OK: кабинет, CRM, колесо, таймер, квиз, табло, тайминг и блокировка остальных разделов');
})().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
