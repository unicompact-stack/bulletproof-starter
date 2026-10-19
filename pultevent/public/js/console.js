const PRIMARY = [
  { group: 'Экран и заставки', tone: 'purple', items: [
    { id: 'splash', name: 'Заставка', hint: 'приветствие на экране', emoji: '✨', enabled: true }
  ]},
  { group: 'Проверка', tone: 'gold', items: [
    { id: 'wheel', name: 'Колесо гостей', hint: 'случайный выбор', emoji: '🎡', enabled: true },
    { id: 'timer', name: 'Таймер', hint: 'активность и пауза', emoji: '⏱', enabled: true },
    { id: 'quiz', name: 'Квиз', hint: 'вопросы на экран', emoji: '❓', enabled: true },
    { id: 'board', name: 'Табло', hint: 'счёт команд', emoji: '🏆', enabled: true },
    { id: 'timing', name: 'Тайминг', hint: 'ход вечера', emoji: '🗓', enabled: true }
  ]}
];

const SETS = {
  wedding: ['splash', 'wheel', 'timing', 'quiz', 'board'],
  kids: ['splash', 'wheel', 'timer', 'quiz'],
  corporate: ['splash', 'quiz', 'board', 'timing'],
  default: ['splash', 'wheel', 'timer', 'quiz']
};

const state = {
  me: null,
  events: [],
  catalog: [],
  selected: '',
  live: null,
  tool: 'splash',
  zoom: Number(localStorage.getItem('pe-zoom') || 100),
  pins: JSON.parse(localStorage.getItem('pe-pins') || '["splash","wheel","timer","quiz","board","timing"]'),
  collapsed: JSON.parse(localStorage.getItem('pe-collapsed') || '{}'),
  query: '',
  sound: localStorage.getItem('pe-sound') !== '0',
  tour: 0
};

const $ = (id) => document.getElementById(id);
let toastTimer = 0;

function toast(text) {
  const node = $('toast');
  node.textContent = text;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 2800);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Не получилось');
  return data;
}

function selected() {
  return state.events.find((event) => event.id === state.selected) || state.events[0];
}

function catalogItem(id) {
  return state.catalog.find((item) => item.id === id);
}

function enabled(id) {
  const item = catalogItem(id);
  return item ? !!item.enabled : PRIMARY.some((group) => group.items.some((entry) => entry.id === id && entry.enabled));
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function fileToData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

function postSound() {
  const frame = $('screen');
  if (frame && frame.contentWindow) {
    frame.contentWindow.postMessage({ type: 'sound', on: state.sound }, location.origin);
  }
}

function applyZoom() {
  $('stageFrame').style.setProperty('--zoom', String(state.zoom / 100));
  $('zoomLabel').textContent = `${state.zoom}%`;
  const frame = $('screen');
  if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'zoom', value: state.zoom }, location.origin);
  localStorage.setItem('pe-zoom', String(state.zoom));
}

function ensureFrame() {
  const event = selected();
  const frame = $('screen');
  if (!event || !frame) return;
  if (frame.dataset.code !== event.code) {
    frame.dataset.code = event.code;
    frame.src = `/s/${event.code}?embed=1`;
  }
}

async function loadShow() {
  const event = selected();
  if (!event) return;
  const data = await api(`/api/events/${event.id}`);
  state.live = data.live;
  state.tool = data.live.tool || 'splash';
  ensureFrame();
  renderDock();
  renderSections();
}

async function act(body) {
  const event = selected();
  if (!event) return;
  const data = await api(`/api/events/${event.id}/action`, { method: 'POST', body: JSON.stringify(body) });
  state.live = data.live;
  state.tool = data.live.tool || state.tool;
  renderDock();
  renderSections();
  return data.live;
}

function closePopover() { $('popover').hidden = true; }
function closeModal() { $('modalBack').hidden = true; }

function openPopover(anchor, html) {
  const pop = $('popover');
  pop.innerHTML = html;
  pop.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const top = Math.min(rect.bottom + 8, window.innerHeight - 280);
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - 376);
  pop.style.top = `${Math.max(72, top)}px`;
  pop.style.left = `${left}px`;
}

