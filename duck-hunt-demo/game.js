const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const wrap = document.getElementById('canvasWrap');
const scoreEl = document.getElementById('score');
const roundEl = document.getElementById('round');
const ammoEl = document.getElementById('ammo');
const bestEl = document.getElementById('best');
const messageEl = document.getElementById('message');
const statusText = document.getElementById('statusText');
const statusDot = document.querySelector('.status-dot');
const aimHint = document.getElementById('aimHint');
const shotFlash = document.getElementById('shotFlash');
const startButton = document.getElementById('startButton');
const soundButton = document.getElementById('soundButton');
const pauseButton = document.getElementById('pauseButton');
const roundProgress = document.getElementById('roundProgress');
const waveLabel = document.getElementById('waveLabel');

let W = 960, H = 540, running = false, score = 0, ammo = 3, round = 1;
let ducks = [], fallenDucks = [], pointer = { x: W / 2, y: H / 2 }, lastTime = 0, raf;
let best = Number(localStorage.getItem('duck-hunt-best') || 0);
let soundOn = true, paused = false, waveHits = 0;
let particles = [], floatingTexts = [], recoil = 0, audioContext;
let grass = [], trees = [], clouds = [];

bestEl.textContent = String(best).padStart(4, '0');

function resize() {
  const r = wrap.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = r.width; H = r.height;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  makeScene(); draw();
}
window.addEventListener('resize', resize);

