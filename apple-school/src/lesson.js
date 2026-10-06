// One small lesson. Add exercises here; the interface and voice player stay the same.
export const EXERCISES = [
  { id: 'add-3-2', operation: 'add', a: 3, b: 2, choices: [4, 5, 6] },
  { id: 'sub-5-2', operation: 'subtract', a: 5, b: 2, choices: [2, 3, 4] },
  { id: 'add-2-4', operation: 'add', a: 2, b: 4, choices: [5, 6, 7] },
  { id: 'sub-6-2', operation: 'subtract', a: 6, b: 2, choices: [3, 4, 5] },
  { id: 'add-4-3', operation: 'add', a: 4, b: 3, choices: [6, 7, 8] },
];

export const AUDIO = {
  'hello-sasha': 'hello-sasha.mp3', 'hello-masha': 'hello-masha.mp3',
  'hello-misha': 'hello-misha.mp3', hello: 'hello.mp3',
  add: 'add.mp3', subtract: 'subtract.mp3', correct: 'correct.mp3',
  retry: 'retry.mp3', hint: 'hint.mp3', finish: 'finish.mp3',
};

export const STORAGE_KEY = 'yablochkin.demo.v1';
export const answerFor = (exercise) => exercise.operation === 'add' ? exercise.a + exercise.b : exercise.a - exercise.b;
export const symbolFor = (exercise) => exercise.operation === 'add' ? '+' : '−';
export const greetingFor = (name) => ({ саша: 'hello-sasha', маша: 'hello-masha', миша: 'hello-misha' }[name.toLocaleLowerCase('ru')] || 'hello');
export const appleWord = (n) => n === 1 ? 'яблоко' : n >= 2 && n <= 4 ? 'яблока' : 'яблок';

export function cleanName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 24) : '';
}
export function isValidName(value) {
  return /^[\p{L}][\p{L} ’'\-]{0,23}$/u.test(cleanName(value));
}
export function freshState() {
  return { version: 1, name: 'Саша', muted: false, step: 0, solved: [], totalStars: 0, completedLessons: 0 };
}

// Reject malformed saved data. A solved prefix is the only valid lesson history.
export function normalizeState(raw) {
  const base = freshState();
  if (!raw || typeof raw !== 'object' || raw.version !== 1) return base;
  if (isValidName(raw.name)) base.name = cleanName(raw.name);
  base.muted = raw.muted === true;
  for (const key of ['totalStars', 'completedLessons']) {
    if (Number.isSafeInteger(raw[key]) && raw[key] >= 0) base[key] = Math.min(raw[key], 1000000);
  }
  if (Number.isInteger(raw.step) && raw.step >= 0 && raw.step <= EXERCISES.length && Array.isArray(raw.solved)) {
    const ids = EXERCISES.map((item) => item.id);
    const prefix = raw.solved.length <= ids.length && raw.solved.every((id, i) => id === ids[i]);
    if (prefix && raw.solved.length >= raw.step && raw.solved.length <= Math.min(raw.step + 1, ids.length)) {
      base.step = raw.step;
      base.solved = [...raw.solved];
      base.totalStars = Math.max(base.totalStars, base.solved.length);
    }
  }
  return base;
}

export function readState(storage) {
  try { return normalizeState(JSON.parse(storage.getItem(STORAGE_KEY))); }
  catch { return freshState(); }
}
export function saveState(storage, state) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}

export function fruitGroups(exercise) {
  const left = Array.from({ length: exercise.a }, (_, i) => ({
    id: `left-${i}`, removed: exercise.operation === 'subtract' && i >= answerFor(exercise),
  }));
  const right = Array.from({ length: exercise.b }, (_, i) => ({ id: `right-${i}`, removed: exercise.operation === 'subtract' }));
  return { left, right };
}

export function awardAnswer(state, value) {
  const exercise = EXERCISES[state.step];
  if (!exercise || value !== answerFor(exercise)) return false;
  if (!state.solved.includes(exercise.id)) {
    state.solved.push(exercise.id);
    state.totalStars += 1;
  }
  return true;
}
export function advance(state) {
  const exercise = EXERCISES[state.step];
  if (!exercise || !state.solved.includes(exercise.id)) return false;
  state.step += 1;
  if (state.step === EXERCISES.length) state.completedLessons += 1;
  return true;
}
export function restart(state) {
  state.step = 0;
  state.solved = [];
}
