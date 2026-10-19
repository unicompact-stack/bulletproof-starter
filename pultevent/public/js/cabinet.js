const state = {
  me: null,
  events: [],
  catalog: [],
  groups: [],
  crm: null,
  view: (location.hash || '#home').slice(1).split('/')[0] || 'home',
  eventId: localStorage.getItem('pe-event') || '',
  live: null,
  tool: 'wheel',
  catalogQuery: '',
  catalogFilter: 'enabled',
  open: false
};

const view = document.getElementById('view');
const toastEl = document.getElementById('toast');

function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.add('hidden'), 3200);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    if (!state.open) location.href = '/login?next=/app';
    throw new Error('auth');
  }
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

function selected() {
  return state.events.find((event) => event.id === state.eventId) || state.events[0] || null;
}

function trialText() {
  const left = state.me?.trialLeft || 0;
  if (state.me?.plan === 'forever') return 'доступ навсегда';
  if (state.me?.plan === 'month' && state.me.accessUntil) {
    const days = Math.max(0, Math.ceil((state.me.accessUntil - Date.now()) / 86400000));
    return `месяц · ${days} дн.`;
  }
  const hours = Math.floor(left / 3600000);
  const mins = Math.floor((left % 3600000) / 60000);
  return `демо · ${hours} ч ${mins} мин`;
}

function fillPicker() {
  const pick = document.getElementById('eventPick');
  const current = selected();
  pick.innerHTML = state.events.length
    ? state.events.map((event) => `<option value="${esc(event.id)}">${esc(event.title)} · ${esc(formatDate(event.date))}</option>`).join('')
    : '<option value="">Нет праздников</option>';
  if (current) {
    state.eventId = current.id;
    pick.value = current.id;
    localStorage.setItem('pe-event', current.id);
  }
  document.getElementById('planPill').textContent = trialText();
}

async function setView(name) {
  state.view = name;
  history.replaceState(null, '', `#${name}`);
  document.querySelectorAll('[data-view]').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === name));
  if (name === 'remote') {
    try { await loadShow(); } catch (err) { toast(err.message); }
  }
  render();
}

async function loadShow() {
  const event = selected();
  if (!event) { state.live = null; return; }
  const data = await api(`/api/events/${event.id}`);
  state.live = data.live;
  const idx = state.events.findIndex((item) => item.id === data.event.id);
  if (idx >= 0) state.events[idx] = data.event;
}

async function act(body) {
  const event = selected();
  if (!event) throw new Error('Сначала выберите праздник');
  const data = await api(`/api/events/${event.id}/action`, { method: 'POST', body });
  state.live = data.live;
  const idx = state.events.findIndex((item) => item.id === data.event.id);
  if (idx >= 0) state.events[idx] = data.event;
  return data;
}

function render() {
  fillPicker();
  const map = { home: renderHome, events: renderEvents, crm: renderCrm, remote: renderRemote, catalog: renderCatalog, profile: renderProfile };
  (map[state.view] || renderHome)();
}

function renderHome() {
  const event = selected();
  const upcoming = state.events.filter((item) => item.status !== 'done' && item.status !== 'closed');
  const income = state.crm?.money.seasonIncome || 0;
  const expected = state.crm?.money.expected || 0;
  view.innerHTML = `
    <p class="eyebrow" style="color:var(--gold);letter-spacing:.14em;font-weight:800">ЛИЧНЫЙ КАБИНЕТ</p>
    <h1>Здравствуйте, ${esc((state.me.name || '').split(' ')[0])}</h1>
    <p class="muted">Сезон, гости и экран — в одном месте. Для проверки живые только несколько инструментов, остальные разделы видны в каталоге.</p>
    <div class="stats">
      <div class="stat"><b>${state.events.length}</b><span class="muted">праздников</span></div>
      <div class="stat"><b>${money(income)}</b><span class="muted">проведено</span></div>
      <div class="stat"><b>${money(expected)}</b><span class="muted">впереди</span></div>
      <div class="stat"><b>${upcoming.length}</b><span class="muted">открытых дат</span></div>
    </div>
    <div class="grid-2">
      <article class="card">
        <h2>Ближайший пульт</h2>
        ${event ? `
          <p><b>${esc(event.title)}</b></p>
          <p class="muted">${esc(typeLabel(event.type))} · ${esc(formatDate(event.date))} ${esc(event.time || '')}<br>${esc(event.venue || 'площадка не указана')}</p>
          <p>Код комнаты <b>${esc(event.code)}</b> · гостей в списке ${event.guests.length}</p>
          <div class="row">
            <button class="btn" data-act="goto" data-view="remote">Открыть пульт</button>
            <button class="btn ghost" data-act="screen">Экран зала</button>
            <button class="btn ghost" data-act="join">Телефон гостя</button>
          </div>` : '<p>Создайте первый праздник — и пульт появится здесь.</p><button class="btn" data-act="new">Новый праздник</button>'}
      </article>
      <article class="card">
        <h2>Что можно проверить</h2>
        <p>Заставка, колесо гостей, таймер, квиз с телефонами, табло и тайминг. Откройте экран в соседней вкладке и пульт здесь — они синхронизируются.</p>
        <p class="muted">${state.open ? 'Кабинет уже открыт, пароль не нужен.' : 'Демо-вход: demo@pultevent.local / demo1234.'} Свадьба Анны и Марка уже собрана, код DEMO24.</p>
      </article>
    </div>
    <h2 style="margin-top:22px">Даты</h2>
    ${state.events.map(eventRow).join('') || '<p class="muted">Пока пусто.</p>'}`;
}

