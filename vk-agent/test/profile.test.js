// Универсальность: тематика переключается целиком и ничего не смешивается.
// Это главная проверка предположения «агент не привязан к банкам».

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkspace, cleanup } from './helpers.js';

const root = await makeWorkspace();
const { listProfiles, loadProfile, profilePaths, resolveProfileId } = await import('../src/profile.js');
const { listSubjects, findSubject } = await import('../src/subject.js');
const { loadRubrics, loadTopics } = await import('../src/generate.js');
const { fetchSubject } = await import('../src/fetch.js');
const { buildPost, listPosts } = await import('../src/generate.js');
const { loadFacts } = await import('../src/subject.js');
const { readHistory } = await import('../src/history.js');
const { runChecks } = await import('../src/checks.js');

test.after(() => cleanup(root));

test('доступны обе тематики, и каждая описана', () => {
  const ids = listProfiles().map((item) => item.id);
  assert.deepEqual(ids, ['banks', 'vacancies']);
  const vacancies = loadProfile('vacancies');
  assert.equal(vacancies.subject_label, 'Работодатель');
  assert.equal(vacancies.extractor, 'vacancies');
});

test('несуществующая тематика — понятная ошибка со списком', () => {
  assert.throws(() => resolveProfileId('криптовалюта'), /Профиль «криптовалюта» не найден/);
  assert.throws(() => resolveProfileId('криптовалюта'), /banks, vacancies/);
});

test('у каждой тематики свои объекты, рубрики и темы журнала', () => {
  const banks = listSubjects('banks').map((item) => item.id);
  const vacancies = listSubjects('vacancies').map((item) => item.id);
  assert.ok(banks.includes('tbank'));
  assert.ok(vacancies.includes('bystro'));
  assert.equal(banks.includes('bystro'), false);

  const bankRubrics = loadRubrics('banks').map((item) => item.id);
  const jobRubrics = loadRubrics('vacancies').map((item) => item.id);
  assert.ok(bankRubrics.includes('karta'));
  assert.ok(jobRubrics.includes('vakansiya'));
  assert.equal(jobRubrics.includes('karta'), false);

  const jobTopics = loadTopics('vacancies').map((item) => item.topic_id);
  assert.ok(jobTopics.includes('grafik-znachit-bolshe-zarplaty'));
  const bankTopics = loadTopics('banks').map((item) => item.topic_id);
  assert.equal(bankTopics.includes('grafik-znachit-bolshe-zarplaty'), false);
});

test('данные тематик не смешиваются: факты, очередь и история живут в своих папках', async () => {
  await fetchSubject('tbank', { offline: true, profile: 'banks' });
  await fetchSubject('bystro', { offline: true, profile: 'vacancies' });

  const bankFacts = loadFacts('tbank', 'banks');
  const jobFacts = loadFacts('bystro', 'vacancies');
  assert.equal(bankFacts.facts.cashback_rate.value, 'до 15%');
  assert.equal(bankFacts.facts.salary, undefined);
  assert.ok(jobFacts.facts.salary);
  assert.equal(jobFacts.facts.cashback_rate, undefined);

  // файл фактов банка не должен появиться в папке вакансий и наоборот
  const bankPaths = profilePaths('banks');
  const jobPaths = profilePaths('vacancies');
  assert.notEqual(bankPaths.facts, jobPaths.facts);
  assert.notEqual(bankPaths.queue, jobPaths.queue);
});

