const code = location.pathname.split('/').filter(Boolean).pop();
const stage = document.getElementById('stage');
const soundBtn = document.getElementById('sound');
const fx = document.getElementById('fx');
let audioOn = false;
let signature = '';
let lastChime = 0;
let celebrated = false;
let currentLive = null;

if (location.search.includes('embed=1')) document.body.classList.add('embed');

soundBtn.onclick = async () => {
  audioOn = true;
  soundBtn.style.display = 'none';
  const ctx = audioCtx();
  if (ctx.state === 'suspended') await ctx.resume();
  tone(660, 0.08);
};

window.addEventListener('message', async (event) => {
  if (event.origin !== location.origin || !event.data) return;
  if (event.data.type === 'sound') {
    audioOn = !!event.data.on;
    if (audioOn) {
      const ctx = audioCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      soundBtn.style.display = 'none';
    }
  }
  if (event.data.type === 'zoom') {
    document.documentElement.style.setProperty('--stage-zoom', String((Number(event.data.value) || 100) / 100));
  }
});

function audioCtx() {
  if (!audioCtx.ctx) audioCtx.ctx = new AudioContext();
  return audioCtx.ctx;
}

function tone(freq, dur, type = 'sine') {
  if (!audioOn) return;
  const ctx = audioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  osc.start();
  osc.stop(ctx.currentTime + dur + 0.02);
}

function confetti() {
  const canvas = fx;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const parts = Array.from({ length: 140 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 240,
    v: 2 + Math.random() * 4,
    s: 5 + Math.random() * 7,
    c: ['#e4c07a', '#ff5d78', '#7eb6ff', '#3ddeb4', '#fff'][Math.floor(Math.random() * 5)]
  }));
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts.forEach((p) => {
      p.y += p.v;
      p.x += Math.sin(p.y / 18);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, p.s, p.s * 0.55);
    });
    if (++frame < 200) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

function drawWheel(canvas, names) {
  const size = 900;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  const seg = (Math.PI * 2) / Math.max(1, names.length);
  names.forEach((name, i) => {
    ctx.beginPath();
    ctx.moveTo(r, r);
    ctx.fillStyle = ['#e23b55', '#1c2433', '#d7b06a', '#2a3344'][i % 4];
    ctx.arc(r, r, r - 6, i * seg - Math.PI / 2, (i + 1) * seg - Math.PI / 2);
    ctx.fill();
    ctx.save();
    ctx.translate(r, r);
    ctx.rotate((i + 0.5) * seg - Math.PI / 2);
    ctx.fillStyle = '#fff';
    ctx.font = '700 28px Manrope, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(name).slice(0, 16), r - 36, 10);
    ctx.restore();
  });
}

let slideTimer = 0;
let lastOverlay = 0;

function symbolSvg() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="28" cy="34" r="12" fill="none" stroke="#fff" stroke-width="3"/><path d="M37 25l14-14M51 11h-12M51 11v12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`;
}

function mountSplash(event, live) {
  clearInterval(slideTimer);
  const splash = live.splash || {};
  const title = splash.title || 'Добро пожаловать!';
  const mode = splash.mode || 'normal';
  const photos = splash.photos || [];
  let media = '';
  if ((mode === 'photo' || mode === 'slideshow') && photos.length) {
    media = `<img class="splash-photo" id="splashPhoto" alt="" src="${esc(photos[0])}">`;
  } else if (mode === 'video' && splash.video) {
    media = `<video class="splash-video" src="${esc(splash.video)}" autoplay muted loop playsinline></video>`;
  }
  stage.innerHTML = `
    <div class="splash-scene tpl-${esc(splash.template || 'gold')} ${media ? 'has-media' : ''}">
      ${media}
      <div class="splash-card">
        ${mode === 'photo' || mode === 'video' ? '' : `<div class="splash-symbol">${symbolSvg()}</div>`}
        <div class="splash-frame"><div class="splash-title">${esc(title)}</div></div>
        ${splash.subtitle ? `<div class="splash-sub">${esc(splash.subtitle)}</div>` : ''}
      </div>
    </div>`;
  if (mode === 'slideshow' && photos.length > 1) {
    let index = 0;
    slideTimer = setInterval(() => {
      index = (index + 1) % photos.length;
      const img = document.getElementById('splashPhoto');
      if (img) img.src = photos[index];
    }, 3800);
  }
}