function openModal(html) {
  $('modal').innerHTML = html;
  $('modalBack').hidden = false;
}

function renderTop() {
  const event = selected();
  const type = event ? event.typeLabel : 'Свадьба';
  const line = $('showLine');
  if (line && event) line.textContent = event.title;
  $('topNav').innerHTML = `
    <button class="pill cabinet" data-open="cabinet" type="button">Личный кабинет</button>
    <button class="pill dj" data-open="dj" type="button">DJ пульт</button>
    <button class="pill" data-open="kp" type="button">КП</button>
    <button class="pill" data-open="partner" type="button">Партнёрка</button>
    <button class="type-btn" id="typeBtn" type="button">${esc(type)} ▾</button>`;
  $('topActions').innerHTML = `
    <button class="act orange" id="secondScreen" type="button">Второй экран</button>
    <button class="act teal" id="phoneBtn" type="button">Телефон</button>
    <button class="act pink" id="fullBtn" type="button">На весь экран</button>
    <button class="icon-btn" id="bell" type="button" aria-label="Уведомления">🔔</button>
    <button class="icon-btn" id="soundBtn" type="button" aria-label="Звук">${state.sound ? '🔊' : '🔇'}</button>
    <button class="avatar" id="avatar" type="button">${esc((state.me && state.me.name || 'Д').slice(0, 1))}</button>`;
}

function itemTone(id) {
  if (id === 'splash') return 'purple';
  if (id === 'wheel' || id === 'quiz') return 'gold';
  if (id === 'timer' || id === 'timing') return 'blue';
  if (id === 'board') return 'orange';
  return 'pink';
}

function sectionButton(item, extra) {
  const on = state.tool === item.id ? 'active' : '';
  const pin = state.pins.includes(item.id);
  const lock = item.enabled || item.id === 'dj' ? '' : '<span class="lock">🔒</span>';
  return `<button class="sec ${on}" data-tool="${esc(item.id)}" type="button">
    <span class="ico ${itemTone(item.id)}">${item.emoji || '✦'}</span>
    <span>${esc(item.name)}${extra ? `<small>${esc(extra)}</small>` : ''}</span>
    ${lock}
    <span class="star ${pin ? 'on' : ''}" data-pin="${esc(item.id)}">${pin ? '★' : '☆'}</span>
  </button>`;
}

function renderSections() {
  const q = state.query.trim().toLowerCase();
  const known = new Set(PRIMARY.flatMap((group) => group.items.map((item) => item.id)));
  const groups = PRIMARY.map((group) => ({
    ...group,
    items: group.items.filter((item) => !q || item.name.toLowerCase().includes(q) || group.group.toLowerCase().includes(q))
  })).filter((group) => group.items.length);
  const extras = new Map();
  state.catalog.forEach((item) => {
    if (known.has(item.id)) return;
    if (q && !item.name.toLowerCase().includes(q) && !item.group.toLowerCase().includes(q)) return;
    if (!extras.has(item.group)) extras.set(item.group, []);
    extras.get(item.group).push(item);
  });
  extras.forEach((items, group) => groups.push({ group, items }));
  const pins = state.pins
    .map((id) => catalogItem(id) || PRIMARY.flatMap((group) => group.items).find((item) => item.id === id))
    .filter(Boolean)
    .filter((item) => !q || item.name.toLowerCase().includes(q));
  const pinHtml = pins.length ? `<button class="group-h" type="button">Избранное <b>${pins.length}</b></button>${pins.map((item) => sectionButton(item)).join('')}` : '';
  $('sections').innerHTML = pinHtml + groups.map((group) => {
    const closed = state.collapsed[group.group];
    return `<button class="group-h" data-group="${esc(group.group)}" type="button">${closed ? '▸' : '▾'} ${esc(group.group)} <b>${group.items.length}</b></button>
      ${closed ? '' : group.items.map((item) => sectionButton(item, item.hint)).join('')}`;
  }).join('');
}

function overlayRow() {
  return `<div class="dock-row"><span class="lbl">ПОВЕРХ</span>
    <button class="chip" data-overlay="salute" type="button">Салют</button>
    <button class="chip" data-overlay="confetti" type="button">Конфетти</button>
    <button class="chip" data-overlay="fanfare" type="button">Фанфары</button>
  </div>`;
}