function eventRow(event) {
  const rest = Math.max(0, (Number(event.fee) || 0) - (Number(event.advance) || 0));
  return `<div class="event-row">
    <div><b>${esc(event.title)}</b><div class="muted">${esc(formatDate(event.date))} · ${esc(event.venue || typeLabel(event.type))} · ${money(event.fee)}</div></div>
    <div class="row"><span class="tag ${esc(event.status)}">${esc(statusLabel(event.status))}</span><button class="btn ghost" data-act="edit" data-id="${esc(event.id)}">Карточка</button></div>
  </div>`;
}

function renderEvents() {
  view.innerHTML = `
    <div class="row"><h1 class="grow">Праздники</h1><button class="btn" data-act="new">Новый праздник</button></div>
    <p class="muted">Календарь подсвечивает занятые даты. Вторая бронь не блокируется, но кабинет предупредит.</p>
    <div class="row" style="margin:12px 0">
      <button class="btn ghost" data-act="cal" data-dir="-1">←</button>
      <b id="calLabel"></b>
      <button class="btn ghost" data-act="cal" data-dir="1">→</button>
    </div>
    <div class="calendar" id="calendar"></div>
    <div style="margin-top:16px">${state.events.map(eventRow).join('')}</div>`;
  paintCalendar();
}

