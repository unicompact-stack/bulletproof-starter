const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { Store, hashPassword, verifyPassword, makeCode } = require('./lib/store');
const { CATALOG, GROUPS, ENABLED } = require('./lib/catalog');
const { seedIfEmpty, createLive, parseContract, typeLabel } = require('./lib/seed');

const PORT = Number(process.env.PORT) || 8080;
const OPEN_CABINET = process.env.OPEN_CABINET === '1';
const ROOT = __dirname;
const store = new Store(path.join(ROOT, 'data', 'db.json'));
seedIfEmpty(store);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16mb' }));

function cookieSid(req) {
  const raw = req.headers.cookie || '';
  const match = raw.match(/(?:^|;\s*)sid=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function currentUser(req) {
  if (req.openUser) return req.openUser;
  const sid = cookieSid(req);
  if (!sid) return null;
  const session = store.getSession(sid);
  if (!session) return null;
  return store.getUser(session.userId);
}

app.use((req, res, next) => {
  if (!OPEN_CABINET) return next();
  const user = store.getUserByEmail('demo@pultevent.local');
  if (user) req.openUser = user;
  next();
});

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Нужно войти в кабинет' });
    return null;
  }
  return user;
}

function publicUser(user) {
  const trialLeft = Math.max(0, (user.trialEndsAt || 0) - Date.now());
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    country: user.country || '',
    plan: user.plan || 'demo',
    accessUntil: user.accessUntil || null,
    trialEndsAt: user.trialEndsAt,
    trialLeft,
    createdAt: user.createdAt
  };
}

function setSid(res, sid) {
  res.setHeader('Set-Cookie', `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`);
}

function clearSid(res) {
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

function publicEvent(event) {
  return {
    id: event.id,
    code: event.code,
    title: event.title,
    type: event.type,
    typeLabel: typeLabel(event.type),
    date: event.date,
    time: event.time,
    venue: event.venue || '',
    teams: (event.teams || []).map((t) => ({ id: t.id, name: t.name, color: t.color, score: t.score || 0 }))
  };
}

function hostEvent(event) {
  return { ...event, typeLabel: typeLabel(event.type) };
}

function publicLive(live) {
  const quiz = live.quiz || {};
  const index = quiz.index || 0;
  const phase = quiz.phase || 'idle';
  const answers = (quiz.answers && quiz.answers[index]) || {};
  const counts = [0, 0, 0, 0];
  Object.values(answers).forEach((a) => {
    if (counts[a.choice] != null) counts[a.choice] += 1;
  });
  return {
    tool: live.tool,
    updatedAt: live.updatedAt,
    splash: live.splash,
    overlay: live.overlay || { type: '', id: 0, at: 0 },
    wheel: {
      names: live.wheel.names,
      rotation: live.wheel.rotation,
      spinId: live.wheel.spinId,
      startedAt: live.wheel.startedAt,
      duration: live.wheel.duration,
      winner: live.wheel.winner,
      winnerIndex: live.wheel.winnerIndex
    },
    timer: live.timer,
    board: live.board,
    timing: live.timing,
    quiz: {
      index,
      phase,
      openedAt: quiz.openedAt || null,
      counts,
      totalAnswers: Object.keys(answers).length,
      questions: (quiz.questions || []).map((q, i) => {
        const show = phase === 'reveal' && i === index;
        return {
          q: q.q,
          options: q.options,
          fact: show ? q.fact : '',
          correct: show ? q.correct : null
        };
      })
    },
    joined: (live.joined || []).map((g) => ({ id: g.id, name: g.name, teamId: g.teamId }))
  };
}

function hostLive(live) {
  const safeJoined = (live.joined || []).map(({ token, ...rest }) => rest);
  return { ...live, joined: safeJoined };
}

function normalizeSplash(event, splash) {
  const base = {
    kicker: typeLabel(event.type),
    title: 'Добро пожаловать!',
    subtitle: '',
    mode: 'normal',
    template: 'gold',
    photos: [],
    video: ''
  };
  return { ...base, ...(splash || {}), photos: (splash && splash.photos) || [] };
}

function ensureLive(event) {
  let live = store.getLive(event.id);
  if (!live) {
    live = createLive(event);
    store.saveLive(event.id, live);
  }
  live.joined = live.joined || [];
  live.quiz = live.quiz || createLive(event).quiz;
  live.quiz.answers = live.quiz.answers || {};
  live.quiz.scored = live.quiz.scored || {};
  let dirty = false;
  const normalized = normalizeSplash(event, live.splash);
  if (JSON.stringify(normalized) !== JSON.stringify(live.splash || {})) dirty = true;
  live.splash = normalized;
  if (!live.overlay) {
    live.overlay = { type: '', id: 0, at: 0 };
    dirty = true;
  }
  if (dirty) store.saveLive(event.id, live);
  return live;
}

function saveDataUrl(dataUrl, eventId) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return '';
  const buf = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buf.length || buf.length > 8 * 1024 * 1024) return '';
  const mime = match[1];
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('mp4') ? 'mp4' : mime.includes('webm') ? 'webm' : 'jpg';
  const dir = path.join(ROOT, 'public', 'uploads', eventId);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return `/uploads/${eventId}/${name}`;
}

