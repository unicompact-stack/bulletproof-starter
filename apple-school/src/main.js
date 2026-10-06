import '@fontsource-variable/nunito';
import './style.css';
import { EXERCISES, answerFor, symbolFor, greetingFor, appleWord, cleanName, isValidName, readState, saveState, fruitGroups, awardAnswer, advance, restart } from './lesson.js';
import { icon, appleSvg, mascotSvg, gardenSvg } from './art.js';
import { VoicePlayer } from './audio.js';

const $ = (selector) => document.querySelector(selector);
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
let storage;
try { storage = window.localStorage; } catch { /* Private browsing can disable storage. */ }
const state = readState(storage);

// Герой может быть плоским (SVG) или объёмным (3D). Фасад шлёт команды обоим,
// а когда 3D готов — он заменяет рисунок внутри кнопки.
const mascot = {
  api: null,
  setPose(pose) {
    const svg = document.getElementById('mascot-svg');
    if (svg) svg.dataset.pose = pose;
    this.api?.setPose(pose);
  },
  setTalking(value) {
    const svg = document.getElementById('mascot-svg');
    if (svg) svg.dataset.talking = String(value);
    this.api?.setTalking(value);
  },
  setLevel(value) {
    const svg = document.getElementById('mascot-svg');
    if (svg) svg.style.setProperty('--mouth', value.toFixed(3));
    this.api?.setLevel(value);
  },
};
function initMascot3D() {
  // В игре остаётся проверенный плоский герой — так, как было.
  // Объёмный вариант включается только явно: ?3d=1 (а сравнение живёт в «Лаборатории 3D»).
  if (!new URLSearchParams(window.location.search).has('3d')) return;
  const host = document.getElementById('mascot-button');
  const svg = document.getElementById('mascot-svg');
  const startPose = svg?.dataset.pose || 'idle';
  import('./mascot3d.js')
    .then(({ createMascot3D }) => {
      const api = createMascot3D(host);
      api.setPose(startPose);
      mascot.api = api;
    })
    .catch((error) => console.warn('3D недоступен — остаётся плоский герой.', error));
}
let selected = null;
let feedback = null;
let counted = [];
let voiceState = 'idle';
let lastPhrase;
let toastTimer;