const cal = { y: 2026, m: 10 };
function paintCalendar() {
  const label = document.getElementById('calLabel');
  const box = document.getElementById('calendar');
  if (!box) return;
  const monthName = new Date(cal.y, cal.m - 1, 1).toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
  label.textContent = monthName;
  const start = (new Date(cal.y, cal.m - 1, 1).getDay() + 6) % 7;
  const days = new Date(cal.y, cal.m, 0).getDate();
  const heads = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => `<div class="cal-head">${d}</div>`).join('');
  let cells = '';
  for (let i = 0; i < start; i += 1) cells += '<div></div>';
  for (let day = 1; day <= days; day += 1) {
    const iso = `${cal.y}-${String(cal.m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const hits = state.events.filter((event) => event.date === iso);
    cells += `<button class="cal-day ${hits.length ? 'has' : ''}" data-act="day" data-date="${iso}"><b>${day}</b>${hits.map((event) => esc(event.title)).join('<br>')}</button>`;
  }
  box.innerHTML = heads + cells;
}

function renderCrm() {
  const crm = state.crm || { clients: [], funnel: [], money: {} };
  const labels = { lead: 'Лид', confirmed: 'Подтверждён', advance: 'Аванс', done: 'Проведён', closed: 'Закрыт' };
  view.innerHTML = `
    <h1>CRM сезона</h1>
    <p class="muted">Клиенты собираются из карточек. Это учёт одного ведущего, не отдел продаж.</p>
    <div class="stats">
      <div class="stat"><b>${money(crm.money.seasonIncome)}</b><span class="muted">доход проведённых</span></div>
      <div class="stat"><b>${money(crm.money.expected)}</b><span class="muted">подтверждено впереди</span></div>
      <div class="stat"><b>${money(crm.money.remainder)}</b><span class="muted">остатки к доплате</span></div>
      <div class="stat"><b>${crm.clients.length}</b><span class="muted">клиентов</span></div>
    </div>
    <div class="funnel">
      ${(crm.funnel || []).map((stage) => `<article class="card"><div class="tag ${stage.status}">${labels[stage.status]}</div><b style="font-size:28px">${stage.count}</b><div class="muted">${money(stage.sum)}</div></article>`).join('')}
    </div>
    <h2 style="margin-top:18px">Клиенты</h2>
    <div class="card">${crm.clients.map((client) => `<div class="event-row"><div><b>${esc(client.name)}</b><div class="muted">${esc(client.phone || 'без телефона')} · праздников ${client.events}</div></div><div>${money(client.income)}</div></div>`).join('') || '<p class="muted">Появятся, когда в карточке будет имя заказчика.</p>'}</div>
    <h2 style="margin-top:18px">Кто должен доплатить</h2>
    <div class="card">${state.events.filter((event) => (event.fee || 0) > (event.advance || 0) && event.status !== 'closed').map((event) => `<div class="event-row"><div><b>${esc(event.title)}</b><div class="muted">${esc(event.clientName || '')}</div></div><div>остаток ${money((event.fee || 0) - (event.advance || 0))}</div></div>`).join('') || '<p class="muted">Все остатки закрыты.</p>'}</div>`;
}

function renderRemote() {
  const event = selected();
  if (!event) {
    view.innerHTML = '<div class="empty"><h1>Нет праздника</h1><button class="btn" data-act="new">Создать</button></div>';
    return;
  }
  const joinUrl = `${location.origin}/j/${event.code}`;
  view.innerHTML = `
    <div class="remote">
      <div class="card">
        <h2>Пульт</h2>
        <p class="muted">${esc(event.title)} · ${esc(event.code)}</p>
        <div id="toolList"></div>
        <button class="btn ghost" data-act="reset" style="margin-top:12px">Сбросить шоу</button>
      </div>
      <div class="card">
        <h2 id="toolTitle">Инструмент</h2>
        <div id="toolPanel"></div>
      </div>
      <div class="card">
        <h2>Экран и гости</h2>
        <div class="screen-frame"><iframe title="Экран зала" src="/s/${esc(event.code)}"></iframe></div>
        <div class="row" style="margin-top:10px">
          <button class="btn" data-act="screen">Открыть экран</button>
          <button class="btn ghost" data-act="join">Телефон гостя</button>
        </div>
        <div class="row" style="margin-top:12px;align-items:flex-start">
          <div class="qr"><img alt="QR для гостей" src="/api/qr?text=${encodeURIComponent(joinUrl)}"></div>
          <div>
            <div class="muted">Ссылка гостя</div>
            <b id="joinedCount">0</b> <span class="muted">в комнате</span>
            <div id="guestList" class="muted" style="margin-top:8px"></div>
            <button class="btn ghost" data-act="copy" style="margin-top:8px">Копировать ссылку</button>
          </div>
        </div>
      </div>
    </div>`;
  paintTools();
  paintPanel();
  paintGuests();
}

function enabledTools() {
  return [
    ['splash', '✨', 'Заставка'],
    ['wheel', '🎡', 'Колесо'],
    ['timer', '⏱️', 'Таймер'],
    ['quiz', '🧠', 'Квиз'],
    ['board', '🏆', 'Табло'],
    ['timing', '🕒', 'Тайминг']
  ];
}

function paintTools() {
  const box = document.getElementById('toolList');
  if (!box) return;
  const locked = state.catalog.filter((item) => !item.enabled).slice(0, 6);
  box.innerHTML = enabledTools().map(([id, emoji, name]) => `<button class="tool on ${state.tool === id ? 'active' : ''}" data-act="tool" data-tool="${id}" style="${state.tool === id ? 'outline:2px solid var(--gold)' : ''}">${emoji} ${name}</button>`).join('')
    + '<p class="muted" style="margin-top:10px">Выключены, чтобы не мешать проверке:</p>'
    + locked.map((item) => `<button class="tool off" data-act="locked" data-name="${esc(item.name)}">${item.emoji} ${esc(item.name)}</button>`).join('');
}

function paintPanel() {
  const title = document.getElementById('toolTitle');
  const panel = document.getElementById('toolPanel');
  if (!panel || !state.live) return;
  const names = { splash: 'Заставка', wheel: 'Колесо гостей', timer: 'Таймер', quiz: 'Квиз', board: 'Табло', timing: 'Тайминг' };
  title.textContent = names[state.tool] || 'Пульт';
  const painters = { splash: splashPanel, wheel: wheelPanel, timer: timerPanel, quiz: quizPanel, board: boardPanel, timing: timingPanel };
  panel.innerHTML = (painters[state.tool] || splashPanel)();
}

function splashPanel() {
  const splash = state.live.splash || {};
  return `
    <p class="muted">Это видит зал, пока вы не запустили игру.</p>
    <label>Надзаголовок</label><input id="splashKicker" value="${esc(splash.kicker || '')}">
    <label>Заголовок</label><input id="splashTitle" value="${esc(splash.title || '')}">
    <label>Подпись</label><input id="splashSub" value="${esc(splash.subtitle || '')}">
    <div class="row" style="margin-top:12px"><button class="btn" data-act="splash">Показать на экране</button></div>`;
}

function wheelPanel() {
  const names = (state.live.wheel.names || []).join('\n');
  return `
    <p class="muted">Минимум два имени. Победитель появится на экране после остановки.</p>
    <textarea id="wheelNames" style="min-height:160px">${esc(names)}</textarea>
    <div class="row" style="margin-top:10px">
      <button class="btn ghost" data-act="wheel-save">Сохранить имена</button>
      <button class="btn ghost" data-act="wheel-from-guests">Из списка гостей</button>
      <button class="btn" data-act="spin">Крутить</button>
    </div>
    <p>${state.live.wheel.winner ? `Последний: <b>${esc(state.live.wheel.winner)}</b>` : 'Ещё не крутили'}</p>`;
}

function timerPanel() {
  const timer = state.live.timer;
  return `
    <label>Подпись на экране</label>
    <input id="timerLabel" value="${esc(timer.label || 'Конкурс')}">
    <div class="row" style="margin:10px 0">
      ${[30, 60, 180, 300, 600].map((sec) => `<button class="btn ghost" data-act="timer" data-sec="${sec}">${sec < 60 ? sec + ' с' : (sec / 60) + ' мин'}</button>`).join('')}
      <button class="btn ghost" data-act="timer" data-sec="900" data-label="Перерыв">Перерыв 15 мин</button>
    </div>
    <div id="timerReadout" style="font-family:Unbounded,sans-serif;font-size:64px">${formatMs(timerLeft(timer))}</div>
    <div class="row">
      <button class="btn" data-act="timer-custom">Старт своего</button>
      <input id="customSec" type="number" min="5" max="5400" value="90" style="max-width:100px">
      <button class="btn ghost" data-act="pause">${timer.running ? 'Пауза' : 'Дальше'}</button>
      <button class="btn ghost" data-act="timer-reset">Сброс</button>
    </div>`;
}

function quizPanel() {
  const quiz = state.live.quiz;
  const question = quiz.questions[quiz.index];
  const answers = (quiz.answers && quiz.answers[quiz.index]) || {};
  const roster = quiz.joined || state.live.joined || [];
  if (!question) return '<p>Нет вопросов</p>';
  return `
    <p class="muted">Шпаргалка только у вас. На экран верный ответ попадает после кнопки «Показать».</p>
    <div class="row"><button class="btn ghost" data-act="quiz-prev">Назад</button><b>Вопрос ${quiz.index + 1} / ${quiz.questions.length}</b><button class="btn ghost" data-act="quiz-next">Дальше</button></div>
    <h3 style="margin-top:12px">${esc(question.q)}</h3>
    ${question.options.map((opt, i) => {
      const count = Object.values(answers).filter((a) => Number(a.choice) === i).length;
      return `<div class="q-opt ${i === question.correct ? 'correct' : ''}"><span>${esc(opt)} ${i === question.correct ? '· верный' : ''}</span><b data-count="${i}">${count}</b></div>`;
    }).join('')}
    <p class="muted">${esc(question.fact || '')}</p>
    <div class="row">
      <button class="btn" data-act="quiz-open">Открыть приём</button>
      <button class="btn ghost" data-act="quiz-close">Закрыть</button>
      <button class="btn gold" data-act="quiz-reveal">Показать ответ</button>
    </div>
    <p>Статус: <b>${esc({ idle: 'не открыт', open: 'приём идёт', closed: 'закрыт', reveal: 'ответ показан' }[quiz.phase])}</b> · ответов ${Object.keys(answers).length}</p>
    <details><summary>Свой вопрос</summary>
      <input id="newQ" placeholder="Вопрос">
      <input id="newA" placeholder="Варианты через |">
      <input id="newFact" placeholder="Факт после ответа">
      <button class="btn ghost" data-act="quiz-add" style="margin-top:8px">Добавить</button>
    </details>
    <p class="muted">Кто уже в комнате: ${roster.map((g) => esc(g.name)).join(', ') || 'пока никто'}</p>`;
}

function boardPanel() {
  const teams = state.live.board.teams || [];
  return `
    <p class="muted">Баллы квиза прибавляются сами, когда вы показываете ответ. Эти кнопки — для живых конкурсов.</p>
    ${teams.map((team) => `<div class="event-row"><div><b style="color:${esc(team.color)}">${esc(team.name)}</b><div style="font-size:28px">${team.score || 0}</div></div>
      <div class="row">
        <button class="btn ghost score-btn" data-act="score" data-id="${esc(team.id)}" data-delta="-1">−1</button>
        <button class="btn ghost score-btn" data-act="score" data-id="${esc(team.id)}" data-delta="1">+1</button>
        <button class="btn ghost score-btn" data-act="score" data-id="${esc(team.id)}" data-delta="5">+5</button>
      </div></div>`).join('') || '<p>Добавьте команды в карточке праздника.</p>'}
    <div class="row"><button class="btn" data-act="announce">Объявить победителя</button><button class="btn ghost" data-act="clear-win">Убрать заставку</button></div>`;
}

function timingPanel() {
  const items = state.live.timing.items || [];
  return `
    <p class="muted">Текущий блок подсвечивается на экране зала.</p>
    ${items.map((item, i) => `<div class="event-row"><div><b>${esc(item.time)} ${esc(item.title)}</b><div class="muted">${esc(item.note || '')}</div></div>
      <button class="btn ${i === state.live.timing.current ? '' : 'ghost'}" data-act="timing" data-index="${i}">${i === state.live.timing.current ? 'Сейчас' : 'Сделать текущим'}</button></div>`).join('') || '<p>В карточке праздника нет тайминга.</p>'}
    <div class="row"><button class="btn ghost" data-act="timing-prev">Предыдущий</button><button class="btn" data-act="timing-next">Дальше по программе</button></div>`;
}

function paintGuests() {
  const list = document.getElementById('guestList');
  if (!list || !state.live) return;
  const guests = state.live.joined || [];
  list.innerHTML = guests.map((g) => `<div>${esc(g.name)}</div>`).join('') || 'Пока никого. Откройте телефон гостя или QR.';
  const count = document.getElementById('joinedCount');
  if (count) count.textContent = guests.length;
  document.querySelectorAll('[data-count]').forEach((el) => {
    const answers = (state.live.quiz.answers && state.live.quiz.answers[state.live.quiz.index]) || {};
    el.textContent = Object.values(answers).filter((a) => Number(a.choice) === Number(el.dataset.count)).length;
  });
  const readout = document.getElementById('timerReadout');
  if (readout) readout.textContent = formatMs(timerLeft(state.live.timer));
}

function renderCatalog() {
  const q = state.catalogQuery.toLowerCase();
  const items = state.catalog.filter((item) => {
    if (state.catalogFilter === 'enabled' && !item.enabled) return false;
    if (state.catalogFilter === 'phones' && item.tag !== 'phones') return false;
    if (state.catalogFilter === 'offline' && item.tag !== 'offline') return false;
    if (q && !`${item.name} ${item.blurb} ${item.group}`.toLowerCase().includes(q)) return false;
    return true;
  });
  view.innerHTML = `
    <h1>Каталог разделов</h1>
    <p class="muted">${state.catalog.length} в списке, включено ${state.catalog.filter((item) => item.enabled).length}. Остальные можно посмотреть, но не запустить.</p>
    <div class="row">
      <input id="catalogQ" placeholder="Поиск" value="${esc(state.catalogQuery)}" style="max-width:280px">
      <button class="btn ghost" data-act="filter" data-filter="all">Все</button>
      <button class="btn ghost" data-act="filter" data-filter="enabled">Включённые</button>
      <button class="btn ghost" data-act="filter" data-filter="offline">Офлайн</button>
      <button class="btn ghost" data-act="filter" data-filter="phones">Нужен телефон</button>
    </div>
    <div class="tools" style="margin-top:14px">
      ${items.map((item) => `<button class="tool ${item.enabled ? 'on' : 'off'}" data-act="${item.enabled ? 'open-tool' : 'locked'}" data-tool="${esc(item.id)}" data-name="${esc(item.name)}">
        <b>${item.emoji} ${esc(item.name)}</b>
        <small>${esc(item.group)} · ${item.enabled ? 'открыть' : 'выключено'}</small>
        <small>${esc(item.blurb)}</small>
      </button>`).join('')}
    </div>`;
}

function renderProfile() {
  const me = state.me;
  view.innerHTML = `
    <h1>Профиль</h1>
    <div class="grid-2">
      <form class="card" id="profileForm">
        <label>Имя</label><input name="name" value="${esc(me.name)}">
        <label>Телефон</label><input name="phone" value="${esc(me.phone || '')}">
        <label>Страна</label><input name="country" value="${esc(me.country || '')}">
        ${state.open ? '' : '<label>Новый пароль</label><input name="password" type="password" placeholder="оставьте пустым, если не меняете">'}
        <p class="muted">${esc(me.email)}</p>
        <button class="btn" type="submit">Сохранить</button>
      </form>
      <article class="card">
        <h2>Тариф</h2>
        <p>Сейчас: <b>${esc(planLabel(me.plan))}</b></p>
        <p class="muted">${state.open ? 'Это открытый демо-кабинет: входа и пароля нет.' : ''} ${esc(trialText())}. Оплата в демо не проводится — кнопки только переключают флаг, чтобы проверить кабинет.</p>
        <div class="row">
          <button class="btn ghost" data-act="plan" data-plan="demo">Демо</button>
          <button class="btn ghost" data-act="plan" data-plan="month">Месяц</button>
          <button class="btn gold" data-act="plan" data-plan="forever">Навсегда</button>
        </div>
        ${state.open ? '' : '<p style="margin-top:16px"><button class="btn ghost" data-act="logout">Выйти</button></p>'}
      </article>
    </div>`;
  document.getElementById('profileForm').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const body = { name: form.get('name'), phone: form.get('phone'), country: form.get('country') };
    if (form.get('password')) body.password = form.get('password');
    try {
      const data = await api('/api/auth/me', { method: 'PATCH', body });
      state.me = data.user;
      toast('Профиль сохранён');
      render();
    } catch (err) { toast(err.message); }
  };
}

function openEventModal(event) {
  const isNew = !event?.id;
  const item = event || {
    title: '', type: 'wedding', date: '', time: '18:00', venue: '', address: '',
    clientName: '', clientPhone: '', clientEmail: '', fee: 0, advance: 0, status: 'lead', notes: '',
    guests: [], teams: [{ name: 'Команда А', color: '#ff5d78' }, { name: 'Команда Б', color: '#7eb6ff' }],
    timing: []
  };
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" style="max-height:88vh;overflow:auto">
    <h2>${isNew ? 'Новый праздник' : 'Карточка праздника'}</h2>
    <form id="eventForm">
      <label>Название</label><input name="title" required value="${esc(item.title)}">
      <div class="row">
        <div class="grow"><label>Тип</label><select name="type">${['wedding','birthday','anniversary','corporate','prom','newyear','kids','quiz'].map((type) => `<option value="${type}" ${item.type === type ? 'selected' : ''}>${typeLabel(type)}</option>`).join('')}</select></div>
        <div class="grow"><label>Статус</label><select name="status">${['lead','confirmed','advance','done','closed'].map((status) => `<option value="${status}" ${item.status === status ? 'selected' : ''}>${statusLabel(status)}</option>`).join('')}</select></div>
      </div>
      <div class="row">
        <div class="grow"><label>Дата</label><input type="date" name="date" value="${esc(item.date)}"></div>
        <div class="grow"><label>Время</label><input type="time" name="time" value="${esc(item.time || '18:00')}"></div>
      </div>
      <label>Площадка</label><input name="venue" value="${esc(item.venue || '')}">
      <label>Адрес</label><input name="address" value="${esc(item.address || '')}">
      <label>Заказчик</label><input name="clientName" value="${esc(item.clientName || '')}">
      <div class="row">
        <div class="grow"><label>Телефон</label><input name="clientPhone" value="${esc(item.clientPhone || '')}"></div>
        <div class="grow"><label>Email</label><input name="clientEmail" value="${esc(item.clientEmail || '')}"></div>
      </div>
      <div class="row">
        <div class="grow"><label>Гонорар</label><input type="number" name="fee" value="${Number(item.fee) || 0}"></div>
        <div class="grow"><label>Аванс</label><input type="number" name="advance" value="${Number(item.advance) || 0}"></div>
      </div>
      <label>Гости, по одному в строке</label>
      <textarea name="guests">${esc((item.guests || []).map((g) => g.name).join('\n'))}</textarea>
      <label>Команды, по одной в строке</label>
      <textarea name="teams">${esc((item.teams || []).map((t) => t.name).join('\n'))}</textarea>
      <label>Тайминг: время | блок | заметка</label>
      <textarea name="timing">${esc((item.timing || []).map((t) => `${t.time} | ${t.title} | ${t.note || ''}`).join('\n'))}</textarea>
      <label>Заметки</label><textarea name="notes">${esc(item.notes || '')}</textarea>
      <details>
        <summary>Вставить текст договора</summary>
        <textarea id="contract" placeholder="Заказчик: Анна Соколова&#10;Дата мероприятия: 25.11.2026&#10;Гонорар: 90 000 руб.&#10;Аванс: 30 000 руб."></textarea>
        <button class="btn ghost" id="parseContract" type="button">Распознать</button>
      </details>
      <p class="form-error" id="eventWarn" style="color:var(--gold)"></p>
      <div class="row">
        <button class="btn" type="submit">Сохранить</button>
        <button class="btn ghost" type="button" id="closeModal">Закрыть</button>
        ${isNew ? '' : `<button class="btn ghost" type="button" id="deleteEvent">Удалить</button>`}
      </div>
    </form>
  </div>`;
  document.body.appendChild(back);
  back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  back.querySelector('#closeModal').onclick = () => back.remove();
  back.querySelector('#parseContract').onclick = async () => {
    try {
      const data = await api('/api/parse-contract', { method: 'POST', body: { text: back.querySelector('#contract').value } });
      const form = back.querySelector('#eventForm');
      const fields = data.fields;
      if (fields.date) form.date.value = fields.date;
      if (fields.time) form.time.value = fields.time;
      if (fields.clientName) form.clientName.value = fields.clientName;
      if (fields.clientPhone) form.clientPhone.value = fields.clientPhone;
      if (fields.venue) form.venue.value = fields.venue;
      if (fields.fee != null) form.fee.value = fields.fee;
      if (fields.advance != null) form.advance.value = fields.advance;
      back.querySelector('#eventWarn').textContent = fields.notes?.join(' ') || 'Поля заполнены. Проверьте и сохраните.';
    } catch (err) { toast(err.message); }
  };
  if (!isNew) {
    back.querySelector('#deleteEvent').onclick = async () => {
      if (!confirm('Удалить праздник?')) return;
      await api(`/api/events/${event.id}`, { method: 'DELETE' });
      state.events = state.events.filter((item) => item.id !== event.id);
      state.eventId = '';
      back.remove();
      toast('Праздник удалён');
      await reloadCrm();
      render();
    };
  }
  back.querySelector('#eventForm').onsubmit = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const body = Object.fromEntries(form.entries());
    body.fee = Number(body.fee) || 0;
    body.advance = Number(body.advance) || 0;
    body.guests = String(body.guests || '').split('\n').map((name) => ({ name: name.trim() })).filter((g) => g.name);
    body.teams = String(body.teams || '').split('\n').map((name, index) => ({
      name: name.trim(),
      id: (item.teams || [])[index]?.id,
      color: (item.teams || [])[index]?.color,
      score: (item.teams || [])[index]?.score || 0
    })).filter((t) => t.name);
    body.timing = String(body.timing || '').split('\n').map((line) => {
      const [time, title, note] = line.split('|').map((part) => (part || '').trim());
      return { time, title, note };
    }).filter((row) => row.title);
    try {
      const data = isNew
        ? await api('/api/events', { method: 'POST', body })
        : await api(`/api/events/${event.id}`, { method: 'PATCH', body });
      if (isNew) state.events.push(data.event);
      else state.events = state.events.map((row) => (row.id === data.event.id ? data.event : row));
      state.eventId = data.event.id;
      if (data.warning) toast(data.warning);
      else toast('Сохранено');
      back.remove();
      await reloadCrm();
      render();
    } catch (err) { toast(err.message); }
  };
}