function syncTeams(event, live) {
  event.teams = (live.board.teams || []).map((t) => ({ ...t }));
  store.updateEvent(event.id, { teams: event.teams });
}

function conflicts(userId, date, excludeId) {
  if (!date) return [];
  return store.eventsOf(userId).filter((e) => e.date === date && e.id !== excludeId && e.status !== 'closed');
}

function crmFor(userId) {
  const events = store.eventsOf(userId);
  const clientsMap = new Map();
  for (const event of events) {
    const key = (event.clientPhone || event.clientName || '').trim().toLowerCase();
    if (!key) continue;
    if (!clientsMap.has(key)) {
      clientsMap.set(key, {
        id: key,
        name: event.clientName || 'Без имени',
        phone: event.clientPhone || '',
        email: event.clientEmail || '',
        events: 0,
        income: 0,
        lastDate: event.date
      });
    }
    const client = clientsMap.get(key);
    client.events += 1;
    if (event.status === 'done' || event.status === 'closed') client.income += Number(event.fee) || 0;
    if (String(event.date) > String(client.lastDate)) client.lastDate = event.date;
    if (!client.phone && event.clientPhone) client.phone = event.clientPhone;
    if (event.clientName) client.name = event.clientName;
  }
  const stages = ['lead', 'confirmed', 'advance', 'done', 'closed'];
  const funnel = stages.map((status) => {
    const list = events.filter((e) => e.status === status);
    return {
      status,
      count: list.length,
      sum: list.reduce((acc, e) => acc + (Number(e.fee) || 0), 0)
    };
  });
  const seasonIncome = events
    .filter((e) => e.status === 'done' || e.status === 'closed')
    .reduce((acc, e) => acc + (Number(e.fee) || 0), 0);
  const expected = events
    .filter((e) => e.status === 'confirmed' || e.status === 'advance')
    .reduce((acc, e) => acc + (Number(e.fee) || 0), 0);
  const remainder = events.reduce((acc, e) => acc + Math.max(0, (Number(e.fee) || 0) - (Number(e.advance) || 0)), 0);
  return {
    clients: [...clientsMap.values()].sort((a, b) => b.income - a.income || b.events - a.events),
    funnel,
    money: { seasonIncome, expected, remainder, events: events.length }
  };
}

function cleanGuest(raw) {
  const name = String(raw.name || '').trim().slice(0, 40);
  if (!name) return null;
  return { id: raw.id || store.uid(4), name, note: String(raw.note || '').slice(0, 140) };
}