$('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="#" data-action="home" aria-label="Яблочкин — наш урок">
      <span class="brand-mark">${icon('leaf')}</span>
      <span class="brand-name">Яблочкин<span>считаем вместе</span></span>
    </a>
    <nav class="header-nav" aria-label="Главное меню">
      <button class="nav-button active" data-action="home">${icon('book')} Наш урок</button>
      <button class="nav-button" data-action="progress">${icon('star')} Мои звёздочки</button>
    </nav>
    <div class="header-tools">
      <button id="sound-button" class="sound-button" data-action="sound" aria-label="Выключить звук"></button>
      <button class="profile-button" data-action="profile" aria-label="Изменить имя ребёнка"><span class="profile-avatar" id="profile-letter">С</span><span id="profile-name">Саша</span>${icon('pencil')}</button>
    </div>
  </header>
  <main class="page">
    <section class="page-heading" aria-labelledby="page-title">
      <div><p class="eyebrow"><span class="tiny-dot"></span> МАТЕМАТИКА В ИГРЕ</p><h1 id="page-title">Считаем <span>вместе!</span></h1><p class="page-description">Маленькие яблоки. Большие открытия.</p></div>
      <div class="lesson-details"><span class="class-badge">1 класс</span><span>Сложение и вычитание до 10<br><strong>Один маленький урок · ${EXERCISES.length} примеров</strong></span></div>
    </section>
    <div class="lesson-layout">
      <section id="lesson" class="lesson-card" aria-label="Интерактивный урок"></section>
      <aside class="mentor-card" aria-label="Яблочкин — твой помощник">
        <p class="mentor-eyebrow"><span class="tiny-dot"></span> ТВОЙ ДРУГ И ПОМОЩНИК</p>
        <div class="speech-bubble">
          <div class="speech-label"><span>Яблочкин</span><button class="bubble-replay" data-action="replay" title="Послушать ещё раз" aria-label="Повторить слова Яблочкина">${icon('sound')}</button></div>
          <p id="speech-text"></p>
          <span class="bubble-sparkle">✦</span>
        </div>
        <div class="mascot-stage">
          <span class="floating-flower flower-one">✦</span><span class="floating-flower flower-two">✧</span>
          <div class="mascot-halo"></div>
          <button id="mascot-button" class="mascot-button" data-action="mascot" aria-label="Поздороваться с Яблочкиным">${mascotSvg()}</button>
        </div>
        <div class="voice-status" id="voice-status"><span class="audio-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span id="voice-status-text">Нажми на меня — я поздороваюсь</span></div>
        <button class="hello-button" data-action="greet">${icon('play')}<span id="greet-text">Привет, Яблочкин!</span></button>
        <div class="mentor-note">${icon('heart')}<p>Можно ошибаться.<br><strong>Здесь мы учимся, а не спешим.</strong></p></div>
      </aside>
    </div>
    <footer class="page-footer"><span>${icon('leaf')} По одному яблочку. По одной маленькой победе.</span><button data-action="about">Как это работает ${icon('arrow')}</button></footer>
  </main>
  <dialog id="profile-dialog" class="dialog">
    <div class="dialog-body"><button class="dialog-close" data-close="profile-dialog" aria-label="Закрыть">${icon('close')}</button><div class="dialog-symbol">${icon('smile')}</div><p class="eyebrow">ДАВАЙ ЗНАКОМИТЬСЯ</p><h2>Как тебя зовут?</h2><p class="dialog-description">Яблочкин будет обращаться к тебе по имени.</p>
      <form id="profile-form"><label for="child-name">Твоё имя</label><input id="child-name" name="name" maxlength="24" autocomplete="off" required placeholder="Например, Саша"/><div class="name-presets"><button type="button" data-name="Саша">Саша</button><button type="button" data-name="Маша">Маша</button><button type="button" data-name="Миша">Миша</button></div><button class="primary-button form-submit" type="submit">Давай дружить! ${icon('arrow')}</button></form>
      <p class="privacy-note">Имя хранится только в этом браузере.</p><details class="technical-note"><summary>Для взрослых: об именных голосах</summary><p>Для Саши, Маши и Миши уже записаны именные MP3 выбранным женским голосом. Можно ввести другое имя: оно появится в облачке, а приветствие пока прозвучит без имени. Новую именную запись легко добавить в набор.</p></details>
    </div>
  </dialog>
  <dialog id="progress-dialog" class="dialog"><div class="dialog-body" id="progress-content"></div></dialog>
  <dialog id="about-dialog" class="dialog"><div class="dialog-body"><button class="dialog-close" data-close="about-dialog" aria-label="Закрыть">${icon('close')}</button><div class="dialog-symbol">${icon('leaf')}</div><p class="eyebrow">МАЛЕНЬКИЙ РАБОЧИЙ ПРОТОТИП</p><h2>Всё начинается<br>с одного яблочка.</h2><p class="dialog-description">Пять примеров на сложение и вычитание. Нажимай на яблоки, выбирай ответ, а Яблочкин поможет и подарит звёздочку.</p><ul class="about-list"><li>${icon('sound')} Настоящие записи MP3, без платных API во время урока.</li><li>${icon('smile')} Анимированный герой: машет, говорит и радуется.</li><li>${icon('star')} Имя, урок и звёздочки сохраняются в этом браузере.</li></ul><p class="privacy-note">Нет аккаунтов, рекламы и микрофона. Это учебное демо, а не полноценный курс.</p><button class="primary-button form-submit" data-close="about-dialog">Понятно, давай считать! ${icon('arrow')}</button></div></dialog>
  <div id="toast" class="toast" role="status" hidden></div>
  <div id="celebration" class="celebration" aria-hidden="true"></div>
`;

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000);
}
function persist() {
  if (!saveState(storage, state)) toast('Браузер не разрешает сохранять прогресс. Урок всё равно работает.');
}
const voice = new VoicePlayer({
  onState(value) {
    voiceState = value;
    mascot.setTalking(value === 'speaking');
    $('#voice-status').dataset.state = value;
    const descriptions = { loading: 'Сейчас загружу голос…', speaking: 'Яблочкин говорит', error: 'Звук не включился. Попробуй ещё раз.', idle: state.muted ? 'Сейчас без звука — облачко остаётся' : 'Нажми на меня — я поздороваюсь' };
    $('#voice-status-text').textContent = descriptions[value];
    $('#mascot-button').setAttribute('aria-label', value === 'speaking' || value === 'loading' ? 'Остановить голос Яблочкина' : 'Поздороваться с Яблочкиным');
    if (value === 'idle') mascot.setPose(feedback === 'correct' || state.step === EXERCISES.length ? 'cheer' : 'idle');
  },
  onLevel(value) { mascot.setLevel(value); },
  onError() { toast('Не удалось проиграть запись. Нажми «Повторить» или проверь звук устройства.'); },
});
voice.setMuted(state.muted);

function bubble(text, key, pose = 'idle', speak = true) {
  lastPhrase = { text, key, pose };
  $('#speech-text').textContent = text;
  mascot.setPose(pose);
  if (speak) {
    // play() cancels the previous clip, so a new interaction never overlaps voices.
    voice.play(key);
    mascot.setPose(pose);
  }
}
function greeting(speak = true) {
  bubble(`Привет, ${state.name}! Как дела? Я Яблочкин. Давай посчитаем яблоки вместе!`, greetingFor(state.name), 'wave', speak);
  if (speak) $('#greet-text').textContent = 'Поздороваться ещё';
}
function updateHeader() {
  $('#profile-name').textContent = state.name;
  $('#profile-letter').textContent = state.name.slice(0, 1).toUpperCase();
  $('#sound-button').innerHTML = `${icon(state.muted ? 'mute' : 'sound')}<span>${state.muted ? 'Без звука' : 'Звук вкл'}</span>`;
  $('#sound-button').setAttribute('aria-label', state.muted ? 'Включить звук' : 'Выключить звук');
  $('#sound-button').setAttribute('aria-pressed', String(!state.muted));
}
function starsMarkup(count, className = '') {
  return `<div class="star-row ${className}" aria-label="${count} из ${EXERCISES.length} звёздочек">${EXERCISES.map((_, i) => `<span class="star ${i < count ? 'earned' : ''}">${icon('star')}</span>`).join('')}</div>`;
}
function fruitMarkup(fruit, order) {
  const number = counted.indexOf(fruit.id) + 1;
  return `<button class="fruit ${fruit.removed ? 'removed' : ''} ${number ? 'counted' : ''}" data-fruit="${fruit.id}" ${fruit.removed ? 'disabled' : ''} aria-label="${fruit.removed ? 'Это яблоко убрали' : `Посчитать яблоко ${order + 1}`}${number ? `, посчитано: ${number}` : ''}" aria-pressed="${Boolean(number)}">${appleSvg(fruit.id)}${fruit.removed ? '<span class="removed-mark">−</span>' : `<span class="count-label">${number || ''}</span>`}</button>`;
}
function renderLesson() {
  if (state.step === EXERCISES.length) { renderFinish(); return; }
  const exercise = EXERCISES[state.step];
  const groups = fruitGroups(exercise);
  const isAdd = exercise.operation === 'add';
  const correct = feedback === 'correct';
  const countable = [...groups.left, ...groups.right].filter((fruit) => !fruit.removed).length;
  $('#lesson').innerHTML = `
    <div class="lesson-card-header"><div class="lesson-title"><span class="lesson-icon">${icon('leaf')}</span><div><p class="eyebrow">УРОК 01</p><h2>Яблочный сад</h2></div></div><button class="lesson-progress" data-action="progress" aria-label="Посмотреть мои звёздочки">${starsMarkup(state.solved.length)}<span>${state.solved.length} / ${EXERCISES.length}</span></button></div>
    <div class="exercise-heading"><h3>${isAdd ? 'Сколько яблок стало?' : 'Сколько яблок осталось?'}</h3><span class="step-badge">Пример ${state.step + 1} из ${EXERCISES.length}</span></div>
    <div class="task-scene ${isAdd ? '' : 'subtraction'}"><span class="operation-label">${isAdd ? 'Складываем' : 'Вычитаем'}</span><span class="scene-sun" aria-hidden="true">☀</span>
      <div class="fruit-groups"><div class="fruit-group"><p class="group-label">Было</p><div class="fruit-collection">${groups.left.map(fruitMarkup).join('')}</div><p class="group-caption">${exercise.a} ${appleWord(exercise.a)}</p></div><span class="group-operator" aria-hidden="true">${symbolFor(exercise)}</span><div class="fruit-group"><p class="group-label">${isAdd ? 'Добавили' : 'Забрали'}</p><div class="fruit-collection ${isAdd ? '' : 'taken-apples'}">${groups.right.map(fruitMarkup).join('')}</div><p class="group-caption">${exercise.b} ${appleWord(exercise.b)}</p></div></div>${gardenSvg}
    </div>
    <div class="counting-help"><span class="counting-dot"></span><span>${counted.length ? `Посчитали: ${counted.length} из ${countable}` : 'Нажимай на яркие яблоки, чтобы посчитать'}</span>${counted.length ? '<button data-action="recount">Сначала</button>' : ''}</div>
    <div class="equation ${correct ? 'equation-correct' : ''}" aria-label="${exercise.a} ${isAdd ? 'плюс' : 'минус'} ${exercise.b} равно ${correct ? answerFor(exercise) : 'вопрос'}"><span>${exercise.a}</span><span class="math-symbol">${symbolFor(exercise)}</span><span>${exercise.b}</span><span class="math-symbol equals">=</span><span class="question-number">${correct ? answerFor(exercise) : '?'}</span>${correct ? `<span class="equation-check">${icon('check')}</span>` : ''}</div>
    <div class="answer-heading"><span>${correct ? 'Вот и маленькая победа!' : 'Выбери свой ответ'}</span><span class="keyboard-note">можно клавишами 1, 2, 3</span></div>
    <div class="answer-options" role="group" aria-label="Варианты ответа">${exercise.choices.map((value, i) => `<button class="answer-option ${value === selected ? 'selected' : ''} ${value === selected && feedback ? feedback : ''}" data-answer="${value}" aria-pressed="${value === selected}" ${correct ? 'disabled' : ''}><span class="option-key">${i + 1}</span><span class="option-value">${value}</span><span class="option-indicator">${value === selected ? icon(correct ? 'check' : 'leaf') : ''}</span></button>`).join('')}</div>
    <div id="answer-feedback" class="answer-feedback ${feedback || ''}" role="status">${correct ? `${icon('star')} Верно! +1 звёздочка за старание` : feedback === 'wrong' ? `${icon('heart')} Ничего страшного. Давай посчитаем ещё раз!` : '<span class="feedback-placeholder">Каждый ответ — новый маленький шаг.</span>'}</div>
    <div class="lesson-actions"><button class="hint-button" data-action="hint">${icon('bulb')} Подсказка</button><button id="check-button" class="primary-button" data-action="${correct ? 'next' : feedback === 'wrong' ? 'retry' : 'check'}" ${selected === null ? 'disabled' : ''}>${correct ? state.step === EXERCISES.length - 1 ? 'Собрать звёздочки' : 'Следующий пример' : feedback === 'wrong' ? 'Попробуем ещё' : 'Проверить ответ'} ${icon(correct ? 'arrow' : 'check')}</button></div>
  `;
}
function renderFinish() {
  $('#lesson').innerHTML = `<div class="finish-screen"><span class="finish-label">УРОК 01 · ГОТОВО</span><div class="finish-medal">${icon('star')}<span>${EXERCISES.length}</span><i>✦</i></div><p class="eyebrow">МАЛЕНЬКАЯ БОЛЬШАЯ ПОБЕДА</p><h2>Вот это успех,<br><span>${escape(state.name)}!</span></h2><p>Все примеры решены.<br>Ты собираешь не только звёздочки, но и знания.</p>${starsMarkup(EXERCISES.length, 'finish-stars')}<div class="finish-message">${icon('heart')} А теперь можно немного отдохнуть.</div><button class="primary-button" data-action="restart">Сыграть ещё раз ${icon('replay')}</button><button class="text-button" data-action="progress">Посмотреть мои звёздочки ${icon('arrow')}</button></div>`;
}
function selectAnswer(value) {
  if (feedback === 'correct' || !EXERCISES[state.step]?.choices.includes(value)) return;
  selected = value;
  feedback = null;
  renderLesson();
  $(`[data-answer="${value}"]`)?.focus({ preventScroll: true });
}
function checkAnswer() {
  if (selected === null || feedback === 'correct' || !EXERCISES[state.step]) return;
  const correct = awardAnswer(state, selected);
  feedback = correct ? 'correct' : 'wrong';
  persist();
  renderLesson();
  if (correct) {
    bubble(`Ура, ${state.name}! Всё верно — ${answerFor(EXERCISES[state.step])} ${appleWord(answerFor(EXERCISES[state.step]))}. Держи звёздочку за старание!`, 'correct', 'cheer');
    celebrate();
  } else bubble(`${state.name}, ничего страшного! Давай посчитаем ещё раз. Я рядом, у тебя получится.`, 'retry', 'think');
  $('#check-button')?.focus({ preventScroll: true });
}
function hint() {
  if (!EXERCISES[state.step]) { voice.play(lastPhrase.key); return; }
  const isAdd = EXERCISES[state.step].operation === 'add';
  bubble(`${state.name}, нажимай на ${isAdd ? 'все яркие яблоки слева и справа' : 'яркие яблоки слева'}. Последнее число подскажет ответ!`, 'hint', 'think');
}
function next() {
  if (!advance(state)) return;
  selected = null;
  feedback = null;
  counted = [];
  persist();
  renderLesson();
  if (state.step === EXERCISES.length) {
    bubble(`Вот это да, ${state.name}! Все примеры решены. Все звёздочки — твои! Дай ладошку!`, 'finish', 'cheer');
    celebrate();
    $('[data-action="restart"]')?.focus({ preventScroll: true });
  } else {
    const exercise = EXERCISES[state.step];
    bubble(exercise.operation === 'add' ? `А теперь складываем! Посчитай яблоки в обеих группах. Сколько получилось всего, ${state.name}?` : `Теперь вычитаем! Прозрачные яблоки забрали. Сколько ярких яблок осталось слева, ${state.name}?`, exercise.operation, 'talk');
    $('#lesson h3')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
function startAgain() {
  voice.stop();
  restart(state);
  selected = null;
  feedback = null;
  counted = [];
  persist();
  renderLesson();
  bubble(`Новый маленький урок, ${state.name}! Давай сложим яблоки. Нажимай на них по одному.`, 'add', 'wave');
}
function progress() {
  $('#progress-content').innerHTML = `<button class="dialog-close" data-close="progress-dialog" aria-label="Закрыть">${icon('close')}</button><div class="dialog-symbol gold">${icon('star')}</div><p class="eyebrow">ТВОИ МАЛЕНЬКИЕ ПОБЕДЫ</p><h2>Коллекция ${escape(state.name)}</h2><div class="total-stars">${icon('star')}<strong>${state.totalStars}</strong></div><p class="dialog-description">Звёздочки за старание.<br>Ошибки их не отнимают.</p><div class="progress-stats"><div><strong>${state.completedLessons}</strong><span>уроков пройдено</span></div><div><strong>${state.solved.length} / ${EXERCISES.length}</strong><span>в этом уроке</span></div></div><button class="primary-button form-submit" data-close="progress-dialog">${state.step === EXERCISES.length ? 'Вернуться к победе' : 'Продолжить урок'} ${icon('arrow')}</button><p class="privacy-note">Сохранено в этом браузере. Без аккаунта и оценок.</p>`;
  $('#progress-dialog').showModal();
}
function celebrate() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  $('#celebration').innerHTML = Array.from({ length: 18 }, (_, i) => `<span style="--x:${12 + (i * 37) % 78}%;--delay:${(i % 6) * .045}s;--turn:${i % 2 ? 155 : -135}deg;--color:${['#e9b957', '#90b665', '#ed987e'][i % 3]}">${i % 3 === 0 ? '✦' : '●'}</span>`).join('');
  setTimeout(() => { $('#celebration').innerHTML = ''; }, 2100);
}

$('#app').addEventListener('click', (event) => {
  const fruitButton = event.target.closest('[data-fruit]');
  if (fruitButton && !fruitButton.disabled && !counted.includes(fruitButton.dataset.fruit)) {
    counted.push(fruitButton.dataset.fruit);
    voice.tick(counted.length);
    const id = fruitButton.dataset.fruit;
    renderLesson();
    $(`[data-fruit="${id}"]`)?.focus({ preventScroll: true });
    return;
  }
  const answerButton = event.target.closest('[data-answer]');
  if (answerButton && !answerButton.disabled) { selectAnswer(Number(answerButton.dataset.answer)); return; }
  const preset = event.target.closest('[data-name]');
  if (preset) { $('#child-name').value = preset.dataset.name; $('#child-name').setCustomValidity(''); return; }
  const closeButton = event.target.closest('[data-close]');
  if (closeButton) { $(`#${closeButton.dataset.close}`).close(); return; }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  event.preventDefault();
  switch (button.dataset.action) {
    case 'home': window.scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'profile': $('#child-name').value = state.name; $('#profile-dialog').showModal(); $('#child-name').focus(); $('#child-name').select(); break;
    case 'progress': progress(); break;
    case 'about': $('#about-dialog').showModal(); break;
    case 'greet': greeting(); break;
    case 'mascot': if (voiceState === 'speaking' || voiceState === 'loading') voice.stop(); else greeting(); break;
    case 'replay': voice.play(lastPhrase.key); break;
    case 'hint': hint(); break;
    case 'check': checkAnswer(); break;
    case 'retry': selected = null; feedback = null; renderLesson(); hint(); break;
    case 'next': next(); break;
    case 'restart': startAgain(); break;
    case 'recount': counted = []; renderLesson(); break;
    case 'sound': state.muted = !state.muted; voice.setMuted(state.muted); persist(); updateHeader(); if (!state.muted) voice.play(lastPhrase.key); break;
  }
});
$('#profile-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#child-name');
  if (!isValidName(input.value)) { input.setCustomValidity('Напиши имя буквами, например Саша.'); input.reportValidity(); return; }
  state.name = cleanName(input.value);
  persist();
  updateHeader();
  if (state.step === EXERCISES.length) renderFinish();
  $('#profile-dialog').close();
  greeting();
});
$('#child-name').addEventListener('input', (event) => { event.target.setCustomValidity(''); });
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));
document.addEventListener('keydown', (event) => {
  if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA/.test(event.target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (/^[123]$/.test(event.key) && EXERCISES[state.step]) { event.preventDefault(); selectAnswer(EXERCISES[state.step].choices[Number(event.key) - 1]); }
  if (event.key === 'Enter' && event.target === document.body && selected !== null) { event.preventDefault(); checkAnswer(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) voice.stop(); });
window.addEventListener('pagehide', () => voice.stop());

if (EXERCISES[state.step] && state.solved.includes(EXERCISES[state.step].id)) {
  selected = answerFor(EXERCISES[state.step]);
  feedback = 'correct';
}
updateHeader();
renderLesson();
if (state.step === EXERCISES.length) bubble(`С возвращением, ${state.name}! Урок уже пройден. Можно отдохнуть или посчитать ещё раз!`, 'finish', 'cheer', false);
else if (feedback === 'correct') bubble(`Верно, ${state.name}! Звёздочка уже твоя. Готово — можно идти к следующему примеру.`, 'correct', 'cheer', false);
else greeting(false);
initMascot3D();
