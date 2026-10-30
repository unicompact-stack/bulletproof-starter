/* Праздник Рядом — приложение-суфлёр.
   Без зависимостей. Всё состояние — в localStorage. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const LS = 'pr_sufler_v1';
const pad = n => String(n).padStart(2, '0');

const store = {
  get() { try { return localStorage.getItem(LS); } catch (e) { return null; } },
  set(v) { try { localStorage.setItem(LS, v); } catch (e) {} },
  del() { try { localStorage.removeItem(LS); } catch (e) {} }
};

const todayKey = () => new Date().toISOString().slice(0, 10);
const scen = id => SCENARIOS.find(s => s.id === id) || SCENARIOS[0];

let firstRun = false;

function loadState() {
  let saved = null;
  try { saved = JSON.parse(store.get() || 'null'); } catch (e) {}
  const sc = scen((saved && saved.sid) || 'dima10');
  const st = Object.assign({
    sid: sc.id, idx: 0, manual: false, startedAt: null, enteredAt: Date.now(),
    cake: sc.defaults.cake || '', name: 'Дима', host: '', fs: 1, theme: 'dark',
    checks: {}, day: todayKey()
  }, saved || {});

  // Новый день или первый запуск: ставим план «на сейчас», торт — через час.
  if (!saved || st.day !== todayKey() || !st.startedAt) {
    firstRun = true;
    const now = Date.now();
    st.day = todayKey();
    st.startedAt = now;
    st.enteredAt = now;
    st.manual = false;
    st.idx = 0;
    st.cake = fmt(now + 60 * 60000);
  }
  return st;
}
let S = loadState();
const save = () => store.set(JSON.stringify(S));

function atTime(hhmm) {
  const [h, m] = (hhmm || '15:00').split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}
function fmt(ts) { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function mmss(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return Math.floor(s / 60) + ':' + pad(s % 60);
}
const fill = t => String(t)
  .replace(/\[имя\]/g, S.host || '[ваше имя]')
  .replace(/\[ребёнок\]/g, S.name || 'именинник');
const blocks = () => scen(S.sid).blocks;
const block = () => blocks()[Math.min(S.idx, blocks().length - 1)];
function offsetBefore(i) { return blocks().slice(0, i).reduce((a, b) => a + b.dur, 0); }
function blockStart(i) { return S.startedAt + offsetBefore(i) * 60000; }
function blockEnd(i) { return blockStart(i) + blocks()[i].dur * 60000; }

function remainingMs() {
  const b = block();
  if (S.manual) return Math.max(0, b.dur * 60000 - (Date.now() - S.enteredAt));
  return Math.max(0, blockEnd(S.idx) - Date.now());
}
function autoIndex() {
  const el = (Date.now() - S.startedAt) / 60000;
  let acc = 0;
  for (let i = 0; i < blocks().length; i++) {
    if (el < acc + blocks()[i].dur) return i;
    acc += blocks()[i].dur;
  }
  return blocks().length - 1;
}

/* ─────────── Рендер ─────────── */
function render() {
  const sc = scen(S.sid);
  const b = block();
  $('#scName').textContent = sc.title;
  document.documentElement.style.setProperty('--fs', S.fs);
  document.documentElement.dataset.theme = S.theme;

  // прогресс
  const pr = $('#progress');
  pr.innerHTML = '';
  blocks().forEach((bl, i) => {
    const d = document.createElement('div');
    d.className = 'seg' + (i < S.idx ? ' done' : i === S.idx ? ' now' : '');
    d.title = bl.title;
    d.onclick = () => goto(i);
    pr.appendChild(d);
  });

  // заголовок блока
  $('#bTime').textContent = fmt(blockStart(S.idx)) + ' – ' + fmt(blockEnd(S.idx));
  $('#bTitle').textContent = b.title;
  $('#bDur').textContent = b.dur + ' мин';

  // говорю
  const say = $('#bSay');
  say.innerHTML = '';
  (b.say || []).forEach(line => {
    const p = document.createElement('p');
    p.textContent = fill(line);
    if (line.includes('?')) p.classList.add('q');
    say.appendChild(p);
  });

  // делаю
  const todo = $('#bTodo');
  todo.innerHTML = '';
  (b.todo || []).forEach((t, i) => {
    const li = document.createElement('li');
    const key = b.id + ':' + i;
    if (S.checks[key]) li.classList.add('done');
    li.innerHTML = '<b>' + (S.checks[key] ? '✓' : '') + '</b><span></span>';
    li.querySelector('span').textContent = fill(t);
    li.onclick = () => { S.checks[key] = !S.checks[key]; save(); render(); };
    todo.appendChild(li);
  });

  // мета
  const meta = $('#bMeta');
  meta.innerHTML = '';
  if (b.music) meta.insertAdjacentHTML('beforeend', '<span>🎵 ' + b.music + '</span>');
  if (b.game) meta.insertAdjacentHTML('beforeend', '<span>🎲 ' + b.game + '</span>');
  $('#bAvoid').innerHTML = b.avoid ? '<b>Не делать:</b> ' + b.avoid : '';

  const nb = blocks()[S.idx + 1];
  $('#bNext').innerHTML = nb
    ? 'Дальше: <b>' + nb.icon + ' ' + nb.title + '</b> · ' + nb.dur + ' мин'
    : 'Это последний блок. Финал.';
  $('#nextLabel').textContent = nb ? nb.dur + ' мин' : 'финал';

  $('#btnPrompter').disabled = !(b.say && b.say.length);
  tick();
}