function cleanTeam(raw, index) {
  const name = String(raw.name || '').trim().slice(0, 40);
  if (!name) return null;
  const palette = ['#ff5d78', '#7eb6ff', '#e4c07a', '#3ddeb4', '#c9a0ff', '#ff9f68'];
  return {
    id: raw.id || store.uid(4),
    name,
    score: Number(raw.score) || 0,
    color: /^#[0-9a-fA-F]{6}$/.test(raw.color || '') ? raw.color : palette[index % palette.length]
  };
}

function cleanTiming(raw) {
  const title = String(raw.title || '').trim().slice(0, 80);
  if (!title) return null;
  return {
    id: raw.id || store.uid(4),
    time: String(raw.time || '').slice(0, 5),
    title,
    note: String(raw.note || '').slice(0, 140)
  };
}

function applyEventPatch(event, body) {
  const fields = ['title', 'type', 'date', 'time', 'venue', 'address', 'clientName', 'clientPhone', 'clientEmail', 'notes', 'status'];
  for (const key of fields) {
    if (body[key] != null) event[key] = String(body[key]).trim().slice(0, key === 'notes' ? 2000 : 160);
  }
  if (body.fee != null) event.fee = Math.max(0, Number(body.fee) || 0);
  if (body.advance != null) event.advance = Math.max(0, Number(body.advance) || 0);
  if (Array.isArray(body.guests)) event.guests = body.guests.map(cleanGuest).filter(Boolean).slice(0, 200);
  if (Array.isArray(body.teams)) event.teams = body.teams.map(cleanTeam).filter(Boolean).slice(0, 8);
  if (Array.isArray(body.timing)) event.timing = body.timing.map(cleanTiming).filter(Boolean).slice(0, 40);
  const allowedStatus = ['lead', 'confirmed', 'advance', 'done', 'closed'];
  if (!allowedStatus.includes(event.status)) event.status = 'lead';
  const allowedTypes = ['wedding', 'birthday', 'anniversary', 'corporate', 'prom', 'newyear', 'kids', 'quiz'];
  if (!allowedTypes.includes(event.type)) event.type = 'wedding';
  event.updatedAt = Date.now();
  return event;
}