async function reloadCrm() {
  state.crm = await api('/api/crm');
}

document.body.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-act]');
  if (!button) return;
  const actName = button.dataset.act;
  try {
    if (actName === 'goto') return setView(button.dataset.view);
    if (actName === 'new') return openEventModal(null);
    if (actName === 'edit') return openEventModal(state.events.find((item) => item.id === button.dataset.id));
    if (actName === 'day') {
      const found = state.events.find((item) => item.date === button.dataset.date);
      if (found) return openEventModal(found);
      openEventModal({ title: '', type: 'wedding', date: button.dataset.date, time: '18:00', status: 'lead', guests: [], teams: [{ name: 'Команда А', color: '#ff5d78' }, { name: 'Команда Б', color: '#7eb6ff' }], timing: [], fee: 0, advance: 0 });
      return;
    }
    if (actName === 'cal') {
      cal.m += Number(button.dataset.dir);
      if (cal.m < 1) { cal.m = 12; cal.y -= 1; }
      if (cal.m > 12) { cal.m = 1; cal.y += 1; }
      paintCalendar();
      return;
    }
    if (actName === 'screen') {
      const item = selected();
      if (item) window.open(`/s/${item.code}`, 'pultevent-screen');
      return;
    }
    if (actName === 'join') {
      const item = selected();
      if (item) window.open(`/j/${item.code}`, 'pultevent-guest');
      return;
    }
    if (actName === 'copy') {
      const url = `${location.origin}/j/${selected().code}`;
      try {
        await navigator.clipboard.writeText(url);
        toast('Ссылка гостя скопирована');
      } catch {
        toast(url);
      }
      return;
    }
    if (actName === 'tool' || actName === 'open-tool') {
      state.tool = button.dataset.tool;
      state.view = 'remote';
      if (!document.getElementById('toolPanel')) render();
      else { paintTools(); paintPanel(); }
      if (state.tool === 'splash') await act({ action: 'setTool', tool: 'splash' });
      else await act({ action: 'setTool', tool: state.tool });
      paintPanel();
      return;
    }
    if (actName === 'locked') {
      toast(`«${button.dataset.name}» в этой сборке выключен. Проверяйте колесо, таймер, квиз, табло и тайминг.`);
      return;
    }
    if (actName === 'filter') {
      state.catalogFilter = button.dataset.filter;
      renderCatalog();
      return;
    }
    if (actName === 'splash') {
      await act({ action: 'splashUpdate', kicker: document.getElementById('splashKicker').value, title: document.getElementById('splashTitle').value, subtitle: document.getElementById('splashSub').value });
      toast('Заставка на экране');
      return;
    }
    if (actName === 'wheel-save' || actName === 'wheel-from-guests') {
      const names = actName === 'wheel-from-guests'
        ? (selected().guests || []).map((g) => g.name)
        : document.getElementById('wheelNames').value.split('\n');
      await act({ action: 'wheelNames', names });
      paintPanel();
      toast('Имена обновлены');
      return;
    }
    if (actName === 'spin') {
      await act({ action: 'wheelSpin' });
      paintPanel();
      toast('Колесо крутится на экране');
      return;
    }
    if (actName === 'timer') {
      await act({ action: 'timerStart', seconds: Number(button.dataset.sec), label: button.dataset.label || document.getElementById('timerLabel').value });
      paintPanel();
      return;
    }
    if (actName === 'timer-custom') {
      await act({ action: 'timerStart', seconds: Number(document.getElementById('customSec').value), label: document.getElementById('timerLabel').value });
      paintPanel();
      return;
    }
    if (actName === 'pause') {
      await act({ action: state.live.timer.running ? 'timerPause' : 'timerResume' });
      paintPanel();
      return;
    }
    if (actName === 'timer-reset') {
      await act({ action: 'timerReset' });
      paintPanel();
      return;
    }
    if (actName === 'quiz-open') return afterQuiz(await act({ action: 'quizOpen' }));
    if (actName === 'quiz-close') return afterQuiz(await act({ action: 'quizClose' }));
    if (actName === 'quiz-reveal') return afterQuiz(await act({ action: 'quizReveal' }));
    if (actName === 'quiz-next') return afterQuiz(await act({ action: 'quizGoto', index: state.live.quiz.index + 1 }));
    if (actName === 'quiz-prev') return afterQuiz(await act({ action: 'quizGoto', index: state.live.quiz.index - 1 }));
    if (actName === 'quiz-add') {
      const options = document.getElementById('newA').value.split('|').map((x) => x.trim()).filter(Boolean);
      await act({ action: 'quizAdd', q: document.getElementById('newQ').value, options, fact: document.getElementById('newFact').value, correct: 0 });
      paintPanel();
      toast('Вопрос добавлен');
      return;
    }
    if (actName === 'score') {
      await act({ action: 'boardScore', teamId: button.dataset.id, delta: Number(button.dataset.delta) });
      paintPanel();
      return;
    }
    if (actName === 'announce') {
      await act({ action: 'boardAnnounce' });
      paintPanel();
      toast('Победитель на экране');
      return;
    }
    if (actName === 'clear-win') {
      await act({ action: 'boardClear' });
      paintPanel();
      return;
    }
    if (actName === 'timing') {
      await act({ action: 'timingSet', index: Number(button.dataset.index) });
      paintPanel();
      return;
    }
    if (actName === 'timing-next' || actName === 'timing-prev') {
      const dir = actName === 'timing-next' ? 1 : -1;
      await act({ action: 'timingSet', index: state.live.timing.current + dir });
      paintPanel();
      return;
    }
    if (actName === 'reset') {
      await act({ action: 'resetShow' });
      toast('Шоу сброшено');
      paintPanel();
      paintGuests();
      return;
    }
    if (actName === 'plan') {
      const data = await api('/api/billing', { method: 'POST', body: { plan: button.dataset.plan } });
      state.me = data.user;
      toast(data.message);
      render();
      return;
    }
    if (actName === 'logout') {
      await api('/api/auth/logout', { method: 'POST' });
      location.href = '/';
    }
  } catch (err) {
    if (err.message !== 'auth') toast(err.message);
  }
});