function tick() {
  const now = new Date();
  $('#clock').textContent = fmt(now.getTime());

  // торт
  const cake = $('#cake');
  if (S.cake) {
    const diff = atTime(S.cake) - now.getTime();
    if (diff > 0) {
      const m = Math.ceil(diff / 60000);
      cake.textContent = 'торт через ' + m + ' мин (' + S.cake + ')';
      cake.classList.toggle('soon', diff < 6 * 60000);
    } else {
      cake.textContent = 'торт: ' + S.cake + ' · уже пора';
      cake.classList.remove('soon');
    }
  } else { cake.textContent = 'торт не задан'; }

  // авто-переход по плану
  if (!S.manual) {
    const ai = autoIndex();
    if (ai !== S.idx) { S.idx = ai; save(); render(); return; }
  }

  const rem = remainingMs();
  const b = block();
  $('#remain').textContent = mmss(rem);
  const fill = $('#fill');
  const pct = rem / (b.dur * 60000) * 100;
  fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
  fill.classList.toggle('low', rem < 45000);

  if ($('#prompter').classList.contains('open')) renderPrompter();
}

function goto(i) {
  S.idx = Math.max(0, Math.min(i, blocks().length - 1));
  S.manual = true;
  S.enteredAt = Date.now();
  save(); render();
}
function next() { if (S.idx < blocks().length - 1) goto(S.idx + 1); else toast('Это последний блок'); }
function prev() { goto(S.idx - 1); }
function shift(sec) {
  const rem = remainingMs();
  const b = block();
  S.manual = true;
  S.enteredAt = Date.now() - (b.dur * 60000 - rem - sec * 1000);
  save(); tick();
}

/* ─────────── Оверлеи ─────────── */
function open(id) { $('#' + id).classList.add('open'); }
function closeAll() { $$('.sheet').forEach(s => s.classList.remove('open')); }

// ситуация ищет блок по роли, потом по id, потом по «активности»
function findBlock(key) {
  if (!key) return -1;
  const byRole = blocks().findIndex(b => b.role === key);
  if (byRole >= 0) return byRole;
  const byId = blocks().findIndex(b => b.id === key);
  if (byId >= 0) return byId;
  if (key !== 'active') return findBlock('active');
  return blocks().findIndex(b => b.role === 'quiz');
}

function renderSituations() {
  const g = $('#sitGrid');
  g.innerHTML = '';
  SITUATIONS.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'card';
    b.innerHTML = '<div class="t">' + s.icon + ' ' + s.title + '</div>';
    b.onclick = () => showSituation(i);
    g.appendChild(b);
  });
}
function showSituation(i) {
  const s = SITUATIONS[i];
  $('#sitTitle').textContent = s.title;
  const body = $('#sitBody');
  body.innerHTML = '';
  const ol = document.createElement('ol');
  ol.className = 'big-action';
  s.action.forEach(a => {
    const li = document.createElement('li');
    li.textContent = a;
    ol.appendChild(li);
  });
  body.appendChild(ol);
  const ph = document.createElement('div');
  ph.className = 'phrase';
  ph.innerHTML = '<h3>Сказать</h3><p>' + fill(s.phrase) + '</p>';
  body.appendChild(ph);

  if (s.change) {
    const ch = document.createElement('div');
    ch.className = 'changebox';
    ch.innerHTML = '<b>Что меняется</b><span></span>';
    ch.querySelector('span').textContent = s.change;
    body.appendChild(ch);
  }

  const g = $('#sitGoto');
  const target = findBlock(s.goto);
  if (target >= 0) {
    g.style.display = '';
    g.textContent = 'К блоку: ' + blocks()[target].title;
    g.onclick = () => { closeAll(); goto(target); };
  } else { g.style.display = 'none'; }

  open('sheetSitOne');
}