test('вторая тематика собирает готовый пост своими рубриками', async () => {
  const post = buildPost({ subject: 'bystro', rubric: 'vakansiya', profile: 'vacancies', dryRun: true });
  assert.equal(post.profile, 'vacancies');
  assert.equal(post.subject_name, 'БыстроДоставка');
  assert.equal(post.rubric, 'vakansiya');
  assert.equal(post.status, 'ready');
  assert.match(post.text, /^# БыстроДоставка/);
  assert.match(post.text, /от 80 000 до 120 000 ₽/);
  assert.match(post.text, /5\/2/);
  assert.ok(post.text.includes('Условия работы уточняйте у работодателя'));
  assert.ok(post.text.includes('#вакансии'));
});

test('у вакансии цифры тоже с датой проверки', async () => {
  const post = buildPost({ subject: 'bystro', rubric: 'vakansiya', profile: 'vacancies', dryRun: true });
  assert.match(post.text, /\(проверено \d{2}\.\d{2}\.\d{4}\)/);
  for (const fact of post.facts) assert.ok(fact.date, `у факта ${fact.key} нет даты`);
});

test('в тематике вакансий работает свой стоп-словарь: обещания дохода блокируют пост', () => {
  const post = buildPost({ subject: 'bystro', rubric: 'vakansiya', profile: 'vacancies', dryRun: true });
  const bad = { ...post, text: `${post.text}\n\nГарантированный доход без вложений.` };
  const result = runChecks(bad, { profile: 'vacancies' });
  assert.ok(result.errors.some((error) => error.id === 'stopword-block'));
});

test('в тематике вакансий рубрика помечена как платная — есть напоминание о маркировке', () => {
  const post = buildPost({ subject: 'bystro', rubric: 'vakansiya', profile: 'vacancies', dryRun: true });
  assert.ok(post.checks.warnings.some((warning) => warning.id === 'ads-check'));
});

test('без обязательных фактов пост вакансии помечается needs-data', async () => {
  // у ТехноСферы на странице нет локации, а рубрика «условия» без неё неполна
  await fetchSubject('technosfera', { offline: true, profile: 'vacancies' });
  const post = buildPost({ subject: 'technosfera', rubric: 'usloviya', profile: 'vacancies', dryRun: true });
  assert.equal(post.status, 'needs-data');
  assert.ok(post.missing_required.includes('location'));
  assert.match(post.checks.errors[0].message, /Нет обязательных фактов/);
});

test('удалённый формат попадает в текст: главный довод не теряется', async () => {
  await fetchSubject('technosfera', { offline: true, profile: 'vacancies' });
  const post = buildPost({ subject: 'technosfera', rubric: 'vakansiya', profile: 'vacancies', dryRun: true });
  assert.match(post.text, /Удалённо, 5\/2/);
});

test('история каждой тематики своя', async () => {
  await buildPost({ subject: 'bystro', rubric: 'vakansiya', profile: 'vacancies' });
  const jobs = readHistory('vacancies');
  const banks = readHistory('banks');
  assert.ok(jobs.length > 0);
  assert.equal(jobs.every((record) => record.profile === 'vacancies'), true);
  assert.equal(banks.every((record) => record.profile !== 'vacancies'), true);
});

test('очередь каждой тематики своя', () => {
  const jobs = listPosts({ profile: 'vacancies' }).map((post) => post.id);
  const banks = listPosts({ profile: 'banks' }).map((post) => post.id);
  assert.equal(jobs.includes('2026-10-04-tbank-karta'), false);
  assert.equal(banks.length, 0);
});

test('тема журнала подбирается из своей тематики и ротируется', () => {
  const first = buildPost({ subject: 'bystro', rubric: 'vakansiya', profile: 'vacancies' });
  const second = buildPost({ subject: 'bystro', rubric: 'vakansiya', profile: 'vacancies' });
  const jobTopics = loadTopics('vacancies').map((item) => item.topic_id);
  assert.ok(jobTopics.includes(first.topic_id), `тема ${first.topic_id} не из своей тематики`);
  // вторая сборка берёт другую тему: только что использованная уходит в конец очереди
  assert.notEqual(first.topic_id, second.topic_id);
  assert.ok(jobTopics.includes(second.topic_id));
});

test('объект тематики ищется по названию и псевдониму', () => {
  assert.equal(findSubject('БыстроДоставка', 'vacancies').id, 'bystro');
  assert.equal(findSubject('техносфера', 'vacancies').id, 'technosfera');
  assert.equal(findSubject('альфа', 'banks').id, 'alfa');
  assert.equal(findSubject('бystro', 'banks'), null);
});