function splashDock() {
  const splash = (state.live && state.live.splash) || {};
  const mode = splash.mode || 'normal';
  const mark = (value) => mode === value ? 'on' : '';
  return `<div class="dock-row"><span class="lbl">НА ЭКРАНЕ</span>
      <button class="chip ${mark('normal')}" data-mode="normal" type="button">Обычная</button>
      <button class="chip ${mark('photo')}" data-mode="photo" type="button">Фото</button>
      <button class="chip ${mark('slideshow')}" data-mode="slideshow" type="button">Слайдшоу</button>
      <button class="chip ${mark('video')}" data-mode="video" type="button">Видео</button>
      <button class="chip ${mark('ready')}" data-setup="ready" type="button">Готовые и мои</button>
    </div>
    ${overlayRow()}
    <div class="dock-row"><span class="lbl">НАСТРОИТЬ</span>
      <button class="chip dash" data-setup="title" type="button">Надпись</button>
      <button class="chip dash" data-setup="photo" type="button">+ Фото</button>
      <button class="chip dash" data-setup="slideshow" type="button">+ Слайдшоу</button>
      <button class="chip dash" data-setup="video" type="button">+ Видео</button>
      <button class="chip dash" data-setup="event" type="button">Праздник</button>
      <button class="chip dash" data-setup="files" type="button">Файлы</button>
      <button class="chip dash" id="dockFull" type="button">На весь экран</button>
    </div>`;
}

function wheelDock() {
  const names = ((state.live && state.live.wheel && state.live.wheel.names) || []).join('\n');
  return `<div class="dock-row"><span class="lbl">КОЛЕСО</span>
    <button class="chip on" data-spin="1" type="button">Крутить</button>
    <button class="chip dash" data-setup="names" type="button">Имена</button>
  </div>${overlayRow()}<textarea id="wheelNames" rows="3" hidden>${esc(names)}</textarea>`;
}

function timerDock() {
  return `<div class="dock-row"><span class="lbl">ТАЙМЕР</span>
    <button class="chip" data-seconds="60" type="button">1 мин</button>
    <button class="chip" data-seconds="180" type="button">3 мин</button>
    <button class="chip" data-seconds="300" type="button">5 мин</button>
    <button class="chip dash" data-timer="pause" type="button">Пауза</button>
  </div>${overlayRow()}`;
}

function quizDock() {
  const phase = state.live && state.live.quiz ? state.live.quiz.phase : 'lobby';
  return `<div class="dock-row"><span class="lbl">КВИЗ</span>
    <button class="chip" data-quiz="start" type="button">На экран</button>
    <button class="chip" data-quiz="reveal" type="button">Ответ</button>
    <button class="chip" data-quiz="next" type="button">Дальше</button>
    <span class="lbl">${esc(phase)}</span>
  </div>${overlayRow()}`;
}

function boardDock() {
  const teams = (state.live && state.live.board && state.live.board.teams) || [];
  return `<div class="dock-row"><span class="lbl">ТАБЛО</span>
    ${teams.map((team) => `<button class="chip" data-team="${esc(team.id)}" type="button">+ ${esc(team.name)}</button>`).join('')}
    <button class="chip on" data-announce="1" type="button">Объявить</button>
  </div>${overlayRow()}`;
}

function timingDock() {
  const items = (state.live && state.live.timing && state.live.timing.items) || [];
  return `<div class="dock-row"><span class="lbl">ТАЙМИНГ</span>
    ${items.map((item, index) => `<button class="chip ${Number(state.live.timing.current) === index ? 'on' : ''}" data-timing="${index}" type="button">${esc(item.title)}</button>`).join('')}
  </div>${overlayRow()}`;
}

function renderDock() {
  const map = { splash: splashDock, wheel: wheelDock, timer: timerDock, quiz: quizDock, board: boardDock, timing: timingDock };
  $('dock').innerHTML = (map[state.tool] || splashDock)();
}