let gFilter = 'Все', gQuery = '';
function renderGames() {
  const chips = $('#gChips');
  if (!chips.dataset.done) {
    ['Все', '8–11', '11–15', '12–15', '8–15'].forEach(f => {
      const c = document.createElement('button');
      c.className = 'chip' + (f === gFilter ? ' on' : '');
      c.textContent = f;
      c.onclick = () => { gFilter = f; chips.dataset.done = ''; renderGames(); };
      chips.appendChild(c);
    });
    chips.dataset.done = '1';
  }
  const grid = $('#gGrid');
  grid.innerHTML = '';
  const q = gQuery.toLowerCase().trim();
  const list = GAMES.filter(g => {
    const okAge = gFilter === 'Все' || g.age.includes(gFilter.replace('–', '–'));
    const okQ = !q || (g.name + ' ' + g.how + ' ' + g.inv).toLowerCase().includes(q);
    return okAge && okQ;
  });
  if (!list.length) { grid.innerHTML = '<div class="empty">Ничего не нашлось</div>'; return; }
  list.forEach(g => {
    const b = document.createElement('button');
    b.className = 'card';
    b.innerHTML = '<div class="t">№' + g.n + ' ' + g.name + '</div><div class="s">' + g.age + ' · ' + g.min + ' мин · ' + g.inv + '</div>';
    b.onclick = () => showGame(g);
    grid.appendChild(b);
  });
}
function showGame(g) {
  $('#gameTitle').textContent = '№' + g.n + ' ' + g.name;
  const body = $('#gameBody');
  body.innerHTML =
    '<div class="meta" style="margin-bottom:12px"><span>' + g.age + '</span><span>' + g.min + ' мин</span><span>' + g.inv + '</span></div>' +
    '<div class="panel"><h2>Как играть</h2><p style="font-size:19px;margin:0">' + g.how + '</p></div>' +
    '<div class="panel" style="margin-top:10px"><h2>Если не пошло</h2><p style="font-size:17px;margin:0;color:var(--muted)">' + g.fail + '</p></div>';
  open('sheetGameOne');
}

function renderPhrases() {
  const b = $('#phraseBody');
  b.innerHTML = '';
  PHRASES.forEach(p => {
    const d = document.createElement('div');
    d.className = 'phrase';
    d.innerHTML = '<h3>' + p.h + '</h3><p>' + fill(p.t) + '</p>';
    b.appendChild(d);
  });
}

function renderChecklist() {
  const b = $('#checkBody');
  b.innerHTML = '';
  CHECKLIST.forEach(g => {
    const h = document.createElement('h3');
    h.className = 'group';
    h.textContent = g.g;
    b.appendChild(h);
    g.items.forEach((it, i) => {
      const key = 'c:' + g.g + ':' + i;
      const d = document.createElement('div');
      d.className = 'check' + (S.checks[key] ? ' on' : '');
      d.innerHTML = '<b>' + (S.checks[key] ? '✓' : '') + '</b><span></span>';
      d.querySelector('span').textContent = it;
      d.onclick = () => { S.checks[key] = !S.checks[key]; save(); renderChecklist(); };
      b.appendChild(d);
    });
  });
}

function renderScenarios() {
  const g = $('#scGrid');
  g.innerHTML = '';
  SCENARIOS.forEach(sc => {
    const b = document.createElement('button');
    b.className = 'card';
    b.innerHTML = '<div class="t">' + (sc.id === S.sid ? '✓ ' : '') + sc.title + '</div><div class="s">' + sc.subtitle + '</div>';
    b.onclick = () => {
      S.sid = sc.id;
      S.idx = 0; S.manual = false;
      // если заявленное время уже прошло — считаем от «сейчас»
      S.startedAt = Math.max(Date.now(), atTime(sc.defaults.start || '15:00'));
      S.cake = fmt(S.startedAt + 60 * 60000);
      S.enteredAt = Date.now();
      save(); closeAll(); render(); toast('Сценарий: ' + sc.title);
    };
    g.appendChild(b);
  });
}

function renderSettings() {
  $('#inpStart').value = fmt(S.startedAt);
  $('#inpCake').value = S.cake;
  $('#inpKids').value = S.name;
  $('#inpHost').value = S.host;
  $$('[data-fs]').forEach(c => c.classList.toggle('on', Number(c.dataset.fs) === S.fs));
  $$('[data-theme]').forEach(c => { if (c.dataset.theme) c.classList.toggle('on', c.dataset.theme === S.theme); });
}

