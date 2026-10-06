import '@fontsource-variable/nunito';
import { icon, mascotSvg } from '@apple-school/art.js';
import { VoicePlayer } from '@apple-school/audio.js';
import { rabbitSvg } from './rabbit-art.js';
import './lab.css';

const SVG_FOR = { apple: mascotSvg, rabbit: rabbitSvg };
const CHAR_NAME = { apple: 'Яблочкин', rabbit: 'Кролик' };

const shell = document.createElement('div');
shell.className = 'lab-shell';
shell.innerHTML = `
  <header class="lab-head">
    <p class="lab-eyebrow">${icon('bulb')} Эксперимент · только плоская качественная анимация</p>
    <h1>Герои, которые живут по-настоящему</h1>
    <p class="lab-lead">Выбери персонажа и поговори с ним: он моргает, машет, думает и радуется, а рот двигается от реальной громкости звука. Всё нарисовано и анимировано в 2D.</p>
  </header>
  <div class="lab-chars" role="tablist" aria-label="Персонаж">
    <button class="char is-active" data-char="apple" role="tab" aria-selected="true">Яблочкин</button>
    <button class="char" data-char="rabbit" role="tab" aria-selected="false">Кролик</button>
  </div>
  <div class="lab-body">
    <div class="stage stage-2d" data-stage="2d"></div>
  </div>
  <p class="lab-caption" data-caption></p>
  <section class="lab-panel">
    <div class="panel-group">
      <h2>Голос и реакции</h2>
      <div class="panel-row">
        <button class="btn" data-say="hello-sasha" data-pose="wave">${icon('sound')} Привет, Саша!</button>
        <button class="btn" data-say="correct" data-pose="cheer">${icon('star')} Похвала</button>
        <button class="btn" data-say="hint" data-pose="think">${icon('bulb')} Подсказка</button>
        <button class="btn btn-ghost" data-stop>${icon('close')} Стоп</button>
        <button class="btn btn-ghost" data-mute aria-pressed="false">${icon('mute')} Без звука</button>
      </div>
      <p class="panel-note">Записи — те же, что в уроке. В покое герой улыбается; когда говорит, улыбка уступает место открывающемуся рту — без наложений.</p>
    </div>
    <div class="panel-group" data-rabbit-only hidden>
      <h2>Движения кролика</h2>
      <div class="panel-row">
        <button class="btn btn-ghost" data-move="wave">Помахать рукой</button>
        <button class="btn btn-ghost" data-move="jump">Попрыгать</button>
        <button class="btn btn-ghost" data-move="kick">Дёрнуть ногой</button>
        <button class="btn btn-ghost" data-move="ears">Поводить ушами</button>
        <button class="btn btn-ghost" data-move="wink">Подмигнуть</button>
        <button class="btn btn-ghost" data-move="tongue">Показать язык</button>
      </div>
      <h2>Эмоции кролика</h2>
      <div class="panel-row">
        <button class="btn btn-ghost emotion is-active" data-emotion="neutral">Обычная</button>
        <button class="btn btn-ghost emotion" data-emotion="joy">Радость</button>
        <button class="btn btn-ghost emotion" data-emotion="sad">Грусть</button>
        <button class="btn btn-ghost emotion" data-emotion="surprise">Удивление</button>
      </div>
      <p class="panel-note">Кнопки дёргают отдельные части тела: руки, ноги, уши, глаза и рот. Эмоция меняет уши, брови и рот сразу.</p>
    </div>
    <div class="panel-group">
      <h2>Что сейчас на экране</h2>
      <p class="panel-note" data-stats></p>
    </div>
  </section>
`;
document.getElementById('lab').append(shell);

const stage = shell.querySelector('[data-stage]');
const caption = shell.querySelector('[data-caption]');
const stats = shell.querySelector('[data-stats]');
const rabbitPanel = shell.querySelector('[data-rabbit-only]');
let char = 'apple';
let svg = null;
let poseTimer = null;

const voice = new VoicePlayer({
  onState(state) {
    const talking = state === 'speaking';
    if (svg) {
      svg.dataset.talking = String(talking);
      if (talking && svg.dataset.pose === 'idle') svg.dataset.pose = 'talk';
    }
    if (state === 'error') stats.textContent = 'Запись не проигралась. Анимации продолжают работать.';
  },
  onLevel(level) { svg?.style.setProperty('--mouth', level.toFixed(3)); },
  onError() {},
});

function setChar(next) {
  char = next;
  voice.stop();
  clearTimeout(poseTimer);
  for (const button of shell.querySelectorAll('[data-char]')) {
    const active = button.dataset.char === next;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  }
  rabbitPanel.hidden = next !== 'rabbit';
  stage.innerHTML = SVG_FOR[char]();
  svg = stage.querySelector('#mascot-svg');
  svg.dataset.talking = 'false';
  svg.style.setProperty('--mouth', '0');
  svg.dataset.pose = 'idle';
  if (svg.dataset.emotion) svg.dataset.emotion = 'neutral';
  for (const button of shell.querySelectorAll('[data-emotion]')) {
    button.classList.toggle('is-active', button.dataset.emotion === 'neutral');
  }
  caption.textContent = `${CHAR_NAME[char]} — плоская векторная графика (SVG) с живыми анимациями: моргание, позы и рот от реальной громкости звука.`;
  stats.textContent = next === 'rabbit'
    ? 'У кролика каждая часть тела — отдельная группа: руки, ноги, уши, глаза и рот двигаются независимо. Попробуй кнопки движений и эмоций.'
    : 'Формат: SVG. Двигаются отдельные группы — глаза, руки и рот, — поэтому герой лёгкий и плавный на любом устройстве.';
}

shell.addEventListener('click', (event) => {
  const charButton = event.target.closest('[data-char]');
  if (charButton) { setChar(charButton.dataset.char); return; }
  const say = event.target.closest('[data-say]');
  if (say) {
    if (svg) svg.dataset.pose = say.dataset.pose || 'wave';
    voice.play(say.dataset.say);
    return;
  }
  if (event.target.closest('[data-stop]')) { voice.stop(); if (svg) svg.dataset.pose = 'idle'; return; }
  const move = event.target.closest('[data-move]');
  if (move && svg) {
    svg.dataset.pose = move.dataset.move;
    clearTimeout(poseTimer);
    poseTimer = setTimeout(() => { if (svg && svg.dataset.talking !== 'true') svg.dataset.pose = 'idle'; }, 2600);
    return;
  }
  const emotion = event.target.closest('[data-emotion]');
  if (emotion && svg) {
    svg.dataset.emotion = emotion.dataset.emotion;
    for (const button of shell.querySelectorAll('[data-emotion]')) {
      button.classList.toggle('is-active', button === emotion);
    }
    return;
  }
  const mute = event.target.closest('[data-mute]');
  if (mute) {
    const pressed = mute.getAttribute('aria-pressed') !== 'true';
    mute.setAttribute('aria-pressed', String(pressed));
    mute.classList.toggle('is-off', pressed);
    voice.setMuted(pressed);
  }
});

setChar('apple');