function afterQuiz() {
  paintPanel();
  paintGuests();
}

document.body.addEventListener('input', (event) => {
  if (event.target.id === 'catalogQ') {
    state.catalogQuery = event.target.value;
    renderCatalog();
    const input = document.getElementById('catalogQ');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
});

document.getElementById('eventPick').onchange = async (event) => {
  state.eventId = event.target.value;
  localStorage.setItem('pe-event', state.eventId);
  if (state.view === 'remote') {
    try { await loadShow(); } catch (err) { toast(err.message); }
  }
  render();
};
document.getElementById('openScreen').onclick = () => {
  const item = selected();
  if (item) window.open(`/s/${item.code}`, 'pultevent-screen');
};
document.getElementById('openRemote').onclick = () => setView('remote');
document.querySelectorAll('.side [data-view], .bottom-nav [data-view]').forEach((btn) => {
  btn.onclick = () => setView(btn.dataset.view);
});

setInterval(async () => {
  if (state.view !== 'remote' || !selected()) return;
  try {
    await loadShow();
    paintGuests();
  } catch { /* экран сам переживёт короткий обрыв */ }
}, 1000);

(async function init() {
  try {
    const me = await api('/api/auth/me');
    state.me = me.user;
    state.open = !!me.openCabinet;
    if (state.open) {
      const foot = document.querySelector('.side-foot');
      if (foot) foot.textContent = 'Кабинет открыт без пароля. Для проверки включены заставка, колесо, таймер, квиз, табло и тайминг.';
    }
    const [events, catalog, crm] = await Promise.all([api('/api/events'), api('/api/catalog'), api('/api/crm')]);
    state.events = events.events;
    state.catalog = catalog.items;
    state.groups = catalog.groups;
    state.crm = crm;
    const wedding = state.events.find((event) => event.code === 'DEMO24');
    if (!state.eventId && wedding) state.eventId = wedding.id;
    if (!['home', 'events', 'crm', 'remote', 'catalog', 'profile'].includes(state.view)) state.view = 'home';
    document.querySelectorAll('[data-view]').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === state.view));
    if (state.view === 'remote') await loadShow();
    render();
    const wanted = sessionStorage.getItem('pe-plan');
    if (wanted) {
      sessionStorage.removeItem('pe-plan');
      toast('Оплата не проводится. Тариф можно отметить в профиле.');
    }
  } catch (err) {
    if (err.message !== 'auth') toast(err.message);
  }
})();