/* ─────────── Суфлёр ─────────── */
let pIdx = 0;
function openPrompter() {
  pIdx = 0;
  $('#prompter').classList.add('open');
  try { if ('wakeLock' in navigator) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
  renderPrompter();
}
function renderPrompter() {
  const b = block();
  const lines = b.say || [];
  $('#pTitle').textContent = b.title;
  $('#pClock').textContent = fmt(Date.now());
  const dots = $('#pDots');
  dots.innerHTML = lines.map((_, i) => '<i class="' + (i === pIdx ? 'on' : '') + '"></i>').join('');
  $('#pText').innerHTML = '<p>' + fill(lines[pIdx] || '—') + '</p>';
}
function pMove(d) {
  const lines = block().say || [];
  pIdx = Math.max(0, Math.min(pIdx + d, lines.length - 1));
  renderPrompter();
}

/* ─────────── Прочее ─────────── */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
}

/* ─────────── События ─────────── */
$('#prev').onclick = prev;
$('#next').onclick = next;
$('#minus').onclick = () => shift(-60);
$('#plus').onclick = () => shift(60);
$('#btnMenu').onclick = () => open('sheetMenu');
$('#btnSit').onclick = () => { renderSituations(); open('sheetSit'); };
$('#btnGames').onclick = () => { renderGames(); open('sheetGames'); };

$('#btnPrompter').onclick = openPrompter;
$('#pPrev').onclick = e => { e.stopPropagation(); pMove(-1); };
$('#pNext').onclick = e => { e.stopPropagation(); pMove(1); };
$('#pClose').onclick = e => { e.stopPropagation(); $('#prompter').classList.remove('open'); };
$('#pText').onclick = () => pMove(1);

$$('[data-close]').forEach(b => b.onclick = () => { const s = b.closest('.sheet'); if (s) s.classList.remove('open'); });
$$('[data-open]').forEach(b => b.onclick = () => {
  const k = b.dataset.open;
  closeAll();
  if (k === 'scenarios') { renderScenarios(); open('sheetScenarios'); }
  if (k === 'phrases') { renderPhrases(); open('sheetPhrases'); }
  if (k === 'checklist') { renderChecklist(); open('sheetChecklist'); }
  if (k === 'settings') { renderSettings(); open('sheetSettings'); }
});

// игры
$('#gSearch').oninput = e => { gQuery = e.target.value; renderGames(); };
// ситуации
$('#sitBack').onclick = () => { $('#sheetSitOne').classList.remove('open'); };

// настройки
$$('[data-fs]').forEach(c => c.onclick = () => { S.fs = Number(c.dataset.fs); save(); renderSettings(); render(); });
$$('[data-theme]').forEach(c => c.onclick = () => { if (!c.dataset.theme) return; S.theme = c.dataset.theme; save(); renderSettings(); render(); });
$('#inpStart').onchange = e => {
  const v = e.target.value;
  if (/^\d{1,2}:\d{2}$/.test(v)) { S.startedAt = atTime(v); S.manual = false; S.idx = 0; save(); render(); }
};
$('#inpCake').onchange = e => { S.cake = e.target.value; save(); tick(); };
$('#inpKids').onchange = e => { S.name = e.target.value; save(); render(); };
$('#inpHost').onchange = e => { S.host = e.target.value; save(); render(); };
$('#btnRestart').onclick = () => { S.idx = 0; S.manual = false; S.startedAt = Date.now(); S.enteredAt = Date.now(); save(); closeAll(); render(); toast('Начали с начала'); };
$('#btnResetAll').onclick = () => { store.del(); S = loadState(); closeAll(); render(); toast('Сброшено'); };

// клавиатура (для проверки за компьютером)
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') next();
  if (e.key === 'ArrowLeft') prev();
  if (e.key === 'Escape') { closeAll(); $('#prompter').classList.remove('open'); }
  if (e.key.toLowerCase() === 's') { renderSituations(); open('sheetSit'); }
  if (e.key.toLowerCase() === 'g') { renderGames(); open('sheetGames'); }
  if (e.key.toLowerCase() === 'f') openPrompter();
});

// не гасим экран на выезде
document.addEventListener('click', () => {
  try { if ('wakeLock' in navigator) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
}, { once: true });

// офлайн (в песочнице предпросмотра может быть запрещено — не роняем приложение)
try {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
} catch (e) {}

window.__appReady = true;

// старт
renderSituations(); renderGames();
render();
if (firstRun) {
  setTimeout(() => toast('План на сейчас · торт в ' + S.cake), 600);
  if (!S.host) setTimeout(() => toast('Меню → Настройки: впишите своё имя для приветствия'), 3400);
}
setInterval(tick, 1000);
