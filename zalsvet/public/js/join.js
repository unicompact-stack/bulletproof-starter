const code = location.pathname.split('/').filter(Boolean).pop();
const root = document.getElementById('app');
const storageKey = `pe-guest-${code}`;
let session = null;
try { session = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { session = null; }
let stamp = '';
let choice = null;

function showForm(data) {
  const teams = data.event.teams || [];
  root.innerHTML = `
    <div class="kicker" style="color:#e4c07a">ЗалСвет</div>
    <h1>${esc(data.event.title)}</h1>
    <p class="note">${esc(data.event.venue || '')} · ${esc(formatDate(data.event.date))}</p>
    <form id="joinForm">
      <label for="name">Как вас представить?</label>
      <input id="name" maxlength="40" required placeholder="Имя">
      ${teams.length ? `<label for="team">Команда</label><select id="team">${teams.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select>` : ''}
      <button class="big" type="submit">Я в зале</button>
    </form>
    <p class="note" id="err"></p>`;
  document.getElementById('joinForm').onsubmit = async (event) => {
    event.preventDefault();
    const res = await fetch(`/api/join/${code}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('name').value,
        teamId: document.getElementById('team')?.value
      })
    });
    const body = await res.json();
    if (!res.ok) { document.getElementById('err').textContent = body.error || 'Не получилось'; return; }
    session = { token: body.token, name: body.guest.name, teamId: body.guest.teamId };
    localStorage.setItem(storageKey, JSON.stringify(session));
    stamp = '';
    refresh();
  };
}

function showPlay(data) {
  const live = data.live;
  const q = live.quiz.questions[live.quiz.index];
  const teams = data.event.teams || [];
  const mine = teams.find((t) => t.id === session.teamId);
  let body = '';
  if (live.tool !== 'quiz' || !q) {
    body = `<p class="note">Вы в игре, ${esc(session.name)}. Смотрите на экран зала — вопрос появится здесь, когда ведущий откроет приём.</p>`;
  } else if (live.quiz.phase === 'open' && choice == null) {
    body = `<h2>${esc(q.q)}</h2>${q.options.map((opt, i) => `<button class="optbtn" data-choice="${i}" type="button">${esc(opt)}</button>`).join('')}`;
  } else if (live.quiz.phase === 'open' && choice != null) {
    body = `<h2>${esc(q.q)}</h2><p class="ok">Ответ принят. Можно смотреть на экран.</p>`;
  } else if (live.quiz.phase === 'closed') {
    body = `<h2>${esc(q.q)}</h2><p class="${choice == null ? 'bad' : 'ok'}">${choice == null ? 'Приём уже закрыт, ответ не засчитан.' : 'Ответ принят. Ждём верный вариант.'}</p>`;
  } else if (live.quiz.phase === 'reveal') {
    const right = choice != null && q.correct === choice;
    body = `<h2>${esc(q.q)}</h2><p class="${choice == null ? 'note' : right ? 'ok' : 'bad'}">${choice == null ? 'Вы не успели ответить.' : right ? 'Верно' : 'Мимо'} · правильный ответ: ${esc(q.options[q.correct] || '')}</p><p>${esc(q.fact || '')}</p>`;
  } else {
    body = `<p class="note">Вопрос ${live.quiz.index + 1} ещё не открыт. Смотрите на большой экран и держите телефон рядом.</p>`;
  }
  root.innerHTML = `
    <div class="kicker" style="color:#e4c07a">${esc(data.event.title)}</div>
    <p>${esc(session.name)}${mine ? ` · ${esc(mine.name)}` : ''}</p>
    ${body}
    <div style="margin-top:18px">${teams.map((t) => `<div class="note">${esc(t.name)}: <b style="color:white">${t.score || 0}</b></div>`).join('')}</div>`;
  root.querySelectorAll('[data-choice]').forEach((button) => {
    button.onclick = () => send(Number(button.dataset.choice));
  });
}

async function send(value) {
  const res = await fetch(`/api/join/${code}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: session.token, choice: value })
  });
  const body = await res.json();
  if (!res.ok) {
    root.insertAdjacentHTML('beforeend', `<p class="bad">${esc(body.error || 'Не отправилось')}</p>`);
    return;
  }
  choice = value;
  stamp = '';
  refresh();
}

async function refresh() {
  const res = await fetch(`/api/public/${code}`);
  if (!res.ok) { root.innerHTML = '<h1>Комната не найдена</h1>'; return; }
  const data = await res.json();
  if (data.live.quiz.phase !== 'open' && data.live.quiz.phase !== 'closed' && data.live.quiz.phase !== 'reveal') choice = null;
  if (data.live.quiz.phase === 'idle') choice = null;
  const next = `${session ? 'in' : 'out'}|${data.live.tool}|${data.live.quiz.phase}|${data.live.quiz.index}|${choice}|${data.live.updatedAt}`;
  if (next === stamp) return;
  stamp = next;
  if (!session) showForm(data);
  else showPlay(data);
}

refresh();
setInterval(refresh, 800);