function makeScene() {
  grass = Array.from({ length: Math.ceil(W / 8) + 20 }, (_, i) => ({
    x: i * 8 + Math.random() * 5, h: 6 + Math.random() * 19, lean: (Math.random() - .5) * 8, color: Math.random() > .5 ? '#427550' : '#68985b'
  }));
  trees = [
    { x: W * .055, y: H * .68, s: 1.13 }, { x: W * .15, y: H * .7, s: .72 },
    { x: W * .87, y: H * .7, s: 1.08 }, { x: W * .96, y: H * .69, s: .68 }
  ];
  clouds = [{ x: W * .12, y: H * .15, s: 1.1 }, { x: W * .53, y: H * .2, s: .62 }, { x: W * .82, y: H * .1, s: .75 }];
}
function makeDuck(index = 0) {
  const species = [
    { name: 'Коричневая', points: 100, body: '#5a382b', wing: '#b9784c', head: '#2f9771' },
    { name: 'Рыжая', points: 250, body: '#87502f', wing: '#d48a45', head: '#2e866d' },
    { name: 'Тёмная', points: 500, body: '#303b3c', wing: '#536466', head: '#245e59' }
  ][(round + index) % 3];
  const speed = 105 + round * 24 + Math.random() * 35;
  return { x: W * .12 + Math.random() * W * .76, y: H * .22 + Math.random() * H * .32,
    vx: (Math.random() > .5 ? 1 : -1) * speed, vy: (Math.random() - .5) * (45 + round * 8),
    r: Math.max(23, Math.min(W, H) * (.063 - round * .003)), wing: Math.random() * 6,
    born: performance.now(), flapRate: 11 + Math.random() * 3, nextQuack: performance.now() + 900 + Math.random() * 1800,
    phase: Math.random() * 6, turn: 1 + Math.random() * 2, points: species.points, body: species.body, wingColor: species.wing, head: species.head };
}
function spawnWave() { ducks = []; const count = Math.min(2 + round - 1, 6); for (let i = 0; i < count; i++) ducks.push(makeDuck(i)); }
function resetDuck() { spawnWave(); }
function updateHud() { scoreEl.textContent = String(score).padStart(4, '0'); ammoEl.textContent = ammo; roundEl.textContent = `${round} / 5`; const count = Math.min(1 + round, 6); roundProgress.innerHTML = ''; for (let i = 0; i < count; i++) { const dot = document.createElement('i'); dot.className = i < waveHits ? 'done' : (i === ducks.length ? 'current' : ''); roundProgress.appendChild(dot); } waveLabel.textContent = `${count} целей · стая ${round} из 5`; }
function start() {
  cancelAnimationFrame(raf); ensureAudio(); score = 0; ammo = 3; round = 1; waveHits = 0; ducks = []; fallenDucks = []; particles = []; floatingTexts = [];
  running = true; paused = false; pauseButton.disabled = false; pauseButton.textContent = 'Ⅱ пауза'; aimHint.style.display = 'none'; statusText.textContent = 'Раунд идёт'; statusDot.classList.add('live');
  startButton.innerHTML = 'Новая игра <span>↻</span>'; messageEl.textContent = 'Цельтесь мышью и кликайте по утке.';
  resetDuck(); updateHud(); lastTime = performance.now(); raf = requestAnimationFrame(loop);
}
function finish(text) {
  running = false; paused = false; pauseButton.disabled = true; statusText.textContent = 'Раунд завершён'; statusDot.classList.remove('live'); messageEl.textContent = text;
  startButton.innerHTML = 'Играть снова <span>→</span>';
  if (score > best) { best = score; localStorage.setItem('duck-hunt-best', best); bestEl.textContent = String(best).padStart(4, '0'); }
}
function loop(now) { const dt = Math.min((now - lastTime) / 1000, .04); lastTime = now; if (!paused) update(dt); draw(); if (running) raf = requestAnimationFrame(loop); }
function update(dt) {
  recoil *= Math.pow(.02, dt); particles = particles.filter(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 210 * dt; return p.life > 0; });
  floatingTexts = floatingTexts.filter(t => { t.life -= dt; t.y -= 30 * dt; return t.life > 0; });
  fallenDucks = fallenDucks.filter(d => { d.vy += 380 * dt; d.y += d.vy * dt; d.rot += d.spin * dt; d.life -= dt; return d.life > 0; });
  ducks.forEach(d => {
    d.x += d.vx * dt; d.y += d.vy * dt; d.wing += dt * d.flapRate;
    d.vy += Math.sin(performance.now() / 500 + d.phase) * 4 * dt;
    if (d.x < d.r || d.x > W - d.r) { d.vx *= -1; d.x = Math.max(d.r, Math.min(W - d.r, d.x)); }
    if (d.y < d.r * 1.5 || d.y > H * .67) { d.vy *= -1; d.y = Math.max(d.r * 1.5, Math.min(H * .67, d.y)); }
    if (performance.now() > d.nextQuack) { playQuack(); d.nextQuack = performance.now() + 2600 + Math.random() * 2600; }
  });
  const now = performance.now();
  if (ducks.some(d => now - d.born > 9000)) {
    const escaped = ducks.find(d => now - d.born > 9000); ducks = ducks.filter(d => d !== escaped); ammo--; playMiss(); addFloat('УЛЕТЕЛА', escaped.x, escaped.y, '#fff');
    if (ammo === 0) finish(`Утки улетели. Результат: ${score} очков.`);
    else if (!ducks.length) spawnWave();
    updateHud();
  }
}
function draw() {
  ctx.clearRect(0, 0, W, H); const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#6aaeb9'); sky.addColorStop(.43, '#acd6c9'); sky.addColorStop(.7, '#d0dfbe'); sky.addColorStop(1, '#6caa72');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  drawSun(); clouds.forEach(drawCloud); drawFarHills(); drawTrees(); drawWater(); drawReeds(); drawGround();
  fallenDucks.forEach(drawFallenDuck); if (running) ducks.forEach(drawDuck); particles.forEach(drawParticle); floatingTexts.forEach(drawFloat); drawCrosshair();
}
function drawSun() { const g = ctx.createRadialGradient(W * .78, H * .14, 2, W * .78, H * .14, 100); g.addColorStop(0, 'rgba(255,246,190,.8)'); g.addColorStop(1, 'rgba(255,240,170,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * .45); }
function drawCloud(c) { ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.s, c.s); ctx.fillStyle = 'rgba(244,252,242,.42)'; ctx.beginPath(); ctx.ellipse(0, 9, 65, 17, 0, 0, 7); ctx.arc(-35, 5, 18, 0, 7); ctx.arc(-8, -9, 28, 0, 7); ctx.arc(24, 3, 22, 0, 7); ctx.fill(); ctx.restore(); }
function drawFarHills() { ctx.fillStyle = '#719e7e'; ctx.beginPath(); ctx.moveTo(0, H * .61); for (let x = 0; x <= W; x += 25) ctx.lineTo(x, H * .57 - Math.sin(x * .012) * 17 - Math.sin(x * .031) * 8); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill(); ctx.fillStyle = 'rgba(221,231,188,.23)'; ctx.beginPath(); ctx.moveTo(0, H*.62); for (let x=0;x<=W;x+=30)ctx.lineTo(x,H*.61-Math.sin(x*.018)*10);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill(); }
function drawTrees() { trees.forEach(t => { ctx.save(); ctx.translate(t.x, t.y); ctx.scale(t.s, t.s); ctx.fillStyle = '#604e3b'; ctx.fillRect(-7, -100, 14, 115); ctx.fillStyle = '#315e4a'; [[-27,-92,29], [10,-105,34], [0,-71,39], [-37,-67,23], [32,-69,25]].forEach(([x,y,r],i)=>{ctx.fillStyle=i%2?'#3f7958':'#35684e';ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();});ctx.fillStyle='rgba(150,194,128,.34)';ctx.beginPath();ctx.arc(-9,-102,15,0,7);ctx.arc(28,-78,12,0,7);ctx.fill();ctx.restore();}); }
function drawWater() { const y = H * .71; ctx.fillStyle = '#579b94'; ctx.fillRect(0, y, W, H * .19); for(let i=0;i<22;i++){const x=(i*83+(i%3)*23)%W;ctx.strokeStyle='rgba(204,235,207,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y+15+(i%4)*15);ctx.lineTo(x+28+(i%3)*15,y+15+(i%4)*15);ctx.stroke();} ctx.fillStyle='rgba(32,92,78,.45)';ctx.fillRect(0,H*.87,W,H*.13); }
function drawReeds() { for(let i=0;i<35;i++){const x=(i*47+12)%W,h=18+(i%7)*4;ctx.strokeStyle=i%2?'#356e56':'#477d57';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,H*.75);ctx.quadraticCurveTo(x-5,H*.75-h/2,x+(i%3-1)*7,H*.75-h);ctx.stroke();} }
function drawGround() { ctx.fillStyle='#54875b';ctx.fillRect(0,H*.86,W,H*.14);grass.forEach(g=>{ctx.strokeStyle=g.color;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(g.x,H*.9);ctx.lineTo(g.x+g.lean,H*.9-g.h);ctx.stroke();}); }
function drawDuck(d) {
  ctx.save(); if (!d.fallen) ctx.translate(d.x, d.y); else { /* already positioned for a fallen duck */ } if (d.vx < 0) ctx.scale(-1, 1); const r=d.r, flap=Math.sin(d.wing), lift=flap*9;
  ctx.shadowColor='rgba(21,57,48,.25)';ctx.shadowBlur=8; ctx.fillStyle=d.body || '#5a382b';ctx.beginPath();ctx.ellipse(-r*.1,r*.1,r*1.08,r*.68,0,0,7);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle=d.wingColor || '#835438';ctx.beginPath();ctx.ellipse(-r*.3,-r*.15,r*.7,r*.46,-.18+flap*.06,0,7);ctx.fill();
  ctx.fillStyle=d.wingColor || '#b9784c';ctx.beginPath();ctx.ellipse(-r*.3,-r*.17,r*.48,r*.27,-.28+lift/130,0,7);ctx.fill();
  ctx.fillStyle=d.head || '#2f9771';ctx.beginPath();ctx.arc(r*.68,-r*.48,r*.41,0,7);ctx.fill();ctx.fillStyle='#58b789';ctx.beginPath();ctx.arc(r*.57,-r*.63,r*.16,0,7);ctx.fill();
  ctx.fillStyle='#eba83d';ctx.beginPath();ctx.moveTo(r*.93,-r*.5);ctx.lineTo(r*1.4,-r*.37);ctx.lineTo(r*.94,-r*.2);ctx.closePath();ctx.fill();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(r*.78,-r*.59,r*.12,0,7);ctx.fill();ctx.fillStyle='#152f2e';ctx.beginPath();ctx.arc(r*.8,-r*.59,r*.055,0,7);ctx.fill();
  ctx.strokeStyle='rgba(51,31,23,.6)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-r*.9,r*.23);ctx.quadraticCurveTo(-r*.35,r*.64,r*.25,r*.27);ctx.stroke();ctx.restore();
}
function drawFallenDuck(d) { ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.globalAlpha = Math.min(1, d.life * 2); drawDuck({ x: 0, y: 0, vx: 1, r: d.r, wing: 0, fallen: true }); ctx.globalAlpha = 1; ctx.restore(); }
function drawParticle(p){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,7);ctx.fill();ctx.globalAlpha=1;}
function drawFloat(t){ctx.globalAlpha=Math.max(0,t.life*2);ctx.fillStyle=t.color;ctx.font='700 14px Manrope';ctx.textAlign='center';ctx.fillText(t.text,t.x,t.y);ctx.globalAlpha=1;}
function drawCrosshair(){if(!running)return;ctx.save();ctx.translate(pointer.x,pointer.y);ctx.rotate(recoil*.08);ctx.strokeStyle='rgba(255,255,255,.96)';ctx.lineWidth=2;ctx.shadowColor='rgba(20,65,60,.7)';ctx.shadowBlur=4;ctx.beginPath();ctx.arc(0,0,18+recoil*3,0,7);ctx.moveTo(-31,0);ctx.lineTo(-11,0);ctx.moveTo(11,0);ctx.lineTo(31,0);ctx.moveTo(0,-31);ctx.lineTo(0,-11);ctx.moveTo(0,11);ctx.lineTo(0,31);ctx.stroke();ctx.fillStyle='#f07843';ctx.beginPath();ctx.arc(0,0,3,0,7);ctx.fill();ctx.restore();}
function addFloat(text,x,y,color){floatingTexts.push({text,x,y,color,life:1,max:1});}
function shootParticles(x,y,hit){recoil=1;const n=hit?18:8;for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=hit?30+Math.random()*100:20+Math.random()*50;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.3,max:.65,color:hit?'#f8d27b':'#fff',size:hit?2+Math.random()*3:1+Math.random()*2});}}
function ensureAudio(){if(!soundOn)return;if(!audioContext)audioContext=new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();}
function playShot(){ if(!soundOn)return;ensureAudio();const t=audioContext.currentTime,o=audioContext.createOscillator(),g=audioContext.createGain(),n=audioContext.createBufferSource(),b=audioContext.createBuffer(1,audioContext.sampleRate*.12,audioContext.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);n.buffer=b;o.type='sawtooth';o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(42,t+.16);g.gain.setValueAtTime(.22,t);g.gain.exponentialRampToValueAtTime(.001,t+.18);o.connect(g);n.connect(g);g.connect(audioContext.destination);o.start(t);n.start(t);o.stop(t+.2);n.stop(t+.13);}
function playHit(){ if(!soundOn)return;ensureAudio();const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sine';o.frequency.setValueAtTime(520,audioContext.currentTime);o.frequency.exponentialRampToValueAtTime(880,audioContext.currentTime+.12);g.gain.setValueAtTime(.12,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.2);o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+.2);}
function playMiss(){ if(!soundOn)return;ensureAudio();const o=audioContext.createOscillator(),g=audioContext.createGain();o.frequency.value=110;g.gain.setValueAtTime(.09,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.16);o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+.17);}
function playQuack(){ if(!soundOn)return; ensureAudio(); const t=audioContext.currentTime, o=audioContext.createOscillator(), g=audioContext.createGain(); o.type='square'; o.frequency.setValueAtTime(250,t); o.frequency.exponentialRampToValueAtTime(145,t+.12); o.frequency.exponentialRampToValueAtTime(220,t+.24); g.gain.setValueAtTime(.045,t); g.gain.exponentialRampToValueAtTime(.001,t+.3); o.connect(g); g.connect(audioContext.destination); o.start(t); o.stop(t+.31); }
function setAim(point) { pointer.x = point.x * W; pointer.y = point.y * H; }
function fire() { if (!running) return; ensureAudio(); playShot(); shotFlash.classList.remove('fire'); void shotFlash.offsetWidth; shotFlash.classList.add('fire'); ammo--; shootParticles(pointer.x, pointer.y, false);
  const hitIndex = ducks.findIndex(d => Math.hypot(pointer.x - d.x, pointer.y - d.y) < d.r * 1.2);
  if (hitIndex >= 0) { const hit = ducks.splice(hitIndex, 1)[0]; waveHits++; score += hit.points; playHit(); shootParticles(hit.x, hit.y, true); addFloat('+' + hit.points, hit.x, hit.y - 45, '#fff'); fallenDucks.push({ x: hit.x, y: hit.y, r: hit.r, vy: -35, rot: 0, spin: (Math.random() - .5) * 7, life: 5, wave: round }); messageEl.textContent = `Попадание! +${hit.points} очков. Новая утка в стае.`;
    if (!ducks.length) { round++; if (round > 5) { updateHud(); finish(`Все стаи поражены! Результат: ${score} очков.`); return; } ammo = 3; waveHits = 0; messageEl.textContent = `Новая стая: ${Math.min(round + 1, 6)} утки`; spawnWave(); }
  } else { playMiss(); addFloat('Мимо', pointer.x, pointer.y - 25, '#fff'); messageEl.textContent = 'Мимо!'; if (ammo === 0) { updateHud(); finish(`Патроны закончились. Результат: ${score} очков.`); return; } }
  updateHud(); }