function applyAction(event, live, body) {
  const action = body.action;
  if (action === 'setTool') {
    const tool = String(body.tool || '');
    if (!ENABLED.has(tool)) {
      const err = new Error('Этот раздел в проверочной сборке выключен');
      err.status = 403;
      throw err;
    }
    live.tool = tool;
    return;
  }
  if (action === 'splashUpdate') {
    const modes = ['normal', 'photo', 'slideshow', 'video', 'ready'];
    const templates = ['gold', 'white', 'neon', 'kids'];
    live.tool = 'splash';
    live.splash = normalizeSplash(event, live.splash);
    if (body.kicker != null) live.splash.kicker = String(body.kicker).slice(0, 40);
    if (body.title != null) live.splash.title = String(body.title).slice(0, 80);
    if (body.subtitle != null) live.splash.subtitle = String(body.subtitle).slice(0, 120);
    if (modes.includes(body.mode)) live.splash.mode = body.mode;
    if (templates.includes(body.template)) live.splash.template = body.template;
    if (Array.isArray(body.photos)) {
      live.splash.photos = body.photos.map((url) => String(url)).filter((url) => url.startsWith('/uploads/')).slice(0, 8);
    }
    if (body.video != null) {
      const video = String(body.video);
      live.splash.video = video.startsWith('/uploads/') ? video.slice(0, 300) : '';
    }
    return;
  }
  if (action === 'overlay') {
    const type = ['confetti', 'salute', 'fanfare'].includes(body.type) ? body.type : 'confetti';
    live.overlay = { type, id: ((live.overlay && live.overlay.id) || 0) + 1, at: Date.now() };
    return;
  }
  if (action === 'wheelNames') {
    const names = (Array.isArray(body.names) ? body.names : String(body.names || '').split('\n'))
      .map((n) => String(n).trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 24);
    live.wheel.names = names;
    live.wheel.winner = '';
    live.wheel.winnerIndex = -1;
    live.tool = 'wheel';
    return;
  }
  if (action === 'wheelSpin') {
    const names = live.wheel.names || [];
    if (names.length < 2) {
      const err = new Error('Для колеса нужно минимум два имени');
      err.status = 400;
      throw err;
    }
    let index = Math.floor(Math.random() * names.length);
    if (names.length > 2 && index === live.wheel.winnerIndex) {
      index = (index + 1 + Math.floor(Math.random() * (names.length - 1))) % names.length;
    }
    const seg = 360 / names.length;
    const jitter = (Math.random() - 0.5) * seg * 0.62;
    const current = Number(live.wheel.rotation) || 0;
    const normalized = ((current % 360) + 360) % 360;
    const targetMod = (360 - (index + 0.5) * seg + jitter + 3600) % 360;
    let delta = targetMod - normalized;
    if (delta < 0) delta += 360;
    live.wheel.winnerIndex = index;
    live.wheel.winner = names[index];
    live.wheel.rotation = current + 360 * 8 + delta;
    live.wheel.spinId = (live.wheel.spinId || 0) + 1;
    live.wheel.startedAt = Date.now();
    live.wheel.duration = 5400;
    live.tool = 'wheel';
    return;
  }
  if (action === 'timerStart') {
    const seconds = Math.max(5, Math.min(60 * 90, Number(body.seconds) || 60));
    live.timer = {
      label: String(body.label || 'Конкурс').slice(0, 40),
      totalMs: seconds * 1000,
      remainingMs: seconds * 1000,
      running: true,
      endsAt: Date.now() + seconds * 1000
    };
    live.tool = 'timer';
    return;
  }
  if (action === 'timerPause') {
    if (live.timer.running && live.timer.endsAt) {
      live.timer.remainingMs = Math.max(0, live.timer.endsAt - Date.now());
      live.timer.running = false;
      live.timer.endsAt = null;
    }
    live.tool = 'timer';
    return;
  }
  if (action === 'timerResume') {
    const left = Math.max(0, Number(live.timer.remainingMs) || 0);
    if (left > 0) {
      live.timer.running = true;
      live.timer.endsAt = Date.now() + left;
    }
    live.tool = 'timer';
    return;
  }
  if (action === 'timerReset') {
    const total = Number(live.timer.totalMs) || 60000;
    live.timer.running = false;
    live.timer.endsAt = null;
    live.timer.remainingMs = total;
    live.tool = 'timer';
    return;
  }
  if (action === 'quizGoto') {
    const next = Math.max(0, Math.min((live.quiz.questions.length || 1) - 1, Number(body.index) || 0));
    live.quiz.index = next;
    live.quiz.phase = 'idle';
    live.quiz.openedAt = null;
    live.tool = 'quiz';
    return;
  }
  if (action === 'quizOpen') {
    live.quiz.phase = 'open';
    live.quiz.openedAt = Date.now();
    live.tool = 'quiz';
    return;
  }
  if (action === 'quizClose') {
    if (live.quiz.phase === 'open') live.quiz.phase = 'closed';
    live.tool = 'quiz';
    return;
  }
  if (action === 'quizReveal') {
    const index = live.quiz.index || 0;
    const question = live.quiz.questions[index];
    if (question && !live.quiz.scored[index]) {
      const answers = live.quiz.answers[index] || {};
      for (const [guestId, answer] of Object.entries(answers)) {
        if (Number(answer.choice) === Number(question.correct)) {
          const guest = (live.joined || []).find((g) => g.id === guestId);
          const team = guest && (live.board.teams || []).find((t) => t.id === guest.teamId);
          if (team) team.score = (Number(team.score) || 0) + 1;
        }
      }
      live.quiz.scored[index] = true;
      syncTeams(event, live);
    }
    live.quiz.phase = 'reveal';
    live.tool = 'quiz';
    return;
  }
  if (action === 'quizAdd') {
    const q = String(body.q || '').trim().slice(0, 180);
    const options = (body.options || []).map((x) => String(x).trim().slice(0, 80)).filter(Boolean).slice(0, 4);
    const correct = Number(body.correct) || 0;
    if (!q || options.length < 2) {
      const err = new Error('Нужны вопрос и хотя бы два варианта');
      err.status = 400;
      throw err;
    }
    live.quiz.questions.push({
      q,
      options,
      correct: Math.min(correct, options.length - 1),
      fact: String(body.fact || '').slice(0, 180)
    });
    live.tool = 'quiz';
    return;
  }
  if (action === 'boardScore') {
    const team = (live.board.teams || []).find((t) => t.id === body.teamId);
    if (!team) {
      const err = new Error('Команда не найдена');
      err.status = 404;
      throw err;
    }
    team.score = Math.max(0, (Number(team.score) || 0) + (Number(body.delta) || 0));
    live.board.announced = false;
    live.tool = 'board';
    syncTeams(event, live);
    return;
  }
  if (action === 'boardAnnounce') {
    live.board.announced = true;
    live.tool = 'board';
    return;
  }
  if (action === 'boardClear') {
    live.board.announced = false;
    live.tool = 'board';
    return;
  }
  if (action === 'timingSet') {
    const items = live.timing.items || [];
    const index = Math.max(0, Math.min(items.length - 1, Number(body.index) || 0));
    live.timing.current = index;
    live.tool = 'timing';
    return;
  }
  if (action === 'timingSave') {
    live.timing.items = (body.items || []).map(cleanTiming).filter(Boolean).slice(0, 40);
    live.timing.current = Math.max(0, Math.min(live.timing.items.length - 1, Number(body.current) || 0));
    event.timing = live.timing.items.map((t) => ({ ...t }));
    store.updateEvent(event.id, { timing: event.timing });
    live.tool = 'timing';
    return;
  }
  if (action === 'resetShow') {
    const fresh = createLive(event);
    fresh.quiz.questions = live.quiz.questions;
    Object.assign(live, fresh);
    live.updatedAt = Date.now();
    return;
  }
  const err = new Error('Неизвестное действие');
  err.status = 400;
  throw err;
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    name: OPEN_CABINET ? 'PULTEVENT cabinet' : 'PULTEVENT demo',
    openCabinet: OPEN_CABINET,
    enabled: [...ENABLED],
    catalog: CATALOG.length,
    time: Date.now()
  });
});

