const names = ['Анна', 'Марк', 'Ольга', 'Сергей', 'Марина', 'Игорь', 'Елена', 'Павел'];
const wheelHost = document.getElementById('heroWheel');
const winner = document.getElementById('heroWinner');
let rotation = 0;
let wheelCanvas = null;

function drawHeroWheel(canvas, items) {
  const size = 640;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  const seg = (Math.PI * 2) / items.length;
  items.forEach((name, i) => {
    ctx.beginPath();
    ctx.moveTo(r, r);
    ctx.fillStyle = ['#e23b55', '#1c2433', '#d7b06a', '#2a3344'][i % 4];
    ctx.arc(r, r, r - 4, i * seg - Math.PI / 2, (i + 1) * seg - Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.translate(r, r);
    ctx.rotate((i + 0.5) * seg - Math.PI / 2);
    ctx.fillStyle = '#fff';
    ctx.font = '700 28px Manrope, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(name, r - 36, 8);
    ctx.restore();
  });
}

if (wheelHost) {
  wheelCanvas = document.createElement('canvas');
  wheelCanvas.style.width = '100%';
  wheelCanvas.style.height = '100%';
  wheelCanvas.style.borderRadius = '50%';
  wheelCanvas.style.display = 'block';
  wheelCanvas.style.transition = 'transform 5.2s cubic-bezier(.12,.72,.08,1)';
  wheelHost.appendChild(wheelCanvas);
  drawHeroWheel(wheelCanvas, names);
}

document.getElementById('heroSpin')?.addEventListener('click', () => {
  if (!wheelCanvas) return;
  const index = Math.floor(Math.random() * names.length);
  const seg = 360 / names.length;
  rotation += 360 * 6 + (360 - (index + 0.5) * seg);
  wheelCanvas.style.transform = `rotate(${rotation}deg)`;
  winner.textContent = 'Крутится…';
  setTimeout(() => { winner.textContent = `Выпадает: ${names[index]}`; }, 5300);
});

const types = ['Свадьба', 'День рождения', 'Юбилей', 'Корпоратив', 'Выпускной', 'Новый год', 'Детский праздник', 'Квиз'];
const track = document.getElementById('marquee');
if (track) track.innerHTML = `${types.concat(types).map((t) => `<span>${t}</span>`).join('')}`;

document.getElementById('menuBtn')?.addEventListener('click', () => {
  document.getElementById('nav').classList.toggle('menu-open');
  document.getElementById('navLinks').classList.toggle('open');
});

async function demoLogin() {
  const res = await fetch('/api/auth/demo', { method: 'POST' });
  if (!res.ok) { alert('Демо-вход не открылся'); return; }
  location.href = '/app#remote';
}
document.getElementById('demoLogin')?.addEventListener('click', demoLogin);
document.getElementById('demoLogin2')?.addEventListener('click', demoLogin);

if (localStorage.getItem('pe-cookie')) document.getElementById('cookie')?.classList.add('hidden');
document.getElementById('cookieOk')?.addEventListener('click', () => {
  localStorage.setItem('pe-cookie', '1');
  document.getElementById('cookie').classList.add('hidden');
});

setTimeout(() => {
  if (!localStorage.getItem('pe-popup')) document.getElementById('popup')?.style.setProperty('display', 'block');
}, 7000);
document.getElementById('popupLater')?.addEventListener('click', () => {
  localStorage.setItem('pe-popup', '1');
  document.getElementById('popup').style.display = 'none';
});

const chat = document.getElementById('chat');
document.getElementById('chatBtn')?.addEventListener('click', () => {
  chat.style.display = chat.style.display === 'block' ? 'none' : 'block';
});
document.getElementById('chat')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-a]');
  if (!button) return;
  const log = document.getElementById('chatLog');
  log.innerHTML = `<p>${button.dataset.a}</p>`;
});

fetch('/api/catalog').then((r) => r.json()).then((data) => {
  const box = document.getElementById('catalogPreview');
  if (!box) return;
  const enabled = data.items.filter((item) => item.enabled);
  const locked = data.items.filter((item) => !item.enabled).slice(0, 3);
  box.innerHTML = enabled.concat(locked).map((item) => `
    <article class="card">
      <div class="icon-blob">${item.emoji}</div>
      <h3>${item.name}</h3>
      <p>${item.blurb}</p>
      <p style="margin-top:10px;font-weight:800;color:${item.enabled ? '#0e8f78' : '#746e66'}">${item.enabled ? 'Включено для проверки' : 'В этой сборке выключено'}</p>
    </article>
  `).join('') + `<article class="card"><h3>Ещё ${data.items.length - enabled.length} разделов</h3><p>Они есть в каталоге кабинета: квизы, 3D-игры, DJ-пульт, форум. Сейчас выключены, чтобы проверить основной контур.</p><p style="margin-top:12px"><a class="btn btn-ink" href="/app">Открыть каталог</a></p></article>`;
}).catch(() => {});