gameInput.start(setAim, point => { setAim(point); fire(); });
startButton.addEventListener('click', start);
document.getElementById('resetButton').addEventListener('click',()=>{running=false;cancelAnimationFrame(raf);score=0;ammo=3;round=1;waveHits=0;ducks=[];fallenDucks=[];particles=[];floatingTexts=[];paused=false;pauseButton.disabled=true;pauseButton.textContent='Ⅱ пауза';aimHint.style.display='flex';statusText.textContent='Готово к старту';statusDot.classList.remove('live');startButton.innerHTML='Начать игру <span>→</span>';messageEl.textContent='Попадите по утке до того, как она улетит.';updateHud();draw();});
soundButton.addEventListener('click', () => { soundOn = !soundOn; soundButton.textContent = soundOn ? '🔊 звук' : '🔇 звук'; if (soundOn) ensureAudio(); });
pauseButton.addEventListener('click', () => { if (!running) return; paused = !paused; pauseButton.textContent = paused ? '▶ продолжить' : 'Ⅱ пауза'; statusText.textContent = paused ? 'Пауза' : 'Раунд идёт'; });
window.addEventListener('keydown', e => { if (e.key === 'Escape' && running) { paused = !paused; pauseButton.textContent = paused ? '▶ продолжить' : 'Ⅱ пауза'; statusText.textContent = paused ? 'Пауза' : 'Раунд идёт'; } });
resize();