function showTypes(anchor) {
  const types = ['Свадьба', 'День рождения', 'Юбилей', 'Корпоратив', 'Выпускной', 'Новый год', 'Детский праздник', 'Квиз'];
  openPopover(anchor, `<h3>Тип праздника</h3><div class="row">${types.map((type) => `<button class="chip" data-type="${esc(type)}" type="button">${esc(type)}</button>`).join('')}</div>`);
}

function showLocked(item, anchor) {
  openPopover(anchor, `<h3>${esc(item.name)}</h3><p>${esc(item.blurb || 'Раздел виден в каталоге, но в проверочной сборке не запускается.')}</p><p>Чтобы проверить пульт, откройте заставку, колесо, таймер, квиз, табло или тайминг.</p>`);
}

function showMenu(name, anchor) {
  const texts = {
    dj: ['DJ пульт', 'В оригинале здесь колода треков. В проверочной сборке музыкальный пульт не запускается — экран и гостевые инструменты остаются рабочими.'],
    kp: ['Коммерческое предложение', 'Карточка события, состав и стоимость. В этой сборке КП только показывает данные выбранного праздника и не формирует документ.'],
    partner: ['Партнёрка', 'Реферальная программа оригинала здесь не подключена. Демо-кабинет открыт без регистрации, чтобы можно было проверить сцену.']
  };
  const [title, text] = texts[name];
  openPopover(anchor, `<h3>${title}</h3><p>${text}</p>`);
}

function showGuestCode() {
  const event = selected();
  if (!event) return;
  const url = `${location.origin}/j/${event.code}`;
  openModal(`<h2>Телефон гостей</h2><p>Гости открывают эту ссылку или код. Игры на телефонах в этой сборке не запускаются — код нужен, чтобы проверить связку пульт → экран → телефон.</p>
    <p class="tag">${esc(url)}</p>
    <div class="row"><button class="btn" id="copyCode" type="button">Скопировать</button><button class="btn ghost" data-close="1" type="button">Закрыть</button></div>`);
  $('copyCode').onclick = async () => {
    await navigator.clipboard.writeText(url);
    toast('Ссылка скопирована');
  };
}

function showBell(anchor) {
  const guests = (state.live && state.live.joined) || [];
  openPopover(anchor, `<h3>Зал</h3><p>${guests.length ? guests.map((guest) => esc(guest.name)).join(', ') : 'Пока никто не открыл телефон гостя.'}</p>`);
}

function showCabinet(anchor) {
  const me = state.me || {};
  openPopover(anchor, `<h3>${esc(me.name || 'Ведущий')}</h3><p>${esc(me.email || '')}</p><p>Демо без пароля. Карточка, календарь и статусы — в «Мои праздники».</p>
    <div class="row"><button class="btn" data-open="holidays" type="button">Праздники</button></div>`);
}