app.get('/api/catalog', (req, res) => {
  res.json({ groups: GROUPS, items: CATALOG, enabled: [...ENABLED] });
});

app.post('/api/parse-contract', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const text = String(req.body.text || '').slice(0, 20000);
  res.json({ ok: true, fields: parseContract(text) });
});

app.post('/api/auth/register', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim().slice(0, 40);
  const country = String(req.body.country || 'Россия').trim().slice(0, 40);
  const password = String(req.body.password || '');
  if (!name || !email || !password) return res.status(400).json({ error: 'Заполните имя, email и пароль' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Похоже, email указан с ошибкой' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль — минимум 6 символов' });
  if (!req.body.consent) return res.status(400).json({ error: 'Нужно согласие на обработку данных' });
  if (store.getUserByEmail(email)) return res.status(409).json({ error: 'Такой email уже зарегистрирован' });
  const user = store.addUser({
    id: store.uid(),
    name,
    email,
    phone,
    country,
    passwordHash: hashPassword(password),
    plan: 'demo',
    accessUntil: null,
    trialEndsAt: Date.now() + 72 * 60 * 60 * 1000,
    createdAt: Date.now()
  });
  setSid(res, store.createSession(user.id));
  res.json({ ok: true, user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = store.getUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }
  setSid(res, store.createSession(user.id));
  res.json({ ok: true, user: publicUser(user) });
});

