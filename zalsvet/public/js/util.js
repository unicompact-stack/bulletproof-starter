function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function money(value) {
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0))} ₽`;
}

function formatDate(iso) {
  if (!iso) return 'дата не указана';
  const [y, m, d] = String(iso).split('-');
  if (!d) return iso;
  return `${d}.${m}.${y}`;
}

function typeLabel(type) {
  return {
    wedding: 'Свадьба',
    birthday: 'День рождения',
    anniversary: 'Юбилей',
    corporate: 'Корпоратив',
    prom: 'Выпускной',
    newyear: 'Новый год',
    kids: 'Детский праздник',
    quiz: 'Квиз'
  }[type] || 'Праздник';
}

function statusLabel(status) {
  return {
    lead: 'Лид',
    confirmed: 'Подтверждён',
    advance: 'Аванс',
    done: 'Проведён',
    closed: 'Закрыт'
  }[status] || status;
}

function planLabel(plan) {
  return { demo: 'Проверка', month: 'Месяц', forever: 'Долгий доступ' }[plan] || plan;
}

function formatMs(ms) {
  const total = Math.max(0, Math.ceil(Number(ms) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function timerLeft(timer) {
  if (!timer) return 0;
  if (timer.running && timer.endsAt) return Math.max(0, timer.endsAt - Date.now());
  return Math.max(0, Number(timer.remainingMs) || 0);
}
