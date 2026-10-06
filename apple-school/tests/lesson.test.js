import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { EXERCISES, AUDIO, answerFor, fruitGroups, freshState, awardAnswer, advance, restart, normalizeState, readState, saveState, greetingFor, isValidName } from '../src/lesson.js';

test('the five exercises are unambiguous and within ten', () => {
  assert.equal(EXERCISES.length, 5);
  for (const exercise of EXERCISES) {
    const answer = answerFor(exercise);
    assert.ok(answer >= 0 && answer <= 10);
    assert.equal(new Set(exercise.choices).size, 3);
    assert.ok(exercise.choices.includes(answer));
  }
});
test('the countable apples always equal the answer, including subtraction', () => {
  for (const exercise of EXERCISES) {
    const { left, right } = fruitGroups(exercise);
    assert.equal(left.length, exercise.a);
    assert.equal(right.length, exercise.b);
    assert.equal([...left, ...right].filter((fruit) => !fruit.removed).length, answerFor(exercise));
    assert.equal(new Set([...left, ...right].map((fruit) => fruit.id)).size, exercise.a + exercise.b);
  }
});
test('wrong answers do not change progress or remove stars', () => {
  const state = freshState();
  assert.equal(awardAnswer(state, 4), false);
  assert.equal(advance(state), false);
  assert.equal(state.step, 0);
  assert.equal(state.totalStars, 0);
});
test('a correct answer gives a single star, even after repeated checking', () => {
  const state = freshState();
  assert.equal(awardAnswer(state, 5), true);
  awardAnswer(state, 5);
  assert.equal(state.totalStars, 1);
  assert.deepEqual(normalizeState(state), state);
});
test('completing and restarting keep the accumulated achievements', () => {
  const state = freshState();
  for (const exercise of EXERCISES) {
    awardAnswer(state, answerFor(exercise));
    assert.equal(advance(state), true);
  }
  assert.equal(state.totalStars, 5);
  assert.equal(state.completedLessons, 1);
  assert.equal(advance(state), false);
  assert.deepEqual(normalizeState(state), state);
  restart(state);
  assert.equal(state.step, 0);
  assert.deepEqual(state.solved, []);
  assert.equal(state.totalStars, 5);
  assert.equal(state.completedLessons, 1);
});
test('saved progress can be resumed before and after advancing', () => {
  let value;
  const storage = { setItem: (_, v) => { value = v; }, getItem: () => value };
  const state = freshState();
  state.name = 'Маша';
  awardAnswer(state, 5);
  assert.equal(saveState(storage, state), true);
  assert.deepEqual(readState(storage), state);
  advance(state);
  saveState(storage, state);
  assert.deepEqual(readState(storage), state);
});
test('corrupt or unavailable storage never prevents a lesson', () => {
  assert.deepEqual(readState({ getItem: () => '{broken' }), freshState());
  assert.deepEqual(readState(undefined), freshState());
  assert.equal(saveState(undefined, freshState()), false);
  assert.equal(normalizeState({ ...freshState(), step: 4, solved: ['not-an-exercise'] }).step, 0);
  assert.equal(normalizeState({ ...freshState(), step: 5, solved: [] }).step, 0);
});
test('personalized MP3s exist for the demo names; unknown names use a generic clip', () => {
  assert.equal(greetingFor('Саша'), 'hello-sasha');
  assert.equal(greetingFor('МАША'), 'hello-masha');
  assert.equal(greetingFor('Миша'), 'hello-misha');
  assert.equal(greetingFor('Аня'), 'hello');
  assert.equal(Object.keys(AUDIO).length, 10);
  for (const filename of Object.values(AUDIO)) {
    const file = new URL(`../public/audio/${filename}`, import.meta.url);
    assert.ok(existsSync(file));
    assert.ok(statSync(file).size > 1000);
  }
});
test('names may contain letters, spaces and hyphens, never HTML', () => {
  assert.ok(isValidName('Анна-Мария'));
  assert.ok(isValidName('Саша'));
  assert.equal(isValidName('<img src=x onerror=alert(1)>'), false);
  assert.equal(isValidName(''), false);
  assert.equal(isValidName('123'), false);
});