app.post('/api/auth/demo', (req, res) => {
  const user = store.getUserByEmail('demo@pultevent.local');
  if (!user) return res.status(404).json({ error: 'Демо-аккаунт не найден' });
  setSid(res, store.createSession(user.id));
  res.json({ ok: true, user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  if (OPEN_CABINET) return res.json({ ok: true, openCabinet: true });
  const sid = cookieSid(req);
  if (sid) store.deleteSession(sid);
  clearSid(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  res.json({ user: publicUser(user), openCabinet: OPEN_CABINET });
});

app.patch('/api/auth/me', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  if (req.body.name != null) user.name = String(req.body.name).trim().slice(0, 80) || user.name;
  if (req.body.phone != null) user.phone = String(req.body.phone).trim().slice(0, 40);
  if (req.body.country != null) user.country = String(req.body.country).trim().slice(0, 40);
  if (req.body.password) {
    if (String(req.body.password).length < 6) return res.status(400).json({ error: 'Пароль — минимум 6 символов' });
    user.passwordHash = hashPassword(String(req.body.password));
  }
  store.updateUser(user.id, user);
  res.json({ ok: true, user: publicUser(user) });
});

app.post('/api/billing', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const plan = req.body.plan === 'forever' || req.body.plan === 'month' || req.body.plan === 'demo' ? req.body.plan : null;
  if (!plan) return res.status(400).json({ error: 'Неизвестный тариф' });
  user.plan = plan;
  user.accessUntil = plan === 'month' ? Date.now() + 30 * 24 * 60 * 60 * 1000 : null;
  if (plan === 'demo') user.trialEndsAt = Date.now() + 72 * 60 * 60 * 1000;
  store.updateUser(user.id, user);
  res.json({
    ok: true,
    user: publicUser(user),
    message: 'Оплата не проводилась: в демо только переключается флаг тарифа.'
  });
});

app.get('/api/events', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  res.json({ events: store.eventsOf(user.id).map(hostEvent) });
});

app.post('/api/events', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const event = applyEventPatch({
    id: store.uid(),
    code: makeCode(store),
    userId: user.id,
    title: 'Новый праздник',
    type: 'wedding',
    date: '',
    time: '18:00',
    venue: '',
    address: '',
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    fee: 0,
    advance: 0,
    status: 'lead',
    notes: '',
    guests: [],
    teams: [
      { id: store.uid(4), name: 'Команда А', score: 0, color: '#ff5d78' },
      { id: store.uid(4), name: 'Команда Б', score: 0, color: '#7eb6ff' }
    ],
    timing: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }, req.body || {});
  if (!event.title) return res.status(400).json({ error: 'Нужно название праздника' });
  store.addEvent(event);
  store.saveLive(event.id, createLive(event));
  const same = conflicts(user.id, event.date, event.id);
  res.json({
    event: hostEvent(event),
    warning: same.length ? `На ${event.date} уже есть: ${same.map((e) => e.title).join(', ')}` : ''
  });
});

app.get('/api/events/:id', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const event = store.getEvent(req.params.id);
  if (!event || event.userId !== user.id) return res.status(404).json({ error: 'Праздник не найден' });
  res.json({ event: hostEvent(event), live: hostLive(ensureLive(event)) });
});

app.patch('/api/events/:id', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const event = store.getEvent(req.params.id);
  if (!event || event.userId !== user.id) return res.status(404).json({ error: 'Праздник не найден' });
  applyEventPatch(event, req.body || {});
  store.updateEvent(event.id, event);
  const live = ensureLive(event);
  if (Array.isArray(req.body.teams)) {
    live.board.teams = event.teams.map((t) => ({ ...t }));
  }
  if (Array.isArray(req.body.timing)) {
    live.timing.items = event.timing.map((t) => ({ ...t }));
    live.timing.current = Math.min(live.timing.current || 0, Math.max(0, event.timing.length - 1));
  }
  if (Array.isArray(req.body.teams) || Array.isArray(req.body.timing)) {
    store.saveLive(event.id, live);
  }
  const same = conflicts(user.id, event.date, event.id);
  res.json({
    event: hostEvent(event),
    warning: same.length ? `На ${event.date} уже есть: ${same.map((e) => e.title).join(', ')}` : ''
  });
});

