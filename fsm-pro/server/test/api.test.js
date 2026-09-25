/**
 * api.test.js — тесты ядра FSM PRO.
 *
 * Покрывают две вещи, которые нельзя ломать:
 *  1. статусную машину (правила продукта из PRODUCT-CORE.md);
 *  2. API и работу с базой.
 *
 * Запуск: npm test   (из папки server/)
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Тестовая база — отдельный временный файл. Боевую не трогаем.
process.env.FSM_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fsm-test-')), 'test.db');

const { canTransition, isOverdue, STATUSES } = require('../src/statusMachine');
const { seed } = require('../src/seed');
const { getDb } = require('../src/db');
const app = require('../src/index');

let server;
let base;

test.before(async () => {
  seed();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  if (server) server.close();
});

async function req(method, url, body) {
  const r = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* не JSON */ }
  return { status: r.status, body: json, text };
}

/* ---------------- Статусная машина ---------------- */

test('статусов ровно пять — инвариант продукта', () => {
  assert.strictEqual(STATUSES.length, 5);
  assert.deepStrictEqual(STATUSES, ['new', 'assigned', 'in_progress', 'under_review', 'completed']);
});

test('new → assigned разрешён', () => {
  assert.strictEqual(canTransition('new', 'assigned').ok, true);
});

test('new → completed запрещён и объяснён по-человечески', () => {
  const r = canTransition('new', 'completed');
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /Нельзя перевести/);
  assert.match(r.error, /Назначена/);
});

test('under_review → in_progress — это возврат на доработку, а не новый статус', () => {
  assert.strictEqual(canTransition('under_review', 'in_progress').ok, true);
});

test('completed — конечный статус, выходов нет', () => {
  assert.strictEqual(canTransition('completed', 'in_progress').ok, false);
  assert.match(canTransition('completed', 'in_progress').error, /конечный/);
});

test('переход в тот же статус отклонён', () => {
  assert.strictEqual(canTransition('in_progress', 'in_progress').ok, false);
});

test('неизвестный статус отклонён', () => {
  assert.strictEqual(canTransition('new', 'потом').ok, false);
});

test('просрочка — вычисляемое свойство, а не статус', () => {
  const past = new Date(Date.now() - 86400000).toISOString();
  const future = new Date(Date.now() + 86400000).toISOString();

  assert.strictEqual(isOverdue({ due_at: past, status: 'in_progress' }), true);
  assert.strictEqual(isOverdue({ due_at: future, status: 'in_progress' }), false);
  // Завершённая задача просроченной не считается никогда.
  assert.strictEqual(isOverdue({ due_at: past, status: 'completed' }), false);
  // Без срока — не просрочена.
  assert.strictEqual(isOverdue({ due_at: null, status: 'new' }), false);
});

/* ---------------- API ---------------- */

test('health сообщает, что база поднята', async () => {
  const { status, body } = await req('GET', '/api/health');
  assert.strictEqual(status, 200);
  assert.strictEqual(body.status, 'ok');
  assert.strictEqual(body.db, 'up');
});

test('в базе все шесть таблиц', () => {
  const names = getDb()
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name);
  for (const t of ['teams', 'users', 'tasks', 'task_photos', 'comments', 'task_status_history']) {
    assert.ok(names.includes(t), `нет таблицы ${t}`);
  }
});

test('список задач приходит из базы', async () => {
  const { status, body } = await req('GET', '/api/tasks');
  assert.strictEqual(status, 200);
  assert.ok(body.length > 0);
  assert.ok(body[0].statusLabel, 'у задачи должен быть человекочитаемый статус');
});

test('созданная задача появляется в списке', async () => {
  const created = await req('POST', '/api/tasks', {
    title: 'Тестовая задача', address: 'ул. Тестовая, 1', created_by: 'u-mgr',
  });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.body.status, 'new');

  const list = await req('GET', '/api/tasks');
  assert.ok(list.body.find((t) => t.id === created.body.id));
});

test('задача без названия не создаётся', async () => {
  const r = await req('POST', '/api/tasks', { address: 'без названия' });
  assert.strictEqual(r.status, 400);
});

test('недопустимый переход отклонён сервером', async () => {
  const created = await req('POST', '/api/tasks', { title: 'Прыжок через статус' });
  const r = await req('PATCH', `/api/tasks/${created.body.id}/status`, {
    status: 'completed', actorId: 'u-mgr',
  });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /Нельзя перевести/);
});

