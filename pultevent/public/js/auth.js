const params = new URLSearchParams(location.search);
let mode = params.get('mode') === 'register' ? 'register' : 'login';
const plan = params.get('plan') || '';
if (plan) sessionStorage.setItem('pe-plan', plan);

const tabLogin = document.getElementById('tabLogin');
const tabReg = document.getElementById('tabReg');
const regFields = document.getElementById('regFields');
const captcha = document.getElementById('captcha');
const submit = document.getElementById('submit');
const error = document.getElementById('error');

function paint() {
  const reg = mode === 'register';
  tabLogin.classList.toggle('active', !reg);
  tabReg.classList.toggle('active', reg);
  regFields.classList.toggle('hidden', !reg);
  captcha.classList.toggle('hidden', !reg);
  submit.textContent = reg ? 'Создать кабинет' : 'Войти';
  document.getElementById('password').autocomplete = reg ? 'new-password' : 'current-password';
}
tabLogin.onclick = () => { mode = 'login'; paint(); };
tabReg.onclick = () => { mode = 'register'; paint(); };
paint();

document.getElementById('forgot').onclick = () => {
  error.textContent = 'В демо письма не отправляются. Войдите как demo@pultevent.local / demo1234.';
};

document.getElementById('demoBtn').onclick = async () => {
  error.textContent = '';
  const res = await fetch('/api/auth/demo', { method: 'POST' });
  if (!res.ok) { error.textContent = 'Демо-аккаунт не найден'; return; }
  location.href = params.get('next') || '/app';
};

document.getElementById('form').onsubmit = async (event) => {
  event.preventDefault();
  error.textContent = '';
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (mode === 'register') {
    if (document.getElementById('sum').value.trim() !== '4') {
      error.textContent = 'Проверка не сошлась: 2 + 2 = 4';
      return;
    }
    if (!document.getElementById('consent').checked || !document.getElementById('offer').checked) {
      error.textContent = 'Нужны оба согласия';
      return;
    }
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('name').value,
        phone: document.getElementById('phone').value,
        country: document.getElementById('country').value,
        email,
        password,
        consent: true
      })
    });
    const data = await res.json();
    if (!res.ok) { error.textContent = data.error || 'Не получилось'; return; }
    location.href = '/app';
    return;
  }
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) { error.textContent = data.error || 'Не получилось'; return; }
  location.href = params.get('next') || '/app';
};