app.delete('/api/events/:id', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const event = store.getEvent(req.params.id);
  if (!event || event.userId !== user.id) return res.status(404).json({ error: 'Праздник не найден' });
  store.deleteEvent(event.id);
  res.json({ ok: true });
});

app.post('/api/events/:id/media', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const event = store.getEvent(req.params.id);
  if (!event || event.userId !== user.id) return res.status(404).json({ error: 'Праздник не найден' });
  const url = saveDataUrl(req.body.dataUrl, event.id);
  if (!url) return res.status(400).json({ error: 'Файл пустой, битый или больше 8 МБ' });
  const live = ensureLive(event);
  if (req.body.kind === 'video') {
    live.splash.video = url;
    live.splash.mode = 'video';
  } else {
    live.splash.photos = (live.splash.photos || []).concat(url).slice(-8);
    if (req.body.kind === 'slideshow') live.splash.mode = 'slideshow';
    else if (live.splash.mode === 'normal' || live.splash.mode === 'ready') live.splash.mode = 'photo';
  }
  live.tool = 'splash';
  live.updatedAt = Date.now();
  store.saveLive(event.id, live);
  res.json({ ok: true, url, live: hostLive(live) });
});

app.get('/api/crm', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  res.json(crmFor(user.id));
});

app.post('/api/events/:id/action', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const event = store.getEvent(req.params.id);
  if (!event || event.userId !== user.id) return res.status(404).json({ error: 'Праздник не найден' });
  const live = ensureLive(event);
  try {
    applyAction(event, live, req.body || {});
    live.updatedAt = Date.now();
    store.saveLive(event.id, live);
    res.json({ ok: true, live: hostLive(live), event: hostEvent(store.getEvent(event.id)) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Не получилось' });
  }
});

app.get('/api/public/:code', (req, res) => {
  const event = store.getEventByCode(req.params.code);
  if (!event) return res.status(404).json({ error: 'Комната не найдена' });
  const live = ensureLive(event);
  res.json({ event: publicEvent(event), live: publicLive(live) });
});

app.post('/api/join/:code', (req, res) => {
  const event = store.getEventByCode(req.params.code);
  if (!event) return res.status(404).json({ error: 'Комната не найдена' });
  const live = ensureLive(event);
  const name = String(req.body.name || '').trim().slice(0, 40);
  if (name.length < 2) return res.status(400).json({ error: 'Как к вам обращаться?' });
  const teamId = (event.teams || []).some((t) => t.id === req.body.teamId) ? req.body.teamId : (event.teams[0] && event.teams[0].id) || '';
  if ((live.joined || []).length >= 300) return res.status(429).json({ error: 'Комната заполнена' });
  const guest = { id: store.uid(6), name, teamId, token: store.uid(16), joinedAt: Date.now() };
  live.joined.push(guest);
  live.updatedAt = Date.now();
  store.saveLive(event.id, live);
  res.json({
    ok: true,
    token: guest.token,
    guest: { id: guest.id, name: guest.name, teamId: guest.teamId },
    event: publicEvent(event),
    live: publicLive(live)
  });
});

app.post('/api/join/:code/answer', (req, res) => {
  const event = store.getEventByCode(req.params.code);
  if (!event) return res.status(404).json({ error: 'Комната не найдена' });
  const live = ensureLive(event);
  const guest = (live.joined || []).find((g) => g.token && g.token === req.body.token);
  if (!guest) return res.status(401).json({ error: 'Сначала представьтесь' });
  if (live.tool !== 'quiz' || live.quiz.phase !== 'open') {
    return res.status(409).json({ error: 'Приём ответов закрыт' });
  }
  const question = live.quiz.questions[live.quiz.index];
  const choice = Number(req.body.choice);
  if (!question || !Number.isInteger(choice) || choice < 0 || choice >= question.options.length) {
    return res.status(400).json({ error: 'Такого варианта нет' });
  }
  const index = live.quiz.index;
  if (!live.quiz.answers[index]) live.quiz.answers[index] = {};
  live.quiz.answers[index][guest.id] = { choice, at: Date.now() };
  live.updatedAt = Date.now();
  store.saveLive(event.id, live);
  res.json({ ok: true, choice, live: publicLive(live) });
});

app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '').slice(0, 400);
  if (!text) return res.status(400).send('empty');
  try {
    const svg = await QRCode.toString(text, {
      type: 'svg',
      margin: 1,
      color: { dark: '#14151a', light: '#ffffff' }
    });
    res.type('image/svg+xml').send(svg);
  } catch {
    res.status(500).send('qr');
  }
});