test('допустимый переход применяется и пишется в историю', async () => {
  const created = await req('POST', '/api/tasks', { title: 'Нормальный поток', created_by: 'u-mgr' });
  const id = created.body.id;

  let r = await req('PATCH', `/api/tasks/${id}/status`, { status: 'assigned', actorId: 'u-mgr' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.status, 'assigned');

  r = await req('PATCH', `/api/tasks/${id}/status`, { status: 'in_progress', actorId: 'u-tech1' });
  assert.strictEqual(r.body.status, 'in_progress');

  const hist = await req('GET', `/api/status-history/${id}`);
  const statuses = hist.body.map((h) => h.to_status);
  assert.ok(statuses.includes('assigned'));
  assert.ok(statuses.includes('in_progress'));
  // В истории есть имя того, кто перевёл.
  assert.ok(hist.body.some((h) => h.actor_name));
});

test('завершённую задачу нельзя вернуть в работу', async () => {
  const created = await req('POST', '/api/tasks', { title: 'Финал', created_by: 'u-mgr' });
  const id = created.body.id;
  await req('PATCH', `/api/tasks/${id}/status`, { status: 'assigned', actorId: 'u-mgr' });
  await req('PATCH', `/api/tasks/${id}/status`, { status: 'in_progress', actorId: 'u-mgr' });
  await req('PATCH', `/api/tasks/${id}/status`, { status: 'under_review', actorId: 'u-mgr' });
  await req('PATCH', `/api/tasks/${id}/status`, { status: 'completed', actorId: 'u-mgr' });

  const back = await req('PATCH', `/api/tasks/${id}/status`, { status: 'in_progress', actorId: 'u-mgr' });
  assert.strictEqual(back.status, 400);
});

test('взятие задачи атомарно: статус и исполнитель меняются за один запрос', async () => {
  const created = await req('POST', '/api/tasks', { title: 'Свободная задача', created_by: 'u-mgr' });
  const id = created.body.id;
  assert.strictEqual(created.body.assigned_to, null);

  const r = await req('PATCH', `/api/tasks/${id}/status`, {
    status: 'assigned', actorId: 'u-tech1', assigneeId: 'u-tech1',
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.status, 'assigned');
  assert.strictEqual(r.body.assigned_to, 'u-tech1',
    'исполнитель должен назначиться в том же запросе, иначе задача останется назначенной без исполнителя');
});

test('вход по коду работает, чужой код — нет', async () => {
  const ok = await req('POST', '/api/auth/login', { code: '1111' });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.role, 'technician');

  const bad = await req('POST', '/api/auth/login', { code: '0000' });
  assert.strictEqual(bad.status, 401);
});

test('комментарий сохраняется и виден в задаче', async () => {
  const created = await req('POST', '/api/tasks', { title: 'С комментарием', created_by: 'u-mgr' });
  const c = await req('POST', '/api/comments', {
    taskId: created.body.id, authorId: 'u-mgr', body: 'Проверка связи',
  });
  assert.strictEqual(c.status, 201);

  const task = await req('GET', `/api/tasks/${created.body.id}`);
  assert.ok(task.body.comments.some((x) => x.body === 'Проверка связи'));
});

test('комментарий к несуществующей задаче — 404', async () => {
  const r = await req('POST', '/api/comments', { taskId: 'нет-такой', body: 'привет' });
  assert.strictEqual(r.status, 404);
});

test('SQL-инъекция в фильтре не срабатывает (запросы параметризованы)', async () => {
  const r = await req('GET', "/api/tasks?status=new' OR '1'='1");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.length, 0, 'инъекция не должна вернуть все задачи');
});

test('статистика считает просроченные и неназначенные', async () => {
  const { body } = await req('GET', '/api/stats');
  assert.ok(typeof body.overdue === 'number');
  assert.ok(typeof body.unassigned === 'number');
  assert.strictEqual(
    Object.values(body.byStatus).reduce((a, b) => a + b, 0),
    body.total
  );
});

test('неизвестный метод API — 404, а не 500', async () => {
  const r = await req('GET', '/api/чего-нет');
  assert.strictEqual(r.status, 404);
});