function salute() {
  const canvas = fx;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const bursts = Array.from({ length: 6 }, () => ({
    x: 40 + Math.random() * (canvas.width - 80),
    y: canvas.height + 10,
    ty: 40 + Math.random() * canvas.height * 0.42,
    exploded: false,
    parts: []
  }));
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    bursts.forEach((burst) => {
      if (!burst.exploded) {
        burst.y -= 9;
        ctx.fillStyle = '#ffe7a3';
        ctx.fillRect(burst.x, burst.y, 3, 10);
        if (burst.y <= burst.ty) {
          burst.exploded = true;
          burst.parts = Array.from({ length: 32 }, () => ({
            x: burst.x,
            y: burst.y,
            vx: (Math.random() - 0.5) * 7,
            vy: (Math.random() - 0.5) * 7,
            c: ['#ffe08a', '#ff5d8f', '#fff', '#7ee0ff'][Math.floor(Math.random() * 4)]
          }));
        }
      } else {
        burst.parts.forEach((part) => {
          part.x += part.vx;
          part.y += part.vy;
          part.vy += 0.06;
          ctx.fillStyle = part.c;
          ctx.fillRect(part.x, part.y, 3, 3);
        });
      }
    });
    if (++frame < 130) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

function fanfare() {
  [523, 659, 784, 1046].forEach((freq, i) => setTimeout(() => tone(freq, 0.22), i * 140));
}

function playOverlay(type) {
  if (type === 'salute') {
    salute();
    tone(880, 0.12);
    setTimeout(() => tone(1175, 0.18), 160);
  } else if (type === 'fanfare') fanfare();
  else if (type === 'confetti') {
    confetti();
    tone(660, 0.12);
    setTimeout(() => tone(880, 0.16), 120);
  }
}

function mountWheel(live) {
  const names = live.wheel.names || [];
  stage.innerHTML = `
    <div>
      <div class="kicker">Колесо гостей</div>
      <div class="wheel-box">
        <div class="pointer"></div>
        <canvas class="wheel" id="wheel"></canvas>
        <div class="hub">PULT</div>
      </div>
      <div class="winner" id="winner" style="display:none"><span>Выпадает</span><b></b></div>
    </div>`;
  const canvas = document.getElementById('wheel');
  canvas.style.display = 'block';
  drawWheel(canvas, names);
  const elapsed = live.wheel.startedAt ? Date.now() - live.wheel.startedAt : live.wheel.duration;
  const remaining = Math.max(0, (live.wheel.duration || 5400) - elapsed);
  const progress = live.wheel.duration ? Math.min(1, elapsed / live.wheel.duration) : 1;
  const from = (live.wheel.rotation || 0) - (1 - progress) * 360 * 8;
  canvas.style.transition = 'none';
  canvas.style.transform = `rotate(${from}deg)`;
  requestAnimationFrame(() => {
    canvas.style.transition = `transform ${remaining}ms cubic-bezier(.12,.72,.08,1)`;
    canvas.style.transform = `rotate(${live.wheel.rotation || 0}deg)`;
  });
  const show = () => {
    if (!live.wheel.winner) return;
    const box = document.getElementById('winner');
    if (!box) return;
    box.style.display = 'block';
    box.querySelector('b').textContent = live.wheel.winner;
    tone(520, 0.12);
    setTimeout(() => tone(780, 0.16), 120);
  };
  if (remaining <= 40) show();
  else setTimeout(show, remaining);
}

function mountTimer(live) {
  stage.innerHTML = `
    <div>
      <div class="kicker">${esc(live.timer.label || 'Таймер')}</div>
      <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="track" cx="60" cy="60" r="52"></circle>
        <circle class="value" id="ring" cx="60" cy="60" r="52"></circle>
      </svg>
      <div class="timer-num" id="digits">00:00</div>
    </div>`;
  const ring = document.getElementById('ring');
  const c = 2 * Math.PI * 52;
  ring.style.strokeDasharray = String(c);
  ring.dataset.c = String(c);
}

function updateTimer(live) {
  const digits = document.getElementById('digits');
  const ring = document.getElementById('ring');
  if (!digits || !ring) return;
  const left = timerLeft(live.timer);
  digits.textContent = formatMs(left);
  const total = Math.max(1, Number(live.timer.totalMs) || 1);
  const c = Number(ring.dataset.c);
  ring.style.strokeDashoffset = String(c * (1 - left / total));
  if (left <= 10000 && left > 0) digits.style.color = '#ff5d78';
  else digits.style.color = '';
  if (live.timer.running && left === 0 && lastChime !== live.timer.endsAt) {
    lastChime = live.timer.endsAt;
    tone(440, 0.18);
    setTimeout(() => tone(660, 0.22), 180);
    setTimeout(() => tone(880, 0.28), 360);
  }
}

function mountQuiz(event, live) {
  const q = live.quiz.questions[live.quiz.index];
  if (!q) {
    stage.innerHTML = '<div><div class="kicker">Квиз</div><h1>Вопросов пока нет</h1></div>';
    return;
  }
  const letters = ['A', 'B', 'C', 'D'];
  stage.innerHTML = `
    <div style="width:min(980px,94vw)">
      <div class="kicker">Вопрос ${live.quiz.index + 1} из ${live.quiz.questions.length} · ${esc(phaseText(live.quiz.phase))}</div>
      <h1 style="font-size:clamp(32px,4.6vw,68px)">${esc(q.q)}</h1>
      <div class="opts">
        ${q.options.map((opt, i) => `
          <div class="opt ${live.quiz.phase === 'reveal' && q.correct === i ? 'good' : ''}">
            <b>${letters[i]}</b>
            <div>
              <div>${esc(opt)}</div>
              <div class="bar"><i id="bar${i}"></i></div>
            </div>
            <b id="cnt${i}">0</b>
          </div>`).join('')}
      </div>
      <p class="sub" id="fact">${live.quiz.phase === 'reveal' ? esc(q.fact || '') : ''}</p>
    </div>`;
  updateQuiz(live);
}

function updateQuiz(live) {
  const counts = live.quiz.counts || [];
  const max = Math.max(1, ...counts, 1);
  counts.forEach((count, i) => {
    const bar = document.getElementById(`bar${i}`);
    const num = document.getElementById(`cnt${i}`);
    if (bar) bar.style.width = `${(count / max) * 100}%`;
    if (num) num.textContent = count;
  });
}

function phaseText(phase) {
  return { idle: 'скоро вопрос', open: 'отвечайте', closed: 'приём закрыт', reveal: 'верный ответ' }[phase] || phase;
}

function mountBoard(live) {
  const teams = live.board.teams || [];
  const max = Math.max(1, ...teams.map((t) => t.score || 0));
  const winner = teams.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  stage.innerHTML = `
    <div style="width:min(1100px,94vw)">
      <div class="kicker">${live.board.announced ? 'Победитель' : 'Табло команд'}</div>
      ${live.board.announced && winner ? `<h1>${esc(winner.name)}</h1>` : '<h1 style="font-size:42px">Счёт вечера</h1>'}
      <div class="board">
        ${teams.map((t) => `
          <div class="col" style="border-top:6px solid ${esc(t.color)};min-height:${120 + ((t.score || 0) / max) * 180}px">
            <div>${esc(t.name)}</div>
            <div class="pts">${t.score || 0}</div>
          </div>`).join('')}
      </div>
    </div>`;
  if (live.board.announced && !celebrated) {
    celebrated = true;
    confetti();
    tone(523, 0.15);
    setTimeout(() => tone(659, 0.18), 140);
    setTimeout(() => tone(784, 0.24), 280);
  }
  if (!live.board.announced) celebrated = false;
}

function mountTiming(live) {
  const items = live.timing.items || [];
  stage.innerHTML = `
    <div>
      <div class="kicker">Тайминг вечера</div>
      <h1 style="font-size:clamp(32px,5vw,64px)">${esc((items[live.timing.current] || {}).title || 'Программа')}</h1>
      <div class="timeline">
        ${items.map((item, i) => `
          <div class="block ${i === live.timing.current ? 'on' : ''}">
            <b>${esc(item.time || '')}</b>
            <div><div class="ttl">${esc(item.title)}</div><small>${esc(item.note || '')}</small></div>
          </div>`).join('')}
      </div>
    </div>`;
}

function sign(live) {
  const splash = live.splash || {};
  return [
    live.tool,
    live.wheel.spinId,
    live.timer.endsAt,
    live.timer.running,
    live.timer.label,
    live.quiz.phase,
    live.quiz.index,
    live.board.announced,
    JSON.stringify(live.board.teams),
    live.timing.current,
    splash.title,
    splash.subtitle,
    splash.mode,
    splash.template,
    (splash.photos || []).join(','),
    splash.video
  ].join('|');
}

function render(event, live) {
  document.title = `${event.title} — экран`;
  stage.classList.toggle('on-splash', live.tool === 'splash' || !live.tool);
  if (live.tool === 'wheel') mountWheel(live);
  else if (live.tool === 'timer') mountTimer(live);
  else if (live.tool === 'quiz') mountQuiz(event, live);
  else if (live.tool === 'board') mountBoard(live);
  else if (live.tool === 'timing') mountTiming(live);
  else mountSplash(event, live);
}

async function poll() {
  try {
    const res = await fetch(`/api/public/${code}`);
    if (!res.ok) {
      stage.innerHTML = '<div><h1>Комната не найдена</h1><p>Проверьте код экрана.</p></div>';
      return;
    }
    const data = await res.json();
    currentLive = data.live;
    const overlay = data.live.overlay;
    if (overlay && overlay.id && overlay.id !== lastOverlay) {
      lastOverlay = overlay.id;
      if (Date.now() - (overlay.at || 0) < 4000) playOverlay(overlay.type);
    }
    const next = sign(data.live);
    if (next !== signature) {
      signature = next;
      render(data.event, data.live);
    } else if (data.live.tool === 'quiz') updateQuiz(data.live);
    if (data.live.tool === 'timer') updateTimer(data.live);
  } catch {
    stage.innerHTML = '<div><h1>Нет связи со сценой</h1></div>';
  }
}

poll();
setInterval(poll, 700);
requestAnimationFrame(function tick() {
  if (currentLive && currentLive.tool === 'timer') updateTimer(currentLive);
  requestAnimationFrame(tick);
});