function sendCabinet(req, res) {
  res.sendFile(path.join(ROOT, 'public', 'app.html'));
}

if (OPEN_CABINET) {
  app.get('/', sendCabinet);
  app.get('/app', sendCabinet);
  app.get('/login', (req, res) => res.redirect('/'));
  app.get('/login.html', (req, res) => res.redirect('/'));
  app.get('/index.html', (req, res) => res.redirect('/'));
  app.get('/site', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));
}

app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));

app.get('/dj', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'dj.html'));
});

app.get('/dj-screen', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'dj-screen.html'));
});

app.get('/s/:code', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'screen.html'));
});

app.get('/j/:code', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'join.html'));
});

const LEGAL = {
  privacy: {
    title: 'Политика конфиденциальности',
    body: 'Это локальная демо-копия. Данные аккаунта — имя, email, телефон и карточки праздников — хранятся только в файле на этом сервере и никуда не отправляются. Платёжные карты не принимаются и не сохраняются.'
  },
  terms: {
    title: 'Условия использования',
    body: 'Демо предназначено для проверки личного кабинета и нескольких инструментов: колеса гостей, таймера, квиза, табло и тайминга. Остальные разделы каталога показаны, но выключены. Это не официальный сервис PULTEVENT и не оферта на оплату.'
  },
  offer: {
    title: 'Оферта',
    body: 'Публичная оферта оригинального сервиса здесь не воспроизводится. В этой сборке кнопка тарифа только переключает демо-флаг доступа. Деньги не списываются, чек не формируется.'
  },
  cookie: {
    title: 'Политика cookie',
    body: 'Сайт пишет техническую cookie сессии, чтобы кабинет оставался открытым, и запоминает согласие с уведомлением в localStorage браузера. Сторонней аналитики нет.'
  },
  consent: {
    title: 'Согласие на обработку данных',
    body: 'Регистрируясь, вы соглашаетесь хранить имя, контакты и данные праздников в локальной демо-базе, чтобы проверить кабинет. Удалить аккаунт в этой сборке можно, очистив данные сервера.'
  }
};

app.get('/legal/:page', (req, res) => {
  const page = LEGAL[req.params.page];
  if (!page) return res.status(404).sendFile(path.join(ROOT, 'public', '404.html'));
  res.type('html').send(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${page.title} — PULTEVENT демо</title>
  <link rel="stylesheet" href="/css/site.css">
</head>
<body class="legal-body">
  <main class="legal">
    <a class="back" href="/">← На главную</a>
    <h1>${page.title}</h1>
    <p>${page.body}</p>
  </main>
</body>
</html>`);
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Не найдено' }));
app.use((req, res) => res.status(404).sendFile(path.join(ROOT, 'public', '404.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(OPEN_CABINET
    ? `PULTEVENT cabinet http://0.0.0.0:${PORT} (без входа)`
    : `PULTEVENT demo http://0.0.0.0:${PORT}`);
});