function holidayForm(event) {
  const types = [['wedding', 'Свадьба'], ['birthday', 'День рождения'], ['anniversary', 'Юбилей'], ['corporate', 'Корпоратив'], ['prom', 'Выпускной'], ['newyear', 'Новый год'], ['kids', 'Детский'], ['quiz', 'Квиз']];
  const statuses = [['lead', 'Заявка'], ['confirmed', 'Подтверждён'], ['advance', 'Аванс'], ['done', 'Проведён'], ['closed', 'Закрыт']];
  const value = event || { type: 'birthday', title: '', date: '', time: '18:00', venue: '', address: '', clientName: '', clientPhone: '', fee: 0, advance: 0, status: 'lead', notes: '' };
  return `<h2>${event ? 'Карточка праздника' : 'Новый праздник'}</h2>
    <label>Название</label><input class="field" id="fTitle" value="${esc(value.title)}">
    <div class="row">
      <div><label>Тип</label><select id="fType">${types.map(([type, label]) => `<option value="${type}" ${value.type === type ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div><label>Дата</label><input class="field" id="fDate" type="date" value="${esc(value.date)}"></div>
      <div><label>Время</label><input class="field" id="fTime" value="${esc(value.time || '')}"></div>
    </div>
    <label>Площадка</label><input class="field" id="fVenue" value="${esc(value.venue || '')}">
    <label>Адрес</label><input class="field" id="fAddress" value="${esc(value.address || '')}">
    <label>Клиент</label><input class="field" id="fClient" value="${esc(value.clientName || '')}">
    <label>Телефон</label><input class="field" id="fPhone" value="${esc(value.clientPhone || '')}">
    <div class="row">
      <div><label>Гонорар</label><input class="field" id="fFee" type="number" value="${esc(value.fee || 0)}"></div>
      <div><label>Аванс</label><input class="field" id="fAdvance" type="number" value="${esc(value.advance || 0)}"></div>
    </div>
    <label>Статус</label><select id="fStatus">${statuses.map(([status, label]) => `<option value="${status}" ${value.status === status ? 'selected' : ''}>${label}</option>`).join('')}</select>
    <label>Заметки</label><textarea id="fNotes" rows="3">${esc(value.notes || '')}</textarea>
    <div class="row" style="margin-top:12px"><button class="btn" id="saveHoliday" type="button">Сохранить</button><button class="btn ghost" data-close="1" type="button">Закрыть</button></div>`;
}

function readHoliday() {
  return {
    title: $('fTitle').value,
    type: $('fType').value,
    date: $('fDate').value,
    time: $('fTime').value,
    venue: $('fVenue').value,
    city: $('fCity').value,
    clientName: $('fClient').value,
    clientPhone: $('fPhone').value,
    address: $('fAddress').value,
    fee: Number($('fFee').value || 0),
    advance: Number($('fAdvance').value || 0),
    status: $('fStatus').value,
    notes: $('fNotes').value
  };
}

async function showHolidays() {
  const data = await api('/api/crm');
  const money = data.money || {};
  const rows = state.events.map((event) => `<div class="event-row"><div><b>${esc(event.title)}</b><div class="tag">${esc(event.date)} · ${esc(event.status)} · ${esc(event.code)}</div></div>
    <div class="row"><button class="btn ghost" data-pick="${esc(event.id)}" type="button">На экран</button><button class="btn ghost" data-edit="${esc(event.id)}" type="button">Карточка</button></div></div>`).join('');
  openModal(`<h2>Мои праздники</h2><p>Сезон: ${money.seasonIncome || 0} ₽ · ожидание: ${money.expected || 0} ₽ · клиентов: ${(data.clients || []).length}</p>${rows}
    <div class="row" style="margin-top:12px"><button class="btn" id="newHoliday" type="button">Новый праздник</button><button class="btn ghost" data-close="1" type="button">Закрыть</button></div>`);
}

function showSets(anchor) {
  openPopover(anchor, `<h3>Наборы разделов</h3><div class="row">
    <button class="chip" data-set="wedding" type="button">Свадьба</button>
    <button class="chip" data-set="kids" type="button">Детский</button>
    <button class="chip" data-set="corporate" type="button">Корпоратив</button>
    <button class="chip" data-set="default" type="button">Базовый</button>
  </div><p>Набор только отмечает разделы звёздочкой. Заблокированные по-прежнему не запускаются.</p>`);
}

function tourSteps() {
  return [
    ['Пульт', 'Слева разделы, по центру тот же экран, который уйдёт на проектор, снизу кнопки текущей сцены.'],
    ['Второй экран', 'Оранжевая кнопка открывает проектор в новом окне. Потеря Wi‑Fi не стирает уже открытую сцену.'],
    ['Телефон', 'Бирюзовая кнопка показывает код гостей. В этой сборке телефон только присоединяется к залу.'],
    ['Заставка', 'Обычная, фото, слайдшоу и видео меняют центр. Салют, конфетти и фанфары ложатся поверх.']
  ];
}

function renderTour() {
  const steps = tourSteps();
  if (state.tour >= steps.length) {
    $('tour').hidden = true;
    localStorage.setItem('pe-tour', '1');
    return;
  }
  const [title, text] = steps[state.tour];
  $('tour').hidden = false;
  $('tour').innerHTML = `<h3>${title}</h3><p>${text}</p><div class="row"><button class="btn" id="tourNext" type="button">${state.tour === steps.length - 1 ? 'Понятно' : 'Дальше'}</button><button class="btn ghost" id="tourSkip" type="button">Пропустить</button></div>`;
  $('tour').style.top = '78px';
  $('tour').style.right = '16px';
}

async function upload(kind) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = kind === 'video' ? 'video/mp4,video/webm' : 'image/*';
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast('Файл больше 8 МБ');
    try {
      const dataUrl = await fileToData(file);
      const event = selected();
      const data = await api(`/api/events/${event.id}/media`, { method: 'POST', body: JSON.stringify({ dataUrl, kind }) });
      state.live = data.live;
      state.tool = 'splash';
      renderDock();
      toast('Файл на экране');
    } catch (error) {
      toast(error.message);
    }
  };
  input.click();
}

async function saveSplash(extra = {}) {
  await act({ action: 'splashUpdate', ...extra });
}

document.addEventListener('click', async (event) => {
  const pin = event.target.closest('[data-pin]');
  if (pin) {
    event.preventDefault();
    event.stopPropagation();
    const id = pin.dataset.pin;
      state.pins = state.pins.includes(id) ? state.pins.filter((item) => item !== id) : state.pins.concat(id);
      localStorage.setItem('pe-pins', JSON.stringify(state.pins));
    renderSections();
    return;
  }
  const target = event.target.closest('button');
  if (!target) {
    if (!event.target.closest('#popover')) closePopover();
    return;
  }
  try {
    if (target.dataset.group) {
      state.collapsed[target.dataset.group] = !state.collapsed[target.dataset.group];
      localStorage.setItem('pe-collapsed', JSON.stringify(state.collapsed));
      renderSections();
      return;
    }
    if (target.dataset.open === 'dj' || target.dataset.tool === 'dj') {
      const win = window.open('/dj', 'pultevent-dj');
      if (!win) location.href = '/dj';
      closePopover();
      return;
    }
    if (target.dataset.tool) {
      const item = catalogItem(target.dataset.tool) || { id: target.dataset.tool, name: target.dataset.tool, enabled: enabled(target.dataset.tool) };
      if (!item.enabled) return showLocked(item, target);
      state.tool = item.id;
      await act({ action: 'setTool', tool: item.id });
      closePopover();
      return;
    }
    if (target.dataset.open === 'cabinet') return showCabinet(target);
    if (target.dataset.open === 'holidays' || target.id === 'openHolidays') return showHolidays();
    if (target.dataset.open) return showMenu(target.dataset.open, target);
    if (target.id === 'typeBtn') return showTypes(target);
    if (target.dataset.type) {
      const current = selected();
      if (current) await api(`/api/events/${current.id}`, { method: 'PATCH', body: JSON.stringify({ type: typeValue(target.dataset.type) }) });
      await refreshEvents();
      closePopover();
      return;
    }
    if (target.id === 'secondScreen') {
      const current = selected();
      if (current) window.open(`/s/${current.code}`, 'pultevent-screen', 'noopener');
      return;
    }
    if (target.id === 'phoneBtn') return showGuestCode();
    if (target.id === 'fullBtn' || target.id === 'dockFull') {
      const node = document.documentElement;
      if (!document.fullscreenElement) await node.requestFullscreen();
      else await document.exitFullscreen();
      return;
    }
    if (target.id === 'bell') return showBell(target);
    if (target.id === 'soundBtn') {
      state.sound = !state.sound;
      localStorage.setItem('pe-sound', state.sound ? '1' : '0');
      target.textContent = state.sound ? '🔊' : '🔇';
      postSound();
      if (state.sound) playLocal('fanfare');
      return;
    }
    if (target.id === 'avatar') return showCabinet(target);
    if (target.id === 'openSets' || target.id === 'addSet') return showSets(target);
    if (target.dataset.set) {
      state.pins = SETS[target.dataset.set].slice();
      localStorage.setItem('pe-pins', JSON.stringify(state.pins));
      renderSections();
      closePopover();
      toast('Набор отмечен');
      return;
    }
    if (target.dataset.mode) {
      const splash = (state.live && state.live.splash) || {};
      if ((target.dataset.mode === 'photo' || target.dataset.mode === 'slideshow') && !(splash.photos || []).length) {
        toast('Сначала выберите фото');
        return upload(target.dataset.mode === 'slideshow' ? 'slideshow' : 'photo');
      }
      if (target.dataset.mode === 'video' && !splash.video) {
        toast('Сначала выберите видео');
        return upload('video');
      }
      await saveSplash({ mode: target.dataset.mode });
      return;
    }
    if (target.dataset.overlay) {
      await act({ action: 'overlay', type: target.dataset.overlay });
      playLocal(target.dataset.overlay);
      return;
    }
    if (target.dataset.setup === 'title') return openTitle(target);
    if (target.dataset.setup === 'photo') return upload('photo');
    if (target.dataset.setup === 'slideshow') return upload('slideshow');
    if (target.dataset.setup === 'video') return upload('video');
    if (target.dataset.setup === 'event') return showHolidays();
    if (target.dataset.setup === 'files') return showFiles(target);
    if (target.dataset.setup === 'ready') return openReady(target);
    if (target.dataset.template) {
      await saveSplash({ template: target.dataset.template, mode: 'ready' });
      closePopover();
      return;
    }
    if (target.dataset.setup === 'names') return openNames(target);
    if (target.dataset.spin) return act({ action: 'wheelSpin' });
    if (target.dataset.seconds) return act({ action: 'timerStart', seconds: Number(target.dataset.seconds), label: 'Время' });
    if (target.dataset.timer === 'pause') return act({ action: 'timerPause' });
    if (target.dataset.quiz === 'start') return act({ action: 'quizOpen' });
    if (target.dataset.quiz === 'reveal') return act({ action: 'quizReveal' });
    if (target.dataset.quiz === 'next') return act({ action: 'quizGoto', index: ((state.live.quiz && state.live.quiz.index) || 0) + 1 });
    if (target.dataset.team) return act({ action: 'boardScore', teamId: target.dataset.team, delta: 1 });
    if (target.dataset.announce) return act({ action: 'boardAnnounce' });
    if (target.dataset.timing) return act({ action: 'timingSet', index: Number(target.dataset.timing) });
    if (target.dataset.remove) {
      const splash = state.live.splash;
      await saveSplash({ photos: (splash.photos || []).filter((url) => url !== target.dataset.remove), video: splash.video === target.dataset.remove ? '' : splash.video });
      showFiles(target);
      return;
    }
    if (target.id === 'saveScene') return saveCurrent();
    if (target.id === 'newHoliday') {
      openModal(holidayForm());
      $('saveHoliday').onclick = saveNewHoliday;
      return;
    }
    if (target.dataset.pick) {
      state.selected = target.dataset.pick;
      localStorage.setItem('pe-event', state.selected);
      closeModal();
      renderTop();
      await loadShow();
      return;
    }
    if (target.dataset.edit) {
      const current = state.events.find((item) => item.id === target.dataset.edit);
      openModal(holidayForm(current));
      $('saveHoliday').onclick = () => saveEdited(current.id);
      return;
    }
    if (target.dataset.close) return closeModal();
    if (target.id === 'logout') return;
  } catch (error) {
    toast(error.message);
  }
});

function typeValue(label) {
  return ({ 'Свадьба': 'wedding', 'День рождения': 'birthday', 'Юбилей': 'anniversary', 'Корпоратив': 'corporate', 'Выпускной': 'prom', 'Новый год': 'newyear', 'Детский праздник': 'kids', 'Квиз': 'quiz' })[label] || 'wedding';
}

function openReady(anchor) {
  openPopover(anchor, `<h3>Готовые заставки</h3><p>Цвет надписи. Фото и видео не стираются.</p><div class="row">
    <button class="chip" data-template="gold" type="button">Золото</button>
    <button class="chip" data-template="white" type="button">Белая</button>
    <button class="chip" data-template="neon" type="button">Неон</button>
    <button class="chip" data-template="kids" type="button">Детская</button>
  </div>`);
}

function openTitle(anchor) {
  const splash = (state.live && state.live.splash) || {};
  openPopover(anchor, `<h3>Надпись</h3><label>Заголовок</label><input class="field" id="splashTitle" value="${esc(splash.title || '')}"><label>Подзаголовок</label><input class="field" id="splashSub" value="${esc(splash.subtitle || '')}">
    <div class="row" style="margin-top:8px"><button class="btn" id="applyTitle" type="button">На экран</button></div>`);
  $('applyTitle').onclick = async () => {
    await saveSplash({ title: $('splashTitle').value, subtitle: $('splashSub').value, mode: 'normal' });
    closePopover();
  };
}

function openNames(anchor) {
  const names = ((state.live && state.live.wheel && state.live.wheel.names) || []).join('\n');
  openPopover(anchor, `<h3>Имена</h3><textarea id="namesBox" rows="6">${esc(names)}</textarea><div class="row" style="margin-top:8px"><button class="btn" id="applyNames" type="button">На колесо</button></div>`);
  $('applyNames').onclick = async () => {
    await act({ action: 'wheelNames', names: $('namesBox').value.split('\n') });
    closePopover();
  };
}

function showFiles(anchor) {
  const splash = (state.live && state.live.splash) || { photos: [], video: '' };
  const files = (splash.photos || []).concat(splash.video ? [splash.video] : []);
  openPopover(anchor, `<h3>Файлы</h3>${files.length ? files.map((url) => `<div class="event-row"><span>${esc(url.split('/').pop())}</span><button class="btn ghost" data-remove="${esc(url)}" type="button">Убрать</button></div>`).join('') : '<p>Пока нет загруженных фото и видео.</p>'}`);
}

async function saveCurrent() {
  if (state.tool === 'splash') {
    await saveSplash({});
    toast('Заставка сохранена');
    return;
  }
  toast('Сцена уже на экране');
}

async function saveNewHoliday() {
  const data = await api('/api/events', { method: 'POST', body: JSON.stringify(readHoliday()) });
  await refreshEvents();
  state.selected = data.event.id;
  localStorage.setItem('pe-event', state.selected);
  closeModal();
  renderTop();
  await loadShow();
}

async function saveEdited(id) {
  await api(`/api/events/${id}`, { method: 'PATCH', body: JSON.stringify(readHoliday()) });
  await refreshEvents();
  closeModal();
  renderTop();
  toast('Карточка сохранена');
}

async function refreshEvents() {
  const data = await api('/api/events');
  state.events = data.events;
  if (!state.events.some((event) => event.id === state.selected)) state.selected = state.events[0] && state.events[0].id;
}

function playLocal(type) {
  if (!state.sound) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const notes = type === 'fanfare' ? [523, 659, 784, 1046] : type === 'salute' ? [880, 1175] : [660, 880];
  notes.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = ctx.currentTime + index * 0.14;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
    osc.start(start);
    osc.stop(start + 0.22);
  });
}

function tick() {
  const now = new Date();
  $('clock').textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  $('dateLine').textContent = now.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
  if (state.me && state.me.trialEndsAt) {
    const left = Math.max(0, state.me.trialEndsAt - Date.now());
    const hours = Math.floor(left / 3600000);
    const mins = Math.floor((left % 3600000) / 60000);
    $('demoPill').textContent = `Демо-доступ: осталось ${hours} ч ${mins} мин`;
  }
}

async function boot() {
  const me = await api('/api/auth/me');
  state.me = me.user;
  const catalog = await api('/api/catalog');
  state.catalog = catalog.items || [];
  await refreshEvents();
  const stored = localStorage.getItem('pe-event');
  if (stored && state.events.some((event) => event.id === stored)) state.selected = stored;
  renderTop();
  renderSections();
  applyZoom();
  await loadShow();
  tick();
  setInterval(tick, 30000);
  $('screen').addEventListener('load', () => { postSound(); applyZoom(); });
  $('search').addEventListener('input', () => { state.query = $('search').value; renderSections(); });
  $('zoomIn').onclick = () => { state.zoom = Math.min(160, state.zoom + 10); applyZoom(); };
  $('zoomOut').onclick = () => { state.zoom = Math.max(60, state.zoom - 10); applyZoom(); };
  $('sideToggle').onclick = () => $('side').classList.toggle('open');
  $('modalBack').addEventListener('click', (event) => { if (event.target.id === 'modalBack') closeModal(); });
  document.addEventListener('click', (event) => {
    if (event.target.id === 'tourNext') { state.tour += 1; renderTour(); }
    if (event.target.id === 'tourSkip') { state.tour = 99; renderTour(); }
  });
  if (!localStorage.getItem('pe-tour')) renderTour();
}

boot().catch((error) => toast(error.message));
